# PR55 — Positive real-HTTP synthetic E2E (isolated staging only)

This is a **staging-only test** of the real sequence:
1. Two separate staging users authenticate with real Supabase Auth JWTs.
2. Non-administrator fixture creation is rejected by `42501`; admin creates exactly one synthetic member and two pending ministry assignments via `pr55_e2e_begin_v1`.
3. Non-administrator cannot read either assignment or upload to private Storage.
4. Administrator uploads a harmless generated PDF using the **actual Supabase Storage API** and attaches it using `registry_attach_ministry_letter_v1`.
5. Verify that attachment alone leaves assignment/member status `Pending Verification` and expiry null.
6. Administrator verifies **only the Ministry of Lectors and Commentators** via `registry_verify_ministries_v1`; checks that exactly one assignment becomes `New` with database date + 1 calendar year while the Ministry of Liturgical Music stays pending. Member-wide compatibility status stays pending.
7. In a `finally` block, delete the synthetic member/assignments using an admin-granted, fixture-restricted cleanup RPC and remove the synthetic PDF via the Storage API. Any cleanup problem prints identifiers for safe manual cleanup. No production data touched.

## Isolated staging prerequisite

Install `docs/sql/pr55-staging-positive-e2e-fixture.INSTALL-ISOLATED-ONLY.sql` **only** in `Ministry-Registry-Test` after verifying its guard. It will refuse production-shaped schema, an unexpected count of active admin grants, and missing existing secure verification/letter RPCs. Fixture RPCs have an explicit revocable admin check and are never intended for production. Remove these helper functions after the E2E passes; **do not remove the actual verification or letter RPCs**.

## Run on Windows PowerShell (local secrets only)

On PR55's draft branch with `npm ci` completed, use the **same five staging environment variables** already used for `pr55-staging-verify-rpc-jwt.cjs`. This script has a different, explicit *synthetic staging write* opt-in:

```powershell
$env:PR55_ALLOW_POSITIVE_E2E = "I_ACCEPT_STAGING_SYNTHETIC_WRITES_WITH_CLEANUP"
node .\scripts\pr55-staging-positive-verification-e2e.cjs --validate-config
node .\scripts\pr55-staging-positive-verification-e2e.cjs --run
```

The script explicitly refuses to start if the publishable key, either staging Auth identity or opt-in are absent. It never asks for database passwords, service-role keys, tokens or production credentials.

**Do not share credentials.** Share only sanitized PASS/FAIL output. On cleanup error, retain the synthetic IDs/path shown in output for authorized cleanup; do not blindly rerun or delete unrelated records.

## Release limits

A synthetic HTTP/Storage positive E2E is **not** a production GO decision. Production renewal batch constraints, legacy direct-write closure, admin migration authorization, audited recovery and full restore rehearsal are independently required. No PR merges or production deployment were performed.

## Staging installation completed (October 29, 2026)

- Applied `pr55_staging_positive_http_e2e_fixture_20261029` to isolated staging project only, installing the admin-grant-guarded `pr55_e2e_begin_v1` and `pr55_e2e_finish_v1` helpers.
- Initial cleanup rehearsal revealed the existing staging `registration_staging_assign_uid` trigger rewrites supplied member UIDs. The original cleanup required that supplied UID and therefore rejected its own fixture; the test was rolled back.
- Applied the corrective migration `pr55_staging_positive_e2e_uid_guard_fix_20261029` so cleanup requires the locked synthetic member UUID, exact nonce in `notes`, name, parish, and exactly the two designated ministries. It never deletes a member solely because of a loose UID prefix.
- After the patch, a transaction with real Postgres role `authenticated` and a staging admin claim successfully created and cleaned the synthetic member/assignments. An ungranted role was denied creation and cleanup. Transaction rolled back with no persistent fixtures.
- **Credential-backed real HTTP/Storage positive test still awaits operator invocation.** The earlier real HTTP/JWT denial-only tests passed and do not need repeating. Temporary helper RPCs remain installed **only in staging** for this positive test and must be dropped after successful cleanup and independent verification.
