## 2026-10-25 — real staging Auth/JWT HTTP smoke PASSED (installed RPC)

**Operator ran** `scripts/pr55-staging-http-jwt-smoke.cjs` with the isolated staging publishable key and verified staging Auth credentials. Output:

```text
PASS: isolated staging HTTP/JWT configuration accepted; NO requests made
PASS: anonymous registration RPC denied by HTTP status 401
PASS: invalid bearer JWT denied by HTTP status 401
PASS: real staging Auth issued JWT
PASS: real bearer JWT verified by staging Auth
PASS: real JWT maps to active staging registration administrator
PASS: authenticated RPC reaches server-side validation; invalid request rejected without writes
LIMIT: candidate function is transaction-local in race tests; HTTP checks currently installed staging RPC
LIMIT: no non-admin JWT, committed revocation via HTTP, or valid-write registration tested
```

**Independent read-only staging verification after this successful run:** member count 1,008; member-ministry assignment count 12; 8 intake requests; 4 reviews; one active staging administrator; no persisted synthetic PR55 test members or disposable probe tables. Real staging login is no longer blocked: the previous `invalid_credentials` result was a credential-entry issue now resolved. Historical notes further down the runbook describe earlier failed attempts, not current test status.

**Scope and release decision:** Real JWT issued and recognized, current *installed staging* registration RPC rejects invalid payloads without registering members. This does **not** certify latest PR55 candidate HTTP/JWT integration because its `FOR SHARE` version has only been installed transaction-locally during PostgreSQL race tests. No non-admin Auth user, production migration, production backup/restore, or final Add Member/CSV integration is certified. Keep release decision NO-GO until those gates are verified. Production untouched.

---

## 2026-10-25 staging real HTTP/JWT verification — partial PASS; Auth login blocked

Operator ran `scripts/pr55-staging-http-jwt-smoke.cjs` against the fixed isolated staging origin with its publishable key. Results:

```text
PASS: isolated staging HTTP/JWT configuration accepted; NO requests made
PASS: anonymous registration RPC denied by HTTP status 401
PASS: invalid bearer JWT denied by HTTP status 401
FAIL: Real staging Auth sign-in failed; HTTP 400 (details redacted)
```

**Read-only independent root cause:** The supplied login email matches the **only** staging Auth user; it has a confirmed email, password hash and email identity, and is not banned. Staging `auth_logs` recorded `POST /token` HTTP 400 with `error_code=invalid_credentials`. The session did not reach the authenticated admin self-check or candidate registration RPC. No data mutations or production operations resulted.

**Resolution:** The operator must use the *staging Auth user's actual password*, which is distinct from both the Supabase dashboard account password and the PostgreSQL database password. If unknown, perform a **staging Auth-user password recovery/reset** through a supported authenticated admin/recovery flow. Do not rotate Postgres credentials, request secrets or create production users. The publishable key is a client key, **not** a service-role/secret key. Do not repeat password sign-in failures or disclose any credentials.

The smoke script now maps only specifically allowlisted Auth error codes to redacted, actionable diagnostics. After the staging Auth user password is confirmed/recovered, rerun the script and preserve anonymized PASS/FAIL evidence. Even if it passes, remember it exercises the **older installed staging RPC**, not the latest transaction-local candidate, and is only a prerequisite for latest-candidate HTTP integration tests.

---

## Verified staging gate — 2026-10-25: COMMITTED grant revocation PASS

**Operator-reported live PostgreSQL result: PASS**, following the original rollback-only race test and 18/18 offline safety checks:

```text
PASS: two distinct PostgreSQL backend sessions connected
PASS: candidate RPC blocked by simultaneous uncommitted grant revocation
PASS: RPC create/replay after revoked transaction rolled back
PASS: no persistent member/administrator changes; both transactions rolled back
PASS: disposable staging grant revocation COMMITTED while candidate was waiting
PASS: candidate denied intake with SQLSTATE 42501 after committed revocation
CHECK: disposable committed-revocation table removed
```

