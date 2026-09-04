import { DecimalSnowflake, TicketButtonSettings } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { DiscordApi } from "./discord-api.js"
import { DatabaseFailure, Forbidden, UpstreamUnavailable } from "./errors.js"
import type { VerifiedRuntimeInteraction } from "./runtime-interaction.js"
import { discordGuildManager } from "./server-authorization.js"

const GuildOwner = Schema.Struct({ id: DecimalSnowflake, owner_id: DecimalSnowflake })
const object = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** The bot bearer authorizes transport, never the human actor's staff access. */
export const requireTicketStaff = (interaction: VerifiedRuntimeInteraction, panelId: string, ticketId: string) => Effect.gen(function* () {
  if (discordGuildManager({ owner: false, permissions: interaction.permissions })) return
  const sql = yield* SqlClient.SqlClient
  // Resolve only this ticket's original button; another button's roles do not grant access.
  const rows = yield* sql<{ data: unknown; button_id: string | null }>`
    SELECT panel.data, opening.button_id::text FROM ticket_panels panel
    LEFT JOIN ticket_runtime_operations opening ON opening.panel_id=panel.id
      AND opening.ticket_id=${ticketId}::uuid AND opening.action='open'
    WHERE panel.id=${panelId}::uuid AND panel.server_id=${interaction.guildId}`
  const row = rows[0]
  if (row?.button_id) {
    const customId = `ck:ticket:open:${panelId}:${row.button_id}`
    const decoded = Schema.decodeUnknownResult(TicketButtonSettings)(object(row.data)[`${customId}_settings`])
    if (decoded._tag === "Success") {
      const roles = [...decoded.success.mod_role, ...decoded.success.no_ping_mod_role]
      if (interaction.actorRoleIds.some((role) => roles.includes(role))) return
    }
  }
  const grants = yield* sql`SELECT 1 FROM dashboard_role_grants
    WHERE server_id=${interaction.guildId} AND role_id=ANY(${[...interaction.actorRoleIds]}::text[])
      AND section='tickets' AND access_level='manage' LIMIT 1`
  if (grants.length > 0) return
  const discord = yield* DiscordApi
  const guild = yield* discord.request(`/guilds/${interaction.guildId}`).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(GuildOwner)),
    Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Ticket guild ownership is unavailable" })),
  )
  if (guild.id === interaction.guildId && guild.owner_id === interaction.actorId) return
  return yield* new Forbidden({ message: "Ticket staff access is required" })
}).pipe(Effect.catchTag("SqlError", (cause) => Effect.fail(new DatabaseFailure({ cause, message: "Ticket staff authorization is unavailable" }))))
