# RC1 staging acceptance — read-only preflight

**Date:** 19 November 2026 (Asia/Manila)  
**Decision:** **STAGING PREFLIGHT PARTIAL PASS / LIVE AUTHENTICATED EXECUTION BLOCKED**  
**Candidate:** RC1 Draft PR #88, tested source head before this documentation commit `5ad4f3042e5f6a37f70d799430d77f5f2c67d2f5`.  
**TEST Supabase only:** `Ministry-Registry-Test` / project ref `rtptybxugjhvpfjvcvgw` (ACTIVE_HEALTHY).  
**PROD:** `Ministry-Database` / project ref `zlvofcwnpdzfdnipvbbd`. **No production database inspection or mutation was performed in this checkpoint.**

## Scope and execution safety

This report records **only read-only Supabase catalog and aggregate data**, Vercel environment-variable *metadata* (names, scopes, no decrypted values), and existing source/build test evidence. No auth passwords, JWTs, service-role secrets, record contents, Storage files, personal details, environment values, grants or credentials were accessed. No SQL write, Auth session creation, test-user creation, migration, Storage upload, Vercel env edit, domain reassignment, PR merge or deployment promotion occurred.

### Verified staging inventory

| Check | Result | Interpretation |
| --- | --- | --- |
| TEST database state | ACTIVE_HEALTHY, PostgreSQL 17 | Database accessible read-only |
| Public application tables | **45**, all RLS enabled | Staging schema contains more than the core 17 legacy registry tables; not identical to the 52-table isolated V4 recovery baseline |
| TEST members | 1,009 | **Not empty or disposable**; no persistent synthetic writes permitted without controlled fixture plan |
| Member/ministry rows | 13 | Existing fixture/persistent data present |
| Supabase Auth users | 6 | Identities exist, but **no signed-in credentials were supplied or tested** |
| Financial role grants | 5 total, 4 currently active | Counts only, not personal identities |
| Active finance grants with valid Auth user | 4 | Positive Auth linkage; **not JWT HTTP authorization proof** |
| Orphan finance grants | 0 | No unresolved dangling links in count query |
| Storage buckets | 3 | See below |
| Storage objects | 2 total | Storage recovery / private upload-download test still incomplete |

Storage inventory (names, publicity and aggregate object counts only): `certificate-templates` — public, 1 object; `member-documents` — private, 1 object; `fs-private` — private, 0 objects. No file contents or paths were read.

Aggregated currently active roles: `cowl_financial_workspace_viewer` 1, `cowl_receipt_issuer` 1, `curia_financial_workspace_viewer` 1, `curia_receipt_custodian` 1. An additional COWL viewer grant exists but is not active. This is **fixture availability evidence**, not authorization proof.

### RPC contract and access-check evidence

Only `pg_proc` metadata was inspected; SQL function bodies, user data and service-role credentials were not retrieved.

| Function/signature | TEST catalog | Entry grants |
| --- | --- | --- |
| `public.admin_login_begin(text,uuid)` | SECURITY DEFINER, present | anon NO, authenticated NO, service_role YES |
| `public.admin_login_finish(text,uuid,boolean)` | SECURITY DEFINER, present | anon NO, authenticated NO, service_role YES |
| `public.registration_is_admin()` | SECURITY DEFINER, present | anon NO, authenticated YES, service_role YES |
| `public.registry_admin_member_write_v1(text,jsonb)` | SECURITY DEFINER, present | anon NO, authenticated YES, service_role YES |
| `public.registry_verify_ministries_v2(uuid,uuid[],text)` | SECURITY DEFINER, present | anon NO, authenticated YES, service_role YES |
| `public.registry_attach_ministry_letter_v1(uuid,uuid,text)` | SECURITY DEFINER, present | anon NO, authenticated YES, service_role YES |
| `public.allocate_certificate_issuance(text,uuid)` | SECURITY INVOKER, present | anon NO, authenticated NO, service_role YES |

Intentional `authenticated` EXECUTE on guarded SECURITY DEFINER functions must be verified with actual **revoked, ungranted and administrator JWTs**. Grant presence **alone does not demonstrate** a bypass, nor does the catalog establish that the internal allowlist guard is correct. Do **not** blindly revoke all such functions.

Stage 4C source-level login contract matches RC1 server-side service-role RPC calls. TEST already has the two login RPCs restricted to service_role, but this does not prove PROD parity. The separate Stage 4C PR #86 remains unmerged.

### Confirmed review gates

**A7 — Authorized registration: OPEN.** `registry_admin_member_write_v1` exists and test Auth users exist. No valid signed staging JWT was used. The backend needs a dedicated, approved staging identity for positive and negative HTTP/RLS tests. Given TEST's populated state, use synthetic fixtures with tracked identifiers, separate read/write permission checks, transactionally isolated SQL probes where possible, and cleanup protocols for unavoidable HTTP/Storage writes.

