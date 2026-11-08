# Phase 4 — Financial Stewardship database and security review

> **Implementation update — 8 November 2026:** The original text below records the pre-migration architecture proposal. Ten controlled migrations have since been applied to the isolated Ministry-Registry-Test Supabase project, including the 28th Curia fund-receipt table, guarded payment/receipt/remittance RPCs, immutable-evidence protections and a private bucket. The production database and current demo UI remain unchanged. See [Phase 4 isolated test rollout](financial-stewardship-phase4-test-rollout-2026-11-08.md) for the authoritative current implementation and QA status. Financial go-live remains blocked.


**Design proposal only. No migration, permission change, or test database mutation has been executed.**

## Deliverables

- Schema draft: supabase/proposals/financial_stewardship_phase4_schema.sql
- Candidate read-only RLS: supabase/proposals/financial_stewardship_phase4_read_policies.sql
- Agreed business design: docs/phase-4-self-service-intake-security-architecture.md

These are drafts under Draft PR #58, not runnable production migrations. The schema adds 27 proposed tables prefixed fs_. All 27 start with RLS enabled and without direct browser-client grants. The separate candidate RLS file adds SELECT only; it intentionally adds no INSERT, UPDATE or DELETE for anonymous users, parish coordinators, COWL staff or Curia staff.

## Grounding in existing systems

Read-only metadata inspection of the test and production Supabase projects confirmed that existing registry records use the tables public.members, public.member_ministries, public.recommendation_renewal_batches and public.recommendation_renewal_memberships. The current ministry/parish names are text; the canonical lists are currently maintained in lib/constants.ts.

Production and test table columns are not identical. The proposed fs_ lookups need an explicitly reviewed import and mapping of canonical names to existing member/parish text before any migration. Do not silently normalize, overwrite, delete or backfill existing member registration records. Do not apply the older parish_ministry_renewal_finance.sql draft alongside the new design: choose one migration path and reconciliation strategy.

## Data model by workflow

| Workflow | Proposed tables | Rule |
| --- | --- | --- |
| Parish/ministry lookup | fs_parishes, fs_ministries | Approved canonical vocabulary; explicit legacy text mapping |
| Authorization | fs_staff_grants, fs_parish_contacts | Staff-approved roles, expiry/revocation; max two current coordinator contact slots per parish |
| Renewal intake | fs_renewal_batches, fs_batch_members | One original parish+ministry+year batch, separately linked supplements; existing member_ministries remains authoritative |
| Documents and roster requests | fs_submission_documents, fs_roster_change_requests | Versioned documents; request inactive is not a direct member edit |
| Approved prices and quotes | fs_fee_schedules, fs_payment_requests | Versioned fees, centavo totals and unique internal renewal/payment references |
| QR Ph receiving account | fs_receiving_accounts | Curia-approved organizational beneficiary specifically designated for COWL collections |
| Submitted QR evidence | fs_payment_claims | External transaction reference and screenshot are an unverified payer claim |
| Bank matching | fs_bank_credits, fs_payment_reconciliations | Distinct statement credit, reviewer, evidence, exact matching, no duplicate posting |
| COWL verified collections | fs_collections, fs_collection_allocations | QR and OTC in a common ledger, different proof channels; allocated to real member obligations |
| Receipt stock/custody | fs_receipt_series, fs_receipt_booklets, fs_receipt_numbers, fs_receipt_custody_events | Curia's preprinted serials preserved as text, assigned and acknowledged, with void/missing status |
| Receipt issuance | fs_receipt_issues, fs_receipt_issue_lines | One authorized paper receipt per posted collection, supports multiple paper line items |
| COWL to Curia | fs_remittances, fs_remittance_items, fs_duplicate_copy_handoffs, fs_curia_reviews | Separate second funds movement; cash and original duplicate paper copies independently reconciled |
| Audit | fs_audit_events | Append-only operational event history and accountable actors |

## Two separate real money movements

1. Parish coordinator pays approved QR Ph code to an organizational receiving account designated for COWL collections (or pays COWL OTC).
2. COWL independently verifies the payer-to-COWL funds movement (statement credit or counted OTC funds). Payment may now be marked Paid. COWL issues the exact Curia-preprinted Official Receipt No. using acknowledged booklet stock.
3. COWL groups posted collections and physical duplicate receipt copies into an itemized remittance. Any bank/e-wallet transfer from COWL to Curia has its own distinct external bank reference.
4. Curia independently verifies the COWL-to-Curia money movement and each duplicate paper receipt; records confirmation or discrepancy. COWL Paid status is not the same as Curia remittance confirmed.

The internal renewal reference (example REN-2026-017), original payer bank reference, COWL collection ID, Curia Official Receipt No. (example 057785), COWL remittance ID and transfer reference are six separate identifiers. Never substitute or auto-generate a Curia receipt number from internal IDs. Static QR Ph need not carry an internal renewal reference into a bank statement.

## Proposed read-permission matrix

