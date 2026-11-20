-- RC1 emergency rollback only (NOT executed): 2026-11-20
-- Reverts the scoped policies introduced in rc1-system-settings-privacy.CANDIDATE.sql.
-- WARNING: Restores broad public SELECT access (original TEST state).
-- Only use with owner approval if verification functionality cannot recover;
-- restoring public access is a privacy regression, not a normal deployment.

BEGIN;

DROP POLICY IF EXISTS rc1_registry_admin_public_site_settings_update
  ON public.system_settings;
DROP POLICY IF EXISTS rc1_registry_admin_public_site_settings_insert
  ON public.system_settings;
DROP POLICY IF EXISTS rc1_registry_admin_system_settings_select
  ON public.system_settings;
DROP POLICY IF EXISTS rc1_public_site_settings_select
  ON public.system_settings;

-- Original TEST baseline (PR55) retained to make rollback deterministic.
DROP POLICY IF EXISTS pr55_stage_public_read_system_settings
  ON public.system_settings;
CREATE POLICY pr55_stage_public_read_system_settings
  ON public.system_settings FOR SELECT TO anon, authenticated
  USING (true);

COMMIT;
