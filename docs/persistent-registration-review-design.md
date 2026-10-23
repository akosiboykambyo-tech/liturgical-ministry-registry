# Persistent registration duplicate-review queue — implementation design

**Status:** Proposal only. No Supabase migration is authorized or applied. The offline preview in PR #36 is not the actual review queue.

## Scope and invariants

- One natural person must have one registry UID, even with multiple ministry assignments.
- Incoming registrations start **Pending Verification**. Document upload is not evidence of review or approval.
- An existing UID must be retained when an administrator confirms the same person; adding a new ministry must not overwrite the previous assignment or renewal history.
- Same name in another parish is a review case, not automatic evidence of a transfer.
- Resolutions require meaningful notes, actor identity, UTC timestamp and an immutable decision record.
- Registry validity is one year from verification or renewal, at the ministry-assignment level.
- **No automatic person merge, physical deletion or certification** from resolving a queue case.

## Proposed additive storage (not executable SQL)

**registration_review_cases**
- `id UUID PK`, `source` (individual/bulk), optional `import_batch_id` and `source_row`, server-issued `intake_key` for idempotency
- `incoming_payload JSONB` containing only required name, parish, ministry and service year data (restrict read access)
- `candidate_member_ids UUID[]`, `match_reasons TEXT[]`, and a versioned matching-rule identifier
- `status` (open/resolved/dismissed), `created_at`, `created_by`, optional `reviewed_at`, `reviewed_by`
- `resolution`, `resolution_notes`, optional `selected_member_id`
- a revision/version integer for optimistic concurrency; timestamps and immutable intake fields cannot change after creation

**registration_review_events**
- append-only `id`, `case_id`, `action`, `actor_id`, `occurred_at`, `decision_snapshot JSONB`, `reason`
- audit trail is retained even if downstream member assignments change
- review access and retention must be defined before enabling any live intake

Proposed unique constraints: `intake_key` globally unique; optional `(import_batch_id, source_row)` unique where populated. Do **not** enforce a globally unique name/parish key: distinct people can share names and parishes.

## Security and transaction contract

1. All writes use an authenticated server-controlled pathway or tightly scoped SECURITY DEFINER RPC. Do **not** let a client mutate reviewed state, `selected_member_id` or audit events directly.
2. Require `auth.app_metadata.registry_role = 'admin'` or a specifically authorized registration reviewer role provisioned server-side. Never trust `user_metadata` or a client-submitted reviewer ID.
3. RLS: deny `anon`; grant authenticated reviewers only required read; default-deny direct insert/update/delete outside the audited pathway. Revoke execute on internal helper routines by default. Test with distinct role JWTs.
4. On resolution, lock the queue row, reject cases no longer open, re-fetch and validate selected member/candidate identity and existing ministry assignments, then apply the authorized decision *atomically* with one event and final case state.
5. If 'same person': preserve UID; create only absent Pending Verification ministry assignments; never reset verified or renewal dates.
6. If 'parish transfer': require separate identity evidence, record old/new parish and administrative reason, and preserve history before changing current parish.
7. If 'different people': create new UID only inside the transaction after final revalidation, with Pending Verification assignment(s).
8. If 'discard': record a dismissal event; do not delete a person or attachment.
9. On errors, roll back the member/assignment/event/state change together. Concurrent reviewers must yield only one accepted resolution; retries with the same idempotency key must not duplicate records.

## Intake workflow

- Individual and CSV intake call the same server-side matching engine and canonical ministry-name validator.
- An exact or fuzzy potential match is staged as an open review case; **no member UID is created** yet.
- Unique records can be created as Pending Verification only after the complete duplicate check succeeds.
- A repeated CSV row for the same confirmed identity with a *new ministry* can be consolidated for review; a repeated identical ministry must not create a second assignment.
- Source CSV line, import batch, uploaded recommendation-letter reference, and traceable matching reasons must accompany the case, subject to least-privilege storage access and retention rules.
- No browser-only or session-only queue is acceptable for the production workflow.

## Offline QA before a database is available

- Extend the existing pure tests for intake deduplication, multi-candidate matches, repeated CSV rows, idempotency, state transitions and expired registration distinctions.
- Preview loading, empty, duplicate, conflict and error states using synthetic data only.
- Keep status and case counts per case distinct from ministry-assignment counts.

## Database integration gates

- Review existing `duplicate_flags`, `import_batches`, RLS and trigger definitions before migration. Design migration/backfill with explicit mapping for unresolved legacy flags.
- Validate server authorization with a disposable isolated Supabase environment (not production).
- Exercise rollback, concurrent-review and retry scenarios; inspect audit logs and storage pointers.
- Compare final UI values with the approved dashboard status definitions and one-year validity.
- Obtain separate explicit authorization before applying any schema or production-data change.

This proposal complements, and does not replace, the distinct renewal-review queue or the existing duplicate-reconciliation non-deleting draft.
