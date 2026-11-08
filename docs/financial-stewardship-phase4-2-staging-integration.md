# Phase 4.2 — Isolated Financial Stewardship Receipt Custody Staging

**Deployment scope:** GitHub Draft PR #58 and the existing Vercel Preview for `feature/financial-stewardship-preview`, plus Supabase `Ministry-Registry-Test` only. No production database or production credentials were changed. This is not permission to handle real Official Receipt booklets.

## Open staging interfaces

- Curia receipt stock and handover: `/staging/financial-stewardship/curia`
- COWL physical receipt custody: `/staging/financial-stewardship/cowl`
- Both links are also visible in the Phase 2 Receipt Inventory tab of the original Financial Stewardship and Curia demos as **Open secure test inventory**.
- The original Phase 2/3 browser-local sample ledger remains intact, fictional and **not synchronized to the Supabase staging inventory**.

## Authentication isolation

- Uses separate, test-only Supabase client initialized with `NEXT_PUBLIC_FS_STAGING_URL` and `NEXT_PUBLIC_FS_STAGING_PUBLISHABLE_KEY`.
- Both variables are set for **this Git feature branch only** in the Vercel Preview environment. No production environment values were replaced; no test service-role key was added.
- Test Supabase project URL is checked against the exact authorized `Ministry-Registry-Test` domain in the client. If environment variables are absent, the staging page fails closed.
- Auth session uses separate browser storage key `cowl-dok-financial-staging-auth-v1` and does not reuse the main Admin Portal's Supabase session.
- Password sign-in requires an existing approved TEST project account. The signed-in identity must have a current `fs_staff_grants` assignment: **`curia_receipt_custodian` for Curia**, **`cowl_receipt_issuer` for COWL**. A normal administrator is not implicitly privileged.
- Both database RPCs and RLS use current staff grant records, not client role names or user-editable metadata. Anonymous and unapproved users cannot operate financial stock.

**Provisioning dependency:** No test personnel received automatic grants and no test users were created. A trusted test administrator must obtain authorization for **two distinct named test accounts**, confirm both already exist in test Auth, and provision these roles in `fs_staff_grants` with approver identity and audit evidence. The receiving COWL account must not be the Curia assigning officer, even if that user has multiple roles. Never use real officials' passwords or production accounts for this pilot. Revocation/expiry are supported in role records.

## Curia → COWL workflow (database-backed)

1. Curia custodian signs into the **Curia staging route** with their test account. They register a receipt issuing entity and Curia series; the database records actor and audit event.
2. Curia enters the exact first/last printed numbers and booklet reference; attests that the physical range was checked. The backend rejects missing attestation, overlapping series ranges and invalid numbers. All serials are created with original leading zeroes.
3. Curia chooses a **currently authorized COWL receipt custodian** from the test-role-checked directory, physically hands over the booklet and records assignment. A Curia officer cannot assign the booklet to themselves.
4. The assigned COWL custodian signs in through the **COWL staging route**, sees the same booklet and serial inventory, physically verifies it, and acknowledges the handover. The database checks assignment, current COWL role, distinct Curia/COWL handover identities and exact stock count.
5. COWL can report unused printed numbers voided or missing with a physical attestation and a meaningful reason; issued numbers are not accessible through this exception form.
6. Curia and COWL can refresh or refocus the staging page to read the same Supabase test records. No browser-local mock storage is used in the staging routes.

**Official Receipt issuance against a verified collection** is a distinct guarded Phase 4 operation, not a button to issue arbitrary paper numbers on the custody page.

## Files changed

- `lib/financial-stewardship/staging-client.ts` — separate Supabase Auth connection.
- `components/financial-stewardship/staging-receipt-custody.tsx` — shared, role-gated responsive inventory interface using existing `PortalShell`.
- `app/staging/financial-stewardship/curia/page.tsx` and `app/staging/financial-stewardship/cowl/page.tsx` — independently authorized entry points.
- `components/financial-stewardship/booklet-custody-demo.tsx` — link to secure staging without altering demo state.
- `supabase/proposals/financial_stewardship_phase4_staging_inventory_rpc.sql` — protected Curia series registration and authorized COWL directory.
- `supabase/proposals/financial_stewardship_phase4_staging_custody_hardening.sql` — mandatory physical range attestation and two-party custody enforcement.
- `supabase/tests/financial_stewardship_phase4_2_custody_rollback.sql` — rollback-only role/stock/custody regression.

## Verified test results

- Isolated Supabase migrations for staging series/directory and custody hardening applied successfully to `Ministry-Registry-Test`.
- ROLLBACK-only database transaction passed: unauthorized series registration denied; authorized COWL receiver directory returned; unchecked booklet registration rejected; correct serial range enumerated; Curia self-assignment rejected; different COWL custodian acknowledged after Curia assignment.
- The transaction rolls back all fictional roles and stock. **There are still zero genuine/newly seeded financial receipt booklets or paid collections.**
- Vercel Preview compilation and TypeScript checks must be confirmed for the last UI commit. No manual cross-browser/role interactive walkthrough is claimed.

## Remaining before actual live financial use

1. Confirm named **test** Curia and COWL personnel; provision grants in the isolated Auth system and perform a real two-device walkthrough.
2. Confirm Curia's written authorization of the specific COWL receiving arrangement and official receipt-handling procedures.
3. Build and review the verified bank/QR payment and OTC UI adapters; their backend transaction operations are separate from this custody pilot.
4. Complete required scoped file-upload permissions, document verification, fee rules, and broader financial security/concurrency testing.
5. Review migrations and plan explicit production deployment after user/Curia approvals. Draft PR #58 remains unmerged.

**Go-live remains disabled.** The new staging pages do not redirect, rewrite or share data with the production registry.
