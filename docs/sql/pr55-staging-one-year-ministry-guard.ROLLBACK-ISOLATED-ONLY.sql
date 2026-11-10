-- PR55 ISOLATED STAGING ONLY: reversible rollback of ministry date guard.
-- Do not run on production. No member, assignment, audit, or Storage writes.
DO $guard$
BEGIN
 IF to_regclass('public.recommendation_renewal_batches') IS NOT NULL
  OR (SELECT count(*) FROM public.members) <> 1008
  OR (SELECT count(*) FROM public.member_ministries) <> 12
  OR (SELECT count(*) FROM storage.objects) <> 0
  OR to_regprocedure('registry_private.enforce_member_ministry_year_v1()') IS NULL
  OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname='trg_pr55_ministry_one_year'
      AND tgrelid='public.member_ministries'::regclass
      AND NOT tgisinternal
  )
 THEN RAISE EXCEPTION 'Rollback refused: isolated staging baseline changed'
  USING ERRCODE='42501';
 END IF;
END $guard$;

DROP TRIGGER trg_pr55_ministry_one_year ON public.member_ministries;
DROP FUNCTION registry_private.enforce_member_ministry_year_v1();
-- No CASCADE; dependency unexpectedly added => fail closed.
