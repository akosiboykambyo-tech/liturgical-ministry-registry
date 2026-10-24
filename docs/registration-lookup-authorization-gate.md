# Duplicate lookup authorization gate — design and isolated-test findings

**Status:** Draft proposal. Do not merge as an enabled registration feature or execute this proposal against production.

## Verified on `Ministry-Registry-Test` only

The disposable test project contains 1,002 fictional members. On 2026-10-24, a `SECURITY INVOKER` proof-of-concept function `public.registration_lookup_preflight()` was installed in the test project only. It checks an explicitly authorized fictional UUID before counting the *visible* member rows.

- Simulated authorized `authenticated` session: **1,002** visible rows.
- Simulated unauthorized `authenticated` session: raises SQLSTATE `42501` (authorization denial).
- Second page in authorized ordered SQL query: **2** rows.
- No registration writes granted to `authenticated` or `anon`.
- No real Auth user or production credentials were created.

## Critical limitation

The proof-of-concept returns a count of **RLS-visible records**, NOT an independently authoritative total. If policies hide a subset of rows, an authorized user can obtain a successful, incomplete count. Therefore this is **not yet a sufficient production duplicate lookup authorization or completeness guarantee**.

## Production design required

1. Introduce a Next.js server-only registration entrypoint; do not accept browser-submitted claims of administrative privilege.
2. Authenticate each request with a verified Supabase session token via `auth.getUser(token)`, then **authorize the actor** using a trusted server-side administrator allowlist or reviewed admin-role table / `app_metadata`. Never use editable user metadata.
3. Run duplicate discovery through a trusted **server-side** database operation with demonstrably complete member visibility. A client-side empty list is never proof of uniqueness.
4. Prefer a *single transactional intake decision* (detect candidates and either open a review case or insert the new member with assignments and audit event). Use a reviewed database function/locking discipline for concurrent submissions and idempotency.
5. Restrict any privileged database access to the server; service-role credentials must never enter `NEXT_PUBLIC_*` variables, browser bundles or logs. If using a `SECURITY DEFINER` function, keep it in a non-exposed schema, pin `search_path`, revoke default `PUBLIC` execution, check privileges inside the function, and review its owner.
6. All failures (auth, authorization, lookup, incomplete pagination, timeout, transaction) must **stop** UID creation.
7. Move both Add Member and CSV intake onto the same trusted boundary. Do not permit direct browser member creation as a fallback.
8. Verify against isolated fictional data with an actual test Auth user/token, RLS-denied reader, test admin, page-2 match, concurrent requests, and rollback on assignment failure.

## Release gate

PR #30's mocked fail-closed logic is valuable but **not sufficient alone** for production: RLS silently filtering all rows still produces successful empty lookups. Keep #30 draft until the authoritative server operation and database integration tests are complete.

No production member data, SQL, or auth records were modified during this design review.