**Independent read-only staging verification performed afterward** via Supabase:
- `public.members`: **1,008**; `public.member_ministries`: **12**.
- Private intake requests: **8**; reviews: **4**; active admins: **1**.
- No persisted `PR55LOCK%` or `PR55COMMIT%` synthetic members.
- No `registry_private.pr55_admin_probe_%` relations.
- `public.registration_intake_v1` persisted definition has **no** disposable probe-table reference and **no** `FOR SHARE`; the function with the fixed grant lock existed only inside B's rolled-back transaction. The earlier staging RPC remains installed.

**Interpretation:** The candidate's authorization check correctly denies an intake once a shadow grant revocation commits while the competing intake is blocked. This is a controlled regression of the actual candidate definition with its single grant-table reference redirected to a disposable table. It does **not** prove a committed change to the real administrator table (that user was intentionally protected), real authenticated HTTP, JWT revocation, or production application readiness.

**Remaining gates:** run `scripts/pr55-staging-http-jwt-smoke.cjs` against real Supabase Auth with staging-only user credentials and publishable key; confirm current function's API authorization. Then rehearse latest candidate in an explicitly isolated environment, review/approve a versioned production migration and grants, verify backup+restore, and evaluate rollout / rollback safety. Keep production NO-GO until each required gate has evidence.

---

## 2026-10-25 additional gating work: committed revocation and real HTTP/JWT

**Do not declare either of these tests passed until the operator provides successful output.** These extra gates supplement, not replace, the two-session rollback test already passed.

### Disposable committed-revocation probe — no real staging administrator toggled

`scripts/pr55-staging-two-session-test.cjs --committed-probe` first reruns the existing two-session test. It then creates one short-lived, randomly named `registry_private.pr55_admin_probe_...` grant table in isolated staging only. The candidate function is transactionally replaced with a copy identical *except that its single administrator-grant table reference points to this disposable table*. Session A revokes that disposable grant and **COMMITS** while session B is demonstrably blocked; session B must receive `42501` upon the commit. Then the transactionally changed function is rolled back and the disposable table is dropped. The real `registry_private.registration_administrators` table is **never** altered. `--committed-probe` requires an additional `PR55_ALLOW_COMMITTED_PROBE=I_ACCEPT_DISPOSABLE_STAGING_SCHEMA_WRITES` opt-in in addition to the original staging test opt-in.

**Operator PowerShell** (uses a credential dialog that already worked on this Windows machine):

```powershell
git pull --ff-only origin fix/production-registration-compatibility
node --test .\tests\production-registration-two-session-guard.test.cjs

$credential = Get-Credential -UserName "postgres.rtptybxugjhvpfjvcvgw" -Message "Ministry-Registry-Test DATABASE password"
try {
    $password = $credential.GetNetworkCredential().Password
    $env:PR55_STAGING_DATABASE_URL = "postgresql://postgres.rtptybxugjhvpfjvcvgw:$([uri]::EscapeDataString($password))@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require"
    $env:PR55_ALLOW_TWO_SESSION_TEST = "I_ACCEPT_ISOLATED_STAGING_ROLLBACK_TESTS"
    $env:PR55_ALLOW_COMMITTED_PROBE = "I_ACCEPT_DISPOSABLE_STAGING_SCHEMA_WRITES"
    node .\scripts\pr55-staging-two-session-test.cjs --validate-config
    if ($LASTEXITCODE -ne 0) { throw "Staging config refused" }
    node .\scripts\pr55-staging-two-session-test.cjs --committed-probe
    if ($LASTEXITCODE -ne 0) { throw "Committed revocation staging regression failed" }
}
finally {
    Remove-Item Env:\PR55_STAGING_DATABASE_URL,Env:\PR55_ALLOW_TWO_SESSION_TEST,Env:\PR55_ALLOW_COMMITTED_PROBE -ErrorAction SilentlyContinue
    Remove-Variable credential,password -ErrorAction SilentlyContinue
}
```

A crashed process may leave behind only the disposable `pr55_admin_probe_...` test table. Do not delete an object without verifying its exact origin. The script attempts cleanup in `finally` and reports cleanup failures.

### Staging HTTP/JWT smoke (read-only or intentionally invalid input)

