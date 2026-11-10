-- PR #55 REVIEW-ONLY: disabled release-candidate schema package.
-- GENERATED FROM PR #55 STAGING SQL + production schema read-only metadata.
-- NOT A VERSIONED MIGRATION AND CANNOT EXECUTE WITHOUT EXPLICITLY REMOVING
-- THE DELIBERATE ABORT GUARD AFTER INDEPENDENT APPROVAL.
-- Do not run on production, staging, or the Vercel SQL console.
BEGIN;
DO $release_guard$
BEGIN
 RAISE EXCEPTION 'PR55 REVIEW-ONLY: release not approved; remove guard only during separately authorized migration review';
END
$release_guard$;
-- STOP: everything below is proposed DDL, not approved executable migration.
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch WITH SCHEMA extensions;
DO $preflight$
BEGIN
 IF to_regprocedure('extensions.digest(bytea,text)') IS NULL OR
    to_regprocedure('extensions.levenshtein(text,text)') IS NULL
 THEN RAISE EXCEPTION 'Required extensions not available in extensions schema'; END IF;
 IF to_regclass('public.members') IS NULL OR to_regclass('public.member_ministries') IS NULL
 THEN RAISE EXCEPTION 'Registry tables do not exist'; END IF;
END
$preflight$;
CREATE SCHEMA IF NOT EXISTS registry_private;
REVOKE ALL ON SCHEMA registry_private FROM PUBLIC,anon,authenticated;
CREATE TABLE registry_private.registration_administrators(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 active boolean NOT NULL DEFAULT false,
 granted_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 CHECK(NOT active OR revoked_at IS NULL)
);
CREATE TABLE registry_private.registration_allowed_ministries(
 name text PRIMARY KEY
);
INSERT INTO registry_private.registration_allowed_ministries(name) VALUES
 ('Mother Butler Guild'),
 ('Ministry of Greeters and Collectors'),
 ('Extraordinary Ministers of Holy Communion'),
 ('Ministry of Lectors and Commentators'),
 ('Ministry of Liturgical Music'),
 ('Ministry of Altar Servers');
CREATE TABLE registry_private.registration_intake_requests(
 request_key uuid PRIMARY KEY,
 fingerprint text NOT NULL,
 actor_id uuid NOT NULL,
 outcome text NOT NULL CHECK(outcome IN ('created','review')),
 member_id uuid REFERENCES public.members(id),
 review_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((outcome='created' AND member_id IS NOT NULL AND review_id IS NULL)
     OR (outcome='review' AND review_id IS NOT NULL AND member_id IS NULL))
);
CREATE TABLE registry_private.registration_intake_reviews(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_key uuid NOT NULL UNIQUE,
 existing_member_id uuid NOT NULL REFERENCES public.members(id),
 submitted_first_name text NOT NULL,
 submitted_last_name text NOT NULL,
 submitted_parish text NOT NULL,
 submitted_ministries text[] NOT NULL,
 submitted_service_year integer NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','dismissed')),
 submitted_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE registry_private.registration_intake_requests
 ADD CONSTRAINT registration_intake_request_review_fk
 FOREIGN KEY(review_id) REFERENCES registry_private.registration_intake_reviews(id);
CREATE TABLE registry_private.registration_review_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 review_id uuid NOT NULL REFERENCES registry_private.registration_intake_reviews(id),
 actor_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('approved','dismissed')),
 note text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(review_id)
);
REVOKE ALL ON ALL TABLES IN SCHEMA registry_private FROM PUBLIC,anon,authenticated;
ALTER TABLE registry_private.registration_administrators ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry_private.registration_allowed_ministries ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry_private.registration_intake_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry_private.registration_intake_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry_private.registration_review_events ENABLE ROW LEVEL SECURITY;
-- Intentionally no direct client-facing RLS policies or private-schema grants.

CREATE OR REPLACE FUNCTION public.registration_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM registry_private.registration_administrators a
    WHERE a.user_id = (SELECT auth.uid())
      AND a.active = true
      AND a.revoked_at IS NULL
  );
