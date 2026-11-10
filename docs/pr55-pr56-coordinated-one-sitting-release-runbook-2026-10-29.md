# PR55 / PR56 — coordinated one-sitting release worklist (2026-10-29)

**Release state: NO-GO until all gates pass. This document itself authorizes no production mutations or merges.** PR55: fix/production-registration-compatibility. PR56: feature/admin-verification-navigation-2026-10-27.

## Evidence already independently verified
- The operator's local WSL2 Ubuntu and Docker isolated PostgreSQL 17.6 image successfully restored a 2-row synthetic `pg_dump -Fc` archive; generated fixtures were removed.
- Private old production backup dated 2026-10-26 has size **18,156,510 bytes** and verified SHA-256 `1bcc80f8c672282649b82c552e6b366ce31f1772bb56e790d184cb5292d1a992`.
- A read-only `pg_restore --list` of that backup reported 848 TOC entries, 153 TABLE entries, 63 TABLE DATA entries, 15 schemas, 177 functions, 31 policies, 210 ACL entries, 19 triggers, 41 FKs, 143 indexes, 15 types. Its 8 extension entries are **4 distinct names**: pg_stat_statements, pgcrypto, supabase_vault, uuid-ossp, all installed/matching in the PG17 image.
- Read-only live production baseline 2026-10-29: **1 member, 2 assignments, 1 Auth user, 37 Storage objects in 2 buckets**, specifically certificate-templates = **36 objects / 36,863,212 metadata bytes** and member-documents = **1 object / 171,973 metadata bytes**, for **37 total / 37,035,185 recorded bytes**. These are current-at-inspection counts, not guaranteed future totals or physical-object verification.
- One future-dated renewal record and two Renewed assignments with no per-ministry letter link; a member-level legacy document exists. Review evidence privately and do not use the old PDF-upload handler (it changes renewal/validity).
- The production advisor warns that `log_member_ministry_changes` is executable by anon and authenticated as SECURITY DEFINER, and `process_recommendation_renewal_batch` is executable by authenticated as SECURITY DEFINER. Leaked-password protection is disabled. Five RLS-with-no-policy advisories are INFO and require intent review rather than automatic policy creation.
- PR55/PR56 remain drafts and unmerged. Latest read-only production counts do not constitute a backup.

## Single sitting: operator-run sequence with explicit failure stops

### A. Isolated restoration of stale backup — WSL Ubuntu

First update the local PR55 branch in Windows PowerShell with `git switch fix/production-registration-compatibility` and `git pull --ff-only origin fix/production-registration-compatibility`. Do not override uncommitted local work.

```bash
bash "/mnt/c/Users/Gerard Felarca/Documents/LiteLLM/liturgical-ministry-registry/scripts/pr55-offline-archive-restore-rehearsal.sh" \
  "/mnt/c/Users/Gerard Felarca/COWL-DOK-PRIVATE-BACKUPS/cowl-dok-prod-2026-10-26T23-21-15-064Z-7e5251.backup" \
  "1bcc80f8c672282649b82c552e6b366ce31f1772bb56e790d184cb5292d1a992"
```

