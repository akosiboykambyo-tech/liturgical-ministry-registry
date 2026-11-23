# COWL-DOK — Stage 4C security remediation (review branch)

**Date:** 2026-11-19 (Asia/Manila)  
**Scope:** Review-only repository changes; neither the local preserved V3 clone
nor Supabase TEST/PROD has been modified. No migration has been executed.

## Evidence and baseline

The two *offline, local* Stage 4B audit packages are the evidence:
`COWL-DOK-Stage4B-Audit-20261119-104900.zip` and
`COWL-DOK-Stage4B-Gaps-20261119-110313.zip`.
They showed 52 declared application tables, 70 routines across four schemas,
42 SECURITY DEFINER routines, 15 enabled custom triggers, seven extensions,
and a restored but data-empty registry. These numbers describe **V3 only**;
they do not prove TEST/PROD parity or release readiness.

Verified high-priority observations from the V3 exports:

- A permissive RLS policy `public.members.test_admin_read_members` allows
  a fixed authenticated test UUID to bypass the ordinary admin-read policy.
- `public.admin_login_begin(text,uuid)` and
  `public.admin_login_finish(text,uuid,boolean)` permit `anon` and
  `authenticated` direct execution. The second accepts caller-controlled
  `p_success` and can clear failure counters.
- A legacy `public.registration_lookup_preflight()` references the same
  fixed test identity and was also executable by application roles.
- Anonymous `system_settings` SELECT is unrestricted by RLS in V3, but
  **V3 has zero settings rows**. Classification of actual deployed keys and
  values has not occurred.

Repository confirmation: `app/api/admin/sign-in/route.ts` already creates a
server-side Supabase client with `SUPABASE_SERVICE_ROLE_KEY`, calls both
login RPCs via that client, and performs sign-in via a separate anon-key
client. Restricting the RPC EXECUTE privileges is designed to preserve that
trusted server path while denying unauthenticated direct RPC invocations.

## Changes proposed on this branch

1. `supabase/migrations/202611190001_stage4c_lock_down_login_and_remove_test_member_policy.sql`
   - Preflight: require RLS-enabled `public.members`, expected function
     signatures and expected Supabase roles. Fail atomically if unmatched.
   - Remove only `test_admin_read_members`; leave the normal administrator
     read policy untouched.
   - Revoke login begin/finish EXECUTE from PUBLIC, anon, authenticated;
     explicitly grant EXECUTE to service_role.
   - Disable application-role EXECUTE for the legacy fixed-UUID lookup
     *only if that function is present*.
   - Assert intended privileges before COMMIT.
2. `supabase/tests/stage4c_security_readonly_assertions.sql`
   - Independent catalog-only post-migration checks in a read-only
     transaction. Run against a **new throwaway local clone** only.
3. `tests/stage4c-security-contract.test.cjs`
   - Offline, no-network source-contract tests for migration safeguards and
     the existing trusted server-side sign-in path.
4. `supabase/proposals/stage4c_system_settings_public_read_review.sql`
   - **NOT a migration**. Proposed RLS allowlist for known public keys
     (`public_marquee`, `public_maintenance`, `certificate_template%`)
     plus normal administrator access. Must remain unexecuted until
     actual settings keys/values and consumer needs are reviewed.

No UI changes, personal data imports, login state changes, or finance
transaction changes are part of this pull request.

## Checks and approval gates

**Offline repository test:** `node --test tests/stage4c-security-contract.test.cjs`
(executable without credentials or Supabase).

**Before applying the migration anywhere:**

- Confirm the target environment's deployed function signatures, role grants,
  RLS policies, and `public.members` RLS using explicitly approved
  **read-only** introspection. Do not infer state from GitHub migration names.
- Obtain reviewed target-specific change/rollback procedure and backup.
- Apply the migration only to a **new disposable, isolated local clone** with
  synthetic/blank data; do not touch preserved `cowl-dok-bootstrap-clone-v3`.
- Run `supabase/tests/stage4c_security_readonly_assertions.sql` on that
  disposable clone. Confirm that both RPCs are denied for anon/authenticated
  and remain permitted for service_role. Test duplicate sign-in failures,
  lockout, infrastructure-error releases, and success under controlled
  test credentials in an authorized staging workflow.
- Verify that no app path calls the RPCs with an anon-key client. Present
  code search identified the sign-in route as the only application caller,
  but this is not evidence about external clients.

**Settings privacy gate (open):** inventory deployed key *names* with
authorization, classify each value for public exposure without publishing
secrets, then decide whether the separate settings proposal may become a
reviewed migration. Client readers for public marquee, maintenance and
certificate templates must continue to work.

**Functional acceptance gate (open):** perform the proposed Stage 4C/next-stage
synthetic rehearsal on another disposable clone, covering registration,
UID allocation, renewal, admin authorization, finance custody and evidence
immutability. Catalog-only tests do **not** satisfy this gate.

## Reversal and safety

This migration consists of RLS-policy removal and privilege changes, in one
transaction. PostgreSQL transaction rollback protects against partial
application if the migration fails. After a successful commit, reversal would
require a separately reviewed migration; **do not blindly recreate a known
test-only exposure or restore PUBLIC EXECUTE**. Preserve V3 and source volume
unchanged. No TEST/PROD changes, no deployment, no branch merge is authorized
by this review document.

## Decisions & open questions

**Decisions**
- Prepare changes only on a dedicated review branch, without altering `main`.
- Restrict admin login throttle RPCs to server-side service_role; keep the
  existing Next.js sign-in contract.
- Remove the fixed-ID test member policy from environments where deployed.
- Keep settings policy as a proposal pending classification.
- Verify behavior in a new disposable local clone, not the V3 checkpoint.

**Open questions**
- Which V3-specific test policies and routines are actually deployed to TEST
  or PROD? No live environment has been inspected for this work.
- Does any external, independently deployed client call the login RPCs?
- Are certificate template JSON values safe for anonymous consumption, and
  are there additional public setting keys?
- Who approves the target-specific production change window, rollback plan,
  and functional acceptance criteria?

**Status:** Proposed changes authored, not applied. Stage 4B remains
`REVIEW REQUIRED` until the above checks are fulfilled.
