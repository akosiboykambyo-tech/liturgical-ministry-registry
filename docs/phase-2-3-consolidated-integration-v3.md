# Consolidated isolated integration — 2026-10-24

## Implemented in Ministry-Registry-Test only
- Added private RLS-enabled `registry_test_private.intake_reviews` to store incoming duplicate-review details, candidate member UUIDs, pending status, idempotency fingerprint, and creation timestamp.
- Added private `match_registration_name` with normalized case/whitespace, Levenshtein ratio >= 0.8 for names longer than 3, and digit-sequence comparison, consistent in broad intent with JS `areNamesSimilar`. Exact parity still requires a cross-language corpus, including Unicode/collation cases.
- Added `registry_test_private.atomic_registration_v3` and an authenticated-only `public.atomic_registration_v3` SECURITY INVOKER wrapper. The private transactional function checks the fictional authorized subject, takes one advisory transaction lock, validates canonical ministries, looks for replay by request UUID, scans all members as privileged definer, persists review atomically or inserts member and all ministry records atomically, and records an idempotency digest.
- API updated to `atomic_registration_v3` and accepts a `review` response **only** with a persisted review UUID. Feature flag and test-project hostname restrictions remain in place.
- Adjusted offline API response tests to expect durable review IDs.

## SQL checks actually run
- Existing fictional duplicate yields a newly persisted review ID inside the transaction.
- Repeat request key yields the same review ID; changed identity with same key raises an error.
- New fictional two-ministry registration succeeds; same-key retry replays the member UUID.
- All scenarios executed inside `BEGIN...ROLLBACK`; post-check counts: 1,002 members, 0 ministry assignments, 0 idempotency entries, **0 stored review entries** (no synthetic records retained).

## Not completed in this round
- Real HTTP requests authenticated with actual Supabase Auth test users; the test fixture has no prepared Auth administrator.
- Truly concurrent requests on two independent database sessions. Advisory transaction lock exists but has not been stress-tested under genuine parallel traffic.
- Full matching equivalence for accented names, Unicode, edge-length cases, and tie-breakers, as well as formal performance limits under full production-size data.
- Operator UI to list/resolve persisted review cases; table is deliberately non-exposed and directly locked down.
- Production schema and admin-policy migration/review; this is only a test fixture. The test SQL is **not** a deployable production migration.
- No local TypeScript, npm test or production build executed by assistant in this revision; user needs to run them.

Security advisor returned INFO `rls_enabled_no_policy` on four intentionally locked-down tables; see [Supabase lint documentation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Release decision
**NO GO.** Keep PR #53 draft and feature disabled. Do not redirect existing Add Member/CSV actions yet. The remaining real Auth HTTP, concurrency, review lifecycle, and production-compatible schema gates are essential.
