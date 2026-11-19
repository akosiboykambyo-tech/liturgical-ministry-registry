# Phase 3C — Authorized read-only SQL readiness inspection

**Date:** 2026-11-19 (Asia/Manila)  
**Authorized target:** `Ministry-Registry-Test`, Supabase project `rtptybxugjhvpfjvcvgw`  
**Review branch:** `feature/registration-intake-v2-sql-review-20261119`  
**Scope:** read-only `SELECT` queries of PostgreSQL catalogs, function/trigger definitions, RLS policies, grants, constraints, and non-personal summary counts. **No DDL, DML, migration, Auth change, deployment, merge, or cleanup was executed.** Production was not accessed.

## Executive outcome

**Conditional pass for schema/function prerequisites; NO-GO for a TEST write rehearsal until backup/recovery and explicit write approval.** The installed database has the required v1 RPC, extension signatures, active UID generator, constrained ministry assignments and private intake tables. The proposed v2 function, columns and index do not exist yet, as expected.

## 1. Identity and runtime

- Project name and ID independently rechecked: `Ministry-Registry-Test` / `rtptybxugjhvpfjvcvgw`; status `ACTIVE_HEALTHY`; PostgreSQL **17.11**.
- `public.registration_intake_v1(uuid,text,text,text,text[],integer)` present; `public.registration_intake_v2(uuid,text,text,text,text[],integer,text,text,text)` absent.
- `extensions.digest(bytea,text)` and `extensions.levenshtein(text,text)` resolve successfully.
- No proposed v2 CSV unique index, v2 request-ledger columns or v2 review metadata columns detected, so the proposed additive names do not collide with those surveyed.
- Installed RLS enabled on `public.members`, `public.member_ministries`, `registry_private.registration_intake_requests`, `registry_private.registration_intake_reviews`, `registry_private.registration_review_events`, the admin allowlist and the ministry allowlist.

## 2. UID trigger and per-ministry verification

- `registration_staging_assign_uid` is **enabled** (`tgenabled='O'`) as `BEFORE INSERT ON public.members`, invoking `registry_test_private.assign_staging_member_uid()`.
- Installed UID trigger source uses `extensions.gen_random_bytes(24)`, assigns `LMD-<year>-XXXX-XXXX-XXXX`, loops over possible collisions and fails closed with SQLSTATE `23505` after unsuccessful attempts. It is `SECURITY INVOKER`, owner `postgres`, `search_path=''`.
- The separate member audit trigger `trg_pr55_stage_log_members` is enabled and stores INSERT/UPDATE/DELETE audit snapshots.
- `member_ministries` has an enabled `trg_pr55_ministry_one_year`. Its installed function requires exact one-year expiry for statuses `New`/`Renewed` but returns unchanged for `Pending Verification`; v2's Pending Verification inserts are structurally consistent with this rule.
- Enabled ministry audit and `updated_at` triggers are present.
- `members.uid` has a UNIQUE constraint; `member_ministries(member_id,ministry)` is also UNIQUE and has a FK referencing `members(id)` with ON DELETE CASCADE.

**Read-only confidence only:** trigger text and enabled state were confirmed. No new v2 registration was attempted.

## 3. Function authorization and table grants

- Installed `registration_intake_v1`, `registration_resolve_review_v1` and `registry_admin_member_write_v1` are owned by `postgres`, are `SECURITY DEFINER` with `search_path=''`, and are executable by `authenticated` but not by `anon`. Their function bodies enforce an active, non-revoked registration-administrator allowlist.
- `public.registration_is_admin()` likewise queries the private active, non-revoked allowlist and is used by the member/ministry SELECT RLS policies.
- `authenticated` and `anon` lack direct INSERT/UPDATE/DELETE grants on `public.members`, `public.member_ministries`, and the inspected private intake, review, administrator and allowlist tables. The private schema itself denies USAGE to these browser roles.
- An extra member-read policy `test_admin_read_members` grants SELECT for a specific hard-coded TEST identity rather than using the current allowlist. A boolean-only check found **no existing Auth user matching that identity** and **no active registration-admin grant** for it. This policy is presently dormant, but should be removed/reworked at a separately reviewed TEST security cleanup before promotion; its presence would otherwise confer data access if that identity were later created.
- `registry_test_private` does grant USAGE to `authenticated`; its UID trigger function also has the default function EXECUTE capability for browser roles, although a trigger-returning function is not an ordinary callable registration RPC. Review schema exposure before any release.

