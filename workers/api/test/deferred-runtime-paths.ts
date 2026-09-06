// Keep this list independent of public descriptors: removing deferred contracts
// later must not remove the regression proof that their HTTP paths stay absent.
// Deliberately distinct from the bearer transcript capability used by the
// entrypoint privacy test: ordinary operation IDs are expected in request logs.
const operationId = "80000000-0000-4000-8000-000000000002"
const effectId = "0".repeat(64)

// Status calls also used POST: their signed bodies could wake deferred work.
// Keep methods explicit so a route is tested with its original dispatch method.
export const deferredRuntimeRoutes: ReadonlyArray<{ readonly method: "GET" | "POST"; readonly path: string }> = [
  { method: "POST", path: "/v2/runtime/giveaways/runtime-test/entries" },
  { method: "POST", path: "/v2/runtime/giveaways/runtime-test/publications/prepare" },
  { method: "POST", path: `/v2/runtime/giveaways/runtime-test/publications/${effectId}/claim` },
  { method: "POST", path: `/v2/runtime/giveaways/runtime-test/publications/${effectId}/complete` },
  { method: "POST", path: "/v2/runtime/giveaway-publications/pending" },
  { method: "POST", path: "/v2/runtime/tickets/open/prepare" },
  { method: "POST", path: "/v2/runtime/tickets/approve/prepare" },
  { method: "POST", path: `/v2/runtime/ticket-operations/${operationId}/advance` },
  { method: "POST", path: "/v2/runtime/tickets/actions" },
  { method: "POST", path: "/v2/runtime/tickets/accounts" },
  { method: "POST", path: `/v2/runtime/ticket-operations/${operationId}/status` },
  { method: "POST", path: "/v2/runtime/ticket-panel-publications/prepare" },
  { method: "POST", path: `/v2/runtime/ticket-panel-publications/${effectId}/status` },
  { method: "POST", path: "/v2/runtime/tickets/message-events" },
  { method: "POST", path: "/v2/runtime/rosters/actions" },
  { method: "POST", path: `/v2/runtime/roster-operations/${operationId}/advance` },
  { method: "POST", path: `/v2/runtime/roster-operations/${operationId}/status` },
  { method: "POST", path: "/v2/runtime/roster-publications/prepare" },
  { method: "POST", path: `/v2/runtime/roster-publications/${operationId}/status` },
]

// These five configuration additions also lack original API/caller evidence.
// Keep them separate from the nineteen orchestration routes and use concrete
// valid identifiers so a mounted handler cannot appear absent due to validation.
const serverId = "123456789012345678"
const memberGroupId = "80000000-0000-4000-8000-000000000003"
export const deferredRosterConfigurationRoutes = [
  { method: "GET", path: `/v2/server/${serverId}/roster-member-groups` },
  { method: "POST", path: `/v2/server/${serverId}/roster-member-groups` },
  { method: "PATCH", path: `/v2/server/${serverId}/roster-member-groups/${memberGroupId}` },
  { method: "DELETE", path: `/v2/server/${serverId}/roster-member-groups/${memberGroupId}` },
  { method: "PUT", path: `/v2/server/${serverId}/rosters/${operationId}/member-groups` },
] as const

export const deferredApiRoutes = [...deferredRuntimeRoutes, ...deferredRosterConfigurationRoutes]
