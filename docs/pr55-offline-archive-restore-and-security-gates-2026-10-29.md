# PR55 — Single-command offline archive recovery rehearsal (2026-10-29)

## Proven checkpoints and 2026-10-29 update

- The operator verified the October 26 production backup exists and has 18,156,510 bytes; recorded SHA256 `1bcc80f8c672282649b82c552e6b366ce31f1772bb56e790d184cb5292d1a992` matched.
- PG17 `pg_restore --list` with the archive bind-mounted read-only reported 848 TOC entries: 153 TABLE objects, 63 TABLE DATA entries, 15 SCHEMA entries, 177 FUNCTION entries, 31 POLICY entries, 210 ACL entries, 19 TRIGGER entries, 41 FK entries, 143 INDEX entries and 15 TYPE entries.
- The reported 8 extension TOC entries represent **4 distinct names**: pg_stat_statements, pgcrypto, supabase_vault and uuid-ossp. All four are installed in the separate verified scratch PG17 image with production-matching versions, so **there is no missing extension identified by this inventory**.
- An earlier fixture-only two-record custom-format backup/recovery succeeded; temporary database cleanup independently confirmed.
- This documentation adds a one-command **real archive, but offline only** restore rehearsal. It is prepared and statically tested, **not yet executed by the operator**.

## Operator command in Ubuntu

First pull the PR55 branch in Windows PowerShell as needed, and use the on-disk script under the checked-out repository. An example Ubuntu invocation is:

```bash
bash "/mnt/c/Users/Gerard Felarca/Documents/LiteLLM/liturgical-ministry-registry/scripts/pr55-offline-archive-restore-rehearsal.sh" \
  "/mnt/c/Users/Gerard Felarca/COWL-DOK-PRIVATE-BACKUPS/cowl-dok-prod-2026-10-26T23-21-15-064Z-7e5251.backup" \
  "1bcc80f8c672282649b82c552e6b366ce31f1772bb56e790d184cb5292d1a992"
```

The script verifies the exact SHA256, checks physical host D: storage, creates a **new uniquely named** disposable PG17 Docker container and separate volume, with `--network none`, no ports, a random DB password, a read-only mounted original backup, and no production/staging credentials. It restores into a fresh empty database with `pg_restore --single-transaction --exit-on-error --no-owner --no-acl`, then prints only aggregate counts for public.members, public.member_ministries, auth.users and storage.objects. On success or failure it removes only its own temporary container/volume and error log. The script does not touch the existing synthetic scratch container. Docker volume removal is not forensic erasure of underlying virtual disk; protect the host against unauthorized access.

A successful restore **only** establishes a local archive schema/data restore subset and content checks; it cannot prove role/ACL faithful restore, Auth service login, Storage object bytes or a **fresh** current rollback. Any nonzero exit is a NO-GO. Do not post local logs, credentials or archive contents.

## Live read-only production advisory snapshot 2026-10-29

Supabase production security advisors still flag WARN: anon execution of public.log_member_ministry_changes (SECURITY DEFINER); authenticated execution of that function and process_recommendation_renewal_batch (SECURITY DEFINER); and Auth leaked-password protection not enabled. They also report five INFO findings for RLS enabled without an explicit policy (these may be deliberate access-denial tables, requiring review before any change). Follow-up links:
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

**No production security settings or data were modified.**

## Unresolved release gates

Fresh production database/Auth export from the correct live project; real Storage object bytes and manifest (not just storage.objects metadata); offline restored current backup, accountable roles/privileges, and rollback proof; explicit real-admin verification and grant decision; required corrections or review for future-dated renewal and missing ministry-level letter links; secure legacy write-path cutover or documented freeze; real permission tests, PR56 UI and operator-approved release/merge. Security remains **NO-GO** until completed. Supabase guidance: https://supabase.com/docs/guides/self-hosting/restore-from-platform and https://supabase.com/docs/guides/platform/backups .


## Operator result — full historical archive schema/data restore, 2026-10-29

The operator ran `scripts/pr55-offline-archive-restore-rehearsal.sh` against the SHA256-verified October 26 archive in a **separate, offline PostgreSQL 17 container**. Reported unredacted-but-nonpersonal command output:

```text
PASS: exact archive checksum and D: disk-space preflight
PASS: public.members restored; rows=7971
PASS: public.member_ministries restored; rows=8009
PASS: auth.users restored; rows=1
PASS: storage.objects restored; rows=154
PASS: archive schema and data restored with no-owner/no-acl; four core-table row counts verified.
LIMIT: not a proof of Storage object bytes, live Auth service, roles/ACLs, or a current production recovery point.
CLEANUP: removing disposable container and Docker volume; original archive untouched.
```

**Assessment:** The strict archive schema-and-data restore PASSED for four verified core relations. Cleanup ran according to the script's output, although independent post-cleanup Docker inventory has not been supplied. Restoration intentionally skipped owner and ACL recreation, so this **does not certify a faithful permissions/roles restore**, live Supabase Auth operation, or the actual private Storage file bytes. The archive contains pre-October-27 reset data (7,971 historical members, 8,009 historical assignments, 154 historical Storage metadata entries), which must **never** be mistaken for the current production state. At the time of the 2026-10-29 read-only production check, current production had **1 member, 2 assignments, 1 Auth user, 37 Storage metadata entries** (36 certificate-templates / 36,863,212 metadata bytes and 1 member-document / 171,973 metadata bytes). Do not restore this old snapshot to live production.

**Next authorized, operator-local gates:** Obtain a fresh, password-protected production logical archive and verify its SHA256; encrypt and maintain a second separate copy. Export and verify the actual 37 current Storage file bytes via S3 or CLI and protect the files (the legacy `scripts/pr55-package-storage-backup.ps1` expects 154 different historical objects and must not be used here). Rehearse the **fresh** data restore with updated hash and compare same-time counts, then establish Auth and roles/ACL faithfulness and private Storage download. Review real-admin identity, future-dated renewal/letter linkage, secure CRUD path, RLS/privileged functions, and final rollback before proposing an explicit production change/merge. PR55 and PR56 remain draft/NO-GO. No live database writes or new billable resources were made as part of this rehearsal.


## Operator fresh live production archive exported — 2026-10-30

The operator ran `scripts/pr55-production-readonly-backup.cjs --connection-check` from Windows and reported **PASS: explicit production READ ONLY transaction**, followed by `--backup` and **PASS: production logical archive created and catalog verified**. A new October 30 raw PostgreSQL custom-format backup was reported at **18,056,530 bytes**. The operator also reported a local SHA-256 checksum; its actual value and the private archive path are deliberately **not reproduced in this repository**. No production mutation was requested or performed by the backup script.

**This is currently an exported plaintext, local-only, database/Auth metadata archive—not a certified current recovery snapshot.** Encryption + passphrase retention, a separately protected second copy, strict isolated restore verification of the fresh archive, role/ACL/Auth parity, and all 37 *actual* Storage blob bytes remain incomplete. The restored October 26 archive's historical counts must not be treated as current production counts. Keep the original October 30 archive until restore and encrypted-copy certification is finished, never commit raw backup files or credentials.

**Next:** operator-local `scripts/pr55-protect-local-backup.cjs --encrypt` then `--verify` with private env variables set from exact new file and SHA256 and a unique 20+ character encryption passphrase; then use `scripts/pr55-offline-archive-restore-rehearsal.sh` on the **new** archive and its exact checksum. After that, export current Storage blob bytes and compare count/size/hash manifest per bucket. Production remains **NO-GO**.
