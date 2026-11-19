# COWL-DOK — Release consolidation and RC0 decision record

**Prepared:** 2026-11-19 (Asia/Manila)  
**Document status:** Release planning only; no application merges, migrations, or production deployments.  
**Review branch:** `release/cowl-dok-rc0-consolidation-20261119`  
**Branch starting commit:** `b8082167c511072a92adaa3b84268121992f3985` (role-aware release baseline).  
**Not a release-ready candidate:** "RC0" means an integration *foundation*, not an approved production artifact.

**Reconciliation change already staged on RC0:** the three exact `main` files
`components/public-error-page.tsx`, `app/403/page.tsx`, and
`app/not-found.tsx` were copied from production commit `7b6521c`
and match its source blob SHAs. They are **not build/visual QA certified yet**.
Other main-only differences (including icon migration history and branch
lineage) remain subject to comparison and sign-off.

## 1. Ground truth: live deployment versus source branches

Verified through Vercel (project `liturgical-ministry-registry-dcwd`):

| Item | Verified finding |
| --- | --- |
| Custom domains | `cowl-dok.online`, `www.cowl-dok.online` |
| Currently assigned production deployment | `dpl_2jhuzHLiLyfXZaPTpHxQZn8mc9Wo`, READY |
| Live Git branch/commit | `main` / `7b6521cc4abe5508c0a77d040e5677540c35bad3` |
| Last known role-aware release baseline | `release/auth-typography-on-live-baseline` / `b8082167c511072a92adaa3b84268121992f3985` |
| Role-aware integration work | PR #79 head `46ca36cb90c4bb74a527012b2fef5ce0877aa295` |
| Local Stage 4C hardening | Draft PR #86 head `3138a84572cb7c5e8ff49e9e503d5366c16acde6` |
| Environment change made in this consolidation | **None** |

The role-aware release baseline and `main` have **diverged**, not simply advanced:
`main → release/auth-typography-on-live-baseline` comparison: 77 commits
on the release side, 2 commits on the main side, 121 changed files.
Therefore **do not fast-forward, bulk merge, or rebase all PR branches onto
main**. The released `main` changes (including the shared 403/404 presentation)
must be explicitly carried across without discarding the role-aware finance
routing and registry authorization.

PR #78 and PR #79 are **diverged** from common role-aware baseline
`b8082167` (12 versus 49 unique commits). PR #83 and PR #84 each branch
from an *earlier* revision of PR #79's integration, not its current tip.
Treat their changes as select candidates for reconciliation, not as complete
drop-in merges.

The live Vercel domain is assigned to `main` `7b6521c`; **do not confuse**
the existence of a READY preview, a successful Vercel status, or the most
recent deployment record with authorization to promote or merge code.

## 2. Architecture/release baseline decision

**Recommendation (provisional):** use role-aware `b8082167` as the
integration **foundation** because it contains the finance access control
endpoint and role-aware Registry/COWL/Curia routing missing from older
`main`. Keep current production assignment unchanged. The RC0 branch currently contains the baseline, the three live public error-page files, and release-planning documents. No Auth, registry-writing, finance, or SQL migration changes are integrated.

**Mandatory reconciliation:** explicitly replay the two main-only
changes and verify the resulting 403/404/error pages and public routes
against deployed `main`. Do not infer that this is done merely from the
number of commits. Compare exact files, check behavior, and record owner
approval before bringing in additional feature code.

**Known foundation tests:** `package.json` at this baseline has
`prebuild` tests for finance access and invitation onboarding,
`npm run test:finance-access`, `npm run test:auth-onboarding`,
`npm run typecheck`, `npm run build`, and registration tests.
Run on exact candidate commit with `npm ci`; a passing historical Vercel
build on another SHA is not enough.

## 3. Disposition of all 14 open draft PRs

