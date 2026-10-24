# PR #53 — verified HTTP integration and merge decision (2026-10-24)

## User-run HTTP result
`PASS: invalid token, same-key replay, different-key race, conflict, duplicate review`.
Test reference: `37e0bdfd-f8da-4016-9d7c-dbc943a2038b`.

## Confirmed independently in isolated test database
Before HTTP run: 1,002 fictional members, 0 ministry assignments, 0 idempotency records, 0 review cases.
After HTTP run: **1,004 members, 4 ministry assignments, 2 idempotency records, 3 review cases**.
The count changes are consistent with two fictional two-ministry creations and three review outcomes. They do not by themselves prove record-level linkage, so retain the HTTP results as the primary execution evidence.

## Controlled cleanup — DEFERRED as requested
**Do not remove these records now.** When cleanup is authorized, first enumerate the synthetic records tied to test reference `37e0bdfd-f8da-4016-9d7c-dbc943a2038b`, inspect their member IDs, associated assignments, idempotency keys and review cases, and confirm that no unrelated training fixture rows match. Run a reversible/dry-run selection and capture exact IDs before a transactional, test-project-only deletion, then verify the original counts. Do not use broad name prefixes or delete arbitrary rows.

## Merge decision
**NO-GO for production-ready backend.** This branch is a *test-only integration foundation*, not a production schema migration:
- API hardcodes and requires the isolated project hostname and explicit test feature configuration.
- SQL v3 exists in the isolated database and is not versioned as a production-compatible migration in this PR.
- SQL authorization remains a single test user UID; production administrator roles, expiration/revocation, and review permissions need design.
- Existing Add Member and CSV still invoke their legacy client registration operations.
- Persistent review storage exists but no production-ready operator queue, disposition, audit lifecycle or source upload handling.
- Full JS/database fuzzy-matching parity and production-schema compatibility not signed off.
- HTTP concurrency smoke test passed once, but comprehensive stress/failure testing and full integration coverage remain pending.

A merge **only as explicitly test-only, disabled groundwork** might be considered after code review and CI verification, but should not be described as a finished backend, nor should it be deployed with test feature flags enabled. Safest: leave draft until the production architecture and migration are separated and reviewed.
