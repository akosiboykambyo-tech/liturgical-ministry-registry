## 2026-10-27 — FOLLOW-UP LOCAL RESTORE LOG CLASSIFICATION AND PID STATUS

Operator examined private `create-db-private.log` for the failed 11:30:10 disposable trial using categorical regexes only, without disclosing raw diagnostic contents. Outcomes:

```text
PASS: Private database-creation log found.
CHECK: Connection failure
CHECK: Database or permission error
CHECK: No PostgreSQL PID file present.
```

The two categories are **not independent definitive diagnoses**. The `Database or permission error` pattern included the broad text `ERROR:`, which may match a generic `psql: error: connection ... failed` line. Absence of `postmaster.pid` from the old trial indicates no recorded active local postmaster, but does not independently prove a clean shutdown or absence of orphan processes. The local creation command failed, and **no `pg_restore` ran**; the archive remains checked but **restoration unproven**.

Next: safely classify the specific private `psql` connection failure (refused, password, missing role/db, port, access-policy, unknown), compare PostgreSQL private server-log readiness and clean-shutdown markers, and check for remaining local postgres loopback listeners. Avoid sending log text/credentials; do not retry restore, kill all PostgreSQL processes, or delete old trial directories until the local status is confirmed. The two encrypted USB backups remain unchanged; PR55 DRAFT/UNMERGED production NO-GO.

---

## 2026-10-27 — NEXT OFFLINE RESTORE REHEARSAL: LOCAL CREATE DATABASE FAIL; SHUTDOWN UNCONFIRMED

Operator ran the fixed `scripts/pr55-local-database-restore-rehearsal.ps1 -Run` in normal PowerShell. Exact original backup integrity/catalog and disk preflight **PASS**; `initdb` completed without reported error. The script advanced past `CHECK: Starting new local loopback-only PostgreSQL instance...` to the local `psql CREATE DATABASE` command, which exited nonzero:

```text
PASS: PostgreSQL 18 binaries present.
PASS: Original PostgreSQL archive SHA256 and required catalog entries verified.
PASS: At least 2 GiB free for disposable restore.
CHECK: Initializing new disposable local PostgreSQL cluster...
CHECK: Starting new local loopback-only PostgreSQL instance...
FAIL: Local database-only rehearsal remains incomplete; no production/staging changes made.
WARNING: Local trial server shutdown not confirmed. Do not delete its data directory.
Local disposable database creation failed.
```

**Private trial diagnostics directory:** `$HOME\COWL-DOK-PRIVATE-BACKUPS\PR55-LOCAL-RESTORE-REHEARSALS\trial-20261027-113010-9f6d1401`.

No `CHECK: Restoring full archive` message or pg_restore invocation occurred, so **no archive data has been restored**. The reasons for failure of the local `psql CREATE DATABASE` and the `pg_ctl stop` failure are **not yet established**. Treat the PG18 server as **potentially still running**, do NOT rerun restore, delete the trial data directory, stop all PostgreSQL services/processes, or publish private logs. Next diagnostic must inspect the trial's `postmaster.pid` vs its actual localhost listener/process and classify the trial's private `create-db-private.log` without revealing sensitive log data. Once the exact instance is identified, arrange **targeted** graceful shutdown and correct the cause before retry.

Release remains **NO-GO**, PR #55 **DRAFT/UNMERGED**; both encrypted production archives and previously verified USB copies remain unaffected.

---

## 2026-10-27 — DISPOSABLE LOCAL POSTGRESQL SERVER SHUT DOWN: PASS

Operator ran fail-closed targeted shutdown of the stuck *disposable* PostgreSQL rehearsal instance. The script matched the unique trial data directory against `postmaster.pid`, its PostgreSQL process, and the `127.0.0.1:61047` listener; `pg_ctl -D <verified trial data dir> -m fast -w stop` exited successfully. Post-stop `Get-NetTCPConnection` verified port **61047 was no longer listening**.

```text
PASS: Exact disposable test server identified.
CHECK: Stopping test server on localhost port 61047...
waiting for server to shut down.... done
server stopped
PASS: Disposable PostgreSQL server stopped.
PASS: Port 61047 no longer listening.
```

