# Registration Intake v2 — Review-Only Database Contract

**Decision requested:** approve this *design* for a later, isolated TEST implementation.  
**Status:** SPECIFICATION ONLY — no SQL is executed, no migration is created, no frontend route is changed, and this is **not** an authorization to enable writes.

Reference baseline: `feature/atomic-intake-adapter-review-20261119`, based on `audit/pr30-pr53-failclosed-reconciliation-20261118`. This document refines `docs/atomic-registration-minimal-integration-review.md`.

## 1. Verified TEST baseline (read-only)

Project: `Ministry-Registry-Test` (`rtptybxugjhvpfjvcvgw`) **only**. Production has not been inspected or changed in this work item.

`public.registration_intake_v1(p_request uuid, p_first text, p_last text, p_parish text, p_ministries text[], p_year integer)`:
- Is present, `SECURITY DEFINER`, with `search_path = ''`.
- Is executable by `authenticated` but not `anon`, and verifies `auth.uid()` against the private, active, non-revoked registration administrator table on every call.
- Uses a transaction-scoped advisory lock to serialize its own registration decisions.
- Stores replay fingerprint and caller; creates either a member with ministry assignments or a private duplicate-review case in the same transaction.
- Can return `created`, `review`, or `replayed`; review selection uses one matching member (`LIMIT 1`).
- Does **not** support notes or CSV source metadata. Its replay fingerprint therefore does not cover them.
- Is **not** the RPC invoked by the current Add Member / CSV member creation path. `registry_admin_member_write_v1('create'/'create_batch')` remains a duplicate-prevention bypass.

The six entries in `registry_private.registration_allowed_ministries` match `lib/constants.ts`; the dedicated ministry is **Ministry of Lectors and Commentators**, not "Lector".

## 2. Minimal versioned RPC proposal

**New entrypoint (not installed):**

```sql
-- Signature design only. NOT an executable migration.
public.registration_intake_v2(
  p_request uuid,
  p_first text,
  p_last text,
  p_parish text,
  p_ministries text[],
  p_year integer,
  p_notes text DEFAULT NULL,
  p_source text DEFAULT 'individual',
  p_source_key text DEFAULT NULL
) RETURNS jsonb
```

A new name allows TEST iteration without replacing v1. It should preserve v1's database-side access checks, pinned `search_path`, transaction-scoped lock and reviewed identity-matching semantics.

**Input invariants:**
1. A valid UUID is required; the *same* UUID must be retained for retries of an uncertain submission. Do not create a replacement key merely because the browser times out.
2. Names and parish are nonempty after whitespace normalization and at most 160/160/200 characters. `p_year` is an integer in 2000–2100 to match the current UI. Reject invalid values; do not coerce.
3. `p_ministries` has 1–6 **distinct canonical** names from the current server-owned allowlist. Reject unknown, blank and repeated entries; never silently map to an "Other" category.
4. `p_notes` is optional and at most 4,000 characters, subject to a reviewed normalization rule. For a unique person, store notes in `public.members.notes` **inside the same transaction**; for a duplicate, store them on the durable review case, not on the existing member.
5. `p_source` is exactly `individual` or `csv`. Individual requests may have a null source key. CSV requests require a nonempty, bounded `p_source_key` that represents the file's SHA-256 digest plus the stable source-row (or grouped-person) index. Do not place names or other personal information in source keys.
6. Authorize the current Supabase Auth user against `registry_private.registration_administrators` **before any existing-request replay, matching, or write**; deny revoked / ungranted users even when a prior request exists.
7. The replay fingerprint covers normalized first/last/parish, sorted canonical ministries, year, normalized notes, source, and source key. The actor must match the original request. Same key with altered fields, notes, source, source key or actor must fail with a conflict.
8. For CSV, a second *different* request UUID using the same actor + source key must not create a second record. Define this as a bounded conflict pointing to reconciliation, not a silent replay of different request data.

**Response shapes (strict, JSON, no undocumented success):**

```json
{"status":"created","memberId":"<uuid>","uid":"<generated-registry-id>"}
{"status":"review","reviewId":"<uuid>","candidateCount":2,"candidateIds":["<uuid>","<uuid>"],"candidatesTruncated":false}
{"status":"replayed","outcome":"created","memberId":"<uuid>","uid":"<generated-registry-id>"}
{"status":"replayed","outcome":"review","reviewId":"<uuid>","candidateCount":2,"candidateIds":["<uuid>","<uuid>"],"candidatesTruncated":false}
```

`<...>` entries above are illustrative placeholders, not values. A missing/malformed required field or unknown status fails closed. The generated UID must be read from the transaction's inserted/verified member row, not constructed by the browser.

## 3. Preserve ONE duplicate-review system

**Use existing private tables; do not create another review queue.**

Proposed additive schema changes in a *future reviewed migration*:
- `registry_private.registration_intake_requests`: add `source`, `source_key` and the appropriate uniqueness protection for an authenticated actor's CSV source identity. Keep the existing request-key primary key and full fingerprint.
- `registry_private.registration_intake_reviews`: add `submitted_notes`, `source`, `source_key`, `candidate_member_ids uuid[]`, `candidate_count integer`, plus a way to mark capped candidate results.
- Preserve `existing_member_id` for older review consumers as the **first candidate only**, not as an adjudicated identity; a reviewer must choose. Do not merge or change parish/ministries automatically.
- Keep the existing `registration_resolve_review_v1` as a disposition/audit primitive until a separate approved review UI maps its two outcomes correctly. Approval is **not** a merge.
- Use administrator-guarded, minimal review-read RPCs (or reviewed server-only API) for pending-case display. Do not grant the browser direct access to private review tables or trust client-supplied candidate lists.

