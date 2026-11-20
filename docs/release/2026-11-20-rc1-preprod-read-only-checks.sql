-- COWL-DOK RC1 | PROD readiness inventory | REVIEW ONLY | 20 Nov 2026
-- Purpose: compare metadata, policy breadth and aggregate counts; never copy TEST data.
-- Run on the intended Supabase PROD project ONLY after checking project identity.
-- No CREATE/ALTER/DROP/INSERT/UPDATE/DELETE. No member names, personal IDs, secret
-- settings values or Storage object names are selected. No security context changes.
-- Each query can run independently in the SQL editor under an appropriately
-- authorized read-only inspection role. Outputs should be archived with signoff.
-- This file is NOT a production migration; DO NOT treat passing these SELECTs as GO.

-- 1. Confirm project identity separately in dashboard (do not assume connection
--    based on SQL output). Expected PROD project ID: zlvofcwnpdzfdnipvbbd.

-- 2. Registry, verification and rate-limiter RPCs: exact signature, grants, definer.
SELECT n.nspname AS schema_name, p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS argument_signature,
       p.prosecdef AS is_security_definer,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname='public' AND p.proname IN (
         'registration_is_admin',
         'registry_admin_member_write_v1',
         'registry_attach_ministry_letters_v2',
         'registry_verify_ministries_v3',
         'check_verification_rate_limit',
         'cleanup_verification_rate_limits'
      ))
   OR (n.nspname='registry_private' AND p.proname='registry_sync_member_mirror_v1')
ORDER BY schema_name,function_name;

-- 3. Policy expressions to review and classify, especially anonymous SELECT.
SELECT schemaname, tablename, policyname, cmd,
       roles::text AS policy_roles, qual AS using_expression,
       with_check AS with_check_expression
FROM pg_policies
WHERE (schemaname='public' AND tablename IN (
        'system_settings','members','member_ministries','fs_staff_grants'))
   OR (schemaname='storage' AND tablename='objects')
ORDER BY schemaname,tablename,policyname;

-- 4. Explicit RLS switches for scoped Registry and finance ACL tables.
SELECT n.nspname AS schema_name,c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
  ('members','member_ministries','system_settings','fs_staff_grants')
  AND c.relkind IN ('r','p')
ORDER BY table_name;

-- 5. Only table structure metadata; PROD and TEST types differ in known columns.
SELECT table_name,column_name,data_type,is_nullable
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('members','member_ministries','system_settings','audit_logs')
ORDER BY table_name,ordinal_position;

-- 6. Storage bucket privacy; a private finance bucket is not required for
--    RC1 read-only Phase 1. Do not change storage policies during preflight.
SELECT id AS bucket_name, public AS publicly_accessible
FROM storage.buckets
WHERE id IN ('member-documents','certificate-templates','fs-private')
ORDER BY id;

-- 7. Aggregate inventory only. DO NOT query PII or inspect private documents.
SELECT
  (SELECT count(*) FROM public.members) AS member_count,
  (SELECT count(*) FROM public.member_ministries) AS ministry_assignment_count,
  (SELECT count(*) FROM public.system_settings) AS system_settings_count,
  (SELECT count(*) FROM public.fs_staff_grants) AS finance_role_grant_count,
  (SELECT count(*) FROM storage.objects) AS storage_object_count,
  (SELECT count(*) FROM registry_private.registration_administrators) AS registry_admin_grant_count;

-- 8. Review audit triggers before proposing any new function or cleanup.
SELECT n.nspname AS schema_name,c.relname AS table_name,
       t.tgname AS trigger_name,
       pg_get_triggerdef(t.oid) AS trigger_definition
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('members','member_ministries')
  AND NOT t.tgisinternal
ORDER BY table_name,trigger_name;

-- 9. Public settings EXPOSURE COUNTS ONLY; do not SELECT values.
--    The inspector must execute this in a separate *read-only* transaction.
--    Do not run SET ROLE alone without BEGIN READ ONLY/ROLLBACK.
-- BEGIN TRANSACTION READ ONLY;
-- SET LOCAL ROLE anon;
-- SELECT
--   (SELECT count(*) FROM public.system_settings) AS all_settings_visible_to_anon,
--   (SELECT count(*) FROM public.system_settings
--    WHERE key IN ('public_marquee','public_maintenance')) AS explicitly_public_keys,
--   (SELECT count(*) FROM public.system_settings
--    WHERE key LIKE 'certificate_template%' OR key LIKE 'sig_layout_%')
--      AS private_certificate_draft_keys_visible_to_anon;
-- ROLLBACK;

-- 10. No SQL-only claim proves backups are restorable. Record separately:
-- backup type/ID/time, owner, Auth/data recovery, Storage export/restore method,
-- a tested restore exercise/reference, acceptable RPO/RTO and rollback commander.
