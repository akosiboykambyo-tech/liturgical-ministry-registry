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
