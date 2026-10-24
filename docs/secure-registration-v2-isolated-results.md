# Atomic registration v2 — isolated database integration (2026-10-24)

PR #53 now targets the **test-only** `public.atomic_registration_v2` PostgREST wrapper. The public wrapper is SECURITY INVOKER with EXECUTE granted only to `authenticated`; it calls `registry_test_private.atomic_registration_v2`, a SECURITY DEFINER function in a non-exposed schema that explicitly checks the fictional test admin UUID. No service-role secret is used in the Next.js endpoint. Both API and SQL require authorization.

The API strictly requires the test Supabase hostname `rtptybxugjhvpfjvcvgw.supabase.co`, `SECURE_REGISTRATION_TEST_PROJECT` equal to that project ID, `SECURE_REGISTRATION_ATOMIC_RPC=atomic_registration_v2`, `SECURE_REGISTRATION_ADMIN_UID`, and explicit `SECURE_REGISTRATION_ENABLED=true`. These settings should **not** be installed on production; a production hostname is rejected even if its feature flag is enabled.

SQL v2 transaction performs: serial advisory lock; idempotency lookup; authoritative unfiltered duplicate candidate scan; exact canonical ministry validation (six approved values); insert one member and **all** requested ministry assignments; persist idempotency key. Any SQL failure rolls back its writes.

## Actually executed (test project only)
- Existing fictional duplicate → `review`.
- New fictional registrant with two ministries → `created`.
- Same UUID replay → `replayed`, same member ID.
- Standalone `Lector` → rejected.
- Simulated unauthorized JWT user → denied.
- Tests wrapped in transaction rollback; after tests: **1,002 members, 0 assignments, 0 idempotency rows**.

## Explicit release blockers
1. **No actual HTTP/Auth end-to-end test**: SQL identity was simulated via JWT claims in a transaction. There are no working Auth test users configured in this fixture.
2. **Matching divergence**: SQL uses trigrams while the app uses Levenshtein. These have different false-negative/false-positive profiles. Must align before production.
3. **No parallel/concurrent connection test** and no forced failure of the second assignment row yet.
4. **Idempotency payload mismatch not prevented**: same key with different submitted identity replays the original response; store request fingerprint and reject conflicting keys before use.
5. **No persistent manual-review case yet**: `review` is currently an API decision, not a saved queue entry.
6. **No production-compatible migration**, and this fixture lacks production schema details and existing UID generation logic. The SQL implementation is only on the isolated project, not yet versioned as a migration.
7. **Admin authorization is test-only**: the private function checks a fixed fictional UUID, not the registry's production authorization design.
8. **Cannot claim live integration** merely because local unit tests and SQL tests pass independently. Keep PR draft.

Do not wire the current Add Member/CSV flows or enable production.
