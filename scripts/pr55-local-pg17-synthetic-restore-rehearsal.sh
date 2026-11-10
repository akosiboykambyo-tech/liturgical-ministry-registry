#!/usr/bin/env bash
# Isolated synthetic-only PG17 custom-dump restoration proof. Never read a real backup.
set -euo pipefail
name=cowl-dok-pg17-scratch
expected='none|supabase/postgres:17.6.1.136|true'
actual=$(sudo docker inspect --format '{{.HostConfig.NetworkMode}}|{{.Config.Image}}|{{.State.Running}}' "$name" 2>/dev/null) || { echo 'BLOCKED: scratch container missing' >&2; exit 2; }
if [ "$actual" != "$expected" ]; then echo 'BLOCKED: unexpected Docker configuration' >&2; exit 2; fi
extensions=$(sudo docker exec "$name" psql -U supabase_admin -d postgres -At -v ON_ERROR_STOP=1 -c "select string_agg(extname||':'||extversion,',' order by extname) from pg_extension where extname in ('pg_stat_statements','pgcrypto','supabase_vault','uuid-ossp')")
if [ "$extensions" != 'pg_stat_statements:1.11,pgcrypto:1.3,supabase_vault:0.3.1,uuid-ossp:1.1' ]; then echo "BLOCKED: extension mismatch: $extensions" >&2; exit 2; fi
echo 'PASS: isolated PG17 with production-matching extension versions'
suffix="$(date +%s)_$RANDOM"
src="pr55_fixture_source_$suffix"
dst="pr55_fixture_target_$suffix"
src_created=no
dst_created=no
cleanup() {
  if [ "$dst_created" = yes ]; then sudo docker exec "$name" dropdb -U supabase_admin --if-exists "$dst" || true; fi
  if [ "$src_created" = yes ]; then sudo docker exec "$name" dropdb -U supabase_admin --if-exists "$src" || true; fi
}
trap cleanup EXIT
sudo docker exec "$name" createdb -U supabase_admin "$src"
src_created=yes
sudo docker exec "$name" createdb -U supabase_admin "$dst"
dst_created=yes
sudo docker exec "$name" psql -U supabase_admin -d "$src" -v ON_ERROR_STOP=1 -c "create table public.pr55_restore_fixture(id integer primary key, fixture_value text not null); insert into public.pr55_restore_fixture values (1,'synthetic-only'),(2,'synthetic-only');"
sudo docker exec "$name" pg_dump -U supabase_admin --format=custom --no-owner --no-acl --table=public.pr55_restore_fixture --dbname="$src" | sudo docker exec -i "$name" pg_restore -U supabase_admin --exit-on-error --single-transaction --no-owner --no-acl --dbname="$dst"
got=$(sudo docker exec "$name" psql -U supabase_admin -d "$dst" -At -v ON_ERROR_STOP=1 -c "select count(*)::text || '|' || min(fixture_value) from public.pr55_restore_fixture;")
if [ "$got" != '2|synthetic-only' ]; then echo 'BLOCKED: synthetic restoration mismatch' >&2; exit 2; fi
echo 'PASS: synthetic custom backup restored and verified; temporary fixture databases will be removed'
echo 'LIMIT: no live Auth, member data, private letters, or recovery backup was restored'
