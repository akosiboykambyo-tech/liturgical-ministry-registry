# Phase 4 architecture decision — future parish self-submission and payments

**Status:** Design proposal only. No SQL migration, RLS policy, authentication role, payment provider, production page, official receipt or financial database write has been implemented by this document.

## Purpose and authoritative boundaries

Design the future parish self-service submission portal **now**, so Phase 4 database and authorization architecture does not couple all intake to COWL administrators. Public self-submission is **not self-approval**, and uploading a payment screenshot does **not** constitute verified payment.

Keep four independent evidence/trust boundaries:

1. **Parish submission** — untrusted applicant-provided member roster, recommendation letter and possible proof of payment.
2. **Registry review** — authorized COWL review of parish/ministry/member roster, signed recommendation and renewal or registration decision.
3. **Financial collection** — independently verified funds received by the authorized destination, including allocations, actual preprinted Curia receipt identifier and officer/custody.
4. **Curia confirmation** — if COWL later physically remits funds, Curia independently reconciles cash, physical duplicate receipts and accounting details.

A payment transaction must never automatically renew, validate or approve a minister. A reviewed recommendation letter must not automatically mark money collected. The Diocese/Curia remains authority for its preprinted receipt series.

## Recommended user journey

### Parish representative (future /parish/submissions)

1. Authenticate using verified email/OTP; obtain **explicit, staff-approved** authorization to act for a specific parish and, where required, ministry.
2. Start a draft for a **parish + ministry + service year**, with `original` or a linked `supplemental` batch. Use existing registry parish and ministry identifiers, not free-form naming.
3. Add roster/members or upload a CSV for matching against authorized `member_ministries`; unmatched, duplicate or ambiguous names enter existing review, never silently create or renew member records.
4. Upload one **parish-authorized recommendation letter** covering the appropriate batch; preserve document versions, signer/issuer details and review status. Do not copy the same PDF into every member row.
5. Review the amount **quoted** from an approved, versioned diocesan fee schedule, including documented exemptions/adjustments. A quote is not money received.
6. Choose the payment method allowed for the applicable year: (a) existing offline COWL handover; (b) bank/diocesan transfer with external payment evidence; or eventually (c) online gateway checkout. Do not promise online payment capability until Curia approves destination accounts and official receipt/document procedures.
7. Submit the draft. Receive an internal **submission reference** and status tracker; never receive an invented official receipt serial. A successful upload or checkout redirect is not evidence of payment approval.
8. Respond to reviewer requests through a revision/resubmission event. Finalized submissions are not silently edited.

### COWL reviewer and finance operations

- Registry reviewer: verify representative authority, recommendation letter, ministry roster, assignments and signature; approve/hold/reject with notes and event history.
- Finance receiver: independently validate external transfer or cash evidence against actual funds; create a **posted collection** and assign a real, available preprinted official receipt, only if authorized Curia policy permits that action.
- Do not permit the submitter to set `received_by`, `approved_by`, `paid`, `official_receipt_number` or `curia_confirmed` fields. Enforce those actions on the server and in database privileges.
- Curia treasury: separately reconcile COWL-submitted remittance funds and receipt duplicates, or reconcile directly received gateway/diocesan-transfer settlement under a **different settlement path**.

## Payment routes must remain distinct

| Route | Who initially receives money? | Self-service evidence | Internal posted record | Curia remittance |
| --- | --- | --- | --- | --- |
| Cash handed to COWL | Authorized COWL collector | Applicant may mark intended payment only | COWL finance records receipt after cash is physically counted | **Yes**, COWL later hands funds and duplicate copies to Curia |
| Transfer sent to approved COWL account | COWL, after bank reconciliation | Transfer reference/proof; **unverified** on upload | COWL finance confirms bank credit and actual amount | **Yes**, subject to authorized treasury transfer process |
| Direct diocesan transfer / gateway settlement | Curia or approved diocesan account | Provider/bank reference; verified server-side | Curia/finance records reconciled settlement; COWL registry receives verified status | **No physical COWL-to-Curia fund remittance**, unless policy explicitly requires a separate custody step |

Never falsely show `COWL remitted to Curia` when the funds were paid directly to Curia. Do not automatically issue a paper receipt for electronic funds until Curia confirms how that legal/accounting document is handled.

For gateway payments: use a qualified provider-hosted checkout, never collect or store card numbers/CVV. Verify server-side signed provider webhooks, idempotency keys, provider transaction IDs, amount, currency, destination, status and refunds/chargebacks. A browser success page is **not** authoritative. Preserve reversals in the ledger.