Must see PASS; on NO-GO **stop** and fix the actual compatibility issue (don't bypass strict checks). This restores into a uniquely named NEW container and NEW volume, not the existing scratch database, using no network and the source backup in read-only mode. Cleanup removes only its own generated Docker objects. **The old archive is stale and not an approved release rollback.**

### B. Fresh, current database/Auth logical export — operator Windows PC

Use the reviewed `scripts/pr55-production-readonly-backup.cjs` *locally*, not via ChatGPT. Never paste passwords, tokens, full DB URLs or member records in GitHub or chat. Confirm production Connect -> Session pooler URL, username project ref, TLS, and port 5432. Set `PR55_PRODUCTION_DATABASE_URL` privately in the **current process**, using a password-percent-encoded URL as needed. Also set `PR55_ALLOW_PRODUCTION_BACKUP=I_ACCEPT_READONLY_PRODUCTION_LOGICAL_BACKUP`. Then run:

```powershell
node scripts/pr55-production-readonly-backup.cjs --check-tools
node scripts/pr55-production-readonly-backup.cjs --connection-check
node scripts/pr55-production-readonly-backup.cjs --backup
```

On failure **stop**, do not loosen production read-only safeguards. Record the new archive file, size and SHA-256 **privately**. Clear both environment variables after completion. Encrypt/verify with `scripts/pr55-protect-local-backup.cjs` using a separate passphrase (see its required env vars and usage). Verify a second physically separate encrypted copy. A `pg_dump` by itself is insufficient for full-fidelity Supabase recovery; use Supabase CLI role/schema/data separation for an exact platform-to-self-hosted migration if the raw archive cannot restore fully (official docs below).

### C. Fresh Storage object BYTES export — operator PC, separately from database

Use Supabase's documented Storage > Configuration > S3 endpoint and rclone or Supabase CLI Storage copy. Generate S3 keys only when ready, keep them **local/off-repo**, and use **read-only copy**, never sync/delete/move. Production project ref `zlvofcwnpdzfdnipvbbd`, region `ap-southeast-2`, endpoint `https://zlvofcwnpdzfdnipvbbd.supabase.co/storage/v1/s3`. When an operator-configured remote called `cowlprod` points to this exact source, copy **both** buckets to a unique private backup destination outside the Git repository; for example, in PowerShell with a verified rclone installation:

```powershell
$destination = Join-Path $HOME ("COWL-DOK-PRIVATE-BACKUPS\storage-prod-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Path $destination | Out-Null
rclone copy "cowlprod:certificate-templates" (Join-Path $destination "certificate-templates") --progress
if ($LASTEXITCODE -ne 0) { throw "Certificate template copy failed" }
rclone copy "cowlprod:member-documents" (Join-Path $destination "member-documents") --progress
if ($LASTEXITCODE -ne 0) { throw "Private document copy failed" }
rclone size "cowlprod:certificate-templates"
rclone size "cowlprod:member-documents"
```

Reconcile **per-bucket count and byte size** to a fresh read-only production inventory taken at the same time; above reference baselines: 36 / 36,863,212 and 1 / 171,973. Record per-file SHA-256 manifests, encrypt and verify the physical Storage backup, and protect an independent encrypted copy. Do not use `scripts/pr55-package-storage-backup.ps1` from Oct 25: it is hardcoded for **154** OLD objects (35 certificate templates +119 member documents) and will reject the current 37-object dataset. Reading `storage.objects` is not proof that a file's bytes are retrievable. S3 credentials bypass RLS and can write/delete; configure securely and never paste them into ChatGPT.

### D. Restore the NEW archive, verify Auth/Storage/permissions and rehearse rollback

Run the isolated restore of the newly created, protected database archive using its new exact SHA256. Do not target production or staging. Compare counts of members, assignments, Auth users, buckets, Storage metadata and all relevant registry history tables against the same-time source inventory. The `--no-owner --no-acl` diagnostic script is only a SUBSET; it cannot establish faithful permission/role restoration. Separately verify role/grant parity, protected private file bytes and (on a suitable isolated full Supabase service) Auth login and signed file access. Run representative positive/negative JWT/RLS tests including access revocation, secure admin verification and renewal. Restore/rollback both data and files and document evidence. Any failure remains NO-GO.

### E. Explicitly authorized production security and release

Only **after** (A)-(D) are satisfied: identify and approve the real production admin Auth user, choose the freeze/replacement for legacy member CRUD/import and old PDF-upload workflows, decide on future-dated renewal and missing per-ministry letter coverage, approve the exact hardened SQL migration and its rollback, then apply in a controlled production window with audited before/after checks, re-run Supabase security advisors, and merge PR55 then PR56 only after the application/backend compatibility gates pass. Any required Auth leaked-password configuration is a separate admin-controlled setting. No automatic migration/merge/feature-flag enablement from this document.

## Current handoff status

**Locally executable now:** A. **Awaiting operator-held credentials and local private files:** B and C. **Awaiting B/C and full-fidelity certification:** D. **Awaiting D and explicit release authorization:** E.

Official references:
- Supabase platform recovery: https://supabase.com/docs/guides/self-hosting/restore-from-platform
- Supabase database backup caveats: https://supabase.com/docs/guides/platform/backups
- Supabase Storage downloads: https://supabase.com/docs/guides/storage/management/download-objects
- Supabase Storage S3 auth risks: https://supabase.com/docs/guides/storage/s3/authentication

No costs, additional project, production modifications or merges are authorized by this runbook.
