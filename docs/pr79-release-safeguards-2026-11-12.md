# PR79 — Release safeguards and recovery gates (2026-11-12)

**Status: TEST staging rehearsal only. NOT permission to deploy production.**

## Sources of truth
- Working integration: PR79 at SHA `2701676c` before this QA change; PR82 merged.
- TEST Supabase project: `rtptybxugjhvpfjvcvgw`. Production: `zlvofcwnpdzfdnipvbbd`. No cross-project Auth sessions.
- Live app remains on `main` SHA `7b6521cc`, Vercel deployment `dpl_2jhuzHLiLyfXZaPTpHxQZn8mc9Wo`.
- Production migration candidates are in `docs/sql/pr79-legacy-crud-rpc.REVIEW-ONLY.sql`, `docs/sql/pr79-documented-effective-date.STAGING-TESTED.sql` and `docs/sql/pr79-staging-tested-certificate-and-verification.CANDIDATE.sql`. **Never run the REVIEW-ONLY files directly**: they intentionally stop.
- Follow `docs/sql/pr79-production-preflight.READ-ONLY.sql` for baseline inventory.

## Completed verified staging-only work
- PR82 merged into PR79, followed by PR79 CI passing. Runtime preview built READY.
- Emulated SQL `authenticated` role using three TEST QA identities in rollback-only transactions: Registry admin, COWL-only, Curia-only; tested private Storage SELECT row visibility and role separation. COWL and Curia denied guarded writer and v3 verification, as was `anon`.
- TEST writer/v3, v2 attachment, and corrected inclusive Manila-day certificate allocator exist. Production writer and v3 **do not**.
- No TEST admin-user password/token has been copied to source, logs, or artifacts.

## TEST-only real-session authorization QA (requires the three humans to sign in)
Open `/release-qa` **on the PR79 TEST preview** while signed in to each QA account. The page itself 404s outside `VERCEL_ENV=preview` combined with the exact TEST Supabase URL. Click **Run security checks** and copy only the generated result summary.

Checks use the real JWT to call `auth.getUser()`, workspace-specific financial API, authenticated privileged RPCs with invalid no-op inputs, anonymous finance endpoint, private letter and certificate bucket listing. No business records are mutated. Expected: all PASS for Registry, COWL and Curia accounts. If any FAIL/INCONCLUSIVE, freeze release.

**Limitations:** The QA browser test does not verify private object byte downloads, signed URL handling, real letter upload, a revoked user with a still-valid session, certificate PDF layout or the full recovery drill.

## Owner-submitted real signed-session evidence — 12 November 2026

The project owner supplied the exact, credential-free results from `/release-qa` on the PR79 TEST preview. This is **human-submitted QA evidence**, not a separately captured server-side test trace. It was not independently reproduced from the user's browser. All three runs report **11 of 11 PASS** (33 of 33 total), using separate TEST sign-ins and a live Supabase Auth identity check.

| Persona | Results | COWL inventory | Curia inventory | Finance API without token | Registry-only RPC separation | Storage list visibility |
|---|---|---|---|---|---|---|
| Registry-only | 11/11 PASS | HTTP 403 | HTTP 403 | HTTP 401 | Writer and v3 authorization checks PASS | Accessible to Registry administrator; counts only |
| Curia-only | 11/11 PASS | HTTP 403 | HTTP 200 | HTTP 401 | Writer and v3 authorization denials PASS | Finance account sees no objects in the protected listings |
| COWL-only | 11/11 PASS | HTTP 200 | HTTP 403 | HTTP 401 | Writer and v3 authorization denials PASS | Finance account sees no objects in the protected listings |

Other checks for every persona: TEST Auth verifies the signed-in account, Registry allowlist matches the intended role, and active financial role grants match exactly one (or zero for Registry) appropriate assignment.

The RPC exercises use an intentionally unsupported member-write action and invalid ministry-verification inputs. They deliberately **do not create/edit member records, approve ministries, or upload private letters**. Storage evidence covers **listing only**, not `download()` file bytes, signed URL protection, positive private upload, or actual certificate rendering. The anonymous check covers the finance access API only. No revocation or unassigned-user session test is included.

**Disposition:** Signed three-role HTTP/authorization gate PASS at the recorded TEST preview. Continue to require independently verified private Storage transfer, revoked/unassigned sessions, admin CRUD/CSV/verification, Certificate Studio visual/persistence QA, and restored database/Auth/Storage/ACL rehearsal before production go/no-go. No account emails, passwords, session tokens, or private document paths are included in this report.

