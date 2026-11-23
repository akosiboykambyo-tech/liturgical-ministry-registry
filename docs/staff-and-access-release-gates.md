# COWL-DOK - Staff and Access: controlled release plan

Status: DRAFT / NOT RELEASE-APPROVED. No Production deployment or Supabase migration is authorized by this branch.

## Design and navigation
- Parent: System Management (/admin/administration), alongside Audit Trail and Public Website Settings.
- Child: Staff and Access (/admin/staff-access). Parent sidebar remains active.
- Existing UI tokens retained: crimson #890022, off-white #FBF9F9, border #E6DADC, EB Garamond headings, Inter body text, Phosphor Light icons.
- Input labels, 44px touch controls, visible focus states, accessible error and status messaging, confirmation before role changes, phone-ready layout and horizontally scrollable directory.
- Only real authorized data is displayed. Never show synthetic identities on Production.

## Exact allowed roles
- registry_administrator: Registry operations under existing RLS/RPC security.
- cowl_financial_workspace_viewer: COWL Financial Administrator (read-only).
- curia_financial_workspace_viewer: Curia Financial Administrator (read-only).

All other financial, payment and provisioning roles are deliberately excluded from the UI.

## Independent authorization checks
Each provisioning request requires BOTH:
1. An active Registry Administrator entry in registry_private.registration_administrators.
2. An active, unexpired, unrevoked platform_provisioner grant in public.fs_staff_grants.

The Next.js server checks a verified Supabase Auth token and the two grants in a JWT-scoped session; proposed database functions independently recheck both grants before privileged actions. The service_role key stays server-only. No email address or user_metadata claim is accepted for authorization.

STAFF_ACCESS_MUTATIONS_ENABLED is unset/false by default; all POST requests reject until an explicitly approved release. GET also fails closed unless the database migration and authorized provisioner are present.

## Isolated TEST acceptance before Production
1. Use a disposable, production-shaped, network-isolated clone. Do not change existing TEST or PROD during review.
2. Independently review docs/sql/staff-access-provisioning.REVIEW-ONLY.sql against current table constraints, permissions, indexes, and function ownership. Run it only in the disposable clone after approval.
3. Confirm all three RPC functions' EXECUTE permissions exclude anon and authenticated and are limited to service_role; check private audit events cannot be queried from Data API.
4. Approve a real provisioner who is already an active Registry Administrator, with a separate audited platform_provisioner grant. Preserve approved granted_by and authorization_reference provenance.
5. Configure and validate Supabase branded invitation/recovery templates, custom SMTP with verified Resend sender, and redirect/callback URLs. Supabase default email is limited to authorized team recipients, not arbitrary production invites.
6. Verify server-only SUPABASE_SERVICE_ROLE_KEY is available in the intended environment; never print it or expose it via NEXT_PUBLIC.
7. Test complete invitation, token verification, password setup, login, correct Registry/COWL/Curia access, grant and revoke; also expired links, stale JWT, unauthorized viewer, no role, wrong origin, invalid request, DB outage, SMTP failure, duplicate invite and concurrent requests.
8. Test last-active-Registry-admin protection, self-change denial, audit immutability, token/session termination procedures, real browser keyboard/focus and mobile/tablet/desktop QA.
9. After security and owner sign-off on an exact commit and reviewed migration, record a fresh encrypted recovery point and an approved change window. Only then deploy and explicitly enable STAFF_ACCESS_MUTATIONS_ENABLED=true.

## Deliberate partial invitation behavior
Supabase inviteUserByEmail and a role-grant RPC are not one transaction.
- If an invitation creates a user but the grant fails, the user remains unassigned and cannot access Registry or Finance.
- The operator must inspect the existing account and explicitly assign the role after resolving the issue; never blindly send another invitation.
- A successful API response means only that invitation was requested and role assigned, not that email was delivered or link accepted.
- Do not delete user accounts merely to retry; audit and financial references may depend on their Auth IDs.
- Revoking roles blocks new live authorization checks, but separately terminate sessions and account for token expiry when offboarding.

## Negative acceptance matrix
| Case | Required result |
| --- | --- |
| No/invalid token | 401 |
| Finance viewer without Registry admin authorization | 403 |
| Registry admin without separate provisioner grant | 403 |
| Expired/revoked provisioner grant | 403 |
| Auth or permission database outage | 503 and no side effects |
| Mutations feature flag disabled | All POST changes blocked |
| Foreign Origin header | 403 |
| Invalid role, ID or approval reason | 400 |
| Actor changes own roles | Rejected |
| Revoke only active Registry Administrator | Rejected atomically |
| Duplicate active grant / stale revocation | Rejected |
| Invite succeeds but grant fails | Explicit partial failure, user remains unassigned |

## Decisions and open questions
- Settled: nested Staff and Access within System Management.
- Settled: only Registry Administrator, COWL Financial Viewer and Curia Financial Viewer are grantable.
- Proposed: dual independent gate with platform_provisioner role.
- Pending: function SQL/permissions validation, initial provisioner authorization, Resend SMTP, directory scale >2,000 users, exact-SHA QA, and management security sign-off.

This branch makes no changes to existing Production or TEST data.
