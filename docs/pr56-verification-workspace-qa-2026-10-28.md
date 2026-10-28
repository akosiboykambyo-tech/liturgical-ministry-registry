# PR #56 — Verification workspace QA and release gates (2026-10-28)

## Implementation and risk
The four tabs are implemented: New Registrations, Renewals, Pending Review, History.

Registration `Stage & Import` is a database write, **not** a dry run. It creates new Pending Verification members before showing duplicate review cases. PR #56 now requires explicit acknowledgment and records known outcomes on failures. If a batch may have partially written rows, it prevents immediate replays until registry/audit reconciliation. No server-side registration or approval authorization was modified.

Duplicate registration candidates are an in-memory queue. They survive switching tabs while the component remains mounted, but **do not** persist across refresh or navigation. The browser unload warning is best effort. A new CSV is blocked while that temporary queue is present. Saved renewal review cases are independent persisted records.

## Non-mutating QA
1. On the preview, open all four tabs, check URL states, keyboard behavior, mobile layout, direct legacy routes and empty/loading/error presentations.
2. Use a synthetically generated CSV only for local parsing and preview. Do **not** click Import with a production-connected preview.
3. Check that invalid parishes/ministries are rejected, and that acknowledgment is required before import.
4. Review the renewal stage-only screen, including the one-parish rule, mismatches and shared recommendation-letter requirements. Do **not** process a live batch.
5. Verify approvals and saved review queues **read-only**.

## Mutating isolated E2E (blocked pending suitable staging)
Use only an explicitly approved environment with a schema matching production, separate Auth users, synthetic members, and a tested cleanup plan. Exercise the import, duplicate handling, renewal exception decisions, and membership statuses. Record database before/after counts. Do not move production records into the test database.

Read-only inspection on 2026-10-28 found that connected Supabase project **Ministry-Registry-Test** contains the public tables `members`, `member_ministries`, `duplicate_flags`, and `import_batches`, all with RLS enabled. The required renewal batch/history/review tables are absent from this inventory. Full E2E of all four tabs is not yet possible there without a reviewed staging schema.

## Offline commands
```sh
npm ci --ignore-scripts
npm run typecheck
node --test tests/pr56-verification-workspace.test.cjs
npm run test:registration
```
The new checks primarily assert source integration and safe failure boundaries. They are not a substitute for browser E2E or security tests.

## Release gates outside this PR
- **PR #55** is draft/NO-GO for production registration activation: staging committed-revocation and authenticated HTTP/JWT checks, approved migration/grants, backups/rollback, and release monitoring remain prerequisites.
- The legacy `quickVerifyMember` updates `members.status`, not each `member_ministries` assignment. Member-level and assignment-level verification/expiry consistency is unresolved.
- Renewal processing allows manual next-renewal dates; the one-calendar-year validity rule needs enforcement at the authoritative write boundary, not only in UI.
- Legacy routes and saved review permissions must be tested before release.

PR #56 **must not be treated as security sign-off** or used to activate unapproved registration features. Keep it draft until both QA and release prerequisites pass.
