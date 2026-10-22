# Duplicate reconciliation — isolated QA plan

## Environment gate
The connected Supabase project currently has **no development branches**. Creating one requires explicit approval of an hourly fee ($0.01344/hour as quoted on 22 October 2026). Do not run these tests against live members. No migration from `supabase/proposals/duplicate_reconciliation_transaction_draft.sql` is applied to production.

## Transaction draft status
The draft is **a non-deleting scaffold**, not a tested reconciliation procedure. It checks core member identity, document/renewal evidence, locked rows, and some linked references, and prepares an audit snapshot. It intentionally has no DELETE statement and grants no API execute privilege.

Before any controlled merge/removal, address these gaps:
1. The draft checks exact first/last names and parish, but does not prove two UIDs belong to the same person; add explicit identity evidence verified by an administrator.
2. Validate that the retained record has the appropriate ministry assignment(s), service year and documentary validity. Do not infer these from status alone.
3. Preserve all audit events and captured original UIDs; `audit_logs.member_id` has no foreign key and must be handled explicitly.
4. Enumerate storage references and non-FK references, including paths in JSON and text; database constraints do not cover these.
5. Do not depend on current_user='postgres' as the eventual permission mechanism; design and test a narrow administrative execution route with explicit authenticated authorization.
6. Audit snapshot must not become a publicly readable copy of identity data. Protect and establish retention controls.
7. Do not call the legacy browser deletion handler: it removes the document before the database deletion and is non-atomic.

## Staging cases (fabricated data only)
| Case | Expected result |
|---|---|
| Different member IDs and same name/parish, but different identity evidence | Rejected |
| Same real person; duplicate Pending Verification, no documents, no dependent evidence | Eligible for proposal; still requires admin confirmation |
| Duplicate already Renewed | Blocked |
| Duplicate with any current or archived recommendation document | Blocked |
| Duplicate with certificate download history | Blocked |
| Duplicate linked to historical renewal batch | Blocked until preservation plan proven |
| Duplicate with correction request/public report | Blocked |
| Duplicate with unique ministry assignment | Blocked until reassignment plan approved |
| No source member or mismatched UID | Blocked |
| Two operators simultaneously propose conflicting keep/remove IDs | One should fail or re-evaluate under locks |
| DB error after audit preparation | Whole transaction rolls back |
| Repeat identical reconciliation request | No second deletion; clear idempotent response |
| Unauthenticated or ordinary authenticated user | No access |

## Acceptance evidence
- Run SQL on an isolated, non-production Supabase branch with disposable fabricated member records.
- Assert membership, renewal histories, audit records and storage references before and after each test.
- Assert **zero actual deletions** for blocked cases and full transaction rollback on injected errors.
- Review RLS and function privileges with Supabase security advisors.
- Only after an approved transaction and backups should the UI's disabled Remove Duplicate control be considered for activation.
