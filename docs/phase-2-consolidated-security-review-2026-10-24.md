# Phase 2 consolidated registration security review — 2026-10-24

## Scope and evidence

PR #30 `feature/registration-duplicate-check-safety` (head `1b39459ae5948d2410f2195ed4e50cb5bd14d908`), current repo code and connected isolated Supabase project `Ministry-Registry-Test` only. **Production `Ministry-Database` was not touched.**

This is a combined review of existing offline test evidence plus *read-only* database/configuration checks conducted now. No local PowerShell or full Next.js build was executed in this run. Do not confuse earlier user-reported passes (62 registration + 5 duplicate safety, typecheck and build) with newly executed tests.

## Checks completed

| Check | Evidence | Result |
|---|---|---|
| PR #30 status | GitHub: open, draft; branch contains failure handling and 5 mock tests | PASS (presence) |
| Error handling | Exact/same-name queries throw on Supabase errors; full-registry fetch throws; Add Member returns error; CSV staging error stops import | CODE REVIEW PASS, not live end-to-end |
| Pagination implementation | `fetchAllMembers()` ranges in pages of 1000 | CODE REVIEW PASS; prior isolated SQL verified second page 2 rows |
| Test database fixtures | 1002 fictional `members`; zero ministry rows, duplicate flags, batches, Auth users | PASS |
| RLS enabled | All 4 fixture tables | PASS |
| Browser insert restrictions | `authenticated` has no INSERT on `members` | PASS (writes intentionally impossible) |
| Test preflight | Earlier simulated authorized subject returned 1002, unauthorized subject denied | PRIOR TEST PASS, not current re-execution |
| Security advisor | INFO: RLS enabled, no policies on `duplicate_flags`, `import_batches`, `member_ministries` | EXPECTED test isolation; https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy |
| Registration suites | User previously reported 62 + 5 pass, typecheck and build successful | PRIOR USER-REPORTED PASS |

## Blocking findings

1. **Browser-controlled intake:** `importSingleMember` calls `getSupabaseBrowserClient`, performs lookup then INSERT. No trusted server-controlled authorization/complete visibility guarantee.
2. **Silent RLS filtering:** Authorized-looking successful queries can return incomplete or zero rows when RLS filters members. Error catching alone does not fix this.
3. **Nonatomic intake:** `members` insert and `member_ministries` insert are separate requests; code attempts compensating delete on assignment failure. If cleanup fails, an orphan or partial intake may remain.
4. **Concurrency:** Lookup-then-insert has a TOCTOU race; two simultaneous requests can create distinct UIDs before either detects the other.
5. **Test environment is deliberately read-only:** No actual Auth user and no member insert permission; full application through-the-client scenarios, authenticated session tests, queue persistence, rollback, and concurrency **cannot be honestly marked passed**.
6. **Schema fidelity:** Four minimal fixture tables are not a full clone of the real registry schema, triggers, RPCs, and policies.

## Go/no-go

**NO-GO for merging/activating PR #30 in production yet.** Keep draft. The valuable fail-closed changes should be preserved but need to be integrated into a trusted server-side, atomic registration workflow before production release.

## Next single implementation track

1. Build a test-only server registration endpoint with verified session, trusted admin authorization, complete privileged lookup, idempotency key and a single DB transaction for member+ministries+audit/review decision; never expose service role to the browser.
2. Add a real isolated test admin Auth identity through supported admin workflow; gate authorized access with trusted app metadata/admin mapping, not editable user metadata.
3. Test exact/cross-parish/fuzzy/page-2 match, RLS-hidden rows, denied auth, intentional lookup errors, transaction rollback, racing requests, repeated requests, and CSV paths against the isolated project.
4. Re-run 62+5 suites, typecheck, build, security advisors. Record before/after row counts.
5. Only then mark PR #30 ready for review and make a separate explicit merge decision.

No migrations or application changes are authorized against production by this review.
