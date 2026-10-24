-- PR #54 DRAFT ONLY. DO NOT RUN ON PRODUCTION UNTIL SCHEMA, ROLES,
-- ownership, PostgREST exposure and revocation process are reviewed.
-- This migration adds a private allowlist and a self-check RPC. It does
-- not change existing members or their authorization policies.
BEGIN;
CREATE SCHEMA IF NOT EXISTS registry_private;
REVOKE ALL ON SCHEMA registry_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS registry_private.registration_administrators (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT false,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT registration_admin_active_consistency
    CHECK (NOT active OR revoked_at IS NULL)
);
REVOKE ALL ON TABLE registry_private.registration_administrators FROM PUBLIC, anon, authenticated;
ALTER TABLE registry_private.registration_administrators ENABLE ROW LEVEL SECURITY;
-- No client-side table policies. The function's owner must be a trusted
-- privileged DB role with sufficient rights to inspect the private table.
CREATE OR REPLACE FUNCTION public.registration_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM registry_private.registration_administrators a
    WHERE a.user_id = (SELECT auth.uid())
      AND a.active = true
      AND a.revoked_at IS NULL
  );
$fn$;
REVOKE ALL ON FUNCTION public.registration_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registration_is_admin() TO authenticated;
COMMIT;

-- IMPORTANT: do not seed administrator IDs automatically; an authorized
-- operator must separately grant access after reviewing real identities.
-- No registration write RPC is provided by this migration.
