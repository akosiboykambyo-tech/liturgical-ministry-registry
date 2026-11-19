# COWL-DOK — Phase 3C TEST Backup and Recovery Verification

**Date:** 2026-11-19 (Asia/Manila)  
**Result:** **NO-GO for modifying the existing TEST database** until a recoverable copy and an independently validated restore process exist.  
**Authorized environment:** `Ministry-Registry-Test`, Supabase project `rtptybxugjhvpfjvcvgw`.  
**Production:** Not inspected or changed.  
**Activity:** Non-mutating project/organization metadata and connected-file searches only. No export, backup creation, restoration, migration, DDL/DML, Auth change, Vercel deployment or branch merge.

## Verified facts

1. The TEST project is `ACTIVE_HEALTHY`, PostgreSQL 17.11; its Supabase organization reports `plan: free` and `tier: tier_free` as of this verification.
2. Supabase's current Database Backups documentation (https://supabase.com/docs/guides/platform/backups) states that automatic daily backups are provided for **Pro, Team and Enterprise**. Free projects should periodically run `supabase db dump` and maintain off-site copies. Therefore **no daily managed-backup entitlement can be assumed for this project**.
3. Supabase's Restore to a New Project flow (https://supabase.com/docs/guides/platform/clone-project) is restricted to paid plans with physical backups. The TEST organization is Free.
4. The Supabase connector available in this session can read project/organization information and list development branches, but exposes **no backup-list or backup-restore-verification operation**. Accordingly, a provider backup inventory and actual restore point were **not verified**. The `list_branches` result was empty; this does not establish recoverability.
5. Searches in the available GitHub repository and connected Google Drive for obvious project/backup terminology did not identify any **verified** SQL dump, recent backup manifest or successful restore record for this TEST database. This is not proof that an offline/manual backup does not exist elsewhere.
6. Earlier read-only SQL inspection found 1,009 TEST members and valid registry UIDs, but **healthy records and metadata do not constitute a tested recovery point**.

## Recovery verification evidence matrix

| Evidence | Status | Why it matters |
|---|---|---|
| Exact TEST project and org plan | VERIFIED: Free | Determines availability of provider-managed recovery |
| Automated daily backup entitlement | NOT AVAILABLE on Free under published plan terms | Cannot assume a provider recovery point |
| PITR configured and available | NOT VERIFIED; no entitlement inferred on Free | A PITR recovery target cannot be claimed |
| Current manual logical dump with date/checksum | NOT FOUND/NOT VERIFIED | There is no proven export to restore |
| Dump contains needed schema, data, roles, migration records | NOT VERIFIED | Partial backups can restore incorrectly |
| Separate Storage object backups | NOT VERIFIED | Database backups exclude object bytes |
| Independent restoration rehearsal | NOT PERFORMED | A backup is not proven restorable until restored |
| Disaster recovery owner and off-site location | NOT VERIFIED | Prevents lost or inaccessible backup |
| Approved rollback and cleanup procedure | DOCUMENTED AS PROPOSAL ONLY | No real rollback has been certified |

## Recommended path: minimal cost, high safety

**Path A (recommended before any TEST write):** perform a manual encrypted logical export of the existing TEST database, store it outside GitHub and the application repo, record checksums/time and backup custodian, and validate a restore in a **disposable isolated destination**. For the SQL rehearsal itself, prefer a disposable database built from reviewed migrations and fictional fixtures instead of restoring actual parishioner data into unsecured environments.

**Path B (optional paid infrastructure):** move TEST to a paid plan and enable an appropriate managed-backup/PITR capability, then independently verify restore points. Upgrading costs money and does **not** retrospectively establish that a prior TEST backup existed. This is not necessary merely to rehearse v2 SQL if Path A works.

### Manual export checklist (no commands executed)

1. Identify an authorized backup custodian and encrypted off-site destination; do not upload dumps to GitHub, issue attachments, public Drive folders, CI artifacts or this chat. Restrict access and set retention.
2. Follow the current Supabase CLI [Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) guidance. Use its documented role/schema/data export process **against TEST only** with a credential managed locally and not printed to logs. Include/examine Supabase-managed schemas and migration history requirements; the usual schema/data exports may not automatically preserve Auth customizations, migration history, Storage object bytes or encrypted secrets.
3. Confirm exit status, that outputs are nonzero and structurally expected, SHA-256 checksums, file permissions, timestamp and TEST project reference. Record metadata in a manifest **without placing secrets or private member data into source control**.
4. Restore into a separately approved disposable database while keeping current TEST untouched. Verify schema objects, v1/UID triggers, grants, row-count parity, representative synthetic fixtures, migration history and necessary Auth/Storage configuration. A restore into the original TEST project is **not** an acceptable first rehearsal.
5. Keep a signed record of recovery timing, date, responsible operator, issues, verification checks and safe destruction/retention of any temporary clone. No other dataset should be overwritten.
6. If the restore fails or files are incomplete, mark recovery **FAILED** and do not modify TEST. Fix the export/restore plan and repeat in a safe destination.

### Extra cautions

- Supabase confirms database backups include Storage metadata but **not Storage object contents**. Protect any private recommendation letters or other TEST bucket files through a separate appropriately secured Storage process.
- Restore-to-new-project options on paid accounts copy only selected project/database configuration; Auth settings, API keys, Edge Functions, Storage and external integrations may need separate review. See https://supabase.com/docs/guides/platform/clone-project .
- If a dump includes real names, email addresses, authentication hashes, notes or other personal information, treat it as sensitive. Prefer an anonymized/synthetic-only duplicate for development.
- Do not "test" recovery by restoring over the existing TEST project's 1,009 members.

## Next approval boundary

**No approval is requested or inferred to create a backup, run a dump, create a new project, purchase a plan, expose private data, or perform any restore now.**

For Phase 3C to proceed:
- Obtain an approved TEST-only backup/export operation with a secure destination, **or** establish an entirely disposable synthetic database with matching schema.
- Verify a real restore/clean initialization and document evidence.
- Only then request separate written approval for TEST-only v2 DDL and bounded fictional write tests.

**Final assessment: RECOVERY NOT VERIFIED; MODIFICATION NO-GO.** This reflects the absence of a demonstrated backup and restore, not any observed TEST database corruption.
