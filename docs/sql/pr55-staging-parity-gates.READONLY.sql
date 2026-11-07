-- PR #55 — read-only Supabase environment inventory.
-- Safe to execute in either Ministry-Database (production) or Ministry-Registry-Test.
-- Reports metadata and counts only; does not expose member records or Auth identities.
-- Table-presence/count parity is not proof of DDL, grant, RLS, Auth or Storage-byte parity.
WITH required(name) AS (
 VALUES
 ('admin_login_attempts'),('admin_login_reservations'),('audit_logs'),
 ('certificate_downloads'),('duplicate_flags'),('import_batches'),
 ('member_ministries'),('members'),('name_correction_requests'),
 ('public_reports'),('recommendation_renewal_batches'),
 ('recommendation_renewal_memberships'),('renewal_review_items'),
 ('scanned_duplicates'),('signatories'),('system_settings'),
 ('verification_rate_limits')
), table_check AS (
 SELECT count(*)::integer AS expected,
        count(*) FILTER (WHERE to_regclass('public.' || name) IS NOT NULL)::integer AS found,
        COALESCE(jsonb_agg(name ORDER BY name) FILTER (
          WHERE to_regclass('public.' || name) IS NULL), '[]'::jsonb) AS missing
 FROM required
)
SELECT 'required_public_tables' AS gate, found::text || '/' || expected::text AS observed,
       missing AS details, found=expected AS present
FROM table_check
UNION ALL
SELECT 'required_storage_buckets',
       (SELECT count(*)::text FROM storage.buckets WHERE id IN ('member-documents','certificate-templates')) || '/2',
       (SELECT COALESCE(jsonb_agg(b.id ORDER BY b.id),'[]'::jsonb) FROM storage.buckets b),
       (SELECT count(*)=2 FROM storage.buckets WHERE id IN ('member-documents','certificate-templates'))
UNION ALL
SELECT 'storage_object_policies',
       (SELECT count(*)::text FROM pg_policies WHERE schemaname='storage' AND tablename='objects') || '/8',
       '[]'::jsonb,
       (SELECT count(*)>=8 FROM pg_policies WHERE schemaname='storage' AND tablename='objects')
UNION ALL
SELECT 'preexisting_admin_guarded_rpcs',
       (SELECT count(DISTINCT p.proname)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname IN (
            'registration_is_admin','registry_verify_ministries_v1',
            'registry_attach_ministry_letter_v1','process_recommendation_renewal_batch')) || '/4',
       '[]'::jsonb,
       (SELECT count(DISTINCT p.proname)=4 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname IN (
            'registration_is_admin','registry_verify_ministries_v1',
            'registry_attach_ministry_letter_v1','process_recommendation_renewal_batch'))
UNION ALL
SELECT 'one_active_private_admin',
       (SELECT count(*)::text FROM registry_private.registration_administrators WHERE active AND revoked_at IS NULL),
       '[]'::jsonb,
       (SELECT count(*)=1 FROM registry_private.registration_administrators WHERE active AND revoked_at IS NULL)
UNION ALL
SELECT 'distinct_auth_accounts_for_test',
       (SELECT count(*)::text FROM auth.users),
       '[]'::jsonb,
       (SELECT count(*)>=2 FROM auth.users)
ORDER BY gate;
