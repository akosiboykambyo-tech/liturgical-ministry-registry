# Phase 3C — Controlled TEST rehearsal readiness (NO DATABASE EXECUTION)

**Current state: readiness prepared, execution not authorized.** This is a procedural runbook, not an applied migration, a backup, or proof of passing signed-JWT tests. Only the GitHub review branch is in scope. No SQL of any kind was run while producing this readiness review.

## Source of truth and target verification

- GitHub branch: `feature/registration-intake-v2-sql-review-20261119`
- Proposed, deliberately blocked SQL: `docs/sql/registration-intake-v2.REVIEW-ONLY.sql`
- Offline static test: `tests/registration-intake-v2-sql-contract.test.cjs`
- TEST Supabase project ID: `rtptybxugjhvpfjvcvgw` (`Ministry-Registry-Test`; PostgreSQL 17.11)
- PRODUCTION project (for explicit denial checks only, **never select for testing**): `zlvofcwnpdzfdnipvbbd` (`Ministry-Database`)
- Actual TEST instance is an independent Supabase project, not an ephemeral Supabase branch; `list_branches` reported none. This fact **does not** imply a known backup or guaranteed recovery point.

## Readiness evidence inspected

1. TEST metadata: `members`, `member_ministries`, `registration_intake_requests`, `registration_intake_reviews`, `registration_allowed_ministries` and `registration_administrators` exist; associated RLS is enabled.
2. Installed TEST extensions: `pgcrypto` and `fuzzystrmatch` in the `extensions` schema. Specific function signatures still require live preflight.
3. `docs/sql/registration-staging-uid.ISOLATED-ONLY.sql` defines `registry_test_private.assign_staging_member_uid()` as a BEFORE INSERT trigger function, using `extensions.gen_random_bytes(24)`, generating an `LMD-<year>-XXXX-XXXX-XXXX` value while preserving service year.
4. `docs/pr54-staging-uid-execution-2026-10-24.md` records the TEST installation of `registration_staging_assign_uid` and a synthetic UID insert test **rolled back** in a transaction. This historical document is not a fresh confirmation that the trigger is currently installed/enabled.
5. The source history for `registration_intake_v1` shares the transaction-lock key used in the proposed v2. The legacy `registry_admin_member_write_v1('create'/'create_batch')` path **does not** share that protection; merging/deploying before bypass closure is prohibited.
6. `docs/phase3b-registration-intake-v2-compatibility-plan.md` covers the corrected CSV NULL/header handling and blank-parish candidate issue.
7. The latest user-supplied GitHub Actions screenshot showed the Phase 3B branch check green. That verifies **offline CI**, not database runtime.

## Gate 0 — explicit owner authorization required before any SQL

Obtain a distinct approval covering BOTH of these operations, with the specific TEST project ID:
- READ-only DB inspection via SELECT/catalog function calls to confirm actual trigger, grants, constraints, RLS, v1 function and extension signatures.
- A later, *separately authorized* migration rehearsal (schema DDL and fictional writes) after a restorable TEST backup or disposable copy is verified.

**Do not treat a generic instruction to "start Phase 3C" as authorization to run schema changes, create Auth users, insert/delete fixtures or touch production.**

## Gate 1 — snapshot and recoverability (not verified)

Before running DDL, confirm available backup type, point-in-time recovery or a disposable clone; verify a recent restore test; record TEST-only recovery owner and how to roll back safely. No backup facility or restore succeeded during this review. If recoverability is unavailable, do NOT modify the existing TEST project. Choose a disposable isolated database first.

## Gate 2 — technical DB preflight (requires READ-only SQL permission)

Capture, without disclosing account details:
- Trigger names, enable flags and `pg_get_triggerdef` on `public.members`, plus `pg_get_functiondef` for the UID generator and review/RPC functions.
- Exact `pg_proc` signatures and definer ownership of v1, v2 (if present), `extensions.digest(bytea,text)`, `extensions.levenshtein(text,text)`.
- Actual grants on `public.members`, `member_ministries`, the existing private review/ledger tables and relevant RPCs; confirm no unauthorized direct browser insert permissions.
- Current index/constraint names, existing columns, duplicate review constraints, migration history and row estimates. Abort if any v2 schema objects already exist unexpectedly.
- Existing synthetic fixtures and user-grant counts without printing personal data, passwords, tokens, member names or real IDs into logs.

## Gate 3 — create migration candidate (not applied)

Use the installed Supabase CLI's `supabase migration new` command (discover exact syntax via `supabase --help`), generating the real filename; do not guess a timestamp. Move the reviewed DDL/function SQL into that file after reviewer signoff, excluding the deliberate `REVIEW ONLY` stopper **only in the approved migration copy**. Do not modify the guarded reference draft. Review the SQL diff for privileges, lock scope, dependency checks and schema objects. Dry-run/parse in a disposable database before considering TEST. An offline static test alone cannot certify valid SQL.

## Gate 4 — isolated TEST execution (requires separate explicit write approval)

- Apply the reviewed versioned migration **only** to the target TEST project, record migration ID and schema diffs.
- Use only synthetic identities. Execute active-admin, revoked-admin, ungranted-admin and anonymous JWT tests through the application API. Service-role credentials must never appear in browser code.
- Validate unique member creation with notes and multiple Pending Verification ministry assignments; generated UID must be database-assigned.
- Validate same request UUID replay vs modified fingerprint conflict (including notes); same CSV source key with a changed UUID; malformed input; cross-parish/fuzzy/blank-parish/Unicode matching.
- Validate concurrent distinct UUIDs for the same person, ensuring at most one new UID, and full transaction rollback after forced failures.
- Confirm a review record persists across reload, records all candidates/count, and replays identically. Do **not** use `registration_resolve_review_v1('approved')` as a member-merge or second-person authorization.
- Confirm old `create`, `create_batch` and CSV `Keep separate` routes are still dangerous until the coordinated cutover; do NOT activate v2 in frontend while those routes remain writable.

## Gate 5 — evidence, cleanup, release no-go

Capture before/after counts, TEST ref, Git SHA, SQLSTATE, permitted role, fake request UUIDs, test case IDs, concurrency outcomes and cleanup evidence. Redact JWTs and personal data. Restore the disposable database or delete ONLY specifically approved synthetic fixtures after verifying dependencies; do not delete unrelated TEST data.

**Blocked:** production SQL, automatic merge, branch/PR closure, production Vercel promotion, Auth mutation, direct table writes, release of v2 before legacy bypass closure and audited same-name exception handling.

## Readiness decision

- **PASS:** code/metadata review and TEST project identity confirmed.
- **PARTIAL:** historical UID trigger design and previous rollback evidence located; fresh installed trigger/grants, backup/restore and SQL runtime parsing unverified.
- **NO-GO:** actual TEST DDL, realistic JWT/concurrency writes or any production release without the above individual gates.
