/** One lifecycle log; read the retired close-only setting until its next save. */
export function ticketStatusLogChannel(data: Record<string, unknown>): string | undefined {
  return typeof data.status_change_log === "string" ? data.status_change_log
    : typeof data.ticket_close_log === "string" ? data.ticket_close_log : undefined
}
