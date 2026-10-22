# Duplicate member reconciliation: live dependency audit

Audit date: 22 October 2026. Supabase project: Ministry-Database. Read-only database metadata queries; **no deletions or data migrations performed**.

## Verified incoming foreign keys

| Referencing table | Member FK deletion behavior | Membership FK deletion behavior | Risk |
|---|---|---|---|
| `member_ministries` | CASCADE | — | All assignments of deleted profile vanish |
| `certificate_downloads` | CASCADE | SET NULL | Certificate download evidence deleted with member |
| `duplicate_flags` | CASCADE | — | Duplicate-resolution context deleted |
| `recommendation_renewal_memberships` | SET NULL | SET NULL | Historical renewal rows persist but lose both IDs, breaking direct links |
| `name_correction_requests` | SET NULL | — | Historic request persists but loses member association |
| `public_reports` | SET NULL | — | Public report persists but loses member association |

The `audit_logs.member_id` column exists but **has no foreign key**. A member deletion may leave audit records pointing to a nonexistent UUID; existing triggers and retention must be reviewed before any production deletion.

## Live table counts at audit

7973 members; 8009 ministry assignments; 13 certificate downloads; 0 duplicate_flags; 10 historical renewal membership rows; 1 correction request; 1 public report; 38210 audit log rows. These are aggregate observations, **not evidence that any particular duplicate is safe to remove**.

## Existing delete implementation

`app/admin/members/page.tsx` currently removes a linked `member-documents` storage object first, then calls `supabase.from("members").delete()` from the browser. Storage and database operations are not atomic: a failed database deletion can leave missing documentation. The deletion also relies on FK CASCADE/SET NULL and does not perform a complete evidence preservation check. The duplicate reconciliation interface must **not** reuse this flow.

## Required safeguards before enabling duplicate registry deletion

1. Retrieve the selected keep/remove pair by immutable IDs on the server, under authorized admin identity; require distinct IDs and verify they represent the same real person, parish and ministry. A name match is not proof of identity.
2. Obtain a transaction-safe dependency snapshot, including assignments, certificate downloads, audit logs, renewal memberships, public reports, correction requests, duplicate flags, document paths, archived documents and any references encoded in JSON/text.
3. Refuse deletion if any unique ministry assignment, document, renewal linkage or unresolved dependency cannot be safely retained or reparented. Never overwrite retained UID or expiry automatically.
4. Construct a **reviewable reconciliation plan** with keep UID, remove UID, changed references and warnings; require explicit re-authenticated approval/confirmation including the to-be-removed UID and an administrative reason.
5. Execute permitted changes in a single database transaction using an audited, narrowly authorized operation. Preserve historical references, including original UID and action evidence. Never perform a silent cascade-based deletion.
6. Handle storage only after durable database transition and proven reference ownership; maintain retained/archived documents without destructive pre-delete storage operations.
7. Record who approved, original/retained UIDs, previous values, resulting links, timestamps and rationale in an append-only reconciliation ledger.
8. Integrate the outcome with Renewal Review Queue only after the reconciliation succeeds; a dismissed CSV row is not a registry merge.
9. Validate against a staging copy and run adversarial authorization, concurrency, rollback and idempotency tests.

**Current release gate:** Registry member deletion from Renewal Review Queue is DISABLED until these checks and a transactional migration are implemented, reviewed and tested. No live registry rows have been changed by this audit.
