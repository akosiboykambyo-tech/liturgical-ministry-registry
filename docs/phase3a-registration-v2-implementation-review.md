# Phase 3A — Registration Intake v2 implementation review

**Status:** DRAFT FOR OWNER/SECURITY REVIEW — code only; no SQL has been executed.  
**Branch:** \`feature/registration-intake-v2-sql-review-20261119\`  
**Base:** \`feature/atomic-intake-adapter-review-20261119\`  
**Scope:** existing Add Member / CSV registration only. No UI rewrite, no new backend service, no changes to Finance, Curia, certificate verification or ministry renewal.

## Deliverables

1. \`docs/sql/registration-intake-v2.REVIEW-ONLY.sql\`: concrete, versioned PostgreSQL DDL/function proposal. **Starts with an unconditional RAISE EXCEPTION; do not remove it or run SQL without separate explicit approval.** This is not under \`supabase/migrations/\` and must not be treated as a migration.
2. \`tests/registration-intake-v2-sql-contract.test.cjs\`: **offline static** review checks; they do not parse or execute PostgreSQL SQL, call any network or prove concurrency/JWT security.
3. \`lib/registration-csv-source-key.ts\`: proposed deterministic source identity helper; not connected to UI.
4. \`.github/workflows/reconciliation-validation.yml\`: runs the existing registration tests plus these static checks, TypeScript and Next build; no database or deployment commands.
5. Branch-scoped \`vercel.json\`: disables Vercel Git deployments **only for this review branch**. Do not merge this config blindly into the production branch.

## Backend behavior proposed by the v2 SQL

- New \`public.registration_intake_v2\` (v1 remains intact) with existing identity/ministry/year arguments plus \`p_notes\`, \`p_source\`, \`p_source_key\`.
- Live \`auth.uid()\` must match an active, non-revoked row in \`registry_private.registration_administrators\` before any replay, lookup or mutation. Function is \`SECURITY DEFINER\` with an empty search path; execute explicitly revoked from PUBLIC/anon and granted to authenticated.
- Canonical approved ministries, registration years 2000–2100, identity field lengths and 4,000-character note limit are checked inside SQL, not just in the browser.
- The request fingerprint includes **notes and source identity** as well as normalized name, parish, canonical sorted ministry set and year. Same request UUID and actor + same fingerprint returns original outcome; changed fingerprint/actor fails closed.
- v1 and v2 share a transaction-scoped advisory lock. A full-registry matching query runs inside that lock. A candidate always creates a persistent review case, no new UID; successful unique registration atomically persists member, per-ministry Pending Verification assignments, notes and ledger entry.
- Candidate count covers all matches; case stores up to 20 deterministically ordered IDs plus a truncated flag. The first candidate is populated into the legacy \`existing_member_id\` field **only for compatibility**, never as a confirmed same-person decision.
- The registry UID must be produced by the database's existing before-insert UID generator. Missing, blank or PENDING UID makes the transaction fail/roll back.
- Existing private review tables are extended; no parallel duplicate queue. Ordinary signed-in users are not granted direct DML on these private tables.
- The file intentionally **does not** alter \`registry_admin_member_write_v1\`. Its \`create\`/\`create_batch\` actions remain a release blocker until cutover.

## Straightforward CSV retry identity default

Use this exact proposed form:

\`\`\`text
sha256:<lowercase-64-character-file-SHA256>:row:<one-based-physical-first-data-row>
\`\`\`

Examples in pseudocode, not real file hashes:
- File SHA-256 \`abc...\` and first physical record at CSV line 2 => \`sha256:abc...:row:2\`
- If lines 2 and 7 are one logical person with two ministries, use line **2** as the group's stable identity, retaining source line references in import diagnostics.

Rules:
- Calculate the hash from the exact original file bytes, before normalization or sorting.
- Header is physical row 1. The helper rejects row 1 as a data row. The importer must distinguish multiline quoted CSV cells from physical line numbers and define a stable original-source-row index before activation.
- Do not include names, emails, or parish text in the key.
- Generate one random request UUID for each logical group and keep it in an import retry manifest. A retry must reuse that UUID; if the manifest was lost, **stop and reconcile by server-held source key** instead of producing a new UUID. The unique (actor, source_key) index is defense in depth.
- A different file hash is a different import source; matching still prevents a duplicate UID. Uploading the same file under another admin identity is not silently assumed to be the same request.

**Still to decide in UI implementation:** where the retry manifest lives, how safely to resume after refresh, and whether the CSV parser's row index is physical or logical when fields contain embedded newlines. Do not claim full CSV resume support at Phase 3A.

## Straightforward same-name exception default

1. Any exact same full name (including a different parish), or fuzzy candidate under the reviewed matching rules, creates a **pending private review**; v2 creates no second UID.
2. The reviewer examines all candidate records, confirms that the people are genuinely different using appropriate parish evidence, and records a decision reason (proposal: 20–1,000 characters). If evidence is insufficient, leave the case pending.
3. **No direct "Keep separate" call to legacy \`create\`.** A follow-on, separately reviewed administrator-only **one-time review-resolution RPC** must lock the case and the same global intake decision lock, recheck identity and permissions, persist audit actor/reason, create the separate member only when explicitly authorized and mark the case resolved in the same transaction.
4. Existing \`registration_resolve_review_v1('approved')\` is **not** authorization to create a new UID. Approval currently only records a review disposition; do not repurpose it or imply it merges memberships.
5. A truncated candidate list, ambiguous supporting evidence or repeated review attempts requires escalation; no silent approval.
6. The exception resolver is intentionally **not implemented in this Phase 3A SQL draft**. That remains an explicit release gate and must be designed/tested before enabling the new Add Member or CSV flow.

This is a human-reviewed exception, not a policy of treating every same-name match as one person or automatically creating a different-person UID.

## Important compatibility and migration assumptions to verify

- Compare actual TEST schema and function definitions against the proposed DDL before creating a real migration. In particular: column defaults, NOT NULL, existing check constraint names, UID assignment trigger, private review table permissions, \`extensions.digest\` and \`extensions.levenshtein\`.
- The review-only SQL uses additive columns on the existing private intake ledger/review tables; legacy v1 rows receive \`source='individual'\` by default. Older v1 fingerprints are intentionally **not** treated as v2 fingerprints.
- The SQL assumes no existing v2 columns/indexes; a real migration must be generated through the official migration workflow, reviewed and checked against real schemas and migration history.
- SQL static tests do not establish that PostgreSQL will parse the proposed statements. Syntax certification, index behavior and transaction semantics require a separately approved isolated TEST rehearsal.
- The SQL's normalization matches the currently installed v1-style case/whitespace/fuzzy matching, but parity for accents/Unicode and exact multi-candidate ordering remains unverified.
- The existing \`registration-atomic-intake.ts\` proposal calls v1 and rejects notes. It is not activated. A separate frontend change is needed to call v2 and validate its richer created/review/replayed responses.

## Review/approval checklist

- [ ] Reviewer approves strict input validation and notes fingerprint rules
- [ ] Reviewer approves SHA-256 plus row identity and manifest/reconciliation fallback
- [ ] Reviewer approves manual separate-person exception model
- [ ] Reviewer inspects SQL definer/auth grants, locks, index, rollback and candidate matching
- [ ] Reviewer compares TEST schema / UID trigger / Postgres extension parity
- [ ] Reviewer approves a separate TEST-only SQL execution window and fictional test personas
- [ ] Signed JWT, revoke, concurrent duplicate, rollback, review replay, CSV retries and legacy bypass negative tests pass
- [ ] Future adapter/UI change preserves existing UX without unguarded writes
- [ ] Old member-creation bypass is blocked before any release
- [ ] Only then request a merge/deploy decision

## Commands for offline verification

\`\`\`sh
node --test tests/registration-intake-v2-sql-contract.test.cjs
node --test tests/registration-atomic-intake.test.cjs
npm run typecheck
npm run build
\`\`\`

The build uses nonfunctional placeholder \`NEXT_PUBLIC_SUPABASE_*\` values in GitHub Actions. No live TEST or production credentials are required for these checks. **Do not run HTTP integration or migration scripts under this review scope.**

### Decisions & open questions

**Defaults selected:** SHA256+first source row; one UUID per logical record; same UUID on retry; private review for any suspected duplicate; audited one-time explicit separate-person approval; no frontend redesign.  
**Release blockers:** SQL not syntax-certified/applied; real TEST auth/RLS/integration/concurrency/rollback not tested; exception resolver missing; legacy writes still unprotected; frontend not wired; imported source-row rules must be fixed for multiline CSV.  
**Do not do:** SQL execution, Supabase mutation, GitHub merge, Vercel deployment, production configuration changes, PR closure.
