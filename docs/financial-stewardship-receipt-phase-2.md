# Financial Stewardship — Phase 2: Receipt Booklet Stock and Custody Demo

**Status:** Draft / browser-local prototype. No real receipt inventory, official receipt issuance, collections, Curia account provisioning, or Supabase financial data have been introduced.

## Agreed real-world custody sequence
1. Curia retains authority over physical preprinted receipt stock and each receipt's exact printed serial.
2. Authorized Curia staff register the actual booklet, series/identifier, first and last printed serials, officer, and date.
3. Curia assigns a booklet to COWL and records the physical handover. The status remains **Awaiting COWL acknowledgment**.
4. COWL staff inspect the actual range/count and independently acknowledge receiving the booklet.
5. COWL can use numbers from its **acknowledged** assigned inventory, linking each issued receipt to a collection when Phase 3 production collection entry is implemented.
6. Issued/voided/missing serials are never reissued. An exception is recorded with officer, date and reason; Curia policy on the physical copies still needs confirmation.
7. For collections already remitted, the duplicate receipt copy surrender and Curia confirmation are separate controls from initial booklet custody.

## Current demo implementation
- **Curia Portal `/curia` → Receipt Booklets:** Register mock receipt stock (4–12 numeric characters, maximum 200 individual receipt numbers per booklet), prevent overlap for the same series, assign the booklet to a named COWL custodian, and monitor physical custody.
- **COWL Admin `/admin/financial-stewardship-preview` → Receipt Inventory:** View registered mock booklets, acknowledge physical custody after checking the printed range, simulate receipt use tied to a **fictional** `COL-DEMO-...` internal reference, and report voided/missing numbers with a reason.
- **Both portals** see the same mock state through `localStorage` on the same browser and same preview domain; updates in open tabs synchronize via a browser storage event. This is **not a financial system of record** and not actual multi-user synchronization. The demo can be reset from either portal.
- The preprinted official receipt `057785` supplied by the user remains an independent **format reference** and is not part of the fictional booklet ranges.
- The initial fictional booklets are:
  - `COWL-001`, series **Curia sample series**, serials `000101–000150`: already acknowledged by COWL (6 previously issued in the mock ledger, 1 voided, 43 available).
  - `CUR-002`, same series, `000151–000200`: held by Curia; ready to test its release and acknowledgment.
- The receipt serials remain exact **strings**, not internal generated official receipt numbers; internal booklet refs and demo collection references are separate.
- The demo stores fictional custody event history and rejects duplicate booklet IDs, overlapping same-series ranges and serial reuse. Controls are client-side only; they are not authorization or accounting safeguards.

## Recommended test script (same browser + domain)
1. Sign in with an existing Admin test account and open the Curia preview at `/curia`.
2. Select **Receipt Booklets → CUR-002**. Enter the handover officer/custodian/date and click **Simulate Curia handover**. Check that status becomes **Awaiting COWL acknowledgment**.
3. Open the **COWL Financial Stewardship** preview at `/admin/financial-stewardship-preview` on the **same preview origin**. Select **Receipt Inventory → CUR-002**.
4. Tick the physical range verification checkbox and click **Simulate custody acknowledgment**. Confirm both portals now show **COWL custody confirmed**.
5. Select an unused printed serial and simulate usage with a `COL-DEMO-...` reference; test duplicate/reuse blocking.
6. Simulate a voided or missing serial on a separate unused number; verify its status remains accountable.
7. Return to Curia → Receipt Booklets; verify the mock statuses and events match. Test registration of a nonoverlapping fictional third booklet.
8. Reset the mock inventory; confirm the starting fictional seed is restored.

**Test scope:** desktop, tablet, mobile navigation; two-tab same-origin synchronization; input validation and no financial database writes. Browser storage may be blocked by privacy settings. A private-browsing session or different browser is a separate data store.

## Production blockers and controls
- Curia approval of official series/range semantics, stock transfer forms, custodians, partial booklets and invalid/void/missing physical copies.
- Supabase/Postgres durable entities for receipt stock, transfers, serial inventory, exception events and double-entry reconciliation links.
- Strict server authorization and row-level security: Curia registers/transfers stock; COWL acknowledges custody; only authorized collectors record collection-linked receipt use; independent Curia verification is preserved.
- Atomic database transactions, unique constraints scoped to official issuing series, non-editable posted events, authenticated staff identities and audit logs.
- Numbering may include non-numeric series/prefixes in production; do **not** assume the numeric-range restrictions of this test interface match Curia's actual receipt format.
- No financial collection or funds/copies transfer should be enabled merely because a prototype permits a mock state transition.
