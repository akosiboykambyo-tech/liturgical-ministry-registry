-- COWL-DOK Registration Intake v2: REVIEW ONLY — NOT A MIGRATION.
-- Do not execute against TEST or production without separate written approval.
-- The first transaction statement deliberately aborts execution.
-- After formal approval, regenerate as a numbered Supabase migration with the
-- Supabase CLI, inspect its SQL diff, and remove this guard in the reviewed copy.
BEGIN;
DO $review_only_stop$
BEGIN
  RAISE EXCEPTION 'REVIEW ONLY: registration_intake_v2 must not be executed from docs/sql'
    USING ERRCODE = '55000';
END;
$review_only_stop$;

-- PRECONDITIONS TO VERIFY BEFORE A FUTURE TEST-ONLY MIGRATION:
-- Existing registry_private.registration_administrators and
-- registration_allowed_ministries are populated; members and member_ministries
-- exist and a BEFORE INSERT trigger assigns a unique non-PENDING registry UID.
-- extensions.digest and extensions.levenshtein are installed in the extensions
-- schema. Do not assume TEST/prod migration parity.
-- Keep v1 installed for now; its locking key is shared during transition.

-- CSV source keys must explicitly reject NULL under SQL three-valued CHECK.
-- The header is row 1; valid physical data-row numbers begin at 2.
-- Persist CSV source identity on the existing atomic request ledger.
ALTER TABLE registry_private.registration_intake_requests
  ADD COLUMN source text NOT NULL DEFAULT 'individual',
  ADD COLUMN source_key text;

ALTER TABLE registry_private.registration_intake_requests
  ADD CONSTRAINT registration_intake_request_source_v2_chk
  CHECK (
    (source = 'individual' AND source_key IS NULL)
    OR (source = 'csv' AND source_key IS NOT NULL
        AND source_key ~ '^sha256:[0-9a-f]{64}:row:([2-9]|[1-9][0-9]{1,8})$')
  );

-- A new UUID for the same actor + physical CSV source row must not insert again.
-- The existing request_key PK protects ordinary retries with the same UUID.
CREATE UNIQUE INDEX registration_intake_request_csv_source_v2_uidx
  ON registry_private.registration_intake_requests(actor_id, source_key)
  WHERE source = 'csv';

-- Add review metadata to the *existing* private review table; no parallel queue.
ALTER TABLE registry_private.registration_intake_reviews
  ADD COLUMN submitted_notes text,
  ADD COLUMN source text NOT NULL DEFAULT 'individual',
  ADD COLUMN source_key text,
  ADD COLUMN candidate_member_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  ADD COLUMN candidate_count integer NOT NULL DEFAULT 0,
  ADD COLUMN candidates_truncated boolean NOT NULL DEFAULT false;

ALTER TABLE registry_private.registration_intake_reviews
  ADD CONSTRAINT registration_intake_review_candidates_v2_chk
  CHECK (
    candidate_count >= 0
    AND candidate_count >= cardinality(candidate_member_ids)
    AND cardinality(candidate_member_ids) <= 20
    AND candidates_truncated = (candidate_count > cardinality(candidate_member_ids))
  );

