-- PR55 ISOLATED STAGING ONLY: allow the admin UI to read guarded
-- import/duplicate review metadata while direct browser writes remain revoked.
DO $preflight$
BEGIN
 IF (SELECT count(*) FROM pg_policies
     WHERE schemaname='public' AND tablename IN ('import_batches','duplicate_flags'))<>0
 OR has_table_privilege('authenticated','public.import_batches','INSERT')
 OR has_table_privilege('authenticated','public.duplicate_flags','INSERT') THEN
   RAISE EXCEPTION 'Unexpected staging import/duplicate privileges or RLS policies';
 END IF;
END $preflight$;

GRANT SELECT ON public.import_batches TO authenticated;
GRANT SELECT ON public.duplicate_flags TO authenticated;
CREATE POLICY pr55_stage_admin_import_batch_read ON public.import_batches
 FOR SELECT TO authenticated USING ((SELECT public.registration_is_admin()));
CREATE POLICY pr55_stage_admin_duplicate_flags_read ON public.duplicate_flags
 FOR SELECT TO authenticated USING ((SELECT public.registration_is_admin()));

DO $verify$
BEGIN
 IF has_table_privilege('authenticated','public.import_batches','INSERT')
 OR has_table_privilege('authenticated','public.import_batches','UPDATE')
 OR has_table_privilege('authenticated','public.duplicate_flags','INSERT')
 OR has_table_privilege('authenticated','public.duplicate_flags','DELETE') THEN
   RAISE EXCEPTION 'Staging direct import or duplicate mutation unexpectedly enabled';
 END IF;
END $verify$;