-- RC1 proposal only (NOT executed): 2026-11-20
-- APPLY ONLY AFTER the /api/verify/certificate-design endpoint is deployed,
-- verified against the target Supabase project, and the owner approves rollback.
-- Staged public certificate verification previously read certificate_template_*
-- and sig_layout_* rows directly; do not apply before deploying updated app.
--
-- Public website functionality uses public_marquee and public_maintenance.
-- Registry admins retain access to all settings and admin-only writes.
-- Existing PR79 certificate/signature INSERT/UPDATE/DELETE RLS remains intact.
--
-- Risk: publication of the default certificate design intentionally persists
-- through the fixed server endpoint. Classify signatory imagery separately.

BEGIN;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pr55_stage_public_read_system_settings
  ON public.system_settings;

DROP POLICY IF EXISTS rc1_public_site_settings_select
  ON public.system_settings;
CREATE POLICY rc1_public_site_settings_select
  ON public.system_settings FOR SELECT TO anon, authenticated
  USING (key IN ('public_marquee', 'public_maintenance'));

DROP POLICY IF EXISTS rc1_registry_admin_system_settings_select
  ON public.system_settings;
CREATE POLICY rc1_registry_admin_system_settings_select
  ON public.system_settings FOR SELECT TO authenticated
  USING ((SELECT public.registration_is_admin()));

-- The Public Website settings editor upserts these two keys. The previous
-- PR79 write policies authorize only certificate_template* and sig_layout_*.
DROP POLICY IF EXISTS rc1_registry_admin_public_site_settings_insert
  ON public.system_settings;
CREATE POLICY rc1_registry_admin_public_site_settings_insert
  ON public.system_settings FOR INSERT TO authenticated
  WITH CHECK (
    key IN ('public_marquee', 'public_maintenance')
    AND (SELECT public.registration_is_admin())
  );

DROP POLICY IF EXISTS rc1_registry_admin_public_site_settings_update
  ON public.system_settings;
CREATE POLICY rc1_registry_admin_public_site_settings_update
  ON public.system_settings FOR UPDATE TO authenticated
  USING (
    key IN ('public_marquee', 'public_maintenance')
    AND (SELECT public.registration_is_admin())
  )
  WITH CHECK (
    key IN ('public_marquee', 'public_maintenance')
    AND (SELECT public.registration_is_admin())
  );

COMMIT;

-- Acceptance, run in TEST after an approved apply:
-- 1. anon: system_settings returns only public_marquee/public_maintenance.
-- 2. no-grant/COWL/Curia/revoked: same restricted settings rows.
-- 3. Registry admin: certificate_template* and sig_layout_* still accessible.
-- 4. Public /verify uses /api/verify/certificate-design and renders a
--    representative certificate with expected default template/signatories.
-- 5. Admin Public Website editor can upsert both public keys.
-- 6. Certificate Studio can still edit default/nondefault templates.
-- 7. Public and authenticated client calls cannot list draft templates.