**Not certified:** real signed-JWT grants/revocation behavior, Data API schema exposure, owner/trigger permissions under HTTP contexts, or effective RLS for every application endpoint.

## 4. Installed RPC behavior and blockers

- v1 uses transaction-scoped `pg_advisory_xact_lock(hashtextextended('registry_registration_intake_v1',0))`. The proposed v2 draft uses the identical key.
- v1 performs in-function duplicate review, ledger replay and admin authorization. Its `registration_resolve_review_v1('approved')` *only records a review disposition*; it does not create a separate UID or merge ministries.
- **Critical:** `registry_admin_member_write_v1('create')` inserts into `public.members` and creates ministry assignments with no authoritative duplicate search under that lock. `create_batch` invokes the same unsafe create action per row. The CSV Keep Separate workflow is known to use the legacy create action. New v2 cannot be called a fully enforced registration system until this bypass is closed in the coordinated cutover.
- The existing member audit trigger and ministry audit trigger generate entries inside the same triggering transactions. Rollback behavior remains to be tested with synthetic fixtures.

## 5. Non-identifying TEST data health checks

Read-only aggregate counts on `public.members` returned:
- 1,009 members.
- **0** NULL/blank/`PENDING` UIDs.
- **0** blank/null parishes.
- **0** blank/null first or last names.

These counts do not establish matching correctness, uniqueness of natural persons, assignment completeness, or recovery readiness.

## 6. Relevant constraints and indexes

- `registry_private.registration_intake_requests`: PK `request_key`; FK to members/reviews; CHECK restricting outcome to created/review and requiring the corresponding member/review ID.
- `registry_private.registration_intake_reviews`: PK `id`; UNIQUE `request_key`; FK to existing member; status CHECK pending/approved/dismissed.
- `registry_private.registration_review_events`: UNIQUE `review_id`; CHECK approved/dismissed; FK to review.
- New CSV source `(actor_id,source_key)` unique index and additive candidate-review columns are absent, as expected; these are proposed in the **guarded** v2 SQL.
- Source-code static testing passed in earlier GitHub Actions, but **PostgreSQL has not parsed or executed the v2 draft**.

## 7. Decision gates before write approval

1. **Recovery gate (currently unverified):** confirm a restorable TEST snapshot/PITR or a disposable isolated database, recovery owner, and explicit cleanup plan. No Supabase development branches were listed in the metadata inspection. No backup or restore was attempted.
2. **Migration gate:** convert the guarded reference SQL into a separately reviewed migration using official Supabase CLI naming, with DDL diff, privilege audit and signed review. **Do not remove the stopper from `docs/sql/registration-intake-v2.REVIEW-ONLY.sql`.**
3. **JWT and concurrency gate:** prepare fictional identities and documented signed-JWT test steps for active, ungranted, revoked and anonymous callers; repeated UUID/revised notes, identical CSV key with new UUID, duplicate races, Unicode/short names, all-match review and rollback cases.
4. **Legacy cutover gate:** design the eventual coordinated shutdown/guard of `create`, `create_batch` and Keep Separate without breaking unrelated administrative edits. This is a release blocker even if v2 itself passes staging.
5. **Review-policy gate:** validate and separately remove or scope `test_admin_read_members` if no longer needed. Do not adjust RLS merely to make tests pass.
6. **Explicit approval gate:** owner must separately approve any migration DDL and each bounded TEST write/cleanup run. **Phase 3C read-only authorization is not write authorization.**

**Readiness: conditional PASS for prerequisite compatibility. NO-GO for applying SQL or initiating TEST writes.** The next step is to verify recovery and approve a migration rehearsal on an isolated disposable target. No production access or changes are authorized.
