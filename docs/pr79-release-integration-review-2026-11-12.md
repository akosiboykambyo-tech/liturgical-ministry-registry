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
5. The release branch diverges from main; PR78 separately repairs login/Finance roles and must not be overwritten. Integrate only from an owner-approved, currently deployed reference after independent checks.
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
