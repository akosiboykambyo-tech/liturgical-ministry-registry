# PR55 — 2026-11-03 non-administrator denial test checkpoint

## Scope and results

Isolated `Ministry-Registry-Test` environment was checked using the current Supabase connection. Database inventory: 3 Auth users, exactly 1 active private administrator grant, 1,008 member rows, 12 ministry-assignment rows, 0 private Storage object rows; the legacy privileged verification/letter RPCs are present.

A test transaction created no users, fixtures, or new permissions. Under `SET LOCAL ROLE authenticated`, with database transaction-scoped JWT-subject settings for the existing granted identity and one of the existing ungranted identities, assertions verified:

- The granted identity maps to `registration_is_admin() = true` and reads the existing 1,008 member and 12 assignment records.
- The ungranted identity maps to `registration_is_admin() = false` and reads zero member and assignment rows under RLS.
- Direct verification and private-letter attachment procedures reject the ungranted identity with SQLSTATE 42501.
- A direct nonadministrator assignment UPDATE cannot affect a row (no privilege or no visible target row).
- No private staging objects were present; a negative document-download test requires a real Storage API fixture.
- Entire transaction was explicitly `ROLLBACK`; no registry data was committed.

**Result: PASS for database-impersonation authorization tests.** These are not fresh real HTTP/JWT sessions.

## Previous real HTTP evidence

`docs/pr55-positive-http-staging-e2e-final-evidence-2026-10-29.md` records a real staging Auth/JWT run on October 29 with separate administrator and nonadministrator accounts. The negative test blocked the nonadministrator from reading a synthetic assignment, creating a test fixture or uploading a private letter. The test fixture was subsequently removed. This is historical evidence and is not the same as a new run of the current configuration.

## Fresh real HTTP runner prepared, NOT YET EXECUTED

`scripts/pr55-staging-nonadmin-readonly-http.cjs` and `scripts/pr55-run-staging-nonadmin-readonly.ps1` use the existing private staging credentials **locally** and obtain new real JWTs through Supabase Auth. The script is fixed to the staging URL, makes only Auth login, SELECT and authorization-denial RPC calls with nonexistent IDs, never sends or prints credentials, and cannot run without a separate opt-in. Its offline Node syntax and PowerShell parse checks are included in CI.

Run on the operator's Windows PC with the PR55 branch pulled:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\pr55-run-staging-nonadmin-readonly.ps1
```

The runner uses local environment credentials if present, otherwise prompts for the **staging publishable key** and two separate existing **staging Auth** accounts. Never enter production administrator credentials into this test or send credentials to chat. Share only PASS/FAIL/LIMIT lines.

## Outstanding caveats

- The test environment has zero actual private file objects at this checkpoint, so a read-only download denial against a known object is still unproven. A synthetic private PDF fixture (with cleanup) can be used in a separate operator-authorized test.
- Production currently has only the single granted Auth user, so testing a separate real production nonadministrator requires a separately planned and approved identity. Do **not** revoke production's sole administrator.
- A SQL JWT-claim simulation does not prove that the HTTP gateway validates a signed JWT. The new local runner closes that gap only once its operator execution succeeds.
- Legacy CRUD/import replacements, Auth+Storage recovery, and other PR55 release gates remain open; keep PR55 draft and live production UI unchanged.
