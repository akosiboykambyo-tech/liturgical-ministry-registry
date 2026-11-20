# COWL-DOK — RC1 production readiness and management approval brief

**Prepared:** 20 November 2026 (Asia/Manila)  
**Release scope:** Liturgical Ministry Registry plus **Financial Stewardship Phase 1 read-only interface**  
**Change owner:** To be appointed by management  
**Status:** **DRAFT / NO-GO** — management decision not yet granted; no production action is authorized by this document.

> This is the final **production-readiness review** following the accepted Registry TEST walkthrough. It does not ask for another broad Registry user-acceptance campaign. Any fixes are subject to focused retest.

**GitHub review track:** [Draft PR #89 — RC1 → main](https://github.com/akosiboykambyo-tech/liturgical-ministry-registry/pull/89), opened for conflict/diff review only. It is not mergeable at the initial snapshot and must not be merged before the main-only commits are reconciled and this checklist is signed. [Draft PR #88](https://github.com/akosiboykambyo-tech/liturgical-ministry-registry/pull/88) remains the original RC0-targeted integration review.

## Executive decision requested

Authorize an RC1 launch **only after** the technical, privacy, recovery and management conditions below are satisfied. RC1 lets Registry Administrators register and verify actual liturgical ministers and lets approved COWL/Curia finance roles view a read-only Phase 1 workspace. **Do not describe finance as a live ledger, collections, official receipts or remittance system.** All transaction/custody capabilities remain deferred.

### Owner-approved starting data policy

- The 1,009 original TEST member names are **fictional**. The original real-world database was deleted. No TEST record, Auth account, ministry assignment, private letter, certificate, audit event or role grant is an approved source of live Registry data.
- The owner **approves beginning live operations without a historical Registry import**, followed by gradual authenticated intake of real ministers by Registry Administrators. A clean/empty end-user register is the target operating model, **not** permission to wipe the database.
- As of the read-only inspection, the existing Production database already holds **one member with two ministry assignments**, plus 38 Storage objects, other Auth/configuration records and 2 finance role grants. Its legitimacy is **unclassified**. The responsible owner must review its provenance and explicitly retain it, deactivate it, or authorize a separately reviewed, backup-backed, dependency-aware cleanup. Do not label it fictional or remove it based on counts.
- A public empty state for name/UID verification is acceptable until real records are registered. No synthetic results may appear as live ministers.

## Accepted product evidence (do not retest without a defect)

- **Final one-person TEST Registry walkthrough** accepted by operator: create the fictional `RC1Test Walkthrough`, attach/review synthetic private recommendation letter, select and verify one `Ministry of Lectors and Commentators` assignment, and verify public UID/certificate, signatory artwork and QR.
- Independent TEST DB validation confirmed `New` assignment dates **2026-11-20 → 2027-11-20**, private letter and certificate-download evidence.
- With explicit owner approval, a guarded TEST administrative RPC marked that one fictional member and assignment **Inactive**, preserving private letter and audit/certificate history. TEST totals remain **1,010 members**, **2 private member documents**, with **zero active assignments** for that fictional member. No TEST population goes to Production.
- Prior role authorization evidence: **57 PASS / 0 FAIL / 9 INCONCLUSIVE** under four signed TEST roles; Storage security **24 PASS / 0 FAIL / 4 INCONCLUSIVE**. Storage inconclusives concern the empty deferred finance-private bucket and do not authorize its loosening.
- RC1 remains **TEST acceptance complete**, **PROD release pending**. Avoid calling a prior test suite green on the eventual release SHA without rerunning the existing suite/build for that exact SHA.

## Production-readiness blockers and disposition

| Gate | Evidence / required closure | Owner | Status |
|---|---|---|---|
| Code convergence | Existing Draft PR #88 targets `release/cowl-dok-rc0-consolidation-20261119`, **not** `main`. At inspection `main...integration/rc1-role-aware-secure-registry-20261119` diverged, integration ahead **167** commits and behind **2**. Review both main-only commits and reconcile conflicts; open a **separate reviewed release-to-main PR**. Freeze exact release SHA; do not bypass review. | Technical lead | OPEN |
| QA-only route exclusion | **Source removal completed:** all 9 TEST-only files under `app/rc1-qa`, `app/rc1-storage-qa`, and `app/release-qa` removed from production-bound branch. Two source-contract tests updated to assert absence and retain real private-letter/auth guard checks. Non-executable prior test evidence retained in docs. Final build route inventory still pending. | Technical lead | SOURCE DONE / BUILD PENDING |
| Verified build | Run the existing prebuild tests, `npm run typecheck`, and `npm run build` on the **final candidate SHA** (not the older acceptance SHA). Release code must not import removed QA modules. | Technical lead | OPEN |
| Registry RPC parity | At inspection PROD has `registration_is_admin` and `registry_attach_ministry_letters_v2`, but **lacks** `public.registry_admin_member_write_v1`, `public.registry_verify_ministries_v3`, and the private helper `registry_private.registry_sync_member_mirror_v1`. Prepare reviewed production-compatible migration(s) and verify dependencies, grants, column/constraint and trigger parity **before** enabling secure Registry UI. Do not copy TEST migrations unexamined. | DB/security lead | BLOCKER |
| Production schema compatibility | Both environments have core Registry columns, but PROD still has some `varchar` column types/nullable fields and no TEST mirror/audit helper; TEST carries test-only triggers and datasets. Review production-specific function definitions, status invariants, code paths, audit triggers, dependent tables, storage permissions and the `member-documents` private bucket without importing TEST-only staging schema. | DB/security lead | OPEN |
| Public verification limiter | PROD already exposes `check_verification_rate_limit(text,integer,integer)`; verify its service-role access and expected result contract. The route fails closed if this or its secret is absent. | DB/security lead | PARTIAL |
| `system_settings` privacy | An actual **read-only PROD `SET LOCAL ROLE anon`** check returned **12/12 visible system-settings rows**, including **9 certificate/template/signature settings** (counts only; no values retrieved). PROD has anon `USING true`. TEST uses public-site-key-only anon policy plus Registry-admin read. First release/verify the compatible scoped `/api/verify/certificate-design` endpoint, **then** apply separately approved narrow PROD RLS; test public certificates/admin settings immediately. Do **not** revert to broadly public settings on an emergency rollback without privacy-owner consent. | Privacy/DB lead | BLOCKER |
| Authentication/security | PROD advisor snapshot has **5** authenticated SECURITY DEFINER executable-function warnings (review body guards), **1** leaked-password protection warning, plus **6** INFO RLS-enabled/no-policy findings (some may be intentionally default-deny). Security owner records disposition. Service-role keys remain server-only; TEST credentials never move to PROD. | Security owner | OPEN |
| Finance Phase 1 | Role-aware read-only workspace and approved COWL/Curia access only; no receipts, batch issuance, ledger, payment QR, collection, remittance, reconciliation or mutations. PROD `fs-private` bucket is absent and is **not an RC1 dependency** under this boundary. | Finance representatives | OPEN SIGNOFF |
| Member & storage data | Confirm the one current PROD member/two assignments are correctly classified; preserve existing 38 Storage objects unless specifically reconciled. Approve whether PROD's existing role grants are correctly authorized. No TEST member or user data migration. | Registry/data owner | OPEN |
| Recovery — **Supabase Free plan, no paid upgrade** | Project owner declines Pro/PITR: use **free manual logical exports** (roles/schema/data) with Supabase CLI, **independent Storage object downloads** (existing PROD inventory 38 objects) and saved Auth/provider settings inventory. Safeguard encrypted/off-site copies, timestamp + checksums, and validate a restore in an isolated environment before migrating. These manual recovery artifacts replace any assumption of paid provider backups. Vercel rollback does **not** reverse schema or Storage writes. No backup artifacts are yet confirmed. | Operations owner | MANUAL FREE-PLAN BACKUP NOT YET VERIFIED |
| Management decision | Registry owner, technical/deployment owner, privacy/security owner and COWL/Curia read-only finance stakeholder review all above and give an explicit **GO/NO-GO for production** tied to a frozen SHA and change window. | Management | PENDING |

Supabase security guidance for assessment:
- SECURITY DEFINER: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- Password leak protection: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Approved no-upgrade backup policy — Supabase Free plan

**Owner decision (20 November 2026):** Remain on **Supabase Free**. Do **not** purchase Pro or PITR solely to satisfy the RC1 release. A manual, secure and tested logical backup is an acceptable pre-change safeguard. Supabase Free offers no automatic daily backup or point-in-time recovery; its documented alternative is the Supabase CLI `db dump`. Official guidance: https://supabase.com/kb/faqs/platform/free-plan-backups and https://supabase.com/docs/guides/platform/backups .

**Operational preflight (not executed here; local access to PROD database is required):**

1. Verify the connection target is **PROD `zlvofcwnpdzfdnipvbbd`**, not TEST `rtptybxugjhvpfjvcvgw`. Use the Supabase CLI/Docker on the owner's computer and authenticated connection from the PROD Dashboard; **never send a database connection string, password, token or SQL dump into GitHub, Trello, a chat, or the public web**.
2. Following the vendor's [Backup and Restore using CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) procedure, export **roles**, **schema**, and **data** to separate timestamped files. Typical commands after `supabase link --project-ref zlvofcwnpdzfdnipvbbd`: `supabase db dump --linked -f roles.sql --role-only`, `supabase db dump --linked -f schema.sql`, and `supabase db dump --linked -f data.sql --use-copy --data-only -x storage.buckets_vectors -x storage.vector_indexes`. Validate CLI version/required flags and exact project scope before running. CLI schema export can omit Supabase-managed `auth` and `storage` schemas; preserve any custom auth/storage triggers and RLS separately. Check that required auth-related data was actually exported rather than assuming it.
3. **Storage backup is separate.** Inventory all existing PROD Storage buckets and objects; earlier read-only count was **38 objects total**. Download the actual files from the Supabase Dashboard Storage browser or official `supabase storage` CLI commands/S3-compatible client, with manifest by bucket/path and counts. The database dump's Storage metadata alone cannot recreate lost objects. Official method: https://supabase.com/docs/guides/storage/management/download-objects .
4. Keep sensitive files in a **private encrypted** backup folder outside the deploy/repository tree; make at least one independently controlled/offsite copy. Include UTC timestamp, manifest/checksums, backup operator, version and retrieval instructions; exclude API secrets from documentation. Separately inventory Supabase Auth provider/redirect/password-policy settings and Vercel environment-variable *names* (not plaintext secret values).
5. Verify the backup archive can be opened, contains roles/schema/data, and matches non-identifying PROD pre-export inventory counts (**1 member, 2 assignment rows, 38 Storage objects** at last observation; refresh at backup time). Perform a documented **restore rehearsal in a local/isolated test Postgres/Supabase environment** where feasible, including application-specific schema/RLS, functions and representative file retrieval. Do not restore into existing PROD or overwrite original files. The owner must accept the residual risk of manual backup timing and record the recovery operator.
6. Only after this free-tier backup evidence, production-specific migration peer review, admin/privacy security disposition, existing PROD member classification and other release gates are satisfied should the approved change window proceed.

**Explicitly not required:** Paid Supabase plan, PITR subscription, automated daily backups as a condition of this RC1 launch. **Still required:** evidence of one viable manual recovery point **before any destructive/irreversible production migration** and practical recovery for both database and stored objects.

## Review-only migration plan — **not an executable production authorization**

1. **Preflight and backup:** Use read-only inventory (see accompanying `2026-11-20-rc1-preprod-read-only-checks.sql`). Identify current approved PROD data, compare function definitions—not just names—verify reference keys and recipient role grants, record recovery points.
2. **Prepare on a disposable production-shaped test clone, not the existing TEST dataset:** Confirm compatibility of missing `registry_private.registry_sync_member_mirror_v1`, `public.registry_admin_member_write_v1`, `public.registry_verify_ministries_v3` and every dependent function, table, helper, grant, Storage policy, status invariant and audit trigger. Copying a TEST SQL function into PROD without checking **every** dependency is forbidden. Determine exact ordered, idempotent, reviewed SQL plus explicit regression assertions.
3. **Pre-application PROD dependencies (only after separate GO and backup):** Apply the minimal reviewed guarded Registry functions and other required supporting schema/grants; confirm role-restricted behavior without leaking member data. Do **not** seed TEST fixture users, ministries or data.
4. **Deploy the pinned compatible app:** With production-only server secrets and security-owner approval, enable `NEXT_PUBLIC_SECURE_MINISTRY_VERIFICATION=enabled` for PROD only **after** the guarded backend and private letters work. The Next.js public certificate route must work before any tighter certificate settings RLS.
5. **Privacy RLS in its own approved, reversible step:** Remove public full-table read of `system_settings` and replace with only expressly public keys; maintain guarded administrator settings reads and publisher endpoint. Recheck certificates and admin settings. Roll back with a compatible fix-forward strategy, not an automatic broad settings disclosure.
6. **Limited release smoke and monitor:** Public home/search/empty-state, owner-approved public certificate if one exists, one authorized Registry login and member intake path (without test data creation on PROD), COWL/Curia read-only routing, privacy leak check, no finance writes. Watch Auth, verification, Storage, app/server errors; stop on leaks or public certificate regression.

## Formal sign-off — fill in actual names and dates, do not auto-approve

| Role | Reviewer / date | Decision |
|---|---|---|
| Registry functional/data owner | __________________ | □ GO □ NO-GO |
| Technical / deployment owner | __________________ | □ GO □ NO-GO |
| Security / privacy owner | __________________ | □ GO □ NO-GO |
| COWL Finance read-only representative | __________________ | □ GO □ NO-GO |
| Curia Finance read-only representative | __________________ | □ GO □ NO-GO |
| Management authorization | __________________ | □ GO □ NO-GO |

**Release SHA:** __________________  
**PROD backup ID + timestamp:** __________________  
**Storage recovery reference:** __________________  
**Deployment window and rollback commander:** __________________  
**Disposition of existing PROD member & two assignments:** __________________  
**PROD security findings disposition:** __________________

**Default decision while blank: NO-GO.** The project owner's approval to start with an empty/no-backfill Registry and instruction to proceed with *preparation* is **not** a substitute for this completed production release approval.

## Decisions and open questions

**Settled:** RC1 Registry + read-only finance; TEST acceptance complete; synthetic TEST records excluded from PROD; fresh real Registry intake after launch; TEST fixture retained inactive; no live financial transactions in RC1.

**Open:** existing PROD member disposition; final reconciled code SHA; exact PROD guarded RPC/policy migrations; PROD security warning disposition; backup/restore proof; named owner sign-offs and management GO.

**Related source:** `docs/release/2026-11-20-rc1-locked-scope-final-acceptance-and-production-runbook.md`; Draft PR #88 https://github.com/akosiboykambyo-tech/liturgical-ministry-registry/pull/88.
