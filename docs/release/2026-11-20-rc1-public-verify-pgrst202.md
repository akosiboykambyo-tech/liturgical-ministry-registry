# RC1 TEST public verification failure — PGRST202

Date: 2026-11-20, Asia/Manila

## Operator symptom

On Preview `dpl_DPdk68dycXV39rirTBRhxzpjD9Ds`, operator reported **"verification unavailable"** when attempting public Registry verification.

## Root cause (confirmed in Preview runtime logs)

A `POST /api/verify` returned a 503 because the DB-backed request limiter could not find `public.check_verification_rate_limit(p_request_key text, p_max_requests integer, p_window_seconds integer)`. Supabase PostgREST error **PGRST202**. The handler appropriately fails closed, before attempting member search. Logs from this exact Preview showed repeated such requests. This problem is NOT caused by the new `GET /api/verify/certificate-design` endpoint or by the proposed system-settings privacy policy, which was never applied.

## TEST database evidence (read only)

- Table `public.verification_rate_limits`, primary key and `verification_rate_limits_window_idx` exist; RLS is enabled. Aggregate row count at diagnosis was zero.
- `public.check_verification_rate_limit` and `public.cleanup_verification_rate_limits` do **not** exist in `pg_proc`.
- Migration `202610150001_add_verification_rate_limiting.sql` exists in the repository but version `202610150001` is **not recorded** in TEST `supabase_migrations.schema_migrations`. Re-running the original file directly is not safe because its table creation is not idempotent.
- Preview branch-specific TEST Supabase URL, publishable key and server secret entries exist; credentials are never copied into documentation.

## Prepared repair, NOT executed

Restore ONLY the two RPC functions from the repository's original migration using `docs/sql/rc1-test-verification-rate-limit-restore.CANDIDATE.sql`. Restrict direct EXECUTE to `service_role`; `anon` and `authenticated` remain denied. Candidate checks the expected existing table and requires that functions are absent; does not change table RLS, schema grants, or `system_settings`. After applying to TEST in a preapproved change window, trigger PostgREST schema refresh and run a safe nonmatching-name HTTP smoke test. Additional test validates 429 at request threshold without using private member data.

Rollback candidate `docs/sql/rc1-test-verification-rate-limit-restore.ROLLBACK.sql` removes only restored functions. Rollback causes the original fail-closed verification outage; no member or finance rows are touched. Do not apply the settings-privacy RLS candidate until public verification and certificate display pass.

## Status / actions

- Public /verify acceptance: **FAILED / BLOCKED**.
- RPC restoration: **STAGED ONLY**, requires explicit TEST change approval; no database writes.
- Signed user authorization and release: **NOT CLEARED**.
- Production `cowl-dok.online` and `main`: unchanged.