## TEST-only private-file byte-transfer QA protocol — 12 November 2026

A synthetic 1×1 PNG with no private ministry content is used in the existing private `member-documents` bucket under the reserved `release-qa/` namespace. The TEST bucket permits `image/png` (but not `text/plain`). Initial read-only preflight found no existing objects under that namespace.

1. In the current PR79 TEST preview, sign in as the **Registry Administrator**, open `/release-qa` and select **Create fixture and verify actual private download**. This uses the real JWT, creates the synthetic file only if absent (`upsert:false`), downloads and compares every byte, generates a 15-second signed URL and retrieves the same bytes. It also checks private-bucket public and anonymous-key URL denials. Record only the generated credential-free test summary.
2. Sign out, use **COWL Finance**, open the same QA page and select **Verify my private-file access is denied**. This tests direct `download()`, `createSignedUrl()`, and `upload()` denial against the synthetic fixture, plus anonymous and public URL denial. Record the summary.
3. Repeat for **Curia Finance**, preserving the same fixture. Do not delete the fixture until both financial roles have finished. A missing fixture may also yield a 404: a negative download alone is not sufficient unless the Registry positive test passed first.
4. Return as Registry, select **Remove synthetic QA files (after all three roles)**. This removes only three explicitly reserved QA filenames. Verify in TEST SQL `SELECT count(*) FROM storage.objects WHERE bucket_id='member-documents' AND name LIKE 'release-qa/%'` is zero after cleanup.
5. If any check fails or is inconclusive, **keep production NO-GO**. Review the QA error, RLS policies and Storage logs. Never send signed URLs, JWTs or credentials through chat. Do not test with real letters, ministry records or production accounts.

**Coverage:** Actual byte-for-byte TEST Storage upload/download, signed URL access, finance role denials, unauthenticated denials and cleanup. **Not covered:** certificate rendering, bulk historical Storage replication, revoked-session cache behavior, independent complete DB/Auth/Storage/ACL restore or real production migrations. Bucket privacy is verified by the current TEST Storage catalog.

## Recovery comparison inventory (read-only)

The repo includes `docs/sql/pr79-restore-inventory.READ-ONLY.sql`, which inventories counts of Auth accounts, Registry records, administrator allowlist, certificate metadata, RLS-enabled tables, RLS policy and security-RPC fingerprints, Storage buckets/object counts and principal table grants. It contains no personal names or file paths. Run against both a source and an isolated restored project after freeze, and compare **at the same snapshot time**. Hash parity does not prove private file bytes or Auth configuration were restored; validate those separately.

## Owner-submitted private Storage byte-transfer evidence — 12 November 2026

The project owner supplied **three credential-free reports** generated by `/release-qa` on the PR79 TEST preview using real TEST Auth sessions. This is *owner-submitted QA evidence*, not a replay of the owner's browser by the release operator. Transfer results total **17/17 PASS**, with an additional **1/1 PASS** for subsequent Registry cleanup; together with the preceding role authorization **33/33 PASS**, the QA cohort reported **51/51 PASS** across these checks.

| TEST role | Checks | Observed result |
|---|---:|---|
| Registry Administrator | 5/5 PASS | Auth identity confirmed; synthetic PNG private upload/download byte-for-byte; 15-second signed URL returned matching bytes; public and anonymous-key endpoints returned HTTP 400 |
| Curia Finance | 6/6 PASS | Auth identity confirmed; direct private file download, signed-URL creation and private upload denied; public and anonymous-key endpoints returned HTTP 400 |
| COWL Finance | 6/6 PASS | Identical denials to Curia, including private download, signed-URL creation and upload; public and anonymous-key endpoints returned HTTP 400 |

Read-only follow-up against TEST `storage.objects` showed one reserved QA object under `release-qa/`, the intended `synthetic-private-access-v1.png`, of 69 bytes; **zero** objects exist for the two deliberately denied financial upload names. This independently supports the expected retained TEST fixture and absence of unauthorized uploads. **Fixture cleanup completed and independently verified:** the owner submitted a Registry cleanup report with **1/1 PASS**, and a separate read-only TEST SQL query found **zero** remaining `release-qa/%` objects in `member-documents`. One pre-existing member-documents object remains; no actual ministry letter was removed. This closes synthetic Storage QA at **18/18 PASS**, bringing owner-submitted role-plus-transfer-plus-cleanup results to **51/51 PASS**. Sign in as the Registry TEST administrator and use **Remove synthetic QA files (after all three roles)**; then recheck the reserved `release-qa/%` inventory is zero. Do not delete real ministry Storage objects and never delete via raw SQL against `storage.objects`.