**Outcome:** The stuck rehearsal server is cleanly stopped. No database data was restored during this previous attempt (`pg-restore-private.log` was absent); production and staging were never targeted. Original local plaintext and encrypted backups and SHA-verified USB copies remain intact. The guarded `pg_ctl` no-pipe-hang fix on PR55 branch is ready for a **new** disposable -Run attempt after the operator pulls the latest branch. Ensure prior hung PowerShell invocation is ended (Ctrl+C once if necessary), use normal non-elevated PowerShell, and do not delete the private logs or backup archives. A new `-Run` creates a fresh unique trial directory; it does not reuse the stopped cluster.

**Pending:** Database-only restore and row-count validation, followed by independent full Supabase Auth/Storage/roles/RLS restore rehearsal. PR #55 remains DRAFT/UNMERGED, production NO-GO.

---

## 2026-10-27 — LOCAL POSTGRESQL SERVER STARTED; RESTORE DID NOT BEGIN (OUTPUT PIPE HANG)

After the corrected `-Preflight` PASS, operator ran `scripts/pr55-local-database-restore-rehearsal.ps1 -Run`. Script printed local `initdb` initiation and `CHECK: Starting new local loopback-only PostgreSQL instance...` but did not advance. Read-only second-terminal diagnostics confirmed `postgres-private.log` **contains `database system is ready to accept connections`**, **nine local PostgreSQL processes** launched concurrently, and loopback-only listener **127.0.0.1:61047** (PID **14324**). `pg-restore-private.log` **DOES NOT EXIST**, no `pg_restore` process was found. Therefore **the local cluster successfully initialized and started** but **the restore has not begun**.

Probable cause is a Windows PowerShell 5.1 `*> $controlLog` output-capture pipe around `pg_ctl -w start`; a long-lived child server can inherit pipe handles, delaying pipeline completion despite pg_ctl server readiness. PostgreSQL 18 documentation identifies `pg_ctl -l <server-log>` as the supported way to redirect the *server's* output separately. Reference: https://www.postgresql.org/docs/18/app-pg-ctl.html . The PR55 script now calls `pg_ctl start -l <server-log>` **directly without PowerShell pipeline redirection**, also calls `pg_ctl stop -m fast` directly, and attempts targeted cleanup when only its *newly created* trial data directory contains a live `postmaster.pid`. Offline guard tests cover the absence of redirected pg_ctl pipes. It still uses `Invoke-RehearsalCommand` for finite `initdb`/`psql`/`pg_restore`.

**Mandatory before retrying**: determine whether operator's original PowerShell is still blocked, interrupt it via Ctrl+C if so, **identify the exact trial PostgreSQL data directory and confirm its `postmaster.pid` reports port 61047 with matching live listener/PID**, then gracefully stop only that disposable instance with the full-path local `pg_ctl -D <that specific trial\data> -m fast -w stop`. Never mass-kill PostgreSQL processes or stop Windows services. Verify the listener is gone. Keep private logs local; do not publish backup data, usernames, member records or passwords. Only after confirmed cleanup, pull the fixed PR55 script and decide whether to retry local rehearsal.

**Recovery gate remains incomplete**. Backup archives, staging and production unchanged. Draft PR55 UNMERGED, production NO-GO.

---

## 2026-10-27 — PG18 INSTALLATION BLOCKER CONFIRMED BY OPERATOR (READ-ONLY DIAGNOSTIC)

Operator ran a second read-only inventory of `C:\Program Files\PostgreSQL\18`: both **`share/postgres.bki`** and **`share/postgresql.conf.sample`** are **MISSING**. `pg_config --sharedir` resolves to `C:/Program Files/PostgreSQL/18/share`, and recursive file search under the installation root found no `postgres.bki`. `initdb --show` emitted `no data directory specified`; that is not a supported standalone inventory command and does not affect the bootstrap-file diagnosis.

**Confirmed blocker:** PostgreSQL 18.6 command-line programs are present, but required matching *server share/support files* are absent. An installation repair or completion from official PostgreSQL/EDB Windows packaging is required to run a native disposable local cluster. Avoid copying `postgres.bki` from a different PostgreSQL release, uninstalling an existing service, or modifying a production/staging DB. The updated `-Preflight` script now checks both required share files and fails before creating a trial environment. **No restore yet, NO-GO**. Keep verified encrypted database and Storage USB archives safe.

Reference: https://www.postgresql.org/download/windows/ and https://www.enterprisedb.com/docs/supported-open-source/postgresql/installing/windows .

