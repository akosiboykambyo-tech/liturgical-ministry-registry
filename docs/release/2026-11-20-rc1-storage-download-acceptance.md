# RC1 — TEST Storage direct-download and signed-URL authorization

**Date:** 2026-11-20  
**Environment:** Supabase `Ministry-Registry-Test` (`rtptybxugjhvpfjvcvgw`), Vercel Preview only  
**PR:** #88 (Draft); **Production unchanged**.

## Preflight and rationale

- `member-documents` is PRIVATE, allows PNG/JPEG/PDF, and contains one **pre-existing** object. This test deliberately does **not** read, download, expose, or share that existing member document.
- `fs-private` is PRIVATE, allows PNG/JPEG/WebP/PDF, and contains **zero** objects. At time of inspection it had **no `storage.objects` RLS policies**. The absence of a visible object or a matching policy is useful catalog evidence but does not constitute an actual download-denial test against an existing financial file.
- `certificate-templates` is PUBLIC and excluded because it is not a private bucket.
- `storage.objects` policies for `member-documents` allow `SELECT`, `INSERT`, `UPDATE` and `DELETE` to authenticated Registry Administrators only (live helper `registration_is_admin()`). No policy exists granting these permissions to anonymous, COWL/Curia finance viewers, or revoked accounts.
- Supabase Storage private-bucket access depends on Storage RLS for direct download and signed-URL *creation*. An already issued signed URL is itself a temporary bearer capability and intentionally may be used without a login; do not confuse link use with link creation.

## QA feature shipped to the RC1 draft preview

`/rc1-storage-qa` is a temporary, **Preview-only, TEST-host-gated** page:

1. It returns 404 unless `VERCEL_ENV=preview` and the configured Supabase host exactly matches `rtptybxugjhvpfjvcvgw.supabase.co`. Robots indexing is disabled.
2. Using an existing TEST Registry Administrator's normal signed-in Supabase browser session, the operator clicks **Create synthetic fixture**. This uploads one tiny, fixed one-pixel PNG to a randomized `rc1-security-qa/*.png` path in `member-documents`, `upsert=false`. It then verifies exact downloaded bytes and ability to request a short-lived signed URL, without exposing that URL.
3. The browser stores **only the synthetic randomized path and creation timestamp** locally, so switching TEST accounts *on the same Preview hostname and browser* allows the subsequent roles to test the same verified object. No credentials, private documents or signed URLs are stored in this QA key.
4. The operator runs **Run download checks** once per TEST persona: Registry Administrator, COWL viewer, Curia viewer, revoked/no-active-role. Real Supabase session checked with `getUser`. An independent no-session `anon` client probes direct download and signed-URL issuance. The authenticated client probes direct download and signed-URL issuance of the same synthetic path. TEST Registry Admin must receive exact PNG and signing success; finance/no-role actors must be denied. Unknown Storage error status is **INCONCLUSIVE**; a returned private blob or signed URL to an unauthorized identity is **FAIL**.
5. The operator copies only **sanitized pass/fail results** from each role, never the object path, user ID, JWT, signed URL, or file content. QA does not send reports to any telemetry service.
6. **Mandatory cleanup:** Sign back into TEST as Registry Administrator on the **same Preview hostname**, click **Remove fixture (admin)**. The page calls Storage `remove` on the recorded synthetic path and confirms authorized download now fails; it then clears the local fixture reference. Independent TEST Storage catalog should return to **one** pre-existing member-document object. If removal fails, **do not abandon the fixture**: retry with the Registry Administrator and report the cleanup blocker.

**Scope limitation:** This is one well-defined private `member-documents` fixture. Testing `fs-private` object download requires a separate authorized synthetic financial file in that bucket and explicit ownership/role policy review. Do not add public Storage policies or a service-role browser endpoint just to manufacture a PASS.

## Acceptance criteria

- TEST environment guard, Auth session validity, and owner positive control pass.
- Anonymous, COWL viewer, Curia viewer, and revoked/no-active-role direct download AND signed-URL issuance are denied to the **same known-existing synthetic object**.
- Admin can access bytes and issue a 60-second signed URL.
- Cleanup succeeds and a fresh Storage object count matches baseline.
- Empty Storage lists, network errors, missing fixturing, or unexpected Storage statuses are not called passed.
- Production `cowl-dok.online`, `main` and public Storage asset references remain untouched.
- No Production approval from this single Storage check; A7 browser document workflow and real finance operations remain independently open.

## Status

**CODE PREPARED; USER STORAGE TEST RESULTS PENDING; FIXTURE NOT YET CREATED BY TOOL; PROD NO-GO.**
