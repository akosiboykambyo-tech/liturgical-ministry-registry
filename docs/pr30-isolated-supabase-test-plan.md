# PR #30 — Isolated Supabase integration-test gate

**Status:** Prepared, not executed. The connected Supabase account currently exposes one active project, `Ministry-Database`. Treat that project as **production** until independently verified otherwise. This checklist must only be run against a separate disposable Supabase project or a verified local Supabase instance containing fictional seed data.

## What has passed

- `npm run test:duplicate-safety`: **5 passed** (mock database client).
- `npm run test:registration`: **62 passed**.
- `npm run typecheck` and `npm run build`: passed on PR #30 after clearing stale `.next` output.
- These results validate code behavior under test doubles, **not** database permission/RLS behavior.

## Preflight (required before any DB write)

- [ ] Establish a distinct **disposable** database project/reference; record the non-production reference in test logs.
- [ ] Confirm its URL and project ref differ from the current production `Ministry-Database` project. Never copy production member PII into the test database.
- [ ] Apply only reviewed schema/migrations required for current registration import, with fictional parish and person records.
- [ ] Use a test admin account and a separate non-admin account. Do not expose service-role credentials to browser code.
- [ ] Validate RLS: both read access for matching and write access for intake must be explicitly authorized. A denied read must not look like an empty registry.
- [ ] Inventory `members`, `member_ministries`, `duplicate_flags`, `import_batches`, RPCs and triggers before any test runs.
- [ ] Record baseline counts and IDs and ensure all test artifacts can be safely destroyed with the disposable database.
- [ ] Disable outbound notifications and other external effects during tests.

## Test matrix

| Test | Fixture and failure | Required result |
|---|---|---|
| Exact duplicate | Existing same first name, surname and parish | New member not created; duplicate queue routed for admin review |
| Cross-parish match | Existing same name under different parish | No automatic UID merge; manual review required |
| Fuzzy match | Plausible typo of existing name | Manual review; never silently create a new UID |
| Truly distinct person | Fictional unmatched applicant | Create exactly one UID and requested valid ministry assignments |
| Database query error | Force exact-name lookup error | Fail closed; 0 member inserts |
| RLS-denied lookup | Test account lacks read permission | Fail closed; 0 member inserts, not an empty match set |
| Page 2 duplicate | Seed >1,000 fictional members, duplicate after first page | Duplicate found; no silent new UID |
| Pagination error | Fail page 2 of full-registry scan | Fail closed; 0 member inserts |
| CSV staging error | Full-registry scan unavailable | Stop before *any* batch member writes |
| Repeated request | Resubmit same fictional registration | No new duplicate UID; queue/event action idempotent |
| Parallel requests | Two simultaneous registrations for same identity | No accidental duplicate UIDs; investigate transaction / unique-index gap |
| Queue write failure | `duplicate_flags` insert rejected | No member created; actionable error; no lost audit trail |
| Other ministry | Incoming label outside six approved ministries | Reject before persistence |
| Service restoration | Query succeeds after temporary failure | Normal functionality resumes without retry duplicates |

## Evidence to collect

For each scenario, record the selected test project ref, test timestamp, fixture ID, member row count before/after, ministry assignment count, duplicate queue count, user role, expected result, actual result, and server/browser error. Never paste keys, JWTs, private addresses, or real member information into a public PR.

## Release / merge rule

Keep PR #30 **draft** until its against-database failure behavior has been verified and code review confirms no accidental authorization bypass, partial imports, or race conditions. Merging the PR and enabling production functionality are separate approval gates. Do not apply the queue schema proposal in PR #38 as part of this test.

## Known limits

Tests cannot prove safe duplicate prevention if RLS hides matching member rows without returning an error. Fixing that requires a trusted, audited, server-authorized lookup design; do **not** broadly relax RLS to make duplicate detection work. Name resemblance is not proof of same person.
