# Isolated security integration test results — 2026-10-24

Scope: `Ministry-Registry-Test` only. No production queries, migrations, or writes.

## Implemented and verified

Applied isolated migration `test_only_atomic_intake_idempotency_fingerprint`:
- Adds `request_fingerprint` to private idempotency records.
- Atomic function computes a SHA-256 digest over normalized identity, parish, canonical ministry array, and service year.
- The serial transaction lock precedes lookup; a replay with a matching fingerprint returns the existing member ID. A reused UUID with different payload raises SQLSTATE `23505`.
- API now returns HTTP 409 on SQLSTATE `23505`; other SQL failures still fail closed.

Executed SQL checks in transactions with `ROLLBACK`:
1. Two-ministry new registration returns `created`.
2. Replaying the same UUID and payload returns `replayed`.
3. Replaying the same UUID with different identity raises `23505`.
4. Temporary trigger deliberately fails on the second ministry insertion. The entire registration operation rolls back, leaving no member from that attempt. The temporary trigger itself was rolled back.
5. Previously verified unauthorized fictional subject is denied and pre-existing fictional duplicate routes to review.

After tests: database has 1,002 fictional members, zero assignment records, zero idempotency records. No retained synthetic registration writes.

## Not verified

- Two independent concurrent database connections: SQL calls performed through the available tool were sequential. Advisory locking is implemented but a parallel race test has not been run.
- Real Supabase Auth token + HTTP request: test project fixture has no provisioned Auth user; SQL tests simulate JWT subject.
- Complete match-rule equivalence: SQL trigram matching differs from JavaScript Levenshtein matching.
- Persistent review queue, audit trail, production UID format, full production schema, production-grade authorization and deployment.
- Input semantics: differing source references with identical member fields are not in the fingerprint; retry semantics must be explicitly defined before release.

Security advisor INFO `rls_enabled_no_policy` on `duplicate_flags`, `import_batches` and `member_ministries` is consistent with this intentionally locked-down fixture; assess again before a production design. See [Supabase lint 0008](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

**Decision:** PR #53 stays draft. Do not enable the feature flag or merge as a production backend.
