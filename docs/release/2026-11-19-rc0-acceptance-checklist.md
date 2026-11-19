# COWL-DOK RC0 — Exact-commit acceptance checklist

**Status:** OPEN / NO-GO. This is a review checklist, not a production rollout instruction.  
**Branch:** `release/cowl-dok-rc0-consolidation-20261119`  
**Starting source:** role-aware `b8082167c511072a92adaa3b84268121992f3985`  
**Current RC0 carry-over:** exact live shared 403/404 files only; no Auth/finance/registry SQL or frontend cutover.

## A. Source and release foundation

- [x] Read Vercel production assignment: `cowl-dok.online` is READY at `main` / `7b6521cc4abe5508c0a77d040e5677540c35bad3`.
- [x] Confirmed `main` and role-aware baseline are diverged (77 release-side commits, 2 main-side commits).
- [x] Preserved the existing production assignment and V3/V4 local Docker checkpoints.
- [x] Copied `components/public-error-page.tsx`, `app/403/page.tsx`, `app/not-found.tsx` from the exact deployed `main` blobs to RC0.
- [ ] Review the **other main-only diff** (not just the 403/404 changes); explain any intentional omissions.
- [ ] Verify registry finance access endpoint still enforces token-based server role decisions, fails closed on errors, and never defaults finance users to Registry admin.
- [ ] Record exact RC SHA and check it has not drifted before testing.

## B. Build/test (exact RC SHA)

From a *clean isolated worktree* with no production credentials:

```powershell
npm ci
npm run test:finance-access
npm run test:auth-onboarding
npm run typecheck
npm run build
```

- [ ] All commands exit 0; archive logs and exact Git SHA.
- [ ] Verify one coherent Vercel preview corresponds to the tested SHA. A Vercel READY state alone is not a role-security test.
- [ ] Verify live public 403/404 layouts at 360px, 768px and desktop; keyboard focus, links, footer/header, headings, no unintended nav traps.
- [ ] Review local and preview console errors. No credentials or production tokens in exported artifacts.

## C. Auth and authorization (staging only)

Use authorized, dedicated staging users and signed JWTs; never use personal live accounts or paste tokens into PR artifacts.

| Case | Required outcome |
| --- | --- |
| Anonymous visitor | Public registry content only; admin and finance routes denied |
| Registry admin | Approved registry only; normal Registry sidebar; guarded write RPC permitted |
| COWL finance viewer | COWL finance workspace only; Registry admin dashboard inaccessible |
| Curia finance viewer | Curia workspace only; COWL-only actions inaccessible |
| Authenticated with no grant | Access pending/403, no redirect to Registry dashboard |
| Revoked/expired grant | Immediate denial, no stale-role access |
| Expired/invalid session | Re-authentication without redirect loop |
| Login throttling | Failed attempts locked, success trusted, infrastructure-error release |
| Invitation/recovery | Tokens and invalid/expired states handled securely |

- [ ] Verify each case via direct URL, refresh, navigation and relevant API RPC; not only screenshots.
- [ ] Confirm no self-service role escalation or JWT metadata-only privilege bypass.
- [ ] Confirm PR #78/#79/#83 UI changes are reconciled per file and have no missing imports.

## D. Database/backend contract

- [ ] Read-only target inventory of function signatures, RLS policies, table ACL, triggers, history schema, roles and private Storage permissions.
- [ ] Signed admin/revoked/nonadmin JWT HTTP tests in schema-faithful staging.
- [ ] New guarded registration/CSV/duplicate review workflow, including failed-lookup behavior (A7).
- [ ] Per-ministry letters, assignment-level verification, validity dates and certificate expiry.
- [ ] Stage 4C `admin_login_begin`/`admin_login_finish` service_role-only behavior validated against **real staging app** before cutover.
- [ ] Classify deployed `system_settings` keys and value sensitivity; publicly expose only approved marquee, maintenance and certificate fields (A8).
- [ ] Review order of future SQL migrations; **backend ready before frontend** and only with explicit approval.

## E. Finance and end-to-end (A9)

- [ ] Signed role matrix for COWL/Curia/admin/ungranted across web and API.
- [ ] Synthetic finance/payment/receipt/serial workflow with two-person physical custody approval and immutable audit evidence.
- [ ] Validate receipt printer calibration on actual detached stock if printing to be enabled.
- [ ] Confirm financial demos and fictional data remain non-persistent and disabled if not approved.
- [ ] Record user acceptance from the responsible ministry/finance owners.

## F. Recovery and release go/no-go

- [ ] Verify Auth user/role recovery, schema and PostgreSQL privileges, full Storage buckets/objects, audit evidence, separate from local V3/V4.
- [ ] Record achievable RTO and RPO with timestamped independent restoration evidence.
- [ ] Pin exact approved front-end SHA and backend migration list; feature flags OFF until ready.
- [ ] Prepare staged `--skip-domain` build and preview testing; don't promote a different/unverified build.
- [ ] Establish compatible app rollback **plus** DB recovery/fix-forward, including who authorizes each.
- [ ] Sign-off: technical owner, registry owner, COWL/Curia finance owner, privacy/security reviewer, deployment owner.
- [ ] Explicit final GO signed with deployment window and rollback authority.

## Decision register

**Current overall decision: NO-GO for merging into `main`.**
This checklist is complete as a *planning artifact*, not as acceptance evidence.
Local V4 completed 7/7 security and 7/10 local functional checks with 3
separately flagged REVIEW gates. These tests are not real signed Auth,
Storage and browser/custody acceptance.

**Only safe next action from this branch:** check the exact RC0 diff,
run no-secret prebuild/typecheck, and review the new 403/404 screens.
Then reconcile Auth/role routing before moving guarded registry code.

See `docs/release/2026-11-19-rc0-consolidation-plan.md`.
