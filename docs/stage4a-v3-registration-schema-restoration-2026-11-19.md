# Stage 4A — V3 registration schema restoration: baseline and safety gates

**Date:** 19 November 2026 (Asia/Manila)  
**Scope:** READ-ONLY assessment of the historical `atomic_registration_v3` registration-intake experiment in isolated `Ministry-Registry-Test` (`rtptybxugjhvpfjvcvgw`).  
**Production:** `Ministry-Database` (`zlvofcwnpdzfdnipvbbd`) **must not be changed** in this stage.  
**Decision:** **NO DDL/NO DATA MIGRATION YET.** The V3 intake schema is already present in isolated staging. Re-running old creation SQL would be unnecessary, and copying it to production would preserve obsolete authorization. This is a restoration *baseline*, not a release sign-off.

## Verified database state (19 November 2026)

| Object / condition | Isolated staging result |
| --- | --- |
| `public.atomic_registration_v3(...)` | Exists, SQL `SECURITY INVOKER` wrapper |
| `registry_test_private.atomic_registration_v3(...)` | Exists, PL/pgSQL `SECURITY DEFINER` |
| Existing V3 migration history | `20261024091457 test_registry_atomic_v3_persist_review`, `20261024093346 test_registration_v3_real_admin_uid` |
| `registry_test_private.intake_requests` | Exists; **2** rows; primary key on `request_key`, FK to `public.members`; RLS **disabled** |
| `registry_test_private.intake_reviews` | Exists; **3** rows; primary key on `id`, unique `request_key`; RLS enabled |
| Direct `anon`/ `authenticated` table access | Neither role has SELECT or INSERT on those two V3 tables; `authenticated` has private-schema USAGE |
| V3 function EXECUTE | `anon`: denied; `authenticated`: allowed via `public` wrapper and private function |
| `public.members` / `public.member_ministries` | **1,009** / **13** rows |
| Enabled staging member UID trigger | `registration_staging_assign_uid` calling `registry_test_private.assign_staging_member_uid()` |
| Newer `registry_private` intake pipeline | Separate data: 8 intake requests, 4 reviews, 1 review event; do **not** merge into legacy V3 fixture tables |
| Production V3 routine | `atomic_registration_v3` absent from inspected production function catalog |

These results are **catalog/data counts**, not a complete functional, security, or HTTP test. Actual schema parity, authorization, data recovery, and runtime behavior remain **unverified**.

## Critical incompatibilities

1. **Hard-coded administrator check:** the original `registry_test_private.atomic_registration_v3` authorizes one literal Supabase Auth UUID. It does **not** use the newer revocable active administrator grant. This prototype is not appropriate to copy into production.
2. **Legacy access configuration:** `registry_test_private.intake_requests` has RLS disabled. Although direct public role table privileges are denied, security review and a dedicated test are required before any RLS alteration; blindly enabling RLS may affect the historical `SECURITY DEFINER` behavior.
3. **Competing intake models:** `registry_test_private.intake_* / atomic_registration_v3` are old experimental objects; `registry_private.registration_intake_* / registration_intake_v1` belong to the later secure-staging workflow. They cannot be presumed interchangeable.
4. **Matching parity:** the V3 SQL normalizes names and uses a matching helper, but exhaustive SQL-vs-JavaScript parity for Unicode, fuzzy matching and digit safeguards has not been certified.
5. **Annual validity:** V3 inserts `Pending Verification` assignments without establishing expiry. Future verified/renewed assignments must be governed by the separately approved per-ministry one-calendar-year policy, not retroactively backfilled.
6. **Schema source of truth:** Historical V3 routines exist in staging migration history, but an approved, canonical V3 **restoration artifact/DDL** has not been identified on the current default repository branch.

## Stage 4A execution gates

- [x] Identify isolated staging and production projects; do not confuse them.
- [x] Inspect V3 functions, table existence, key constraints, RLS, triggers, privileges and row counts **read-only**.
- [x] Verify original V3 fixture counts have not disappeared compared with 24 October 2026 documentation (2 intake requests; 3 reviews).
- [x] Publish repeatable **read-only** verification SQL: `docs/sql/stage4a-v3-registration-baseline.READONLY.sql`.
- [ ] Explicitly select **canonical** target design: restore historical V3 prototype solely for archival tests, or port its desired behavior to the newer revocable-admin `registration_intake_v1` architecture.
- [ ] Obtain/verify a clean, recoverable isolated database backup and a schema-faithful clone; capture extension, Auth, role, grants, Storage, and trigger dependencies.
- [ ] Produce an idempotent, forward-only **candidate** migration based on approved schema diff, with explicit rollback and no data replacement; never use `DROP ... CASCADE` or blanket `TRUNCATE`.
- [ ] Run positive/negative authorization with real JWTs, impersonation/revocation, request replay/conflict, competing/concurrent requests, duplicate-to-review, review disposition/audit, FK and RLS checks against a clone.
- [ ] Reconcile existing V3 fixtures against the newer intake pipeline without merging/overwriting historical records.
- [ ] Independently validate one-calendar-year per-ministry validity, missing dates, public status and certificate gating before any release.
- [ ] Security advisor review and regression testing; obtain separate authorization for any production migration.

## Decisions & open questions

**Recorded decision:** Preserve existing V3 staging objects and historical fixtures. Do not re-create, delete, move, backfill, grant new execution rights, change RLS, or touch production as part of the baseline.

**Open question A:** Does "V3 restoration" refer to preserving the historical `atomic_registration_v3` prototype, or to restoring the current *intended* registration schema using modern authorization? These are different migrations; this read-only audit covers the historical V3 intake objects.

**Open question B:** Which exact schema snapshot/approved migration is the canonical expected target? An applied migration name alone is not a sufficiently reviewed DDL contract.

**Open question C:** Which isolated fixture data and prior review events must be retained for regression, retention, or rollback evidence?

**Release status:** **BLOCKED for schema write / production cutover pending design selection and security gates.** No Supabase mutation, GitHub main merge, Vercel deployment or public enablement was performed by this Stage 4A baseline.

## Evidence / related work

- `docs/pr54-staging-readonly-check-2026-10-24.md` — previously recorded exactly 2 historical requests and 3 review records, plus earlier RLS warning.
- `docs/pr54-integration-execution-blockers.md` — staging authentication, revocation and release safeguards.
- `docs/pr54-staging-http-gate.md` — isolated environment and production-disable controls.
- PR #54 — secure registration staging infrastructure.
- PR #55 and PR #79 — newer revocable administrator permissions and per-ministry write/validity integration; follow their release gates, not legacy V3 privileges.
- Supabase test project read-only introspection on 19 November 2026.
