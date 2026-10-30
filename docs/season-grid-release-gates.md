# Season-grid release gates (30 Oct 2026)

This branch is a guarded design/code candidate, NOT an operational or production release.

## Implemented in the candidate
- Extracted domain rules for partial approval, Held rows, coverage truncation, status precedence, and inactive/claim separation.
- Drafted additive private relational schema for seasons, batches, claims, row outcomes, review cases, access, letters, helpers and audit.
- Added a new season-grid interface and exceptions-first batch workspace.
- Wired the existing Verification homepage to the new component behind `NEXT_PUBLIC_SEASON_GRID_ENABLED=enabled`. **Default is OFF.**
- Added isolated domain rule tests.

## Not yet installed or enabled
- SQL proposal ends with ROLLBACK and **must never be run as a migration**. Approval requires PR #55 work on owner identities, private role/ACL/RLS, and privileged function grants.
- Secure RPCs `season_grid_overview_v1` and `season_batch_workspace_v1` do not yet exist. The frontend fails closed and makes no writes without them.
- The representative phone+code gateway, autosave, private letter upload, staff paper entry, helper verification, CSV processor reuse, review-case resolution, owner-only approval and receipt delivery require separately reviewed server endpoints and transactional SQL.
- Do not expose the private schema via PostgREST or grant table SELECT/INSERT/UPDATE to anon/authenticated. Owner-only authorization must be enforced inside every RPC; client-side session check is NOT sufficient.
- New parish-affiliation/assignment history model is required before transfer cases can safely affect parish-scoped membership. Existing members.parish is member-level.
- Public status function currently prioritizes expiry over an explicit Inactive decision; requires a compatibility-tested fix before enabling.
- Review duplicate, late-add, consent, purpose/retention, deceased case privacy/audit, access-code rate limits, lockouts, and notification records.
- Database review must define deterministic per-batch and per-roster-row idempotency keys and transaction atomicity. Approved row manifests must be reproducible after partial approvals; no direct browser DB mutations.
- Open cases carry forward; deferred cases require reason and review-by. Follow-up alone does not close a No response. Only owner may approve or defer highly sensitive cases.
- Shared letter: one private document per parish-ministry batch; representative uploads by default, staff fallback, owner review before partial/full approval except documented owner override.
- Admin export is optional; parish receipt only after Reviewed and scoped to one parish/ministry, never divulging deceased/transfer case reasons.
- Run typecheck, lint, build, tests, end-to-end role/denial tests and realistic migration/rollback rehearsal in an authorized isolated environment.
- Preserve current legacy workflows until parity is demonstrated. Do not merge PR #55/#56 or activate production flags from this branch.

## Deployment rule
NO production or Preview exposure of functional representative features before the database controls are approved and tested.
