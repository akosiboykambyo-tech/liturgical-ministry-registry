## 2026-10-27 — correct production pooler accepted; read-only-default preflight was overly strict

The operator used the **production dashboard's actual** `aws-1-ap-southeast-2.pooler.supabase.com` Session pooler. The pooler accepted the tenant/account and reached a PostgreSQL session. The script then failed `production connection not in read-only mode` while querying `transaction_read_only` *outside* an explicit transaction. This only establishes that the connection's default transaction was not read-only; it does **not** establish that an explicit read-only transaction is unsupported. No dump was attempted and no production change was made.

**Reviewed external evidence:** PostgreSQL 18 `pg_dump.c` explicitly runs `BEGIN` and `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY` for its export snapshot. Supabase warns that `SET default_transaction_read_only=on` (session-wide) can contaminate connection pool state; recommends `BEGIN TRANSACTION READ ONLY` for scoped maintenance checks. References: https://raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/src/bin/pg_dump/pg_dump.c and https://supabase.com/kb/troubleshooting/resolving-cannot-execute-update-in-a-read-only-transaction-on-transaction-pooler-connections

**Fix on PR:** the separate `--connection-check` now issues `BEGIN TRANSACTION READ ONLY; SELECT CASE WHEN current_setting('transaction_read_only')='on' THEN 'READONLY_OK' ELSE 'WRITE_MODE' END; ROLLBACK;` with `psql -X -w -q -A -t -v ON_ERROR_STOP=1`; the result must be exactly `READONLY_OK`. The earlier unverified session-wide `PGOPTIONS=-c default_transaction_read_only=on` setting has been removed from the pooled export connection to avoid session-state leakage. The actual backup continues to run only the PostgreSQL `pg_dump --format=custom` client, whose dump transaction is explicitly read-only, and saves its archive under the private user home outside Git. This does NOT change any production database configuration or grant.

**Next operator run:** update branch; collect the production DB password privately using Get-Credential and use the now-known actual aws-1 production pooler host. Run `--connection-check` first, **then only if it passes** invoke `--backup` once. Do not reuse the earlier `aws-0` host. If a dump error occurs, report only the sanitized error category. Verify archive table data, size, checksum and subsequent separate Storage binary download plus isolated restore proof before any production release GO.

---
## 2026-10-27 — confirmed shared pooler tenant mismatch; invented aws-0 host retired

Operator reported `FAIL: production read-only connection preflight: production Session pooler tenant/account rejected` before pg_dump was attempted. The original PR55 backup script had guessed the pooler hostname `aws-0-ap-southeast-2.pooler.supabase.com` by concatenating a cluster index and project region. Supabase explicitly documents that each region has multiple pooler clusters and the cluster index cannot be derived from region; `Tenant or user not found` ordinarily indicates wrong host or username, not wrong password. Previous `pg_dump` failure likely has the same cause, but remains unverified.

**Fix committed:** the production-only logical export script now validates user-provided shared Session pooler hosts matching `aws-[INDEX]-ap-southeast-2.pooler.supabase.com`, checks TLS, port 5432, database postgres, username `postgres.zlvofcwnpdzfdnipvbbd`, explicit read-only production opt-in and `default_transaction_read_only=on`. It no longer inserts a guessed host. Unit tests cover multiple cluster indexes, wrong regions, lookalikes, staging target rejection and password redaction.

**Required operator procedure:** Open production `Ministry-Database` in Supabase Dashboard; click Connect; select Session pooler. Copy ONLY the host between `@` and `:5432` (no password or URI) into a PowerShell `Read-Host` prompt. Use this exact host in the protected production database URI, separately supply the production DB password from Get-Credential, and run `--connection-check` first. If PASS, run `--backup` once with the same secure environment. Never paste the complete database URI or secret in chat, PR comments, issues, or screenshots.

Official documentation: https://supabase.com/docs/guides/database/connecting-to-postgres and https://github.com/orgs/supabase/discussions/50190

**Production GO remains blocked** until a verified archive exists, Storage files are backed up, and independent restore proof is recorded.

---
## Production logical dump attempt — 2026-10-25: FAILED; no backup certified

Operator ran `scripts/pr55-production-readonly-backup.cjs --check-tools` (PASS: local dump/restore executables), then `--backup` with privately entered production database credential. The script printed `CHECK: exporting production Postgres logical data READ-ONLY`, followed by `FAIL: production read-only pg_dump: client exited unsuccessfully; details redacted`. The backup script deletes its `.partial` file on exception, and it did not report any completed archive, byte count, hash or catalog validation. **Do not consider this a usable backup.**