`scripts/pr55-staging-http-jwt-smoke.cjs` uses the **fixed staging origin** and a `sb_publishable_` key. It signs in through Supabase Auth using an existing **staging Auth user email/password**, checks an anonymous RPC is denied, verifies an invalid JWT is denied, validates a real JWT using `/auth/v1/user`, calls `registration_is_admin` and attempts an **intentionally invalid** registration request that must return `22023` before any member writes. It refuses to run without `PR55_ALLOW_HTTP_TEST=I_ACCEPT_READONLY_STAGING_HTTP_JWT_TEST`. Never use the database password here: **Auth-user password and database password are unrelated**. The script never prints tokens or passwords, and has no valid-member-create path.

Configure `PR55_STAGING_PUBLISHABLE_KEY` locally from the isolated test project's Connect or Settings → API keys page. Capture staging Auth user email and password using a credential dialog and populate `PR55_STAGING_AUTH_EMAIL` and `PR55_STAGING_AUTH_PASSWORD` only in the local terminal. Run `node scripts/pr55-staging-http-jwt-smoke.cjs --validate-config` first, followed by the command without the validation flag. Clear environment variables and credential objects immediately afterward. Do not paste keys, tokens, emails, passwords, full URLs with credentials, or auth errors into the PR or chat.

The current live staging function is **older than the transaction-local candidate**. Passing an HTTP smoke test of that installed function proves network/JWT plumbing only; it does **not** prove the final candidate's HTTP behavior. A full GO also requires an explicitly scoped integration rehearsal of the latest function and route, a real unauthorized-user JWT, and production-specific backup/grant review. No automatic staging/prod activation is performed by these scripts.

### Credential-free GitHub Actions

`.github/workflows/pr55-registration-gates.yml` runs `npm ci --ignore-scripts`, registration tests, PR55 offline safety tests and `npm run typecheck` on a GitHub runner with read-only repository permissions and pinned action SHAs. It has **no** Supabase/Vercel credentials, cannot mutate staging or production, and is not evidence of HTTP or live database races.

---

## Latest verified staging gate — 2026-10-25

**PASS — actual two-session PostgreSQL race test on isolated `Ministry-Registry-Test`.** The operator ran `node scripts/pr55-staging-two-session-test.cjs` through the project's IPv4 **Session pooler** on port **5432**, with credentials captured using Windows `Get-Credential`. The harness printed:

- `PASS: isolated staging SESSION POOLER connection configuration accepted; NO connection made` (offline preflight).
- `PASS: two distinct PostgreSQL backend sessions connected`.
- `CHECK: candidate function installed transaction-locally in session B`.
- `CHECK: session A holds an uncommitted staging grant revocation`.
- `CHECK: candidate function blocked on the administrator grant lock`.
- `PASS: candidate RPC blocked by simultaneous uncommitted grant revocation`.
- `PASS: RPC create/replay after revoked transaction rolled back`.
- `PASS: no persistent member/administrator changes; both transactions rolled back`.
- `LIMIT: committed revocation and authenticated HTTP races still require separate QA`.

**Independent post-run staging snapshot via read-only Supabase inspection:** 1,008 members, 12 ministry assignments, 8 intake requests, 4 intake reviews, **one active staging administrator**, and **zero** `PR55LOCK%` synthetic members. These match the earlier baseline. This validates the rollback result independently of harness output.

The earlier `password authentication failed` failures were **resolved** by capturing the staging database password through Windows `Get-Credential`, then successfully running the script. Supabase password resets/support are **not presently required** for this project. Previous troubleshooting notes later in this runbook are historical and superseded by this PASS record.

**Residual NO-GO gates:** committed administrator revocation under overlapping sessions; genuine authenticated HTTP/JWT authorization tests; production migration/RLS/grant/privilege review; backup-and-restore rehearsal; safe deployment plan and separate Add Member/CSV activation. The tested staging function was only installed transaction-locally, not permanently deployed. Do not merge this draft PR or deploy its candidate SQL to production based on this result alone.

---

# PR #55 — Staging concurrency and controlled production-release runbook

**Decision: NO-GO (draft only). Updated 2026-10-25.** This is not an authorization to run a production migration, enable feature flags, merge PR #55, or connect the current Add Member/CSV actions. All released registrations must remain disabled until the stated gates are passed.

## Environment separation (do not mix)