---

## 2026-10-27 — LOCAL RESTORE BLOCKED BY MISSING POSTGRESQL SERVER BOOTSTRAP FILE (NO DATA RESTORED)

The operator successfully ran `scripts/pr55-local-database-restore-rehearsal.ps1 -Preflight`, which verified the exact production backup archive SHA-256 and required table-data catalog entries, executable presence and drive space. The subsequent `-Run` attempt reached `initdb` but **failed before PostgreSQL could be initialized, started or a restore executed**. The direct error was:

```text
initdb: error: file "C:/Program Files/PostgreSQL/18/share/postgres.bki" does not exist
FAIL: Local database-only rehearsal remains incomplete; no production/staging changes made.
```

Native PostgreSQL 18.6 executables present under `C:\Program Files\PostgreSQL\18\bin` do NOT establish a complete server installation: `postgres.bki` is a required version-matched PostgreSQL system catalog bootstrap file, ordinarily installed in the server's `share` directory. Reference: https://www.postgresql.org/docs/18/bki.html . The original `-Preflight` checked executable presence but **did not check server data/support files**, producing an incomplete assessment; this has now been corrected to fail closed before initialization unless both `share/postgres.bki` and `share/postgresql.conf.sample` exist. The script also now captures Windows PowerShell native process stderr in private logs while interpreting the actual exit code. Static regression tests added.

Local private diagnostic directory: `PR55-LOCAL-RESTORE-REHEARSALS/trial-20261027-102811-08406989` below user's home backup directory; no sensitive logs were requested for upload or publication. Trial data from failed initdb may be left in this disposable directory, but **do not delete without confirming no local process is using it**. Production, staging, PostgreSQL backup and Storage files are unaffected. Backup validity not disproven; **restore gate BLOCKED**.

**Next action (read-only):** operator should inspect presence of `C:\Program Files\PostgreSQL\18\share\postgres.bki`, `share\postgresql.conf.sample` and `pg_config --sharedir`/`initdb --show`, then select a complete same-version PostgreSQL 18 server installation (official Windows EDB installer) or Supabase-compatible disposable runtime. Do NOT patch missing bootstrap files from other PostgreSQL versions or bypass full restore errors. Official Windows installer: https://www.postgresql.org/download/windows/ . PostgreSQL `initdb -L` may select an alternate **valid, complete version-matching share directory**, only if one already exists. Do not retry the `-Run` restore until tools and bootstrap data are verified.

**PR #55 remains DRAFT/UNMERGED, production NO-GO.** Nothing was applied to production.

---

## 2026-10-27 — NATIVE WINDOWS DISPOSABLE PG18 RESTORE PREPARATION; NOT YET RUN

The operator's local tooling check confirmed **PRESENT**: `pg_restore`, `pg_dump`, `psql`, `postgres`, `initdb`, `pg_ctl` under `C:\Program Files\PostgreSQL\18\bin`. `pg_restore (PostgreSQL) 18.6` and the existing backup script's `--check-tools` both **PASS**. Docker is **not installed**. Plain `pg_restore` was absent from `PATH`, but the explicit full path works.

Added `scripts/pr55-local-database-restore-rehearsal.ps1` with strict **-Preflight** (no server creation) and explicit **-Run** (offline disposable PostgreSQL 18 cluster), along with static safety assertions and PowerShell parser checks in `tests/production-registration-local-restore-guards.test.cjs`. The preflight requires the exact original local `cowl-dok-prod-2026-10-26T23-21-15-064Z-7e5251.backup`, validates original SHA-256 and essential catalog entries and at least 2 GiB free drive space, and never connects to production/staging.

**Restore mode is not authorized to target existing PostgreSQL installations:** it creates a brand-new uniquely named private data directory under `COWL-DOK-PRIVATE-BACKUPS/PR55-LOCAL-RESTORE-REHEARSALS`, uses random loopback-only port and host `127.0.0.1`, ephemeral random SCRAM password, only local `postgres` / `pr55_restore_rehearsal` DB, `pg_restore --no-owner --no-privileges --single-transaction --exit-on-error`, validates expected core row counts and shuts down the disposable server. It preserves only private diagnostic logs and cleans up test data when shutdown succeeds, with original backup archives retained untouched. No production or existing staging connection string is constructed.

