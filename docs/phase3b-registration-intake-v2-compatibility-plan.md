# Phase 3B — Registration Intake v2 compatibility and controlled TEST execution plan

**Status: READ-ONLY REVIEW / NO DATABASE EXECUTION PERMITTED.**  
**Target inspected:** Supabase `Ministry-Registry-Test` (`rtptybxugjhvpfjvcvgw`), PostgreSQL 17.11.  
**Source branch:** `feature/registration-intake-v2-sql-review-20261119`.  
**Draft:** `docs/sql/registration-intake-v2.REVIEW-ONLY.sql`, **deliberately aborts before DDL**.  
**Not a migration.** No Supabase SQL (including SELECT), DDL, DML, Auth mutation or deployments were executed in this phase. The inspection used read-only Supabase project metadata tools and prior reviewed v1 implementation evidence.

## A. Live metadata compatibility observations

| Component | TEST metadata | Assessment |
|---|---|---|
| PostgreSQL version | 17.11 | Supports the proposed features; actual v2 parse still unverified |
| Existing migration history | 47 entries, latest PR79 staging migration on 2026-11-12 | No recorded v2 migration; proposal not yet installed |
| `public.members` | UUID PK, unique text `uid`, nullable text `notes`, identity columns, `service_year` | Existing table fits proposed new-member/notes payload |
| `public.member_ministries` | UUID `member_id`, text `ministry`/`status`, FK to members | Fits atomic ministry creation; triggers still require inspection |
| `registry_private.registration_intake_requests` | `request_key` UUID PK, `actor_id`, fingerprint, outcome, member/review ID | Can add source/source_key to existing ledger; not already present |
| `registry_private.registration_intake_reviews` | Existing review ID, request_key, first candidate FK, submitted identity and status | Can add candidate IDs/count, source and notes without making a second queue |
| `registry_private.registration_administrators` | User ID, active, revoked_at | Supports runtime allowlist checks; real JWT tests still required |
| `registry_private.registration_allowed_ministries` | 6 rows, private RLS | Canonical list present; values previously inspected against lib/constants.ts |
| PostgreSQL extensions | `pgcrypto` and `fuzzystrmatch` installed under `extensions` | Expected digest and Levenshtein implementations; specific function signatures added to preflight |
| RLS | Enabled on all named public/private registration tables | Exact grants, definer owner, storage and effective policy behavior need future signed-JWT checks |

Row estimates are approximately 1,009 members, 13 ministry assignments, eight private intake requests and four private reviews. These are TEST metadata, **not** a data-integrity audit. The disparity between member and ministry row estimates requires later fixture/data-quality examination; it does not establish that any particular member is missing an assignment.

## B. Defects corrected in the review-only SQL

1. **NULL CSV keys passed a CHECK constraint.** PostgreSQL CHECK accepts NULL/UNKNOWN. The original `source='csv' AND source_key ~ pattern` was insufficient. The revised ledger constraint explicitly requires `source_key IS NOT NULL`.
2. **The SQL permitted source row 1, although the typed helper prohibits it.** The ledger and RPC now share the same regex accepting rows 2–999,999,999 only, with lowercase SHA-256 digests.
3. **Legacy records with blank parish were skipped by the duplicate candidate query.** That could lead to an unnecessary second UID if names match. v2 now treats blank-parish existing rows as potential same-name candidates. This is a *deliberate conservative divergence from v1* and needs real fixture tests.
4. **Proposed migration had only comments about prerequisites.** A fail-closed `DO $v2_dependencies$` preflight now checks table availability, v1 RPC, and the expected digest and Levenshtein function signatures. The unconditional REVIEW ONLY stopper still runs first.

`tests/registration-intake-v2-sql-contract.test.cjs` now has 20 offline tests, including the strengthened invariants. These are static/source-level checks; they do not prove SQL parsing, extension function runtime, RLS grants or transaction safety.

## C. Current security advisor notices (not newly introduced by v2)

- `rls_enabled_no_policy`: 11 info findings. May represent intentionally private default-deny tables; review individually, do not automatically add public policies.
- `authenticated_security_definer_function_executable`: 10 warnings. These functions require explicit internal authorization review. v2 would itself be a guarded, authenticated-callable SECURITY DEFINER function and must pass live role tests.
- `auth_leaked_password_protection`: 1 warning. Consider production Auth policy separately; this is not the blocker for the registration SQL draft.

Reference: Supabase Database Linter `0029_authenticated_security_definer_function_executable`, `0008_rls_enabled_no_policy`, and Auth password security guidance.

## D. Remaining blockers requiring separate TEST approval

