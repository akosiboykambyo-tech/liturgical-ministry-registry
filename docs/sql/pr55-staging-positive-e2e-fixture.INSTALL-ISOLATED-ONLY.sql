-- PR55 ISOLATED STAGING ONLY: synthetic HTTP/Storage E2E harness.
-- Deliberately refuses production-shaped renewal schema. Never deploy to production.
DO $guard$
BEGIN
  IF to_regclass('public.recommendation_renewal_batches') IS NOT NULL
    OR to_regprocedure('public.registry_verify_ministries_v1(uuid,uuid[],text)') IS NULL
    OR to_regprocedure('public.registry_attach_ministry_letter_v1(uuid,uuid,text)') IS NULL
    OR to_regprocedure('public.pr55_e2e_begin_v1(uuid)') IS NOT NULL
    OR to_regclass('registry_private.registration_administrators') IS NULL
    OR (SELECT count(*) FROM registry_private.registration_administrators
        WHERE active AND revoked_at IS NULL) <> 1
    OR (SELECT count(*) FROM public.members) NOT BETWEEN 900 AND 1200
    OR (SELECT count(*) FROM storage.buckets WHERE id='member-documents' AND NOT public) <> 1
  THEN
    RAISE EXCEPTION 'PR55 E2E isolated-staging prerequisite mismatch' USING ERRCODE='42501';
  END IF;
END
$guard$;

-- Admin-only test fixture creation; only identifiable synthetic E2E records.
CREATE FUNCTION public.pr55_e2e_begin_v1(p_nonce uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_admin uuid := auth.uid();
 v_member uuid;
 v_first uuid;
 v_second uuid;
 v_uid text;
BEGIN
 IF v_admin IS NULL THEN
  RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM registry_private.registration_administrators AS a
 WHERE a.user_id=v_admin AND a.active AND a.revoked_at IS NULL FOR SHARE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501';
 END IF;
 IF p_nonce IS NULL THEN
  RAISE EXCEPTION 'Unique synthetic session required' USING ERRCODE='22023';
 END IF;
 v_uid := 'PR55E2E-' || replace(p_nonce::text,'-','');
 INSERT INTO public.members(uid,first_name,last_name,parish,ministries,service_year,status,notes)
 VALUES(v_uid,'PR55E2E','Synthetic','Staging Test Parish',
  ARRAY['Ministry of Lectors and Commentators','Ministry of Liturgical Music'],
  2026,'Pending Verification','PR55E2E test-only nonce: '||p_nonce::text)
 RETURNING id INTO v_member;
 INSERT INTO public.member_ministries(member_id,ministry,status)
 VALUES (v_member,'Ministry of Lectors and Commentators','Pending Verification')
 RETURNING id INTO v_first;
 INSERT INTO public.member_ministries(member_id,ministry,status)
 VALUES (v_member,'Ministry of Liturgical Music','Pending Verification')
 RETURNING id INTO v_second;
 RETURN jsonb_build_object('member_id',v_member,'first_id',v_first,
  'second_id',v_second,'nonce',p_nonce);
END;
$fn$;

CREATE FUNCTION public.pr55_e2e_finish_v1(p_member_id uuid,p_nonce uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_admin uuid := auth.uid();
 v_uid text;
 v_expected text;
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
 v_expected := 'PR55E2E-' || replace(p_nonce::text,'-','');
 SELECT uid INTO v_uid FROM public.members WHERE id=p_member_id
 AND notes = 'PR55E2E test-only nonce: '||p_nonce::text FOR UPDATE;
 IF v_uid IS DISTINCT FROM v_expected THEN
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
 DELETE FROM public.members WHERE id=p_member_id AND uid=v_expected;
 GET DIAGNOSTICS v_member_count = ROW_COUNT;
 IF v_count <> 2 OR v_member_count <> 1 THEN
   RAISE EXCEPTION 'Fixture cleanup incomplete' USING ERRCODE='55000';
 END IF;
 RETURN jsonb_build_object('cleaned',true,'deleted_assignments',v_count);
END;
$fn$;

REVOKE ALL ON FUNCTION public.pr55_e2e_begin_v1(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pr55_e2e_finish_v1(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pr55_e2e_begin_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pr55_e2e_finish_v1(uuid,uuid) TO authenticated;
-- Both functions still require a *revocable* active administrator grant on each call.
-- Remove both functions after operator's HTTP test; these are staging-only helpers.
