-- COWL-DOK Financial Stewardship Phase 2 — MINIMAL role-only schema proposal.
-- Do NOT run in production until the access review and staff authorizations
-- are approved. This creates no collections, receipt, bank or remittance data.
-- Existing registry tables and registry_private administration are unchanged.
--
-- Production migration should be generated via Supabase CLI and reviewed.
-- The fields/role vocabulary match the isolated financial staging model.

BEGIN;

CREATE TABLE IF NOT EXISTS public.fs_staff_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role_code text NOT NULL CHECK (role_code = ANY(ARRAY[
    'cowl_registry_reviewer','cowl_finance_verifier',
    'cowl_receipt_issuer','cowl_remittance_preparer',
    'curia_receipt_custodian','curia_treasury_reviewer',
    'platform_provisioner'
  ])),
  granted_by uuid REFERENCES auth.users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id),
  provisioning_method text NOT NULL DEFAULT 'staff_approved'
    CHECK (provisioning_method = 'staff_approved'),
  authorization_reference text,
  CONSTRAINT fs_staff_grants_expiry_ck CHECK (expires_at IS NULL OR expires_at > granted_at),
  CONSTRAINT fs_staff_grants_revocation_ck CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CONSTRAINT fs_staff_grants_provenance_ck CHECK (
    granted_by IS NOT NULL AND NULLIF(btrim(authorization_reference), '') IS NOT NULL
  )
);

-- One non-revoked grant per user and role. Revoking retains history.
CREATE UNIQUE INDEX IF NOT EXISTS fs_staff_grants_current_user_role
  ON public.fs_staff_grants(user_id, role_code) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS fs_staff_grants_user_lookup
  ON public.fs_staff_grants(user_id);

ALTER TABLE public.fs_staff_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fs_staff_grants FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.fs_staff_grants TO authenticated;

-- Read only one's own grant metadata; grants may only be provisioned/revoked
-- through an approved, audited administrative process outside browser clients.
CREATE POLICY fs_staff_grants_self_read ON public.fs_staff_grants
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- No INSERT/UPDATE/DELETE policies, no exposed SECURITY DEFINER helpers,
-- no privileges for anon, and no broad admin access by email or user_metadata.

COMMIT;