CREATE OR REPLACE FUNCTION public.registration_intake_v2(
  p_request uuid,
  p_first text,
  p_last text,
  p_parish text,
  p_ministries text[],
  p_year integer,
  p_notes text DEFAULT NULL,
  p_source text DEFAULT 'individual',
  p_source_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $intake_v2$
DECLARE
  v_actor uuid := auth.uid();
  v_first text := pg_catalog.regexp_replace(pg_catalog.btrim(p_first), '[[:space:]]+', ' ', 'g');
  v_last text := pg_catalog.regexp_replace(pg_catalog.btrim(p_last), '[[:space:]]+', ' ', 'g');
  v_parish text := pg_catalog.regexp_replace(pg_catalog.btrim(p_parish), '[[:space:]]+', ' ', 'g');
  v_notes text := NULLIF(pg_catalog.btrim(p_notes), '');
  v_source text := pg_catalog.btrim(p_source);
  v_source_key text := NULLIF(pg_catalog.btrim(p_source_key), '');
  v_ministries text[];
  v_fingerprint text;
  v_prior registry_private.registration_intake_requests%ROWTYPE;
  v_member_id uuid;
  v_uid text;
  v_review_id uuid;
  v_candidate_ids uuid[] := ARRAY[]::uuid[];
  v_candidate_count integer := 0;
  v_first_lower text;
  v_last_lower text;
BEGIN
  -- Do not trust client role labels, JWT user_metadata, or a replayed request.
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  PERFORM 1
    FROM registry_private.registration_administrators AS a
   WHERE a.user_id = v_actor
     AND a.active = true
     AND a.revoked_at IS NULL
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration administrator authorization required'
      USING ERRCODE = '42501';
  END IF;

  IF p_request IS NULL
     OR v_first IS NULL OR length(v_first) NOT BETWEEN 1 AND 160
     OR v_last IS NULL OR length(v_last) NOT BETWEEN 1 AND 160
     OR v_parish IS NULL OR length(v_parish) NOT BETWEEN 1 AND 200
     OR p_year IS NULL OR p_year NOT BETWEEN 2000 AND 2100
     OR p_notes IS NOT NULL AND length(v_notes) > 4000
     OR p_ministries IS NULL
     OR cardinality(p_ministries) NOT BETWEEN 1 AND 6
     OR array_position(p_ministries, NULL) IS NOT NULL
  THEN
    RAISE EXCEPTION 'Invalid registration fields' USING ERRCODE = '22023';
  END IF;

  IF v_source IS NULL OR v_source NOT IN ('individual', 'csv') THEN
    RAISE EXCEPTION 'Unknown registration source' USING ERRCODE = '22023';
  END IF;
  IF (v_source = 'individual' AND v_source_key IS NOT NULL)
     OR (v_source = 'csv' AND (
       v_source_key IS NULL OR
       v_source_key !~ '^sha256:[0-9a-f]{64}:row:([2-9]|[1-9][0-9]{1,8})$'
     ))
  THEN
    RAISE EXCEPTION 'Invalid registration source key' USING ERRCODE = '22023';
  END IF;

  -- Reject unknown or repeated names; authoritative allowlist wins over UI.
  IF NOT EXISTS (SELECT 1 FROM registry_private.registration_allowed_ministries) THEN
    RAISE EXCEPTION 'Canonical ministries are not configured' USING ERRCODE = '55000';
  END IF;
  SELECT pg_catalog.array_agg(allowed.name ORDER BY allowed.name)
    INTO v_ministries
    FROM pg_catalog.unnest(p_ministries) AS incoming(name)
    JOIN registry_private.registration_allowed_ministries AS allowed
      ON pg_catalog.lower(pg_catalog.btrim(incoming.name)) =
         pg_catalog.lower(allowed.name);

  IF cardinality(v_ministries) IS DISTINCT FROM cardinality(p_ministries)
     OR (SELECT count(DISTINCT pg_catalog.lower(pg_catalog.btrim(x)))
           FROM pg_catalog.unnest(p_ministries) AS names(x))
        IS DISTINCT FROM cardinality(p_ministries)::bigint
  THEN
    RAISE EXCEPTION 'Unknown or repeated ministry' USING ERRCODE = '22023';
  END IF;

  -- Sorted canonical ministries, normalized notes and source are fingerprinted.
  -- Treat a changed payload or actor under the same request key as a conflict.
  v_fingerprint := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'first', pg_catalog.lower(v_first),
          'last', pg_catalog.lower(v_last),
          'parish', pg_catalog.lower(v_parish),
          'ministries', v_ministries,
          'year', p_year,
          'notes', v_notes,
          'source', v_source,
          'sourceKey', v_source_key
        )::text, 'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  -- Identical lock key to v1. Other legacy create paths are NOT protected.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('registry_registration_intake_v1', 0));

  SELECT * INTO v_prior
    FROM registry_private.registration_intake_requests
   WHERE request_key = p_request;

  IF FOUND THEN
    IF v_prior.actor_id IS DISTINCT FROM v_actor
       OR v_prior.fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION 'Conflicting idempotency key' USING ERRCODE = '23505';
    END IF;

    IF v_prior.outcome = 'created' AND v_prior.member_id IS NOT NULL THEN
      SELECT uid INTO v_uid FROM public.members WHERE id = v_prior.member_id;
      IF v_uid IS NULL OR v_uid = '' OR v_uid = 'PENDING' THEN
        RAISE EXCEPTION 'Existing registered UID unavailable' USING ERRCODE = '55000';
      END IF;
      RETURN pg_catalog.jsonb_build_object(
        'status', 'replayed', 'outcome', 'created',
        'memberId', v_prior.member_id, 'uid', v_uid);
    END IF;

    IF v_prior.outcome = 'review' AND v_prior.review_id IS NOT NULL THEN
      SELECT candidate_member_ids, candidate_count INTO v_candidate_ids, v_candidate_count
        FROM registry_private.registration_intake_reviews
       WHERE id = v_prior.review_id;
      IF NOT FOUND OR v_candidate_count < 1 THEN
        RAISE EXCEPTION 'Stored registration review is unavailable' USING ERRCODE = '55000';
      END IF;
      RETURN pg_catalog.jsonb_build_object(
        'status', 'replayed', 'outcome', 'review',
        'reviewId', v_prior.review_id,
        'candidateCount', v_candidate_count,
        'candidateIds', v_candidate_ids,
        'candidatesTruncated', v_candidate_count > cardinality(v_candidate_ids));
    END IF;
    RAISE EXCEPTION 'Stored registration request is inconsistent' USING ERRCODE = '55000';
  END IF;

  -- Same source file and row with a DIFFERENT request UUID is a conflict.
  -- No silent recreation after page refresh or a lost retry manifest.
  IF v_source = 'csv' AND EXISTS (
    SELECT 1
      FROM registry_private.registration_intake_requests AS r
     WHERE r.actor_id = v_actor
       AND r.source = 'csv'
       AND r.source_key = v_source_key
  ) THEN
    RAISE EXCEPTION 'CSV source already processed; reconcile its request key'
      USING ERRCODE = '23505';
  END IF;

  v_first_lower := pg_catalog.lower(v_first);
  v_last_lower := pg_catalog.lower(v_last);

  -- Deterministic, capped candidate *display*; count still scans all matches.
  -- Mirrors v1's exact/cross-parish/fuzzy decisions; Unicode parity needs QA.
  WITH candidates AS MATERIALIZED (
    SELECT m.id, m.created_at
      FROM public.members AS m
      CROSS JOIN LATERAL (
        SELECT pg_catalog.lower(pg_catalog.regexp_replace(
                 pg_catalog.btrim(m.first_name), '[[:space:]]+', ' ', 'g')) AS first_normal,
               pg_catalog.lower(pg_catalog.regexp_replace(
                 pg_catalog.btrim(m.last_name), '[[:space:]]+', ' ', 'g')) AS last_normal
      ) AS normalized
     WHERE pg_catalog.btrim(m.parish) <> ''
       AND (
         (normalized.first_normal = v_first_lower
          AND normalized.last_normal = v_last_lower)
         OR (
           length(normalized.first_normal) > 3
           AND length(normalized.last_normal) > 3
           AND length(v_first_lower) > 3
           AND length(v_last_lower) > 3
           AND pg_catalog.btrim(pg_catalog.regexp_replace(
                 normalized.first_normal, '[^0-9]+', '|', 'g'), '|')
               = pg_catalog.btrim(pg_catalog.regexp_replace(
                 v_first_lower, '[^0-9]+', '|', 'g'), '|')
           AND pg_catalog.btrim(pg_catalog.regexp_replace(
                 normalized.last_normal, '[^0-9]+', '|', 'g'), '|')
               = pg_catalog.btrim(pg_catalog.regexp_replace(
                 v_last_lower, '[^0-9]+', '|', 'g'), '|')
           AND (
             1 - extensions.levenshtein(normalized.first_normal, v_first_lower)::numeric
                   / pg_catalog.greatest(length(normalized.first_normal), length(v_first_lower))
           ) >= 0.8
           AND (
             1 - extensions.levenshtein(normalized.last_normal, v_last_lower)::numeric
                   / pg_catalog.greatest(length(normalized.last_normal), length(v_last_lower))
           ) >= 0.8
         )
       )
  )
  SELECT
    (SELECT count(*)::integer FROM candidates),
    (SELECT COALESCE(
      pg_catalog.array_agg(shown.id ORDER BY shown.created_at, shown.id),
      ARRAY[]::uuid[]
    ) FROM (
      SELECT id, created_at FROM candidates
       ORDER BY created_at, id LIMIT 20
    ) AS shown)
    INTO v_candidate_count, v_candidate_ids;

  IF v_candidate_count > 0 THEN
    INSERT INTO registry_private.registration_intake_reviews (
      request_key, existing_member_id, submitted_first_name,
      submitted_last_name, submitted_parish, submitted_ministries,
      submitted_service_year, submitted_by, submitted_notes,
      source, source_key, candidate_member_ids, candidate_count,
      candidates_truncated
    ) VALUES (
      p_request, v_candidate_ids[1], v_first, v_last, v_parish,
      v_ministries, p_year, v_actor, v_notes,
      v_source, v_source_key, v_candidate_ids, v_candidate_count,
      v_candidate_count > cardinality(v_candidate_ids)
    ) RETURNING id INTO v_review_id;

    INSERT INTO registry_private.registration_intake_requests (
      request_key, fingerprint, actor_id, outcome, review_id, source, source_key
    ) VALUES (
      p_request, v_fingerprint, v_actor, 'review', v_review_id, v_source, v_source_key
    );

    RETURN pg_catalog.jsonb_build_object(
      'status', 'review', 'reviewId', v_review_id,
      'candidateCount', v_candidate_count,
      'candidateIds', v_candidate_ids,
      'candidatesTruncated', v_candidate_count > cardinality(v_candidate_ids));
  END IF;

  -- Entire member + notes + ministries + idempotency ledger in one transaction.
  -- The existing BEFORE INSERT UID trigger MUST assign a real unique UID.
  INSERT INTO public.members (
    first_name, last_name, parish, ministries, service_year, status, uid, notes
  ) VALUES (
    v_first, v_last, v_parish, v_ministries, p_year,
    'Pending Verification', 'PENDING', v_notes
  ) RETURNING id INTO v_member_id;

  SELECT uid INTO v_uid FROM public.members WHERE id = v_member_id;
  IF v_uid IS NULL OR v_uid = '' OR v_uid = 'PENDING' THEN
    RAISE EXCEPTION 'Registry UID assignment is not configured'
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.member_ministries (member_id, ministry, status)
  SELECT v_member_id, selected.ministry, 'Pending Verification'
    FROM pg_catalog.unnest(v_ministries) AS selected(ministry);

  INSERT INTO registry_private.registration_intake_requests (
    request_key, fingerprint, actor_id, outcome, member_id, source, source_key
  ) VALUES (
    p_request, v_fingerprint, v_actor, 'created', v_member_id, v_source, v_source_key
  );

  RETURN pg_catalog.jsonb_build_object(
    'status', 'created', 'memberId', v_member_id, 'uid', v_uid);
END;
$intake_v2$;

-- Function EXECUTE is PUBLIC by default; deny all before granting the one role.
-- SECURITY DEFINER is strictly limited by the in-function live admin allowlist.
REVOKE ALL ON FUNCTION public.registration_intake_v2(
  uuid, text, text, text, text[], integer, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registration_intake_v2(
  uuid, text, text, text, text[], integer, text, text, text
) TO authenticated;

-- This file does NOT disable legacy registry_admin_member_write_v1('create',
-- 'create_batch') or the CSV Keep separate button. Those remain a RELEASE BLOCKER.
-- The approved cutover must close those paths at the backend boundary before
-- the new UI is enabled; do not roll back to unsafe direct member creation.
COMMIT;
