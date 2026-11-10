# PR #55 — isolated staging rollback smoke evidence (2026-10-24)

**Database tested:** Ministry-Registry-Test `rtptybxugjhvpfjvcvgw`. No production SQL executed in this validation.

## Tested
A single SQL invocation began a transaction, temporarily replaced `public.registration_intake_v1` with the revised candidate, executed a PL/pgSQL assertion block, and ended with `ROLLBACK`. The SQL tool returned without error.

Assertions passed for:
- authenticated synthetic administrator claim; new member created with generated `LMD-2026-...` UID
- exactly two `Pending Verification` ministry assignments with NULL start and expiry dates
- one-year validity **not started** during initial intake
- idempotent replay returns the same member ID
- short, exact first name with fuzzy surname mismatch routes to manual review
- unknown ministry rejected with `22023`
- unauthorized caller rejected with `42501`

**Rollback verified:** isolated staging count before and after was unchanged: 1,008 members, 8 intake request keys, 4 intake reviews. Query for the unique PR55 test identity returned zero rows. Candidate function definition was not persisted.

## Limits of evidence
- The isolated database is **not schema-faithful** to production. It has a staging-specific UID trigger and lacks production audit triggers, varchar column limits and functional unique indexes.
- This was a sequential SQL transaction smoke test, **not** concurrent HTTP load, real authenticated HTTP, or live revocation race testing.
- The SQL and JavaScript Unicode matching corpus is incomplete.
- PostgreSQL `fuzzystrmatch` is present in isolated staging but absent in production. Production extension installation needs its own separately reviewed migration.
- The candidate proposal and staging SQL remain review-only; this is **not** production deploy authorization.
