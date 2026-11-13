# COWL-DOK — Recovery readiness audit and restore rehearsal plan

**Date:** 12 November 2026 (Asia/Manila)  
**Basis:** Read-only direct verification of Supabase TEST and Production, 12 November 2026 ~18:53–18:55 PHT; GitHub release safeguards at PR #79; current official Supabase guidance.  
**Status:** **READ-ONLY AUDIT COMPLETE; RECOVERABLE BACKUP UNVERIFIED; ISOLATED RESTORE NOT PERFORMED; PRODUCTION NO-GO**.

No database rows were changed by this audit. No Auth credentials, API keys, member identities, real document paths, document bytes, or personal data have been copied to GitHub. It is an infrastructure/inventory report, **not** an export or restoration certificate.

## 1. Findings and decision

**Critical: the Supabase organization currently reports subscription plan \`free\`.** Official documentation says automatic daily backups are provided for paid plans but **not** Free. Free projects need operator-maintained manual exports. The organization currently has two healthy active projects; Supabase's Free entitlement permits only two active projects. A third fully isolated hosted rehearsal therefore requires an approved paid plan/project or a different authorized arrangement.

**Critical: database backups do not copy the actual Storage file bytes.** Files and bucket definitions/settings must be preserved separately, especially the private recommendation letters and certificate assets. Supabase's paid \`Restore to a New Project\` only produces a database copy; Auth settings, Storage files/settings, API keys, Edge Functions, Realtime, and certain database settings require manual steps.

**Critical: there is no independently verified backup artifact or successful restore run in the evidence currently available.** Do not represent a database inventory, successful TEST Auth test, existing TEST project, or a Git commit as a successful recovery point.

**Release recommendation:** Maintain a production migration/launch hold until a real recoverable backup, protected file copies, and a completed isolated restore are verified. A local Postgres rehearsal is a useful preliminary no-new-project step but **does not certify Supabase Auth or Storage recovery**.

## 2. Live source inventory

| Control | TEST: Ministry-Registry-Test | PRODUCTION: Ministry-Database |
|---|---:|---:|
| Supabase reference | \`rtptybxugjhvpfjvcvgw\` | \`zlvofcwnpdzfdnipvbbd\` |
| Region | \`ap-northeast-1\` | \`ap-southeast-2\` |
| Health status | ACTIVE_HEALTHY | ACTIVE_HEALTHY |
| PostgreSQL server version | 17.11 | 17.6 |
| Current database size (bytes) | 16,832,179 | 90,041,491 |
| Recorded Supabase migrations | 47 | 28 |
| Auth account count | 6 | 4 |
| Registry members | 1,009 | 1 |
| Member-ministry assignments | 13 | 2 |
| Active Registry admins | 2 | 1 |
| Certificate-template settings | 2 | 2 |
| Signatories | 8 | 8 |
| RLS-enabled / inventoried tables | 60 / 60 | 29 / 29 |
| Inventoried RLS policies | 55 | 32 |
| Selected security RPC contracts | 6 | 4 |
| Deployed Supabase Edge Functions | 0 | 0 |
| Supabase development branches | 0 | 0 |
| Installed \`pg_cron\` / \`pg_net\` / \`http\` / \`wrappers\` / \`pgmq\` / \`pg_graphql\` | None | None |
| Realtime publications | 1 | 2 |

RLS policy and security RPC fingerprints from **the existing checked-in read-only inventory**:
- TEST: policies \`c17f4fc80c6f10dd774f190e3cb55ef2\`; security RPC contracts \`8c075feff8ba55e1e87aabecd1d4b2b1\`.
- PRODUCTION: policies \`3216aef73d3f5e671acb91eb7a515c86\`; security RPC contracts \`97a0ef22d26c1efcf3879e3b00201efa\`.

**Interpretation:** TEST is an expanded staging environment, not a snapshot of PRODUCTION. Differences in totals, roles, schema, extensions, PostgreSQL minor versions, migrations, RLS policies and grants are **release-compatibility issues to review**; they are not evidence of a failed restore. A restore should be compared against **its own source at the selected snapshot timestamp**—never casually compare TEST's 1,009 members against PROD's 1 member.

### Storage metadata inventory (NOT actual file backups)

| Source | Bucket | Access | Object count | Metadata size, bytes |
|---|---|---|---:|---:|
| TEST | \`certificate-templates\` | Public | 1 | 3,960,705 |
| TEST | \`member-documents\` | **Private** | 1 | 31,375 |
| TEST | \`fs-private\` | **Private** | 0 | 0 |
| PRODUCTION | \`certificate-templates\` | Public | 36 | 36,863,212 |
| PRODUCTION | \`member-documents\` | **Private** | 1 | 171,973 |
| PRODUCTION | \`public-assets\` | Public | 1 | 62,531 |

Total source Storage metadata: **TEST 2 objects / 3,992,080 bytes; PRODUCTION 38 objects / 37,097,716 bytes**. These byte counts come from \`storage.objects.metadata\`, not independently downloaded/checksummed bytes.

Bucket restrictions also diverge. TEST's private \`member-documents\` bucket has a 5 MiB object cap and three permitted MIME types; Production's corresponding private bucket currently has **no bucket-specific size limit or MIME allowlist** in its metadata. TEST has \`fs-private\`, while Production has \`public-assets\`. Any re-creation must follow the actual source project's intended policy and must **never make private letters public**.

Production certificate artwork is present in public Storage (36 files) but TEST contains only one corresponding object and may reference Production URLs. Recovery must resolve those cross-project asset dependencies before treating TEST as isolated.

### Database dependencies and warnings

- Both databases have relevant user-defined triggers, including Registry and Storage triggers; TEST additionally has financial audit triggers. Review full trigger/functions when preparing a restore, especially any external side effects, before enabling recovered services.
- No enumerated external scheduling/network extensions listed above were installed on either project. This does **not** prove all external integrations, queues or provider-managed schedules are absent.
- Supabase Health Advisor returned **0 findings** for both projects.
- Supabase Security Advisor returned the same three categories on each: \`RLS Enabled No Policy\` (INFO); \`Signed-In Users Can Execute SECURITY DEFINER Function\` (WARN); \`Leaked Password Protection Disabled\` (WARN). Review the actual protected functions and plan-eligible password protection; don't remove necessary function privileges blindly.
- Neither a recent physical recovery point nor off-site logical backup, actual Storage byte archive, Auth settings export, or recovery-test timing could be verified with the available read-only project access.

## 2A. Operator-reported first local backup checkpoint — 12 November 2026

**TEST schema-only export successful (operator PowerShell output).** Supabase CLI **v3.1.0**, Docker Engine **29.9.2**, `--remote=rtptybxugjhvpfjvcvgw`; the tool reported `Dumped schema`. Local file `TEST-schema.sql` has reported byte length **278,919**, with SHA-256 **`AE70D2B098B8AAF639A72BF58B888C03A455422157A6C42D052F2E8FEC4A3BB7`**. No database passwords, personal Windows home path, SQL contents or private data files are stored here.

**Evidence scope:** existence and hash were supplied in the operator's shell output; the file bytes have not been independently retrieved or parsed by the reviewer. No isolated restore has been attempted; no data-only or role-only dump has been captured; managed `auth`/`storage` backups and private object byte backups remain pending. Schema export is **not** a certified recovery point.

**Safety gate before data export:** confirm an encrypted destination on the operator workstation and a separate secure/offline copy strategy; avoid accidentally placing private Registry member and finance records into Git, cloud-synced folders or shared directories. Never print credentials or actual dump content in chat. Verify encrypted archive integrity/checksums and source-vs-restored inventories before marking the backup complete.

### Operator-confirmed TEST schema/data/roles file-integrity checkpoint — 12 November 2026

The operator reports that all three TEST exports exist under a mounted VeraCrypt volume, with the following byte lengths and SHA-256 hashes (copied from local PowerShell output). **No file contents, passwords, personal user paths or Storage object names were shared or committed.**

| File | Bytes | SHA-256 |
|---|---:|---|
| `TEST-schema.sql` | 278,919 | `AE70D2B098B8AAF639A72BF58B888C03A455422157A6C42D052F2E8FEC4A3BB7` |
| `TEST-data.sql` | 297,437 | `9D21B07121022E23D39BD66BE02E69F8181BF961842B757A23F0B9F141FC3F89` |
| `TEST-roles.sql` | 297 | `25873CEC56A2CC6514E204F420231777F85C03DA818CAA7090CDCDFA89776ECD` |

The small 297-byte roles file is not necessarily an error; role declarations and restoration compatibility have **not** been verified. File-hash collection does not prove application records, Auth identities, Storage contents, roles or policies can be restored. Default Supabase `db dump` excludes managed `auth` and `storage` schemas. Before the next data-bearing export, preserve these checksums in an encrypted local manifest, create a second independently protected copy of the VeraCrypt container after unmounting it, and verify both the archive and a standalone restore. The separate Auth/Storage backup and an isolated full restore are pending.

**Source-only operation:** read-only SQL exports from TEST; Production unchanged. The user should **not** publish these SQL files to GitHub/Trello or attach them to chat.

### Operator-confirmed TEST certificate object — 13 November 2026

The operator successfully remounted the encrypted VeraCrypt volume and ran the full local verification/preservation script. Reported output: `SQLFileCount=3`, `SQLChecksumsVerified=True`, `CertificateFileCount=1`, `CertificateBytes=3960705`, `CertificateHashVerified=True`, `ManifestPresent=True`. The preserved certificate object lives at its original bucket-relative path inside the encrypted Storage backup folder; no file bytes or original object path were published here.

The certificate object was fetched twice directly from the TEST public Storage endpoint, with matching **SHA-256** `78EC85EBF1C19D7C5D3F5D564514AA39A8800559F458D67C51071BF27D66793F` and byte count **3,960,705**, matching TEST Storage metadata. An earlier manual/browser download had size **3,899,625** and a different checksum; the operator retained it separately under an `_verification` directory rather than discarding it. This is strong source-download consistency evidence, **not a complete tested restore**.

Read-only TEST Storage inventory rechecked on 13 November 2026: `certificate-templates` (public) **1 object / 3,960,705 metadata bytes**; `member-documents` (private) **1 / 31,375 bytes**; `fs-private` (private) **0**. Actual bytes for the member document, managed Auth data, Storage metadata and isolated restore remain outstanding. Neither Supabase database was changed.

## 3. Acceptance criteria for a certified isolated recovery

**All** are required, with results recorded by two operators where feasible:

1. **Backup provenance:** identify exact source ref, archive/snapshot time (UTC), operator, export tool versions, size, encryption location and SHA-256 checksums. Prove backup is readable and that its content corresponds to the source at the selected time.
2. **Data completeness:** confirm Registry members, ministry assignments, finance records, signatories, certificate settings, audit logs, RLS rules, grants and procedures using source-vs-restored counts and fingerprints. A different backup time legitimately changes counts; record the comparison window and expected delta.
3. **Auth identity:** verify Auth user restoration **and** controlled TEST-specific invitation/sign-in, refreshed access, unassigned and revoked account denial. Do not copy Production tokens or active sessions into user-facing reports. Carefully reconfigure SMTP, redirect allowlists, signing keys, rate limiting and API keys in the isolated environment.
4. **Real Storage bytes:** separately archive/recover every source bucket's actual file bytes; verify per-file checksums, content-type, path-to-metadata consistency, bucket privacy and policies. Private recommendation letters must remain private and must not be printed, exposed in logs, sent to public buckets, or mirrored onto public URLs.
5. **Certificate Studio:** prove template artwork/fonts/signatures/QR links load from the recovered environment; save/reload a synthetic non-default template; check visual and print output on desktop and mobile. Capture redacted evidence, not a private member certificate.
6. **Authorization:** repeat core Registry/COWL/Curia role checks and private byte-transfer checks against the **restored** project, not the already-tested TEST project.
7. **Recovery operation:** document downtime and durations, recoverable snapshot age (RPO), time to full service (RTO), rollback sequencing, ownership, cleanup/deletion of any disposable project and verification that original live project remains untouched.

A frontend Vercel rollback by itself **cannot** roll back Postgres, Supabase Auth, or Storage. Avoid destructive in-place restores on TEST or Production while rehearsing.

## 4. Execution plan and funding gate

### Phase A — secure manual backup (needed even before a paid restore)

1. On a trusted **local operator workstation**, use the current Supabase CLI documentation and \`supabase --version\`, \`supabase db dump --help\`, and \`supabase storage --help\`. Do not put database URLs/passwords in Git, chat, task cards or CI logs.
2. Export a **separate encrypted** PRODUCTION and TEST data set to secure offline/independent storage, following Supabase's official database migration guide. Separate roles, application schema and application data. **Caution:** standard \`supabase db dump\` excludes managed \`auth\` and \`storage\` schemas and does not include data by default. Explicitly plan managed Auth user backup/restore and custom \`auth\` / \`storage\` policies; do not certify a dump that omits those.
3. Separately export actual Storage objects using Supabase-supported Storage CLI, authorized dashboard downloads, or a restricted S3-compatible client. Use encrypted local output, a private-only access path, and manifest of per-object checksums/sizes/content-types. Do not commit exports or manifests containing personal filenames to a public repository.
4. Independently verify archive creation, integrity, storage location, access restrictions, retention and off-site restore availability. Only the responsible operator should hold credentials; avoid posting secrets or real member bytes into ChatGPT.

**Status:** Prepared, NOT executed through the current connected tools (they offer SQL inventory but not a protected full byte export). If the operator chooses a local-first rehearsal, use a disposable local PostgreSQL environment and clearly mark its Auth/Storage fidelity limitations.

### Phase B — paid, full-fidelity hosted restore (requires separate approval)

1. Confirm the organization, price/compute quote and paid subscription decision. A new isolated hosted project may incur ongoing fees; **no project or branch was created during this audit**.
2. Choose a source and specific snapshot. Supabase's managed \`Restore to a New Project\` requires a paid plan **and** a physical backup. It creates a **database-only** clone and may run restored DB triggers/extension jobs immediately. Restrict access and outgoing integrations.
3. Restore the database to its **own newly created disposable project**, re-create separate Storage bucket settings and import byte archives. Reconfigure Auth/SMTP/redirects, signing/API keys, Realtime/edge integration, Storage policies and public asset URLs. Never connect the restored environment to Production email, webhooks, payments or a real DNS/domain before inspection.
4. Compare both checked-in inventories on the **source** and the **restored** project. Perform the acceptance checks above, then record independently validated results, exact restore point and elapsed recovery time.
5. Retire the temporary project after securely preserving a **redacted** verification report. Do not delete either of the original projects.

**Gate:** We cannot certify full isolated recovery without **real backup artifacts, real file bytes, and a disposable restore environment**. A future paid step requires explicit project/cost approval.

## 5. Proposed ongoing operating policy (for approval; not yet implemented)

- Daily backup capability (paid managed backups **or** maintained encrypted manual exports) plus separate Storage backups. Verify archive **completeness** and run scheduled checksum checks.
- Perform **monthly sampled restore checks** on encrypted backups and a **quarterly full isolated restore rehearsal**, with a second reviewer signing off before any major release.
- Set the acceptable **Recovery Point Objective (RPO)** and **Recovery Time Objective (RTO)** with the Commission. Example targets for discussion: RPO ≤24 hours, RTO ≤8 hours; **neither is currently demonstrated or promised**.
- Encrypt backups at rest, restrict operator access, separate admin duties, document retention policy, avoid storing member/finance data in public Git and maintain incident contacts and recovery instructions for a five-year lifecycle.

## 6. Official reference material (checked 12 November 2026)

- Supabase Database Backups: https://supabase.com/docs/guides/platform/backups
- Free Plan backup policy: https://supabase.com/kb/faqs/platform/free-plan-backups
- Restore to a New Project: https://supabase.com/docs/guides/platform/clone-project
- CLI database export/restore: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- Storage object download: https://supabase.com/docs/guides/storage/management/download-objects
- Supabase billing and Free project limits: https://supabase.com/docs/guides/platform/billing-on-supabase

**Related reproducible SQL:** \`docs/sql/pr79-restore-inventory.READ-ONLY.sql\` (existing) and \`docs/sql/pr79-recovery-dependencies.READ-ONLY.sql\` (this audit). Compare source/restored only; never treat structural hashes as an actual backup.