**Limitations:** A stock Windows PostgreSQL server lacks numerous Supabase-specific managed roles and extensions. Even correct backups may fail a full restore; this test should preserve and categorize blockers, **not** bypass them or claim full recovery. Because `--no-owner --no-privileges` necessarily changes owner/ACL semantics, even a passing vanilla local restore would not validate live RLS or Auth/Storage behavior. Full Supabase recovery still requires a separate *isolated* Supabase-compatible environment and role/configuration review. No restore has yet been attempted and no production changes authorized. PR #55 DRAFT/UNMERGED, NO-GO.

---

## 2026-10-27 — BOTH ENCRYPTED PRODUCTION BACKUPS COPIED TO USB AND HASH-VERIFIED: PASS (OPERATOR OUTPUT)

The operator copied the final **encrypted Storage** archive `cowl-dok-storage-prod-20261027-094928.zip.enc` to removable flash drive `F:\` with PowerShell `Copy-Item`; computed the copied file's SHA-256 using `Get-FileHash -Algorithm SHA256`; then independently re-checked the **already present encrypted PostgreSQL backup** on the same drive. Reported final output:

```text
PASS: Encrypted Storage backup copied and verified.
SHA256: 67E2C9C8ADFF5F88B0CB4ABEA8A2A74FD30B522E9DD0B889FEF88B30EF1256F1
PASS: Encrypted database backup also verified.
PASS: BOTH ENCRYPTED BACKUPS PRESENT AND VERIFIED.
```

- **Storage**: 154 objects from 2 buckets in a ZIP with SHA-256 manifest, streaming AES-256-GCM encrypted archive of **286,224,983 bytes**, SHA-256 `67e2c9c8adff5f88b0cb4abea8a2a74fd30b522e9dd0b889fef88b30ef1256f1`.
- **Postgres**: encrypted custom-format logical archive of **18,156,577 bytes**, SHA-256 `3221ccc7069794f06aac2e9936e76c03ecf274b19bd2ec97838953a1a24daff9`.
- Combined encrypted files: **304,381,560 bytes**. Two encrypted files present on removable media and post-copy SHA-256 match: **PASS (operator evidence)**. Actual USB bytes were not available for independent inspection here. Drive must be ejected safely and **physically kept separate** from the computer; off-site custody is not independently demonstrated. Keep both encryption passphrases recoverable, independent of and separate from the flash drive.

**Snapshot consistency caveat:** the PostgreSQL dump is timestamped **2026-10-27 07:21 Manila** (2026-10-26T23:21 UTC) and the Storage ZIP was packaged at **2026-10-27 09:49 Manila**, so the two exports were **not taken as one atomic point-in-time snapshot**. A successful hash comparison proves file copy integrity, not transactional consistency between Storage metadata and object bytes. **Follow-up read-only metadata check:** at verification time, both buckets still showed 35/119 objects; **zero** surviving `storage.objects` rows in either bucket had `created_at` or `updated_at` later than the database backup start (`2026-10-26 23:21:15 UTC`). This reduces concern over in-place Storage changes between exports but does not rule out object deletions/recreations, metadata peculiarities, or concurrent changes to other database tables. Restore rehearsal must cross-check restored Storage object metadata against archive paths, sizes and application access; if intervening production writes invalidate consistency, take a synchronized new backup before release.

**Remaining release gates:** isolated restore rehearsal to **a new disposable environment** with safeguards against accidentally targeting production or the existing staging project; demonstrate database data/roles/Auth/Storage and application recovery; separately document global roles and Supabase project configuration not included by the dump, confirm backup access/passphrase recovery and retention; finish reviewed SQL migration and admin permission release authorization, Add Member/CSV integration gating. No production migration, deployment, or Storage writes authorized. **PR #55 remains DRAFT and UNMERGED; production remains NO-GO**.

---

## 2026-10-27 — STORAGE ZIP, ENCRYPTION AND AUTHENTICATED VERIFICATION: PASS (OPERATOR OUTPUT)

The operator ran the checked-in `scripts/pr55-package-storage-backup.ps1` following successful separate downloads and manifest creation for all 154 Storage files. The script re-hashed **all 154 source files** against the private local manifest; created a ZIP containing precisely the 154 bucket objects and private manifest; reopened the ZIP and re-hashed all archived bytes; ran offline AES-256-GCM synthetic tamper test; performed streaming AES-256-GCM encryption with scrypt-derived key; authenticated/decrypted the encrypted ZIP in memory; then independently repeated encrypted archive verification without writing new plaintext.

```text
PASS: All 154 local files match private manifest.
PASS: ZIP archive includes all 154 objects plus manifest; contents rehashed.
ZIP BYTES: 286224911
ZIP SHA256: 7295E99EE3BF6EF0E6D65DA63BE5D115402E7523C63540C65EFC3D54A2624B95
PASS: Storage encryption synthetic self-test and tamper rejection; no source files or network
PASS: Storage ZIP encrypted and decrypted in memory for authenticated verification
ENCRYPTED BYTES: 286224983
ENCRYPTED SHA256: 67e2c9c8adff5f88b0cb4abea8a2a74fd30b522e9dd0b889fef88b30ef1256f1
SOURCE ZIP SHA256 VERIFIED: 7295e99ee3bf6ef0e6d65da63be5d115402e7523c63540c65efc3d54a2624b95
PASS: Storage encrypted ZIP independently authenticated and original SHA256 verified; no plaintext written
PASS: STORAGE BACKUP ZIP + ENCRYPTION + VERIFICATION COMPLETE.
```

Private encrypted archive basename: `cowl-dok-storage-prod-20261027-094928.zip.enc`; size **286,224,983 bytes**; SHA256 `67e2c9c8adff5f88b0cb4abea8a2a74fd30b522e9dd0b889fef88b30ef1256f1`. Original plain ZIP size **286,224,911 bytes**, SHA256 `7295e99ee3bf6ef0e6d65da63be5d115402e7523c63540c65efc3d54a2624b95`.

**Gate:** full production Storage object-byte download, local per-file manifest verification, sealed archive and repeated authenticated encryption checks **PASS based on operator output**. The assistant cannot independently inspect private archive bytes. Backup remains protected on operator's PC; encrypted Storage ZIP has **not yet been copied to USB** or independently verified there. Stored source downloads and plain ZIP must not be deleted until a rehearsed isolated restore succeeds. Keep private member files, manifests, and encryption passphrase out of GitHub/chat, and passphrase separately recoverable.

**Next:** copy the encrypted `.zip.enc` only to physically separate USB (previous DB backup on F:\ when available) with `Copy-Item` and SHA256 comparison; verify both encrypted backups physically present. Then rehearse isolated database and Storage restores, independently check integrity, roles/platform configuration, and PR55 production release gates. Production PR remains DRAFT/UNMERGED and NO-GO; no production SQL or Storage writes authorized.

---

## 2026-10-27 — ALL 154 STORAGE OBJECTS DOWNLOADED AND LOCAL BASELINES VERIFIED (OPERATOR PASS)

Operator completed corrected **relative-source to relative-destination**, explicit production-project, read-only Storage CLI downloads. Public `certificate-templates` was verified in its precise bucket directory (not the parent diagnostic directory), then all 119 private `member-documents` objects were downloaded into a separate private bucket folder. Operator output:

```text
PUBLIC FILES: 35
PUBLIC BYTES: 36838287
PASS: All 35 public Storage objects verified.
PRIVATE FILES: 119
PRIVATE BYTES: 256939642
PASS: All 119 private Storage objects verified.
PASS: All 154 Storage files verified by count and total size.
PASS: Local SHA256 file manifest created.
```

The backed-up objects match the independently observed `storage.objects` counts and declared byte totals. A **private per-file SHA-256 local manifest** was generated by PowerShell. The object bytes and manifest have not been independently uploaded or inspected; this milestone is **PASS, operator evidence**. Production bucket contents and policies were not changed.

Private local folder (not for Git/cloud uploads): `$HOME/COWL-DOK-PRIVATE-BACKUPS/storage-download-diagnostic/` containing `certificate-templates/`, `member-documents/` and `manifest-private.csv`. Parent directory may include unrelated 149 bytes/two files created during CLI invocation; packaging must include only the **154 object files and private manifest**, preserving folder hierarchy and dotfile `.emptyFolderPlaceholder`.

Added `scripts/pr55-package-storage-backup.ps1` to package only those 154 files plus manifest into private ZIP **after re-hashing against the manifest**, then reopening the ZIP and independently recomputing each uncompressed entry's SHA-256; ZIP is written outside Git. Added `scripts/pr55-protect-storage-backup.cjs`, a **streaming** scrypt + AES-256-GCM local encrypt-and-verify helper, with offline synthetic end-to-end, tamper-rejection and overwrite-protection CI tests. It encrypts private `cowl-dok-storage-prod-YYYYMMDD-HHMMSS.zip` to `.zip.enc` using a strong independent passphrase; neither uploaded files nor member contents are output. The workflow retains original downloaded objects and plaintext ZIP until independent recovery rehearsal.

**Pending:** operator has not yet run the Storage ZIP/encryption step; no Storage encrypted copy yet. Need successful ZIP + integrity output and streaming encryption independent `--verify`, copy encrypted ZIP to separate USB with exact SHA-256 verification, then rehearsed restore of database and Storage to an isolated target. Reconcile global roles/configuration and migration release gates. PR #55 remains DRAFT/UNMERGED, production NO-GO.

---

## 2026-10-27 — FIRST PUBLIC STORAGE DOWNLOAD: LOCAL VERIFICATION ROOT MISMATCH (NOT CERTIFIED)

Operator's first absolute-destination command (`storage cp -r ss:///certificate-templates <absolute-target>`) returned `Unsupported operation` before download; no object upload or production modifications. Second attempt with a relative local destination `.` inside private `storage-download-diagnostic` **successfully logged 35 individual remote object downloads**, including `recipient-fonts/.emptyFolderPlaceholder`, beneath `storage-download-diagnostic/certificate-templates/`. However, the verification script counted *all files under the parent diagnostic directory* and reported **37 files / 36,838,436 bytes**, rather than expected 35 / 36,838,287. Excess is two files and 149 bytes. Do not misclassify the remote download as failed or certified until examining the exact bucket subfolder.

