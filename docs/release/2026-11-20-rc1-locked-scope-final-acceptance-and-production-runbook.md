# COWL-DOK RC1 — locked scope, two final acceptance checkpoints and controlled release plan

**Decision date:** 20 November 2026 (Asia/Manila)  
**Release candidate:** Draft PR #88, `integration/rc1-role-aware-secure-registry-20261119` → `release/cowl-dok-rc0-consolidation-20261119` (NOT directly to `main`).  
**Production website:** `https://cowl-dok.online`; existing deployed `main` commit at plan creation `7b6521cc4abe5508c0a77d040e5677540c35bad3`.  
**TEST Supabase:** `Ministry-Registry-Test` / `rtptybxugjhvpfjvcvgw`.  
**PROD Supabase:** `Ministry-Database` / `zlvofcwnpdzfdnipvbbd`.  
**Approval status:** PLAN PREPARED, RC1 RELEASE **NO-GO** pending the two acceptance checkpoints and a separate explicit production approval. No merge, production migration, production environment edit, or production deployment is authorized by this plan.

## 1. Final, fixed RC1 product boundary

**Included in RC1**
- Public liturgical minister search and verification, with correct assignment-level registration validity and the published certificate experience.
- Registry Administrator workflows for member creation, ministry assignment, private recommendation-letter attachment, document-backed verification, certificate viewing, and role-protected Registry administration.
- Previously accepted Registry privacy protection, secure authentication/routing and private `member-documents` permissions.
- **Financial Stewardship Phase 1: role-aware, READ-ONLY interface/navigation** for approved COWL and Curia staff. This is an informational/design-stage portal; **it is not a live ledger or financial reporting product**. Roles may view approved workspace screens but no money, official receipt stock or remittance is recorded through the released UI.

**Explicitly deferred to a separate financial release**
- QR payments, OTC collection posting, funds reconciliation, fee schedule approvals, official receipt creation/printing, receipt-stock issuance or physical custody, COWL remittance submission, Curia finance confirmation, live finance ledgers, and financial Storage evidence workflows.
- Their synthetic/rolled-back SQL tests are engineering evidence only; never present those as operational signoff.
- `fs-private` object-level Storage testing is deferred while the bucket has **zero objects and no authenticated Storage object-access policy**. Preserve the private-deny-by-default boundary. Reopen this gate **before any live financial file workflow is activated**, not as a blocker for the read-only RC1 portal.

**RC1 will not add OTP/mobile login**, new payment features, extra dashboards or further exploratory security rounds unless a checkpoint uncovers a release-blocking defect. Do not broaden the scope without a new, approved change request.

## 2. Previously accepted evidence — reuse; do not rerun entire matrix

- Four genuine browser JWT personas (Registry Administrator, COWL finance viewer, Curia finance viewer, revoked/no-active-role): **57 PASS, 0 FAIL, 9 INCONCLUSIVE**. The inconclusives were deliberate/Storage metadata-only.
- One synthetic private `member-documents` object tested across the same four signed-user personas and anonymous caller: **24 PASS, 0 FAIL, 4 INCONCLUSIVE**, the four inconclusives related only to `fs-private`. TEST Storage returned to **one original member-document object and zero QA objects**.
- Public verification and certificate display with signatures passed post-TEST privacy policy; TEST's narrow `system_settings` RLS checks passed.
- TEST transaction-only Registry registration/duplicate handling, audit events, and fictional financial lifecycle passed with `ROLLBACK`, no persistent synthetic finance records/grants.
- Last verified RC1 Preview at planning time: READY on `ce09f1585571d9b1b9e05dd6aa0460cb8f529b3c`. The source has a 73-test automated prebuild suite; do not claim this test number for a later SHA without its own build result.

**No further broad persona matrix is required by default.** Any regression after a code or backend change should be narrowly retested where affected.

## 3. Acceptance checkpoint 1 — ONE operator-led Registry browser journey (TEST only)

**Goal:** A Registry Administrator proves that the actual application supports a complete document-backed registration through public verification. **Method:** one clearly synthetic member with a unique name and a synthetic letter; no real parish/member identity or production files. Existing TEST data is populated and must not be disturbed.

**Mandatory precondition / known blocker:** `lib/secure-ministry-verification.ts` requires `NEXT_PUBLIC_SECURE_MINISTRY_VERIFICATION=enabled`. A Vercel metadata-only check at plan creation found this flag for two older preview branches, **but no RC1-specific override and no unscoped value**. Do not assume RC1's secure Verification UI is active. Before the journey, obtain approval to set the flag **on RC1 TEST Preview only**, rebuild the Preview from pinned SHA, confirm the secure assignment-level UI appears at `/admin/verify` and the guarded `registry_verify_ministries_v3` RPC/Storage policy are present. Do not enable this flag in PROD yet. This is a build-time public environment setting, not a secret.

