import { BotServerActivityEndpoint } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { AuthIdentity } from "./auth.js"
import type { WorkerBindings } from "./environment.js"
import { DatabaseFailure, InvalidRequest } from "./errors.js"
import { readBoundedJson } from "./request-body.js"
import { requireFreshInteraction, verifyRuntimeInteraction } from "./runtime-interaction.js"
import { notifyTracking } from "./tracking-wake.js"

export const dispatchBotServerActivity = (request: Request, bindings: WorkerBindings) => Effect.gen(function* () {
  if (request.method !== "POST" || new URL(request.url).pathname !== BotServerActivityEndpoint.path) return undefined
  yield* (yield* AuthIdentity).requireBot(request)
  const proof = yield* Schema.decodeUnknownEffect(BotServerActivityEndpoint.body)(yield* readBoundedJson(request, 2_100_000)).pipe(
    Effect.mapError(() => new InvalidRequest({ message: "Invalid command activity proof" })),
  )
  const interaction = yield* verifyRuntimeInteraction(proof, bindings)
  yield* requireFreshInteraction(interaction)
  if (interaction.type !== 2) return yield* new InvalidRequest({ message: "A guild command is required" })
  const sql = yield* SqlClient.SqlClient
  const recorded = yield* sql.withTransaction(Effect.gen(function* () {
    // Only Discord-signed guild identity counts. User-installed commands in a
    // guild this bot has left cannot revive its tracking configuration.
    const rows = yield* sql<{ last_command_at: Date | string | null; name: string }>`
      SELECT server.last_command_at,COALESCE(NULLIF(guild.data->>'name',''),'Discord server') AS name
      FROM discord_cache.guilds guild LEFT JOIN servers server ON server.id=guild.id
      JOIN discord_cache.gateway_shards shard
        ON (shard.application_id,shard.shard_id)=(guild.application_id,guild.shard_id)
      WHERE guild.id=${interaction.guildId} AND server.left_at IS NULL AND guild.application_id=${bindings.DISCORD_APPLICATION_ID}
        AND guild.generation=shard.generation AND guild.available AND guild.metadata_complete
      FOR UPDATE OF guild`
    const previous = rows[0]
    if (!previous) return false
    // Use the verified request time, not processing time: retrying the same
    // proof cannot extend the activity window, and late proofs cannot rewind it.
    const observedAt = new Date(interaction.signedAt).toISOString()
    // The first signed command must create the settings row too; otherwise a
    // newly joined guild never becomes active enough to load its members.
    const changed = yield* sql<{ id: string }>`INSERT INTO servers(id,name,last_command_at)
      VALUES(${interaction.guildId},${previous.name},${observedAt}::timestamptz)
      ON CONFLICT(id) DO UPDATE SET last_command_at=EXCLUDED.last_command_at,updated_at=now()
      WHERE servers.left_at IS NULL AND (servers.last_command_at IS NULL OR servers.last_command_at<EXCLUDED.last_command_at)
      RETURNING id`
    if (changed.length && (previous.last_command_at === null || new Date(previous.last_command_at).getTime() < interaction.signedAt-90*86_400_000)) {
      yield* notifyTracking(sql, { kind: "guild_reactivated", serverId: interaction.guildId })
    }
    return changed.length > 0
  })).pipe(Effect.mapError(cause => new DatabaseFailure({ cause, message: "Command activity update failed" })))
  return Response.json({ recorded }, { headers: { "cache-control": "no-store" } })
})