| Environment | Supabase project | Permitted use |
|---|---|---|
| Production | `zlvofcwnpdzfdnipvbbd` / Ministry-Database | Read-only audits and catalogue checks until an explicitly approved release |
| Isolated test | `rtptybxugjhvpfjvcvgw` / Ministry-Registry-Test | Synthetic test data, rollback-only SQL, controlled staging tests |
| Vercel | `cowl-dok/liturgical-ministry-registry-dcwd` | PR previews only; no production promotion |

The current staging DB function installed in `public.registration_intake_v1` is an **older revision without the new PR #55 `FOR SHARE` grant lock**. Successful earlier rollback tests only tested the candidate *inside the transaction*. Do not report the permanently installed staging function as updated.

## Real two-session database revocation probe — prepared, NOT executed

Purpose: prove that the exact PR #55 intake candidate waits on an administrator grant row being updated concurrently by a second **independent PostgreSQL backend**. The candidate is installed transactionally in one session only; it is never permanently installed by this test.

- Script: `scripts/pr55-staging-two-session-test.cjs`.
- Requirements: Node.js, the PostgreSQL `psql` command installed on the operator's computer and available in PATH, and a privileged **isolated staging-only** direct Postgres connection URL from Supabase. Never paste credentials, service-role keys, JWTs or passwords into a GitHub issue, chat, terminal transcript, or screenshot.
- Hard fail safety: only `db.rtptybxugjhvpfjvcvgw.supabase.co` is accepted, requires username/password, PostgreSQL TLS and the exact opt-in value below. The production database URL is explicitly refused.
- **PowerShell** on a trusted machine with DB credentials already securely configured:

```powershell
psql --version
# Obtain the DIRECT connection URL for Ministry-Registry-Test from the
# Supabase project database Connect page. Keep the URL PRIVATE.
# Assign it to your shell's PR55_STAGING_DATABASE_URL without logging it.
$env:PR55_ALLOW_TWO_SESSION_TEST = "I_ACCEPT_ISOLATED_STAGING_ROLLBACK_TESTS"
node scripts/pr55-staging-two-session-test.cjs
Remove-Item Env:\PR55_STAGING_DATABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:\PR55_ALLOW_TWO_SESSION_TEST -ErrorAction SilentlyContinue
```

The script first validates that two different PostgreSQL backend PIDs are connected. B opens a transaction and replaces the candidate `registration_intake_v1` inside it. A begins an uncommitted administrator revocation holding the row UPDATE lock. B calls the candidate with a simulated staging-only Auth UID, expects `lock_timeout` from the candidate's `FOR SHARE`, then A rolls back. B successfully creates/replays a unique synthetic record and then rolls back. A verifies there are no persistent synthetic member rows or changed grants. In-process exceptions and disconnection also cause rollback.

**This verifies the grant-lock conflict and recovery after an aborted revocation, NOT a committed revocation race or real authenticated HTTP.** Pending second-tier gates: two real JWT-authenticated HTTP requests with parallel different keys, authenticated admin revocation with a real commit, concurrent duplicate reviews, and final audit/idempotency counts. These should use isolated staging fixtures and an approved cleanup plan.

## 2026-10-25 troubleshooting: session B exited

An operator on Windows completed the original five no-network guard tests (5/5 pass), but the first real harness invocation ended `FAIL: B: psql session ended unexpectedly`. **No SQL concurrency assertion passed.** The initial script failed to surface the actual connection or SQL error. The operator cleared the credentials after the failed run.

A follow-up script revision now:
- Passes explicit `PGHOST`, `PGPORT`, `PGDATABASE=postgres`, `PGUSER=postgres`, `PGPASSWORD` (child-process environment only) and `PGSSLMODE=require` rather than placing a URL into `PGDATABASE`.
- Attaches stage labels, exit categories and safe SQLSTATE diagnostics; arbitrary PostgreSQL stderr remains redacted because it may contain connection secrets or member fields.
- Enforces exact staging host, `postgres` username/database, port 5432, TLS, and refuses arbitrary URL query options. Guard tests now cover those additional cases.
- Leaves production untouched. Re-run the offline guard suite after pulling the latest PR branch.

**Check connectivity first, without entering credentials:**