**One UAT journey**
1. Registry Administrator signs into the latest RC1 TEST Preview at `/admin`; record the **tested SHA**, test date and operator (internally; not in chat).
2. Open `/admin/members/add`; register **one uniquely named fictional member** in a clearly synthetic parish with **one approved canonical ministry** and valid service year. Save the test member ID/UID privately. Expected: member/assignment created, starts **Pending Verification**; no automatic activation.
3. Open `/admin/verify` secure assignment-level workflow for this test member, select its exact ministry assignment and upload a **small synthetic PDF/PNG letter** visibly marked `TEST ONLY — NOT A VALID RECOMMENDATION`. It must be stored privately under `member-documents` via the supported immutable `attachments/` workflow; no real letters used.
4. Open and inspect that attachment through the authorized **short-lived signed link**. Choose the documented effective date (today in Manila; no future date), explicitly mark that one ministry as reviewed, and complete the `New` verification. Expected: only the selected assignment changes from Pending Verification to New; effective/expiry dates reflect the project's **one-calendar-year validity rule**. No other Registry member or ministry is changed.
5. Open TEST `/verify` and look up the synthetic UID; expected registered result during validity, correct approved ministry, certificate background, signatories, QR and public display, with no private letter accessible from the public page. Capture a sanitized PASS/FAIL summary (no member names, IDs, private letters or signed links in PR).
6. Review resulting database assignment and audit metadata using only this tracked synthetic ID. **Clean up under an explicitly approved, dependency-aware procedure** that accounts for immutable attachment references and audit preservation, and verify no orphan private file/extra active synthetic member remains. If deletion would corrupt audit/foreign keys, quarantine as an access-restricted labeled TEST fixture and record that exception before closeout; do not delete historical audit events blindly.

**PASS criteria:** All six steps completed once, correct per-ministry dates and public certificate, no private document leak, no unexpected changes, and controlled test-fixture disposition. **FAIL / STOP:** unavailable secure UI/RPC, missing upload/letter access, bad status/validity, public exposure of a private letter, or untracked persistent fixture.

**Evidence / owner:** Registry Administrator and Registry owner validate one sanitized results summary. Do not add CSV/renewal/OTP/finance transaction cases to this checkpoint; those have independent test evidence or are out of RC1 scope.

## 4. Acceptance checkpoint 2 — production readiness and formal GO/NO-GO review

This is **one operational review**, not dozens of unrelated new functional tests. The release owner records a single signed checklist with the following mandatory gates:

**A. Scope and source freeze**
- Confirm the application still labels Financial Stewardship as **read-only / Phase 1 interface**, with no transaction mutation UI, ledger/QR settlement or operational receipt controls. Finance access remains bearer-token + RLS-grant checked; Registry access never grants finance rights implicitly.
- Remove temporary `/rc1-qa`, `/rc1-storage-qa`, other Preview-only QA UI/artifacts from the **production-bound build**, even though existing routes are preview- and TEST-gated. Do not remove them before Checkpoint 1 if still needed. Keep non-executable test evidence in release documentation if desired.
- Identify the exact approved Git SHA and compare release/base changes to **current `main`**. PR #88 currently targets `release/cowl-dok-rc0-consolidation-20261119`; reconcile remaining main-only changes before creating a **separate reviewed release-to-main PR**. No direct, unreviewed PR #88 → PROD promotion.

**B. Production data and security preflight — READ ONLY until separate migration approval**
- Record current PROD schema/RPC/signature/grant/RLS/storage/Auth configuration and compare to TEST dependencies **without querying personal row contents or decrypting credentials**. Migration filenames alone do not prove PROD parity.
- Confirm rate-limiter RPC exists before releasing a fail-closed public verification route; confirm `registry_verify_ministries_v3`, letter-attachment RPC and Storage policies can support the secure UI before enabling the PROD flag.
- Prepare and peer-review exact, ordered, **production-specific** migration scripts and rollback/forward-fix strategy. TEST's previously applied `system_settings` privacy SQL is not evidence of PROD application. Preserve public certificate design via the scoped server endpoint: **deploy compatible application code before tightening PROD settings reads**; recheck public certificate after the RLS change.
- Document decision on TEST's public certificate assets currently pointing to public PROD Storage URLs: mirror the TEST assets or explicitly accept this **public asset dependency**; do not describe it as production database access.
- Review Auth password policy, including leaked-password protection warning, and document security-owner disposition. Do not invent a PASS. Confirm server-only credentials never appear in client bundles.