**Candidate discovery:** match against the entire registry *inside* the lock, according to reviewed exact/cross-parish/fuzzy rules; collect deterministically ordered candidate IDs for the review case. Cap response/UI candidates (proposed max 20) but retain `candidate_count` and `candidatesTruncated` so reviewers are not shown a falsely complete list. Any candidate => persist review, create **no new UID**. Validate Unicode/case-folding and accent behavior against the JS matcher before approval.

## 4. Transaction boundaries and safety

```text
authenticate administrator (revocation-aware)
  -> validate all inputs / canonical ministries
  -> compute fingerprint including notes + source
  -> acquire the SAME serialization key used by v1 during transition
  -> check request key + actor + fingerprint; replay or reject
  -> check unique CSV source identity
  -> search full registry for possible candidates
       -> found: persist review + request record + source/candidates/notes
       -> absent: insert member with notes + ministries + request record
  -> return a strictly typed result
```

All steps above occur inside a *single Postgres transaction*. Unhandled errors must roll back the member, ministry assignments and request/review records together. Do not swallow database read failures and treat the registry as empty.

**No wrapper shortcut:** a v2 function that simply calls v1 and separately updates notes is not sufficient, because v1's existing fingerprint omits notes and source identity. The new function must enforce a complete fingerprint and transactional persistence itself.

**Cross-path protection:** the v1 lock coordinates only calls taking that lock. `registry_admin_member_write_v1('create'/'create_batch')` currently does *not* provide matching/idempotency; backend certification cannot be claimed until those actions are atomically routed through the approved protection or blocked. The current CSV `Keep separate` action also calls legacy `create` and needs an explicit, audited exception workflow if retained. Avoid a prolonged split-brain period with two writable registration paths.

## 5. CSV design — simple and recoverable

- Parse/preview client-side as today, but consider the preview advisory; the RPC is the authoritative duplicate decision at commit time.
- Group duplicate rows for the **same person** as needed before submitting; preserve source row references and canonical ministry set.
- For each logical record, store one stable UUID and `source_key` across retries, including page reloads. Agree the exact key-generation algorithm before implementation.
- Allow row-level created/review/replayed/error outcomes, but do not claim the entire file is all-or-nothing. Keep visible progress and truthful counts.
- A network timeout after a possible write is `unknown / reconcile`, **not** safely retryable using a fresh UUID.
- Until a persisted review workspace exists, do not replace current temporary CSV pending-merges UI with a misleading facade.

## 6. Proposed TEST acceptance cases (not executed)

| # | Case | Required result |
|---|---|---|
| 1 | Real JWT for active registration admin | created or review, per matching |
| 2 | Anonymous / ungranted / revoked JWT | authorization failure and no write |
| 3 | Same request UUID, same actor and fingerprint | exact replay of prior outcome |
| 4 | Same request UUID, changed **notes** or source | fingerprint conflict; no second record |
| 5 | Same CSV actor+source key, new UUID | conflict / reconciliation; no second record |
| 6 | Two different UUIDs for same person simultaneously | at most one new member; other is review |
| 7 | Exact, cross-parish and fuzzy match; two candidates | persisted review and accurate candidate count |
| 8 | Unicode/diacritics, numeric suffix, short names | documented parity with reviewed JS rules |
| 9 | New person with multiple ministries and notes | one UID; assignments Pending Verification; notes persisted |
| 10 | Forced assignment insert error | whole transaction rolled back |
| 11 | Failures during member search and source validation | fail closed, no UID |
| 12 | Replayed review after reload and disposition | same durable review ID and audit trail |
| 13 | Legacy `create`, `create_batch`, `Keep separate` during cutover | protected or denied; never silent bypass |
| 14 | HTTP path uses correct TEST project and ordinary signed admin JWT | auth + response contract verified without service-role browser credentials |

Only fictional data, specifically approved TEST credentials and a per-fixture cleanup inventory may be used in write-enabled tests.

## 7. Ordered rollout proposal

1. **Current:** review this contract. Leave active UI, SQL and databases unchanged.
2. **After explicit implementation approval:** create the migration through the Supabase CLI's migration tooling, review a complete SQL diff, and test in a disposable/isolated environment. No speculative production DDL.
3. Certify authenticated/unauthenticated JWT behavior, concurrency, error rollback, RLS/grants, names matching and durable reviews in TEST with separate *write-test authorization*.
4. Adapt the existing disabled `lib/registration-atomic-intake.ts` to the new v2 contract, preserving its fail-closed response parser. Wire Add Member and row-wise CSV processing *behind a release gate*, maintaining current layout.
5. Stage cutover so that old direct member creation cannot race with new v2 writes. Block legacy `create` and `create_batch` and unsafe Keep separate at the database boundary; preserve unrelated admin edits. Treat rollback to the unsafe prior creation route as forbidden: registration should fail closed if necessary.
6. Collect test evidence, run CI, inspect staging logs and prepare rollback/recovery documentation. Only then seek separate owner approval to merge or deploy.

**Not decided yet:** exact deterministic CSV key algorithm; candidate matching/ordering rules for non-ASCII names; how an administrator approves a deliberate separate person with the same name; whether audit requirements demand separate source-reference records. None should be invented by the frontend.

**No-go until:** the versioned function and migrations are reviewed, live TEST writes are certified, legacy bypasses are closed, and the UI's durable review flow is complete.