$fn$;

CREATE OR REPLACE FUNCTION public.registration_intake_v1(
  p_request uuid,
  p_first text,
  p_last text,
  p_parish text,
  p_ministries text[],
  p_year integer
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_first text := btrim(p_first);
  v_last text := btrim(p_last);
  v_parish text := btrim(p_parish);
  v_ministries text[];
  v_fingerprint text;
  v_prior record;
  v_match uuid;
  v_member uuid;
  v_review uuid;
BEGIN
  -- Production HTTP validates bearer JWTs; raw staging SQL with simulated\n  -- claims is a transaction test only, not evidence of HTTP authentication.
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Missing authenticated context' USING ERRCODE = '42501';
  END IF;
  -- Mandatory database-side authorization, independent of HTTP preflight.
  -- Acquire a row lock on the administrator grant for the entire transaction.
  -- This serializes authorization with a concurrent revocation UPDATE.
  PERFORM 1 FROM registry_private.registration_administrators a
  WHERE a.user_id = v_actor AND a.active = true AND a.revoked_at IS NULL
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_request IS NULL OR v_first IS NULL OR v_last IS NULL OR v_parish IS NULL
     OR length(v_first) NOT BETWEEN 1 AND 100 OR length(v_last) NOT BETWEEN 1 AND 100
     OR length(v_parish) NOT BETWEEN 1 AND 255
     OR length(btrim(regexp_replace(v_first, '[[:space:]]+', ' ', 'g'))) = 0
     OR length(btrim(regexp_replace(v_last, '[[:space:]]+', ' ', 'g'))) = 0
     OR length(btrim(regexp_replace(v_parish, '[[:space:]]+', ' ', 'g'))) = 0
     OR octet_length(v_first) > 255 OR octet_length(v_last) > 255
     OR EXISTS (SELECT 1 FROM pg_catalog.generate_series(1, pg_catalog.length(v_first)) AS cp(i)
                WHERE pg_catalog.octet_length(pg_catalog.substr(v_first, cp.i, 1)) = 4)
     OR EXISTS (SELECT 1 FROM pg_catalog.generate_series(1, pg_catalog.length(v_last)) AS cp(i)
                WHERE pg_catalog.octet_length(pg_catalog.substr(v_last, cp.i, 1)) = 4)
     OR p_year IS NULL OR p_year NOT BETWEEN 1000 AND 9999
     OR p_ministries IS NULL OR cardinality(p_ministries) NOT BETWEEN 1 AND 6 THEN
    RAISE EXCEPTION 'Invalid registration request' USING ERRCODE = '22023';
  END IF;

  -- Ministry names must match an authoritative allowlist. This proposal
  -- deliberately requires review before the project's canonical names are
  -- embedded and before the database function can accept an intake.
  IF NOT EXISTS (
    SELECT 1 FROM registry_private.registration_allowed_ministries
  ) THEN
    RAISE EXCEPTION 'Canonical ministry mapping not configured' USING ERRCODE = '55000';
  END IF;
  SELECT array_agg(DISTINCT m.name ORDER BY m.name) INTO v_ministries
  FROM unnest(p_ministries) AS raw(name)
  JOIN registry_private.registration_allowed_ministries AS m
    ON lower(btrim(raw.name)) = lower(m.name);
  IF cardinality(v_ministries) IS DISTINCT FROM cardinality(p_ministries) THEN
    RAISE EXCEPTION 'Unknown or repeated ministry' USING ERRCODE = '22023';
  END IF;
  v_fingerprint := encode(extensions.digest(
    convert_to(lower(v_first) || chr(31) || lower(v_last) || chr(31) ||
      lower(v_parish) || chr(31) || array_to_string(v_ministries, chr(30)) ||
      chr(31) || p_year::text,'UTF8'), 'sha256'), 'hex');

  -- Serialize *all* intake decisions, including different request keys,
  -- so duplicate search and insert do not race. Throughput is a known cost.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('registry_registration_intake_v1', 0));
  SELECT * INTO v_prior FROM registry_private.registration_intake_requests
    WHERE request_key = p_request;
  IF FOUND THEN
    IF v_prior.fingerprint <> v_fingerprint OR v_prior.actor_id <> v_actor THEN
      RAISE EXCEPTION 'Conflicting idempotency key' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('status','replayed','outcome',v_prior.outcome,
      'memberId',v_prior.member_id,'reviewId',v_prior.review_id);
  END IF;

  -- Four-byte UTF-8 code points (supplementary Unicode) have different
  -- Levenshtein denominators in SQL code points vs JS UTF-16 units.
  -- Fail closed rather than silently missing a duplicate. Reconsider this
  -- guard only after cross-language parity is explicitly certified.
  -- Fail closed rather than silently overlooking an existing name which
  -- fuzzystrmatch cannot compare (the extension has a 255-byte input limit).
  -- A future Unicode-safe matcher must replace this emergency guard.
  IF EXISTS (
    SELECT 1 FROM public.members m
    WHERE octet_length(m.first_name) > 255 OR octet_length(m.last_name) > 255
       OR EXISTS (SELECT 1 FROM pg_catalog.generate_series(1, pg_catalog.length(m.first_name)) AS cp(i)
                  WHERE pg_catalog.octet_length(pg_catalog.substr(m.first_name, cp.i, 1)) = 4)
       OR EXISTS (SELECT 1 FROM pg_catalog.generate_series(1, pg_catalog.length(m.last_name)) AS cp(i)
                  WHERE pg_catalog.octet_length(pg_catalog.substr(m.last_name, cp.i, 1)) = 4)
  ) THEN
    RAISE EXCEPTION 'Registry matching requires manual reconciliation'
      USING ERRCODE = '55000';
  END IF;

  -- Mirror JS: exact equality bypasses fuzzy short-name and digit safeguards
  -- for that component; the *other* name component may still match fuzzily.
  -- Both parts must match. SQL/JS Unicode and UTF-16 parity remain open.
  SELECT m.id INTO v_match FROM public.members m
  CROSS JOIN LATERAL (SELECT
    lower(btrim(regexp_replace(m.first_name, '[[:space:]]+', ' ', 'g'))) AS mf,
    lower(btrim(regexp_replace(m.last_name, '[[:space:]]+', ' ', 'g'))) AS ml
  ) AS normalized
  CROSS JOIN LATERAL (SELECT
    lower(btrim(regexp_replace(v_first, '[[:space:]]+', ' ', 'g'))) AS vf,
    lower(btrim(regexp_replace(v_last, '[[:space:]]+', ' ', 'g'))) AS vl
  ) AS incoming
  WHERE btrim(m.parish) <> ''
    AND (
      normalized.mf = incoming.vf
      OR (
        length(normalized.mf) > 3 AND length(incoming.vf) > 3
        AND btrim(regexp_replace(normalized.mf, '[^0-9]+', '|', 'g'), '|') =
            btrim(regexp_replace(incoming.vf, '[^0-9]+', '|', 'g'), '|')
        AND octet_length(normalized.mf) <= 255
        AND octet_length(incoming.vf) <= 255
        AND (1 - extensions.levenshtein(normalized.mf, incoming.vf)::numeric /
          greatest(length(normalized.mf), length(incoming.vf))) >= 0.8
      )
    )
    AND (
      normalized.ml = incoming.vl
      OR (
        length(normalized.ml) > 3 AND length(incoming.vl) > 3
        AND btrim(regexp_replace(normalized.ml, '[^0-9]+', '|', 'g'), '|') =
            btrim(regexp_replace(incoming.vl, '[^0-9]+', '|', 'g'), '|')
        AND octet_length(normalized.ml) <= 255
        AND octet_length(incoming.vl) <= 255
        AND (1 - extensions.levenshtein(normalized.ml, incoming.vl)::numeric /
          greatest(length(normalized.ml), length(incoming.vl))) >= 0.8
      )
    )
  ORDER BY m.created_at, m.id LIMIT 1;
  IF v_match IS NOT NULL THEN
    INSERT INTO registry_private.registration_intake_reviews
      (request_key,existing_member_id,submitted_first_name,submitted_last_name,
       submitted_parish,submitted_ministries,submitted_service_year,submitted_by)
    VALUES (p_request,v_match,v_first,v_last,v_parish,v_ministries,p_year,v_actor)
    RETURNING id INTO v_review;
    INSERT INTO registry_private.registration_intake_requests
      (request_key,fingerprint,actor_id,outcome,review_id)
    VALUES (p_request,v_fingerprint,v_actor,'review',v_review);
    RETURN jsonb_build_object('status','review','reviewId',v_review);
  END IF;

  INSERT INTO public.members
    (first_name,last_name,parish,ministries,service_year,status,uid)
  VALUES (v_first,v_last,v_parish,v_ministries,p_year,'Pending Verification','PENDING')
  RETURNING id INTO v_member;

  INSERT INTO public.member_ministries
    (member_id,ministry,status,start_date,expiration_date,renewal_date,
     document_url,document_uploaded_at,archived_documents)
  SELECT v_member, ministry,'Pending Verification',NULL,NULL,NULL,NULL,NULL,'[]'::jsonb
  FROM unnest(v_ministries) AS ministry;

  INSERT INTO registry_private.registration_intake_requests
    (request_key,fingerprint,actor_id,outcome,member_id)
  VALUES (p_request,v_fingerprint,v_actor,'created',v_member);
  RETURN jsonb_build_object('status','created','memberId',v_member);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.registration_resolve_review_v1(
 p_review uuid,p_action text,p_note text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid:=auth.uid();v_status text;v_existing uuid;
BEGIN
 -- Hold an administrator grant row lock through review disposition so a
 -- simultaneous revocation cannot commit before an authorized decision.
 PERFORM 1 FROM registry_private.registration_administrators
 WHERE user_id=v_actor AND active AND revoked_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Registration not authorized' USING ERRCODE='42501'; END IF;
 IF p_review IS NULL OR p_action IS NULL OR p_action NOT IN ('approved','dismissed')
  OR p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 5 AND 1000 THEN
  RAISE EXCEPTION 'Invalid review disposition' USING ERRCODE='22023'; END IF;
 SELECT status,existing_member_id INTO v_status,v_existing
 FROM registry_private.registration_intake_reviews WHERE id=p_review FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Review not found' USING ERRCODE='P0002'; END IF;
 IF v_status <> 'pending' THEN
  RAISE EXCEPTION 'Review already resolved' USING ERRCODE='23505'; END IF;
 -- Approval is a decision to recognize the duplicate candidate, NOT an automatic
 -- mutation or merge into the existing member. A separate validated merge workflow
 -- is required for any ministry changes.
 UPDATE registry_private.registration_intake_reviews SET status=p_action WHERE id=p_review;
 INSERT INTO registry_private.registration_review_events(review_id,actor_id,action,note)
 VALUES(p_review,v_actor,p_action,btrim(p_note));
 RETURN jsonb_build_object('status',p_action,'reviewId',p_review,'existingMemberId',v_existing);
END;$fn$;

-- Install functions only with a reviewed privileged owner; verify `proowner`,
-- SECURITY DEFINER status and trusted fixed search_path after migration.
REVOKE ALL ON FUNCTION public.registration_intake_v1(uuid,text,text,text,text[],integer)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.registration_resolve_review_v1(uuid,text,text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.registration_is_admin() FROM PUBLIC,anon,authenticated;
-- The read-only self-check RPC alone is callable by authenticated users.
GRANT EXECUTE ON FUNCTION public.registration_is_admin() TO authenticated;
-- NO administrator identities are seeded.
-- NO authenticated intake/review EXECUTE grants are applied.
-- NO existing registry RLS policies or table grants are changed.
COMMIT;
