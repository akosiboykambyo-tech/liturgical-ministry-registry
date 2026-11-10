-- ISOLATED STAGING ONLY: patched synthetic cleanup to allow UID triggers.
DO $guard$ BEGIN
 IF to_regclass('public.recommendation_renewal_batches') IS NOT NULL
 OR to_regprocedure('public.pr55_e2e_finish_v1(uuid,uuid)') IS NULL
 OR (SELECT count(*) FROM registry_private.registration_administrators WHERE active AND revoked_at IS NULL) <> 1
 THEN RAISE EXCEPTION 'PR55 staging-only cleanup guard failed' USING ERRCODE='42501';
 END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.pr55_e2e_finish_v1(p_member_id uuid,p_nonce uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_admin uuid := auth.uid();
 v_count integer;
 v_member_count integer;
BEGIN
 IF v_admin IS NULL THEN
   RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM registry_private.registration_administrators AS a
 WHERE a.user_id=v_admin AND a.active AND a.revoked_at IS NULL FOR SHARE;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501';
 END IF;
 IF p_member_id IS NULL OR p_nonce IS NULL THEN
   RAISE EXCEPTION 'Missing synthetic fixture identifiers' USING ERRCODE='22023';
 END IF;
 -- Staging UID triggers replace the provided UID. Lock an exact
 -- synthetic test-only member identity using the nonce marker instead.
 PERFORM 1 FROM public.members WHERE id=p_member_id
 AND notes='PR55E2E test-only nonce: '||p_nonce::text
 AND first_name='PR55E2E' AND last_name='Synthetic'
 AND parish='Staging Test Parish' FOR UPDATE;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'Cleanup refused: not the matching synthetic fixture'
     USING ERRCODE='42501';
 END IF;
 SELECT count(*) INTO v_count FROM public.member_ministries
 WHERE member_id=p_member_id;
 IF v_count <> 2 OR
   (SELECT count(DISTINCT ministry) FROM public.member_ministries
    WHERE member_id=p_member_id AND ministry IN
      ('Ministry of Lectors and Commentators','Ministry of Liturgical Music')) <> 2
 THEN
   RAISE EXCEPTION 'Cleanup refused: synthetic assignment inventory changed'
     USING ERRCODE='42501';
 END IF;
 DELETE FROM public.member_ministries WHERE member_id=p_member_id;
 GET DIAGNOSTICS v_count = ROW_COUNT;
 DELETE FROM public.members WHERE id=p_member_id
 AND notes='PR55E2E test-only nonce: '||p_nonce::text
 AND first_name='PR55E2E' AND last_name='Synthetic'
 AND parish='Staging Test Parish';
 GET DIAGNOSTICS v_member_count = ROW_COUNT;
 IF v_count <> 2 OR v_member_count <> 1 THEN
   RAISE EXCEPTION 'Fixture cleanup incomplete' USING ERRCODE='55000';
 END IF;
 RETURN jsonb_build_object('cleaned',true,'deleted_assignments',v_count);
END;
$fn$;

