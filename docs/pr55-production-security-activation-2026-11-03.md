# PR #55 — production security activation record, 3 November 2026

**Actual state:** selective production security hardening installed and independently inspected. This is NOT a declaration that all PR #55 release gates are complete. PR remains draft; do not merge or enable PR #56/#57 feature flags until outstanding tests are satisfied.

## Applied Supabase production migrations

Live project: `Ministry-Database` (PostgreSQL 17). The following migrations were applied via Supabase's versioned migration API. Names and versions below match the database migration history:

| Version | Migration | Verification |
|---|---|---|
| 20261103014255 | pr55_remove_public_audit_trigger_execute | anon/authenticated EXECUTE denied; existing trigger still enabled |
| 20261103014332 | pr55_private_admin_allowlist_foundation | private RLS table, no direct anon/authenticated reads |
| 20261103014349 | pr55_seed_verified_current_administrator | exactly one authorized, confirmed existing Auth user; identity not committed to GitHub |
| 20261103014501 | pr55_replace_fixed_email_renewal_admin_check | active revocable administrator check, `FOR SHARE`, no JWT-email match |
| 20261103014836 | pr55_harden_existing_renewal_batch_rpc | same 8-argument signature; future dates, non-one-year dates, unverified/out-of-scope/duplicate selections denied |
| 20261103014935 | pr55_enforce_one_calendar_year_for_changed_validity | annual assignment trigger enabled; two annual batch/history constraints present |
| 20261103015038 | pr55_active_admin_rls_and_renewal_history_least_privilege | registered admin policies control members, assignments and private renewal-history reads |
| 20261103015211 | pr55_replace_fixed_email_storage_policies | all eight certificate/member-doc policies use active administrator check |
| 20261103015254 | pr55_owner_scoped_ministry_verification_rpc | selected assignments only, database Manila date, letter and active-admin guard |
| 20261103015328 | pr55_private_ministry_letter_attachment_rpc | upload must exist in private bucket and match pending selected assignment; no approval/renewal as side effect |

The actual migration bodies are in `supabase_migrations.schema_migrations` on the live project and in the reviewed SQL proposals. The administrator seed is intentionally not a literal public source-controlled Auth ID, email or token. **Do not re-run any of these migrations manually or replay a proposal's deliberate NO-GO guard.**

## Positive checks completed

- Active allowlist count 1; matching confirmed production Auth identity count 1. No ordinary authenticated or anonymous user can SELECT the allowlist.
- Synthetic transaction-scoped JWT-subject tests: active administrator permitted, ungranted identity denied. This is a **database/RLS test, not a real independent HTTP/JWT login test**.
- Transaction-scoped `SET LOCAL ROLE authenticated` tests: current administrator saw 1 member, 2 assignments and 37 Storage objects; ungranted identity saw zero rows in each.
- Audit-trigger EXECUTE false for anon and authenticated; `service_role` retains execute; trigger enabled.
- All eight Storage policies are allowlist-based; zero remaining fixed-email Storage policies; all 37 metadata objects remain.
- Hardened renewal RPC retains the exact signature, checks one-year dates and input scope; 0 existing historical renewal batches.
- Annual validity trigger enabled; both history date constraints installed; 0 existing Renewed-date mismatches.
- Verification/letter RPCs require the allowlist, cannot be called by anon, and do not automatically modify unrelated assignments.
- Member count remained 1 and assignment count 2 after every activation. No member or Storage records were deliberately changed.
- PR55 GitHub Actions offline registration release gates passed at commit `540f9fc`.

## Intentionally preserved functionality and remaining release gates

1. **Legacy direct writes not yet removed.** `authenticated` still has its prior registry write grants, limited to the active administrator by the new RLS policy. Do not revoke these until equivalent secured member Add/Edit/Delete/CSV paths are implemented and tested. The restricted renewal-history tables are already read-only for ordinary authenticated clients; the hardened renewal RPC writes history.
2. **Real Auth and Storage service recovery certification remains open.** Existing October 30 protected offline PG17 DB restore and all 37 real Storage blob hash checks are strong backup evidence. They do not prove Supabase Auth sign-in/session functionality, Storage service policy recovery, or faithful PostgreSQL role/ACL restoration. A disconnected encrypted backup copy was reported independently in project work; do not re-run backup acquisition just to repeat already successful hash checks.
3. **Live independent HTTP/JWT and frontend role tests** are still needed for verified admin, separate ungranted account and anonymous session, including email reset, login/logout, revocation, certificate upload, per-ministry verification, and safe renewal.
4. **Leaked-password protection** remains disabled in Supabase Auth; no connected tool currently exposes changing this setting. It needs an authorized Supabase dashboard configuration change and confirmation.
5. **Future-dated historical Renewed record** requires evidence review; do not rewrite, revoke or silently extend it. Existing ministry-level letter links also require authorized coverage confirmation; do not pretend a shared legacy file proves per-ministry coverage.
6. **PR55/PR56/PR57 code integration** is still needed. In particular the new season-grid submission and approval server transactions must be completed before removing legacy direct registry writes. Production feature flags remain OFF.
7. **Final release:** run positive/negative real HTTP tests, Auth/Storage restore and role/ACL rehearsal, frontend end-to-end QA, dated rollback procedure and a controlled merge/deploy. Existing mainline admin workflows must continue to function through the cutover.

## Current security advisors

Remaining production WARN findings include approved administrator-authenticated `SECURITY DEFINER` entry points (expected in a guarded owner-only RPC architecture; each function still requires code/role review) and disabled leaked-password protection. RLS-enabled-no-policy INFO findings include intentionally private or deny-by-default tables and must not be blindly 'fixed' by public policies.

**Do not label PR #55 Done or production release GO until the independent Auth/Storage and legacy CRUD cutover gates are fulfilled.**