| Principal | Roster, letters, requests | Payment claims and bank credits | Receipt stock | Curia remittance |
| --- | --- | --- | --- | --- |
| Anonymous / unapproved person | No | No | No | No |
| Approved parish coordinator | Only authorized parish batches; submits requests | Own parish claims/status; **never bank credits** | No write | No treasury detail |
| COWL registry reviewer | Authorized registry reviews and recommendation letters | No bank-credit details | No | No final Curia confirmation |
| COWL finance verifier | Batch/payment status; payment proof only | Actual verified statement credits and reconciliation | Read necessary stock | Can prepare but never Curia-confirm |
| COWL receipt issuer | No roster modifications | Posted collection visibility | Use assigned booklet through audited command | Cannot Curia-confirm |
| COWL remittance preparer | No roster modifications | Posted collection visibility | Issued serials for statement | Submit and hand over only |
| Curia receipt custodian | No roster modifications | No payer screenshot/bank credits | Register and issue physical stock to COWL | Read copy accountability |
| Curia treasury reviewer | No roster modifications | No direct COWL account statement by default | Receipt and duplicate visibility | Independently confirm/dispute |
| Platform provisioner | Explicit technical provisioning only | No automatic finance-collector authority | No automatic receipt-issuer authority | No automatic Curia-confirming authority |

Staff roles and coordinator scope are stored in trusted DB tables. The candidate policies use restricted helper functions in a NON-EXPOSED internal schema and read-time checks against live DB assignments. An email login, a user-editable profile or raw_user_meta_data is never sufficient to authorize finance operations. Do not expose the internal helper schema through the Data API.

RLS grant separation is defense in depth, not an implementation of staff posting. No client write grants or policies are included. All future state changes must go through authenticated, trusted transactions, with fresh role checks, locks and audit events.

## Security and accounting invariants still requiring atomic commands

The schema already proposes FK constraints, positive bigint-centavo amounts, one active coordinator per parish slot 1 or 2, unique printed receipt numbers within an authorized series, unique genuine bank-credit references within account/provider, one verified bank credit per posted collection, and one receipt/collection in a single remittance.

The following are not fully enforced simply by tables and FKs and must be implemented before usage:

1. Coordinator assignment or removal must be trusted and concurrent-safe; a third current contact cannot be granted through another endpoint.
2. A parish batch must reference real member-ministry assignments from the same parish and ministry. Requested inactivation must never bypass registry review.
3. Quotes must use an approved fee-rule version, authorized participants/waivers and exact centavo arithmetic; clients cannot change Paid.
4. QR proof uploads must be matched against a verified actual credit of the approved COWL account. A unique screenshot or transaction reference alone does not prove payment. Fraudulent duplicate claims and provider reference collisions must be held for review.
5. OTC is posted only after an authorized collector counts actual funds.
6. Each official receipt serial must be inside a registered physical booklet, never double-issued, and not usable until COWL acknowledged custody. Booklet-range overlaps are checked under locking, not inferred solely from first/last text.
7. Receipt line sums and actual issued receipt amount must match the corresponding posted collection; multiple line items need clear Curia policy.
8. Payment allocations must sum correctly and belong to the right batch/approved member obligations, with partial/overpayments and reversals explicitly handled.
9. COWL remittance must total eligible posted collections not previously remitted, include their actual issued receipt numbers and account for their physical duplicates.
10. Curia acknowledgment requires a distinct authorized reviewer, genuine received funds, correct remittance amount and verified duplicate copies. Discrepancy is never silently equivalent to confirmation.
11. Audit events and evidence history must be protected against edit/delete, including administrative and server-side pathways; use reversals rather than overwrites.

These transactional operations are intentionally NOT implemented in the present SQL. Without them, the model is NOT production-ready.

## Document storage and financial security

- Recommendation letters, rosters, payment screenshots and account statements must be kept in private, scoped storage. The draft stores metadata and paths only; it does not create the private bucket, object policies, scanning, retention or signed access.
- Approved organizational QR image may be displayed to authorized parish users. Bank statement screenshots and proof uploads must never be public.
- No full bank account numbers, passwords or QR account credentials should be placed in an exposed table. Use server-side secrets where required.
- Use current Supabase Auth, restricted internal functions, RLS and private Storage guidance. A service-role key in the browser is forbidden.
- Staff grant revocation must take effect at sensitive operations even if an older JWT is still valid.

## Required test matrix — NOT YET RUN

