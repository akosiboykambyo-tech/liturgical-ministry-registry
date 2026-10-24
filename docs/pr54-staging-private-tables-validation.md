# PR #54 — Staging private tables verified (2026-10-24)

Applied isolated-only migration `pr54_staging_private_intake_tables` to project `rtptybxugjhvpfjvcvgw`. The executed SQL is versioned in `docs/sql/registration-staging-private-tables.ISOLATED-ONLY.sql` (not the production auto-migration directory).

Created `registry_private.registration_administrators`, `registry_private.registration_intake_requests`, and `registry_private.registration_intake_reviews`; added a foreign key from idempotency review IDs to review records. All three have RLS enabled and direct anon/authenticated table access revoked. The previously installed `registration_allowed_ministries` is also RLS-enabled with denied direct table access.

**Verified** through pg_catalog privilege queries: all four tables have RLS enabled; neither anon nor authenticated can SELECT; authenticated cannot INSERT directly. Rechecked fixture counts: 1,004 members; 4 assignments; 2 prior PR #53 request records; 3 prior review records.

**Not yet installed:** `public.registration_is_admin()` and `public.registration_intake_v1()`. Private administrator allowlist remains empty; no real staging role granted. Next steps require reviewing function ownership and executing role authorization tests before enabling the intake RPC. Do not apply the existing review-only transaction SQL unmodified: SQL/JS fuzzy parity and production UID trigger equivalence remain unresolved.

Production project was not modified. No records cleaned up.
