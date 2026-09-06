# API route inventory: reconciled source and verification limits

## Latest source and transcript correction

Fresh GitHub main `cf7371e` was fetched September 4 and compared to the accepted
local Go baseline; only the newer local Capital Gold feature differs (14 files).
See [current source reconciliation](current-origin-reconciliation.md).
The user also explicitly retired creator review and Legend notifications.
New transcripts are non-HTML JSON/R2, not an existing R2 inventory or archived
private-viewer review. The new writer/readers and their tests are described in
[JSON ticket transcripts](json-ticket-transcripts.md).

The latest static check now passes **323 required method/path pairs**, with zero
missing contracts, missing mounts, unexplained additions or active deferred Bot
paths. The two JSON/attachment pairs are explicit additions under the user's
latest instruction; the two old HTML paths are no longer exported/mounted.
OpenAPI contains 340 operations on 277 paths. Passing static inventory still
does not certify all handler behavior or deployment readiness.

Updated September 4, 2026 during local implementation. No deployment, package
publication, production request, schema read or database mutation was performed
by this inventory work. The original source refs are comparison baselines, not
verified deployed versions.

## What now defines the requirement

The checker reads `internal/routes/register.go` directly from API commit
`90436aa042aa85ab1112ea12f3490787e2104b51`, verifies the source SHA-256 recorded in
[worker-route-baseline.json](worker-route-baseline.json), and inventories all 297
literal `/v2/*` and `/proxy/v1/*` registrations there. A dirty working copy cannot
add requirements or silently change an authorization wrapper in that baseline.
The original commit must be available in local Git history; missing history or
a hash mismatch fails rather than falling back to the working tree. A future
shallow CI checkout must make this recorded source commit available explicitly.

Only the manifest's explicit decisions modify those requirements:

- The six existing QUERY methods become POST, with the same paths. No seventh
  method conversion, path rename or compatibility route is inferred.
- Thirty-seven existing Admin operations are mapped from Admin source commit
  `a4c1481c12e63eb39ec05f4be9db422263ad6ffe`. Each mapping records the original
  `/api/...` path and `src/server/adminApi.ts` line. This verifies the source
  dispatch location, not each handler's payload, permissions or behavior.
- Two additional release-control handlers are individually pinned to the
  original Admin checkout's uncommitted source and page hashes. They are retained
  under the preserve-user-work and existing-handler-move instructions; this
  does not accept other dirty additions or authorize selecting a real release.
- The existing R2 media reader is separately recorded as the serving side of
  the approved R2-only upload move. The two new JSON transcript/attachment reads
  are explicit additions under the subsequent non-HTML instruction, with new
  contract, storage and local Workerd tests. Neither reader implements Bot
  collection, publication or channel deletion.
- Connected-app approval stays intentionally removed. No dedicated Connect
  routes were found in the pinned API registration file; the Dashboard/Admin
  retirement inventory remains separate. Ordinary login and developer API
  token management are not retired by that decision.
- Sixteen aliases were retired only after the original paired handlers and
  saved frontend callers were audited. Every canonical operation remains.
  See [the alias audit](worker-route-alias-review.md) for the old Dashboard
  clan-removal caller and the channel-permission/CORS distinctions.
- The pre-existing uncommitted app-update manifest is pinned separately by its
  exact archived registration, implementation and test hashes. These bytes
  match the current original implementation/tests; only this named feature is
  recognized, not every dirty source change.
- `/v2/health` is an explicit minimal Worker liveness adaptation. Its public
  response and shared contract do not claim database or provider readiness.

The two Admin tracking paths already existed in the API. Thus 297 original
registrations, minus 16 aliases, plus 43 moves/adaptations, minus those two
overlaps, plus the preserved update endpoint yield **323 unique method/path
requirements**. Both source origins
are retained for overlaps because matching URLs do not establish matching
authorization: the existing Tracking caller must continue working alongside
the moved Admin caller.

## What the current report actually proves

[worker-route-parity.json](worker-route-parity.json) is generated evidence.
The final static check sees all 323 required pairs represented by contracts and
mounted declaration evidence, with zero missing pairs or unexplained additions.
Nineteen deferred bot-runtime operations and five
new roster-configuration operations are absent from the active router, shared
exports and OpenAPI; their explicit
`./deferred-runtime` reference entry is not a supported API contract.

