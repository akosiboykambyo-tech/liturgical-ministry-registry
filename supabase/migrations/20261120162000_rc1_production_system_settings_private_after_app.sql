-- COWL-DOK RC1 post-application PRIVACY step (PRODUCTION only).
-- Project ID: zlvofcwnpdzfdnipvbbd
-- Do NOT apply before the deployed /api/verify/certificate-design endpoint is
-- verified against Production. That endpoint securely publishes only the
-- active certificate design; anonymous clients must not need settings table access.
-- No row data is changed by this migration.
--
-- Before: PROD legacy anon policy exposed every settings row (12/12 in read-only
-- observation); 3 separate full-access fixed-email admin policies.
-- After: anonymous / authenticated public readers see ONLY two explicit
-- site display flags. Verified Registry Administrators retain CRUD for all
-- settings through public.registration_is_admin() (private allowlist).
-- No direct JWT-email authorization remains.
--
-- Roll forward is preferred on public certificate regression. Old public direct
-- settings reads are PRIVACY-UNSAFE; never restore USING(true) automatically.

DO $preflight$
DECLARE v_policy_count int;
BEGIN
 IF to_regclass('public.system_settings') IS NULL
 OR to_regprocedure('public.registration_is_admin()') IS NULL
 OR NOT EXISTS (SELECT 1 FROM pg_class c
   WHERE c.oid='public.system_settings'::regclass AND c.relrowsecurity)
 THEN RAISE EXCEPTION 'RC1 privacy: RLS or admin authorization missing'; END IF;
 SELECT count(*) INTO v_policy_count FROM pg_policies
 WHERE schemaname='public' AND tablename='system_settings'
 AND policyname IN (
   'Allow admin full access to system settings',
   'Allow public to read system settings',
   'admin_delete_settings','admin_full_access_system_settings');
 IF v_policy_count <> 4 OR EXISTS (
   SELECT 1 FROM pg_policies
   WHERE schemaname='public' AND tablename='system_settings'
   AND policyname NOT IN (
     'Allow admin full access to system settings',
     'Allow public to read system settings',
     'admin_delete_settings','admin_full_access_system_settings')
 ) THEN RAISE EXCEPTION 'RC1 privacy: production policy inventory changed'; END IF;
END
$preflight$;

DROP POLICY "Allow admin full access to system settings" ON public.system_settings;
DROP POLICY "Allow public to read system settings" ON public.system_settings;
DROP POLICY "admin_delete_settings" ON public.system_settings;
DROP POLICY "admin_full_access_system_settings" ON public.system_settings;

CREATE POLICY rc1_prod_public_site_settings_select
ON public.system_settings
FOR SELECT TO anon, authenticated
USING (key::text IN ('public_marquee','public_maintenance'));

CREATE POLICY rc1_prod_registry_admin_settings_all
ON public.system_settings
FOR ALL TO authenticated
USING ((SELECT public.registration_is_admin()))
WITH CHECK ((SELECT public.registration_is_admin()));

DO $postflight$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_policies
   WHERE schemaname='public' AND tablename='system_settings'
   AND policyname='Allow public to read system settings')
 OR (SELECT count(*) FROM pg_policies WHERE schemaname='public'
   AND tablename='system_settings')<>2
 THEN RAISE EXCEPTION 'RC1 privacy: legacy public exposure or policy count remains'; END IF;
END
$postflight$;
