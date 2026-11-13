/** Narrow migration gate: unset and false retain normal operation. */
export const ticketsPaused = (bindings: { readonly TICKETS_PAUSED?: string }): boolean => bindings.TICKETS_PAUSED === "true"
export const ticketPauseRetryMs = 30_000

export const ticketPauseResponse = (request: Request, bindings: { readonly TICKETS_PAUSED?: string }): Response | undefined => {
  if (!ticketsPaused(bindings)) return undefined
  const path = new URL(request.url).pathname
  // Cover all settings readers/writers and runtime controls, including the
  // bot's legacy panel list. Public transcript files are independent of settings.
  if (!/^\/v2\/(?:server\/[^/]+\/tickets(?:\/|$)|runtime\/(?:tickets|ticket-operations|ticket-panel-publications)(?:\/|$)|bot\/server\/[^/]+\/ticket-panels(?:\/|$))/iu.test(path)) return undefined
  return Response.json({ code: "upstream_unavailable", reason: "ticket_maintenance", message: "Tickets are briefly paused for maintenance. Please try again shortly." }, {
    status: 503, headers: { "retry-after": String(ticketPauseRetryMs / 1_000), "cache-control": "no-store" },
  })
}