## Proposed schema domains (logical, NOT SQL yet)

### Identity and permission scope
- `parish_representative_assignments`: `user_id`, `parish_id`, optional `ministry_id`, `approved_by`, `starts_at`, `expires_at`, `revoked_at`. A parish representative can be assigned several scopes without viewing all other parishes.
- `role_assignments` or reviewed `auth.users.raw_app_meta_data.registry_role` claim for coarse roles. Fine-grained parish authority must come from a trusted DB table, not an editable user profile or stale broad JWT claim.

### Intake, documents, and roster
- `submission_batches` or extended proposed `renewal_batches`: source (`staff`/`parish_self_service`), `submitted_by`, authorized parish/ministry/year, parent batch, status, revision, submitted timestamps. Keep prior `recommendation_renewal_batches` semantics until migration strategy is reviewed.
- `submission_members` / existing proposed `renewal_batch_members`: roster entry and separately reviewed `member_ministry_id` matching.
- `submission_documents`: `batch_id`, type (`recommendation_letter`, `roster`, `payment_evidence`, `other`), private storage key, sha256, revision, uploaded_by, scanning_status, reviewer, review status/time and rejection reason. Batch-level letter normally uploaded **once**, with versioning.
- `submission_reviews` / append-only status events: actor, decision, reason, immutable original evidence, and explicit requests for revision.

### Pricing and payment
- `fee_schedules` / `fee_rules`: explicitly approved year/ministry/version, calculation basis, fee in **integer centavos**, effective dates and authorized approval.
- `payment_requests`: financial obligation/quote linked to submission, approved rate version, quoted total, outstanding balance, adjustments and payer/destination.
- `payment_attempts`: initiated/awaiting evidence/pending verification/verified/failed/refunded/disputed; channel, remittance destination, provider/bank references and server-verified amounts. Applicant-controlled proof is evidence, **not settled money**.
- `payment_evidence`: private uploads and review data, if not using a common versioned document table.
- `provider_events`: unique provider event ID, signature validation metadata, idempotent processing and event outcomes (for future online checkout).
- Reuse/refine `renewal_collections`, `renewal_payment_allocations` only for **confirmed/posted collections**, not unverified self-reported payments. A single consolidated collection may be allocated to multiple reviewed member/batch obligations; allocations must sum to the collection amount under approved rules.

### Preprinted receipts and Curia reconciliation
- `curia_receipt_booklets`, `receipt_custody_transfers`, `official_receipt_inventory` (or an equivalent immutable serial ledger): exact **text** number including leading zeroes; authoritative issuer/series; booklet range; allowed state transitions and chain of custody.
- `official_receipt_issues`: exactly one real accounting receipt number linked to an authorized posted collection (subject to diocesan policy for multiple line items / grouped payments).
- `remittances`, `remittance_collections`, `receipt_duplicate_handoffs`, `curia_acknowledgments`, `financial_events`: post-only events, distinct `prepared_by` vs `confirmed_by`, cash count, physical copy verification, reconciliation exceptions and settlement destination.
- Retain original Curia accounting code as `printed_code` **without inventing ledger meaning**; maintain a separate approved mapping table only after Curia provides the actual codebook.

Avoid applying old draft `supabase/proposals/parish_ministry_renewal_finance.sql` unmodified: it has no parish self-service authority assignment, no document upload/versioning table, no payment-request/evidence stages, and no separate Curia receipt booklet/serial custody inventory.

## Explicit state machines (separate, not one `paid` flag)

- **Submission**: `draft → submitted → under_review → approved / changes_requested / rejected`; supplemental submissions link to an immutable earlier batch.
- **Recommendation document**: `uploaded → scanning → pending_review → accepted / needs_replacement / rejected`.
- **Payment**: `quoted → awaiting_payment → evidence_submitted / provider_pending → verified / failed / disputed / refunded`. Actual posted collection created only from bank- or gateway-verified settlement / verified cash.
- **Receipt stock**: `curia_stock → assigned_to_cowl → custody_acknowledged → issued / voided / missing / returned`, with physical-copy accountability separate.
- **Curia remittance**: `draft → submitted → confirmed / discrepancy`; discrepancy requires independent resolution, never silent overwrite.
- **Registry approval**: independent of payment and recommendation-letter state; process only after designated registrar approval and existing renewal-review controls.

## Security architecture (proposed)

