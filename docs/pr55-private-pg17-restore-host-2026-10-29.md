# Private PostgreSQL 17/Supabase recovery host — operator-selected Free-plan path

**Date:** 2026-10-29. **Production NO-GO.**

The user selected a private, operator-approved PostgreSQL 17 / Supabase-compatible recovery environment **without upgrading the Supabase Free plan**. No private Linux machine or VM has yet been specified or connected, and the previously inspected Windows PC lacks working WSL2/Docker and a compatible Vault extension. **No backup has been moved, restored or downloaded in this step.**

## Approved host prerequisites

A separate operator-controlled private Linux workstation, dedicated server or privately administered VM with appropriate permissions and isolation is required. The Supabase self-hosted Docker full-stack published minimum is **4 GiB RAM / 2 CPU cores / 40 GiB SSD**, with **8 GiB / 4 cores / 80 GiB recommended**. Docker Engine and Compose must work, the runtime must contain PostgreSQL 17 and the required Supabase extensions and roles including `supabase_vault`, and all local services must bind to loopback or approved private network. Do not expose restored members or Auth/Storage to the public internet.

Official references:
- https://supabase.com/docs/guides/self-hosting/docker
- https://supabase.com/docs/guides/local-development
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/local-development/restoring-downloaded-backup

## Offline host verification

Copy the repository's **code only** to the approved host; do not copy the protected archive until isolation/encryption/retention have been separately authorized.

Run this read-only preflight in a terminal on the approved Linux host:

```bash
bash scripts/pr55-private-restore-host-preflight.sh
```

Optionally, once locally permitted and encrypted, supply a private archive path to test only that the local file exists and has content:

```bash
bash scripts/pr55-private-restore-host-preflight.sh /private/offline/backup.backup
```

This script performs NO network requests, backup exports, restores, image pulls or container creation. A PASS means **only** basic host prerequisites; it is not recovery certification.

## Strict restore acceptance criteria

1. Operator identifies/approves host, responsible person, network isolation, access controls, storage encryption, disk headroom and secure disposal policy.
2. Operator creates a **fresh encrypted production snapshot** at the actual release point; the SHA256-verified October 26 archive predates the later data reset and is stale. A database snapshot alone is insufficient: capture Auth tables and supporting roles, all Storage metadata **and the underlying bytes of every stored object**, private bucket policies/configuration and all required settings.
3. Use a compatible Supabase PostgreSQL 17 image with extension versions and roles verified. The prior custom `pg_dump` archive must be restored with its proper `pg_restore` workflow—not uncritically passed to the Supabase CLI downloaded-dashboard-backup instructions. No skipped errors/extensions, or unsafe Vault key disclosure.
4. Rehearse strict restore in the isolated host. Compare fresh snapshot counts and references, verify Auth login behavior in an isolated test domain, fetch and validate a private object, run read-only application smoke tests, and demonstrate recoverability after a failed schema migration.
5. Record encrypted backup checksums, exact restore logs securely, human review and recovery RTO/RPO. Dispose of restored real records only under the approved retention policy.
6. **No production DDL, bulk edits, PR merge or feature activation** before all gates pass and an explicit release decision.

Current read-only production baseline observed October 29: **1 member, 2 ministry assignments, 1 Auth user, 37 Storage objects**. Counts are time-sensitive and must be re-read at backup/restore time.

## Separate letter-record finding

After correcting the one-year expiration, both Renewed assignments lack a per-ministry recommendation-letter path, but the older member-level document points to a real private Storage file. A draft UI warning change distinguishes missing link from missing file, rather than suppressing validation. The legacy member drawer's upload action renews the membership again and therefore must **not** be used to clear the warning. The existing document requires an administrative review of ministry coverage and a separate approved attachment method. Ministry of Liturgical Music is future-dated as Renewed on November 7, 2026 relative to the October 29 audit; this also requires review.
