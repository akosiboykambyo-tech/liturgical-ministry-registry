# PR55/PR56 — Combined production hardening and release gates (2026-10-29)

**Decision: NO-GO. Production has not been changed.**

## 1. Administrator authorization

Read-only production audit: `registry_private.registration_administrators` does not exist. Registry read/write RLS policies rely on one hard-coded Auth UUID; `check_renewal_admin_access()` checks a fixed JWT email. Both are unsuitable for revocable production authorization.

Two intentionally non-executable proposals separate creation of an **empty** private admin table from the later privilege cutover. Never automatically seed a staging ID, hard-coded UUID, email or editable JWT metadata. An authorized operator must verify the specific real production Auth user, approve and audit the separate grant seed, then pass fresh real JWT admin/ungranted denial tests.

## 2. Legacy write-path and sensitive renewal history

Read-only production effective privilege preflight:
- `members`: authenticated INSERT/DELETE and SELECT; UPDATE absent under the inspected effective permissions. Fixed-UUID ALL RLS restricts rows.
- `member_ministries`: authenticated INSERT/UPDATE/DELETE/SELECT with fixed-UUID ALL RLS.
- Both `recommendation_renewal_*` tables: broad anon/authenticated SQL grants; authenticated SELECT RLS is `USING (true)`.
- `process_recommendation_renewal_batch` remains SECURITY DEFINER and fixed-email-authorized, and accepts client-supplied expiration later than the renewal date.

Broad grants **do not alone prove unauthorized access** when RLS denies rows, but they increase unnecessary exposure. The proposed Phase 2 cutover changes four tables to private-admin-only SELECT policies and removes direct INSERT/UPDATE/DELETE grants for anon/authenticated. Only separately approved, audited administrator RPCs would be allowed to perform changes.

PR56's secure-mode UI now additionally pauses member-list editing/deletion, member-wide PDF upload/deletion, and the old mass-upload handler. The existing Quick Scan, drawer, and selected-ministry safeguards remain. These **temporary functionality freezes** are not substitutes for database authorization. An actual cutover would intentionally break other old direct-edit/CSV/import workflows unless compatible secured alternatives are installed and tested. Do not enable the production flag yet.

**Isolated staging ACL rollback rehearsal PASS:** an active administrator read synthetic private renewal history; an ungranted authenticated user saw zero protected rows; neither administrator nor nonadministrator had direct UPDATE/DELETE access. All synthetic ACL objects rolled back. Earlier real HTTP/JWT staging grants/revocation tests remain separate passed evidence.

## 3. Historical renewal mismatch

Read-only production: **2 Renewed assignments**, one exactly one calendar year after renewal, **one precisely 1 day shorter** (both dates non-null), zero longer. This may reflect an inclusive last-day convention or a data-entry error. Do not silently change its dates.

An authorized reviewer must establish the original letter/renewal date and validity convention without posting confidential member details; record whether the earlier expiry is an intentional historical exception or a correctable error. If correction is approved, use an audited, narrowly-scoped one-record change with before/after evidence. Do not bulk-extend dates or validate a blanket one-year constraint first. The staging one-year trigger checks only new/changed validity tuples so unrelated historical edits still work.

## 4. Full-fidelity restore and rollback

The SHA256-checked production logical backup is dated **October 26** and predates the October 27 test-data reset and new production entries; it is not a current predeployment snapshot. The Windows machine's earlier restore attempt was blocked by PostgreSQL **18 vs hosted 17** plus missing `supabase_vault`; WSL2/Docker prerequisites were unavailable, system resources constrained. Backups were verified, but **full restoration was never certified**.

`scripts/pr55-restore-host-readiness.ps1` performs **offline read-only** PostgreSQL 17 tools/extension and original archive hash checks. It cannot restore data or certify recovery. A fresh encrypted **current** production backup, Auth and Storage blob recovery plan, compatible and approved isolated PostgreSQL 17/Supabase environment, roles, extensions, Vault key portability where necessary, checksum verification, strict restore with no skipped errors, application read test and signed rollback are all mandatory. Do not move user backups to an unapproved server or change BIOS/WSL/Docker automatically.

## Release sequencing

1. Obtain reviewed operator sign-off for an approved isolated restore host. Preserve the old archive, obtain a fresh encrypted current backup and certify an actual restore/rollback. **Stop if not possible.**
2. Verify the intended production Auth identity, install empty allowlist under reviewed migration, separately seed an audited active admin grant; prove access and revocation with real JWTs.
3. Install hardened renewal and verification RPCs, build secure alternative admin edit/delete/import flows, and test all affected UI workflows. Do not cut off legacy writes without their replacements.
4. Resolve or explicitly grandfather the one-day validity mismatch; rerun read-only counts and policy approval.
5. In an approved maintenance window, perform the RLS/grant + RPC changes atomically, monitor, then enable secure UI after positive tests. Merge drafts only on explicit production approval.

## Files

- `docs/sql/pr55-production-admin-foundation.REVIEW-ONLY.sql`: deliberately aborting empty allowlist proposal.
- `docs/sql/pr55-production-admin-readonly-and-legacy-write-cutover.REVIEW-ONLY.sql`: deliberately aborting admin RLS + no direct writes proposal.
- `docs/sql/pr55-staging-admin-acl-lab.ROLLBACK-ONLY.sql`: exercised successfully in staging; no persisted lab objects.
- `scripts/pr55-restore-host-readiness.ps1`: strict offline prerequisite checks, not a restore.
- `docs/pr55-server-side-renewal-enforcement-2026-10-29.md`: earlier passing staging one-year tests and pending production schema compatibility.
- `docs/pr55-free-tier-backup-recovery-plan-2026-10-25.md`: historical backup/restore evidence.

**No production migrations, member edits, admin grant changes, backup extraction, project cloning, PR merges or feature activation occurred.**
