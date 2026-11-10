# PR55 — real JWT/Storage positive E2E final evidence (2026-10-29)

## Results actually observed

The operator ran the isolated-staging positive HTTP test with real Supabase Auth accounts:
- Administrator and non-administrator authenticated successfully.
- Non-administrator could not create a synthetic test member, inspect the synthetic ministry assignments, or upload a private PDF.
- Administrator created one test-only minister with **Ministry of Lectors and Commentators** and **Ministry of Liturgical Music**.
- Administrator uploaded a synthetic PDF over the real Supabase Storage API and attached it to the first assignment; attachment by itself left verification/expiration unchanged.
- Administrator verified only **Ministry of Lectors and Commentators** via `registry_verify_ministries_v1`, and the test confirmed the new expiration was one year from the Manila verification date. Ministry of Liturgical Music remained Pending Verification, and the member-wide summary remained Pending Verification.
- The first test's `.catch is not a function` JavaScript cleanup issue was fixed in commit `8614f99`. The operator executed `--cleanup-only` and received PASS for deleting the matching synthetic member, two assignments, and its PDF through the actual Storage API.
- Independently verified by direct **read-only** staging SQL: **1,008 members; 12 assignments (all Pending Verification); zero PR55E2E synthetic members; zero Storage objects**.

## Security follow-through

Two synthetic E2E-only, callable SECURITY DEFINER helpers (`pr55_e2e_begin_v1` / `pr55_e2e_finish_v1`) are no longer necessary. The guarded staging-only teardown in `docs/sql/pr55-staging-positive-e2e-teardown.ISOLATED-ONLY.sql` checks the exact baseline, zero objects, absent production renewal schema, and the presence of both real secure RPCs; it refuses if anything differs. Its two `DROP FUNCTION` operations use exact signatures and no CASCADE. The secure business RPCs stay intact.

This **closes the real HTTP positive verification/letter flow and synthetic cleanup gate**. It does NOT establish a frontend browser E2E, production renewal constraint correctness, legacy write-path closure, full backup/restore rehearsal, or approval to merge/deploy.

Production release remains **NO-GO**; both PRs remain draft.
