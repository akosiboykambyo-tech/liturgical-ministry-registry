-- Stage 4A — historical V3 registration intake READ-ONLY baseline
-- Target: isolated Ministry-Registry-Test (rtptybxugjhvpfjvcvgw).
-- Do not execute writes against production.
-- No CREATE, ALTER, DROP, INSERT, UPDATE, DELETE or EXECUTE of business RPCs.
-- Catalog inspection only; row counts deliberately cover small test tables.
-- 2026-11-19

-- 1. V3 routines and effective EXECUTE privileges.
SELECT n.nspname AS schema_name,
       p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer,
       pg_get_userbyid(p.proowner) AS function_owner,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE p.proname = 'atomic_registration_v3'
  AND n.nspname IN ('public', 'registry_test_private')
ORDER BY n.nspname;

-- 2. Private registry intake tables and RLS state.
SELECT n.nspname AS schema_name,
       c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       has_schema_privilege('anon', n.oid, 'USAGE') AS anon_schema_usage,
       has_schema_privilege('authenticated', n.oid, 'USAGE') AS authenticated_schema_usage,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
       has_table_privilege('authenticated', c.oid, 'INSERT') AS authenticated_insert
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname IN ('registry_test_private', 'registry_private')
  AND c.relkind = 'r'
ORDER BY n.nspname, c.relname;

-- 3. Historical V3 constraints.
SELECT n.nspname AS schema_name,
       c.relname AS table_name,
       con.conname AS constraint_name,
       con.contype AS constraint_type,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint AS con
JOIN pg_class AS c ON c.oid = con.conrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'registry_test_private'
ORDER BY n.nspname, c.relname, con.conname;

-- 4. Existing triggers associated with registry writes.
SELECT n.nspname AS schema_name,
       c.relname AS table_name,
       t.tgname AS trigger_name,
       t.tgenabled AS enabled,
       pg_get_triggerdef(t.oid) AS trigger_definition
FROM pg_trigger AS t
JOIN pg_class AS c ON c.oid = t.tgrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal
  AND n.nspname = 'public'
  AND c.relname IN ('members', 'member_ministries')
ORDER BY c.relname, t.tgname;

-- 5. Non-PII baseline counts, preserving historical fixtures.
SELECT 'registry_test_private.intake_requests' AS entity, COUNT(*) AS rows
FROM registry_test_private.intake_requests
UNION ALL SELECT 'registry_test_private.intake_reviews', COUNT(*)
FROM registry_test_private.intake_reviews
UNION ALL SELECT 'registry_private.registration_intake_requests', COUNT(*)
FROM registry_private.registration_intake_requests
UNION ALL SELECT 'registry_private.registration_intake_reviews', COUNT(*)
FROM registry_private.registration_intake_reviews
UNION ALL SELECT 'registry_private.registration_review_events', COUNT(*)
FROM registry_private.registration_review_events
UNION ALL SELECT 'public.members', COUNT(*)
FROM public.members
UNION ALL SELECT 'public.member_ministries', COUNT(*)
FROM public.member_ministries
ORDER BY entity;

-- 6. View policy metadata (absence of policy may be deliberate deny-by-default).
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname IN ('registry_test_private', 'registry_private')
ORDER BY schemaname, tablename, policyname;
