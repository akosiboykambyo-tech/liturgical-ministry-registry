# COWL-DOK — Minimal atomic registration integration specification

**Status:** REVIEW-ONLY implementation proposal. Code is not wired into Add Member or CSV Import; no SQL/migration executed. Base: audit/pr30-pr53-failclosed-reconciliation-20261118.

## Scope and fixed decisions
- Reuse the TEST-installed public.registration_intake_v1 architecture for authoritative intake; do not copy PR #53's test-only atomic_registration_v3 into production.
- Keep the approved Add Member and CSV UI, six canonical ministry names and Pending Verification assignments.
- One registry UID per confirmed natural person; same person in another parish is review, not automatic transfer. Never automatically merge, certify or renew.
- One database transaction must determine whether to insert a unique new person or persist a duplicate-review case; front-end duplicate previews are advisory only.
- **Do not enable the adapter or replace UI call sites yet.** Production lacks the reviewed intake migration and the old registry_admin_member_write_v1('create'/'create_batch') bypass remains available.

## Existing TEST contract (read-only inspected)
public.registration_intake_v1(p_request uuid, p_first text, p_last text, p_parish text, p_ministries text[], p_year integer) RETURNS jsonb.
- Verifies auth.uid() against registry_private.registration_administrators (active=true, revoked_at IS NULL). It uses SECURITY DEFINER, pinned empty search_path, and is executable by authenticated but not anon; full role/JWT QA is still pending.
- Uses one advisory transaction lock; request-key fingerprint and same-actor replay protection; complete-authority SQL duplicate lookup; atomic members + member_ministries creation or private pending-review persistence.
- Returns {"status":"created","memberId":"<uuid>"}, {"status":"review","reviewId":"<uuid>"}, or {"status":"replayed","outcome":"created|review","memberId":"<uuid>|null","reviewId":"<uuid>|null"}.
- Current matching selects the first matching member (LIMIT 1); Unicode, case-folding and multiple candidates need policy/design review.
- The function **does not accept registration notes or intake source metadata**, and its year validation is less restrictive than the app's existing year range.
- Existing private review resolution RPC supports approved or dismissed with an audit event, **not** automatic UID merge or ministry assignment.

## Files prepared on this branch
- lib/registration-atomic-intake.ts — offline-testable, disabled-by-default adapter; validates canonical ministries, request UUID, year, identity lengths, response shape and safe replay; rejects non-empty notes instead of silently dropping them. The caller must explicitly provide an RPC transport, so no frontend path can call it accidentally.
- tests/registration-atomic-intake.test.cjs — mock-only tests for exact request mapping, allowed/invalid ministry names, notes, response/replay validation, disabled behavior and error fail-closed handling.
- .github/workflows/reconciliation-validation.yml — includes the new branch and test file in the existing no-deployment CI job.

## Planned minimal integration (NOT YET IMPLEMENTED)
1. Design a backward-compatible versioned SQL interface for notes and source references, plus all candidate matches; use a *reviewed* migration file created with Supabase CLI when separately authorized. Do not edit the existing TEST function in place without versioning, rollback and owner review.
2. Validate real JWT grant, revoke, signed-in/nonadmin, anonymous access; identical request replay, fingerprint conflict, cross-parish and fuzzy matches; concurrent different-key same-person registration; rollback; historical/Unicode matching parity.
3. Add a single, narrowly scoped registrationIntake client integration after the backend is certified. Generate a request UUID once per submission and reuse it on uncertain retries; don't generate a new UUID for a retry.
4. Adapt Add Member's success display by obtaining verified member/UID details after a created response. A review response shows its durable case ID, **not** the existing temporary duplicate_flags queue. Preserve notes by including them in an atomic reviewed SQL contract before enabling non-empty notes.
5. Adapt CSV in small row-wise transactions, with stable source identity, clear status for created/review/replayed/error, truthful row counters, and safe reconciliation after uncertain outcomes. Existing tabbed UI may remain temporarily, but pending cases must persist server-side rather than disappearing on reload.
6. Remove/deny the legacy RPC create, create_batch and unsafe keep separate bypasses *only after* the backend-first rollout, frontend and rollback paths are tested together. Prevent direct table insert grants; keep unrelated admin actions and ministry verification intact.
7. Only then obtain owner go/no-go for release; do not merge into main or promote any Vercel preview by default.

## Release blockers and explicit exclusions
- No active frontend code calls this new adapter. The existing registration UI uses the prior registryAdminWrite pathway and is **not** certified duplicate-safe.
- The TEST database is not proof of production migration availability, Auth/Storage recovery, audited full-role HTTP behavior, or production database constraints.
- This proposal does not add an independent registration server, new frontend framework, extra Supabase project, direct service_role key in the browser, or a parallel review queue.
- Non-empty notes and source-row metadata are intentionally unsupported until a compatible atomic SQL contract is approved; reject rather than discard.

## Testing and release evidence
Run node --test tests/registration-atomic-intake.test.cjs and existing PR30/PR53/PR79 unit tests, npm run typecheck, and npm run build. CI uses nonfunctional Supabase build placeholders; these are not test credentials. Database-write/integration tests require separate explicit authorization and synthetic fixtures.

## Decisions & open questions
**Decided:** atomic SQL is the sole source of truth; preserve UI; one UID per person; no automatic approval; no production or Supabase changes from this branch.
**Open:** versioned RPC design; multi-candidate review; notes and source references; CSV grouping / retry keys; exact duplicate thresholds and Unicode parity; test JWT personas; legacy bypass retirement/rollback sequence.
