-- 2026-11-20 -- COWL-DOK RC1 TEST repair CANDIDATE, NOT APPLIED
-- Source: exact public RPC behavior from
-- supabase/migrations/202610150001_add_verification_rate_limiting.sql
-- Applied migration was not present in TEST migration history at inspection.
-- Target: Ministry-Registry-Test (rtptybxugjhvpfjvcvgw) ONLY, after approval.
--
-- Background: public.verification_rate_limits table, PK, cleanup index, and
-- RLS exist, but both RPCs are absent. /api/verify currently fails CLOSED
-- with PGRST202. Running the old migration verbatim would collide with
-- the existing table; this patch restores functions only.
--
-- Prerequisites: confirm both functions ABSENT and table RLS enabled.
-- This script intentionally refuses to overwrite existing functions.
-- No member, ministry, finance or certificate rows are touched.
BEGIN;
DO $precheck$
BEGIN
  IF to_regclass('public.verification_rate_limits') IS NULL
     OR (SELECT NOT c.relrowsecurity FROM pg_class c
         WHERE c.oid='public.verification_rate_limits'::regclass)
  THEN
    RAISE EXCEPTION 'TEST rate-limit table is missing or RLS is disabled';
  END IF;
  IF to_regprocedure('public.check_verification_rate_limit(text,integer,integer)') IS NOT NULL
     OR to_regprocedure('public.cleanup_verification_rate_limits()') IS NOT NULL
  THEN
    RAISE EXCEPTION 'Rate-limit function already exists; inspect drift before applying';
  END IF;
END
$precheck$;

CREATE FUNCTION public.check_verification_rate_limit(
  p_request_key text,
  p_max_requests integer DEFAULT 20,
  p_window_seconds integer DEFAULT 60
)
RETURNS TABLE (
  allowed boolean,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_count integer;
BEGIN
  IF p_request_key IS NULL
     OR length(p_request_key) <> 64
     OR p_request_key !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'Invalid rate-limit key';
  END IF;

  IF p_max_requests IS NULL
   OR p_window_seconds IS NULL
   OR p_max_requests < 1
   OR p_max_requests > 100
   OR p_window_seconds < 10
   OR p_window_seconds > 3600
  THEN
    RAISE EXCEPTION 'Invalid rate-limit configuration';
  END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch FROM v_now) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.verification_rate_limits (
    request_key, window_start, request_count
  ) VALUES (
    p_request_key, v_window_start, 1
  )
  ON CONFLICT (request_key, window_start)
  DO UPDATE SET request_count = verification_rate_limits.request_count + 1
  RETURNING request_count INTO v_count;

  RETURN QUERY SELECT
    v_count <= p_max_requests,
    greatest(
      1,
      ceil(extract(epoch FROM (
        v_window_start + make_interval(secs => p_window_seconds) - v_now
      )))::integer
    );
END;
$function$;

REVOKE ALL ON FUNCTION
  public.check_verification_rate_limit(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.check_verification_rate_limit(text, integer, integer)
  TO service_role;

CREATE FUNCTION public.cleanup_verification_rate_limits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.verification_rate_limits
  WHERE window_start < now() - interval '24 hours';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;

REVOKE ALL ON FUNCTION public.cleanup_verification_rate_limits()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_verification_rate_limits()
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Post-apply acceptance (authorized controlled TEST requests only):
-- * catalog signature exists; anon/authenticated EXECUTE = false;
--   service_role EXECUTE = true, SECURITY DEFINER true.
-- * /api/verify POST for a harmless nonmatching string must return a
--   valid 200 empty-results response, not PGRST202/503.
-- * 20 signed-off rate-limit requests per minute succeed; the 21st
--   must return 429. Avoid real user IDs and avoid production IP traffic.
-- * Verify public /verify certificate design is still rendered;
--   this patch does not alter system_settings or certificate templates.
-- * Keep TEST/PROD policies separate. This is not A8 remediation.
