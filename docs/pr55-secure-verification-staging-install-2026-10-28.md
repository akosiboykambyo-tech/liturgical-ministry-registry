# PR55 secure ministry verification — isolated staging install (2026-10-28)

This SQL is scoped to the **Ministry-Registry-Test** Supabase project, which has `status text` assignment columns, two Auth users, one active admin grant, and no production renewal batch table. The installer checks these conditions and refuses if they differ, including if the RPC already exists. **Do not paste this into the production SQL editor.**

- Creates `registry_verify_ministries_v1(uuid,uuid[],text)`, using the same RPC body already rollback-tested in PR55.
- Revokes `EXECUTE` for PUBLIC/anon and grants to authenticated; inside the function, an active private admin grant and row lock are mandatory.
- Grants SELECT on `member_ministries` only to authenticated, with an admin-only RLS policy, and adds an admin-only SELECT policy for `members`. Leaves direct member/ministry UPDATE privileges denied.
- Does not create letters or members; does not change status, dates, or certificates; does not enable the PR56 feature flag; does not install renewal-table constraints (staging lacks those tables).
- **Rollback (isolated staging only, explicit operator authorization):** revoke RPC EXECUTE; drop `public.registry_verify_ministries_v1(uuid,uuid[],text)`; drop policies `pr55_secure_admin_read_member_ministries` and `pr55_secure_admin_read_members`; restore the previous membership SELECT grant *if* no other legitimate staging process now depends on it. Do not run these steps in production.

### Acceptance tests
1. Independently verify installed function owner is `postgres`, SECDEF, `search_path=''`, and the exact authorized EXECUTE role.
2. Simulate authenticated database role with real staging admin UID and a different non-granted UID. Check selection restricted and one-year expiry. All test data changes inside `BEGIN...ROLLBACK`; no persisted fixture.
3. Real HTTP/PostgREST Auth/JWT tests for anonymous, admin and nonadmin, with no test credentials committed. These are separate from SQL claim simulation.
4. Confirm all 1008 members and 12 assignments remain, no fixtures remain, and no data permissions were accidentally widened.
5. Security advisor review and PR55/56 CI green.

**Staging installation is a test-only prerequisite, not approval to release.**

## Actual staging installation and verification

**Installed successfully** using Supabase migration `pr55_secure_ministry_verification_staging_20261028` on isolated project `rtptybxugjhvpfjvcvgw`. This is a **persistent staging migration**, unlike the earlier rollback-only smoke tests. Production was not modified.

Verified:
- `registry_verify_ministries_v1` exists, owner `postgres`, SECURITY DEFINER with grant `FOR SHARE`.
- Authenticated role may execute; `anon` and PUBLIC may not.
- Authenticated role can SELECT `member_ministries`, but may not directly UPDATE it; anon has no SELECT.
- Admin-only RLS policies exist for `members` and `member_ministries`.
- A transactional **SET LOCAL ROLE authenticated/anon** test with synthetic fixtures confirmed selected-ministry verification, other ministry remaining pending, one-year date, denial of direct UPDATE, denial of an ungranted authenticated identity, and anonymous execute denial.
- After test ROLLBACK, `members=1008`, `member_ministries=12`, no `PR55SECURITY` fixture member; the new RPC remains installed as intended.
- The Supabase advisor flags callable SECURITY DEFINER functions including this endpoint (expected: it is intentionally an authenticated RPC with mandatory per-call grant checks). Existing unrelated informational warnings include RLS-with-no-policy on restricted tables and leaked-password protection disabled in staging. Evaluate separately. Advisor documentation: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

### Real HTTP/JWT next gate

The role-level tests above are **not** real token issuance tests. Run `scripts/pr55-staging-verify-rpc-jwt.cjs` using the existing privately held staging administrator and nonadministrator Auth credentials and the staging publishable key. No credentials should be committed, printed or pasted into this PR. It uses *invalid RPC arguments* exclusively, so authentication and authorization can be distinguished without any registry member write. It also validates RLS read visibility.

Example PowerShell procedure (credentials must be set locally and cleared afterward):

```powershell
$env:PR55_ALLOW_VERIFY_JWT_PROBE = "I_ACCEPT_READONLY_STAGING_AUTH_TESTS"
# Set all of these privately through your operator secret workflow:
# PR55_STAGING_PUBLISHABLE_KEY, PR55_STAGING_AUTH_EMAIL,
# PR55_STAGING_AUTH_PASSWORD, PR55_STAGING_NONADMIN_AUTH_EMAIL,
# PR55_STAGING_NONADMIN_AUTH_PASSWORD
node scripts/pr55-staging-verify-rpc-jwt.cjs --validate-config
node scripts/pr55-staging-verify-rpc-jwt.cjs --run
```

Do not confuse HTTP/JWT denial tests with the separate positive valid-write rollback test or with a production GO decision.

### Blocking gaps

Staging does **not** contain the full production renewal batch/history schema. One-year renewal batch constraints and the replacement `check_renewal_admin_access` remain uninstalled. Production authorization/RLS and existing direct-edit paths still require a reviewed migration and coordinated UI rollout. The full backup-and-restore rehearsal remains uncertified.
