# Phase 2 — Registration integration audit

**Scope:** Code review against `main` after PRs #44–#48. Audit only; no migration, production writes, or changes to runtime behavior.

## Verified code paths

| Area | Current implementation | Integration gap |
|---|---|---|
| Add Member | `app/admin/members/add/page.tsx` uses `validateRegistrationIntake` and `normalizeApprovedMinistries`, then `importSingleMember` | Still browser-triggered database writes; duplicate-check failure safety remains in draft PR #30 |
| Individual duplicate | `lib/duplicate-check.ts` writes potential matches to `duplicate_flags` | Not routed through the proposed persistent unified review-case schema |
| CSV parser | `app/admin/import/page.tsx` validates/canonicalizes approved ministry labels | Does not call the new offline `preflightBatchIntake` or shared review-case drafting function |
| CSV staging | `stageBatchRecords` checks existing members and internal matches; `pendingMerges` lives in component state | Review data may disappear when the browser session ends; not a persistent cross-workflow queue |
| Admin duplicate preview | `app/admin/duplicate-review-preview/page.tsx` previews decisions using fictional records | Not authenticated server-side queue processing, persistence, or audit history |
| Recommendation letter | Existing renewal-batch flow accepts a shared letter and invokes `process_recommendation_renewal_batch` | Offline `checkRecommendationLetter` helper not integrated into actual uploads or approvals; individual registration has no shared proof-of-approval integration established by this audit |
| Expiration | `lib/registration-validity.ts` computes one-calendar-year date from approval/renewal | Not used in live verification/renewal writes; per-ministry expiry and historical documents require DB integration validation |
| Queue schema | Proposed SQL is on draft PR #38, not on `main` | Must reconcile with existing `duplicate_flags`, roles, triggers, FK constraints, and retention policies |

## Safety findings

1. **No assumption that name match establishes identity.** Different people can share first and last names within one parish; all probable matches require human evidence.
2. **Fail closed.** If an exact/fuzzy existing-member query fails or returns an incomplete result, do not create a new UID. PR #30 addresses part of this but needs isolated integration tests.
3. **Server-controlled authorization and transactions.** A persistent queue needs authenticated privileged operations, row locks, atomic member + membership + review-event updates, and idempotent retries. Browser-only state is not sufficient.
4. **No duplicate ministry assignment.** Keep the original UID, preserve verified/renewed dates, and only add genuinely new Pending Verification ministries.
5. **Expiry must be tied to approved verification/renewal**, not CSV intake date, file upload time, or mere Pending Verification status. Registration validity is one calendar year.
6. **Letter attachment is not letter approval.** The future workflow must validate the assigned ministry/parish, required evidence, reviewer decision, and storage security.
7. **Security gate.** The existing registry access migration contains specific administrator-UID policies while the proposed queue design uses role claims. Decide and test one trusted admin authorization mechanism before applying any queue schema.
8. **No migration in this audit.** PRs #37 and #38 remain drafts; do not apply them to production.

## Recommended implementation order

1. Merge/review this audit documentation.
2. Improve PR #30 with mocked database-failure and pagination tests. Keep draft until verified in a disposable Supabase environment.
3. Specify one source-of-truth intake and review-case DTO for individual and CSV imports; test multi-candidate, cross-parish, and repeated batch cases offline without production writes.
4. Adapt the admin queue to authenticated, read-only review mode behind a disabled feature gate until persistence is available.
5. Reconcile existing `duplicate_flags`, CSV batch tracking, draft schema and auth roles in an isolated database; define archival/backfill.
6. Implement audited atomic queue decisions; integration-test concurrency, rollback, idempotency, least privilege, and no unauthorized UID creation.
7. Integrate recommendation-letter evidence and one-year per-ministry expiry at verified/renewed transitions; test historical validity.
8. Activate production only after approved migrations, backup plan, security review, and explicit deployment approval.

## Verification notes

The 62 offline tests validate pure matching, intake checks, queue planning, document prerequisites and date calculations. They **do not** establish that the production database workflow is integrated, secure or fully tested.

No production data should be deleted, merged, expired or updated for this audit.
