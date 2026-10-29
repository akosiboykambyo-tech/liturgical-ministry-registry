# PR55 isolated PG17 synthetic restore rehearsal — October 29, 2026

The operator has verified Docker Engine under WSL2 Ubuntu on their sole Windows PC, with the Ubuntu disk on D:. The isolated running scratch container is supabase/postgres:17.6.1.136 (PostgreSQL 17.6, no external network/ports). Its four installed extensions match production: pg_stat_statements 1.11, pgcrypto 1.3, supabase_vault 0.3.1, uuid-ossp 1.1.

From inside Ubuntu, in the checked-out PR55 working tree, run:

    bash scripts/pr55-local-pg17-synthetic-restore-rehearsal.sh

The runner refuses other container/network configurations. It creates two random, disposable databases only inside the existing scratch container, performs a real pg_dump -Fc | pg_restore --exit-on-error --single-transaction on synthetic rows, checks the result, and removes only its own fixture databases. It never reads a backup or connects to production. PASS does not certify Auth/Storage or recovery.

Official Supabase migration guidance cautions that raw pg_dump archives can contain internal objects and reserved roles and be difficult to restore; the earlier Oct 26 archive is stale and must be inspected for format and schema before an approved fresh recovery export. Storage object bytes must be separately recovered. https://supabase.com/docs/guides/self-hosting/restore-from-platform and https://supabase.com/docs/guides/platform/backups

Production release remains NO-GO. No production writes or copying of real backup documents is authorized by the synthetic rehearsal.


## Operator execution evidence — 2026-10-29
The operator ran the script from WSL Ubuntu against the isolated PG17 scratch container. The reported output was:

```text
PASS: isolated PG17 with production-matching extension versions
CREATE TABLE
INSERT 0 2
PASS: synthetic custom backup restored and verified; temporary fixture databases will be removed
LIMIT: no live Auth, member data, private letters, or recovery backup was restored
```

**Result: synthetic custom-format pg_dump/pg_restore rehearsal PASSED.** The script's exit trap is intended to drop the two synthetic databases; the supplied output did not independently confirm the post-cleanup inventory. Before certifying cleanup, run a read-only query counting databases with the `pr55_fixture_source_` and `pr55_fixture_target_` prefixes. The previously encountered shell CRLF failure was locally corrected, and the PR55 branch now includes `.gitattributes` with `*.sh text eol=lf` and `*.bash text eol=lf` (commit `8a479bb`). The real October 26 backup is still stale; production database, Auth, and Storage restoration are **not certified**.
