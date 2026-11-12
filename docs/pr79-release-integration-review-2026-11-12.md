# PR79 — Security integration release review (12 November 2026)

**DRAFT / NO-GO.** Base release commit `b8082167`, not stale GitHub main or old PR55. All changes require isolated testing and owner-approved release cutover.

## Integrated branch changes

- Server-guarded PR55 registry writing for member detail/drawer/list, batch CSV import, duplicate queue resolution and deletion; preserve newer UI, role-aware Auth, independent immutable shared-letter service and Phosphor icons.
- Public one-calendar-year validity: Pending Verification and Inactive take precedence; missing or invalid expiration is not Registered. Inclusive expiration in Asia/Manila, independent for each ministry, with public certificate actions gated to currently valid assignments.
- Discontinue historical mass letter uploads that updated member-wide expiration; use explicit assignment-level private letter attachment and separate owner approval.
- Add annual validity regression tests and PR-specific CI.

## Unresolved critical database release gates

1. `registry_admin_member_write_v1(text,jsonb)` exists in TEST, not Production. Migrate reviewed compatible backend **before** frontend cutover; no direct grant revocations until all calls work.
2. The production `allocate_certificate_issuance(text,uuid)` function accepts NULL expiry and prohibits certificates within 30 days of expiration. Reviewed proposal `docs/sql/pr79-certificate-eligibility.REVIEW-ONLY.sql` corrects both but **must not be executed directly**. Install a separately reviewed versioned migration in staging, test eligibility, date boundaries, issuance counters, rate limiting and authorization, then obtain owner release approval.
3. Existing `registry_verify_ministries_v2` has a New-status eligibility check that differs from v1's letter requirement; review and correct evidence contract as part of the rollout.
4. Full signed administrator/ungranted/revoked/anonymous HTTP+Storage E2E; restoration of Auth, private Storage bytes, roles and ACL; and exact production-baseline reconciliation remain unverified. Staging's historical alignment does not mean production service parity.
5. The release branch diverges from main. PR78's shared auth UI and role-aware routing were reconciled into PR79 through merged PR82 on 12 November 2026; preserve these changes when preparing any production candidate. Reconcile against the actual deployed main only after independent checks.
6. PR56/PR57 remain draft with season-grid flag OFF; never treat member-wide status as canonical, automatically approve on upload, or delete shared private evidence.

**No production SQL writes, Vercel promotion, branch merge, role mutations, direct-write revocation or live data modification are approved by this review PR.**

## 12 November 2026 isolated TEST rehearsal

Applied a staging-only migration `pr79_stage_certificate_and_per_ministry_document_guards` to `Ministry-Registry-Test` (`rtptybxugjhvpfjvcvgw`). Its SQL is versioned under `docs/sql/pr79-staging-tested-certificate-and-verification.CANDIDATE.sql`, and intentionally not deployed to production.

Verified from live TEST catalog (read-only):
- Certificate issuance RPC exists, is **SECURITY INVOKER**, and has EXECUTE for `service_role` but **not** `anon` or `authenticated`.
- Certificate issuance rejects NULL/expired registration and compares against the Asia/Manila civil date, expiration inclusive.
- Ministry verification v2 is SECURITY DEFINER with authenticated EXECUTE, retains active private registry-admin allowlist guard, and requires a linked private recommendation letter **whose Storage object exists** for both New and Renewed.
- The TEST guarded administrator CRUD RPC already exists, with authenticated EXECUTE and an internal private active-admin check.
- Existing TEST assignments are all pending with no letters. This validates fail-closed shape, **not** a successful real verification or issuance.
- Catalog checks and offline CI are **not** independently signed HTTP admin/nonadmin JWT tests, browser verification, or complete Auth/Storage/ACL restore certification.

### Canonical production alias verification

Vercel `www.cowl-dok.online` and `cowl-dok.online` point to READY deployment `dpl_2jhuzHLiLyfXZaPTpHxQZn8mc9Wo`, GitHub `main` SHA `7b6521c`, **not** the current role-aware release baseline `b8082167` or draft PR #79. Draft PR #78 contains independent auth/role-aware corrections on the same release baseline and has not been merged. Reconcile this with site owner before merging or promoting PR #79.

### Safety hold

Do not mark the PR ready for merge merely because offline CI passes. Production has neither the guarded write RPC nor the new certificate function implementation; frontend-first promotion would fail. The approved one-go implementation has staged and documented the backend corrections, with no production data, credentials, Storage objects, permissions, or deployments altered.

## Delayed documentary evidence, audited effective dates and certificate performance (12 November 2026)

Owner-approved policy: first registration/renewal validity lasts one calendar year from its **documented effective event date**, not from the date the private letter is uploaded or the data is entered. Expiration is inclusive on the Asia/Manila civil date. Backdated approvals require an administrator to provide a 12–500-character reason stored with the actor identity, approval timestamp, selected assignment and prior/new states. Future effective dates cannot activate membership; new or renewed approvals require a linked existing private letter. No automatic approval from uploading evidence. Per-ministry decisions are independent; no member-wide shortcut.

Implemented TEST-only `public.registry_verify_ministries_v3(uuid,uuid[],text,date,text)` via migration `pr79_verify_documented_effective_date_audited` (source: `docs/sql/pr79-documented-effective-date.STAGING-TESTED.sql`). Revocable private allowlist and exact per-ministry row locking retained. V3 is called by the PR79 secure Verification UI. Older v2 intentionally remains for staging compatibility until independently authorized release cutover, and Production has **not** been migrated.

