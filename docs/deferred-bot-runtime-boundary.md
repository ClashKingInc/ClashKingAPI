# Deferred Bot runtime boundary

The active API no longer mounts the thirteen persistent giveaway/ticket command
routes or the ticket message-event route under `/v2/runtime/`. The five roster
interaction/publication contracts were already unmounted and remain absent.
The reference implementations and their isolated tests are preserved for the
later Bot specification, not marked as completed API functionality.

The API entrypoint no longer exports `TicketRuntimeCoordinator` or
`RuntimeRecoveryCoordinator`, binds their namespaces, or schedules recovery.
Materialized-view refresh, its five-minute cron, the shared-link rate limiter,
authentication, Dashboard endpoints and their existing Discord actions remain.
The new non-HTML R2 transcript storage/reader follows the user's explicit JSON
direction; reading an object is separate from collecting and publishing Discord
history. Archived HTML readers are not mounted.

## Deliberately unfinished follow-through

- The nineteen `/v2/runtime/` descriptors have now been removed from root/Bot
  exports, active endpoint maps and generated OpenAPI. An explicit
  `@clashking/api-contracts/deferred-runtime` entry preserves reference-only
  schemas for dormant source/tests. Do not import it into active consumers or
  treat it as a supported API surface. Package publication remains deferred.
- Dashboard giveaway reroll no longer checks or enqueues speculative bot
  publication journals. Tests forbid those dependencies and preserve the
  endpoint's write-access check. Other baseline differences, including entry
  weighting, remain recorded in `worker-route-inventory-review.md`.
- `DeferredRuntimeBindings` is a separate reference-only type for dormant
  dispatchers and coordinator tests. Active `WorkerBindings`, `WorkerEnvironment`
  and entrypoint handlers contain neither `TICKET_RUNTIME` nor `RUNTIME_RECOVERY`;
  an active API binding cannot be passed to a deferred dispatcher without a
  type error. No reference namespace is deployed or required by the active API.
- Wrangler's historical `v3-ticket-runtime` and `v4-runtime-recovery` migration
  declarations are preserved because their applied state has not been checked.
  No deletion migration, namespace deletion or data change was performed. This
  local candidate must not be deployed until its migration history is reconciled
  under explicit release authorization; a local type generation/build is not
  evidence that it is safe to apply to a deployed Worker.

## Boundary checks

The normal local/CI `test:durable` lane uses a dedicated retained entrypoint and
only the shared-link limiter namespace. It does not import or start the deferred
ticket/recovery coordinators. `test:archive-runtime` excludes the deferred ticket
queue suite while retaining actual Workerd auth/mail, media, JSON transcripts,
archive/export, proxy and API entrypoint checks. The saved deferred test files
are preserved, not deleted or counted as completed API features.

`entrypoint-integration-review.test.ts` checks all nineteen paths with and without
a bot token, requires 404, rejects SQL/provider work, verifies retained Dashboard
authentication, asserts the two remaining class exports and checks that only
materialized-view refresh is scheduled. The Workerd entrypoint test checks the
same absent HTTP paths against the actual bundled fetch handler.
`environment.test.ts` adds compile-time checks that neither deferred namespace
is a key of the active environment and that the entrypoint uses that environment.

These tests prove disconnection and retained routing boundaries, not full
baseline behavior, source cleanup, published-contract accuracy or release
readiness. No deployment, production action or visual testing is part of this
change.
