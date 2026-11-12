-- COWL-DOK PR79: non-mutating restore-comparison inventory.
-- Execute separately on the SOURCE and disposable restored project.
-- Never copy personal records, passwords, JWTs, Storage object keys or keys.
-- The output hashes identify structural drift; they are not backups.
WITH
  user_counts AS (
    SELECT count(*)::bigint AS auth_accounts FROM auth.users
  ),
  registry_counts AS (
    SELECT
      (SELECT count(*)::bigint FROM public.members) AS members,
      (SELECT count(*)::bigint FROM public.member_ministries) AS member_assignments,
      (SELECT count(*)::bigint FROM registry_private.registration_administrators
        WHERE active AND revoked_at IS NULL) AS active_registry_admins,
      (SELECT count(*)::bigint FROM public.system_settings
        WHERE key LIKE 'certificate_template%') AS certificate_templates,
      (SELECT count(*)::bigint FROM public.signatories) AS signatories
  ),
  policies AS (
    SELECT count(*)::bigint AS total,
      md5(coalesce(string_agg(
        concat_ws('|', schemaname, tablename, policyname, cmd, roles::text,
          coalesce(qual,''), coalesce(with_check,'')),
        E'\n' ORDER BY schemaname, tablename, policyname, cmd), '')) AS fingerprint
    FROM pg_policies
    WHERE schemaname IN ('public','registry_private','storage')
  ),
  rls_tables AS (
    SELECT count(*)::bigint AS total,
      count(*) FILTER (WHERE c.relrowsecurity)::bigint AS enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','registry_private','storage') AND c.relkind IN ('r','p')
  ),
  rpc_contracts AS (
    SELECT count(*)::bigint AS count_present,
      md5(coalesce(string_agg(
        n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'||
        ':'||md5(pg_get_functiondef(p.oid)),
        E'\n' ORDER BY p.proname,pg_get_function_identity_arguments(p.oid)),'')) AS fingerprint
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
      'registration_is_admin','registry_admin_member_write_v1',
      'registry_verify_ministries_v2','registry_verify_ministries_v3',
      'registry_attach_ministry_letters_v2','allocate_certificate_issuance')
  ),
  storage_sizes AS (
    SELECT b.id AS bucket_id,b.public,count(o.id)::bigint AS file_count,
      coalesce(sum((o.metadata->>'size')::bigint),0)::bigint AS metadata_bytes
    FROM storage.buckets b
    LEFT JOIN storage.objects o ON o.bucket_id=b.id
    GROUP BY b.id,b.public
  ),
  storage_inventory AS (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object('bucket',bucket_id,'public',public,
        'objects',file_count,'metadata_bytes',metadata_bytes)
      ORDER BY bucket_id),'[]'::jsonb) AS summary
    FROM storage_sizes
  ),
  table_privileges AS (
    SELECT jsonb_build_object(
      'members_auth_insert',has_table_privilege('authenticated','public.members','INSERT'),
      'members_auth_update',has_table_privilege('authenticated','public.members','UPDATE'),
      'ministry_auth_update',has_table_privilege('authenticated','public.member_ministries','UPDATE'),
      'certificate_auth_insert',has_table_privilege('authenticated','public.certificate_downloads','INSERT'),
      'settings_auth_update',has_table_privilege('authenticated','public.system_settings','UPDATE'),
      'signatory_auth_update',has_table_privilege('authenticated','public.signatories','UPDATE')
    ) AS summary
  )
SELECT jsonb_pretty(jsonb_build_object(
  'captured_at',now(),
  'database',current_database(),
  'auth_accounts',auth_accounts,
  'members',members,
  'member_assignments',member_assignments,
  'active_registry_admins',active_registry_admins,
  'certificate_templates',certificate_templates,
  'signatories',signatories,
  'rls_table_count',rls_tables.total,
  'rls_enabled_count',rls_tables.enabled,
  'policy_count',policies.total,
  'policy_fingerprint',policies.fingerprint,
  'security_rpc_count',rpc_contracts.count_present,
  'security_rpc_fingerprint',rpc_contracts.fingerprint,
  'storage_inventory',storage_inventory.summary,
  'authenticated_table_privileges',table_privileges.summary
)) AS restore_inventory
FROM user_counts CROSS JOIN registry_counts CROSS JOIN policies
CROSS JOIN rls_tables CROSS JOIN rpc_contracts CROSS JOIN storage_inventory
CROSS JOIN table_privileges;
