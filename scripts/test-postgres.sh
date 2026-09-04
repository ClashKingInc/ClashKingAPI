#!/usr/bin/env bash
set -euo pipefail

fixture_check_only=false
if [[ ${1:-} == --check ]]; then
  fixture_check_only=true
  shift
fi
if [[ $# != 1 ]]; then
  echo 'Usage: bash scripts/test-postgres.sh [--check] /path/to/clashking_schemas' >&2
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
# Match Vitest's recursive include, including future nested suites. NUL-delimited
# paths preserve spaces; each invocation still gets its own disposable database.
fixture_manifest="$(mktemp)"
trap 'rm -f -- "$fixture_manifest"' EXIT
# Finish discovery before starting any database, and propagate traversal errors.
find workers/api/test/postgres -type f -name '*.test.ts' -print0 > "$fixture_manifest"
while IFS= read -r -d '' fixture_test; do
  fixture_count=$((fixture_count+1))
  bash "$fixture_harness" --through 27 -- npm run test:postgres -- "$fixture_test"
done < "$fixture_manifest"
if [[ $fixture_count == 0 ]]; then
  echo 'No PostgreSQL tests found.' >&2
  exit 1
fi
echo "Completed $fixture_count isolated PostgreSQL suites at migration 27."
