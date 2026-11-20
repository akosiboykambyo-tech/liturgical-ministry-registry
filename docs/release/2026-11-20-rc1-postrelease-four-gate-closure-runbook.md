# RC1 post-release closure — controlled operator runbook

**Prepared:** 2026-11-20 (Asia/Manila). **Target:** Production Supabase `Ministry-Database` (`zlvofcwnpdzfdnipvbbd`), production application `https://www.cowl-dok.online` at release SHA `967eb60eca0386a361b83b3f6f29bcf9d054f2df`.

**Status: TECHNICAL READ-ONLY REVIEW COMPLETE / OPERATIONS AND SIGN-OFF OPEN.**
This document is not an authorization to delete data, execute migrations, alter Auth settings or certify a backup. TEST project `rtptybxugjhvpfjvcvgw` is distinct from PROD. No TEST identities, role grants or fabricated member data may be imported into PROD.

## 1. Existing production member — operator classified as TEST ONLY

**Owner statement:** The sole PROD member was created only for testing and is **not** an authorized live member. This supersedes the earlier *unclassified* provenance, but not the need to safely remove its eligibility.

At read-only check: **1 PROD member, 2 ministry assignments, both `Renewed` and currently in date**; neither assignment has its document URL populated. Data should not be exposed as genuine current minister status. **Required disposition: retain evidence, mark both assignments and their parent Inactive, rather than hard-delete.**

**Before change:** Validate a complete private backup as in section 2. Have a named Registry Administrator confirm target member identity *in the authenticated admin interface* without posting identifiers or personal data to tickets/chat. Record pre-change aggregate state and audit event count privately. Do not confuse member record with Auth account: no evidence was found identifying it as a user sign-in account.

**Execute only after recovery gate:** Through an approved authenticated Registry Admin session use the guarded `registry_admin_member_write_v1('set_status', ...)` workflow, which expressly accepts `Inactive` and synchronizes the parent and child statuses, rather than hand-writing member rows. This operator flow is preferred over direct SQL or `delete`. Use the exact member ID obtained from the admin console, not guessed from a count.

**Postcondition:** The two assignments become `Inactive`, public /verify never returns a Registered result for the test UID, certificate issuance is denied, and the parent remains `Inactive`. Confirm audit rows were appended and prior audit rows preserved. Do not publish UID or QR screenshots. **Do not perform a physical delete as part of RC1 closure.** Production certificate downloads, FKs and linked objects may be affected by hard-delete; deletion requires a separate dependency-backed retention decision.

## 2. Mandatory recovery point — Supabase Free, no plan upgrade

The owner chose **Supabase Free**; no paid backup/PITR upgrade. The accepted route is an operator-controlled encrypted logical export and independent object-file backup. A connector-side query, a GitHub commit, a Vercel rollback, or a table inventory is **not** a database backup. There is no evidence that any recovery archive has been produced or verified during this review.

**Local operator checklist (credentials stay on operator machine):**

1. Check the current Supabase CLI help and version. Authenticate locally. Confirm linked project matches exactly `zlvofcwnpdzfdnipvbbd`; stop if it points to TEST. Keep all backup files outside the repository, build output, cloud logs and shared chats.
2. With the official CLI, export **roles**, **schema** and **data** into three timestamped files, using CLI flags verified via `supabase db dump --help`. Official procedure: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore . Check any Supabase-managed Auth/Storage exclusions; include custom functions, RLS, triggers, grants and Auth users/settings in the recovery inventory. Never presume the generic schema export covers all of them.
3. Independently download **all object bytes** from PROD Storage, not just database metadata, and create a manifest of bucket, relative object path, byte length, checksum, and backup timestamp. Earlier inventory: 36 `certificate-templates`, 1 `member-documents`, 1 `public-assets` = **38 total objects**. Preserve the original file bytes. The `member-documents` bucket must remain private.
4. Encrypt the exports and Storage files, keep a separate protected copy, record the responsible operator and retention schedule, and do not commit, email or upload secrets or backups into project tools.
5. Reconcile current PROD counts against the archive (refresh counts at export time): 1 member, 2 ministry assignments, 38 objects, 12 `system_settings` rows at last check. Verify readable archive, hashes, relevant Auth data, schema, grants, RLS and functions.
6. **Restore rehearsal** in an *isolated disposable environment*, NEVER in existing TEST or PROD. Verify a representative member/assignment lookup, restricted RLS, and retrieval of at least one independently restored Storage file. Record restore PASS/FAIL, operator, UTC timestamps and private artifact manifest location.
7. Only with completed recovery evidence may authorized personnel perform RC1 data deactivation or approved policy changes. Maintain recovery artifacts for a defined period.

