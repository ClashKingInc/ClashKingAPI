import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { DatabaseFailure, UpstreamUnavailable } from "./errors.js"
import { gatewayHeartbeatFreshnessSeconds } from "./server-authorization.js"

/** Read one atomic, current Gateway snapshot. Empty is authoritative only after
 * completeness and heartbeat checks. No REST fan-out on a cold/stale cache. */
export const readDashboardGatewayCollection = (
  applicationId: string, guildId: string, collection: "members" | "roles" | "channels",
  memberIds?: ReadonlyArray<string>,
) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const tables = { members: "discord_cache.members", roles: "discord_cache.roles", channels: "discord_cache.channels" } as const
  const table = tables[collection]
  const rows = yield* sql.unsafe<{ items: ReadonlyArray<unknown> }>(`
    SELECT COALESCE(items.data, '[]'::jsonb) AS items
    FROM discord_cache.guilds guild
    JOIN discord_cache.gateway_shards shard
      ON (shard.application_id, shard.shard_id) = (guild.application_id, guild.shard_id)
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(item.data) AS data FROM ${table} item WHERE item.guild_id = guild.id
      ${collection === "members" && memberIds !== undefined ? "AND item.user_id = ANY($4::text[])" : ""}
    ) items ON true
    WHERE guild.id = $1 AND guild.application_id = $2
      AND guild.generation = shard.generation AND guild.available AND guild.metadata_complete
      ${collection === "members" ? "AND guild.members_complete" : ""}
      AND shard.healthy AND shard.heartbeat_at > clock_timestamp() - $3 * interval '1 second'
  `, [guildId, applicationId, gatewayHeartbeatFreshnessSeconds,
    ...(collection === "members" && memberIds !== undefined ? [[...new Set(memberIds)]] : [])]).pipe(
    Effect.mapError(cause => new DatabaseFailure({cause, message:"Discord cache lookup failed"})),
  )
  if (rows[0] === undefined) return yield* new UpstreamUnavailable({
    cause: `Gateway ${collection} snapshot is not ready`, message: "Discord cache is temporarily unavailable",
  })
  return rows[0].items
})