A SQL transaction-only TEST rehearsal verified denial for missing authentication, nonadministrator, missing private letter and insufficient backdating reason; then approved an assignment with a synthetic private Storage row, checked the anniversary expiration and explicit audit log, and rolled back everything. Zero synthetic Storage objects and audit records persisted. This does not substitute for signed JWT/real Storage or browser E2E certification.

The member drawer now treats all effective/renewal/expiration fields and ministry status as read-only, starts new pending ministry drafts with NULL start dates, and uses per-ministry current validity for certificate printing. The thumbnail is a deferred, low-resolution canvas with bounded cache, while full-resolution preview/print is rendered only when requested. Certificate artwork and fonts are reused where appropriate without modifying certificate artwork or public status.

**Still NO-GO for Production:** install the approved backend v3, protected member writer and existing PR79 certificate changes in a carefully tested backend-first migration, reconcile live Vercel baseline/PR78, run independent signed Auth/Storage/rollback tests and verify Print/Preview browser behavior. Do not auto-merge or promote this PR because offline CI passes.

## Consolidated staging integration and verification — 12 November 2026

**Code integration complete; production release remains NO-GO.** Draft PR82 was merged into PR79's *integration branch only*, merge commit `eab66ed03931d453729242c02c002036dc38460f`. The PR82 changes consolidate PR78's shared authentication UI, retain server-verified Registry/COWL/Curia role-aware routing, preserve PR81's newer 403/404 utility pages, and restore separate role-unapproved vs authorization-unavailable notices. No direct merge into `main`, release baseline, or production.

### Independently verified

- Vercel preview `dpl_GZssjjWrhrrsM9cLxpG3TTw3A6bu` built READY from `eab66ed` against the PR79 branch, which has scoped TEST Supabase configuration. Canonical `www.cowl-dok.online` remains on `main` commit `7b6521cc`, production deployment `dpl_2jhuzHLiLyfXZaPTpHxQZn8mc9Wo`.
- GitHub PR79 CI workflow run `43175765572` passed every step: TypeScript, no-bypass, effective-date and certificate regression, Studio persistence, annual validity, registration suite, and synthetic-env Next build. The merged PR82 auth integration workflow `43161021425` had already passed. These tests do not exercise genuine Supabase JWTs or private Storage access.
- TEST role records for three designated QA identities: COWL-only viewer, Curia-only viewer, Registry-only administrator; no cross-assigned finance/registry roles. All identities confirmed with password credentials. **No identity emails, passwords, JWTs or key material are recorded in this report.**
- Additional TEST database checks ran under `SET LOCAL ROLE authenticated` with three isolated `request.jwt.claim.sub` values, in transactions ending `ROLLBACK`. Every role saw only its own allowed finance grants; only the Registry identity resolved active administrator status. COWL and Curia identities were denied `registry_admin_member_write_v1` and `registry_verify_ministries_v3` with SQLSTATE `42501`. **These are SQL role simulations, not signed-JWT/HTTP tests.** The owner reported successful role-based preview sign-in; independent negative browser assertions remain to be captured.
- Current TEST database has guarded `registry_admin_member_write_v1` and audited `registry_verify_ministries_v3`, private letter attachment v2, and corrected certificate issuance eligibility. Production still **lacks** both v1 writer and v3 verification. Production certificate issuance still permits NULL expiration and incorrectly cuts off issuance 30 days early; TEST rejects NULL/expired registration using the inclusive Asia/Manila date. Authenticated/anon lack direct certificate allocator EXECUTE.

### Mandatory remaining release blockers (not optional)

1. **Backend-first production migration:** review the existing PR79 guarded writer/v3/certificate candidates as versioned migration(s), enforce legacy v2 evidence compatibility, rehearse exact production-schema preflight, and run controlled staging migration replay. Do not execute `REVIEW-ONLY` source files; they intentionally raise a stop exception. No production DDL, grants, DML, or certificate function replacements were performed during this audit.
2. **Real identity/Storage QA:** separately signed HTTP tests for active Registry, COWL-only, Curia-only, unassigned/revoked, anonymous; confirm negative direct navigation to the other financial workspace, private member-documents Storage denial/approval, nonadmin writer/v3 denial, admin CRUD/CSV/batch upload/verification, and no financial writes. Browser tests must cover role-aware redirects, invitation/recovery, mobile/tablet and accessibility.
3. **Certificate and recovery QA:** document evidence date/backdating and independent ministry expiry, save/reload Certificate Studio, normal/full-quality PDF/QR/signatories, revoke nonadmin settings writes, independently mirror TEST public certificate assets (TEST still references Production public URLs), restore database **and** Auth, private Storage bytes, roles/ACL; certify rollback.
4. **Release safety:** account for divergence between `main` and release baseline, freeze the exact reviewed head and SQL checksums, obtain explicit owner go/no-go, apply approved backward-compatible backend migration before frontend, smoke-test, then consider removing legacy direct writes, with prior deploy/DB restore path ready.
5. **Feature limits:** PR56/PR57 season-grid stays OFF; Financial Stewardship is read-only prototype, not accounting ledger. PR55 and PR78 historical draft PRs must not be blindly merged into this branch.

**Disposition:** Authentication UI integration **PASS in staging**; database role-scoped SQL simulation **PASS**; production deployment **BLOCKED** until critical signed Auth/Storage and migration/recovery gates are completed.
