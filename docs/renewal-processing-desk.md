# Renewal Processing Desk — Phase 1 (draft)
**Status:** Design and database proposal only; no live database migration or collection permissions have been applied.

## Working unit
A parish representative submits one consolidated payment and recommendation letters for a single **parish + ministry + service year** renewal batch. Supplemental submissions are separate linked batches, never silent edits to finalized records. Every member belongs to a specific `member_ministries` assignment, so renewing one ministry cannot accidentally renew another.

## Three independent ledgers
1. **Batch:** member assignments, document review, authorized signature, and eventual renewal validation. Payment alone never renews the registration.
2. **Collection:** aggregate payment, payment channel, externally approved receipt/invoice reference, and explicit allocations to member assignments. Never assert that the application issues a BIR invoice.
3. **Remittance:** may contain several batches' collections. Commission Secretary declares the physical total; Curia cashier independently accepts or records an exception. `confirmed_by` cannot equal `prepared_by`.

Amounts are represented as integer centavos, not floating-point pesos. Never auto-divide a consolidated amount among members without the approved fee schedule, waivers and documented allocation.

## Integrity requirements before production
- Server-side transactional operations: payment allocations must sum to the collected total; a batch member may not be allocated to an unrelated batch; posted collections must not be edited or deleted.
- Remittance submitted amount must equal the sum of *eligible, non-void* collections; no collection can be remitted twice.
- A second authorized user must acknowledge treasury acceptance; cash discrepancy blocks confirmation.
- Record reversal/void as auditable events, preserving historical receipts, rather than destructive overwrite.
- File uploads must be private with scoped signed access and per-member ministry archiving.
- Block collection entry until written delegation from Diocese establishes collector, custody, authorized document format/numbering, approved fee schedule, and remittance deadlines.
- Role-scoped authorization/RLS and server-backed workflows must be reviewed before migrating or exposing any new tables.
- Keep existing `recommendation_renewal_batches` and registration verification unchanged until migration strategy is tested.
- Test parish representative payments, add-on member as supplemental batch, batches with unpaid members, multi-batch remittances and one ministry assignment per member.

## Initial work plan
- Phase 1A: Review and approve schema, roles, treasury policy. Implement server-side permission boundaries and immutable finance operations.
- Phase 1B: Build read-only batch ledger and member matching; then staff-assisted batch entry and document linking.
- Phase 1C: Enable collections only after authority, receipt handling, reconciliation and audit controls are validated.
- Phase 1D: Add independent treasury acknowledgment, discrepancy management and printable remittance statements.
