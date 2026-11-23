# RC1 consolidated security integration — acceptance and promotion gates

**Prepared:** 2026-11-23 (Asia/Manila)  
**Integrated base:** deployed RC1 `main` at `967eb60eca0386a361b83b3f6f29bcf9d054f2df`  
**Branch:** `integration/rc1-security-consolidation-20261123`  
**Disposition:** REVIEW CANDIDATE — **DO NOT DEPLOY OR PROMOTE TO PRODUCTION YET**.

## What has actually been integrated

- **PR #92, squash `929ae31f0e9b073025396db0b8447cb39f01c701`:** Fail-closed Registry duplicate scans. Rejects direct Supabase query errors, unexpected null/non-array results, incomplete multi-page member lookups, and import-history query failures. Individual registration returns a safe error; the current CSV import handler stops before a write if staging fails. Includes isolated mocked failure tests.
- **PR #90, squash `6e310f806cecb82f2f4b3bef83593a022d3c880f`:** Review-only audit RLS proposal and historical November 20 runbook. SQL is stored in `docs/sql/rc1-audit-log-allowlist-hardening.REVIEW-ONLY.sql`; it is **not** an executable Supabase migration and has not been applied.
- **No remaining historical draft PR was bulk-merged**; Staff and Access #91 stays paused.

These merge commits are on the **integration branch**, not on `main`. A deployment preview is not Production promotion.

## Evidence already available

| Check | Status | Evidence / caveat |
| --- | --- | --- |
| PR #92 original exact-SHA Vercel CI | PASS | `74aea4d`: READY; 85 automated mocked/source tests, 0 failures; TypeScript/Next.js build passed |
| PR #92 code review and mechanical merge | PASS (integration only) | Before merge, 4 changed files, no executable SQL; merge expected-head SHA locked |
| PR #90 change review | PASS (integration only) | 2 review-only documents; no SQL applied |
| November 20 encrypted recovery archive | VERIFIED | Integrity checked independently |
| November 23 isolated **database** restoration | PASS | 1 member, 2 assignments, 4 Auth users/identities, 3 buckets, 38 object metadata rows; NOT Storage object-byte or Auth login restoration |
| Existing TEST vs Production schema parity | **FAIL — different** | TEST has 1,010 members; different triggers, indexes and extra test-only `members` policy |
| Real authenticated role-matrix tests | **OPEN** | No verified signed-in Registry admin / COWL / Curia / revoked sessions in production-shaped disposable target |
| Integrated branch exact-SHA CI | **REQUIRED** | Check after final integration commit |
| Production rollout approval | **OPEN** | Independent security and product owner acceptance and rollback window |

## Do all acceptance testing without mutating existing TEST or PROD

1. **Disposable production-shaped environment:** use the verified November 20 recovery archive and matching managed Supabase Auth and Storage versions. The existing network-isolated PostgreSQL restore only proves database contents: it does not run a complete Auth/Storage API stack. For browser sign-ins use an additional isolated Supabase stack with test-only accounts, configured email redirects and no route to Production. Do not expose the real restored Auth identities to external email systems.
2. **Registry test fixtures:** create a wholly synthetic test Registry administrator and at least one unprivileged test user; do not copy or impersonate real staff. Preserve a before/after fixture count and cleanup procedure. Use a known 1,001+ member fixture set to exercise pagination.
3. **Positive and negative checks:** as an actual signed Registry administrator, verify Add Member and CSV staging, same-parish exact duplicates, different-parish same-name duplicates, similar-name review, and idempotent repeat CSV. Simulate query error and null response on first and later paginated pages: in every case, assert **zero member/assignment/audit writes**, visible failure notice, controls reset, no duplicate queue loss, and no automatic retry. Retest after restoring connectivity. Verify unauthorized and revoked sessions cannot call the write RPC directly, bypassing the UI.
4. **Audit RLS candidate:** in an isolated cloned target only, verify the SQL preflight's exact policy names/count. Run the proposal in one transaction after independent review and a rollback point. Test active Registry admin SELECT, INSERT trigger compatibility; anon/nonadmin/revoked SELECT/INSERT denial; UPDATE/DELETE denial; preserve existing audit history and trigger behavior. Never apply SQL just because a documentation PR was merged.
5. **Privacy/security and accessibility:** no production member identity or signed Storage URL in logs; preserve private buckets; verify mobile admin UI and keyboard focus for errors. No test-personal data may be sent through release logs.
6. **Approval and promotion:** independent reviewer signs the **exact final integration commit** and test evidence; owner approves controlled promotion. Recheck fresh encrypted recovery point and rollback target. Open a normal PR integration → `main`; no automatic merge or production traffic switch before the acceptance matrix passes.

## Non-negotiable release limitations

- **CLIENT CHECK IS NOT A DATABASE INVARIANT.** The secured `registry_admin_member_write_v1('create', …)` route can be called by an authorized client without going through the duplicate-check UI. Database unique indexes cover some exact collisions but not fuzzy/cross-parish identity review. Separately prioritize server-side duplicate arbitration before treating the Registry as duplicate-proof.
- Existing TEST is not a security-equivalent substitute for Production. Successful mock tests do not constitute a genuine signed-session acceptance.
- `docs/release/2026-11-20-rc1-postrelease-four-gate-closure-runbook.md` is an as-of-November-20 historical document; its statement that no recovery archive had yet been produced was true at that time but **was superseded by the November 23 database-only restore PASS**. Other Auth/Storage/management gates remain open.
- Keep #91 Staff and Access separate. No role provisioning or authentication changes were authorized by this consolidation.
