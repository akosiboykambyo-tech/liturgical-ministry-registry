-- Phase 2 test-only viewer roles, deliberately NON-TRANSACTIONAL.
-- Adds no account, no staff grant and no financial write privilege.
-- Production rollout must be separately reviewed after appointments.
-- Role codes used for the UI only; operational RPCs must never treat
-- these two viewer codes as finance-verifier/issuer/treasury-authorized.

BEGIN;

ALTER TABLE public.fs_staff_grants
  DROP CONSTRAINT fs_staff_grants_role_code_check;

ALTER TABLE public.fs_staff_grants
  ADD CONSTRAINT fs_staff_grants_role_code_check
  CHECK (role_code IN (
    'cowl_registry_reviewer',
    'cowl_financial_workspace_viewer',
    'curia_financial_workspace_viewer',
    'cowl_finance_verifier',
    'cowl_receipt_issuer',
    'cowl_remittance_preparer',
    'curia_receipt_custodian',
    'curia_treasury_reviewer',
    'platform_provisioner'
  ));

COMMIT;
