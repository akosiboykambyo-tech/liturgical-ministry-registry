# PR #55 — Staging schema alignment and guarded-write checkpoint (7 Nov 2026)

**Environment:** isolated `Ministry-Registry-Test` (`rtptybxugjhvpfjvcvgw`). Production `Ministry-Database` (`zlvofcwnpdzfdnipvbbd`) was inspected with **read-only** queries only.

## Applied to TEST only

Five versioned SQL migrations were applied successfully via the connected Supabase migration interface, after their corresponding candidate scripts were reviewed and each rehearsed using `BEGIN ... ROLLBACK`:

1. `pr55_staging_production_history_schema_isolated` — created the 13 formerly absent public/history tables with production-derived types, defaults, generated columns, 46 constraints and 25 non-constraint indexes. Enabled RLS and safe service-role grants; did **not** copy insecure fixed-email/fixed-UUID production policies.
2. `pr55_stage_atomic_guarded_registry_write_rpc` — installed the administrator-allowlist-guarded `public.registry_admin_member_write_v1(text,jsonb)` and its private summary helper. The candidate was corrected before application to write duplicate flags only into the **three production-compatible columns** (`existing_member_id`, `incoming_data`, `resolved`).
3. `pr55_stage_atomic_write_audit_triggers` — installed controlled member/ministry audit triggers and ministry timestamp maintenance; did not backfill or alter any historical row.
4. `pr55_stage_storage_bucket_and_admin_policies` — created the **empty public** `certificate-templates` bucket (as in production); preserved the staging **private** `member-documents` bucket and its stricter 5 MB/MIME restrictions; expanded its three object policies to administrator-scoped paths, added member-document UPDATE and four certificate-template administrator policies (8 total). **No Storage object metadata or bytes were copied.**
5. `pr55_stage_hardened_batch_renewal_rpc_parity` — installed production-derived administrator-guarded renewal-batch RPC and restricted helper.
6. `pr55_stage_import_duplicate_admin_readonly` — installed administrator-only SELECT grants and RLS policies for `import_batches` and `duplicate_flags`, with **no browser INSERT/UPDATE/DELETE**.

_Note: six migrations are listed above; each was applied only to TEST._

All of the reviewed migration source files are retained under `docs/sql/pr55-staging-*.ISOLATED-ONLY.sql`; the guarded member-write candidate is `docs/sql/pr55-legacy-crud-rpc.STAGING-FIRST.sql`.

## Read-only verification AFTER application

| Gate | Result |
|---|---|
| Required public tables | 17/17 |
| Storage bucket names | 2/2 |
| Storage object RLS policy count | 8 |
| Preexisting protected admin RPC names | 4/4 |
| New guarded CRUD/CSV RPC | 1 installed |
| Active private administrator grant | 1 |
| Test Auth identities | 3 |
| Existing staging members | **1,008 unchanged** |
| Existing staging assignments | **12 unchanged** |
| Storage objects / public audit rows / import batches after tests | **0 / 0 / 0** |

All **13 newly created** tables have production-matching column signatures. Across those tables, all **87 constraints and indexes** have matching names/counts; two CHECK constraint deparses are textually different but represent the same set-of-statuses condition.

The four older staging tables (`members`, `member_ministries`, `duplicate_flags`, `import_batches`) still differ from production in several column types/defaults/nullability; especially `duplicate_flags` has six extra staging-only columns. The staging UID trigger is test-specific. No populated table was destructively rewritten to force exact parity.

## Transactional authorization and workflow rehearsal

The following were exercised against the installed staging functions using the PostgreSQL `authenticated` role with existing granted/ungranted Auth subject values, all inside **rolled-back** transactions:

- Ungranted identity rejected from guarded member creation, deletion and renewal RPCs with SQLSTATE `42501`.
- Granted administrator atomically created a synthetic member plus two assignments, edited and removed an undocumented pending ministry, merged it back, created a duplicate flag, and was prevented from deleting a record with protected dependency history.
- CSV batch accepted a synthetic valid row and returned an error for a separate invalid row; protected clean delete worked.
- Audit triggers recorded expected member/ministry changes while the test transaction was open; no audit entries persisted after rollback.
- Administrator could read a synthetic private audit row; ungranted authenticated user could not.
- A renewal with a future date was denied, and an approval without an uploaded private document was denied.
- The admin could read an isolated CSV import tracking row; ungranted user could not; authenticated direct INSERT remained disabled.
- Anonymous execution of both the new registry write RPC and batch-renewal RPC is denied.

**These are SQL role/JWT-subject simulations, not independently signed HTTP JWT sessions.** Zero private Storage objects exist in staging, so actual upload/download-denial and signed-link tests cannot yet be certified. No test user passwords, account tokens or production/private documents were used.

## Remaining NO-GO release gates

1. Real signed JWT administrator and non-administrator HTTP testing using TEST accounts, including revocation, protected file upload and unauthorized download.
2. Actual browser/CSV/document workflows end-to-end against staging, with *test-only files* and synthetic data.
3. Full-fidelity staging compatibility review for four original tables, UID triggers, private bucket MIME/size limits, privileges, and **Auth/Storage service behavior**. Do not interpret matching table counts as a complete database clone.
4. Restore certification for Auth sessions/settings, private Storage bytes, roles and ACLs, including an off-device encrypted backup.
5. Controlled production migration-before-frontend deployment, post-deployment regression, then separately approved legacy direct-write grant cutover. The cutover file remains intentionally fail-closed.
6. Supabase Auth leaked-password protection setting requires a separate dashboard decision. The security advisor's authenticated SECURITY DEFINER warnings must be evaluated against internal admin checks; do not remove intentional authenticated EXECUTE from the guarded APIs without replacing clients.

**PR #55 remains DRAFT / NO-GO FOR PRODUCTION MERGE.** Production table grants, user, file objects, active admin, frontend, domain and Vercel deployment were not changed.
