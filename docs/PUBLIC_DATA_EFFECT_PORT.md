# Public data and mobile initialization port

The public dispatcher owns the 26 explicit entries exported by `publicDataRuntimeRoutes`; initialization owns `POST /v2/initialization`. These are runtime implementations, not a claim that the full API inventory is complete. The root router and route-parity report remain authoritative for integration coverage.

## Sources and boundaries

- War archives use the canonical schema repository's persisted producer format. SQL supplies war type; pending JSON or exact R2 byte ranges supply the payload. The dictionary decoder is pinned to `@bokuweb/zstd-wasm@0.0.27` and loads compiled WASM/data modules without runtime downloading. Each compressed frame is limited to 2 MiB and decoded JSON to 8 MiB.
- Bulk player archive readers keyset-page IDs and keep one decoded war at a time. When the caller knows the end time it is included in the locator query so Timescale can prune chunks. Full-history response helpers and initialization projections reject pages exceeding 8 MiB instead of returning a silently truncated history.
- Search uses the private Elasticsearch binding, application ApiKey authentication, typed stored sources, query-bound encrypted PIT cursors, and PIT cleanup. Tracking leaderboard readers use the private Tracking binding and bot token; no matching data is fabricated when a private service fails.
- CWL histories preserve the existing league/size read-repair transaction, peer-majority league inference, historical promotion rules, victory bonus, destruction tiebreaks, and player competition ranks. No live database repair was performed during development.
- Initialization reuses the shared current-war/CWL enrichment, ranking and Legend-history readers, and canonical archive projections. It returns the existing empty `clan_stats`, `cwl_data`, and `legends_by_season` sections because those sections are intentionally unpopulated in the source assembler.

## Non-outlined decisions

- Date-only historical leaderboard lookups now bind a validated date string as `::date`. A disposable PostgreSQL test found that binding a JavaScript timestamp to the date column did not match the stored snapshot.
- Malformed successful upstream payloads, failed archive decoding, database errors, and initialization network/deadline failures produce errors instead of successful empty data. Individual non-200 live Clash lookups retain the source initialization's best-effort item omission. The current-war helper separately preserves its explicit best-effort contract.
- Archive war type comes from SQL, which prevents friendly wars being inferred as random from the absence of a CWL tag. Stored JSON has no `type` field; accepting a different archive struct would reject real producer payloads.
- Public search and battlelog descriptors include their existing cursor/time/type/attack options, and protected player join history includes both time bounds. The dispatcher validates the shared input schemas before querying data.

## Validation

Run focused Vitest suites under `workers/api/src/public-*.test.ts`, `war-archive-codec.test.ts`, and the dedicated `test:archive-runtime` lane. The latter verifies real dictionary-compressed data in workerd rather than substituting a Node decompressor.

SQL fixtures live in `workers/api/test/postgres/public-data.test.ts` and `initialization.test.ts`. Run each with the schema-owned `scripts/with-test-timescale.sh -- npm run test:postgres -- <test path>` harness. It creates an isolated disposable database, applies authoritative Goose migrations, and removes the container on exit; tests refuse to run without the disposable marker. These tests cover a Go-produced pending archive, CWL metadata repair and placement, historical date lookup, initialization composition, and authentication before body/upstream access.

Production routing, deployment bindings, package publication, and clean registry consumer installation are separate release gates; local tests do not satisfy them.
