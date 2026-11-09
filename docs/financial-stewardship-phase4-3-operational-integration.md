# Phase 4.3 — Operational Financial Stewardship and Curia staging

Status: IMPLEMENTED on Draft PR #58 and the isolated Ministry-Registry-Test Supabase project. Not merged, not connected to production, not authorized for real financial operations.

## Entry points on feature preview

- COWL Financial Stewardship: /admin/financial-stewardship
- Backwards-compatible COWL route: /admin/financial-stewardship-preview
- Curia Portal: /curia
- Isolated direct routes: /staging/financial-stewardship/cowl and /staging/financial-stewardship/curia

The old COWL/Curia browser-local demonstration pages were preserved as separate legacy components. On the feature Preview only, the original page routes switch to the test-project financial Auth and the shared Supabase ledger. The compact burgundy navigation, mobile drawer and styling remain. Production retains the old pages because it has no feature-branch test environment values.

## Operational sections

Receipt Inventory: Curia custodian registers actual preprinted test series and physically checked booklets, transfers to an assigned COWL custodian; COWL independently acknowledges custody and can report unused void/missing numbers from its own assigned booklet. Preprinted numbers remain exact text including zero prefixes.

Collections & Receipts: COWL finance verifier can post physically counted OTC funds only against an authorized payment request. The ledger shows verified QR/OTC collections and actual receipt issues, not synthetic sample totals. A COWL receipt issuer can issue the exact preprinted serial only against an existing posted collection from the assigned, acknowledged booklet, with printed payer/ministry details and validated paper line items. Bank/QR posting is intentionally BLOCKED pending Curia-approved beneficiary and authenticated bank evidence intake.

Remittances & Curia: COWL remittance preparer can select only posted collections with issued receipts, attest duplicate-paper handoff and identify the second COWL-to-Curia funds transfer. Curia treasury reviewer can independently inspect physical duplicates, record actually counted cash received at Curia and confirm or document discrepancies. Bank-transfer confirmation stays BLOCKED until authenticated Curia statement evidence intake exists.

## Role boundaries

The two user-designated test logins retain ONLY their original custody roles: one COWL receipt issuer and one Curia receipt custodian. No finance verifier, COWL remittance preparer or Curia treasury reviewer grants were added. Custody roles cannot gain treasury permissions from the UI or editable metadata; the test database checks each current staff grant before RPC execution. The financial staging Supabase Auth session and branch-scoped public test project credentials are independent from production registry Auth.

## Changes

- components/financial-stewardship/staging-financial-operations.tsx — read-only ledger and guarded staff action forms.
- components/financial-stewardship/staging-receipt-custody.tsx — three-section, role-gated shared workspace; rechecks grants on focus.
- app/curia/page.tsx — operational staging on feature Preview; legacy production fallback.
- app/admin/financial-stewardship-preview/page.tsx — same staging switch.
- app/admin/financial-stewardship/page.tsx — canonical route.
- app/admin/layout.tsx — only the feature-preview financial pages bypass production registry Admin Auth in favor of separate test Auth; other admin routes unchanged.
- components/financial-stewardship/legacy-curia-demo.tsx and legacy-financial-stewardship-demo.tsx — old demo preserved.
- supabase/proposals/financial_stewardship_phase4_3_assigned_receipt_issuer_guard.sql — test-only migration restricting paper receipt issue and voiding to the actually assigned custodian.
- supabase/tests/financial_stewardship_phase4_3_assigned_stock_rollback.sql — auditable rollback test.

## Verification

- The previously committed rollback-only complete QR-payment → paper-receipt → COWL remittance → Curia confirmation database suite passed again.
- New rollback-only assignee test passed: Curia registration, assigned COWL acknowledgment, another authorized COWL user rejected when flagging assigned stock.
- Two current test identities passed role-isolation checks: COWL cannot post OTC without finance grant, Curia custodian cannot acknowledge COWL stock or confirm treasury remittance.
- Supabase security advisor reports no missing RLS policies for new financial tables. Older registry RPC and Auth password advisories remain separate issues.
- The branch Vercel build and TypeScript checks passed on preceding components; verify the final commit deployment state before citing the preview URL.
- All synthetic test transactions were rolled back, with no real financial accounts or preprinted inventory seeded.

## Production activation remains blocked

The following remain required: formal Curia authorization of account, fee schedule, paper receipt and remittance rules; additional separately approved finance and treasury roles; quote/payment evidence intake and private Storage controls; actual statement reconciliation on both sides; detailed allocation/reversal/concurrency testing; real two-device signed-in acceptance testing; reviewed migration and explicit production release approval.

A verified COWL collection is not the same thing as Curia remittance confirmation, and neither automatically approves a minister's registration. The real Financial Stewardship pages are operational **in isolated staging only**.
