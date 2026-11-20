-- RC1 TEST-only rollback candidate; NOT APPLIED
-- Remove ONLY functions created by
-- rc1-test-verification-rate-limit-restore.CANDIDATE.sql.
-- Do not drop public.verification_rate_limits or existing counters.
-- Note this rollback intentionally causes verification to fail CLOSED
-- again until a correct compatible rate limiter is installed.
-- Apply only if a confirmed issue warrants reverting the function restore.
BEGIN;

DROP FUNCTION IF EXISTS public.cleanup_verification_rate_limits();
DROP FUNCTION IF EXISTS public.check_verification_rate_limit(text, integer, integer);

NOTIFY pgrst, 'reload schema';
COMMIT;
