-- PR55 ISOLATED STAGING ONLY. A private letter collection path that does NOT
-- approve or renew any ministry assignment. Never run against production.
DO $guard$
BEGIN
 IF to_regclass('public.recommendation_renewal_batches') IS NOT NULL
 OR to_regprocedure('public.registry_verify_ministries_v1(uuid,uuid[],text)') IS NULL
 OR to_regprocedure('public.registry_attach_ministry_letter_v1(uuid,uuid,text)') IS NOT NULL
 OR (SELECT count(*) FROM auth.users) <> 2
 OR (SELECT count(*) FROM registry_private.registration_administrators
     WHERE active AND revoked_at IS NULL) <> 1
 OR EXISTS(SELECT 1 FROM storage.buckets WHERE id='member-documents')
 THEN
   RAISE EXCEPTION 'PR55 isolated staging letter guard failed' USING ERRCODE='42501';
 END IF;
END
$guard$;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('member-documents','member-documents',false,5242880,
        ARRAY['application/pdf','image/png','image/jpeg']::text[]);

-- This immutable file prefix is exclusive to this new workflow. Existing
-- Storage policies on other buckets and paths are not modified.
CREATE POLICY pr55_staging_letter_insert ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
 bucket_id='member-documents'
 AND (storage.foldername(name))[1]='verification'
 AND (SELECT public.registration_is_admin())
);
CREATE POLICY pr55_staging_letter_read ON storage.objects
FOR SELECT TO authenticated USING (
 bucket_id='member-documents'
 AND (storage.foldername(name))[1]='verification'
 AND (SELECT public.registration_is_admin())
);
CREATE POLICY pr55_staging_letter_delete ON storage.objects
FOR DELETE TO authenticated USING (
 bucket_id='member-documents'
 AND (storage.foldername(name))[1]='verification'
 AND (SELECT public.registration_is_admin())
);

CREATE OR REPLACE FUNCTION public.registry_attach_ministry_letter_v1(
 p_member_id uuid, p_membership_id uuid, p_document_path text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $rpc$
DECLARE
 v_actor uuid := auth.uid();
 v_assignment public.member_ministries%ROWTYPE;
 v_prefix text;
BEGIN
 IF v_actor IS NULL THEN
   RAISE EXCEPTION 'Administrator authorization required' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM registry_private.registration_administrators AS a
 WHERE a.user_id=v_actor AND a.active AND a.revoked_at IS NULL FOR SHARE;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'Administrator authorization required' USING ERRCODE='42501';
 END IF;
 IF p_member_id IS NULL OR p_membership_id IS NULL THEN
   RAISE EXCEPTION 'Explicit member and assignment required' USING ERRCODE='22023';
 END IF;
 v_prefix := 'verification/' || p_member_id::text || '/' || p_membership_id::text || '/';
 IF p_document_path IS NULL OR length(p_document_path) > 240
   OR left(p_document_path,length(v_prefix)) <> v_prefix
   OR p_document_path !~ '^[a-zA-Z0-9/_-]+\.(pdf|png|jpg|jpeg)$'
 THEN
   RAISE EXCEPTION 'Invalid ministry-specific private document path' USING ERRCODE='22023';
 END IF;
 -- Lock the parent to serialize against other verification/review operations.
 PERFORM 1 FROM public.members WHERE id=p_member_id FOR UPDATE;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'Member not found' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_assignment FROM public.member_ministries
 WHERE member_id=p_member_id AND id=p_membership_id FOR UPDATE;
 IF NOT FOUND OR v_assignment.status <> 'Pending Verification'
   OR v_assignment.document_url IS NOT NULL
 THEN
   RAISE EXCEPTION 'Pending assignment without a letter is required' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects AS so
   WHERE so.bucket_id='member-documents' AND so.name=p_document_path)
 THEN
   RAISE EXCEPTION 'Private recommendation document has not been uploaded' USING ERRCODE='22023';
 END IF;
 UPDATE public.member_ministries
 SET document_url=p_document_path,
     document_uploaded_at=transaction_timestamp(),
     updated_at=transaction_timestamp()
 WHERE member_id=p_member_id AND id=p_membership_id;
 RETURN jsonb_build_object('member_id',p_member_id,'membership_id',p_membership_id,
       'attached',true);
END
$rpc$;

REVOKE ALL ON FUNCTION public.registry_attach_ministry_letter_v1(uuid,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.registry_attach_ministry_letter_v1(uuid,uuid,text)
 TO authenticated;
