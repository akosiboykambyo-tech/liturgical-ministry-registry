# COWL-DOK Financial Stewardship — Phase 3 mock collections, remittances and Curia reconciliation

**Status:** Draft feature-branch prototype. **No production changes.** All collection entries, payment details, official receipt numbers used in transactions, personal names and acknowledgment references in the interactive ledger are fictional. The historical OR `057785` from the physical receipt photo remains a format reference only.

## Scope

Both portals operate on one browser-local, mock financial state at `cowl-dok-financial-demo-v3`:

- **COWL** — `/admin/financial-stewardship-preview` → **Collections & Remittances (Phase 3)**
  - Record a fictional parish ministry collection using an *available* preprinted serial from an acknowledged COWL-held booklet.
  - Choose canonical parish and ministry from `PARISHES` and `MINISTRIES`. Preserve separate exact paper wording fields for accounting comparison.
  - Enter renewal year, receipt date, number of participants, fee (integer centavos), actually received amount, purpose, printed CODE (uninterpreted), payment method and collecting officer.
  - The simulated posting enforces participant count × fee = total received, a valid assigned and unissued receipt serial, and separate automatically generated **internal** `COL-DEMO-` transaction IDs. It locks the serial as issued within the **same localStorage write** as the fictional collection.
  - Choose unremitted collections to prepare an itemized turnover statement listing their actual printed mock serial numbers, amounts and expected duplicate copies.
  - Require staff attestation of duplicate-copy inclusion, submit as `REM-DEMO-` and prevent the collections being submitted twice. Submission does not automatically mark them Curia confirmed.

- **Curia** — `/curia` → **Phase 3 Reconciliation**
  - Read the same sample remittance and linked receipt records on the same browser + deployment domain.
  - Enter independently counted funds and check each *physical* duplicate receipt copy (simulated checklist).
  - Full Curia confirmation requires counted funds exactly equal to declared funds, all expected receipt copies checked, a unique Curia acknowledgment reference, and a reviewing officer different from the COWL preparer.
  - Alternatively record a discrepancy with an explanation of at least 10 characters and the amount/receipt copies actually checked; a discrepancy is **not** a confirmation.
  - Final outcomes appear on COWL's Phase 3 tab as well. Review actions cannot reconfirm the same remittance.

## Workflow walkthrough

1. Open the **Curia** Receipt Booklets tab, assign a fictional available booklet (e.g. `CUR-002`) to COWL.
2. Open the **COWL** Receipt Inventory tab on the same preview hostname and browser; acknowledge the complete physical booklet.
3. Open **COWL → Collections & Remittances (Phase 3)**. Select an acknowledged booklet and an unused serial (e.g. `000151` if `CUR-002` has been acknowledged).
4. Select a paying parish from the searchable dropdown and a ministry from the official six-item list.
5. Enter a sample number of participants (e.g. 2), fee (e.g. 50.00), and received amount (100.00); select collection method and record fictional collected-by details.
6. Click **Simulate collection + receipt usage**. Confirm that exact serial becomes issued in the Phase 2 booklet ledger and cannot be reused.
7. Select the new collection below, confirm that its physical duplicate would be enclosed, then **Simulate turnover to Curia**.
8. Open **Curia → Phase 3 Reconciliation** on the same preview hostname. Select the new `REM-DEMO-` statement, enter the counted amount and verify each receipt copy.
9. Enter a Curia acknowledgment reference and test **Simulate Curia acknowledgment**. Check that COWL now shows **Curia confirmed**.
10. To exercise discrepancies, create and submit a second mock collection/remittance; enter a mismatching count or leave some duplicate copies unchecked and document a discrepancy instead.
11. Test on desktop and phone widths. Reset mock data from Phase 2 Receipt Inventory (this clears **all Phase 2 and Phase 3 browser-local data**).

## Architecture and limitations

- A **unified** browser-local mock store contains booklet stock, physical custody history, new Phase 3 collections and remittance outcomes. V3 storage attempts to load any previous V2 booklet-only demo state when no V3 store exists.
- Same-tab components synchronize through a custom browser event; other tabs synchronize through the native `storage` event. **This does not work across devices, browsers, users or different preview hostnames.**
- Mock state is not an audited or trusted ledger. Client-side validation and localStorage do **not** provide transactional protection against concurrent processes or intentional tampering. There is no actual Curia authorization, RLS, Supabase finance tables, receipt stock allocation, money movement, receipt issuance or renewal-status change.
- The existing Overview, Collections (Sample Ledger) and Curia Incoming Remittances (Sample) contain **separate, static fictional historical examples**, not records created by Phase 3. The Phase 3 tabs are clearly labeled as the connected workflow.
- The previous Phase 2 mock `issue` function produces serial usage without an itemized financial collection. Only the new Phase 3 **Record a sample collection** form creates a usable Phase 3 collection record and remittance candidate.
- The uploaded real-world receipt `057785` remains separate from the fictional inventory and is not assigned or posted. Internal IDs `COL-DEMO-` and `REM-DEMO-` are not official receipt serials.

## Production gating requirements

Before any live financial entry, implement:
1. Approved diocesan operating procedures for preprinted OR series, personnel authorization, custody and void/missing/returned copies, official paper copy turnover and allowed accounting CODE values.
2. Trusted Curia and COWL roles, authenticated audit identities, server-side authorization and Supabase Row-Level Security with verified app metadata.
3. Atomic PostgreSQL operations and unique indexes for exact (issuer, series, serial), booklet assignments, collection posting and remittance membership.
4. Permanent append-only financial events, review locking, discrepancy resolution and independent Curia confirmation with reconciliation evidence.
5. Rules on partial payments, adjustments, multiple line items on one receipt, fee schedules per year/ministry, multiple payment methods and accounting-code mapping.
6. Downloadable/printable Curia-approved remittance report and compatibility with diocesan accounting systems, plus real browser/mobile QA and security reviews.

**Do not merge the draft PR or deploy any production financial capability until these controls are approved and tested.**