Production independent read-only checks: project healthy; Postgres 17.6; `postgres` has `rolbypassrls=true`; zero PostgreSQL large objects. Consequently large-object access and RLS are less likely causes when exporting as `postgres`, but actual client failure is not established. No production schema changes.

The script has now been updated with `--connection-check`. It runs only `psql` against the exact protected Sydney Session pooler, with `PGOPTIONS=-c default_transaction_read_only=on`, and verifies `transaction_read_only=on` via SELECT. The script safely classifies common client/database errors on `pg_dump` without copying raw stderr into the chat or terminal. Production host, role, TLS, file protections and explicit opt-in remain fixed.

Next operator action: retry the read-only production `--connection-check` with *production PostgreSQL password* before attempting another dump. If it fails, stop and share only the redacted diagnostic. If it passes, rerun `--backup` once using the same protected environment and report only the sanitized PASS/FAIL, byte count and hash (not the archive or credentials). If backup still fails, diagnose that specific category and consider Supabase CLI's supported `db dump` export split; do not weaken backup scope or hide missing `auth`/`storage` objects. A restore rehearsal remains outstanding after a successful export.

References: https://supabase.com/docs/guides/platform/backups and https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

---
# PR55 — Free-tier production recovery plan (2026-10-25)

**Status: BLOCKED pending real backup evidence and restoration rehearsal. No production changes authorized by this document.**

## Confirmed state (read-only)
- Supabase Free plan: no managed daily database backups or point-in-time restore. Official guidance recommends regular logical exports and off-site copies.
- Production project: `zlvofcwnpdzfdnipvbbd` (`Ministry-Database`), healthy Postgres 17, region **ap-southeast-2** (Sydney). Do **not** use the Tokyo staging connection/pooler.
- Existing baseline: 7,971 production members, 8,009 ministry assignments, 1 Auth account, **2 storage buckets / 154 objects**.
- No `registry_private` production schema or `registration_%` production RPCs currently exist; production has not been migrated.
- Client on operator Windows PC: PostgreSQL 18, compatible for dumping PostgreSQL 17. A `psql` local check passed for staging; `pg_dump` and `pg_restore` still need to be verified locally.

## Before any database change
1. Export a **complete, read-only** logical PostgreSQL dump (not CSV and not merely `public.members`) using the production Session pooler and production database password. Archive outside the Git worktree. The `pg_dump` custom format includes database records, tables, functions, and Auth/Storage database metadata; it does **not** export PostgreSQL global roles, project dashboard settings, API credentials, or Storage file bytes. Do not label this snapshot a complete Supabase project backup.
2. Verify the dump command exit status; inspect a `pg_restore --list` catalog for `public.members`, `public.member_ministries`, `auth.users` and storage tables; record UTC timestamp, byte size and SHA-256 hash. Treat Auth records and member data as sensitive; encrypt the archive at rest and keep a separately protected off-site copy. Never commit it to GitHub, upload it to chat, or include credentials in shell history.
3. Export all **154 actual Storage objects**, including those in private buckets, with Supabase Storage CLI or an S3-compatible download tool, separately from database metadata. Confirm counts and hashes. Supabase documentation: https://supabase.com/docs/guides/storage/management/download-objects
4. Capture database roles/grants and user-defined schema changes via the supported Supabase CLI workflow where possible. Official procedure generates `roles.sql`, `schema.sql`, `data.sql`; note that the default Supabase CLI schema dump excludes managed schemas and custom auth/storage modifications may need separate migrations. See https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
5. Rehearse restoring those files into **an isolated empty database/project**, never production and never the existing staging project with active data. Verify row counts, schema/RLS, admin/Auth ability to sign in, linked Storage objects, and business workflows. A catalog listing or checksum alone does *not* establish recoverability. An isolated restore target may require local Supabase/Docker or a separately funded project because two Free projects are already in use.
6. Define a migration rollback and recovery decision: when to stop deployment, who can authorize restoration, expected data loss (RPO), expected recovery time (RTO), and how to reconcile new registrations made after backup.

## Operator run order
- Step A: Verify `pg_dump` and `pg_restore` locally, then create and inspect a read-only production logical archive. No production schema changes.
- Step B: Archive Storage bytes, not only rows in `storage.objects`.
- Step C: Restore to isolated environment; verify counts and procedures without changing the live registry.
- Step D: Only after all gates and a separate user go-live authorization, approve a versioned production migration and granular EXECUTE grants. PR55's existing release candidate intentionally aborts and cannot be applied.

**Current release state: NO-GO. Staging JWT authorization tests passed, but production disaster recovery is not yet verified.**

## Current references
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- https://supabase.com/docs/guides/storage/management/download-objects