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

### Certificate QA key-length correction — 12 November 2026

Owner's first genuine Registry session returned **3/4 PASS**: identity verified, the two original template records/default preserved, but synthetic record creation failed. TEST schema inspection identified `public.system_settings.key` as `character varying(50)`. The QA-only key joined a 31-character prefix with a 32-character UUID (63 characters); the database cannot store this. A rolled-back `authenticated` Registry simulation confirmed the original key raises string truncation, while a new 47-character key (the same 31-character prefix plus 16 UUID characters) inserts successfully. No real templates or signatories were changed, and no synthetic record remains.

PR79 now caps the synthetic key to 47 characters, asserts the length budget in CI, and reports only a safe database error code on insert failure. **Follow-up complete for Registry:** the owner reran the corrected 47-character-key TEST preview and submitted **7/7 PASS**, covering TEST signed identity, original template inventory, isolated create, update, independent reload, synthetic cleanup and preservation of existing designs. COWL/Curia denial tests with the corrected key remain pending. Production remains unchanged.

### Owner-submitted corrected Registry signed-session result — 12 November 2026

The owner submitted the complete credential-free report from the corrected TEST `/release-qa` Certificate Studio persistence panel. **Registry 7/7 PASS**: independently verified signed Auth identity; exactly two original certificate templates with 2027 renewal as default; creation of isolated synthetic non-default template; server-confirmed save; database reload of version 2; exact synthetic key deletion; original templates/default unaffected. These are browser-observed results supplied by the owner, not an independently captured browser trace.

A separate read-only post-run TEST database query confirmed: **0 synthetic `certificate_template_releaseqa_%` rows**, **2 original `certificate_template%` rows**, **1 default 2027 renewal**, **0 default 2026 renewal**, **8 signatories**, and **0 residual private Storage QA files**. No real certificate designs or signatories were changed during the test.

**Disposition:** Registry signed-session certificate *database persistence and cleanup* PASS. Still required: COWL and Curia real signed-session denial tests, full-resolution visual/QR/font/signature/print QA, isolated restore rehearsal, and production release gates.

## Certificate Studio safety rehearsal and real-session QA — 12 November 2026

- Read-only TEST preflight confirmed exactly **two** `certificate_template%` settings rows, one default (2027 renewal), **eight** signatories, and zero pre-existing `certificate_template_releaseqa_%` rows.
- Isolated TEST SQL simulations ran in **ROLLBACK-only** transactions. The Registry QA identity could INSERT, UPDATE, SELECT/reload, DELETE a synthetic non-default setting without affecting the real 2027 default. COWL and Curia QA identities were denied synthetic certificate settings INSERT by RLS. These establish DB/RLS behavior but not real signed HTTP.
- A separate **TEST-preview-only** `/release-qa` Certificate Studio persistence panel now uses the three real signed sessions. Registry creates a new synthetic, non-default `certificate_template_releaseqa_<test-user-id>` record, updates version 1 to 2, reloads and verifies it, then deletes only that exact synthetic key. COWL and Curia attempt an insert of their own synthetic key and must be denied. Every role checks that the two original templates and default remain untouched. No member record, original template artwork, or signatory is changed.
- The actual Certificate Studio page `/admin/certificates` still needs human visual verification of the **saved 2026 and 2027 renewal designs**, fonts/background images, signatories, QR placement, responsive editor layout, full-resolution print preview and print. The synthetic persistence check does not certify those behaviors.
- If any TEST check fails, leave PR79 DRAFT; inspect TEST certificate settings for only the `releaseqa` prefixed keys, and preserve all original saved templates.

## Owner-submitted COWL and Curia Certificate Studio denial evidence — 12 November 2026

The owner ran the corrected TEST-only `/release-qa` Certificate Studio persistence panel with each Finance viewer account, then supplied the complete credential-free reports. **COWL 4/4 PASS and Curia 4/4 PASS**. For each: TEST signed identity verified; original two saved templates and 2027 default confirmed; attempted synthetic certificate settings INSERT was denied; original templates/default were unaffected.

