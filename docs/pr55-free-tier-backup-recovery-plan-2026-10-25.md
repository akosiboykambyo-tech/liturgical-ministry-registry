## 2026-10-27 — ENCRYPTED FLASH-DRIVE BACKUP COPY: PASS (OPERATOR OUTPUT)

The operator copied the authenticated encrypted production database archive to an attached USB flash drive mounted at `F:\` using PowerShell `Copy-Item` and independently verified SHA-256 with `Get-FileHash -Algorithm SHA256` after copying.

```text
PASS: Encrypted off-site backup copy verified.
SHA256: 3221CCC7069794F06AAC2E9936E76C03ECF274B19BD2EC97838953A1A24DAFF9
```

Hash equals the original encrypted archive checksum `3221ccc7069794f06aac2e9936e76c03ecf274b19bd2ec97838953a1a24daff9` (hexadecimal comparison is case-insensitive). **Gate: second encrypted copy and local integrity verification PASS (operator output).** This is evidence of an external-device copy, not yet evidence of physically off-site separation or long-term media reliability. Safely eject and store the USB away from the computer; keep the independent passphrase recovery plan secure. Original unencrypted `.backup` must remain until independent restore rehearsal succeeds.

**Independent read-only production Storage inventory:** `certificate-templates` (public): 35 objects / 36,838,287 declared metadata bytes; `member-documents` (private): 119 objects / 256,939,642 declared metadata bytes; total 154 objects / 293,777,929 declared metadata bytes (~294 MB). Verify actual downloaded byte count independently; database metadata is not proof of file-byte recovery. These counts are from `storage.buckets` joined to `storage.objects`. Actual Storage file bytes have not been exported or verified.

Remaining recovery gates: copy actual Storage object bytes (including private documents), verify per-object bytes/counts and retain secure second copy; rehearse isolated database + Storage restoration and application workflows; resolve missing global roles/configuration and migration readiness. **PR #55 remains DRAFT/UNMERGED; production activation NO-GO.**

---

## 2026-10-27 — ENCRYPTED PRODUCTION ARCHIVE: PASS (OPERATOR OUTPUT)

The operator ran the real `pr55-protect-local-backup.cjs` against the production dump after the offline synthetic tamper test. **All three checks passed:** AES-256-GCM self-test (synthetic), real `--encrypt` with in-memory authenticated decryption and original SHA256 comparison, and independent `--verify` in a separate script invocation. No decrypted copy was written by the verifier.

```text
PASS: AES-256-GCM encryption, decryption and tamper rejection; synthetic data only, no files or network
PASS: local production backup encrypted AES-256-GCM and decrypted in memory for verification
ENCRYPTED BYTES: 18156577
ENCRYPTED SHA256: 3221ccc7069794f06aac2e9936e76c03ecf274b19bd2ec97838953a1a24daff9
ORIGINAL SHA256 VERIFIED: 1bcc80f8c672282649b82c552e6b366ce31f1772bb56e790d184cb5292d1a992
PASS: encrypted archive decrypts in memory and matches original SHA256; no plaintext file written
```

Encrypted archive basename: `cowl-dok-prod-2026-10-26T23-21-15-064Z-7e5251.backup.enc` in the private `COWL-DOK-PRIVATE-BACKUPS` directory outside Git. Encryption uses AES-256-GCM, randomized salt and nonce, scrypt-derived key and authenticated tag; the script exclusively creates the output and retains the original plain PostgreSQL dump. The reported size is **18,156,577 bytes**.

**Gate assessment:** encryption and authenticated local verification **PASS (operator evidence)**. Actual archive bytes were not accessible for independent verification; password strength beyond script's minimum length was not assessed. `*.backup.enc` does not include the actual Supabase Storage file bytes, global database roles or platform Auth/settings configuration.

**Still required:** make a separately stored off-site copy of the encrypted file; verify copied SHA-256 `3221ccc7069794f06aac2e9936e76c03ecf274b19bd2ec97838953a1a24daff9`; securely escrow the passphrase separately; back up 154 production Storage objects and validate file bytes; rehearse restoring into an isolated environment and verify application functionality and RLS; review any missing project settings/roles. Do **not** delete the plain original until a verified encrypted off-site duplicate and restore procedure have been demonstrated.

**Production release remains NO-GO:** PR #55 stays DRAFT and unmerged. This evidence authorizes no production changes.

---

## 2026-10-27 — local archive protection utility prepared (NOT YET EXECUTED ON REAL BACKUP)

Added `scripts/pr55-protect-local-backup.cjs` to support private, offline encryption using Node.js built-in **AES-256-GCM with scrypt** (salted key derivation, authenticated tag), immediately followed by an in-memory authenticated-decryption and SHA-256 check. No database connectivity, cloud upload, server-side actions or shell-installed crypto package. It accepts only the operator's `COWL-DOK-PRIVATE-BACKUPS/cowl-dok-prod-*.backup` files, requires an independent **20+ character strong passphrase** and exact prior 64-digit archive SHA-256, writes `<name>.backup.enc` with exclusive-create semantics, and does **not** delete the original plain backup. `--verify` rechecks the encrypted file without writing decrypted member data back to disk. `--self-test` performs a synthetic in-memory tamper rejection check without real data.

The real production archive to protect has basename `cowl-dok-prod-2026-10-26T23-21-15-064Z-7e5251.backup`, expected SHA256 `1bcc80f8c672282649b82c552e6b366ce31f1772bb56e790d184cb5292d1a992` and length 18,156,510 bytes. Those attributes were reported by the operator's export script; actual archive bytes have not been independently reviewed here.

Operator must run `--self-test` locally, supply backup file/hash and passphrase through short-lived PowerShell environment variables, run `--encrypt`, then separately `--verify` with the *same* passphrase, clear variables in `finally`, and make a second encrypted off-site copy. Never print/share passphrase or commit/upload the real archive. Record the new encrypted file hash/size but not the passphrase.

**Security note:** a user-memorized passphrase must be backed up securely outside the encrypted file. Losing it makes recovery impossible. Protect Windows folder ACLs, do not leave the original unencrypted file in a sync folder, and don't destroy plaintext until the encrypted archive plus off-site copy has been verified and the restore rehearsal is complete.

The encryption and Storage backup gates are still **PENDING** until evidence from operator execution. Production activation remains NO-GO.

---

## 2026-10-27 — PRODUCTION LOGICAL BACKUP EXPORTED AND CATALOG CHECKED (OPERATOR PASS)

The operator successfully ran `scripts/pr55-production-readonly-backup.cjs --connection-check` against the dashboard-confirmed production Sydney shared Session pooler, followed by `--backup` with the production database credentials. The script reported:

```text
PASS: production PostgreSQL Session pooler supports an explicit READ ONLY transaction; no backup or writes made
CHECK: exporting production Postgres logical data READ-ONLY; no database writes permitted
PASS: production logical archive created and catalog verified
BYTES: 18156510
SHA256: 1bcc80f8c672282649b82c552e6b366ce31f1772bb56e790d184cb5292d1a992
LIMIT: restore NOT proven; uploaded Storage file bytes and global roles/config NOT saved
```

Private local backup filename (basename only): `cowl-dok-prod-2026-10-26T23-21-15-064Z-7e5251.backup`. Saved in operator's private `COWL-DOK-PRIVATE-BACKUPS` directory outside the Git worktree. This evidence is from the **operator's local output**; the archive bytes and SHA256 could not be independently inspected in this environment.

**Gate:** production read-only database export, required catalog sections and file checksum **PASS (operator verified)**. The database is **not yet recoverable/certified**: archive encryption and a protected off-site duplicate; actual Storage bucket object bytes (not just `storage.objects` metadata); project role/configuration exports as appropriate; and an isolated, successful restore are still outstanding. The dump is plain-text-accessible in its current custom PostgreSQL format: immediately protect it, do not paste/upload it to GitHub or chat, and do not remove the original before a tested encrypted archive and off-site copy exist.

**Production release remains NO-GO**. No production migration or registration permissions were applied.

---

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