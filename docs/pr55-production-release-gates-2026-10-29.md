# PR55 — Live production release-gate inventory and decisions
*Read-only inspection dated 2026-10-29. Production was not modified.*

## Current baseline (not a backup)
- 1 member, 2 ministry assignments, 1 Supabase Auth user, 2 Storage buckets, **37 Storage objects**, 0 renewal batches. Source Postgres version 17.6.
- Existing fixed-UUID registry policy matches the **sole existing Auth user**. This makes a candidate for a revocable grant, not automatic proof of their identity, account ownership or authorization to seed the grant.
- One of the two Renewed assignments is recorded as renewal 2026-09-19, expiration **2027-09-18**. The one-calendar-year anniversary is 2027-09-19. Frontend `registrationValidity()` and `getExpirationStatus()` treat the stored expiration day as **inclusive**, so this shorter expiry is an actual one-day discrepancy under the current app contract. No member ID or personal details are copied into this review. **Operator decision required**: approve precise correction to 2027-09-19 with audit evidence, or preserve as a documented historical exception.
- Production still lacks the private active-admin allowlist, secure ministry verification RPC, and hardened annual renewal RPC. `authenticated` can still UPDATE ministry assignments subject to old fixed-UUID RLS; an open `authenticated` renewal-history SELECT policy remains. No assertion of unauthorized exploitation is implied.

## Recovery: choose an authorized compatible path
The organization was verified to have a **Free plan**. Supabase's [Restore to a new project](https://supabase.com/docs/guides/platform/clone-project) is **paid plan + physical backups only**, and its managed database clone expressly **does not copy Storage objects**, Auth settings/API keys, or all service configuration. A paid managed clone may simplify database/Vault recovery but does not eliminate Storage blob/reconfiguration checks or the need for current restore evidence. No paid plan or new project was purchased.

The existing SHA-256-verified local October 26 archive predates the October 27 bulk reset and subsequent activity. It is **not a current release rollback point**. A fresh protected export requires operator-owned production database credentials and authorization; do **not** paste them into GitHub/ChatGPT or commit them. The existing `scripts/pr55-production-readonly-backup.cjs` can be used with its required opt-in, locally and securely, for a new logical archive. A backup export does not certify a full restore.

Alternative paths are:
1. **No new subscription:** an approved, private compatible PostgreSQL 17 + Supabase extensions/roles runtime, isolated and with sufficient resources, a strict current archive restore and separately restored Storage blob/Auth service tests. Earlier operator Windows host cannot provide it in its verified condition; provisioning it requires separate authorization and appropriate resources.
2. **Managed physical recovery:** operator-approved paid Supabase plan with physical backups; review actual charges and retention before authorizing a restore-to-new-project. Must still reconcile Storage blob backup and service settings. Do not silently upgrade or create paid resources.

## Release decision gates
`docs/sql/pr55-production-release-gates.READONLY.sql` is an independently executed read-only 9-item metadata check. It currently reports one admin identity **candidate** and eight informational/blocked findings, **not** a GO decision. Execute it again after (not before) a separately approved recovery and security migration.

Before any production mutation, require (a) fresh restore-tested protected backup with 37 current Storage blobs accounted for, (b) approved admin Auth identity and role grant, (c) explicit one-day expiry disposition, (d) replacement/accepted freeze of legacy member Add/Edit/Delete/CSV/renewal actions, (e) executed real-JWT grant and permission tests on a production-faithful restored isolate, and (f) signed deployment and rollback plan. All are still open.

Latest PR55 and PR56 changes remain draft/unmerged with production feature flag disabled. **NO-GO.**
