-- PR #54 production metadata gate, 2026-10-24
-- READ ONLY. Run on the selected project and review outputs; no writes or function calls.
SELECT 'columns' AS check_group, table_name||'.'||column_name AS item,
  data_type||coalesce('('||character_maximum_length::text||')','') AS detail
FROM information_schema.columns
WHERE table_schema='public'
  AND ((table_name='members' AND column_name IN ('uid','first_name','last_name','parish','service_year','status'))
    OR (table_name='member_ministries' AND column_name IN ('member_id','ministry','status','expiration_date')))
UNION ALL
SELECT 'constraints', conrelid::regclass::text||'.'||conname, pg_get_constraintdef(oid,true)
FROM pg_constraint
WHERE conrelid IN ('public.members'::regclass,'public.member_ministries'::regclass)
UNION ALL
SELECT 'triggers',tgrelid::regclass::text||'.'||tgname,pg_get_triggerdef(oid,true)
FROM pg_trigger
WHERE tgrelid IN ('public.members'::regclass,'public.member_ministries'::regclass) AND NOT tgisinternal
UNION ALL
SELECT 'extensions',extname,n.nspname
FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
WHERE extname IN ('pgcrypto','fuzzystrmatch')
UNION ALL
SELECT 'rls',oid::regclass::text, 'enabled='||relrowsecurity::text
FROM pg_class WHERE oid IN ('public.members'::regclass,'public.member_ministries'::regclass)
ORDER BY check_group,item;
-- Additional tests: review pg_policies, has_table_privilege for anon/authenticated,
-- pg_proc owner/security context, and all functional unique indexes before signoff.
