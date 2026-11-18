# PR #30 / PR #53 reconciliation against PR #79 — review-only

**Status:** Isolated Git branch only. No production authorization, Supabase changes, deployment, PR closure or merge. Base: `integration/pr55-security-on-release-baseline-20261112`.

## Implemented
- `lib/duplicate-check.ts`: exact-name and cross-parish query errors now throw; failed paginated fuzzy lookup now throws rather than becoming an empty registry; individual intake catches the error and returns a visible `status: "error"`; CSV staging propagates lookup errors; failed import-batch idempotency history lookup now throws.
- `tests/pr30-fail-closed-regression.test.cjs`: five adapted PR #30 tests for exact/parish/pagination failure, CSV staging failure, and healthy empty-registry staging, plus one failed import-history test. Tests assert zero guarded RPC calls on lookup failure.
- `tests/pr53-registry-write-contract.test.cjs`: guarded RPC missing/denied, malformed response rejection, no direct client-write fallback. These tests are **not** concurrency tests.

## Run locally or in a controlled CI environment
```bash
node --test tests/pr30-fail-closed-regression.test.cjs tests/pr53-registry-write-contract.test.cjs
npm run typecheck
npm run build
```
No successful execution is claimed until CI or a local checkout provides results.

## Remaining P0 release gates (NOT implemented or certified)
1. Inspect **actual** `registry_admin_member_write_v1` deployed in isolated TEST, not only `docs/sql/pr79-legacy-crud-rpc.REVIEW-ONLY.sql`; confirm authoritative full-registry matching, permissions, concurrency serialization and transactional rollback. The SQL proposal is not deployment evidence.
2. PR #53's `atomic_registration_v3` request UUID replay and payload-conflict semantics are **not** present as an established contract in the inspected PR #79 client adapter. Design and implement idempotency at the database boundary before claiming parity.
3. Adapt PR #53's isolated localhost HTTP harness to the current RPC and real signed admin, ungranted, revoked and anonymous JWTs. Test simultaneous same-key replay, different-key same-identity race, conflicting payload, and persisted duplicate review. Require explicit isolated-test write opt-in and hard reject production URLs.
4. Verify full-registry lookup under RLS restrictions, pagination partial failure, Unicode/diacritics, cross-parish cases, multi-ministry UID retention and concurrent CSV imports.
5. Verify failed `create_batch` and `flag_duplicate` operations leave no partial records, and verify browser-visible import errors.
6. Verify exact branch commit with TypeScript, build and regression tests, plus backup/restore rehearsal before any production cutover.

## Non-goals and preservation
- Do not cherry-pick PR #30's browser `.from(...).insert()` paths.
- Do not copy PR #53's test-only API endpoint, test project identifier or `atomic_registration_v3` into production.
- Retain PR #30 and PR #53 open until tested equivalents exist and the original PR #53 test-fixture cleanup record is accounted for.
- Do not interpret this branch's tests as proof of deployed backend authorization or concurrency safety.