1. **No fresh function/trigger body inspection:** the metadata tools do not return `pg_get_functiondef`, trigger bodies, effective function grants, or the actual insert-UID trigger definition. The prior review observed v1 and a staging UID trigger, but they were not re-executed or revalidated using SQL in this phase.
2. **No PostgreSQL parse/runtime certification:** static checks can miss SQL syntax/PLpgSQL typing issues. The review-only file cannot be run unchanged because its first DO block throws intentionally.
3. **No live JWT/row-level security proof:** active admin, revoked admin, ungranted admin and anonymous tokens need separate authorization and safe TEST fixtures.
4. **Legacy write bypass remains:** `registry_admin_member_write_v1('create'/'create_batch')` and the CSV Keep separate call still bypass v2's global lock. Do not release v2 until these are blocked or redirected in one coordinated release.
5. **Review exception resolver is not implemented:** same-name but genuinely separate people must require a signed, audited one-time administrative case resolution. `registration_resolve_review_v1('approved')` alone does not create or merge people.
6. **Candidate semantics remain review-only:** new matching includes blank-parish legacy rows; candidate arrays are a snapshot and secondary entries have no per-ID foreign keys. Reviewer must revalidate candidates before adjudicating; Unicode, accents and multiple matches need parity tests.
7. **CSV resume manifest absent:** helpers derive a stable SHA-256 + earliest physical data-row source key, but client retry UUID persistence, quoted multiline CSV indexing and pending-case UI remain unwired.
8. **Production parity unverified:** this phase deliberately accessed only Ministry-Registry-Test metadata, not production.

## E. Controlled TEST-only rehearsal — proposed execution order (NOT AUTHORIZED)

**Gate 0 — Owner approval and environment safety**
- Approve a one-time, TEST-only migration rehearsal plus explicitly bounded fictional test writes.
- Verify the expected project ref `rtptybxugjhvpfjvcvgw` and reject `Ministry-Database` (`zlvofcwnpdzfdnipvbbd`) in every tool/fixture.
- Verify/test a recoverable TEST backup or disposable clone; record the current schema/migration baseline.
- Inventory synthetic signed users (active admin, revoked admin, authenticated nonadmin) and dedicated fixture names. Do not expose tokens/secrets in logs.

**Gate 1 — Read-only technical due diligence, after approval to run queries**
- Inspect `pg_get_functiondef` for v1, the UID-trigger function, review resolution and legacy create actions; verify exact advisory lock key and privileges.
- Inspect effective function ACLs, table grants, uniqueness, RLS policies and existing candidate records. Check the test-only trigger actually converts `PENDING` to a unique UID.
- Check exact extension function signatures, source table constraints and whether any v2-named columns already exist; abort migration if inconsistent.

**Gate 2 — Prepare an actual reviewed migration**
- Use the Supabase CLI `supabase migration new <descriptive-name>` to produce a correctly named migration, **not** a hand-named timestamp and not the `docs/sql` file as-is.
- Remove the intentional stopper **only in the newly reviewed migration copy**, and run a parser/transaction rehearsal against an isolated disposable DB first.
- Record migration diff, schema dependencies, locking/downtime implications, DB owner and grants. Keep an explicit rollback/recovery script reviewed separately.

**Gate 3 — Apply to isolated TEST, only after a further explicit execution approval**
- Apply the reviewed migration to TEST only; verify the v2 signature and grants, new ledger/review columns and index, and absence of unexpected DDL.
- Execute realistic JWT HTTP tests with synthetic records: denied anon, denied authenticated nonadmin, denied revoked admin, successful authorized admin.
- Validate idempotency: identical request UUID replay; changed notes/source with same UUID fail; same CSV source but changed UUID fail.
- Validate exact, different-parish, fuzzy, numeric suffix, Unicode/diacritics, blank-parish legacy rows, >20 candidates, source row 1 rejection, and multi-ministry Pending Verification.
- Validate simultaneous different-key same-person requests and rollback on forced failure; record before/after row, audit and review counts.
- Check v1/legacy behavior explicitly: v2's lock does not stop old `create`/`create_batch` until the latter are hardened or disabled.

**Gate 4 — Cleanup, evidence and no-go rules**
- Track synthetic IDs and review cases per test; delete only approved fixtures or restore the disposable clone. Never delete unrelated TEST data.
- Collect redacted HTTP status, SQLSTATE, request UUID, actor role, review ID, UID outcomes, counts and audit events. Never record raw JWTs or personal data.
- No frontend activation, branch merge, production migration or PR closure until backend + UI integration, durable review, legacy bypass closure and rollback readiness are independently approved.

## F. Decision

**Phase 3B read-only compatibility: conditional PASS for documented schema shape, extensions and migration layout.**  
**SQL execution readiness: NOT YET APPROVED / NOT CERTIFIED.**  
Next recommended action: obtain owner review of the SQL diff and the execution plan, resolve the remaining v1/trigger/privilege unknowns, then request separate TEST-only execution authorization.

This document is evidence of a metadata/design review, **not a successful database rehearsal**.
