# PR55 verification/validity implementation and staging evidence — 2026-10-28

## Implementation included in this draft PR

- `docs/sql/pr55-atomic-verification-and-validity.REVIEW-ONLY.sql` is a **deliberately aborting, review-only** changeset. It does **not** run as a migration. It contains:
  1. Preconditions for an approved revocable `registry_private.registration_administrators` allowlist.
  2. `NOT VALID` exact-one-calendar-year constraints for newly written renewal batches and Renewed ministry rows.
  3. A proposed replacement for `public.check_renewal_admin_access()` that locks an active administrator grant `FOR SHARE` instead of trusting a fixed JWT email claim.
  4. `public.registry_verify_ministries_v1(member_id, membership_ids[], status)`: a SECURITY DEFINER RPC that authenticates and authorizes a revocable admin, locks the member and **only** explicitly selected assignments, rejects invalid/repeated approvals, stamps the database's Asia/Manila date and one-year expiry, and derives a conservative member-level compatibility summary. A pending unrelated ministry remains pending.
  5. Privilege revocation by default; **no EXECUTE grant for authenticated** until the separate production-activation approval.
- `tests/production-registration-atomic-verification.test.cjs` contains source-level regression guards. GitHub Actions typecheck and offline registration safety tests apply automatically.
- The proposal does **not** migrate or correct existing records. It does not replace the legacy UI approval handler, nor does it yet block all possible legacy direct writes. Production activation is not complete.

## Isolated staging test performed

On 2026-10-28, the new RPC body was installed inside a **single PostgreSQL transaction** against the isolated `Ministry-Registry-Test` project; the transaction was **ROLLED BACK** after validation.

Results:

- PASS: PL/pgSQL RPC compiled.
- PASS: New approval affects only the selected ministry assignment and sets one-year expiry from the server date.
- PASS: Second, unselected ministry stayed Pending Verification; the member-wide summary also remained Pending Verification.
- PASS: Reapproving the same New assignment was denied.
- PASS: Simulated unauthorized actor was denied with SQLSTATE 42501.
- PASS: Renewal after a synthetic recommendation-letter path updated only the selected assignment to Renewed with exact one-year expiration.
- PASS: 2028-02-29 + INTERVAL '1 year' equals 2029-02-28.
- PASS: after ROLLBACK, **1,008** staging members, **12** ministry assignments, **0** PR55SECURITY fixture members, **0** lingering `registry_verify_ministries_v1` definitions.

**This is a database rollback smoke test, not a real HTTP/JWT authorization test for the new RPC.** It must not be counted as authorization release proof. Existing PR55 dual-identity JWT tests cover a *different registration candidate*, not this verification endpoint.

## Mandatory gates before enabling

1. Securely install/seed the reviewed private admin allowlist **before** replacing the existing renewal administrator check; retain an explicit verified operator grant. An empty list would lock everyone out.
2. Inspect whether historical `Renewed` assignments or renewal batches violate exact-one-year constraints. `NOT VALID` avoids initial historical scanning but will still apply to updates of existing rows; assess the effect before activation.
3. Test RPC behavior against a **schema-faithful** isolated staging environment and real HTTP Auth JWTs for both a granted admin and a separate ungranted authenticated account, plus anonymous access. The current staging environment does not contain the production renewal batch tables; date constraints cannot be integration-tested there yet.
4. Replace old frontend member-wide quick-verify actions with **explicit per-ministry selection** and this new RPC (in the appropriate later frontend PR). Legacy direct admin edits and letter-upload paths must also obey the server-enforced invariant. Do not turn on the new interface while old bypasses remain.
5. Preserve the original `public.process_recommendation_renewal_batch` body and confirm it still works with the replacement access check. Rehearse concurrent grant revocation, audit triggers, partial failures and idempotent retry behavior.
6. Complete PR55's separate full-fidelity backup+restore and authorized migration/privilege/rollback/monitoring signoff before any production release.
7. Audit the Oct 27 `TEST_DATA_RESET` operation's authorization and intended scope; do not restore test data without explicit instruction.

**Decision: NO-GO for production.** Draft code and rollback smoke test are ready for review; no schema, grant, data, or production feature changes were persisted.