`mounted` means a recognized literal declaration and a dispatcher invocation
are present. It does **not** mean the handler runs successfully, preserves
permissions, returns the original response, uses the right database schema,
or performs the right provider action. Helper tests, readiness flags and
static mounting are never labeled behavior-proven. The report always leaves
`behavior_parity_verified` and overall `complete` false. `--check` checks the
narrower static inventory and fails if its explicit findings remain.

The old HTML transcript reader findings are superseded by the user's explicit
non-HTML instruction and the independently implemented JSON reader/writer.
Thirteen current local Workerd tests cover that storage/entrypoint boundary,
including stream length failures and immutable retries. No denied archived
journal/private-viewer code was used as implementation authority. Tenor remains
at the original Dashboard Worker GET; both preserved Admin release moves are
accounted for. `--check` exits successfully. Historical missing/addition counts
are superseded by the current generated report.

The typed `/proxy/v1/...` descriptors are recorded as projections of the
original `ALL /proxy/v1/*` route, not new endpoints to approve. This does not
prove arbitrary-method forwarding, auth, headers or response passthrough.

## Differences that must be settled, not hidden

### Resolved original-route coverage

The sixteen source-backed aliases below are now recorded retirements, not
missing features. Their canonical handlers and saved consumer calls were
checked independently of the old disposition labels. The remaining exported
`/discord-channels` alias was also removed from the shared contracts, and a
regression requires all sixteen canonical contracts while rejecting the aliases.

| Method | Original path |
| --- | --- |
| DELETE | `/v2/server/:server_id/clan/:clan_tag` |
| GET | `/v2/guild-summary` |
| GET | `/v2/link/server/:server_id/clan/list` |
| GET | `/v2/me` |
| GET | `/v2/privacy/export` |
| GET | `/v2/public` |
| GET | `/v2/server/:server_id/discord-channels` |
| POST | `/v2/discord` |
| POST | `/v2/email` |
| POST | `/v2/forgot-password` |
| POST | `/v2/privacy/delete-request` |
| POST | `/v2/refresh` |
| POST | `/v2/register` |
| POST | `/v2/resend-verification` |
| POST | `/v2/reset-password` |
| POST | `/v2/verify-email-code` |

`GET /v2/counts/players/builder-halls` is restored with its exact original
501 error and request ID, without database/provider calls or invented count
data. Its error-only descriptor advertises no successful result. See
[the original response and Expo caller review](builder-hall-counts-boundary.md).
The saved Expo removal of that known-failing request is separately recorded;
restoring this API boundary does not claim a working Builder Hall feature.

### Added surfaces have explicit source or decision mappings

No active additions lack a source/decision mapping. JSON transcript and attachment
reads have public-by-link access and a new storage format; the full Bot producer
and its delivery/deletion work remain separate planned implementation.

The two source-pinned Admin release handlers, app manifest and liveness route
are now classified and retained. Tenor uses its original Dashboard Worker GET;
the proposed central POST is not active. Five
new member-group configuration operations are deferred with source preserved;
the original roster-group CRUD/list and account-group query remain active.
See [the additions audit](worker-route-additions-review.md) for exact evidence.

### Admin moves and transport verification

The original dispatcher is behind `/api/$`; its adapter strips `/api` before
dispatch. The recorded mappings therefore contain complete original public
paths, not only internal dispatcher fragments. For example, `/api/auth/me`
moves to `/v2/admin/me`, while revision restoration moves from
`POST /api/posts/:id/revisions/:revision` to
`POST /v2/admin/posts/:id/revisions/:revision/restore`.

Preserve request/response/error and permission behavior while adapting these
destinations. Original `POST /api/auth/logout`, `GET /api/healthz` and
`GET /api/readyz` need explicit auth/runtime disposition; they are recorded as
manual gaps, not silently counted among business moves. Two tracking endpoints
overlap existing API endpoints, so verify both caller classes. The two original
uncommitted release descriptors have their own individually pinned move entries.

The original Cloudflare Access admission policy has been restored across the
central Admin surface, without the speculative SQL allowlist or owner-only
route split. Signed-token, issuer/audience and current AJAX/CORS checks remain.
See [the admission comparison and tests](admin-access-parity.md). This does not
prove every business handler or cross-domain deployed login/logout behavior.

### Resolved reference-source differences

