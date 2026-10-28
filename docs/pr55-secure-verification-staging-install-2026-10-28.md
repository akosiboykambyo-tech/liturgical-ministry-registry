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
