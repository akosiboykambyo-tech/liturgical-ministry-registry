# Isolated atomic-registration SQL probe — 2026-10-24

## Scope

The **test-only** Supabase project `Ministry-Registry-Test` now has `registry_test_private.atomic_registration_probe` and `registry_test_private.intake_requests`. The function uses an explicit fictional admin subject, an advisory transaction lock, a single PostgreSQL function call to create a member, ministry assignment, and idempotency record, and conservative candidate detection based on exact names and pg_trgm similarity. It is `SECURITY DEFINER` in an unexposed schema with the function's EXECUTE grant limited to `authenticated`, and checks `auth.uid()` internally.

**It is intentionally a proof of concept, not a migration and not the production contract.**

## Actually executed in test database

| Scenario | Result |
|---|---|
| Same fictional name in existing registry | Returns `review`, no insertion |
| Unique fictional name | Returns `created` with member UUID |
| Repeat same request UUID | Returns `replayed` with same UUID |
| Unauthorized fictional subject | SQLSTATE 42501 authorization denial |
| SQL test wrapped in `BEGIN ... ROLLBACK` | Fixture unchanged: 1,002 members, 0 ministry rows, 0 intake-request rows |

One first test attempt failed because the restricted caller could not directly SELECT `member_ministries`. The test was corrected without granting direct access. These are **SQL-only checks**; actual Next.js Auth tokens and application end-to-end requests have not been tested.

## Unresolved requirements before enabling PR #53

- SQL fuzzy candidate rules are NOT identical to the JavaScript Levenshtein identity classifier. Reconcile identity policy and false positives before release.
- POC hardcodes a fictional administrator UUID and one ministry; these are not deployable settings. Test full six-ministry canonicalization and robust authorization.
- Hardening: explicitly minimize `SECURITY DEFINER` owner privileges, review function grants/search path and security advisors, ensure no exposed public wrapper or privileged service key in browser.
- Expand race, concurrency, intentional fault injection, transaction rollback on assignment failure, all candidate types, idempotency and audit logging tests.
- Keep feature flag off and server API returning 503. It is **not wired to the SQL probe**, and neither Add Member nor CSV was redirected.
- A reviewed, production-compatible atomic RPC and schema migration are still required, using a separately approved release process.

Production `Ministry-Database` was not queried or changed.
