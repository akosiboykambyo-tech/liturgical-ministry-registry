# PR #54 staging read-only check — 2026-10-24

Target: **isolated Ministry-Registry-Test** `rtptybxugjhvpfjvcvgw`. No DDL or writes executed; no synthetic fixture cleanup performed.

## Observations
- `fuzzystrmatch` and `pgcrypto` are installed in the `extensions` schema.
- `public.members`: 1,004 rows, UUID primary key, text `uid`, names, parish, text[] ministries, service year, status and expiration fields.
- `public.member_ministries`: 4 rows; UUID member relationship, ministry text, status, start/renewal/expiration dates, and document fields.
- `registry_test_private.intake_requests`: 2 records; `registry_test_private.intake_reviews`: 3. These are preserved.
- **Not confirmed:** equivalence to production schema, deployed UID triggers, or a PR #54 role allowlist.

## Read-only SQL matching cases
| Input compared with existing | Result |
|---|---|
| Juan Dela Cruz / Juan Dela Cruz, same parish | exact |
| Juan Dela Cruz / Juan Dela Cruz, different parish | same_name_different_parish |
| Juhn Dela Cruz / Juan Dela Cruz | none (0.75 first-name similarity) |
| Ana Cruz / Anne Cruz | none (short-name rule) |
| Test12 Person / Test13 Person | none (numeric safeguard) |
| Maria  Luz Santos / maria luz Santos | exact |
| Pedro Reyes / Jose Garcia | none |

SQL results agree with the decisions implied by the current JavaScript matching rules for these seven examples, but **no exhaustive SQL-vs-JS harness has been run**. Supplementary Unicode, accents, Turkish casing and numeric substrings remain open.

## Security finding
Supabase metadata issued an RLS-disabled advisory for `registry_test_private.intake_requests`. Read-only privilege checks found **no direct SELECT/INSERT/UPDATE/DELETE table privileges** for `anon` or `authenticated`; `authenticated` does have schema USAGE. This lowers apparent exposure, but enabling RLS would add defense in depth. **Do not automatically alter this table**, because doing so may affect the existing v3 test function. Review the owner, function security context and grants first.

Possible remediation after review, test-only:
```sql
ALTER TABLE registry_test_private.intake_requests ENABLE ROW LEVEL SECURITY;
```
No public policies are proposed. SQL was **not** executed.

## Remaining acceptance blockers
1. Provision a schema-faithful staging clone with approved role setup; isolated project currently contains a lean test schema rather than verified production schema.
2. Test the actual PR #54 SQL transaction and administrator allowlist in that staging clone, including UID triggers/constraints, idempotency, concurrent requests and rollback.
3. Finish matching parity corpus and candidate selection semantics across all rows; no-match could not yet be safely certified for Unicode edge cases.
4. Verify transaction SQL dependencies; candidate proposal intentionally references a ministry allowlist not yet created.
5. Review privilege ownership, registration role revocation and audit, and protect test-only assets.

**Production database unchanged.** Neither PR #53 nor #54 is merge-ready as a production registration feature.
