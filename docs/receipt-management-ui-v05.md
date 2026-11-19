# Receipt Management — approved v0.5 UI integration (12 November 2026)

**Status:** Preview-only, draft pull request. No financial ledger, official issuance, printing, or production permissions activated.

## Scope

- Add **Receipt Management** to existing **COWL Financial Stewardship** navigation with three inner tabs:
  1. **Issue Receipt** — parish = Received From, ministry = Particulars, count × rate, actual amount paid, optional additional note.
  2. **Receipt Register** — honest unavailable state until Curia-authorized ledger exists.
  3. **Print Calibration** — editable draft X, Y, width and global offsets, locked by default.
- Keep the current two-staff arrangement. **No new role codes, grants, or access-model changes.**
- The new route \`/financial-stewardship/receipt-management\` uses the existing COWL \`collections\` authorization. Finance-only Curia viewers cannot navigate to or authorize it; direct URLs must remain protected by server-verified grants.
- Preserve diocesan crimson, EB Garamond / Inter, Phosphor Light, and the existing responsive sidebar.
- Correct the public-facing stewardship description that wrongly stated duplicate receipt copies are surrendered to Curia.

## Safety

- All entry is **browser-only** and disappears on refresh.
- No payment claim is confirmed, receipt number is reserved, receipt issued, template published, or financial record saved.
- The receipt's **preprinted number is not in the printable field list**. The preview contains no print action.
- Calibration's **CALIBRATE** word is an accidental-edit confirmation, **not an authorization control**. The existing financial authorization boundary remains in force.
- Calibration changes are discarded on leaving the tab; no shared approved template or localStorage configuration is written.
- The current paper size is **111.76 mm wide × 170.18 mm high, portrait**, not A5. Coordinates are scan-derived and unapproved.
- The displayed renewal rate must be entered, never implied to be an approved fee schedule. Amounts are calculated as integer centavos.
- Original receipts go to payers. Carbonless duplicates remain in **COWL's physical custody** for Curia inspection. Do not routinely surrender duplicates.

## Release gates for operational issuance

1. Curia written approval: collector, preprinted series, fee schedule, handling of spoiled forms, remittance schedule, and COWL duplicate custody policy.
2. Secure, server-side financial receipt inventory and immutable collection/void/reprint audit history, with real grants checked on every write.
3. Receipt serial uniqueness and robust cash/check verification, collection allocation, reconciliation and renewal independence.
4. Calibrated Epson LX-310 paired carbonless stock test (feed, print, duplicate legibility) on custom paper, with no scale-to-fit.
5. Shared server-approved calibration versions, rollback, and auditable promotion for the two authorized staff accounts.
6. Exact-head typecheck, regression tests, responsive/keyboard review and real Registry, COWL, Curia and ungranted-user sign-in checks.
7. Do not merge into **stale main**; reconcile current release branch and outstanding security/auth PRs first. No production cutover is implied by UI approval.

## Source mapping

- \`app/financial-stewardship/receipt-management/page.tsx\`: new route, reusing COWL collections authorization.
- \`components/financial-stewardship/receipt-management-preview.tsx\`: branded interactive UI and draft-only controls.
- \`components/financial-stewardship/live-read-only-portal.tsx\`: navigation, current title, preview entry and custody-copy corrections.

## Validation notes

The previous standalone v0.5 prototype was inspected as a design reference. The Next.js integration must still pass CI and a real browser session; no live finance processing is enabled by the PR.
