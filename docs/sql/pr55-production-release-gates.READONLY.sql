-- PR55 production release gates, READ ONLY.
-- Every result is metadata/aggregate; does not return member names, UUIDs,
-- Auth emails, document paths, passwords or tokens.
-- Never run UPDATE, INSERT, DELETE or call mutation RPCs in this script.
SELECT 'production-identity' AS gate,
 CASE WHEN to_regclass('registry_private.registration_administrators') IS NOT NULL THEN 'FOUND'
 ELSE 'BLOCKED: no revocable administrator allowlist' END AS finding
UNION ALL
SELECT 'admin-identity-candidate',
 CASE WHEN (SELECT count(*) FROM auth.users)=1 AND
 (SELECT count(*) FROM auth.users
  WHERE id IN (
  SELECT u.id FROM auth.users u JOIN pg_policies p
    ON p.schemaname='public' AND p.tablename='members'
   AND p.policyname='registry_admin_members'
  WHERE p.qual LIKE '%'||u.id::text||'%'
 ))=1
 THEN 'CANDIDATE: single real Auth user matches existing fixed-UUID policy; ownership approval outstanding'
 ELSE 'BLOCKED: fixed-policy Auth identity mismatch or multiple users' END
UNION ALL
SELECT 'secure-verification-rpc',
 CASE WHEN to_regprocedure('public.registry_verify_ministries_v1(uuid,uuid[],text)') IS NOT NULL
 THEN 'PRESENT' ELSE 'BLOCKED: secure verification function not installed' END
UNION ALL
SELECT 'renewal-rpc-year-compliance',
 CASE WHEN to_regprocedure('public.process_recommendation_renewal_batch(uuid,text,text,text,date,date,uuid[],text)') IS NOT NULL
  AND position('p_next_renewal_date IS DISTINCT FROM v_expires'
   IN pg_get_functiondef('public.process_recommendation_renewal_batch(uuid,text,text,text,date,date,uuid[],text)'::regprocedure))>0
 THEN 'PRESENT' ELSE 'BLOCKED: hardened exact-one-year renewal function not installed' END
UNION ALL
SELECT 'direct-ministry-mutation',
 CASE WHEN has_table_privilege('authenticated','public.member_ministries','UPDATE')
 THEN 'BLOCKED: authenticated direct UPDATE remains granted'
 ELSE 'PASS: no authenticated table UPDATE grant' END
UNION ALL
SELECT 'renewal-history-read',
 CASE WHEN EXISTS (SELECT 1 FROM pg_policies
  WHERE schemaname='public'
  AND tablename IN ('recommendation_renewal_batches','recommendation_renewal_memberships')
  AND cmd='SELECT' AND qual='true')
 THEN 'BLOCKED: unrestricted authenticated SELECT policy exists'
 ELSE 'REVIEW: no unrestricted SELECT policy found' END
UNION ALL
SELECT 'historical-annual-validity',
 CASE WHEN EXISTS (
  SELECT 1 FROM public.member_ministries
  WHERE status='Renewed'
  AND (renewal_date IS NULL OR expiration_date IS NULL OR
       expiration_date <> (renewal_date+interval '1 year')::date))
 THEN 'BLOCKED: historical Renewed assignment needs adjudication'
 ELSE 'PASS: renewed assignment dates match one-year rule' END
UNION ALL
SELECT 'storage-recovery',
 'NEEDS CERTIFICATION: '||(SELECT count(*)::text FROM storage.objects)||
 ' Storage objects require an encrypted file-level recovery test'
UNION ALL
SELECT 'current-member-baseline',
 (SELECT count(*)::text FROM public.members)||' members; '||
 (SELECT count(*)::text FROM public.member_ministries)||' assignments; '||
 (SELECT count(*)::text FROM auth.users)||' Auth users'
ORDER BY gate;