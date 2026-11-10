# PR55 — Legacy member CRUD/CSV server-authorization implementation (2026-11-07)

## Scope completed in this development branch

The old browser-write paths are replaced with `registryAdminWrite` calls through
`public.registry_admin_member_write_v1(text,jsonb)`. The entrypoint is a
`SECURITY DEFINER` procedure with an explicit `auth.uid()` and active private
`registry_private.registration_administrators` allowlist check, fixed
`search_path`, revoked `PUBLIC`/`anon` EXECUTE and authenticated-only EXECUTE.

Implemented operations:

| Operation | Business rule |
|---|---|
| `create` / `create_batch` | Atomic member + per-ministry pending assignments; bounded CSV sub-batches; per-row savepoint-like errors without browser compensating DELETE |
| `save` | Atomic name/parish/notes, exact ministry synchronization, safe pending/inactive transitions; direct approval and manual approved-validity tampering blocked |
| `merge` | Add only missing pending ministries; never reset previously verified assignment rows |
| `delete` | Refuses when any member/assignment letters, archived evidence, certificates, renewal history, duplicate flags, reports, linked requests or private Storage objects exist; never delete Storage first |
| `document` | Legacy member document link/unlink requires an existing private uploaded object; unlink leaves the physical file for audit |
| `activate` / `renew` | Per-assignment private letter is verified to exist in the expected owner-scoped path; dates set by server clock in Asia/Manila; exactly one calendar year; previous evidence archived |
| `detach` | Per-assignment unlinks letter, resets to Pending Verification, archives reference and retains physical private evidence |
| `set_status` | Allows only Pending Verification / Inactive directly; New / Renewed requires document-backed verification |
| `import_begin` / `import_finish` | Administrator-guarded batch metadata and idempotency state |
| `flag_duplicate` | Administrator-guarded duplicate-case creation |

Existing audited ministry renewal batch RPCs are not replaced; the new system keeps
them as the canonical batch-renewal pathway. Existing read-only member searching,
filtering, reports and CSV export are not affected by this proposed write cutover.

## Changed caller files

- `app/admin/members/page.tsx`: safe inline edits and protected deletion
- `app/admin/members/[id]/page.tsx`: profile/ministry changes and legacy private letter links
- `components/member-detail-drawer.tsx`: single atomic member+ministry save, unique private verification letter per assignment, one-year New/Renewed activation, evidence-preserving detach; approved validity fields read-only
- `app/admin/import/page.tsx`: guarded batch metadata, bounded CSV insertion, manual duplicate merge and keep-separate
- `lib/duplicate-check.ts`: guarded single creation, duplicate flags and bulk insert
- `lib/verify-actions.ts`: use `registry_verify_ministries_v1` and require ministry letters; do not mutate legacy member status directly
- `app/admin/verify/page.tsx`: mass uploads attach a private letter separately to each pending assignment, without approving it

## Testing observed

- The SQL candidate parsed and its function EXECUTE grants were confirmed
  inside a fully rolled-back isolated staging transaction.
- In a separate rolled-back staging transaction, an existing granted Auth ID
  created one synthetic member and two pending ministry assignments, saved and
  removed one undocumented assignment, merged it back, and deleted the test
  member. The same transaction created two CSV rows, accepted the valid row,
  rejected the invalid row without affecting the valid row, and deleted the
  valid synthetic row.
- The existing ungranted staging Auth identity received SQLSTATE 42501 for
  attempted creation, and documentless activation was rejected.
- **Important limitation:** TEST is not a production schema clone. It lacked
  `recommendation_renewal_memberships`, `certificate_downloads`,
  `name_correction_requests`, and `public_reports`. Transaction-only stub
  tables were created **solely for the dry run**, then rolled back. The
  candidate now has a fail-closed preflight which will refuse installation in
  an environment without these real historical tables.
- This was a SQL JWT-claim-role rehearsal, **not fresh signed HTTP/JWT test**.
  File uploads/downloads and retention still require real isolated Storage
  API coverage. No real production member was changed by this work.
- The offline CI runs Node tests, TS typecheck and PowerShell syntax checks;
  the new `tests/production-registration-legacy-write.test.cjs` prevents
  regression to browser-side member/ministry/import mutations.

## Release sequence — NOT approved or performed

1. Bring an isolated staging clone to **true production schema/role/Storage
   parity**, with only synthetic members and protected fixture documents.
2. Deploy the candidate RPC to staging and complete real signed JWT admin,
   nonadmin and revoked-admin authorization tests through HTTP. Verify New,
   Renewed, Inactive and pending cases, import idempotency/concurrency, letter
   replacements, duplicate merges, protected deletion and Storage isolation.
3. Verify independent encrypted off-device backup and actual Auth+Storage
   recovery/ACLs; preserve existing production admin session.
4. Deploy guarded SQL to production **before** deploying the new frontend;
   otherwise the new frontend's writes fail closed. No production schema
   deployment has occurred for this candidate.
5. Deploy matching frontend from PR55 after its remaining release gates pass;
   perform controlled administrator browser regression with no private data
   disclosure and no accidental test writes to real records.
6. **Only after all workflows are verified**, review and deliberately execute
   `docs/sql/pr55-legacy-write-grants-cutover.REVIEW-ONLY.sql`, which currently
   contains an unconditional exception preventing accidental application.
   Never remove legacy table write grants before this point, and never blanket
   restore public authenticated write privileges to roll back.

## Explicit safety boundaries

- PR55 stays **DRAFT / NO-GO FOR PRODUCTION MERGE**.
- New candidate has not been applied to production or enabled in Vercel.
- Existing production direct-write grants and old UI remain untouched so
  the live COWL-DOK administrator cannot be locked out.
- PR56 verification navigation and PR57 season workflow remain separate
  draft work. No test records should be treated as genuine ministry history.