Independent production read-only `storage.objects` verification after this result confirmed **35 records / 36,838,287 metadata bytes / 1 placeholder / 0 missing sizes** for `certificate-templates`. Thus the likely cause is files outside the downloaded bucket within the parent diagnostic directory; not proven until local subfolder-only count.

**Next:** Check `$HOME/COWL-DOK-PRIVATE-BACKUPS/storage-download-diagnostic/certificate-templates` recursively with `-File -Force`, compare exact 35/36,838,287. Only after PASS run a **relative-destination** recursive download from `ss:///member-documents` while current directory is `storage-download-diagnostic`, with `--experimental --project-ref zlvofcwnpdzfdnipvbbd`, output retained privately rather than shared to chat. Verify private bucket 119/256,939,642 under `member-documents/` only, then create local hash manifest. **Never count the whole diagnostic parent** (may have CLI-generated/unrelated extra files). Do not copy unencrypted member documents to the flash drive. Encryption/second copy/isolated restore remain pending. PR draft/unmerged; NO-GO.

---

## 2026-10-27 — PRODUCTION STORAGE READ-ONLY LISTING: PASS

The operator successfully ran `npx --yes supabase@2.121.0 storage ls ss:///certificate-templates --recursive --experimental --project-ref zlvofcwnpdzfdnipvbbd` and the corresponding `member-documents` command. Both returned zero exit status with a short-lived `SUPABASE_ACCESS_TOKEN` in the operator's private PowerShell environment. Operator output:

```text
PASS: Certificate templates bucket accessible.
Loading page: 1
PASS: Private member documents bucket accessible.
```

The earlier listing attempt without `--experimental` was explicitly refused by the CLI, as documented; no production data was modified. Listing success shows authenticated bucket API access but **does not establish that all object bytes have been downloaded** or that `storage cp` is permitted under that token.

Independent production `storage.objects` metadata baseline remains **35 public `certificate-templates` objects (36,838,287 bytes) and 119 private `member-documents` objects (256,939,642 bytes), total 154 (293,777,929 bytes)**.

Next operator action: `storage cp --recursive --experimental --project-ref zlvofcwnpdzfdnipvbbd` **from each** `ss:///bucket` **to a dedicated private LOCAL destination**, never the reverse; no project link, update, delete or server-side SQL. Verify each local bucket count and aggregate byte lengths; collect a private file manifest with hashes and preserve relative paths if successful. Do not copy unencrypted Storage files to the USB device. Local download, encryption, second copy and isolated restore must be separately evidenced before production GO.

---

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