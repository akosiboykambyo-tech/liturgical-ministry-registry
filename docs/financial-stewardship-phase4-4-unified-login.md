# Phase 4.4 — Unified COWL-DOK staging login and recovery

**Scope:** Draft PR #58 on `feature/financial-stewardship-preview` only. Production registry Auth and Ministry-Database were not changed.

## Unified sign-in

- In the branch-scoped test preview, `/admin` presents **COWL-DOK Portal** (the existing burgundy registry login design) using the **isolated Ministry-Registry-Test Supabase Auth client**.
- The regular Registry Admin production login remains preserved in `components/financial-stewardship/legacy-admin-login.tsx` and renders if the isolated test feature variables are absent.
- After successful test-project authentication, the application reads the **current active** `fs_staff_grants` through RLS (never user_metadata).
- Any COWL role (`cowl_receipt_issuer`, `cowl_finance_verifier`, `cowl_remittance_preparer`) routes to `/admin/financial-stewardship`.
- Any Curia role (`curia_receipt_custodian`, `curia_treasury_reviewer`) routes to `/curia`.
- One authorized workspace redirects immediately. Multiple permitted workspaces show a selector; the navigation shows **Switch workspace** only if the user has both kinds of roles.
- A logged-in test account without an active grant sees **Role approval required**, not a default registry dashboard.
- Direct COWL/Curia routes use the same Auth session and redirect unauthenticated users to `/admin`; there is no second built-in form. Each protected database operation still performs its own server-side role check.

## Test-specific password recovery

- `/admin/forgot-password` sends the test account's recovery email through **Ministry-Registry-Test** Auth, not the live registry.
- Supabase Auth redirect is intentionally pinned to the feature-branch's **stable** Vercel alias:
  `https://liturgical-ministry-registry-dcwd-git-feature-f-e3ad5a-cowl-dok.vercel.app/admin/reset-password`
- `/admin/reset-password` validates a genuine Supabase Auth recovery token/session (hash token pair or verified token_hash callback) before enabling an account password change. A normal signed-in session alone cannot open the reset form.
- Passwords require at least 12 characters in the staging UI, matching entries, and are updated through `supabase.auth.updateUser`. Successful reset signs the user out and returns to unified sign-in.
- Existing production forgot/reset pages are preserved as `legacy-forgot-password.tsx` and `legacy-reset-password.tsx`, with conditional rendering on production.
- Repeated requests during provider rate limits show an explanatory error rather than encouraging users to keep sending links.

**Manual Supabase Auth setting required before live password-reset link QA:**
Open `Ministry-Registry-Test → Authentication → URL Configuration → Redirect URLs`, and add this **exact** entry:

`https://liturgical-ministry-registry-dcwd-git-feature-f-e3ad5a-cowl-dok.vercel.app/admin/reset-password`

Do not add `*.vercel.app` or other broad redirect wildcards. Verify that the test environment's Resend custom SMTP is enabled and the **Reset Password** email template still contains `{{ .ConfirmationURL }}`. The expiry follows the test project's configured Email OTP Expiration, not an independently enforced application timer.

## Current test users and roles

Existing test grants remain unchanged: one COWL receipt custodian and one Curia receipt custodian. No production roles, users, or financial authorities were added. No real financial transactions or receipts were created.

## Verification requirements

1. Vercel feature preview must build, typecheck, and report READY for the **latest** commit.
2. COWL test identity should redirect to Financial Stewardship after sign-in; Curia test identity to Curia Portal.
3. Opening the opposite role's route must not reveal financial information or allow unauthorized actions.
4. Test the reset email delivery, Supabase redirect allowlist, expired/invalid link rejection, successfully setting a new password, and signing in with the new password.
5. Confirm production `/admin`, `/admin/forgot-password`, and `/admin/reset-password` retain legacy registry behavior.

**Database/production scope:** no migration or deployment to the production environment. This is staging only; do not treat UI routing as server authorization.
