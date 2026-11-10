#!/usr/bin/env bash
# PR55: strict private offline custom-backup restoration into a brand-new disposable PG17 container.
# Source backup is mounted READ-ONLY. No network, published ports or production connections.
set -euo pipefail
if [[ "$#" -ne 2 ]]; then
  echo 'Usage: bash scripts/pr55-offline-archive-restore-rehearsal.sh PRIVATE_ARCHIVE EXACT_SHA256' >&2
  exit 2
fi
backup=$1
expected=${2,,}
if [[ ! "$expected" =~ ^[0-9a-f]{64}$ ]]; then
  echo 'BLOCKED: exact 64-character SHA-256 required' >&2
  exit 2
fi
if [[ ! -f "$backup" || ! -r "$backup" || ! -s "$backup" ]]; then
  echo 'BLOCKED: private archive missing, unreadable or empty' >&2
  exit 2
fi
actual=$(sha256sum -- "$backup" | awk '{print $1}')
if [[ "$actual" != "$expected" ]]; then
  echo 'BLOCKED: archive checksum mismatch; nothing restored' >&2
  exit 2
fi
# Check REAL host D: free space; df /var/lib/docker shows the virtual WSL filesystem maximum.
if [[ ! -d /mnt/d ]]; then
  echo 'BLOCKED: expected WSL-mounted host Drive D: not available' >&2
  exit 2
fi
free_kib=$(df -Pk /mnt/d | awk 'NR==2 {print $4}')
if [[ ! "$free_kib" =~ ^[0-9]+$ || "$free_kib" -lt 2097152 ]]; then
  echo 'BLOCKED: less than 2 GiB free on physical Drive D:' >&2
  exit 2
fi
suffix=$(date +%s)_${RANDOM}
container="pr55_offline_restore_${suffix}"
volume="pr55_offline_restore_volume_${suffix}"
image=supabase/postgres:17.6.1.136
volume_created=no
container_created=no
log=$(mktemp)
chmod 600 "$log"
cleanup() {
  if [[ "$container_created" = yes ]]; then
    if ! sudo docker rm --force "$container" >/dev/null 2>&1; then
      echo "REVIEW: could not remove generated container $container" >&2
    fi
  fi
  if [[ "$volume_created" = yes ]]; then
    if ! sudo docker volume rm "$volume" >/dev/null 2>&1; then
      echo "REVIEW: could not remove generated volume $volume; erase it securely per local policy" >&2
    fi
  fi
  rm -f "$log"
}
trap cleanup EXIT

echo 'PASS: exact archive checksum and D: disk-space preflight'
sudo docker volume create "$volume" >/dev/null
volume_created=yes
# A separate disposable volume prevents introducing member records into the existing scratch database.
container_created=yes
sudo docker run -d --name "$container" --network none --restart no \
  --memory 1536m --cpus 2 --shm-size 256m \
  -e POSTGRES_PASSWORD="$(openssl rand -hex 24)" \
  -v "${volume}:/var/lib/postgresql/data" \
  --mount "type=bind,source=${backup},target=/input/archive.backup,readonly" \
  "$image" >/dev/null
settings=$(sudo docker inspect --format '{{.HostConfig.NetworkMode}}|{{.Config.Image}}|{{.State.Running}}|{{len .HostConfig.PortBindings}}' "$container")
if [[ "$settings" != "none|${image}|true|0" ]]; then
  echo 'BLOCKED: isolated container verification failed' >&2
  exit 2
fi
ready=no
for attempt in $(seq 1 35); do
  if sudo docker exec "$container" pg_isready -q -U supabase_admin -d postgres >/dev/null 2>&1; then
    ready=yes; break
  fi
  sleep 2
done
if [[ "$ready" != yes ]]; then
  echo 'NO-GO: isolated PG17 instance did not become ready; no production access was attempted' >&2
  exit 1
fi
# PostgreSQL default database may already contain Supabase bootstrap objects.
# A new template0 database avoids overriding the server's initial catalog.
sudo docker exec "$container" createdb -U supabase_admin --template=template0 pr55_rehearsal
if ! sudo docker exec "$container" pg_restore -U supabase_admin -d pr55_rehearsal \
  --exit-on-error --single-transaction --no-owner --no-acl /input/archive.backup >"$log" 2>&1; then
  if grep -Eiq 'role .* does not exist' "$log"; then issue='missing referenced role';
  elif grep -Eiq 'extension .*is not available|could not open extension control' "$log"; then issue='unavailable extension';
  elif grep -Eiq 'already exists|duplicate' "$log"; then issue='object collision or preinitialized schema';
  elif grep -Eiq 'permission denied|must be owner|superuser' "$log"; then issue='insufficient restore privileges';
  elif grep -Eiq 'could not execute query|error:' "$log"; then issue='archive SQL/dependency failure';
  else issue='unspecified pg_restore failure'; fi
  echo "NO-GO: strict offline restore failed ($issue). No changes to source archive or production." >&2
  echo 'Diagnostic SQL/error log kept private and deleted on exit; please report only the category.' >&2
  exit 1
fi
for relation in public.members public.member_ministries auth.users storage.objects; do
  found=$(sudo docker exec "$container" psql -U supabase_admin -d pr55_rehearsal -At -v ON_ERROR_STOP=1 \
    -c "SELECT CASE WHEN to_regclass('$relation') IS NULL THEN 'MISSING' ELSE 'PRESENT' END")
  if [[ "$found" != PRESENT ]]; then
    echo "NO-GO: required restored table $relation missing" >&2
    exit 1
  fi
  rows=$(sudo docker exec "$container" psql -U supabase_admin -d pr55_rehearsal -At -v ON_ERROR_STOP=1 \
    -c "SELECT count(*) FROM $relation")
  echo "PASS: $relation restored; rows=$rows"
done
echo 'PASS: archive schema and data restored with no-owner/no-acl; four core-table row counts verified.'
echo 'LIMIT: not a proof of Storage object bytes, live Auth service, roles/ACLs, or a current production recovery point.'
echo 'CLEANUP: removing disposable container and Docker volume; original archive untouched.'
