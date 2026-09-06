# Original Builder Hall counts unavailable response

The API preserves `GET /v2/counts/players/builder-halls` as a public endpoint
which always returns HTTP 501. It returns `code: "not_implemented"`,
`message: "Builder Hall counts are not implemented"`, and the current request ID.
It performs no database or provider work and does not invent count data.

## Source evidence

These references are immutable Git objects, not verified production state:

- API commit `90436aa042aa85ab1112ea12f3490787e2104b51`,
  `internal/routes/register.go:95`, registers GET without an authentication
  wrapper. `internal/routes/stats.go:77–92` documents and returns the unconditional
  501 response. `internal/routes/stats_test.go:25–47` tests that behavior.
- Original Expo commit `f9c531da597e0e0cb6f09a26916f19501972fcfb`,
  `expo/src/features/stats/data/stats-repository.ts:41–52`, includes the public
  request in `Promise.all` without a per-request failure fallback. A rejected 501
  therefore rejects that combined load.
- Saved Expo commit `9d7fd109d8a23e9f0306a3f5c447cfc98eb656f1`, the same file at
  lines 59–73, requests only Town Hall and league-tier counts. This change does
  not restore the known-unavailable request or change the saved Expo UI.

## Contract representation and checks

`PlayerBuilderhallCountsEndpoint` declares the real 501 error, a `Never` success
schema, and `successStatus: null`. Null is the shared endpoint model's explicit
error-only state; generated OpenAPI omits a nonexistent success response.
Existing response writers require a non-null success status before emitting one.
Every previously successful endpoint retains its original status and response.

Tests cover the exact public 501 response with no token, an invalid token, and
a valid bot token; no SQL or provider calls; no POST alias; a shared-client
typed 501 non-success result; rejection of invented 200 data; and OpenAPI with
only the 501 response. The real Worker entrypoint fixture also exercises 501.

This preserves an existing unavailable operation, not completed Builder Hall
statistics. No schema, database, frontend, production, or deployment change is
part of this restoration.
