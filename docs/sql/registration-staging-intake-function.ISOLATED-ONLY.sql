-- ISOLATED STAGING ONLY. Not granted to authenticated; postgres-only smoke tests.
BEGIN;
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
  -- Every invocation must have a real JWT, not a simulated SQL session.
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Missing authenticated context' USING ERRCODE = '42501';
  END IF;
  -- Mandatory database-side authorization, independent of HTTP preflight.
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM registry_private.registration_administrators a
    WHERE a.user_id = v_actor AND a.active AND a.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Registration not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_request IS NULL OR v_first IS NULL OR v_last IS NULL OR v_parish IS NULL
     OR length(v_first) NOT BETWEEN 1 AND 160 OR length(v_last) NOT BETWEEN 1 AND 160
     OR length(v_parish) NOT BETWEEN 1 AND 200
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

  -- Mirror registration-matching.ts: normalize case and whitespace;
  -- exact full-name across parishes or two >=0.8 Levenshtein similarities.
  -- Numeric suffixes must match and <=3-char non-exact names do not fuzzy-match.
  -- SQL/JS Unicode case mapping and UTF-16 length remain staging parity risks.
  SELECT m.id INTO v_match FROM public.members m
  CROSS JOIN LATERAL (SELECT
    lower(regexp_replace(btrim(m.first_name), '[[:space:]]+', ' ', 'g')) AS mf,
    lower(regexp_replace(btrim(m.last_name), '[[:space:]]+', ' ', 'g')) AS ml
  ) AS normalized
  WHERE btrim(m.parish) <> ''
    AND (
      (normalized.mf = lower(regexp_replace(v_first, '[[:space:]]+', ' ', 'g'))
        AND normalized.ml = lower(regexp_replace(v_last, '[[:space:]]+', ' ', 'g')))
      OR (
        length(normalized.mf) > 3
        AND length(normalized.ml) > 3
        AND length(regexp_replace(v_first, '[[:space:]]+', ' ', 'g')) > 3
        AND length(regexp_replace(v_last, '[[:space:]]+', ' ', 'g')) > 3
        AND btrim(regexp_replace(normalized.mf, '[^0-9]+', '|', 'g'), '|') =
            btrim(regexp_replace(lower(v_first), '[^0-9]+', '|', 'g'), '|')
        AND btrim(regexp_replace(normalized.ml, '[^0-9]+', '|', 'g'), '|') =
            btrim(regexp_replace(lower(v_last), '[^0-9]+', '|', 'g'), '|')
        AND (1 - extensions.levenshtein(normalized.mf,
          lower(regexp_replace(v_first, '[[:space:]]+', ' ', 'g')))::numeric /
          greatest(length(normalized.mf),length(regexp_replace(v_first, '[[:space:]]+', ' ', 'g')))) >= 0.8
        AND (1 - extensions.levenshtein(normalized.ml,
          lower(regexp_replace(v_last, '[[:space:]]+', ' ', 'g')))::numeric /
          greatest(length(normalized.ml),length(regexp_replace(v_last, '[[:space:]]+', ' ', 'g')))) >= 0.8
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

REVOKE ALL ON FUNCTION public.registration_intake_v1(uuid,text,text,text,text[],integer) FROM PUBLIC, anon, authenticated;
COMMIT;
