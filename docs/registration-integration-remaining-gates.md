# Remaining integration checks — 2026-10-24

## Code change in this revision

The test-only Next.js endpoint now **fails closed** (503) if the atomic SQL operation reports an unpersisted duplicate-review decision. Previously the API returned `ok: true` even though no review case was stored, risking an operator thinking the intake was saved. No production Add Member or CSV flow was altered.

## Not yet passed — release blockers

- **Real authenticated HTTP request** with a test Auth account and deployed API environment.
- **Parallel independent database sessions** asserting a same-person race yields at most one created member, one consistent duplicate review, and no orphaned assignment or idempotency record.
- **Consistent matching**: SQL `pg_trgm` vs JavaScript Levenshtein thresholds; harmonize before activation.
- **Persistent review case** and auditable source payload, candidate references, and disposition within the same transaction. An unpersisted `review` response is explicitly treated as unavailable by the API.
- **Idempotency binding** of source and claimant identity, plus full production authorization design.
- **Migration and schema verification** against a non-production clone of the real schema (test fixture is intentionally minimal).

## Operational limitation

Read-only SQL checks against the isolated Supabase project were blocked by the database connector during this round. Consequently, **no new live database concurrency or HTTP results are claimed**, and the preceding fixture count is not reasserted as freshly checked. Previously performed SQL rollback and idempotency tests remain documented in earlier PR files. Do not enable feature flags or merge as a release-ready registration backend.
