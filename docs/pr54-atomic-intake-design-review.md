# PR #54 atomic registration SQL review (2026-10-24)

A **non-deployable proposal** now exists at `docs/sql/registration-atomic-intake.PROPOSAL.sql`. It has **not** been applied to any Supabase project. Do not move it into `supabase/migrations` or grant EXECUTE until the blockers below are closed.

## Proposed transaction
A verified authenticated database caller must be an active administrator in the private allowlist. One transaction serializes concurrent intake; validates ministries; fingerprints request payloads; returns persisted idempotent replays; routes exact same-name identities (including different parish) to persistent review; otherwise inserts one member, every ministry assignment, and the idempotency record. Any exception rolls back the entire transaction. Initial member and all ministry statuses are `Pending Verification`, with no start or expiration dates.

## Blocking incompatibilities and decisions
1. **Not yet executable:** `registry_private.registration_allowed_ministries` is intentionally not created. The six canonical labels must be cross-checked against `lib/constants.ts`, with DB validation and aliases designed deliberately.
2. **Duplicate parity:** Currently exact normalized same-name matching only. The existing app detects similar names. Before use, port the fuzzy threshold and safeguards, test against corpus, and ensure no similarity path silently creates duplicates.
3. **Deployed schema:** Verify `uid` trigger, unique constraints, member/ministry column defaults/types, actual active RLS grants, `extensions.digest`, and function ownership against a schema-faithful staging copy. Literal `uid='PENDING'` assumes the existing client convention/trigger and is not a verified production guarantee.
4. **Admin policy:** Review private role lifecycle; restrict function EXECUTE to `authenticated` *only after* SQL authorization is confirmed. Establish audited grants/revocations and function owner permissions.
5. **Review queue and audit:** Approve/dismiss/attach workflow and audit records must precede user-facing intake. No live write route exists.
6. **Input checks:** Validate Unicode, payload size, canonical normalization, notes/document handling, optional fields, and exact fingerprints before deployment.
7. **Tests:** Run in a schema-faithful clone: malformed inputs; no admin; revoked admin; duplicate across parishes; similar name; same/different key races; replay after restart; transaction rollback on ministry failure; UID collision; account revocation race.
8. **Rollout:** Keep default disabled; never run on production before explicit approval, backup, dry run, and compatibility signoff.

The proposal is not a completed migration, and the existing Add Member / CSV code remains unchanged. PR #53 isolated fixtures are retained for controlled cleanup later.
