# Security gate investigation — 2026-10-28 (read-only)

## Production data reset: explained, authorization unverified

Project `Ministry-Database` returned zero rows for `public.members` and `public.member_ministries` at 03:27 UTC on 2026-10-28. This was independently verified by repeated `count(*)` as database role `postgres`.

The audit log contains **7,971 DELETE events** during 06:00 UTC on 2026-10-27 and a `TEST_DATA_RESET` event at **2026-10-27 06:39:54 UTC**. That reset entry records **7,971 members and 8,009 member-ministry assignments before reset**, and describes its scope as `test member data and test workflow activity`. The counts exactly match the earlier PR55 preflight. A read-only staging check found **1,008 members and 12 assignments** unchanged.

**Conclusion:** the empty production registry is consistent with an audited bulk test-data reset, not an unexplained query or RLS failure. The presence of a reset entry does *not* independently prove authorization, the intended scope, backup recoverability, or whether all deleted rows were only test records. Do not restore or reinsert data without separate explicit approval and verification. No database writes were performed during this investigation.

## Current production security contracts

- `public.process_recommendation_renewal_batch(...)` is a `SECURITY DEFINER` function. It calls `public.check_renewal_admin_access()` and checks that the requested next date is >= renewal date, **not** exactly one year.
- `public.check_renewal_admin_access()` identifies administrators through a **hard-coded JWT email claim**; it does not consult the PR55 revocable admin allowlist. Updating this without a reviewed authorization migration can lock administrators out or weaken authorization.
- A CHECK constraint on `recommendation_renewal_batches` also enforces only `next_renewal_date >= renewal_date`.
- `public.members` and `public.member_ministries` have authenticated-row policies bound to one existing admin UUID. Renewal history tables expose SELECT to `authenticated` with `USING (true)`; independently review whether every authenticated user should see those records.
- Current `quickVerifyMember` updates only `members.status` and does **not** create/verify `member_ministries` rows or set their expiration. The member-detail drawer is ministry-aware and updates assignments independently. These paths can diverge.
- The member-detail drawer's manual status/expiration edits and letter upload remain direct client-issued writes. UI-only one-year restrictions are therefore **not authoritative**.

## Proposed atomic verification policy (not deployed)

1. **Assignment is canonical:** verification must identify explicit `member_ministries.id` values, not indiscriminately verify every ministry based on a member-wide status.
2. **One-year date:** calculate an expiration on the server from the verification/renewal date using calendar-year arithmetic with a leap-day clamp (e.g., February 29 to February 28 in a nonleap year). Never trust a client-supplied expiration.
3. **Single transaction:** an authorized server RPC should lock the intended membership rows, validate member/parish/admin authorization, update only selected assignment statuses and dates, then derive a member-level compatibility summary. Audit all changes in the same transaction.
4. **No automatic promotion:** a member with one verified and one pending ministry must retain the pending assignment. Member-wide `New/Renewed` cannot imply every assignment is verified.
5. **Document policy:** decide which verification actions require recommendation letters and how previously issued letters are archived. Do not silently infer this from the old one-click buttons.
6. **Existing records:** do not rewrite historical statuses or missing expiration dates as a migration side effect. Run count-only preflight, review edge cases, then stage a reversible, privilege-restricted change.
7. **Authorization:** use a secured server-side active administrator grant check, not a client label, editable metadata, or a fixed-email-only claim. Keep registration PR55's auth semantics aligned with verification and renewal.

## Required offline/staging gates

- Read-only review of existing constraints, indexes, audit triggers and Auth/RLS grants.
- Rehearse the atomic RPC and permission-denial cases using two distinct staging Auth users and entirely synthetic members; include one verified/one pending ministry, replay, concurrent revocation, leap day, invalid/ministry-unassigned rows.
- Demonstrate that an arbitrary authenticated user cannot invoke verification or renewal RPCs, and cannot read private renewal histories unless explicitly permitted.
- Validate the one-year calculation on the **server**, including 2028-02-29 -> 2029-02-28 and 2026-10-28 -> 2027-10-28.
- Reconcile any audit/backup retention requirements following the 2026-10-27 test-data reset.
- Full-fidelity encrypted backup + restore has **not** passed: local Windows PostgreSQL 18 lacked `supabase_vault`, and available notes point to an explicitly approved Supabase-compatible PostgreSQL 17 environment for a strict rehearsal.
- Review/version migrations, privileges, rollback and monitoring before any production change.

## Gate decision

**NO-GO for production activation.** The PR55 candidate staging Auth/JWT checks and committed shadow-admin revocation checks are documented as passed in the *latest* top sections of the runbook. Older statements in that document saying they are unrun are historical and superseded; do not reclassify them as current blockers. Remaining gates are authorized production migration/privilege review, full restore proof, explicit frontend activation, and a separately approved atomic verification/expiry design.

This file is planning evidence only; no SQL or new server RPC has been applied.
