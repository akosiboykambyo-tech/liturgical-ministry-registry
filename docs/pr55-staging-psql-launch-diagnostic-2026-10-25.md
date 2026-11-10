# PR55 isolated staging PostgreSQL executable diagnostic — 2026-10-25

## Observed
The two-user staging HTTP rehearsal ended before any HTTP or DDL with `psql exit unknown` in the read-only `--connection-check` stage. This outcome neither proves nor disproves non-admin JWT authorization.

## Independent verification
Read-only staging checks found zero temporary PR55 candidate/wrapper RPCs, zero synthetic `PR55HTTP%` members, and one active administrator grant. Staging table metadata still reported 1,008 members, 12 assignments, 8 requests, and 4 reviews.

## Fix
The script now prefers `C:\Program Files\PostgreSQL\18\bin\psql.exe` on the operator's Windows computer when present, falling back to PATH. `spawnSync` failures are categorized by safe error codes rather than ambiguous null status. A new `--check-psql` command invokes only the local executable with `--version`; it requires no project secret and makes no network request.

## Next operator step
From the project directory, run:

```powershell
git pull --ff-only origin fix/production-registration-compatibility
node .\scripts\pr55-staging-candidate-http-rehearsal.cjs --check-psql
```

If the local executable check does not pass, do not retry the staging database connection yet. If it passes, rerun the staging-only read-only `--connection-check` with a private database credential and then the real two-identity Auth/JWT rehearsal.

**Release state: still NO-GO for production activation.** The exact prior spawn error is not yet established.