# PR #54 isolated staging UID execution — 2026-10-24

Only Supabase project `rtptybxugjhvpfjvcvgw` was modified.

- Applied migration `pr54_isolated_staging_uid_insert_trigger` from `docs/sql/registration-staging-uid.ISOLATED-ONLY.sql`.
- Installed `registration_staging_assign_uid` as a BEFORE INSERT trigger on `public.members`.
- Generator uses cryptographically random bytes, excludes ambiguous letters from the 12-character suffix and preserves the provided service year.
- Verified actual trigger through `pg_trigger`.
- A transaction inserted a fictional 2026 member using the `PENDING` sentinel; returned generated `LMD-2026-EY8B-AHRC-8QHX` and `Pending Verification`. The entire transaction was **rolled back**.
- Staging fixture is **not** evidence that production has this trigger or accepts this UID format; production compatibility remains an open blocker.
- Existing PR #53 fictional fixtures remain scheduled for later controlled cleanup. No production changes or PR merges.