**C. Recovery and ownership**
- Verify a timestamped **restorable** recovery point appropriate to the change: PROD Postgres tables/schema/ACL/RLS and Auth metadata, plus separate Storage objects. Identify actual backup method, owner, recovery point and restoration exercise/evidence; don't assume a Vercel rollback restores the database.
- Confirm rollback authority, change window, post-cutover monitoring owner and acceptable recovery/data-loss targets. Use the pinned **pre-release Vercel production deployment and SHA** for app rollback.
- **Coupled rollback warning:** Once PROD `system_settings` reads are tightened, reverting to an older app version that directly reads private settings may break certificate rendering. Preferred recovery is a compatible app fix-forward; any emergency broad-policy restoration must require privacy/security approval and explicitly acknowledge temporary exposure. Do not unconditionally run SQL rollback.
- Production operations must be separately approved; this plan **does not** authorize PROD writes, migrations, env changes, DNS changes or a merge.

**D. Decision**
- **GO only if:** Checkpoint 1 PASS; approved scope/diff and build PASS on pinned release SHA; backend migration order and rollback method reviewed; backup and Storage recovery evidence acceptable; security findings disposition recorded; Registry owner, technical/deployment owner, and read-only Finance stakeholder sign off; management grants explicit production authorization.
- Otherwise **NO-GO** with one named blocker/owner and a narrow retest after remediation. Synthetic finance operational signoff and `fs-private` positive object download are explicitly **deferred**, not hidden.

## 5. Release-day sequence — ONLY after a recorded GO

**Before cutover**
1. Freeze a specific release SHA; rerun existing automated suite/typecheck/build against **that exact SHA** and inspect its Preview (no new test feature creation). Confirm QA-only UI removed from production-bound code.
2. Record PROD deployment SHA/domain assignment, production schema policy inventory and tested backup/recovery point. Compare RC schema dependencies and prepare exact numbered/approved DB migrations.
3. Assign accountable operator, incident contact, rollback authority and cutover window. Announce maintenance only if operationally required.

**Backend / application / privacy sequence**
4. Apply only **approved dependency migrations** required before the new code (e.g. missing verification rate-limit functions, secure Registry RPC/Storage permissions), validate through read-only role/signature checks. No TEST-only restore script run verbatim on PROD.
5. Set verified production environment settings with owner approval, including `NEXT_PUBLIC_SECURE_MINISTRY_VERIFICATION=enabled` **only after secure backend support is verified**, and rebuild the production-bound artifact. `PRODUCTION_REGISTRATION_STAGING_ENABLED` remains OFF in PROD; no Preview TEST service-role credentials are promoted.
6. Deploy the pinned compatible Registry/read-only Finance application to the approved production target; smoke-check public home, nonmatching public verify, one owner-approved existing public Registry record/certificate, admin sign-in and Registry path, and COWL/Curia **read-only** routing. Never use TEST credentials against PROD.
7. Apply the separately approved, compatible **PROD settings privacy policy** only after the scoped `/api/verify/certificate-design` endpoint has been observed working. Immediately recheck certificate output and admin settings access. Any deployment requiring a different order must be separately justified and approved.
8. Watch errors for Auth, registration RPCs, Storage and public verification; monitor for unintended finance writes. Obtain release owner confirmation.

**Rollback trigger / response**
- Trigger **stop and incident review** on public verification failure, broken certificate, Registry permissions leakage, inability to sign in, failed dependency migrations, unexpected financial transactions, or missing recovery capability.
- Freeze additional changes; choose a **compatible application rollback/fix-forward** considering applied DB policy compatibility. Restore data only from approved independently tested backup when required; do not automatically undo restrictive privacy RLS or overwrite live production records. Record incident and re-approval before resuming.

## 6. Final decision register

| Decision | Status at plan creation |
|---|---|
| RC1 Registry + Phase 1 read-only Financial Stewardship | **CONFIRMED by project owner** |
| Live financial operations/financial Storage workflows | **DEFERRED** to separate release |
| Prior JWT roles and Registry private Storage checks | **ACCEPTED (TEST)** |
| Positive Registry browser/doc/verification walkthrough | **CHECKPOINT 1 — OPEN** |
| Branch-specific secure ministry verification flag in RC1 TEST Preview | **NOT FOUND in metadata; requires Preview-only enablement and rebuild** |
| Production backups/schema/rollout/diff/approvals | **CHECKPOINT 2 — OPEN** |
| TEST public assets referencing PROD public Storage | **OPEN owner classification/disposition** |
| Merge, PROD environment change, PROD DB migration or deployment | **NOT AUTHORIZED; NO-GO** |

**Next action:** Approve/configure **Preview-only** secure-verification flag and run **one** documented Registry UAT journey. Then convene **one** production-readiness/go-no-go review. Do not reopen full financial transaction testing for this RC1 scope.
