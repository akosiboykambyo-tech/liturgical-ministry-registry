-- PR55 ISOLATED STAGING STORAGE PARITY: no production data, file objects
-- or object metadata are copied. Supported SQL bucket creation and RLS policy
-- configuration; never modify storage.objects records directly.
-- The staging member-documents MIME/file-size limits are intentionally retained.
DO $preflight$
BEGIN
 IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='certificate-templates') THEN
   RAISE EXCEPTION 'The certificate bucket already exists; not a fresh staging fixture';
 END IF;
 IF (SELECT count(*) FROM storage.objects)<>0 THEN
   RAISE EXCEPTION 'Expected empty isolated staging Storage before policy migration';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='member-documents' AND public=false) THEN
   RAISE EXCEPTION 'Missing or public private-document bucket';
 END IF;
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects')<>3 THEN
   RAISE EXCEPTION 'Unexpected existing staging Storage policies; review before changes';
 END IF;
 IF (SELECT count(*) FROM registry_private.registration_administrators WHERE active AND revoked_at IS NULL)<>1 THEN
   RAISE EXCEPTION 'Unexpected staging active administrator configuration';
 END IF;
END $preflight$;

-- Production's certificate templates are public static design assets; the
-- staging bucket has no files until test fixtures are created separately.
INSERT INTO storage.buckets (id,name,public,allowed_mime_types,file_size_limit)
VALUES ('certificate-templates','certificate-templates',true,
 ARRAY['image/jpeg','image/png','image/webp','image/svg+xml',
       'font/ttf','font/otf','font/woff','font/woff2']::text[],NULL);

-- Preserve existing policy names, replace the verification/-only prefix
-- restriction with the admin-only scope used by legacy member-document UI.
-- This is safe because authenticated access is checked against the private
-- ACTIVE administrator grant for every query.
ALTER POLICY pr55_staging_letter_read ON storage.objects
 TO authenticated USING (
  bucket_id='member-documents' AND (SELECT public.registration_is_admin()));
ALTER POLICY pr55_staging_letter_insert ON storage.objects
 TO authenticated WITH CHECK (
  bucket_id='member-documents' AND (SELECT public.registration_is_admin()));
ALTER POLICY pr55_staging_letter_delete ON storage.objects
 TO authenticated USING (
  bucket_id='member-documents' AND (SELECT public.registration_is_admin()));

CREATE POLICY pr55_stage_member_documents_update ON storage.objects
 FOR UPDATE TO authenticated
 USING (bucket_id='member-documents' AND (SELECT public.registration_is_admin()))
 WITH CHECK (bucket_id='member-documents' AND (SELECT public.registration_is_admin()));

CREATE POLICY pr55_stage_certificate_select ON storage.objects
 FOR SELECT TO authenticated
 USING (bucket_id='certificate-templates' AND (SELECT public.registration_is_admin()));
CREATE POLICY pr55_stage_certificate_insert ON storage.objects
 FOR INSERT TO authenticated
 WITH CHECK (bucket_id='certificate-templates' AND (SELECT public.registration_is_admin()));
CREATE POLICY pr55_stage_certificate_update ON storage.objects
 FOR UPDATE TO authenticated
 USING (bucket_id='certificate-templates' AND (SELECT public.registration_is_admin()))
 WITH CHECK (bucket_id='certificate-templates' AND (SELECT public.registration_is_admin()));
CREATE POLICY pr55_stage_certificate_delete ON storage.objects
 FOR DELETE TO authenticated
 USING (bucket_id='certificate-templates' AND (SELECT public.registration_is_admin()));

DO $post$
BEGIN
 IF (SELECT count(*) FROM storage.buckets WHERE id IN ('member-documents','certificate-templates'))<>2
    OR (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects')<>8
    OR EXISTS(SELECT 1 FROM storage.buckets WHERE id='member-documents' AND public=true)
    OR (SELECT count(*) FROM storage.objects)<>0 THEN
   RAISE EXCEPTION 'Staging Storage bucket/policy safety verification failed';
 END IF;
END $post$;
