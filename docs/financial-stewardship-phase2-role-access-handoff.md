# Financial Stewardship — Phase 2 role-based access handoff

**Status:** Phase 2 role-gated code remains a draft PR and is NOT deployed. The **empty role-grant foundation was installed in production on November 10, 2026**, without any staff appointments or financial transaction tables.
**Source of truth:** the live, active rows of \`public.fs_staff_grants\`, matching the existing isolated-test financial model.
**Scope:** One existing Supabase sign-in; different COWL and Curia read-only pages and navigation. All financial operations stay DISABLED.

## What is implemented

- The existing \`/admin\` sign-in first checks \`registration_is_admin()\`, preserving authorized registry access.
- Users with no registry grant are routed according to independently verified COWL or Curia staff grants; users with both finance workspaces receive a selector.
- Registry administrators do **not** inherit financial privileges. \`platform_provisioner\` alone is not an issuer, verifier, or treasury reviewer.
- All financial pages request a fresh server check using the existing Supabase access token. The API validates the user via \`getUser(token)\`, then reads only that user's own active, non-revoked, non-expired \`fs_staff_grants\` with RLS.
- The financial sidebar shows only permitted sections. The COWL portal and Curia portal have distinct URLs and section permissions.
- Unassigned or revoked accounts receive a deny page. Role lookup failure is a service error, never a grant.
- Existing admin sidebar hover/pin/mobile behavior and the Financial Stewardship visual system are preserved. No financial writes or test credentials are imported.

### View-permission matrix (NOT transaction permissions)

| Grant | COWL inventory | COWL collections | COWL remittances | Curia inventory | Curia remittances |
| --- | --- | --- | --- | --- | --- |
| cowl_registry_reviewer | — | — | — | — | — |
| cowl_finance_verifier | — | View | — | — | — |
| cowl_receipt_issuer | View | View | — | — | — |
| cowl_remittance_preparer | — | View | View | — | — |
| curia_receipt_custodian | — | — | — | View | View |
| curia_treasury_reviewer | — | — | — | — | View |
| platform_provisioner | — | — | — | — | — |

A role's ability to view a section is NOT permission to confirm a collection, issue an Official Receipt, or acknowledge a remittance. Future operations must each check the role, current grant, business-state transitions and dual-control rules again at the server/database layer.

## Production enablement requirements — deliberately incomplete

1. **Authorize named staff appointments.** Determine who holds each COWL and Curia role, who can appoint/revoke them, and the written authorization reference. Do not assume existing registry administrators are finance personnel.
2. **Role-only migration installed and verified.** The empty production table was applied as migration `20261110010332_finance_role_grants_readonly_foundation`; the tracked source now exists at `supabase/migrations/20261110010332_finance_role_grants_readonly_foundation.sql`. Five minimally required read columns and self-only RLS were verified. No-grant access shows zero rows; authenticated browser writes and anonymous reads are not granted. Do NOT copy the staging transaction tables to production.
3. **Provision grants using a trusted audited process.** No browser, general registry administrator, or user-editable metadata may create grants. The grant is tied to the actual production Supabase Auth user ID. No new generic role is inferred from email.
4. **Test registry/finance isolation.** Ensure finance-only identities cannot read/write member data or use registry operational RPCs; current registry RLS checks \`registry_private.registration_administrators\`.
5. **Validate the live sign-in/forgot-password/reset flow and each permitted/denied URL** including no role, expired/revoked, COWL-only, Curia-only, both and network failure. Verify mobile and keyboard sidebar behavior.
6. **Only then release the role-gated code.** Without a role table and approved grants, existing Financial Stewardship Phase 1 read-only access would become unavailable. This branch must NOT be promoted ahead of the role provisioning and tests.
7. **Financial transactions remain off.** Collection, official receipt inventory writes and Curia confirmations still require their separate operational migration, security review and approval.

## Verified November 10, 2026

- Production: `public.fs_staff_grants` exists with **0 grants**, RLS enabled and one self-only SELECT policy. Anonymous SELECT denied; authenticated INSERT, UPDATE and DELETE denied. The `authenticated` role can select only the five needed columns (`user_id`, `role_code`, `granted_at`, `expires_at`, `revoked_at`).
- Staging: a read-only SQL transaction simulated one finance user and verified that grants belonging to other users are invisible, with no browser INSERT privilege. Two staging test grants were **not** copied to production.
- Preview builds: `npm run build` runs authorization tests automatically. **Nine tests passed, zero failed** after adding grant lifecycle checks for future, revoked, expired, malformed and unknown roles.
- Authenticated end-to-end browser testing and actual approved staff-grant provisioning remain pending.

## Test coverage

- Pure role matrix regression test: \`node --test tests/financial-access-model.test.cjs\`.
- Latest Vercel preview build/type check on this branch.
- Security validation of actual DB policies and role-revocation behavior must be performed in an isolated or protected environment before promoting to production.

**Rollback:** Keep the current Phase 1 production deployment available. Rolling back the role UI must not remove grants or alter financial records. There are no financial records in production under this Phase 2 branch.
