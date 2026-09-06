# API reconciliation against fresh GitHub main

Checked September 4, 2026. This is local source evidence, not a deployed-version
claim. No original checkout, production service, GitHub branch or release changed.

The implementation copy is detached at recovery snapshot `3909883e555670f787c11db8d58e0a7c11425c07`.
That snapshot contains the earlier uncommitted rewrite, not just old Go source.
Its accepted original Go comparison was the original checkout's
`feat/self-hosted-updates` HEAD `90436aa042aa85ab1112ea12f3490787e2104b51`.
We had not freshly fetched GitHub before earlier progress claims; that evidence
gap is corrected here rather than claiming the snapshots were current main.

GitHub `ClashKingInc/ClashKingAPI` main was fetched directly into this independent
repository's `refs/audit/origin-main-20260904`. It resolves to
`cf7371e4a32b4a37afd7c80ff83c72ef29b425e4` (commit September 1, 2026).
Its registration file SHA-256 is
`5a0d0244ed8a85413286cafeebe01db34309f19160632761179e255a45856fc7`.

## The difference is a local addition, not months of missing upstream work

A complete Git tree comparison between the accepted original Go revision and
fresh main has **14 changed files**. They all belong to the original checkout's
additional Capital Gold feature, its test seam, tests and generated documentation:

| Area | Files | Decision |
| --- | --- | --- |
| Response models | `internal/models/v2/clan.go`, `public_stats.go` | Keep local Capital Gold fields. |
| Route/readers | `internal/routes/register.go`, `legacy_clan.go`, `public_stats.go` | Keep local Capital Gold ranking and cached clan values. |
| Tests | `internal/routes/capital_gold_total_test.go`, `clan_history_contract_test.go`, `test/api/swagger_test.go` | Preserve feature evidence; Worker unit/SQL cases cover its responses. |
| Test seam | `internal/utils/store.go`, `store_test.go` | Go dependency-injection support, not a missing Worker product feature. |
| Generated docs | `internal/docs/docs.go`, three `internal/swaggerdocs/openapi*` files | Worker OpenAPI comes from active shared schemas. |

Everything else in those two original source trees is byte-identical. Do not
replace the accepted baseline with remote main in a way that deletes the user's
newer local Capital Gold work. The route checker retains the source-pinned
composite baseline and explicitly records this reconciliation.

The current original checkout additionally has uncommitted app-update manifest
registration, configuration and implementation/tests. Rechecked source hashes:

- Implementation: `77074b758a79f404227917eae8ddd1dc1b6e5656085855f13bf2d3f695f77621`.
- Tests: `071b212215268b58753667e12373314a98cc1556591152a5bdbb741607af84f4`.

They equal the preserved source pins already used by the Worker manifest port.
Original unrelated badge scratch SVGs and local badge runtime state stay in the
original checkout; the separate edge-assets services remain out of scope.

## Explicit deviations, not missing features

- Creator-application review, connected-app approval and Legend attack/defense
  notification preferences are retired by the user. Surviving remote frontend
  code does not authorize restoring them. Ordinary creator support, developer
  API token management, Legend statistics and Discord login remain.
- Six QUERY methods become POST and sixteen source-audited duplicate URLs stay
  removed. No compatibility backend is added.
- New transcript storage follows the user's non-HTML R2 instruction. See
  [the new JSON design](json-ticket-transcripts.md); the old Bot's HTML/Bunny
  producer is not the format requirement for the replacement.
- Existing Dashboard Discord handlers stay in the API. New Bot orchestration
  remains a plan, not active API routes.

This reconciliation establishes source provenance. It does not turn route
coverage or local tests into proof of production connectivity, visual equality,
all possible provider failures or a completed Bot rewrite.