| PR | Scope | Decision for RC0 | Rationale |
| --- | --- | --- | --- |
| [#30](https://github.com/akosiboykambyo-tech/liturgical-ministry-registry/pull/30) | Duplicate-validation fail-closed behavior | **Reconcile / likely superseded** | Needs validation against newer guarded registration and CSV code; do not apply stale writes. |
| [#53](https://github.com/akosiboykambyo-tech/liturgical-ministry-registry/pull/53) | Disabled secure registration scaffold | **Superseded candidate / defer** | Endpoint deliberately returns 503; not a finished secure registration backend. |
| [#55](https://github.com/akosiboykambyo-tech/liturgical-ministry-registry/pull/55) | Production registration authorization and legacy write cutover | **Security source / BLOCKED** | Backend-first staging, signed JWT/Storage and recovery gates remain; parts of earlier production SQL were separately applied historically, so inspect actual deployed state, not migration filenames. |
| [#56](https://github.com/akosiboykambyo-tech/liturgical-ministry-registry/pull/56) | Verification navigation and certificate/setting UI | **Feature candidate / defer code merge** | Admin workflow compatibility, certificate rendering and authorized settings access require exact-branch QA. |
| [#57](https://github.com/akosiboykambyo-tech/liturgical-ministry-registry/pull/57) | Season-grid workflow foundation | **Defer** | Secure RPCs and auditable approvals not ready; keep feature disabled. |
| [#58](https://github.com/akosiboykambyo-tech/liturgical-ministry-registry/pull/58) | Financial Stewardship prototype | **Preview only / defer** | Browser-local fictional operations; not a release-capable ledger. |
| [#62](https://github.com/akosiboykambyo-tech/liturgical-ministry-registry/pull/62) | Registration/parish OTP/Curia demos | **Preview only / defer** | Simulated OTP and payments; not production Auth or accounting. |
| [#75](https://github.com/akosiboykambyo-tech/liturgical-ministry-registry/pull/75) | Unified Auth UI designs | **Selective source / review** | Covered substantially by PR #78/#79; avoid duplicate history. Missing full preview/visual QA. |
| [#78](https://github.com/akosiboykambyo-tech/liturgical-ministry-registry/pull/78) | Role-aware Auth UI regression fix | **Priority candidate / reconcile** | Diverges from PR #79; verify Registry/COWL/Curia routes with actual signed test roles. |
| [#79](https://github.com/akosiboykambyo-tech/liturgical-ministry-registry/pull/79) | PR55 secure write integration | **Primary candidate source / BLOCKED** | Guarded backend absent from current live frontend contract; target schema, Auth/Storage and release sequencing unresolved. |
| [#83](https://github.com/akosiboykambyo-tech/liturgical-ministry-registry/pull/83) | Consistent access-denied/unavailable UI | **Selective 2-file candidate** | Based on older PR #79 revision; test access-pending state and avoid redirect loops. |
| [#84](https://github.com/akosiboykambyo-tech/liturgical-ministry-registry/pull/84) | Receipt Management UI v0.5 | **Defer** | Read-only preview/calibration; no production receipt issue/print/custody sign-off. Based on older PR #79 revision. |
| [#85](https://github.com/akosiboykambyo-tech/liturgical-ministry-registry/pull/85) | Bilingual printable Ordo preview | **Defer / independent editorial track** | A4/Tagalog and publication rights/COWL approval outstanding; do not mix into security release. |
| [#86](https://github.com/akosiboykambyo-tech/liturgical-ministry-registry/pull/86) | Stage 4C test-RLS and privileged login hardening | **Priority security candidate / BLOCKED** | Isolated V4 checks passed but A7–A9, target parity, settings privacy and production rollback sign-off remain. |

All 14 were open and marked **Draft** at inspection. A GitHub `mergeable`
signal measures Git mechanics, **not** release certification. No PR has
been closed, merged, rebased, or automatically assigned to RC0.

## 4. Integration lanes and order

### Lane 0 — Branch and baseline reconciliation (first)
1. Pin current production deployment ID/SHA and record the available
   rollback target (live deployment pinned; operational rollback approval open).
2. The **three public 403/404 files** have been carried over exactly
   from live `main`; run build and desktop/mobile visual acceptance.
3. Compare the **two main-only commits** with role-aware baseline, reviewing
   403/404, error routes, shared components, public site behavior.
4. Integrate other **reviewed** main-only changes only after comparison; run baseline CI/typecheck/build on RC0 exact SHA and record screenshots.
5. Verify the finance access endpoint remains fail-closed and the
   Registry role guard is not bypassed by successful sign-in.

### Lane 1 — Auth and role-routing presentation
5. Compare PR #78 and the corresponding UI already present in PR #79;
   select the correct source per file. Do not merge PR #75, #78 and #79
   as three overlapping complete units.
6. Review PR #83's two access-state files against the new candidate.
7. Test signed Registry admin, COWL viewer, Curia viewer, no-grant and
   revoked user, guest and expired session. Verify direct URLs, redirects,
   denied/failure states, recovery and invitation flows.
8. Responsive/keyboard checks for mobile, tablet and desktop.

### Lane 2 — Security-dependent registry application
9. Treat PR #79 as the integration source for PR #55 guarded registry
   writes; verify backend prerequisites before enabling browser UI.
10. Inspect actual authorized staging/production catalog, function
    signatures, permissions, RLS, Storage, history tables and settings
    **read-only**. Earlier local V3/V4 validation is not proof of parity.
11. Reconcile PR #86's login RPC privileges and test-only policy removal
    against the target's exact definitions and the chosen RC commit.
12. Prepare separately reviewed **backend-first** migrations; confirm
    signed JWT, admin revocation, private Storage, audit, CSV,
    per-ministry verification, and certificate expiry behavior in a
    schema-faithful staging environment.
13. Keep old runtime/legacy grants until the new backend and frontend
    are independently validated; revoke risky paths only as part of
    an approved staged cutover with rollback plan.

### Lane 3 — Optional UX and later programs
14. Evaluate PR #56 navigation once protected workflows are stable.
15. Keep PR #57 season grid behind disabled feature flag.
16. Keep PRs #58, #62 and #84 as test/prototype experiences, not ledger
    or payment production features.
17. Route PR #85 through COWL content/licensing review and print QA
    separately from auth/security release.

No lane authorizes an immediate merge to `main`.

## 5. Acceptance gates: must be evidence-backed

| Gate | Required evidence | Current state |
| --- | --- | --- |
| G0: Canonical baseline | Exact production SHA + main-only change reconciliation | Production pinned; **three error-page files ported; rest open** |
| G1: Build/CI | Clean `npm ci`, prebuild test suite, TypeScript, Next.js build on exact RC SHA | **Open** |
| G2: Roles/Auth | Real signed tokens in authorized staging: Registry/COWL/Curia/revoked/guest + direct route checks | **Open** |
| G3: Registration | A7: real Auth fixture + guarded registration RPC, duplicate/CSV rollback, UID allocation | **Open** |
| G4: Settings privacy | A8: classify *actual* settings keys/values, preserve public marquee/maintenance and approved certificate templates | **Open** |
| G5: Finance and end-to-end | A9: payments, custody, receipts, immutable evidence and website/session integration | **Open** |
| G6: Recovery | Database+Auth+Storage+objects+roles/ACL backups and independently tested restore; record RTO/RPO | **Open** |
| G7: Release management | Security and UX review, feature flags, backend-first runbook, migration plan, rollback/monitoring, owner approval | **Open** |

**Already achieved but limited:** Local isolated schema restore (52/52
application tables), Stage 4C source (6/6) and V4 behavioral checks (7/7),
plus 7 local functional acceptance checks (0 fails, 3 REVIEW).
These are only local recovery/security evidence. Stage 4C PR #86 remains
draft and unmerged.

### Explicit stop conditions
Stop before promotion if any real signed role can reach a different
role's workspace; an ungranted user can invoke sensitive write RPCs;
an app frontend expects a missing backend function; RLS/Storage deny
tests fail; receipt/custody controls are untested; signing keys or
stored objects are missing from recovery plan; or reviewed rollback
criteria cannot be met.

## 6. Release and rollback sequence (proposal, not authority to execute)

1. **Prepare:** pin approved RC SHA, inventory live/authorized staging,
   verify fresh restorable backups including Auth, Storage and privileges,
   preserve deployment rollback target, secure approvals.
2. **Stage backend:** apply reviewed migrations to **authorized staging**,
   validate with real signed JWT, Storage upload/download and synthetic
   workflows, inspect advisors and function grants. Do not use local V4
   for end-to-end web tests; V4 intentionally has no network.
3. **Stage frontend:** deploy an exact approved candidate to a protected
   preview/staged environment with explicit flags OFF until backend
   readiness; run no-bypass and responsive QA.
4. **Cutover (future, separate approval):** use backend-first,
   compatible schema changes; stage production build without domain
   assignment, test that build, promote by explicit approval, then
   tighten legacy grants when confirmed safe.
5. **Observe:** watch 403/401, login failures, RPC errors,
   Auth/Storage, audit integrity, and finance discrepancies.
   Record owner go/no-go and stable recovery point.
6. **Rollback:** application alias rollback alone may **not** reverse
   schema migrations. Have a separately reviewed DB fix-forward or
   restore path, compatible old frontend, Auth/Storage restoration
   verification and an incident escalation owner. Do **not** blindly
   undo restrictive grants or reintroduce the test-only member policy.

## 7. Decisions and open questions

**Decisions recorded**
- Preserve current `main` production alias; do not merge tonight.
- RC0 branch begins at role-aware `b8082167`; only the three live public error-page files and planning docs have been added.
- Prefer coherent security/Auth integration over independent feature merges.
- PR #79 is candidate source, not approved branch tip; PR #86 stays draft.
- Separate Ordo and receipt demo publication from core registry cutover.

**Open questions requiring authorized evidence**
- Which functions/policies/grants and Storage objects are deployed now,
  compared with V3/V4 and PR79 assumptions?
- Are there active external clients invoking login RPCs directly?
- Which deployed `system_settings` keys may safely be public?
- Which two main-only changes must be carried into the RC after visual
  and functional comparison?
- Who signs off staff role fixtures, accounting custody, privacy,
  recovery objectives and staged deployment?

## 8. Next executable task (not another local Docker drill)

**Code reconciliation on this RC0 branch, separate PRs in order:**
(1) carry over reviewed main-only changes, (2) integrate role-aware
Auth screen fixes without regressions, (3) transplant PR79/PR86
security changes only after backend and staging contracts match.
Use one exact candidate SHA and a single cross-role browser test
matrix before asking for deployment approval.

**Current decision: NO-GO for production merging or deployment.**
