-- PR55 isolated staging teardown, 2026-10-29.
-- Removes ONLY synthetic E2E fixture helpers after independent cleanup.
-- Does not touch production, registry verification, or letter attachment RPCs.
DO $safety$
BEGIN
  IF to_regclass('public.recommendation_renewal_batches') IS NOT NULL
    OR (SELECT count(*) FROM public.members) <> 1008
    OR (SELECT count(*) FROM public.member_ministries) <> 12
    OR EXISTS (
      SELECT 1 FROM public.members
      WHERE first_name='PR55E2E' AND last_name='Synthetic'
        AND notes LIKE 'PR55E2E test-only nonce: %'
    )
    OR EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='member-documents')
    OR to_regprocedure('public.pr55_e2e_begin_v1(uuid)') IS NULL
    OR to_regprocedure('public.pr55_e2e_finish_v1(uuid,uuid)') IS NULL
    OR to_regprocedure('public.registry_verify_ministries_v1(uuid,uuid[],text)') IS NULL
    OR to_regprocedure('public.registry_attach_ministry_letter_v1(uuid,uuid,text)') IS NULL
  THEN
    RAISE EXCEPTION 'PR55 staging helper teardown refused: unexpected inventory'
      USING ERRCODE='42501';
  END IF;
END
$safety$;

DROP FUNCTION public.pr55_e2e_begin_v1(uuid);
DROP FUNCTION public.pr55_e2e_finish_v1(uuid,uuid);
-- No CASCADE: abort if any unexpected dependent code exists.
