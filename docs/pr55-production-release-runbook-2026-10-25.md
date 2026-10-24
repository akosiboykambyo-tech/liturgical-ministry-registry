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
