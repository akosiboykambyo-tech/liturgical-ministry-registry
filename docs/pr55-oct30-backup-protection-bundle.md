# PR55 — October 30 local backup protection

Evidence from the operator: current production database archive restored successfully to an isolated PostgreSQL 17 container with 1 member, 2 ministry assignments, 1 Auth user, 37 Storage metadata entries. Read-only rclone copy and download checks confirmed all 37 actual Storage objects (36 certificate templates, 1 private member document), and a private SHA-256 manifest was generated.

Prepared offline Windows script: scripts/pr55-protect-current-recovery-set.ps1.

Input parameters: DatabaseArchive, ExpectedDatabaseSha256, StorageDirectory. No remote credentials or database URL needed.

Steps: (1) verify plaintext archive checksum and existing encrypted database backup with its original passphrase; (2) hash-check every Storage file against its private manifest; (3) create and verify a ZIP with 37 objects plus manifest; (4) encrypt and authenticate the ZIP using a separately entered passphrase; (5) SHA256-verify second encrypted copies on Drive D, without overwriting existing files.

The script contains no Supabase connection, production SQL, rclone upload, Vercel deployment or merge operations. It retains the original unencrypted backup files and ZIP pending independently approved recovery verification.

Limitations: copies on C and D are on the same PC and are not independent/offsite backup protection. Roles and ACLs omitted by the diagnostic restore are still unproven. Full Auth and Storage service recovery, security repairs, and final release approval remain NO-GO. No changes to production were authorized or made.

## Operator execution result — October 30, 2026

The operator executed `scripts/pr55-protect-current-recovery-set.ps1` from the local Windows checkout and reported the following results:

```text
PASS: original production archive checksum matched
PASS: encrypted archive decrypts in memory and matches original SHA256; no plaintext file written
PASS: database encrypted archive authenticated and verified
PASS: 37 local Storage files individually matched their private SHA-256 manifest
PASS: Storage ZIP contains 37 hash-verified objects and the private manifest
PASS: Storage ZIP encrypted and decrypted in memory for authenticated verification
PASS: Storage encrypted ZIP independently authenticated and original SHA256 verified; no plaintext written
PASS: Storage encrypted archive authenticated and verified
PASS: second LOCAL encrypted copies on D: matched SHA-256 checksums
LIMIT: D: copy is on the same PC, not an independent/offsite disaster-recovery copy
LIMIT: Supabase Auth service, role/ACL parity and live Storage restore remain untested
LIMIT: plaintext Storage ZIP and original downloaded folder remain; do not delete until recovery is independently validated
```

The encrypted Storage ZIP is reported as **36,714,607 bytes**. Its confidential filenames, the source file names, manifest entries, passwords and secret-bearing paths are intentionally omitted.

**Closed local backup protection gates:** original current production PostgreSQL archive checksum; authenticated existing encrypted database backup; all 37 downloaded current Storage file hashes; ZIP contents and private manifest checks; authenticated Storage ZIP encryption; and byte-identical encrypted local copies verified by SHA-256 on Drive D:. The earlier strict PostgreSQL 17 restored current database schema and data counts (1 member, 2 ministry assignments, 1 Auth user, 37 Storage metadata rows) in a disposable offline instance.

**Remaining NO-GO gates:** physically independent encrypted off-device/off-site copy; independent restoration using protected archives rather than original plaintext; faithful database roles/ACLs and Auth service behavior; private Storage service restoration and authenticated access checks; reviewed server-side security/legacy writes and release rollout/rollback; explicit merge authorization. Drives C: and D: are on one PC, so they cannot independently survive machine failure or theft. No production data or permissions were changed during the protection run; no PR was merged.
