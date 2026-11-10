# Production registration compatibility follow-up — 2026-10-24

**Status: NO-GO for production activation.** PR #54 merged as disabled staging infrastructure; this follow-up is also disabled by default. Do not run the staging-only SQL, proposal SQL, or production write tests against the production Supabase project.

## Read-only production evidence

Production project: `zlvofcwnpdzfdnipvbbd` (Ministry-Database). Inspected via catalog-only SELECT queries; no inserts, updates, DDL, GRANT, or migration were executed.

- `public.members`: `first_name` and `last_name` are varchar(100), `parish` varchar(255), `service_year` integer, `status` varchar(30), `uid` varchar(50). `id` defaults to `gen_random_uuid()`.
- `public.member_ministries`: member UUID FK with ON DELETE CASCADE, UNIQUE (member_id, ministry), status check accepts Pending Verification, New, Renewed, Inactive. Dates can be NULL.
- `trg_assign_member_uid` is enabled BEFORE INSERT. `public.assign_member_uid()` replaces `NEW.uid` with `public.generate_member_uid(NEW.service_year)` regardless of supplied sentinel. UID must match `LMD-YYYY-XXXX-XXXX-XXXX`; service year must agree. Neither generator is SECURITY DEFINER.
- AFTER INSERT audit triggers exist on both registry tables: `log_member_changes()` is SECURITY INVOKER; `log_member_ministry_changes()` is SECURITY DEFINER.
- The production `pgcrypto` extension exists under `extensions`. **`fuzzystrmatch` is absent**; `extensions.levenshtein(text,text)` is not available. The proposed SQL **cannot run successfully** without an independently reviewed migration for this dependency or revised match implementation.
- Both tables have RLS enabled. Their current policies permit a particular administrative Auth UID, while `authenticated` still has direct table INSERT grants. Plan transition and check existing Add Member, CSV and updates before revoking any rights.
- There is **no** production `registry_private` schema, registration allowlist or intake RPC. They are not installed by this PR.
- Production contains additional functional unique indexes `unique_member_registry_idx` and `uq_members_name_parish_ministries` on the member table. Application-facing duplicate errors must not automatically be treated as idempotency-key collisions.
- Supabase advisor flags `public.log_member_ministry_changes()` as a publicly executable SECURITY DEFINER function; independently review exposure and revoke unnecessary EXECUTE in a separate tested security migration.

## Code changes in this follow-up

1. Bound submitted first/last names to **100** characters and parish to **255**, both in SQL and staging HTTP validation.
2. Hold a `FOR SHARE` row lock on the active administrator grant until transaction commit/rollback in intake and review disposition. This serializes against a concurrent UPDATE of that authorization row. A revocation already committed is denied.
3. Map SQL validation errors to HTTP 400 and use a generic HTTP 409 for unique conflicts rather than mislabeling all unique violations as idempotency conflicts.

## Still blocking production

1. Review/install the `fuzzystrmatch` dependency in **schema-faithful staging first**; prove the function exists in `extensions`. Do not install on production as part of this PR.
2. Verify SQL vs JavaScript Unicode, casing, whitespace, numeric and Levenshtein parity. PostgreSQL and JS lengths can differ; normalization edge cases remain.
3. Test end-to-end *against a schema-faithful production clone*, including the real UID trigger, member audit (SECURITY INVOKER), ministry audit (SECURITY DEFINER), RLS and existing functional unique indexes. A privileged SECURITY DEFINER registration function owned by `postgres` bypasses RLS, but trigger execution semantics and ownership must still be tested.
4. Test real administrator revocation racing a long-running authorized intake and review. A transaction already holding its grant lock can commit before a pending revocation; define acceptable policy and prove it.
5. Test concurrent different keys, retries, duplicate routing, rollback on failed ministry, audits and review events, and exact six canonical ministry names.
6. Finish a versioned, peer-reviewed production migration, environment gate, backup and rollback plan. Only then consider connecting Add Member and CSV.
7. Audit whether every new member is created with `Pending Verification` and NULL validity dates; one-year validity must start only on later verification/renewal.

**Do not merge this PR as authorization to deploy registration or enable feature flags.** No live application wiring is changed.


## Validation update (after initial inspection)

See `docs/pr55-production-faithful-rollback-evidence-2026-10-24.md`. Production-function/constraint-overlay rollback tests now PASS for UID format, three production audit events, two pending ministry assignments, duplicate review + event, idempotency replay, injected rollback and unauthorized denial. Common whitespace normalization was corrected in SQL, and 12 read-only SQL/JS parity fixtures pass. Four-byte Unicode names now fail closed until parity is resolved.

**Concurrency remains unproven:** database connector SQL requests appeared serialized, so the `FOR SHARE` grant/revocation race cannot be certified from the attempted test. No actual multi-session contention test has passed. Production still lacks `fuzzystrmatch`. The original NO-GO decision remains in force.