```powershell
git pull --ff-only origin fix/production-registration-compatibility
node --test .\tests\production-registration-two-session-guard.test.cjs
Test-NetConnection db.rtptybxugjhvpfjvcvgw.supabase.co -Port 5432 | Select-Object ComputerName,TcpTestSucceeded
```

Supabase's direct database endpoint is IPv6-only by default. A failed TCP test can reflect IPv6 support, local firewall or a service outage; it does **not** indicate a registration SQL failure. The official alternative for IPv4-only networks is the **Session pooler**, port **5432**, with username `postgres.rtptybxugjhvpfjvcvgw` and the exact pooler hostname from the isolated project's Connect dialog. The currently committed harness intentionally refuses pooler hosts until a separately reviewed staging-specific allowlist is added; never replace a staging URI with a production URI or use transaction mode at port 6543.

If TCP succeeds, confirm a **read-only** password-prompted `psql` session before rerunning the harness:

```powershell
psql "host=db.rtptybxugjhvpfjvcvgw.supabase.co port=5432 dbname=postgres user=postgres sslmode=require connect_timeout=10" -W -X -q -t -A -c "SELECT current_database(), current_user;"
```

Do not paste the password, full connection URL, or raw error text if it includes credentials into PR comments or support requests. The non-secret error category, SQLSTATE and named stage are sufficient for the next diagnostic step.

## 2026-10-25 IPv4-only local network: use the staging Session pooler

The operator's Windows environment reported `WARNING: Name resolution ... failed` and `TcpTestSucceeded = False` for `db.rtptybxugjhvpfjvcvgw.supabase.co:5432`; seven offline guard tests passed. The direct hostname could not be resolved. Per Supabase's official connection guide, direct connections ordinarily use IPv6, whereas the shared **Session pooler** exposes IPv4 on port **5432** and supports session-scoped state.

The staging-only harness now accepts **either**:
- Direct: `db.rtptybxugjhvpfjvcvgw.supabase.co:5432`, user `postgres`; or
- Shared Session pooler: official **Ministry-Registry-Test** `aws-[INDEX]-ap-northeast-1.pooler.supabase.com:5432` hostname, user `postgres.rtptybxugjhvpfjvcvgw`.

Hostnames must be copied from the test project's **Connect → Session pooler** page. Don't infer an index from the AWS region, and **never** use port `6543` (transaction pooling cannot guarantee persistent database sessions). The harness rejects other hosts, wrong region, wrong tenant, unexpected query options, TLS downgrade or missing explicit opt-in. The script's `--validate-config` argument validates without making a connection or running SQL. Do not share database connection strings or passwords.