The app-update registration is retained as reviewed supplemental-source
evidence, not an unapproved dirty addition. The unrelated proxy privilege
expansion was corrected in the independent working copy: Go reference and
Worker again require user login, matching both pinned and current original
source. All eighteen typed proxy descriptors say user auth, and the Bot map
no longer advertises two misleading proxy aliases. Native/web forwarding,
observation and streamed error passthrough are covered by local tests. See
[the proxy comparison](proxy-auth-baseline-review.md). Original checkouts remain
untouched, and no Go fallback has been introduced.

### Deferred bot work is not missing API work

The fixed manifest lists 13 ticket/giveaway persistent-runtime operations,
five roster interaction/publication operations and the ticket message-event
operation. They are not requirements, even if a shared package exports them.
Five separately classified new roster-configuration operations are also deferred.
The tool instead reports any remaining mount or public contract export as an
ownership finding. Reference-only helper declarations remain visible without
becoming implementation requirements. Removing exported contracts must be
coordinated with existing imports; this inventory change does not alter them.

Existing Dashboard Discord actions and reads remain required. Do not classify
channel creation, webhook management or bot-profile edits as deferred merely
because they call the shared Discord helper. No restricted schema, evaluator,
private-viewer or prior denied handoff payload was used in this inventory.

### Bounded correction: the existing Dashboard giveaway reroll

The pinned Go `internal/routes/server/giveaways.go:331–434` validates an ended
giveaway, chooses replacements, saves winner data and returns the response. It
does not read `giveaway_outcome_runs` or `giveaway_publication_effects`, wait for
initial message publication, or enqueue a reroll publication. Those speculative
dependencies have now been removed from `dashboard-server-giveaways.ts`, so the
retained reroll endpoint no longer depends on the disabled bot recovery system.
The current write-access check, request validation, transaction, winner update
and response were left intact; no Discord action was added.

Nine new unit cases use SQL stubs that allow only existing server/giveaway row
access and reject publication journal reads, enqueue preflights and all Discord
calls. They cover success without a channel/message destination, invalid
status/input/targets, insufficient entrants, missing giveaways, failed writes
and the real dispatcher's `giveaways` write-access requirement. Four cases
failed against the speculative dependency before the correction; all fourteen
giveaway unit cases now pass on Node 26.8.1. These are local fake-SQL tests,
not real-database, transaction-isolation or production execution evidence.

The reroll now also preserves the original weighted entry slots and whole-second
UTC winner timestamps. Two additional regressions failed before this correction
and pass afterward: exhaustive shuffle choices preserve a twice-entered user's
two-thirds first-draw probability, and two eligible slots may select the same
user twice, as in the original Go implementation. All sixteen giveaway unit
tests pass. A separate read-only review found no issue in that scoped correction.
Changing the original multiple-winning-slot rule would be a product change,
not a deduplication cleanup hidden in this port.

**Remaining differences:** the Worker still has stricter snowflake/stored-data
validation, different error text, and a locked winner-only SQL update instead
of Go's read/full-record save. Those differences are not approved merely
because weighting and publication dependencies were corrected. Mocked tests
do not prove real database transaction isolation or complete reroll parity.

## Validation and reproduction

The 26 inventory test cases cover pinned-source validation, dirty-source drift,
all six method exceptions, changed authorization expressions, fixed Admin
moves, alias/501 proposals, extra descriptors, deferred bot exports/mounts,
uncalled helpers, proxy wildcard projections, duplicate decisions and unsupported
Go registration syntax. They also ensure no route count claims behavior parity.
All 48 repository script tests, including the inventory, OpenAPI and health
cases, passed with the provided Node 26.8.1 toolchain. The final combined
Vitest run passed 1,081 tests across 116 files; both isolated Workerd tests,
Worker type checking, lint and the no-upload build passed. `git diff --check`
also passed. All 35 retained PostgreSQL suites (130 cases) passed in one full
run, using a separate disposable Timescale database and the schema-owned
retained-api Goose profile for each file. Thirty deferred suites are explicitly
excluded, not counted as passing. OpenAPI validates 341 operations across 278
paths. Package-release
tests use fake registry responses and do not publish anything.

Run after building the local shared contract package:

```sh
node --test scripts/check-route-parity.test.mjs
node scripts/check-route-parity.mjs --write --check
```

The second command currently exits 1 intentionally because the named findings
remain. That is an honest incomplete inventory, not a failing implementation
test to suppress. API/SQL/Workers behavior tests, non-v2 operational routes,
legacy compatibility-module disposition, schedules, exact deployed baselines,
consumer comparisons and release evidence remain separate acceptance work.
