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

## Confirmed direction — coordinator self-service, QR Ph and OTC

The requested future portal is **coordinator-led**, not an unrestricted public minister portal. Up to **two active, staff-approved email contacts per parish** may receive one-time email login codes. These verified contacts may view their **parish's** ministry rosters, file requests to make a member inactive, upload signed recommendation letters and supporting documents, and submit payment evidence. An authenticated email alone is insufficient to establish parish authority. Roles, contact replacements, cancellations and lockouts are audited.

**Do not confuse this future self-service payment subphase with the existing browser-only Financial Stewardship Phase 2 receipt-booklet prototype.** The QR Ph feature belongs to the future coordinator-payment rollout after Phase 4 security design is approved.

### Coordinator's intended mobile journey

1. Sign in with an **email one-time code** linked to one of the parish's approved coordinator accounts. Enforce two active contacts per parish via trusted server transaction and DB locking/constraint mechanisms, not just a UI count; COWL may suspend or replace a contact.
2. View only the parish's ministry rosters and renewal year, fee quote, due date and document/renewal/payment statuses. Show **Request inactive** against a roster entry; this creates a change request for admin approve/decline, **not** an immediate update to \`members\` or \`member_ministries\`.
3. Submit the signed recommendation letter using camera, photo gallery or a private file upload. The uploaded evidence remains **Received — awaiting review** until COWL staff mark it reviewed; preserve any replacement/version history. Record requests and decisions in a chronological **Request history**.
4. Select **Pay renewal**, see the **exact quoted amount**, official beneficiary name, approved organizational **QR Ph P2M** code, and the internal renewal reference (e.g. \`REN-2026-017\`). Allow the coordinator to save/download the QR image for an app's scan-from-gallery flow or scan it from a second device or printout. The renewal reference belongs to COWL-DOK's obligation, **not** the Curia-preprinted Official Receipt No. or the bank's transaction reference.
5. The payer scans/uploads the QR using a **participating** QR Ph financial app such as a compatible GCash, Maya or bank app and pays to the verified organizational account. Static QR typically does **not** transmit \`REN-2026-017\` automatically and may require the payer to enter the amount. Show a warning to confirm the beneficiary name, amount and transaction success before submitting evidence. Do not silently promise that the payer's app can transmit a custom note.
6. Back in the portal, the coordinator uploads a screenshot (private) and enters the **exact external transaction reference** plus transfer date/time, amount, payment app/bank and available sender details. The UI immediately displays **Payment submitted — awaiting verification**. It does **not** display Paid merely because the screenshot was accepted.
7. COWL finance locates the **actual credit** on the authorized receiving bank/e-wallet statement, matches destination, amount, reference, date/time and other available data, and records a verified payment **only after settlement is evidenced**. If ambiguous or conflicting, use **Needs clarification / Under investigation**, not Paid.
8. The coordinator then sees **Paid** and the verified date, separately from **Official receipt issued** and **Renewal approved**. The authorized office physically issues the exact Curia-supplied preprinted receipt under the existing receipt custody controls. Delivery/acknowledgment of the paper document follows Curia policy, not app-generated numbering.

**OTC remains a first-class alternative.** Cash paid over the counter is recorded by an authorized cashier after actually counting funds. A parish's intent to pay OTC is not proof of collection, and an authorized collector's recorded event is distinct from a parish-submitted screenshot.

### Explicit UI scope

Coordinator mobile web page:
- Email-code login for **maximum two approved active contacts per parish**, parish-scoped access, revocation and contact replacement
- At-a-glance renewal status, due date, balance and **separate** document/payment/roster review statuses
- Ministry-by-ministry roster view; **Request inactive** creates an auditable request, never a direct status edit
- Camera/gallery/PDF uploads for recommendation letters, roster corrections and payment evidence
- QR Ph payment instructions showing amount, beneficiary account name, approved QR and renewal reference; OTC instructions always visible
- History of documents, requests, payments, receipt issuance and reviewer decisions

COWL admin (Financial Stewardship plus review queues):
- Parish list, filters and status indicators (**submitted**, **documents complete**, **paid**, **overdue**) as separate facets rather than a contradictory single enum
- Roster change queue with approve/decline and reason; authorization and registrar review are required before any roster change
- Document intake queue with **received**, **accepted**, **needs replacement** and other explicit states
- One finance queue for QR Ph claims and OTC collections; QR claim must match a verified receiving-account credit, OTC must be counted by an authorized cashier
- Duplicate external transaction reference detection, evidence reuse detection, bank-statement reconciliation and restricted staff override with audit
- Immutable chronological activity log: actor, action, timestamp, target, verification evidence, approvals and corrections

### QR Ph account and reconciliation policy

- Use **one or more Curia-approved organizational receiving accounts**, never the staff member's personal wallet, and retain a versioned receiver-account record. Display the approved payee organization name (or merchant identity) and ensure the QR really routes to that account. For merchant collection, prefer an appropriate provider-issued **QR Ph P2M** code after confirming its eligibility with the provider.
- **Static QR Ph is not an automatic payment API.** A COWL-DOK renewal reference displayed next to a static code does not necessarily appear in the payer's bank statement. The external bank transaction reference and actual credit are the main reconciliation anchors; staff must review ambiguities.
- Every submitted payment attempt references the underlying renewal obligation and destination account. A **unique external reference** is checked in a suitably scoped namespace, such as \`(receiving_account_id, rail_or_provider_id, normalized_external_reference)\`. Reserve the claim and prohibit reassigning any **verified bank transaction** to two obligations; duplicate/reused evidence triggers an investigation. Treat reference uniqueness as an **anti-duplicate control, not proof a payment occurred**. Reuploading evidence for the *same* claim should create a revision, not a second paid collection.
- A single bank credit may be ambiguous when many parishes owe the same amount: use amount, credit date/time, verified destination, provider reference, and available sender details. **Sender name alone, a screenshot or amount/date coincidence is insufficient**. Escalate unmatched credits or conflicting claims, and retain the bank-statement match reference.
- **Centavo fingerprinting is deferred.** Adding a few centavos per parish (e.g. ₱5,000.17) changes the amount due and receipt reconciliation, and may interact with provider precision/fee schedules. Do not implement unless Curia approves the exact accounting treatment, display of charges and payment app behavior. Prefer a provider-supported dynamic QR/invoice reference if available in a future integration.
- Payment entry records the intended payment amount separately from \`bank_verified_amount_centavos\`; all money is stored as integer centavos. No automatic cash receipt/ledger posting from applicant input.
- If the QR directs funds to **COWL's approved account**, later COWL-to-Curia remittance (and duplicate receipt turnover) remains relevant. If it directs funds **straight to Curia**, record a direct diocesan settlement and **do not fabricate a COWL remittance**.
- Payment reversal, chargeback, refund, excess/short payment and disputed statement matching are distinct review states and adjustment events. Once recorded, the previous financial evidence and decisions remain accessible for audit.

### Distinguish the identifiers

| Identifier | Assigned by | Purpose |
| --- | --- | --- |
| Renewal reference \`REN-2026-017\` | COWL-DOK internal ledger | Identifies a parish+ministry+year obligation; printable next to QR |
| External transaction reference | Bank or payment app | Used to identify the claimed actual transfer; unique within verified provider/account namespace |
| Collection / payment posting ID | COWL-DOK internal finance ledger | Represents funds counted/verified by authorized staff |
| Official Receipt No. \`057785\` (sample) | Diocesan Curia preprinted booklets | Real paper receipt stock; cannot be generated from the renewal reference or QR transaction |

### Concrete design invariants

1. Two active parish coordinators maximum, designated by trusted staff; cross-parish access never inferred from email domain or user-supplied metadata.
2. Roster change requests and file submissions are separate from approved changes to the authoritative member registry.
3. \`proof_uploaded\` and \`external_reference_submitted\` are not settled funds or \`paid\`.
4. A financial verifier must see matching authenticated receiving-bank evidence, not just a screenshot. Reused external transaction details cannot post a second confirmed payment; flag exceptions and do not auto-approve.
5. \`Paid\`, \`Recommendation accepted\`, \`Receipt issued\`, \`Curia remittance confirmed\` and \`Renewal approved\` are separate facts and timestamps.
6. Only staff with the proper receipt custody scope can record a preprinted Official Receipt No.; the number is stored exactly, including leading zeros.
7. OTC and QR Ph use the **same collection ledger and parish status tracker**, but use distinct proof/verification routes and never bypass segregation of duties.

## Recommended user journey

### Parish representative (future /parish/submissions)

1. Authenticate using verified email/OTP; obtain **explicit, staff-approved** authorization to act for a specific parish and, where required, ministry.
2. Start a draft for a **parish + ministry + service year**, with `original` or a linked `supplemental` batch. Use existing registry parish and ministry identifiers, not free-form naming.
3. Add roster/members or upload a CSV for matching against authorized `member_ministries`; unmatched, duplicate or ambiguous names enter existing review, never silently create or renew member records.
4. Upload one **parish-authorized recommendation letter** covering the appropriate batch; preserve document versions, signer/issuer details and review status. Do not copy the same PDF into every member row.
5. Review the amount **quoted** from an approved, versioned diocesan fee schedule, including documented exemptions/adjustments. A quote is not money received.
6. Choose **QR Ph** to view the approved organizational payment QR, exact fee and internal renewal reference, or select **OTC**. QR Ph evidence remains pending until checked against the receiving account statement. A future gateway checkout is a separate, optional enhancement, not a prerequisite of QR Ph screenshot-and-bank-verification intake.
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
- `parish_representative_assignments`: `user_id`, `parish_id`, optional `ministry_id`, `approved_by`, `starts_at`, `expires_at`, `revoked_at`. A trusted database transaction enforces **at most two active parish coordinator contacts**; approved scope, not verified email alone, controls roster and submission access.
- `role_assignments` or reviewed `auth.users.raw_app_meta_data.registry_role` claim for coarse roles. Fine-grained parish authority must come from a trusted DB table, not an editable user profile or stale broad JWT claim.

### Intake, documents, and roster
- `submission_batches` or extended proposed `renewal_batches`: source (`staff`/`parish_self_service`), `submitted_by`, authorized parish/ministry/year, parent batch, status, revision, submitted timestamps. Keep prior `recommendation_renewal_batches` semantics until migration strategy is reviewed.
- `submission_members` / existing proposed `renewal_batch_members`: roster entry and separately reviewed `member_ministry_id` matching.
- `submission_documents`: `batch_id`, type (`recommendation_letter`, `roster`, `payment_evidence`, `other`), private storage key, sha256, revision, uploaded_by, scanning_status, reviewer, review status/time and rejection reason. Batch-level letter normally uploaded **once**, with versioning.
- `submission_reviews` / append-only status events: actor, decision, reason, immutable original evidence, and explicit requests for revision.

### Pricing and payment
- `payment_receiving_accounts`: bank/provider identity, organizational beneficiary name, QR Ph P2M image/identifier, effective dates, approval state and COWL-versus-Curia settlement destination. QR assignment/changes are controlled by authorized staff and audited.
- `renewal_payment_claims`: renewal/payment-request ID, channel (`qr_ph`, `otc`), immutable initial claimant and timestamp, provider, destination account, original and normalized external transaction reference, payer-submitted amount/date/time, screenshot storage reference, claim state and cross-claim duplicate reason; screenshots cannot assert `verified_at`.
- `bank_statement_credits`: private source statement import or staff-verified bank-credit record, receiving account, bank posting time, amount_centavos, verified bank/rail reference, fingerprint and import batch. Prevent a given verified credit from being linked to more than one posted payment; preserve ambiguity and manual review decisions.
- `payment_reconciliations`: link claim to verified credit or OTC cashier event, independent verifying staff, decision, verified amount, verified_at, mismatch/rejection reason and append-only event reference. Matching and creation of a posted collection must be atomic and auditable.
- `parish_change_requests`: member/ministry reference, parish, request type (`request_inactive`, correction, etc.), reason, submitted_by, reviewed_by, decision, reviewed_at and event log. Applicant never directly updates member activation.
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
7. Which organizational QR Ph receiving account and beneficiary name does Curia authorize? Is the account held by COWL or paid directly to Curia, and which staff member can verify its statement?
8. Are QR Ph merchant account/payment limits, provider fees, and exact settlement identifiers acceptable? Must the payer submit proof for every payment, even when the statement shows a definitive reference?
9. How should bank refunds, partial/overpayments, OTC cash, and duplicate screenshot/transaction claims be resolved? Centavo-based matching must remain disabled absent explicit Curia approval.

**Do not apply a migration or make public self-submission available until these matters and the RLS tests are approved.**
