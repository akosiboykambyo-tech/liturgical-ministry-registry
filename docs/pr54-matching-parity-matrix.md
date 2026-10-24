# PR #54 matching parity review

Source of truth: `lib/registration-matching.ts`. The proposed intake SQL now intercepts **exact full-name matches across any parish**, plus first-name AND last-name fuzzy matches using a normalized Levenshtein score >= 0.8. Exact match classification can distinguish parish differences. Names with nonmatching numeric sequences are excluded from fuzzy matching; short non-exact names (3 characters or fewer) are excluded. Any detected match is sent to the review queue without an automatic merge.

## Canonical ministries

`lib/constants.ts` lists exactly six canonical names:
1. Mother Butler Guild
2. Ministry of Greeters and Collectors
3. Extraordinary Ministers of Holy Communion
4. Ministry of Lectors and Commentators
5. Ministry of Liturgical Music
6. Ministry of Altar Servers

No standalone `Lector` ministry is allowed. SQL must validate against those canonical names; aliases must be reviewed separately.

## Important limitations: **not yet parity-certified**
- SQL `lower` and PostgreSQL regex space classes can differ from JavaScript `toLocaleLowerCase` / `\\s`, particularly for non-ASCII and Unicode. PostgreSQL Levenshtein operates on characters rather than JavaScript UTF-16 code units for supplementary characters.
- SQL digit extraction compares joined digit runs; Unicode or mixed scripts may behave differently.
- `extensions.levenshtein` requires `fuzzystrmatch` installed in that schema and compatible input sizes. `extensions.digest` needs `pgcrypto`. Their actual availability is not yet confirmed in a schema-faithful staging clone.
- SQL schema/proposal is still intentionally not executable; canonical ministry allowlist relation is not created or populated, UID trigger assumptions are unverified.
- Existing app duplicate checks can fail open if RLS prevents full member reads. The proposed database function must always be able to inspect all members and must fail closed on errors.

## Staging acceptance cases

| Incoming / existing | Expected |
|---|---|
| Juan Dela Cruz / Juan Dela Cruz, same parish | review: exact |
| Juan Dela Cruz / Juan Dela Cruz, different parish | review: different parish |
| Juhn Dela Cruz / Juan Dela Cruz | no match (first-name similarity 0.75) |
| Ana Cruz / Anne Cruz | not a fuzzy match (3-character Ana) |
| Test12 Person / Test13 Person | not a fuzzy match (distinct number) |
| Different names / different names | create |
| Same incoming name, two concurrent different keys | exactly one create, one review |
| Same key and identical payload | replay same result |
| Same key, different payload | conflict, no writes |

## Before enabling

Run a SQL/JS parity harness over varied strings, whitespace, Unicode, numeric suffixes, single/double names, and two-ministry fixtures. Inspect and confirm deployed triggers, RLS, actual SQL types and constraints. Isolated test database was inspected using read-only queries on 2026-10-24; no database records were modified.