Safe operator flow:
1. `git pull --ff-only origin fix/production-registration-compatibility`; run `node --test .\tests\production-registration-two-session-guard.test.cjs`.
2. Open the isolated [Ministry-Registry-Test](https://supabase.com/dashboard/project/rtptybxugjhvpfjvcvgw) project → **Connect** → **Session pooler**. Copy *only the pooler hostname* for the initial network check.
3. Run `Test-NetConnection <YOUR-TEST-POOLER-HOST> -Port 5432` in PowerShell. Stop if the connection still fails.
4. Construct `PR55_STAGING_DATABASE_URL` locally with the **test** pooler username, test DB password encoded for a URI, pooler host, `/postgres` and `?sslmode=require`; do not paste it into chat.
5. Set `PR55_ALLOW_TWO_SESSION_TEST=I_ACCEPT_ISOLATED_STAGING_ROLLBACK_TESTS`; use `node scripts/pr55-staging-two-session-test.cjs --validate-config`, then run without `--validate-config` only when configuration and network checks pass.
6. Report only the sanitized stage and exit category, or the green PASS markers; clear password and environment variables afterward.

This is still **NOT a passed two-session test** until the operator runs the updated harness successfully. Supabase source: https://supabase.com/docs/guides/database/connecting-to-postgres

## 2026-10-25 staging Session-pooler authentication failure

Operator verified 13/13 offline connection guards and `TcpTestSucceeded=True` for the **actual test project's** Session pooler host `aws-0-ap-northeast-1.pooler.supabase.com:5432`. The test `--validate-config` succeeded without connecting. The first attempt to start two real PostgreSQL sessions stopped at `B [PID]` with a **database authentication failure**, before transaction setup or lock assertions. Node subsequently emitted an unhandled `EPIPE` when the harness tried to write `ROLLBACK` to the already-ended child `psql` process.

The harness now treats a failed-login closed `stdin` as an expected error, avoids writing to a stopped process, and preserves the existing redacted connection category. This is a script robustness fix, **not proof of successful login or a passed concurrency test**.

Post-failure read-only staging snapshot: 1,008 members, 12 ministry assignments, 8 intake requests, 4 reviews, one active staging administrator, and zero members with `PR55LOCK%` synthetic names. No registration mutation occurred from this failed invocation.

**Next operator action: use a password-prompted, read-only login independent of the harness**. In PowerShell, in the isolated test project only:

```powershell
psql -X -W -d "host=aws-0-ap-northeast-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.rtptybxugjhvpfjvcvgw sslmode=require connect_timeout=10" -c "SELECT current_database(), current_user;"
```

`-W` prompts for the **Ministry-Registry-Test project database password**; nothing secret is included in command-line arguments or posted to GitHub. If authentication fails, inspect the exact **Connect → Session pooler** host/user and confirm the project database password. Supabase database password is separate from the Dashboard account password. Do not rotate credentials without checking dependent staging clients; never reset the production project. Do not rerun the write-test harness until this read-only connection succeeds. SQLSTATE `28P01` corresponds to invalid password. Supabase references: https://supabase.com/docs/guides/database/connecting-to-postgres and https://supabase.com/docs/guides/troubleshooting/how-do-i-reset-my-supabase-database-password-oTs5sB.

## Migration source, review and operator signoff

- `docs/sql/registration-production-disabled.RELEASE-CANDIDATE.sql` is **deliberately non-executable**: the first `DO` block aborts every run. Removing that guard must require a separately reviewed and authorized versioned Supabase migration. Do not copy-paste it into production.
- The proposal includes the missing `fuzzystrmatch` extension (in `extensions`); five private RLS-enabled tables; exactly six canonical ministries; private admin allowlist; the self-check, intake and review-resolution functions; explicit revocation of table/function permissions.
- Intentionally **no admin user seeded and no `authenticated` EXECUTE grant** on write RPCs. Do not grant until an authenticated staging integration test has passed and operator signoff has been recorded.
- Production currently has `authenticated` table INSERT grants, RLS policies based on a particular Auth UID for registry data, email-JWT-based audit-log policies, and a publicly executable ministry audit trigger function. Assess all existing direct-write and reporting flows before changing grants/policies, and separate remediation of unrelated audit trigger privileges.
- With the real UID function, incoming `Pending Verification` members have NULL validity dates. Verification/renewal is a **separate** validated transition that starts one-year validity from verification/renewal, not from CSV upload or intake.

## Production release gates (all required)

1. **Backup/restore:** confirm a recoverable production backup or point-in-time restore entitlement, retention window and actual restore drill to a distinct nonproduction instance. Record operator, backup ID/time, restore result, planned window and exact return plan. Do not test restores in place against production.
2. **Frozen schema snapshot:** rerun production read-only `pg_constraint`, `pg_trigger`, `pg_proc`, grants, `pg_policies`, extension availability, and member/ministry counts immediately before a release. Stop on drift.
3. **Staging clone:** test against a restored production-schema-compatible environment including UID generator, audit triggers and unique indexes, RLS and authenticated role grants; previous rolled-back overlay passed but is not an independent full restored clone.
4. **Database races:** run a real distinct-backend grant-lock test, committed revoke-before-intake tests, two-key duplicate race, identical-key replay conflict, concurrent reviewer resolution, and rollback-on-failure. Require real session overlap evidence; sequential calls via one connector are not concurrency evidence.
5. **Authenticated HTTP:** use genuine staging-issued JWTs, not SQL-injected claims, with enabled *isolated* staging flags and test HTTP requests. Reject expired/non-admin JWTs; confirm role grants and absence of `anon` access. Verify no service-role secret in the browser.
6. **SQL matching:** preserve 12/12 ordinary parity fixtures and fail-closed UTF-8 4-byte handling until an approved Unicode strategy exists. Verify at production data scale and indexes, recording query times. Stop if data contains unsupported names.
7. **Migration preview:** review owner, default function grants, `SECURITY DEFINER` fixed search path, private table RLS, canonical ministry list and foreign keys. Convert the guarded proposal into a **new uniquely versioned migration** in the project workflow, test apply and rollback on disposable staging, and run database security advisors. Never edit an applied migration in place.
8. **Two-phase production change:** separately authorize schema installation (write RPCs EXECUTE still revoked), then verify deployment/configuration before a second explicit authorization to permit authenticated write RPC. Seed approved administrator Auth UID using a separate audited operator process; never infer it from e-mail or arbitrary user metadata.
9. **Application release:** after backend confirmation, wire *Add Member first*, test full member and two-ministry record with audit and duplicate case. CSV bulk path follows separately with per-row idempotency, progress/resume, review queue and failure recovery. Keep public verification and existing renewal operations unchanged until compatibility QA passes.
10. **Post-deploy observability:** monitor production errors, duplicate review volume, registration response time, function execute grants and trigger/audit counts; record rollback thresholds and responsible operator.

## Rollback and recovery

- **First response to failed activation:** disable the production registration feature gate and revoke newly granted `EXECUTE` on write RPCs using a reviewed emergency migration; do **not** delete existing `members`, `member_ministries`, `audit_logs` or committed registration/review events.
- **Website:** redeploy/promote last verified stable application release if the new server integration is faulty. Preserve public verification and renewals.
- **Database:** treat migrations as generally forward-fix rather than drop-and-recreate. Before removing private tables, export and reconcile all accepted intake requests, unresolved review cases and immutable review events. Do not `DROP EXTENSION fuzzystrmatch` automatically; PostgreSQL objects may depend on it.
- **Audit:** check no orphan `member_ministries`, no blank UIDs, no duplicate intake request keys, and no successful post-revocation privileged operations. Escalate any partial write, unexpected privileged access or audit loss and stop new registration until resolved.
- **Re-enable only** after remediation is retested in staging and separately authorized.

## Current verified status

- PR #55 previous Vercel preview succeeded on commit `9e40f0b`. Later commits will have their own CI status.
- Rollback-only production-trigger overlay previously passed: production UID, three audit events, idempotent replay, duplicate review + event, forced rollback, unauthorized denial.
- 12/12 ordinary SQL-vs-JS name fixtures passed. Incoming or existing four-byte UTF-8 names are guarded fail-closed.
- The two-session harness is committed and syntax checked, **but not yet run**: current connected Supabase SQL invocation behaves serially, and this environment has no authenticated staging direct PostgreSQL session/password or `psql` client.
- No production migrations, grants, RLS policies, member records or application release settings were changed.


## 2026-10-25 staging Session-pooler password verification update

The operator ran password-prompted **read-only** `psql -X -W` against the correct staging-only Session pooler `aws-0-ap-northeast-1.pooler.supabase.com:5432`, specifying `user=postgres.rtptybxugjhvpfjvcvgw`. It failed with `FATAL: password authentication failed for user "postgres"`. This confirms the failure independently of the Node harness and does **not** imply the configured tenant username is wrong: pooler/upstream errors can name the underlying `postgres` role.

Read-only Supabase project logs in the last 24 hours: **three** matching `supavisor_logs` password-authentication failures with `ClientHandler`/`Exchange error` and `auth_query`. No `Validation secrets changed` event was found in that window. The evidence confirms an authentication failure inside the shared pooler path, but **cannot distinguish** an incorrect database password from a managed Supavisor/upstream credential problem.

Before any new test, verify `Connect → Session pooler` project-scoped username/host and the **Ministry-Registry-Test database password** (not the Supabase web dashboard login). If that password is unknown, a staging-only password reset via Database Settings may be necessary, but first identify dependent staging services; do not rotate production credentials. After any rotation, attempt **one** read-only login. If it still fails with verified new credentials, stop resetting and raise a Supabase support ticket with the project ref, approximate timestamps, region, sanitized error `28P01` and pooler logs. A matching known Supavisor-side report exists; see https://github.com/supabase/supabase/issues/43261 and https://supabase.com/docs/guides/troubleshooting/how-do-i-reset-my-supabase-database-password-oTs5sB.

No live concurrency assertion has passed; no production activity occurred.

