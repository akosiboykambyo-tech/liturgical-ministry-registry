-- Stage 4C post-migration checks for a disposable, isolated clone only.
-- Read-only assertions: no synthetic records, counters, or schema changes.
-- Run only AFTER applying the proposed migration to a separate NEW clone,
-- never to the preserved V3 checkpoint or a live environment.
BEGIN READ ONLY;

DO $stage4c_checks$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='members'
      AND policyname='test_admin_read_members'
  ) THEN
    RAISE EXCEPTION 'FAIL: test-only member SELECT policy remains';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='members'
      AND policyname='pr55_secure_admin_read_members'
  ) THEN
    RAISE EXCEPTION 'FAIL: expected normal member admin policy absent; verify baseline';
  END IF;

  IF has_function_privilege('anon', 'public.admin_login_begin(text,uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.admin_login_begin(text,uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.admin_login_finish(text,uuid,boolean)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.admin_login_finish(text,uuid,boolean)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'FAIL: application role may execute login RPC directly';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.admin_login_begin(text,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.admin_login_finish(text,uuid,boolean)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'FAIL: service_role cannot execute login RPCs';
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
    RAISE EXCEPTION 'FAIL: fixed-test-identity lookup still executable';
  END IF;

  RAISE NOTICE 'PASS: Stage 4C static security assertions';
END;
$stage4c_checks$;

COMMIT;