Combined with the previously recorded **Registry 7/7 PASS**, the certificate persistence/access cohort achieved **15/15 successful checks**. Together with previous role/Storage tests, this totals **66/66 successful checks across completed corrected TEST QA runs** (the earlier failed overlength-key trial was diagnosed and corrected, not counted as a pass). These are owner-submitted browser results, not an independently replayed browser trace.

A separate read-only TEST SQL check after these runs confirmed: **0 `certificate_template_releaseqa_%` synthetic keys**, **2 certificate template records**, **1 default 2027 renewal**, **8 signatories**, and **0 `member-documents/release-qa/%` Storage objects**. There is no evidence of a retained unauthorized write.

**Gate disposition:** signed-session certificate synthetic persistence and finance-denial authorization **PASS**. The full-resolution Certificate Studio visual preview / printable PDF, background assets, QR quality, font rendering, signatories, browser print, and save/reload of real design changes are **not** certified by these synthetic setting tests and remain on the release checklist. Unassigned/revoked signed sessions and recovery remain separate pending gates.

## Signed-session negative access: isolated TEST account protocol — 12 November 2026

**Baseline (read-only):** TEST Auth has five existing accounts, each with a Registry administrator assignment or at least one active financial role. There are **zero** unassigned identities and **zero** revoked financial grants. Existing QA Registry/COWL/Curia accounts must not be reassigned for this gate. Prior transaction-only SQL simulations verified expected unassigned/revoked RLS behavior; signed-session proof remains outstanding.

**Create one dedicated TEST-only account through Supabase Dashboard (not Production):**
1. Open the `Ministry-Registry-Test` project (`rtptybxugjhvpfjvcvgw`), then **Authentication → Users → Add user → Send invitation** to a unique email address the project owner controls. Do not send credentials or password-reset tokens through chat. Alternatively, the operator may use another supported dashboard account-creation path, preserving email confirmation. Never create Auth users by direct SQL against managed `auth.users`.
2. Do **not** provision any financial grant or Registry administrator allowlist entry initially. Use the TEST preview's `/admin` sign-in flow and navigate directly to `/release-qa`. The **Unassigned and revoked account verification** panel accepts only an identity that is not one of the five original TEST staff IDs. It uses `auth.getUser()`, current RLS grants, finance API, protected RPCs and private Storage listing. The only attempted write is a synthetic certificate INSERT that must be rejected by RLS.
3. Select **1. Unassigned**. All checks must PASS with no grant history, no Registry admin access, finance HTTP 403 for both workspaces, denied writer/v3 and certificate settings write.
4. After recording the unassigned report, the release operator can temporarily provision **only the dedicated account** with a single `cowl_financial_workspace_viewer` TEST grant. The intended grant must have an operator-authorized provenance record and a short expiration as a failsafe; verify with a read-only query that no existing account grants changed. **This is a separate operator action, not implemented by the QA browser page.** The owner should not share passwords or JWTs.
5. Without signing out, select **2. Granted** and verify COWL HTTP 200, Curia HTTP 403, and continued Registry denial. Capture the credential-free report.
6. The operator revokes that exact TEST grant, recording `revoked_at` and `revoked_by`, then verifies the dedicated account has **zero active grants**. Without signing out, select **3. Revoked** and confirm the previously working COWL API now responds **403** to the same signed-in account. Capture the report, and retain a read-only inventory proving all five original users retained their assignments.
7. Do not call this gate PASS until genuine signed-in reports confirm all three phases and a separate database query verifies the final revocation. If an unexpected certificate QA INSERT succeeds, stop immediately, quarantine the preview and use a Registry administrator to remove only the new `certificate_template_releaseqa_%` key, never the two original templates.

**Limit:** Supabase bearer tokens are JWTs; revoking refresh sessions alone does not necessarily invalidate previously issued access tokens. This gate verifies the app's *current database-grant-based authorization*, not global instantaneous token invalidation. No unrelated paid project, production credentials, or real member data is required.

## Auth status / password email presentation consistency — 12 November 2026

User screenshots showed the dedicated unassigned TEST account reaching **Role approval required** after successful sign-in, and the generic **Check your email** password-link request result. The first is the expected *unassigned presentation*, not a failed login or a completed role-API security test.

