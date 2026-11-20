-- Applied to Ministry-Registry-Test ONLY after identifying that
-- its PR55 staging ACLs permitted SELECT but blocked certificate template
-- and signatory writes. A certificate-templates Storage upload could succeed
-- while saving the matching system_settings record failed.
--
-- No Production role/grant/policy changes and no member data changes.
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signatories ENABLE ROW LEVEL SECURITY;

GRANT INSERT, UPDATE, DELETE ON TABLE public.system_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.signatories TO authenticated;

CREATE POLICY pr79_test_certificate_settings_insert
 ON public.system_settings FOR INSERT TO authenticated
 WITH CHECK (
   (key LIKE 'certificate_template%' OR key LIKE 'sig_layout_%')
   AND (SELECT public.registration_is_admin())
 );
CREATE POLICY pr79_test_certificate_settings_update
 ON public.system_settings FOR UPDATE TO authenticated
 USING (
   (key LIKE 'certificate_template%' OR key LIKE 'sig_layout_%')
   AND (SELECT public.registration_is_admin())
 )
 WITH CHECK (
   (key LIKE 'certificate_template%' OR key LIKE 'sig_layout_%')
   AND (SELECT public.registration_is_admin())
 );
CREATE POLICY pr79_test_certificate_settings_delete
 ON public.system_settings FOR DELETE TO authenticated
 USING (
   (key LIKE 'certificate_template%' OR key LIKE 'sig_layout_%')
   AND (SELECT public.registration_is_admin())
 );
CREATE POLICY pr79_test_signatories_insert
 ON public.signatories FOR INSERT TO authenticated
 WITH CHECK ((SELECT public.registration_is_admin()));
CREATE POLICY pr79_test_signatories_update
 ON public.signatories FOR UPDATE TO authenticated
 USING ((SELECT public.registration_is_admin()))
 WITH CHECK ((SELECT public.registration_is_admin()));
CREATE POLICY pr79_test_signatories_delete
 ON public.signatories FOR DELETE TO authenticated
 USING ((SELECT public.registration_is_admin()));
