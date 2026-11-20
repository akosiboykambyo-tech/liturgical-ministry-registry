# PR56 — isolated staging browser smoke (read-only)

**Purpose:** Verify that the default-off secure Verification UI actually renders in a local browser using the isolated staging Supabase project. It is NOT a production preview or a mutating/upload/verification E2E.

The shared Vercel preview variables are not branch-scoped to the isolated staging project, so do **not** enable `NEXT_PUBLIC_SECURE_MINISTRY_VERIFICATION` in Vercel. The isolated staging project also lacks the production app's `admin_login_begin` and `admin_login_finish` RPCs, so the normal Next.js sign-in API route cannot be tested against it as currently configured. The smoke runner obtains a **real** staging Supabase Auth session through `signInWithPassword` in a local Node process, and inserts that legitimate session into the local browser's Supabase Auth storage without modifying any app auth code.

### Local execution, on PR56 branch

Install Playwright as an **optional temporary dependency** (not committed to `package.json` or `package-lock.json`), and install its Chromium binary:

```powershell
git fetch origin
git switch feature/admin-verification-navigation-2026-10-27
git pull --ff-only origin feature/admin-verification-navigation-2026-10-27

npm install --no-save --package-lock=false playwright@1.64.1
npx playwright install chromium
```

Set **only the isolated staging** publishable key and authenticated administrator credentials in this PowerShell session, using the operator's existing private credential workflow:

```powershell
$env:PR55_STAGING_PUBLISHABLE_KEY = Read-Host "Staging publishable key"
$admin = Get-Credential -Message "STAGING administrator"
$env:PR55_STAGING_AUTH_EMAIL = $admin.UserName
$env:PR55_STAGING_AUTH_PASSWORD = $admin.GetNetworkCredential().Password
$env:PR56_ALLOW_STAGING_BROWSER_SMOKE = "I_ACCEPT_READONLY_STAGING_BROWSER_SMOKE"

node .\scripts\pr56-staging-browser-readonly.cjs --validate-config
node .\scripts\pr56-staging-browser-readonly.cjs --run
```

The runner automatically starts a local Next.js dev process bound to `127.0.0.1:3197` with public Supabase URL/key pinned to **Ministry-Registry-Test**, the secure feature enabled **only in that local process**, and server privilege secrets blanked. It refuses an occupied local port, unexpected staging inventory, missing letters on the expected pending assignments, or missing Auth. It launches a headless Chromium with that real session, opens `/admin/verification?tab=reviews&view=approvals`, checks the protected secure panel, confirms the review dialog has nothing selected and all no-letter approval checkboxes disabled, repeats the dialog at a mobile viewport, and verifies that member/assignment counts are unchanged. It closes the browser and kills the local dev process afterward.

**Do not upload or verify any real staging member as part of this read-only smoke.** No screenshots, access tokens, session files, or credentials are printed or stored by the runner. The staging Auth sign-in and sign-out still create normal Auth session/audit activity.

This script is a supplemental automated UI smoke, not a final manual browser acceptance of file upload, signed-link review, keyboard accessibility or a full schema-compatible renewal workflow. The earlier positive authenticated Storage/verification API test already passed separately.

When done:

```powershell
$admin = $null
Get-ChildItem Env:PR55_STAGING_* | Remove-Item
Remove-Item Env:PR56_ALLOW_STAGING_BROWSER_SMOKE -ErrorAction SilentlyContinue
```

Keep PR56 draft and production flag off until additional gates are certified.
