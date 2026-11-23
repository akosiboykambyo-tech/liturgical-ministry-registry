# COWL-DOK — RC1 pull-request reconciliation and integration plan

**Inspected:** 2026-11-23 (Asia/Manila)
**Base:** `main` @ `967eb60eca0386a361b83b3f6f29bcf9d054f2df`
**Production deployment inspected:** `dpl_96nkueur3cqJjniKnVbV7cVZhnSZ` (READY, RC1); this is not new release approval.
**Scope:** GitHub comparison and selective code review only; existing PROD/TEST data, Supabase migrations and Vercel production were not modified by this audit.

## Decision and evidence hierarchy

GitHub's **mergeable** flag establishes only mechanical mergeability. It does not establish authorization, role-based QA, test coverage, privacy approval, or safe compatibility with an RC1 production deployment. All 16 open PRs were drafts with zero recorded reviews at inspection. Inspect target branches and checks on exact SHAs before integration.

- **#79 (PR55 integration)** — **CLOSED, already incorporated in main ancestry**: head `46ca36cb` was 0 commits ahead and 62 behind `main`. Superseded by merged RC1 #89. Closing #79 does not certify security acceptance.
- **#87 (RC0 consolidation)** — **CLOSED, already incorporated in main ancestry**: head `57870abc` was 0 commits ahead and 103 behind `main`. Superseded by #89/main; no need to replay.
- **#90 (audit-log RLS)** — **NEXT SECURITY REVIEW, no merge yet**: based directly on current main; two review-only documents, including proposal to replace legacy fixed-email `audit_logs` ALL policies. Current PROD inspection confirms the old policies still exist. Require real signed role + revoked/nonadmin tests in TEST and rollback approval before applying policy.
- **#86 (Stage 4C hardening)** — **SPLIT/RECONCILE, no wholesale merge**: older main baseline; includes an executable migration. PROD read-only checks already find `test_admin_read_members` absent, `admin_login_begin/finish` restricted to service_role and public settings reads scoped. Reassess test/document value, but do not replay migration.
- **#55 (registration security backend)** — **HISTORICAL SECURITY SOURCE, BLOCKED**: 105-file branch diverges from current RC1, with substantial former migration/cutover history. Current RC1 includes guarded RPCs; inventory residual migration/security tests before considering individual changes.
- **#78 and #75 (Auth UI)** — **SELECTIVE RECONCILIATION**: target older release baseline; current main already has branded shared Auth shell and role-aware routing. Do not replay old routes or reset Registry/COWL/Curia access logic.
- **#83 (access pending and unavailable UI)** — **SELECTIVE UX REVIEW**: both source blobs differ from main. Current `/admin/access-pending` uses the branded `AdminAuthShell`; #83 uses an alternate `AdminAccessNotice`. Compare actual browser behavior and accessibility instead of wholesale merging.
- **#30 (duplicate validation)** — **CONFIRMED MISSING FAIL-CLOSED CONDITION**: current main `lib/duplicate-check.ts` ignores exact/cross-parish query errors and replaces failed full-registry lookups with empty arrays. Current CSV import page already has a before-writes catch/finally block. This review branch adapts only the missing library guard plus test coverage to the current server-authorized write path; do not merge the stale PR #30 directly.
- **#53 (disabled registration scaffold)** — **LIKELY SUPERSEDED / HOLD**: deliberately returns 503 rather than implementing registration; confirm no needed tests before closing.
- **#84 (receipt management)** — **DEFER TO FINANCE REVIEW**: read-only v0.5 receipt preview, unapproved finance controls; old PR79 descendant, not RC1 authority.
- **#85 (bilingual Ordo)** — **SEPARATE CONTENT TRACK**: no public publication until reading rights, translations, editorial approval, accessibility and A4 checks.
- **#57 (season grid)** — **DEFER**: gated workflow without approved secure database integrations.
- **#58 (finance prototype)** — **DEFER/ARCHIVE AFTER REVIEW**: demo state and older role guard; not a live ledger.
- **#62 (parish/OTP/Curia prototype)** — **DEFER/ARCHIVE AFTER REVIEW**: simulated OTP and finance flows; not genuine Auth/payments.
- **#91 (Staff and Access)** — **ON HOLD AS REQUESTED**: current-main draft; review-only SQL and flag-disabled mutations; pending isolated role tests and provisioner approval.

## Controlled integration order

1. **Backlog accuracy (completed)**: close #79 and #87 with GitHub comments documenting verified ancestry; do not merge their content again.
2. **Single-purpose code safety PR (current branch)**: port #30's fail-closed duplicate validation behavior to RC1 without replaying the old CSV UI. Extend guard to import-batch idempotency lookup. Validate individual exact, cross-parish, paginated and batch-history failure paths without writes; include tests in `prebuild`. Require exact-commit build/typecheck and Registry CSV QA in isolated TEST before owner-approved merge.
3. **Security hardening**: #90 audit-log policy in TEST only, using real signed Registry-admin, revoked, unauthenticated and nonadmin sessions. Maintain audit INSERT for legitimate trigger paths; validate denial of UPDATE/DELETE, and rollback. Security owner approves separate migration and deployment.
4. **Reconcile authentication visual improvements**: #75/#78/#83 file-by-file against RC1, retaining role-aware redirects, fail-closed access-pending handling, mobile sidebar and verified invitation flows.
5. **Finance and editorial lanes**: #84/#85/#57/#58/#62 remain isolated until specialist approvals. #55/#53 historical contracts require disposition; do not merge divergent branches merely to reduce PR count.
6. **Release sign-off**: lock an exact SHA; run `npm ci`, prebuild, `npm run typecheck`, `npm run build`, security and signed-session browser tests; confirm deployment target and rollback; require management/security sign-off before changing Production.

## Existing recovery milestone and remaining limits

The 2026-11-20 encrypted recovery package was restored successfully into a network-isolated PostgreSQL container on 2026-11-23: database inventory matched 1 registry member, 2 ministry assignments, 4 Auth users, 4 identities, 3 Storage buckets and 38 Storage metadata rows; 18 public tables and 22 public RLS policies were present. This is a **database-only rehearsal pass**, not actual Storage reupload, Auth sign-in or application recovery certification.

## Review conditions for this branch

- No database migration, Auth user mutation, PROD/TEST write, secret or data export.
- Current-main-only patch; no old branch merged.
- Before applying any production change, verify exact-SHA CI, review the non-atomic duplicate import workflow, run negative tests and obtain explicit owner approval.
