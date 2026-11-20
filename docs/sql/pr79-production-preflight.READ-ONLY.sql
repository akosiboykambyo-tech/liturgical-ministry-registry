-- PR79 production preflight (READ ONLY; no role, grant, DDL, or data changes).
-- Run on production via Supabase SQL Editor. Save the JSON output in a restricted
-- release checklist; never include Auth user rows, secrets, or member records.
WITH definitions AS (
  SELECT
    to_regprocedure('public.registry_admin_member_write_v1(text,jsonb)') AS member_writer,
    to_regprocedure('public.registry_verify_ministries_v3(uuid,uuid[],text,date,text)') AS verification_v3,
    to_regprocedure('public.registry_verify_ministries_v2(uuid,uuid[],text)') AS verification_v2,
    to_regprocedure('public.allocate_certificate_issuance(text,uuid)') AS certificate_allocator
), counts AS (
  SELECT
    (SELECT count(*) FROM auth.users) AS auth_accounts,
    (SELECT count(*) FROM public.members) AS registry_members,
    (SELECT count(*) FROM public.member_ministries) AS ministry_assignments,
    (SELECT count(*) FROM storage.objects) AS storage_metadata_objects,
    (SELECT count(*) FROM public.signatories) AS signatory_rows,
    (SELECT count(*) FROM public.system_settings WHERE key LIKE 'certificate_template%') AS template_rows,
    (SELECT count(*) FROM registry_private.registration_administrators WHERE active AND revoked_at IS NULL) AS active_registry_admins
)
SELECT jsonb_pretty(jsonb_build_object(
  'checked_at',now(),
  'database',current_database(),
  'member_writer_present',member_writer IS NOT NULL,
  'verification_v3_present',verification_v3 IS NOT NULL,
  'verification_v2_present',verification_v2 IS NOT NULL,
  'certificate_allocator_present',certificate_allocator IS NOT NULL,
  'certificate_null_expiration_guard',certificate_allocator IS NOT NULL AND
    position('v_expiration_date IS NULL' IN pg_get_functiondef(certificate_allocator))>0,
  'certificate_uses_manila_day',certificate_allocator IS NOT NULL AND
    position('Asia/Manila' IN pg_get_functiondef(certificate_allocator))>0,
  'auth_accounts',auth_accounts,
  'registry_members',registry_members,
  'ministry_assignments',ministry_assignments,
  'storage_metadata_objects',storage_metadata_objects,
  'signatory_rows',signatory_rows,
  'template_rows',template_rows,
  'active_registry_admins',active_registry_admins
)) AS release_preflight
FROM definitions CROSS JOIN counts;
