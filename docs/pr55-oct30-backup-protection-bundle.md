# PR55 — October 30 local backup protection

Evidence from the operator: current production database archive restored successfully to an isolated PostgreSQL 17 container with 1 member, 2 ministry assignments, 1 Auth user, 37 Storage metadata entries. Read-only rclone copy and download checks confirmed all 37 actual Storage objects (36 certificate templates, 1 private member document), and a private SHA-256 manifest was generated.

Prepared offline Windows script: scripts/pr55-protect-current-recovery-set.ps1.

Input parameters: DatabaseArchive, ExpectedDatabaseSha256, StorageDirectory. No remote credentials or database URL needed.

Steps: (1) verify plaintext archive checksum and existing encrypted database backup with its original passphrase; (2) hash-check every Storage file against its private manifest; (3) create and verify a ZIP with 37 objects plus manifest; (4) encrypt and authenticate the ZIP using a separately entered passphrase; (5) SHA256-verify second encrypted copies on Drive D, without overwriting existing files.

The script contains no Supabase connection, production SQL, rclone upload, Vercel deployment or merge operations. It retains the original unencrypted backup files and ZIP pending independently approved recovery verification.

Limitations: copies on C and D are on the same PC and are not independent/offsite backup protection. Roles and ACLs omitted by the diagnostic restore are still unproven. Full Auth and Storage service recovery, security repairs, and final release approval remain NO-GO. No changes to production were authorized or made.