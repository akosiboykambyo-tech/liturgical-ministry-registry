# Financial Stewardship — Phase 1: Physical Receipt Format Alignment

Status: **interface preview only**, not a finance migration, collection authorization or Curia accounting integration.

## Primary source used for the preview
COWL supplied a photo of an existing preprinted official receipt dated October 29, 2026. The reference photo is held in the project discussion; this document records only the fields needed to align the prototype. Do not treat this reference as a new COWL transaction.

| Physical receipt field | Observed transcription / handling in the prototype |
| --- | --- |
| Issuing name | The Roman Catholic Bishop of Kalookan |
| Preprinted serial (top and body) | `057785` — keep **as string**, including the leading zero |
| Date written | 2026-10-29 |
| Received from | SAN BARTOLOME PARISH |
| Purpose | DCOWL Renewal Year 2026 — Solidarity Fee |
| Ministry wording | MINISTRY ON LITURGICAL MUSIC |
| Registry-normalized ministry | Ministry of Liturgical Music (for linking only; do not replace source wording) |
| Participant count | 113 |
| Fee per participant | ₱50.00 |
| Total received | ₱5,650.00 |
| Amount in words | Five Thousand Six Hundred Fifty Pesos Only |
| Printed CODE | `4433025` — **meaning has not been verified** |
| Receipt details | PDF - Remittance for COWL; additional category "YOUTH" appears |
| Payment method | Cash amount is populated; the checkbox cannot be confidently confirmed from photo |
| Signed receiver | Physical receipt contains a named receiving officer and signature; identification/custody rules need confirmation |

Reference arithmetic: **113 × ₱50.00 = ₱5,650.00**.

## Binding rules for implementation
1. The **Curia**, not COWL-DOK, issues preprinted official receipt stock and assigns serial ranges. The application must never generate official serials.
2. An official receipt serial, such as `057785`, is a **text** identifier. Preserve all printed characters and leading zeroes. A COWL collection tracking ID remains separate.
3. Receipt records need date, paying parish, written ministry name, canonical registry ministry link, service/renewal year, purpose, detail line(s), participant count, unit fee, received amount, amount in words (when needed), printed CODE, payment method and responsible receiving personnel.
4. Monetary values should ultimately use integer **centavos**. Do not use binary floating point amounts for financial ledger storage.
5. Do **not** assume the CODE identifies a particular general-ledger account until Curia confirms it; do **not** generalize a ₱50.00 fee from one receipt into a fee schedule.
6. The Curia receiving workflow must compare the actual amount and physical duplicate receipt copies to the COWL submission, and flag discrepancies instead of falsely confirming.
7. Voided, missing and returned preprinted serials remain accountable; Curia inventory assignment, uniqueness, operational audit logs, posting locks, authorization, RLS and synchronization belong to subsequent phases.

## Preview locations
- COWL Admin: `/admin/financial-stewardship-preview` → **Receipt Format (Phase 1)** tab, which lets a tester change a transcription and view recalculated totals without saving.
- Curia: `/curia` → **Receipt Booklets**, which displays the reference receipt separately from fictional inventory; **Incoming Remittances**, which shows fictional receipt fee breakdowns before simulated confirmation.

The fictional ledger uses separate serials `000101`–`000106`; `057785` is **not** part of those transactions, and no receipt or money is created by viewing or editing the prototype.

## Curia questions outstanding
- Meaning and allowed values of the printed CODE (e.g., `4433025`)
- Approved fee schedule by ministry and year, including exemptions, allocations and amendments
- Exact receipt stock transfer, void/missing copy handling, audit and reconciliation forms
- Whether the Curia requires an export format for its accounting software
- Which personnel may physically issue receipts and who confirms surrendered duplicates

Do not merge into production financial operations until these are resolved and the database/authorization design is reviewed.