- `/admin/access-pending` now shares `AdminAuthShell` with sign-in, invitation and recovery pages: same responsive layout, branded coat, typography, status box, full-width buttons and help contact. The separate card and inconsistent button dimensions are gone.
- Distinguish **Role approval required** (signed in without an approved role) from **Access verification unavailable** (the permissions check failed). Neither state authorizes access or changes routing, Auth, grants or permissions.
- Both password-email result routes now share a single reusable `PasswordResetEmailConfirmation` without a standalone checkmark. Wording remains intentionally non-enumerating: email sending and account existence are not guaranteed by the confirmation view. The branded diocesan coat remains part of the canonical header, not a status icon.
- CI regression tests ensure both pages use the shared components and that no standalone status icons return. Visual review and unassigned role-API signed-session QA are still separate tasks. Production has not been changed.

## Unassigned live Auth results and temporary grant preflight — 12 November 2026

**Owner-reported signed-session Phase 1 (Unassigned): 10/10 PASS.** The dedicated newly invited TEST Auth identity passed TEST Auth server validation; had no grant history and no Registry admin permission; received HTTP **403** from financial-access, COWL inventory, and Curia inventory endpoints; was denied Registry member writes and ministry verification; could not list private Registry letters or insert isolated certificate settings. These are owner-submitted actual-browser results, not an independent replay.

Read-only TEST postflight established **six** TEST Auth accounts and exactly **one** newly created, signed-in, never-granted and non-Registry identity. No synthetic certificate settings remained. This closes the **unassigned** phase while the **granted** and **revoked** signed-session phases are still pending.

**Temporary, controlled TEST-only grant for Phase 2:**
- After checking the unique dedicated TEST account and all five original accounts, the operator inserted exactly one `cowl_financial_workspace_viewer` grant for the isolated QA identity. It uses `provisioning_method='operator_authorized_test'`, `granted_by=NULL` with explicit QA provenance, and a four-hour safety expiration on **2026-11-12 22:34 Asia/Manila**.
- Postflight SQL confirmed 6 Auth accounts; the 4 original finance grants untouched; exactly 1 active COWL viewer grant for the new QA account; zero extra roles; zero synthetic certificate keys. A rollback-only `authenticated` simulation for the dedicated identity confirmed a visible active COWL grant and no Registry/Curia assignment.
- **Phase 2 still awaits the owner's actual signed-session report** from `/release-qa` → `2. Granted — COWL viewer only`. The user should remain signed in as the same account and must not paste JWTs or passwords.
- Once Phase 2 is confirmed, the operator must revoke **only this new synthetic QA grant**, record revocation provenance, verify the original four grants unchanged, and have the owner run Phase 3 (**Revoked**) using the same signed-in session. Reaching the expiry automatically disables the permission check but **does not populate `revoked_at`**; an explicit revocation is required to complete the revoked-grant test.
- Neither the temporary grant nor the documentation authorizes changes to Production. PR79 remains DRAFT/NO-GO.

## Dedicated TEST account: granted 10/10, pre-revocation 7/10, revocation performed — 12 November 2026

**Phase 2 owner-submitted real signed-session QA:** **10/10 PASS** using the same isolated TEST account. Active COWL-only viewer role found; TEST Auth confirmed; Registry admin false; `/api/financial-stewardship/access` HTTP 200; COWL inventory HTTP 200; Curia inventory HTTP 403; Registry writer/verification, private Storage listing, and certificate settings changes denied.

**First Phase 3 attempt:** **7/10**, explicitly **not a failed revocation security guarantee**: the owner selected the `revoked` phase before the operator actually revoked the TEST database grant. The UI phase selector is not a grant mutation. Three expected failures (one grant-state assertion and two HTTP 403 comparisons) correctly observed the grant was still active; HTTP 200 was appropriate for an active COWL role. This premature trial must **not** be counted as a successful Phase 3 test.

**Operator revocation performed after receipt of the first Phase 3 report:** a tightly constrained TEST-only update applied `revoked_at` and `revoked_by` to **exactly one** new synthetic `cowl_financial_workspace_viewer` grant of the dedicated negative-access QA identity. The Registry TEST QA identity is used as a required `revoked_by` foreign-key *technical reference*, not evidence of a person's browser session; the `authorization_reference` notes the tool-mediated revocation on owner request. The four pre-existing finance grants were unchanged. Production was not accessed for mutation.

