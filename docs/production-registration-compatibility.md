# PR #54: Production backend compatibility gate

This branch starts **production architecture work**, independently of draft PR #53. **Nothing in this branch enables or performs registration.** The new pure authorization contract requires all of: explicit feature enablement, a server-verified Supabase user UUID, a positive administrator role decision from a **trusted database source**, and confirmed schema readiness. It has six offline unit tests.

## Repository-grounded compatibility findings
- `lib/types.ts`: `members` has `id` UUID, separate public `uid`, `first_name`, `last_name`, `parish`, `ministries`, `service_year`, `status`, `document_url`, `notes`, `expiration_date`, and timestamps. `member_ministries` references `member_id`, includes per-ministry status, start/renewal/expiration dates and documents.
- `supabase/migrations/202610150002_secure_registry_access.sql` is marked **prepared for review**, not confirmed deployed. It contains literal UID-based RLS policies and preserves direct browser INSERT permissions. This cannot be assumed to be the final secure write model.
- `supabase/migrations/202610150004_randomize_member_uids.sql` is also review-only; it locks registry tables, requires exactly **7,972** rows at the time of execution and rotates existing UIDs. **Never run it as a prerequisite for registration.** A new registration RPC must integrate with the *deployed* UID generator/trigger contract without rotating any existing IDs.
- `app/api/admin/sign-in/route.ts` has an existing lockout flow through `admin_login_begin` / `admin_login_finish`. A new registration endpoint should verify bearer tokens on the server and separately check active administrator access; login itself is not a substitute for per-request authorization.
- `lib/supabase/server.ts` uses an anon-key singleton and calls `auth.getUser()` without a request token. It must **not** be treated as sufficient to authenticate a registration request.

## Required before production activation
1. Confirm deployed schema/migrations, triggers, constraints, active RLS policies, and actual admin role storage via **read-only, explicitly approved production introspection** or a faithful staging clone. Do not infer deployment state from migration filenames.
2. Add private trusted administrator role/membership lookup with revocation policy; authenticate via `auth.getUser(token)` and enforce rights *inside* the transactional database operation.
3. Create a reviewed versioned migration for atomic member + multiple ministry inserts, full-name matching, idempotency fingerprints, persistent review cases, audit and UID allocation. Migrate only after environment gates and rollback procedures are reviewed.
4. Exercise the migration in a **schema-faithful** staging database, including different-key races, unique UID conflicts, forced rollback, grants/RLS/advisor checks.
5. Wire Add Member and CSV only after the production-compatible RPC passes that suite. Preserve verification/renewal lifecycle: Pending Verification upon intake; one-year validity begins on actual verification/renewal, not on initial submission.

PR #53 synthetic fixture cleanup remains deferred. Production Supabase project was **not accessed or modified** in preparing this branch.
