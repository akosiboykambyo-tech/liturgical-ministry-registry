# Running the real HTTP + concurrency test

PR #53 includes `npm run test:secure-registration:http`, an executable **opt-in** integration harness. It sends an invalid bearer token (expects HTTP 401), launches two simultaneous HTTP registrations with **one idempotency UUID** (expects one `created` and one `replayed` with identical member IDs), checks a conflicting reuse (HTTP 409), and verifies subsequent matching registrations receive persisted review IDs.

**This is not yet a complete two-different-key collision test or a substitute for a multi-connection database stress test.** The harness is executable but **has not been run** because the isolated test fixture does not have a real Auth administrator session available. It creates permanent **fictional** test records when run; do not run it against any real member database.

## Preconditions

1. Provision an Auth user in **Ministry-Registry-Test** only and configure the fictional test SQL admin identity accordingly, after security review. The SQL v3 function currently hard-codes a fictional subject and is not a deployable production authorization mechanism.
2. Point local `.env.local` Supabase settings **only** to `rtptybxugjhvpfjvcvgw.supabase.co`, set `SECURE_REGISTRATION_ENABLED=true`, `SECURE_REGISTRATION_TEST_PROJECT=rtptybxugjhvpfjvcvgw`, `SECURE_REGISTRATION_ATOMIC_RPC=atomic_registration_v3`, and `SECURE_REGISTRATION_ADMIN_UID` to the same authorized test Auth UUID. Never copy these test flags to Vercel or production.
3. Start a local Next.js server (`npm run dev`).
4. In another PowerShell terminal, set `SECURE_REGISTRATION_TEST_BASE_URL=http://localhost:3000`, `SECURE_REGISTRATION_TEST_ACCESS_TOKEN` to the test-only access token, `SECURE_REGISTRATION_RUN_WRITE_TESTS=I_ACCEPT_TEST_DATABASE_WRITES`, and `NEXT_PUBLIC_SUPABASE_URL` and `SECURE_REGISTRATION_TEST_PROJECT` to the isolated test project; execute `npm run test:secure-registration:http`. Do not commit access tokens.

The harness refuses to run unless the target HTTP URL is loopback, the backend Supabase URL is exactly the isolated test project, a bearer token is supplied, and explicit test-write consent is set.

## Outstanding

This test is not executable with the current hard-coded fictional DB administrator without a corresponding actual test Auth user and correct credentials. The SQL-first simulated JWT tests previously passed, but do not prove HTTP authentication. Still required: two **different idempotency keys** registered simultaneously under genuinely distinct DB connections; rollback and audit checks after each; matching rule equivalence corpus; production compatible migration and authorization.
