#!/usr/bin/env bash
# Read-only offline preflight for an OPERATOR-APPROVED private Linux restore host.
# No credentials, backup transfers, restores, container creation or downloads.
set -euo pipefail
failures=0
advisories=0
fail(){ printf 'BLOCKED: %s\n' "$1"; failures=$((failures+1)); }
review(){ printf 'REVIEW: %s\n' "$1"; advisories=$((advisories+1)); }
pass(){ printf 'PASS: %s\n' "$1"; }
if [ "$#" -gt 1 ]; then
  printf 'Usage: bash scripts/pr55-private-restore-host-preflight.sh [PRIVATE_LOCAL_ARCHIVE]\n' >&2
  exit 2
fi
if [ "$(uname -s)" = Linux ]; then pass "Linux host detected"; else fail "Linux host required"; fi
if [ -r /proc/meminfo ]; then
  mem=$(awk '/^MemTotal:/ {print $2; exit}' /proc/meminfo)
  if [ "$mem" -lt 4194304 ]; then fail "Less than 4 GiB RAM";
  elif [ "$mem" -lt 8388608 ]; then review "Below recommended 8 GiB RAM";
  else pass "At least 8 GiB RAM"; fi
else fail "Cannot inspect RAM"; fi
if command -v df >/dev/null 2>&1; then
  free=$(df -Pk . | awk 'NR==2 {print $4}')
  if [ "$free" -lt 41943040 ]; then fail "Less than 40 GiB free disk";
  elif [ "$free" -lt 83886080 ]; then review "Below recommended 80 GiB free disk";
  else pass "At least 80 GiB free disk"; fi
else fail "Cannot inspect free disk"; fi
if command -v nproc >/dev/null 2>&1; then
  cores=$(nproc)
  if [ "$cores" -lt 2 ]; then fail "Less than two CPU cores";
  elif [ "$cores" -lt 4 ]; then review "Fewer than four recommended CPU cores";
  else pass "At least four CPU cores"; fi
fi
if ! command -v docker >/dev/null 2>&1; then fail "Docker Engine CLI missing";
else
  if docker info --format '{{.ServerVersion}}' >/dev/null 2>&1; then pass "Local Docker daemon reachable";
  else fail "Local Docker daemon inaccessible"; fi
  if docker compose version >/dev/null 2>&1; then pass "Docker Compose available";
  else fail "Docker Compose not available"; fi
fi
if command -v pg_restore >/dev/null 2>&1; then
  version=$(pg_restore --version 2>/dev/null || true)
  case "$version" in
    *'PostgreSQL) 17.'*) pass "PostgreSQL 17 pg_restore client available" ;;
    *) review "PostgreSQL 17 restore client still required" ;;
  esac
else review "No locally accessible PostgreSQL 17 pg_restore client"; fi
if command -v supabase >/dev/null 2>&1; then pass "Supabase CLI installed";
else review "Supabase CLI not yet installed"; fi
if [ "$#" -eq 1 ]; then
  if [ -f "$1" ] && [ -r "$1" ] && [ -s "$1" ]; then
    pass "Private local archive exists and is nonempty (not integrity-certified)"
  else fail "Supplied local archive unreadable, missing or empty"; fi
fi
printf 'REQUIRED: isolation/loopback bindings, approved operator and encrypted storage\n'
printf 'REQUIRED: exact PostgreSQL 17/Supabase extension image including supabase_vault\n'
printf 'REQUIRED: fresh authenticated database, Auth and private Storage objects backup\n'
printf 'REQUIRED: strict restore, SHA256, working Auth/private files and recovery rollback proof\n'
printf 'LIMIT: this offline preflight does not create or certify a restored database\n'
if [ "$failures" -gt 0 ]; then printf 'NO-GO: %s prerequisite failures\n' "$failures"; exit 2; fi
printf 'PASS: basic host checks; %s advisories. FULL RESTORE NOT CERTIFIED.\n' "$advisories"
