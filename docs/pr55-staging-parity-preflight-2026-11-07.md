# PR #55 — Staging parity preflight, 7 November 2026

## Decision

**NO-GO for secure write-RPC deployment and final production cutover.** A Git clone to a second Windows laptop copies **repository source code**, not a Supabase database, Auth users, or private Storage files. The active Supabase organization currently exposes exactly two projects: `Ministry-Database` (production, `zlvofcwnpdzfdnipvbbd`) and the existing `Ministry-Registry-Test` (staging, `rtptybxugjhvpfjvcvgw`). No new cloned database project was detected. Both projects are healthy.

All observations below were from **read-only SQL** and connected project metadata. No accounts, tables, Storage objects, grants, policies, or production records were changed by this preflight.

## Current comparative inventory

| Metric | Production | Existing staging |
|---|---:|---:|
| Members | 1 | 1,008 |
| Ministry assignments | 2 | 12 |
| Auth users | 1 | 3 |
| Active private registration administrators | 1 | 1 |
| Storage objects (metadata rows) | 37 | 0 |
| Public base tables | 17 | 4 |
| Storage buckets | `certificate-templates`, `member-documents` | `member-documents` only |
| `storage.objects` RLS policies | 8 | 3 |
| Existing expected guarded RPC names | 4/4 | 3/4 |
| New `registry_admin_member_write_v1` | Not installed | Not installed |

Staging is missing these **13 production public tables**:
`admin_login_attempts`, `admin_login_reservations`, `audit_logs`,
`certificate_downloads`, `name_correction_requests`, `public_reports`,
`recommendation_renewal_batches`, `recommendation_renewal_memberships`,
`renewal_review_items`, `scanned_duplicates`, `signatories`,
`system_settings`, `verification_rate_limits`.

The staging RPC missing from the expected four is `process_recommendation_renewal_batch`. Staging does have `registration_is_admin`, `registry_verify_ministries_v1`, and `registry_attach_ministry_letter_v1`.

Production PostgreSQL reports version 17.6.1.155 in ap-southeast-2; staging 17.11.0.003 in ap-northeast-1. These observations do **not** certify extension/role/index/trigger/ACL equivalence.

## What has already been completed

- Latest PR55 GitHub Actions offline registration safety/compatibility tests, TypeScript checks and Windows parsing passed at commit `4d7cf1a`.
- Candidate `docs/sql/pr55-legacy-crud-rpc.STAGING-FIRST.sql` passed a **transaction-only** SQL-claim staging rehearsal with missing history table stubs; the candidate and stubs were rolled back.
- An independently restored PostgreSQL archive and a protected backup/hash workflow were previously tested; full Supabase Auth/Storage/roles recovery remains unproven.
- A reusable metadata-only SQL checklist now lives in `docs/sql/pr55-staging-parity-gates.READONLY.sql`; executed against **both** current projects. Staging passes active-admin and test-account presence, but fails the public tables, Storage buckets, Storage policy, and guarded RPC presence checks.

## Next steps to actually finish Stage 1

1. Recreate and review a **schema-only** production-compatible isolated test environment without copying real member or Auth credentials. Prefer reviewed versioned migrations and synthetic fixtures; do not overwrite staging's existing 1,008 records as an unapproved side effect.
2. Compare exact table columns, constraints, indexes, triggers, RLS policies, grants, function definitions, roles, bucket privacy and Auth settings, not only names or counts. Ensure missing protected history tables are real schema-equivalent tables before installing the candidate function.
3. Install the guarded member-write candidate in the isolated staging project **only after** schema parity is verified; test transactional create/edit/delete/import/merge/letters/expiry and evidence retention with synthetic fixtures.
4. Execute separately signed administrator and ungranted-user JWT HTTP tests with real Supabase Auth accounts, plus actual private Storage upload/download-denial tests; SQL role impersonation alone is insufficient. Staging secrets are not available in chat and must not be disclosed.
5. Complete independent Auth/Storage restore plus roles/ACL recovery and controlled rollout plan. Do not merge the draft PR or revoke production's legacy grants in advance.

## Duplication and cost limitations

Supabase's official managed **Restore to a new project** feature currently requires a paid plan and physical backups, and *does not copy private Storage bytes or the full service settings*. There is no authorization to upgrade or purchase resources. Existing-staging schema alignment plus test-only synthetic data can be a no-new-subscription alternative, but must be correctly reviewed and measured.

**No production deployment, new project creation, billing change or copy of actual private data has been attempted by this checkpoint.**