Remaining release gates: revoked and unassigned *real signed-session* denial; actual complete Auth/database/private Storage restore in a disposable isolated project; full Certificate Studio save/reload, print, QR, fonts/signatory validation; backend-first production migration; and live `main` reconciliation. The separate public certified URL policy (HTTP 400) is sufficient as an anonymous-denial observation, but it is not a substitute for recovery or 15-second signed-link expiry testing after expiration.

**Production remains unchanged; PR79 remains DRAFT/NO-GO.** This record contains no account emails, passwords, JWTs, signed URLs, or private document paths.

## Snapshot and restore (must be certified BEFORE a production migration)
1. Record authoritative production deployment ID, commit and domain aliases. Freeze the tested candidate SHA and reviewed SQL file checksums.
2. Use Supabase dashboard **Database > Backups** to verify actual recovery availability and a recent usable recovery point. Perform a **restore to a separate disposable project**, not a destructive in-place restore. Confirm table counts, Auth identity data and RLS/grants against a sensitive-data-safe inventory. Do not rely on SQL dump alone for Auth/session/config.
3. Separately copy **actual Storage bytes**, not just `storage.objects` rows, for `member-documents`, `certificate-templates`, and `public-assets` where present. Preserve bucket privacy and content-type, checksum file bytes, then test retrieval in the recovery project with authorised vs denied identities. Never mirror private letter bytes to public buckets.
4. Manually restore/check Auth configuration, email sender and redirect settings, API keys, Storage bucket config, rate limits, JWT signing settings (through supported Supabase procedures), edge functions, extensions and revocation/ACL. Never assume a cloned project retains these.
5. Independently mirror TEST's certificate artwork/fonts/signatures. TEST currently references read-only production public Storage URLs; confirm all 36 production certificate objects and the public asset as appropriate, with checksums, then rewrite TEST metadata references and test QR/font/CORS.
6. Time and record one disposable-project restore rehearsal: sign-in, Registry-only writer, COWL-only and Curia-only denial, anonymous denial, private Storage retrieve/upload denial, certificate save + reload + complete-quality print. Verify a second operator can repeat it.
7. Rollback strategy: previous Vercel deployment is a *frontend-only* fallback. Backward-compatible SQL migrations must retain old callers until smoke-tested. Never roll back the database using application promotion alone. Do not revoke legacy CRUD grants/v2 RPCs until caller inventory and new path are proven.
8. Both projects' Supabase security advisor reports leaked-password protection disabled; enable if plan supports it and rotate any credential exposed in screenshots. Review each `SECURITY DEFINER` function's internal `auth.uid()`/admin allowlist guard before accepting advisor exceptions.

## Production cutover — blocked until all gates pass
- Review, version and independently rehearse production-compatible writer v1, verification v3, hardened legacy v2 and certificate allocator migrations; verify exact schema parity and synthetic no-bypass cases under real signed Auth JWTs.
- Reconcile live `main` with release baseline; do not blindly merge stale PR55/PR78 or overwrite finance role-aware routing.
- Freeze checked HEAD, retrieve genuine prior production deployment and perform a production-only, owner-approved deployment sequence: **backup confirmed > backward-compatible DB migration > postflight > staged frontend > role/CRUD/Storage/Studio smoke test > explicitly approved domain promotion > observe > retire legacy grants**.
- If any gate fails, keep PR79 DRAFT and production unchanged.

## Recovery evidence checklist
| Gate | Evidence needed | Current |
|---|---|---|
| Signed three-role HTTP QA | Owner-provided results for Registry, Curia and COWL, each 11/11 | PASS — 33/33, exact TEST QA page |
| Revoked/unassigned, anon and cross-workspace HTTP | Role-specific 403/200, anonymous 401; separate unassigned/revoked sessions | PARTIAL — signed cross-workspace and anonymous denials PASS; revoked/unassigned not yet tested |
| Actual private Storage bytes | Registry 5/5, Curia 6/6, COWL 6/6 plus Registry cleanup 1/1; independently verified zero QA objects | PASS — 18/18 including cleanup; 51/51 combined with role authorization |
| Certificate Studio save, reload, print | Artifact snapshots + signatory/QR verification | PENDING |
| Backup and restore | Isolated restore, actual files, role/ACL restoration and timed rollback | PENDING |
| Production backend migration | Reviewed checksums and backend-first release decision | PENDING |
| Main/release reconciliation | Reviewed merge conflict resolution, exact SHA | PENDING |
