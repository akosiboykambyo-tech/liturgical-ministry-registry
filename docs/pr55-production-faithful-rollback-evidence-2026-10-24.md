# PR #55: Production-behavior staging validation — 2026-10-24

**Release decision: NO-GO.** This records what has been tested, what remains unproven, and what was not modified. PR #55 is staging-only and stays draft.

## Environment and verified preflight

- Production: Ministry-Database `zlvofcwnpdzfdnipvbbd`; **read-only catalog and aggregate inspection only**.
- Isolated staging: Ministry-Registry-Test `rtptybxugjhvpfjvcvgw`; tests performed within explicit SQL transactions ending `ROLLBACK`.
- Production at inspection: 7,971 members; 95 member names containing multibyte UTF-8 characters, **zero** names containing four-byte UTF-8 code points. No individual member names were exported.
- Staging: 1,008 members; 1,004 old synthetic UIDs do not follow production's randomized UID regex. We therefore added a production-style `CHECK ... NOT VALID` **inside the rolled-back test transaction only**, enforcing the UID rule for test inserts without rewriting fixtures.
- Staging had no production audit table/triggers or production functional name indexes, and its field lengths differed. These differences make the existing staging-only UID smoke test insufficient by itself.

## Production-function/constraint overlay test: PASS

The test transaction temporarily applied the following to isolated staging:

1. Production-compatible `varchar` widths and a new-row UID format check, the production ministry-status check, and both production functional/member unique indexes.
2. An audit table with the actual production column names/types.
3. The four function definitions obtained read-only from production: `assign_member_uid()`, `generate_member_uid(integer)`, `log_member_changes()`, and `log_member_ministry_changes()`.
4. The production member UID trigger and both production INSERT audit triggers.
5. The PR #55 candidate `registration_intake_v1`, the candidate review-resolution function, and a test-only injected ministry failure trigger.

Assertions executed successfully for all of these:
- New member received a production-format `LMD-2026-...` ID, `Pending Verification` status and no registration expiration date.
- Two `Pending Verification` ministry rows had NULL start, renewal and expiration dates.
- Member plus ministry creation generated exactly **three** expected production audit entries (one `INSERT`, two `Ministry Added`).
- Same-key replay returned the same member ID without extra audit entries.
- A similar surname with identical short first name opened a duplicate review; review dismissal produced an event in the private review-event table.
- Injected ministry insert failure rolled back its member and audit writes (no partial registration).
- An unauthorized identity was rejected with SQLSTATE `42501`.

The SQL transaction ended with `ROLLBACK`. A subsequent read-only query verified staging returned to 1,008 members, 12 member ministry rows, 8 intake keys, 4 review cases and 1 review event. Temporary audit table, trigger/function overlay and synthetic PR55 test records no longer existed.

## Identity normalization and SQL/JS parity

An additional rollback test with the updated PR #55 intake function verified:
- Leading tab and trailing newline in a submitted first name routed to review instead of creating a second member.
- Whitespace-only names were rejected (`22023`).
- Intake after **an in-transaction simulated administrator revocation** was rejected (`42501`), and the change was rolled back.
- Four-byte incoming UTF-8 code point was rejected (`22023`). If an existing member contains a four-byte UTF-8 code point, intake fails closed with `55000` rather than relying on a non-parity-certified fuzzy match.

The checked-in `docs/sql/registration-pr55-parity-fixtures.ISOLATED-READONLY.sql` passed **12 of 12** ordinary SQL/JS comparison cases when run against isolated staging. An intentionally documented supplementary-character edge case originally disagreed (JS UTF-16 vs PostgreSQL code-point Levenshtein), which is why the candidate now fails closed instead of claiming universal matching parity.

## Concurrent revocation: NOT VERIFIED

A two-call row-lock attempt did **not** demonstrate overlapping database sessions. A separate control using two concurrently requested three-second read-only SQL sleeps completed approximately 10.2 seconds after dispatch; the query completion times differed by about five seconds. The connector appears to serialize execution, so the contender's ability to UPDATE **cannot be interpreted as a failure of PostgreSQL `FOR SHARE`**.

A true test must use **two independent concurrent authenticated database/HTTP sessions**, with explicit synchronization and final state/audit assertions:
1. Authorized intake acquires `FOR SHARE` on its active administrator grant.
2. A distinct session attempts to revoke the grant before intake commits.
3. Verify one serial ordering: intake commits before revocation, or revocation commits before intake is admitted.
4. Verify there is no successful new intake following a completed revocation; repeat for review disposition, retry, and different-key races.

The present connector-run tests **do not satisfy this gate**.

## Remaining production blockers

- `fuzzystrmatch` is missing from production's `extensions` schema; only `pgcrypto` is present. A reviewed versioned migration and rollback plan are needed.
- Real two-session concurrency, HTTP JWT authenticity, revocation races, load and schema-drift tests remain outstanding.
- The isolated overlay is a transactional emulation of observed production schema, **not a full restored production database clone**. RLS/grant transitions, existing UI flows and service behavior need an environment-faithful integration test.
- Production private administrator allowlist, canonical ministry allowlist, intake RPC and review tables are not yet installed.
- Add Member/CSV remain disconnected; verification/renewal must establish the one-year registration validity **only when actually verified or renewed**.
- Do not merge or enable production registrations on this evidence alone.

**Production was not migrated, modified, or used for any registration write in this test.**