**Failure condition:** If local CLI/docker, administrative DB access, encrypted storage, Auth data export or isolated restore target is unavailable, mark BACKUP **BLOCKED**, do not manufacture evidence and do not execute production mutations.

## 3. Security remediation

- Source inspection of the seven PROD authenticated-callable SECURITY DEFINER functions found guard-first active Registry-administrator checks (directly or via `check_renewal_admin_access`), with anon EXECUTE denied; **real signed-in negative tests are still required**, including a revoked Registry admin, ordinary signed-in user, COWL and Curia accounts.
- The five public RLS-enabled tables lacking policies and one private table can be intentional default-deny. Review access paths and service-role-only routes individually before adding any public policy.
- **Audit logs:** Current PROD `audit_logs` policies authorize by one JWT email via two overlapping ALL policies. TEST uses active `registration_is_admin()` SELECT. The candidate file `docs/sql/rc1-audit-log-allowlist-hardening.REVIEW-ONLY.sql` removes legacy policies, grants admin SELECT/INSERT only and revokes UPDATE/DELETE from `authenticated`. It is NOT yet tested/applied. Signed-user and trigger compatibility tests in isolated TEST are required.
- **Leaked-password protection:** Supabase advisor says disabled. Security owner must evaluate plan availability and enable via Auth Dashboard if available and authorized, then validate recovery/invitation behavior. No plan upgrade is authorized. Documentation: https://supabase.com/docs/guides/auth/password-security .
- Verify storage `member-documents` policies from real signed identities; policies currently require `registration_is_admin()`. Recheck short-lived signed URLs, session revocation behavior, and that unsigned requests fail. No private file URLs or JWTs in audit notes.

## 4. QA acceptance and release approval

**Already observed in production** on 2026-11-20: Vercel production deployment READY at SHA `967eb60`; canonical home, /verify, /privacy, /terms, /api/verify/certificate-design all HTTP 200; three QA-only routes 404; anon DB session sees 2 public settings, 0 certificate settings; no fatal/error records in checked 30-minute runtime window; 1 member/2 assignments/38 Storage objects. Earlier full TEST operator registration walkthrough was accepted.

**Not yet observed on PROD:** one legitimate signed-in Registry Admin browser workflow; genuine signed user authorization matrix for Registry/COWL/Curia/revoked; actual operator-managed backup and isolated restore; formal privacy/retention/data-protection review; post-deactivation public test UID and certificate denial; COWL and Curia finance stakeholder approvals. A 200 page response does **not** prove form submission, certificate quality or real authentication.

**Scope:** Registry plus Financial Stewardship **Phase 1 READ-ONLY**. No receipts, collections, ledger writes, remittance, payment QR or official finance transactions. No new OTP sign-in in RC1.

| Approval gate | Required evidence | Status |
|---|---|---|
| Registry data owner | Owner classification (TEST ONLY) and executed deactivation + public denial | Classification DONE / execution OPEN |
| Operations recovery | Encrypted roles+schema+data backup, 38 files, isolated restore | OPEN |
| Security/privacy | Real role tests, audited auth/RLS policies, DPO review | OPEN |
| Technical release | Verified production SHA and smoke | PASS for observed endpoints; interactive QA OPEN |
| COWL finance | Written read-only scope acceptance | OPEN |
| Curia finance | Written read-only scope acceptance | OPEN |
| Management | Named approver/date and explicit final RC1 acceptance | OPEN |

**Decision:** RC1 remains **deployed, technically smoke-verified, NOT formally accepted** until named owners supply missing evidence. Do not mark the four closure tasks Done simply because candidates are committed.
