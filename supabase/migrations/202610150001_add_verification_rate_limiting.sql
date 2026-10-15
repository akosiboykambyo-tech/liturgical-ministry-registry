
-- Public verification rate limiting
-- COWL-DOK Liturgical Ministry Registry
-- Stores keyed request counts, not raw IP addresses.

BEGIN;

CREATE TABLE public.verification_rate_limits (
  request_key text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (request_key, window_start),
  CONSTRAINT verification_rate_limits_positive_count
    CHECK (request_count >= 1)
);

-- Do not expose the rate-limit table through the public API.
ALTER TABLE public.verification_rate_limits
ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.verification_rate_limits
FROM PUBLIC, anon, authenticated;

-- Atomic check-and-increment operation.
CREATE OR REPLACE FUNCTION public.check_verification_rate_limit(
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
    floor(
      extract(epoch FROM v_now) / p_window_seconds
    ) * p_window_seconds
  );

  INSERT INTO public.verification_rate_limits (
    request_key,
    window_start,
    request_count
  )
  VALUES (
    p_request_key,
    v_window_start,
    1
  )
  ON CONFLICT (request_key, window_start)
  DO UPDATE
    SET request_count =
      verification_rate_limits.request_count + 1
  RETURNING request_count INTO v_count;

  RETURN QUERY
  SELECT
    v_count <= p_max_requests,
    greatest(
      1,
      ceil(
        extract(
          epoch FROM (
            v_window_start
            + make_interval(secs => p_window_seconds)
            - v_now
          )
        )
      )::integer
    );
END;
$function$;

-- No client role may invoke this privileged function.
REVOKE ALL
ON FUNCTION public.check_verification_rate_limit(
  text, integer, integer
)
FROM PUBLIC, anon, authenticated;

-- Supabase service-role calls are permitted.
GRANT EXECUTE
ON FUNCTION public.check_verification_rate_limit(
  text, integer, integer
)
TO service_role;

CREATE INDEX verification_rate_limits_window_idx
ON public.verification_rate_limits (window_start);


-- Remove expired rate-limit counters.
-- Retain the most recent 24 hours for operational safety.
-- This function is intended to be called by a scheduled
-- maintenance process, not by public website visitors.

CREATE OR REPLACE FUNCTION public.cleanup_verification_rate_limits()
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

-- Prevent public execution.
REVOKE ALL
ON FUNCTION public.cleanup_verification_rate_limits()
FROM PUBLIC, anon, authenticated;

-- Permit server-side maintenance.
GRANT EXECUTE
ON FUNCTION public.cleanup_verification_rate_limits()
TO service_role;

COMMIT;
