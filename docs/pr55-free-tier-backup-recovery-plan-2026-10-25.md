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