| Principal | Allowed | Must not be allowed |
| --- | --- | --- |
| Unauthenticated visitor | View generic instructions and sign-in | Read application, member, document or payment records; upload into protected buckets |
| Verified but unapproved parish user | Manage their own profile/authority request | Claim own representative approval or see any parish submission |
| Approved parish representative | Create/edit only authorized draft submissions, upload private supporting files, view their authorized status/payment evidence | Change posted collection, preprinted receipt number, COWL/Curia review decision, or any unrelated parish |
| COWL registry reviewer | Inspect assigned submissions and letter/roster evidence, decide registration review | Alter money settled, authoritatively certify Curia funds |
| COWL finance collector | Post verified collected funds and issue only assigned Curia receipt stock under approved rules | Approve own registry decisions without separate authorization or confirm Curia acceptance |
| Curia receipt custodian | Register/transfer actual preprinted receipt stock | Modify member registry or rewrite COWL payments |
| Curia treasury reviewer | Reconcile incoming funds, physical receipt duplicates, official references; independently confirm or flag | Post COWL's own original collection, edit receipt serial history, or confirm the same remittance they prepared |
| Platform administrator | Manage authorized provisioning and operational support, with audited exceptional access | Treat user-editable metadata as trusted authorization or bypass financial separation of duties |

Implementation controls:
- Strong Supabase Auth; recommend verified email/OTP and optionally MFA for financial staff. Each staff-approved representative assignment must be revocable.
- Every exposed financial or submission table **RLS enabled** and explicit grants; owner/scope predicates using `auth.uid()` and trusted role membership, not just `TO authenticated`.
- Never derive privilege from `raw_user_meta_data`. Use server-authorized role claims in `raw_app_meta_data` for coarse role and trusted DB membership for parish scopes. Verify current authority at sensitive transitions to avoid stale JWT claims.
- Applicant may INSERT their own draft and supporting uploads, but **cannot UPDATE status, amount verified, review fields, receipt serials or Curia confirmations**, even if they bypass the UI. Sensitive transitions are approved server-side and enforced by database constraints/atomic functions, with minimal grants and event logging.
- Private Supabase Storage buckets for recommendation letters, rosters and payment evidence; organization-scoped storage paths, content/MIME and maximum-size rules, malware scanning where applicable, short-lived signed access, no public URLs. Preserve document revision history and define retention/deletion rules with the Diocese.
- No client-side `service_role`/secret credential; payment provider secrets and webhook signatures server-only. Reject spoofed/replayed provider events.
- Apply immutability and uniqueness to reviewed batches, posted collections, remittance membership, and exact official receipt `issuer + series + printed serial`.
- Auditable event history for all decisions, payment changes, stock custody and remittances. Avoid exposing personal data in audit error messages/notification emails.
- Database allow/deny integration tests covering cross-parish access, self-approval attempts, storage access, unsupported role, duplicates, incorrect receipt series, double-payment, repeated webhook and cross-role confirmation.

## Recommended rollout

**A. Phase 4 architecture now:** approve this conceptual intake/payment boundary, select accountable payment destination(s), specify roles, schema draft and RLS test matrix. No migration.

**B. Phase 4 secure baseline:** controlled internal COWL/Curia financial schema with secure role provisioning and test data first. Existing live registration unaffected.

**C. Parish self-service pilot:** restricted to a few staff-approved parish representatives and recommendation letter + roster uploads; document review is separate from financial posting. An applicant can view status but cannot self-approve.

**D. Payment pilot:** begin with offline cash/bank transfer evidence verified manually by authorized finance personnel. Only after signed Curia authorization should online gateway/webhook integration and accounting export be added.

## Unresolved governance decisions for the Diocese / Curia

1. Is the page available to a **parish-appointed representative**, individual minister, or both? Default: appointed representative may submit; individual minister has no authority to represent a parish or self-approve a recommendation letter.
2. Who is the lawful beneficiary/account holder for future electronic payments: COWL-controlled approved account or direct Diocesan Curia account? They require different reconciliation paths.
3. Which fee schedule and exceptions are approved? One pictured receipt at ₱50.00 per minister does **not** establish a universal rate.
4. When money arrives digitally, who issues the Curia-approved official accounting document and how do preprinted receipt duplicates move, if at all?
5. Who is the authorized signatory for recommendation letters, what signature verification is acceptable, and how long must files and payment records be retained?
6. What counts as a fully approved minister renewal under the existing registry workflow, independent of payment?

**Do not apply a migration or make public self-submission available until these matters and the RLS tests are approved.**
