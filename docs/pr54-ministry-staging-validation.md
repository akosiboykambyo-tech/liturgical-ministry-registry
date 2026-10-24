# PR #54 ministry staging installation — 2026-10-24

Applied `pr54_isolated_canonical_ministries` to **isolated project `rtptybxugjhvpfjvcvgw` only**, using `docs/sql/registration-staging-ministries.ISOLATED-ONLY.sql`.

- Exact six names from `lib/constants.ts` were inserted into `registry_private.registration_allowed_ministries`.
- Table has RLS enabled, with direct anon/authenticated grants revoked.
- Read-back confirmed six entries, including full **Ministry of Lectors and Commentators** (no standalone Lector).
- Existing fictional fixtures unchanged: 1,004 members, 4 ministry assignments, 2 prior intake requests, 3 reviews.
- This does **not** validate or activate the draft atomic intake function. No production database changes.

Before applying transaction SQL, verify that private administrator authorization and intake persistence relations exist and are correctly owned/granted, then test failure/rollback and parallel cases in isolation. Do not move review SQL into deployable migrations yet.
