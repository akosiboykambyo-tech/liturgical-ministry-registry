-- PR56 isolated staging only: remove synthetic letter-browser helpers AFTER operator PASS.
-- Guard against any leftover member or test PDF before dropping exact signatures.
DO $guard$
BEGIN
  IF to_regclass('public.recommendation_renewal_batches') IS NOT NULL
    OR (SELECT count(*) FROM public.members) <> 1008
    OR (SELECT count(*) FROM public.member_ministries) <> 12
    OR EXISTS (SELECT 1 FROM public.members WHERE first_name='PR56REVIEW' AND last_name='Synthetic' AND notes LIKE 'PR56REVIEW test-only nonce: %')
    OR EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='member-documents')
    OR to_regprocedure('public.pr56_review_begin_v1(uuid)') IS NULL
    OR to_regprocedure('public.pr56_review_finish_v1(uuid,uuid)') IS NULL
    OR to_regprocedure('public.registry_verify_ministries_v1(uuid,uuid[],text)') IS NULL
    OR to_regprocedure('public.registry_attach_ministry_letter_v1(uuid,uuid,text)') IS NULL
  THEN RAISE EXCEPTION 'PR56 staging letter-review teardown refused: inventory mismatch'
    USING ERRCODE='42501';
  END IF;
END
$guard$;

DROP FUNCTION public.pr56_review_begin_v1(uuid);
DROP FUNCTION public.pr56_review_finish_v1(uuid,uuid);
-- No CASCADE. Production and normal registry RPCs are not modified.
