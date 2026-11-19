# RC1 — Auth/UI and guarded registry source reconciliation

**Created:** 2026-11-19, Asia/Manila.  
**Status:** DRAFT / NOT A DEPLOYMENT AUTHORIZATION.

## Source provenance

- **PR #79 head:** `46ca36cb90c4bb74a527012b2fef5ce0877aa295` is the parent of RC1. This retains the
  full PR79 guarded registry write and verification integration, including
  `registry_admin_member_write_v1` caller paths, private-document flows,
  certificate limits and the independent role-aware finance authorization.
  **It has not been merged into main, activated in PROD, or proven compatible
  with the live backend.**
- **PR #78:** PR79 already carries its shared Auth UI on most routes; retain
  newer PR79 variations for access-pending, request-email confirmation,
  and verification-unavailable presentation instead of restoring older code.
- **RC0 PR #87:** carry the exact live `main` shared 403/404 source blobs,
  RC0 finance-handler regression tests and release docs.
- **Conflict resolved:** older PR79 source test referenced
  `components/public-status-page.tsx`, while the current deployed main
  uses `components/public-error-page.tsx`. Update the regression test to
  assert the deployed main rendering contract.
- **Staff entry:** if the Registry admin RPC errors, keep Registry
  **denied**, then independently evaluate the authenticated finance access
  endpoint. A verified COWL/Curia role may use its own workspace; missing,
  revoked, inaccessible or malformed finance permission remains fail-closed.
  Shared policy lives in `lib/staff-entry-routing.ts`.

## Safety and review contract

- No schema migration or Supabase changes executed by this branch.
- No PR #86 SQL changes imported. Stage4C remains its own draft gate.
- This branch incorporates **the entire existing PR79 candidate source**
  plus selected compatible RC0 files; it is **not** a small production patch.
- Keep all feature flags, existing backend protections and disabled
  financial operations unchanged. In current PROD, the required guarded
  registration RPC may still be absent; therefore front-end registration
  would fail closed until a separately reviewed backend-first deployment.
- A READY preview plus source tests is NOT evidence of real signed
  JWT, private Storage, finance custody, registration or Auth recovery.
- Production `main` and the live Vercel alias are untouched.

## Evidence checklist

- [ ] Vercel preview builds on RC1 exact HEAD; TypeScript succeeds.
- [ ] Prebuild 17 existing finance/Auth tests, PR79/Auth regression checks,
      RC0 finance-handler tests and RC1 routing tests pass.
- [ ] Review PR79's guarded write sites and execute its full offline security suite.
- [ ] Protected preview: 403/404, sign-in, sign-out, password reset, invitation,
      desktop, tablet and mobile tested with safe fixtures.
- [ ] Signed Registry admin, COWL, Curia, no-grant and revoked-user tests.
- [ ] Deliberately disable Registry RPC in approved staging; finance users
      with independent valid grants can still open finance but not Registry.
- [ ] Verify guarded backend RPCs exist and enforce ownership on target
      staging before enabling registry write features.
- [ ] Align A7–A9, privacy/settings classification, full Auth/Storage
      recovery, rollback and approvals.
- [ ] Do not merge/promote to `main` until separately approved.

**Decision:** RC1 is an integration review candidate; production NO-GO.
