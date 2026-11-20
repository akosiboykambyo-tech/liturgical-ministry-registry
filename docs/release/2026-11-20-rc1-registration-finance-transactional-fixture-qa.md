# RC1 — TEST registration and receipt-custody transactional acceptance

**Date:** 20 November 2026 (Asia/Manila)  
**Target:** Supabase `Ministry-Registry-Test` (`rtptybxugjhvpfjvcvgw`) only  
**Draft release:** GitHub PR #88 (`integration/rc1-role-aware-secure-registry-20261119`)  
**Method:** Real database RPC calls under simulated `authenticated` PostgreSQL roles and TEST identity UUID claims; synthetic records only; each sequence ends with explicit `ROLLBACK`.

## Scope and limitations

These are **database RPC integration tests**, not genuine Auth login, signed-JWT HTTP, payment processing, actual physical receipt inspection, or application-browser end-to-end verification. The tests used existing, active TEST-only Registry Administrator, Curia receipt custodian and COWL receipt issuer accounts as **claim-bound database contexts**, without acquiring or creating passwords, refresh tokens or JWTs. No grants or account credentials were changed. Every synthetic row and audit event created during these tests was rolled back.

### A7 — positive Registry registration RPCs: PASS (transactional)

Under the active Registry Administrator identity using `SET LOCAL ROLE authenticated` and `request.jwt.claim.sub`:

1. `registration_intake_v1` with randomized synthetic name, synthetic parish, valid ministry and new idempotency UUID returned `created` and an ID.
2. Exactly one new `members` row and one `member_ministries` assignment with `Pending Verification` were visible **inside the transaction**.
3. Repeating the exact intake idempotency key returned `replayed`, preserving the original member link, without another member.
4. A **second** request UUID for the same name returned `review` with a review ID, rather than auto-merging or generating another member.
5. `registry_admin_member_write_v1('create',...)` created a **separate** synthetic Registry member with one valid `Ministry of Lectors and Commentators` assignment, again pending verification.
6. Separate transactional scenario: `registration_resolve_review_v1(reviewId,'approved',note)` resolved the synthetic review and returned the original member link, created exactly one `registration_review_events` audit event, left the existing ministry assignment unchanged, and rejected a second resolution with SQLSTATE `23505`.
7. Both transactions executed `ROLLBACK`. The first attempt at the review-approval query failed on a **test-harness variable/column ambiguity**, was corrected, and the complete corrected case passed; do not count the failed attempt as an application defect.

**Not tested:** signed-JWT HTTP registration intake/review endpoints, approval of real duplicate candidates, Storage letter uploads, member-document lifecycle, actual acceptance of an invitation.

### A9 — synthetic Curia → COWL printed-receipt custody RPCs: PASS (transactional)

With existing active Curia `curia_receipt_custodian` and COWL `cowl_receipt_issuer` claim-bound identities:

1. Curia registered a randomized **fictional** receipt series via `fs_curia_register_receipt_series`.
2. Curia registered a **fictional** preprinted booklet of five numbers (`0001`–`0005`) via `fs_curia_register_checked_booklet(...,true)`.
3. Curia assigned the booklet to the authorized COWL receipt issuer using `fs_curia_assign_receipt_booklet(...,true)`.
4. COWL acknowledged receipt custody using `fs_cowl_acknowledge_receipt_booklet(...,true)`.
5. Within the same transaction, verified exactly five receipt numbers, state `cowl_custody`, expected authorized acknowledgment identity, exactly three custody events (registered/assigned/acknowledged), and four audit events for the series and booklet.
6. A role context with **revoked financial access** was denied receipt-series registration with SQLSTATE `42501`.
7. The entire sequence was rolled back, including five numbers, series, booklet, assigned custody and all generated audit events.

**Critical caveat:** Boolean flags were deliberately set to simulate physical checks for *fictional TEST stock* inside a nonpersistent transaction. This is **not** evidence that any real receipt book was inspected, handed over, issued, or accounted for. Nothing was printed or shipped.

**Not tested:** complete finance intake, fee-schedule approval, parish renewal draft/quote, OTC/QR payment, bank reconciliation, official receipt issuance linked to a real collection, remittance submission, Curia fund receipt or review, live frontend HTTP auth, Storage evidence uploads/downloads. TEST contains no persistent financial collections, payment requests or remittances, so positive payment/remittance coverage requires additional controlled fixtures and relevant active role grants.

### Post-test integrity snapshot

| Metric | After tests |
| --- | ---: |
| Auth users | 6 |
| Registry members | 1,009 |
| Ministry assignments | 13 |
| Registration intake requests | 8 |
| Registration review queue items | 4 |
| Registration review events | 1 |
| Financial receipt series | 0 |
| Financial booklets | 0 |
| Financial receipt numbers | 0 |
| Financial custody events | 0 |
| Financial collections / payment requests / remittances | 0 / 0 / 0 |
| Existing finance audit events | 2 |
| `system_settings` rows | 9 |
| Old unconditional settings policy | 0 |

The final audit-events count includes **pre-existing** events; no synthetic finance audit events persisted. No real Auth user, member or finance record was changed by these rolled-back sequences.

### Release and follow-up

- **A7 transactional registration RPC logic:** PASS for exercised create/idempotency/duplicate-review/approve cases; **HTTP/jwt/browser/Storage acceptance remains OPEN**.
- **A9 transactional receipt-custody logic:** PASS for fictional preprinted stock; **actual physical handoff, collection/payment/remittance/receipt issuance and HTTP/Auth/Storage acceptance remains OPEN**.
- **Risk:** TEST certificate templates still reference public Production Storage asset URLs. Classify and isolate if independent TEST assets are required.
- **Next:** run authenticated HTTP/RLS tests with TEST login sessions held in a trusted first-party browser (never paste tokens into chat); enable or provision only explicitly authorized disposable payment and parish-role fixtures, then test full finance payment/remittance/issuance lifecycle and retained immutable audit evidence; obtain responsible physical-custody signoff separately.
- **Production:** `cowl-dok.online` unchanged, main unchanged, PR #88 remains Draft, **release NO-GO**.