**A8 — Settings privacy: OPEN / remediation review required.** The TEST public settings table has a permissive `SELECT` policy `pr55_stage_public_read_system_settings` for `anon, authenticated` with unconditional `true` condition. Current metadata shows **2 `certificate_template_*` JSON documents** (up to 7,769 bytes each) and **7 `sig_layout_*` JSON documents**. JSON top-level fields include template content, elements, font/image URLs, signatory formatting, and layout coordinates. **Actual values were not read or classified**, so the public privacy impact is not determined. Prepare an owner-approved public-key allowlist; verify actual webpage dependencies before changing RLS. The legacy `test_admin_read_members` SELECT policy also remains in TEST and needs its own target-specific Stage 4C review.

**A9 — Finance/website end-to-end: OPEN.** Finance roles and authorization endpoint contract exist, but TEST's `fs-private` bucket has no objects and no signed COWL/Curia browser or API test was executed. Verify minimum-privilege navigation first, then separately approved synthetic payment/remittance/receipt-custody fixtures with immutable audit assertions and cleanup/evidence procedures.

**Security advisor summary (TEST, not PROD):** 11 `rls_enabled_no_policy` informational findings; 10 `authenticated_security_definer_function_executable` warnings; 1 `auth_leaked_password_protection` warning. Review each intentionally, especially private deny-all tables and guarded RPCs; do not equate advisor flags with confirmed vulnerabilities. References:
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Critical blocker: RC1 preview is NOT verified as TEST-isolated

Vercel project `liturgical-ministry-registry-dcwd` was inspected using the project environment-variable **metadata only**, with decryption disabled.

- Branch-specific Supabase preview overrides exist for older integration branches `integration/pr55-security-on-release-baseline-20261112` and `integration/pr79-pr78-auth-reconciliation-20261112`.
- **No RC1-specific** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY` override was observed.
- Shared `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` variables target **both Preview and Production**.
- Their decrypted values were **not** read, so actual RC1 runtime Supabase target is **unverified**. Assume a production-connection risk and do not send signed Auth, registration, finance or Storage traffic to RC1 preview until isolation is proven.
- The RC1 preview being READY and its 60/60 offline tests passing **do not** make it a safe TEST endpoint. Supabase documentation warns that Vercel preview deployments can otherwise inherit production URLs and keys. See https://supabase.com/docs/guides/integrations/vercel-preview-branches and https://supabase.com/kb/troubleshooting/vercel-integration-environment-variables-not-syncing-for-persistent-git-branches-b9191e .

## Exact prerequisite sequence for the authorized staging run

1. **Choose and approve TEST binding.** Explicitly bind **this RC1 branch only** (or a dedicated staging environment) to Supabase TEST project `rtptybxugjhvpfjvcvgw`. Scope its publishable URL/key and server-only credential correctly, verify the resolved target without logging keys, and ensure protected previews remain protected. Never alter global or Production variables to test.
2. **Verify target after binding:** rebuild/redeploy **preview only** from the exact RC1 SHA, confirm runtime Supabase project ref equals TEST before sign-in and that no production ref is used. Do not use a user-provided JWT in browser logs, PR text, or tool outputs.
3. **Approve dedicated staging test accounts:** Registry admin, COWL viewer/issuer, Curia viewer/custodian, ungranted and revoked. Existing 6 users/4 active finance grants are not a substitute for explicit permission to use particular credentials. Do not impersonate live personnel or reset accounts without approval.
4. **Run the HTTP/browser matrix:** sign-in, direct protected routes, forced Registry RPC outage, revoked-grant checks, private Storage denial, expiry/renewal and per-ministry certificate proof, with exact candidate SHA recorded.
5. **Run controlled write tests** only after fixture plan and restore/cleanup signoff; finance/receipt-custody requires real business-rule acceptance and physical process evidence, not just UI simulations.
6. **Re-run advisors, review A8 value privacy and Stage 4C parity**, and collect complete DB+Auth+Storage+roles/ACL backup/restore, RTO/RPO, reviewer and deployment go/no-go records.
7. Keep RC1 PR #88 and Stage 4C PR #86 **DRAFT / UNMERGED** until all gates meet their acceptance criteria.

## Decision and next action

**Decision:** `STAGING_PREFLIGHT_READONLY_COMPLETE; AUTHENTICATED_TESTS_NOT_RUN; RC1_PREVIEW_TARGET_UNVERIFIED`.

**Required owner action:** approve dedicated RC1 Preview → TEST Supabase binding and designated staging fixture accounts. Until then, no further authenticated HTTP or database write tests should be performed against RC1. The live `cowl-dok.online` alias, Supabase TEST/PROD data, and local Docker V3/V4 remain unchanged by this preflight.