Independent read-only TEST postflight: **six** Auth identities; **zero** active grants on dedicated QA user; **one** revoked COWL viewer grant; **four** original finance grants still present; zero synthetic Certificate Studio keys or private Storage QA objects. Rollback-only authenticated identity simulation sees no active grants, one revoked grant, and no Registry-admin role.

**Phase 3 signed-session completed — 10/10 PASS:** the owner reran `/release-qa` → **3. Revoked** using the dedicated TEST account and supplied the complete credential-free report. TEST Auth confirmed identity; RLS-visible grants contained one revoked COWL grant and zero active grants; Registry administrator false; both the financial-access API and COWL inventory API returned **HTTP 403** (after returning HTTP 200 during the Granted phase); Curia API remained HTTP 403; Registry writer and ministry verification RPCs, private document listing and synthetic certificate settings writes remained denied. The previous 7/10 trial took place before the actual grant update and remains documented as a procedural failure, not included in the completed gate's successful-check total. The report demonstrates database-grant revocation for a real signed-in account; it does **not** prove immediate invalidation of Supabase JWT access tokens or cover all future authorization paths.

## Completed three-phase TEST negative-account authorization — 12 November 2026

The owner supplied the final **revoked-phase 10/10 PASS** report after the operator's exact-row TEST grant revocation. This completes **unassigned 10/10**, **granted COWL viewer 10/10**, and **revoked COWL viewer 10/10**, using real signed Auth sessions against TEST APIs. The decisive observed transition: financial access and COWL inventory **200 (granted) → 403 (revoked)**, while Curia remained **403** throughout and Registry operations, private Storage listing, and certificate template writes remained blocked. These are owner-submitted browser reports rather than an independently recorded HTTP trace.

Independent read-only postflight on `rtptybxugjhvpfjvcvgw`: **6 Auth accounts, 4 original finance grant rows, 0 active dedicated QA grants, 1 revoked dedicated COWL viewer grant, 0 dedicated Registry-admin assignments, 0 synthetic certificate rows, 2 original certificate templates, 8 signatories, 0 QA Storage files**.

**Count reconciliation:** Previously signed three-role account/finance 33 + synthetic private Storage/cleanup 18 + Certificate Studio persistence/denial 15 = **66** successfully completed checks. The additional three-phase negative-account tests contributed **30**, for **96/96 PASS across completed corrected TEST QA runs**. Do not count the initial overlong certificate QA 3/4 or premature revoked QA 7/10 as passed. Role revocation does not imply JWT/session revocation; a separate session-expiry or global sign-out exercise would be needed if that stronger property is required.

**Gate disposition:** role-based real-session unassigned / granted / revoked HTTP authorization is **PASS**. Remaining production release gates: independently reproducible isolated restoration of Auth/database/Storage/ACL with verified private bytes; full Certificate Studio visual/print/QR artifact evidence; production-compatible backend migrations and reconciled Git release/production SHAs. PR79 remains DRAFT/NO-GO. No Production migrations or promotions authorized.

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
| Revoked/unassigned, anon and cross-workspace HTTP | Owner-submitted signed TEST runs: unassigned 10/10, COWL granted 10/10, COWL revoked 10/10; COWL access changed 200 → 403, Curia remained 403; independent database postflight validated original grants preserved | PASS — three-phase role-grant authorization 30/30; unrelated JWT session invalidation not certified |
| Actual private Storage bytes | Registry 5/5, Curia 6/6, COWL 6/6 plus Registry cleanup 1/1; independently verified zero QA objects | PASS — 18/18 including cleanup; 51/51 combined with role authorization |
| Certificate Studio save, reload, print | 15/15 signed-session persistence/denial PASS; owner indicated visual/print review is acceptable but did not provide artifact-level evidence | PARTIAL — owner-acknowledged visual review; independently archived print/QR/font proof still pending |
| Backup and restore | Isolated restore, actual files, role/ACL restoration and timed rollback | PENDING |
| Production backend migration | Reviewed checksums and backend-first release decision | PENDING |
| Main/release reconciliation | Reviewed merge conflict resolution, exact SHA | PENDING |
