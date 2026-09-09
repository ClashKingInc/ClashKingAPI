#!/usr/bin/env bash
set -euo pipefail

fixture_check_only=false
fixture_keep_going=false
if [[ ${1:-} == --keep-going ]]; then
  fixture_keep_going=true
  shift
fi
if [[ ${1:-} == --check ]]; then
  fixture_check_only=true
  shift
fi
if [[ $# != 1 ]]; then
  echo 'Usage: bash scripts/test-postgres.sh [--keep-going] [--check] /path/to/clashking_schemas' >&2
  exit 2
fi
if [[ ! -d $1 ]]; then
  echo 'Schema checkout directory does not exist.' >&2
  exit 1
fi
fixture_schema_root="$(cd "$1" && pwd)"
fixture_suite_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fixture_harness="$fixture_schema_root/scripts/with-test-timescale.sh"
if [[ ! -r $fixture_harness || ! -r $fixture_schema_root/database/go.mod || ! -d $fixture_schema_root/database/timescale ]]; then
  echo 'The schema checkout must include scripts/with-test-timescale.sh, database/go.mod, and database/timescale.' >&2
  exit 1
fi
if [[ $fixture_check_only == true ]]; then
  echo 'Schema checkout layout is valid; no database was started or migration applied.'
  exit 0
fi
cd "$fixture_suite_root"
# Test files deliberately use deterministic identities. Give each file its own
# authoritative migrated database, not a shared database polluted by other files.
fixture_count=0
fixture_failures=()
# Explicit classification prevents archived bot suites from silently becoming
# retained API requirements. New and missing files fail before any database starts.
fixture_manifest="$(mktemp)"
trap 'rm -f -- "$fixture_manifest"' EXIT
# Finish discovery before starting any database, and propagate traversal errors.
node scripts/list-retained-postgres-suites.mjs > "$fixture_manifest"
while IFS= read -r -d '' fixture_test; do
  fixture_count=$((fixture_count+1))
  if bash "$fixture_harness" --profile retained-api -- npm run test:postgres -- "$fixture_test"; then
    :
  else
    fixture_status=$?
    fixture_failures+=("$fixture_test")
    if [[ $fixture_keep_going != true ]]; then exit "$fixture_status"; fi
  fi
done < "$fixture_manifest"
if [[ ${#fixture_failures[@]} -gt 0 ]]; then
  echo "${#fixture_failures[@]} of $fixture_count isolated PostgreSQL suites failed:" >&2
  printf '%s\n' "${fixture_failures[@]}" >&2
  exit 1
fi
if [[ $fixture_count == 0 ]]; then
  echo 'No PostgreSQL tests found.' >&2
  exit 1
fi
echo "Completed $fixture_count isolated PostgreSQL suites with the retained-api migration profile."
