# RC1 TEST — first-party signed-session QA and synthetic finance lifecycle

**Date:** 2026-11-20, Asia/Manila  
**Supabase target:** Ministry-Registry-Test (`rtptybxugjhvpfjvcvgw`)  
**Vercel target:** RC1 preview of `integration/rc1-role-aware-secure-registry-20261119` only  
**Pull request:** Draft PR #88; **PRODUCTION NO-GO**.

## 1. First-party authenticated browser QA page

`app/rc1-qa/page.tsx` adds `/rc1-qa` **only** when both conditions are true:
- `VERCEL_ENV === "preview"`;
- `NEXT_PUBLIC_SUPABASE_URL` resolves to exactly `rtptybxugjhvpfjvcvgw.supabase.co`.

The route returns Not Found otherwise and marks itself noindex/nofollow. No new privileged server endpoint, password flow, Auth grant, or service-role access was created. It reuses the existing browser `AuthProvider`, Supabase client, and signed session.

### Operator instructions — repeat per existing TEST account

1. Sign in to the **current RC1 Preview**, at `/admin`, using an **existing TEST-only account**. Do **not** share your password, OTP, access token, browser cookies, screenshots containing personal information, or refresh token.
2. Open **the same preview deployment hostname** with path `/rc1-qa`. The route is not enabled on production.
3. Press **Run safe authorization checks** once. The page validates the session with `supabase.auth.getUser(access_token)` and performs live signed-in REST/RPC reads, first-party `/api/financial-stewardship/access` calls, and invalid/no-write authorization probes.
4. Inspect PASS / FAIL / INCONCLUSIVE. Select **Copy sanitized results** and share the text-only report; it contains no tokens, emails, UUIDs, private member data or financial data.
5. Sign out completely, then repeat the same one-click test for the **Registry Administrator**, **COWL finance viewer**, **Curia finance viewer**, and **revoked/no-active-role** TEST personas. Never use a PROD account.
6. A **FAIL** requires investigation. An **INCONCLUSIVE** Storage list is not a pass; empty private buckets cannot validate signed-download denial.

### Live check coverage

- Valid, real TEST JWT: browser session obtained normally, confirmed with `getUser(token)`.
- No Bearer header: first-party finance endpoint must return HTTP 401.
- Live finance JWT authorization: `workspace=all` and both COWL/Curia inventory boundaries, expected from independent RLS-read active-grant evaluation; denied workspace must return HTTP 403.
- Signed database access: `registration_is_admin`, head-only row counts in `members` and `system_settings`, with expected Registry-admin / non-registry separation.
- Non-admin Registry RPC: submit intentionally empty/invalid create/intake/review arguments; guard must raise SQLSTATE `42501`, with no valid data provided and no possible legitimate record write.
- Financial receipt custody RPCs: null IDs plus `false` flags; no actual stock can be assigned or acknowledged. Unauthorized roles must raise `42501`; authorized roles must reject at input validation.
- Private Storage metadata listing attempts for `member-documents` and `fs-private`; empty results or authorized listings are **INCONCLUSIVE** and never counted as download-denial evidence.

**Security note:** The QA runner has no analytics submission, no token reporting/logging and does not persist results; only the operator may copy a sanitized summary. The QA route is a temporary release artifact and **must not be merged to production**. Separate real signed-download denial and actual positive web registration remain outstanding.

## 2. Synthetic finance lifecycle — TEST database execution

File: `docs/sql/rc1-test-finance-otc-to-curia.ROLLBACK-ONLY.sql`

The operator approved disposable TEST fixtures. The SQL file begins with `BEGIN;` and ends with `ROLLBACK;` and cannot be safely repurposed for production. It uses selected **existing TEST-only** COWL receipt issuer and Curia receipt custodian actor claims, plus three `operator_authorized_test` financial role grants inserted inside the **same uncommitted transaction**: COWL finance verifier, COWL remittance preparer, Curia treasury reviewer. Those temporary grants never persist.

A prior first attempt failed due to an **ambiguous SQL variable** in the test harness and was rolled back. The corrected, committed file was then executed in TEST and **PASSED**.

### Exercised positive SQL/RPC state transitions

1. Insert fictional approved fee schedule (2 participants × 2,500 centavos), fictional approved renewal batch and fictional quoted payment request for 5,000 centavos.
2. Curia registers fictional five-number printed booklet and assigns it to the COWL receipt issuer; COWL acknowledges custody.
3. Authorized COWL verifier calls `fs_record_otc_payment`, marking request **paid** and creating a 5,000-centavo **posted** collection.
4. COWL issuer calls `fs_issue_official_receipt` with matching fictional paper lines; stock changes to **issued**.
5. Authorized COWL remittance preparer submits a **cash_handover** remittance linked to the collection, receipt issue and duplicate-copy record.
6. Separate Curia actor records a fictional 5,000-centavo cash receipt, marks the fictional duplicate copy verified and completes Curia review as **confirmed**.
7. Assertions inside transaction verify paid request, posted collection, receipt stock issuance, booklet custody, `curia_confirmed` remittance, Curia fund receipt, verified duplicate, confirmed review and required audit events.
8. Explicit `ROLLBACK` removes **everything**: temporary role grants, fee and quote fixtures, fictional payment and collection, receipt series/booklet/numbers/issues, funds/remittance/review, duplicate handling and generated audit.

**IMPORTANT:** All `true` values for cash-count, receipt-paper, booklet inspection, handover and duplicate-copy checks were **fictional software-branch simulations** inside an uncommitted TEST transaction. No physical examination, actual payer, monetary transfer, bank validation, printed official receipt or document custody occurred. This is NOT an acceptance test for real financial operations or signed HTTP functionality. The fee schedule and quote were synthetic prerequisites inserted for the RPC exercise, not created through an approved production admin UI.

### Post-test database inventory

| Metric | After complete rollback |
|---|---:|
| TEST Auth users | 6 |
| Registry members | 1,009 |
| Member-ministry assignments | 13 |
| Existing staff role grants | 5 |
| Financial fee schedules | 0 |
| Financial renewal batches | 0 |
| Payment requests / collections | 0 / 0 |
| Receipt series / booklets / numbers / issues | 0 / 0 / 0 / 0 |
| Remittances / Curia fund receipts / Curia reviews | 0 / 0 / 0 |
| Duplicate-copy handoff rows | 0 |
| Existing finance audit events | 2 |
| `system_settings` | 9 |
| Old broad `system_settings` public policy | 0 |

All five existing staff grants are still there; no new grants or financial records persisted.

## 3. Release gates still open

- [ ] Operator-run genuine signed-JWT `/rc1-qa` browser reports for all relevant TEST personas, recorded without credentials.
- [ ] Real signed Storage object-download and signed-URL authorization checks using approved private TEST files.
- [ ] Positive registration browser/HTTP tests, document upload and review workflow with safe fixture ownership and cleanup.
- [ ] Real payment lifecycle involving physically approved cash count, official receipt stock, bank/evidence and dual custody — **cannot be certified by synthetic SQL**.
- [ ] TEST certificate templates reference publicly hosted PROD Storage assets; classify and isolate as appropriate.
- [ ] Management acceptance, production migration/backup/rollback plan and go/no-go review.

**Status:** `FINANCE_SYNTHETIC_TRANSACTIONAL_PASS; REAL_SIGNED_JWT_QA_PAGE_PREPARED; OPERATOR_BROWSER_RESULTS_PENDING; PHYSICAL_FINANCE_E2E_NOT_PERFORMED; PROD_UNCHANGED`.
