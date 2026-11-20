# Financial Stewardship Phase 2 — isolated test personas

**Testing only. No permanent appointment, no live financial operation, no registry edit privilege.**

These personas represent two temporary financial workspace administrators. Their actual test emails, names, passwords, and invitation tokens are deliberately not placed in the repository.

| Persona | Responsibility | Staging role | Financial interface |
| --- | --- | --- | --- |
| COWL test administrator | COWL administrator and financial staff | cowl_financial_workspace_viewer | All three COWL sections, read-only |
| Curia test administrator | Curia personnel and administrator | curia_financial_workspace_viewer | Curia receipt inventory and remittances, read-only |

Both roles have no expiry date during testing, as requested; revoke temporary grants after testing. A blank expiry does not make a test identity a permanent diocesan appointment.

Viewer grants do not imply payment verification, COWL receipt issuance, remittance posting, Curia treasury confirmation, or registry editing. Those are separately approved roles and operations.

## Test account invitations — single manual action

The connected Supabase management tools do not provide an Auth user invitation operation. Do not insert manually into auth.users; use Supabase Dashboard > isolated Ministry-Registry-Test project > Authentication > Users > Invite user. Invite the two privately supplied addresses together. Recipients accept the email links, set credentials using the supported invite/recovery flow, and should never share passwords, OTPs or invitation links.

After both identities exist, the trusted test-project operator can assign the viewer role to each exact auth user, with provisioning_method = operator_authorized_test, a written test authorization reference, and expires_at = NULL. Do not assign any transaction-capable grant.

## Acceptance tests

- COWL viewer: all COWL financial sections, no Curia sections or registry member-edit access.
- Curia viewer: Curia receipt custody and remittance views, no COWL sections or registry member-edit access.
- Existing Registry-only administrator: no automatic finance grant.
- Unknown, expired, revoked and future-dated grants: denied.
- Neither account can verify payments, issue official receipts, create remittances or confirm Curia receipt.
- Retain an isolated test environment; no production financial transactions are permitted.

## Environment warning

Draft PR #69 currently uses the live Registry Supabase configuration in its generic Vercel preview. Accounts invited to Ministry-Registry-Test cannot sign in to that preview without an independently configured staging-only QA deployment. Never mix the staging public key with the production service-role secret. Do not put test email addresses or credentials into GitHub or Vercel configuration.

The role-code extension has been applied ONLY to the isolated test database. Production has zero approved grants, and the Phase 1 site stays unchanged.
