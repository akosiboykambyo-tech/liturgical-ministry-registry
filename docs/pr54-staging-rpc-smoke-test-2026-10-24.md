# PR #54 staging RPC milestone — 2026-10-24

**Only isolated test Supabase** `rtptybxugjhvpfjvcvgw`. No production access, no merge, and no removal of PR #53 fixtures.

## Applied
- `pr54_staging_registration_admin_self_check`: `public.registration_is_admin()` uses the private administrator allowlist. Anonymous EXECUTE revoked, authenticated EXECUTE granted. No active administrator seeded persistently.
- `pr54_staging_ungranted_intake_rpc`: `public.registration_intake_v1` installed against staging private tables. **Neither anon nor authenticated has EXECUTE permission.** It is not connected to any app route.

## Verified
- `registration_is_admin()` returns false without an authenticated caller; anonymous EXECUTE=false, authenticated EXECUTE=true.
- Registration intake EXECUTE=false for both anon and authenticated roles.
- Staging-only SQL transaction, with a temporary allowlist entry and simulated JWT subject, asserted create with two ministry assignments, same-key replay of that creation, and different-key duplicate review. Transaction ended with ROLLBACK, so it committed no fixture records.
- After rollback: 1,004 members; 4 ministry assignments; 0 PR #54 administrators; 0 PR #54 idempotency requests; 0 PR #54 reviews; prior PR #53 records still 2 requests and 3 reviews.

## Still required
This is *not* full production-ready validation. Fix remaining SQL/JS matching parity and edge cases, audit/review lifecycle, and internal SQL authorization and revocation behaviors; evaluate concurrency via authenticated HTTP with permission grants in isolated staging; check production schema, UID trigger, RLS and ownership against an approved read-only source; then design the production migration. Do not grant intake EXECUTE or enable the production feature yet.

## RLS note
`registry_test_private.intake_requests` remains RLS-disabled in the earlier PR #53 fixture; direct anon/authenticated table privileges were absent when inspected. Review further before any security remediation.
