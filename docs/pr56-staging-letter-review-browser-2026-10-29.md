# PR56 — Synthetic private-letter browser E2E (isolated staging only)

## Purpose and limits

PR55 already passed the real Auth/Storage API attach and verification flow. PR56 passed the read-only Chromium desktop/mobile smoke. This test targets the **remaining private ministry-letter browser interaction**: a real staging administrator sees a pending ministry's letter, receives a short-lived signed URL, confirms that URL serves a synthetic PDF, opens the link, and can then select that ministry in the modal. The other ministry must remain unselectable. **The script never clicks Verify** and therefore does not mutate a minister's verification status.

The browser runs at `http://127.0.0.1:3198` with its own local staging-only Next.js child process, a real staging Auth session, and the secure feature enabled locally. It does **not** enable any Vercel preview or production feature flag. The separate staging database lacks the production lockout RPCs, so the runner supplies a legitimate Auth session directly to this local browser without changing the normal app login code.

## Database fixture

A staging-only migration `docs/sql/pr56-staging-letter-review-fixture.INSTALL-ISOLATED-ONLY.sql` installs two admin-checked helpers:
- `pr56_review_begin_v1(uuid)`: creates a single synthetic minister and exactly two Pending Verification ministry assignments with a unique test-only nonce marker.
- `pr56_review_finish_v1(uuid,uuid)`: requires a matching exact nonce/UUID/name/parish, locks the synthetic member, verifies its exact two ministry assignments, and deletes the fixture.

Both require an active, revocable private administrator grant *inside* the function. The migration is guarded by the known isolated staging baseline (1,008 members, 12 assignments, 0 Storage objects, private bucket, correct RPCs, exactly one active admin grant, and no production-only renewal schema). No service role key is used by the runner.

The operator's test uploads a generated, nonpersonal PDF using the real authenticated Storage API, attaches it to only the first pending assignment using `registry_attach_ministry_letter_v1`, and opens/inspects it in Chromium. The second assignment remains without a letter. Cleanup deletes the exact database fixture via admin RPC **before** deleting the PDF via Storage API, avoiding dangling DB references. If a crash or cleanup error occurs, `--cleanup-only` refuses ambiguous synthetic identities and wrong Storage paths, and safely targets only the matching fixture. **Do not rerun `--run` when a fixture remains.**

## Run on Windows (use the existing Playwright installation)

Switch to the PR56 draft branch. Do not use PR55's cleanup script; this new fixture uses a distinct test marker and RPC names.

```powershell
git switch feature/admin-verification-navigation-2026-10-27
git pull --ff-only origin feature/admin-verification-navigation-2026-10-27

$env:PR55_STAGING_PUBLISHABLE_KEY = Read-Host "Staging publishable key"
$admin = Get-Credential -Message "STAGING administrator"
$env:PR55_STAGING_AUTH_EMAIL = $admin.UserName
$env:PR55_STAGING_AUTH_PASSWORD = $admin.GetNetworkCredential().Password
$env:PR56_ALLOW_LETTER_BROWSER_E2E = "I_ACCEPT_STAGING_SYNTHETIC_LETTER_BROWSER_TEST"

node .\scripts\pr56-staging-letter-review-browser.cjs --validate-config
node .\scripts\pr56-staging-letter-review-browser.cjs --run
```

Playwright and Chromium were installed for the prior PR56 read-only browser smoke. If missing in a new environment, install the **reviewed exact version documented with the read-only smoke**; do not commit optional packages to the production lockfile.

Only share PASS/FAIL messages. Never share credentials, JWTs, signed document URLs or local session storage. If the runner prints `CLEANUP REQUIRED`, stop and use the following command with the same staging credentials:

```powershell
node .\scripts\pr56-staging-letter-review-browser.cjs --cleanup-only
```

After PASS, verify the exact staging baseline independently (1,008 members, 12 assignments, 0 Storage objects, 0 PR56REVIEW synthetic members) and remove both PR56 review-only helper RPCs via a reviewed exact-signature, staging-only teardown migration. Keep actual secure verification and letter attachment RPCs installed in staging.

## Acceptance boundaries

A PASS here proves the private signed PDF can be fetched in Chromium's browser context and the correct checkbox becomes selectable after opening the link. It does **not** prove a human read the PDF, the full production login page works against staging, renewals enforce one year server-side, or that production restore rehearsals succeeded. Both PRs remain draft and production activation remains NO-GO.
