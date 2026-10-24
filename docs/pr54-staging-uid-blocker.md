# PR #54 — staging UID compatibility discovery, 2026-10-24

**Target:** isolated Supabase project `rtptybxugjhvpfjvcvgw`. Read-only catalog queries only; no migration was applied or data modified.

## Confirmed
- The simplified staging `public.members` table has **no non-internal triggers** in `pg_trigger`. In particular, there is **no UID-assignment trigger**.
- `public.members.uid` has **no default**. The proposed intake supplies a sentinel `PENDING`; without a trigger, that sentinel would be stored verbatim (or rejected by a uniqueness check).
- `public.members.id` and `public.member_ministries.id` default to `gen_random_uuid()`.
- `archived_documents` defaults to `'[]'::jsonb` on both tables.
- `fuzzystrmatch` and `pgcrypto` extensions exist in `extensions`.

## Immediate consequence
**Do not run the PR #54 atomic intake proposal as currently written.** It assumes a UID trigger which this isolated staging instance lacks. The repo contains a review-only randomized UID migration but that migration rotates existing records and includes a brittle row-count guard. It must not be applied simply to satisfy staging.

## Safe staging approach
1. Create an explicit, non-production staging-only UID generator with a trigger in a **separate, reviewed fixture migration**. It should generate a collision-resistant UID and not rewrite existing `members.uid` values.
2. Confirm whether production already has an active `BEFORE INSERT` trigger and the format it implements **using read-only approved introspection**. Adapt the final production SQL to that mechanism, not to a conjecture.
3. Complete the missing registration ministry allowlist with the exact six canonical names from `lib/constants.ts`, add explicit provenance tests, then stage the draft function.
4. Review function owner, grants, definer RLS bypass, exact-vs-fuzzy matching, audit and role revocation prior to staging enablement.
5. Preserve all 1,004 existing fictional members, four ministry rows, two intake requests and three reviews until specifically approved cleanup.

**No production database queries or writes were performed. No existing test fixtures were modified.**
