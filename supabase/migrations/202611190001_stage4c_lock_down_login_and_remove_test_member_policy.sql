-- COWL-DOK Stage 4C: remove a test-only member read path and
-- restrict login-throttling RPCs to the trusted server-side service role.
--
-- REVIEW ONLY. Source: isolated V3 Stage 4B catalog/function exports.
-- Do not apply to PROD/TEST or preserved V3 without environment-specific
-- review and an approved change window. Test on a NEW disposable clone.
-- This migration changes permissions and one test RLS policy; it does not
-- update member records, login counters, or authentication credentials.
BEGIN;

DO $stage4c_preflight$
BEGIN
  IF to_regclass('public.members') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_class WHERE oid = to_regclass('public.members')
         AND relrowsecurity
     ) THEN
    RAISE EXCEPTION 'Stage 4C requires public.members with RLS enabled';
  END IF;

  -- Refuse to remove the test exception unless the ordinary admin read
  -- policy survives; do not silently lock out legitimate administrators.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'members'
      AND policyname = 'pr55_secure_admin_read_members'
      AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'Stage 4C normal administrator read policy missing';
  END IF;

  IF to_regprocedure('public.admin_login_begin(text,uuid)') IS NULL
     OR to_regprocedure('public.admin_login_finish(text,uuid,boolean)') IS NULL THEN
    RAISE EXCEPTION 'Stage 4C login RPC signature mismatch; stop and review';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'Stage 4C expected application roles are missing';
  END IF;
END;
$stage4c_preflight$;

-- This fixed-identity exception appeared in the offline V3 audit.
-- Normal access is governed by the separate administrator RLS policy.
DROP POLICY IF EXISTS test_admin_read_members ON public.members;

-- app/api/admin/sign-in/route.ts calls these with a service-role client.
-- The RPCs must NOT be directly callable by browser application roles:
-- finish() accepts a caller-supplied success flag.
REVOKE EXECUTE ON FUNCTION public.admin_login_begin(text,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_login_finish(text,uuid,boolean)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_login_begin(text,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_login_finish(text,uuid,boolean)
  TO service_role;

-- The legacy local registration lookup preflight checks a fixed test UUID.
-- Leave the function body intact for forensic parity, but remove access
-- from all application roles when it exists in a target environment.
DO $stage4c_test_lookup$
BEGIN
  IF to_regprocedure('public.registration_lookup_preflight()') IS NOT NULL THEN
    EXECUTE
      'REVOKE EXECUTE ON FUNCTION public.registration_lookup_preflight() FROM PUBLIC, anon, authenticated, service_role';
  END IF;
END;
$stage4c_test_lookup$;

-- Fail atomically if the intended access boundary was not achieved.
DO $stage4c_assert$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'members'
      AND policyname = 'test_admin_read_members'
  ) THEN
    RAISE EXCEPTION 'Stage 4C test policy still present';
  END IF;

  IF has_function_privilege('anon',
       'public.admin_login_begin(text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.admin_login_begin(text,uuid)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.admin_login_finish(text,uuid,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.admin_login_finish(text,uuid,boolean)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Stage 4C public login RPC execution still enabled';
  END IF;

  IF NOT has_function_privilege('service_role',
       'public.admin_login_begin(text,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.admin_login_finish(text,uuid,boolean)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Stage 4C trusted service role lost login RPC access';
  END IF;

  IF to_regprocedure('public.registration_lookup_preflight()') IS NOT NULL
     AND (
       has_function_privilege('anon',
         'public.registration_lookup_preflight()', 'EXECUTE')
       OR has_function_privilege('authenticated',
         'public.registration_lookup_preflight()', 'EXECUTE')
       OR has_function_privilege('service_role',
         'public.registration_lookup_preflight()', 'EXECUTE')
     )
  THEN
    RAISE EXCEPTION 'Stage 4C fixed-ID lookup still executable by application roles';
  END IF;
END;
$stage4c_assert$;

COMMIT;