| Test scenario | Expected outcome |
| --- | --- |
| Anonymous or unapproved user queries any new finance table | Denied |
| Parish A coordinator opens Parish B batch, documents, payment claim or roster | Denied |
| A third current coordinator is registered for the same parish | Rejected under concurrent requests |
| Parish contact tries to self-approve, mark Paid or issue a receipt | Denied |
| COWL finance reviewer tries to read private recommendation letters unrelated to payment evidence | Denied |
| Screenshot with a reused bank reference is submitted for another renewal | Duplicate/conflict queued; no second payment confirmation |
| One verified bank credit is used to post two payments | Rejected atomically |
| QR proof is uploaded without a matched receiving-account bank credit | Awaiting verification, not Paid |
| OTC cash is properly counted, but not yet remitted to Curia | Paid to COWL, Curia awaiting remittance |
| A receipt number loses its leading zero or is already issued/voided | Rejected |
| COWL tries to use Curia stock without custody acknowledgment | Rejected |
| COWL attempts to remit same collection twice or without physical duplicate | Rejected |
| Curia reviewer tries to confirm own prepared remittance or mismatched funds | Rejected or discrepancy |
| Curia reviewer confirms correct transfer amount and physical duplicates | Independently acknowledged and audited |
| Member renewal is paid but recommendation letter is unapproved | Registration remains pending |
| Two staff try to use the same paper receipt simultaneously | Exactly one posting succeeds |
| Unauthorized Storage object download from another parish | Denied |
| Staff role or parish assignment revoked mid-session | Sensitive operation denied based on current DB authority |

## Proposed implementation sequence

1. Obtain written Curia approval of the organizational account designated for COWL QR Ph collections, legal beneficiary/custody, the handling of QR-paid paper official receipts and duplicate-copy remittances.
2. Review 27-table schema, merge or retire the older competing finance proposal, map canonical parish/ministry names and reconcile differences between test and production.
3. Obtain approval to create a real migration using the project's Supabase CLI workflow, **apply to isolated test only**, and seed lookup values.
4. Test scoped SELECT RLS, private Storage, negative authorization tests and required role provisioning with multiple test identities.
5. Implement and test the atomic operations above; only then connect the existing browser-only COWL/Curia Phase 1–3 prototypes.
6. Pilot coordinator sign-in, roster review, two contacts per parish and recommendation-letter submissions; add QR Ph proof matching and OTC only after treasury authorization.
7. Perform full finance audit, actual bank statement reconciliation, Curia duplicate-receipt handoff, concurrency, mobile UX and rollback/security review before production rollout.

**Current outcome:** two unexecuted SQL proposals plus this security review in Draft PR #58. No real financial collection, database permission, migration, or live portal feature has been enabled.


## Integration map to the current Financial Stewardship prototype

| Existing or planned interface | Existing prototype action | Phase 4 database / trusted operation |
| --- | --- | --- |
| COWL Receipt Inventory | Curia register/assign booklet; COWL acknowledge; note issued/voided/missing | fs_receipt_series, fs_receipt_booklets, fs_receipt_numbers, fs_receipt_custody_events and Curia/COWL role-scoped transactions |
| COWL collection desk | Enter exact Official Receipt No., parish, ministry, fee, actual funds; record a fictional collection | fs_payment_requests, fs_collections, fs_collection_allocations and fs_receipt_issues in reviewed atomic posting steps |
| COWL remittance desk | Select unremitted collections, attest physical duplicate copy handoff | fs_remittances, fs_remittance_items, fs_duplicate_copy_handoffs; a separate transfer bank reference is required |
| Curia reconciliation | Verify counted funds and individual duplicates; confirm or flag discrepancy | fs_curia_reviews plus remittance/copy statuses; separate Curia reviewer authorization |
| Future parish coordinator page | Email-code sign-in, roster, inactivation request, letters, QR Ph proof or OTC choice | fs_parish_contacts, fs_renewal_batches, fs_batch_members, fs_roster_change_requests, fs_submission_documents, fs_payment_claims |
| COWL finance verification queue | Staff verifies QR bank credit or counts OTC cash | fs_bank_credits, fs_payment_reconciliations, fs_collections and staff role grants |
| Parish payment/renewal status | Awaiting payment, proof submitted, Paid, receipt issued, renewal reviewed | Derived authorized status model from separate payment, document, receipt and registry facts; not one mutable all-purpose status |

Existing mock source files:
- components/financial-stewardship/booklet-custody-demo.tsx
- components/financial-stewardship/phase3-financial-demo.tsx
- lib/financial-stewardship-booklet-demo.ts
- app/admin/financial-stewardship-preview/page.tsx
- app/curia/page.tsx

The current browser-only localStorage ledger must **not** be silently repointed to Supabase. Keep the UI read-only or demo until the real transaction API, scoped read models, fully tested RLS, member-privacy filters and a dedicated Curia role system exist. In particular, do not use the old static sample receipt numbers as real stock.

The future coordinator roster screen should receive a **sanitized, parish-scoped read model** of relevant member assignments; the new private finance tables do not themselves make existing public.members or member_ministries queries safe for coordinator access. A reviewed API/SQL view is required before exposing that roster to parish accounts.

**Static cross-file check performed:** 27 proposed tables, 27 RLS-enablement statements, 27 client-grant revocations, 27 matching candidate SELECT policies and 27 matching explicit SELECT grants; no client financial write grants were found. This is structural checking only, **not SQL execution or security testing**.
