-- COWL-DOK Stage 4C: PROPOSAL ONLY; intentionally NOT in migrations.
-- Do not execute until actual deployed system_settings keys/values are classified
-- and public certificate templates are confirmed safe to expose.
--
-- Offline V3 had zero settings rows. The deployed settings inventory was not
-- inspected and MUST NOT be inferred from that empty clone.
--
-- Expected public reads in the current website:
--   public_marquee       components/registry-header.tsx
--   public_maintenance   components/public-maintenance-gate.tsx
--   certificate_template% app/verify/page.tsx and certificate rendering
-- Administrator pages need complete settings visibility.
--
-- Proposed policy pattern only (requires signed-off key classification):
BEGIN;

DO $stage4c_settings_preflight$
BEGIN
  IF to_regclass('public.system_settings') IS NULL
     OR to_regprocedure('public.registration_is_admin()') IS NULL
     OR NOT EXISTS (
         SELECT 1 FROM pg_class
         WHERE oid = to_regclass('public.system_settings')
           AND relrowsecurity
       )
  THEN
    RAISE EXCEPTION 'Cannot replace settings policy without verified schema and RLS';
  END IF;
END;
$stage4c_settings_preflight$;

DROP POLICY IF EXISTS pr55_stage_public_read_system_settings
  ON public.system_settings;

CREATE POLICY pr55_stage_public_read_system_settings
ON public.system_settings
FOR SELECT
TO anon, authenticated
USING (
  key IN ('public_marquee', 'public_maintenance')
  OR key LIKE 'certificate_template%'
  OR (SELECT public.registration_is_admin())
);

COMMIT;

-- STOP: do NOT promote this file into migrations before reviewers confirm:
-- (1) certificate_template value fields are intended for public release;
-- (2) all other public-setting consumers are accounted for;
-- (3) administrators can read all required keys;
-- (4) an isolated-clone behavioral test passes using fictional values.
