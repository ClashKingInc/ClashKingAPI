import { DecimalSnowflake } from "@clashking/api-contracts"
import { Context, Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { DiscordApi } from "./discord-api.js"
import { WorkerEnvironment } from "./environment.js"
import { DatabaseFailure, UpstreamUnavailable, type ApiFailure } from "./errors.js"
import { readBoundedJson } from "./request-body.js"
import { TicketApprovalResolver } from "./ticket-approval-runtime.js"
import { approvalBuiltinValues } from "./ticket-approval-values.js"
import { ticketApprovalTokens, type TicketApprovalToken } from "./ticket-approval-template.js"
import type { StaffTicketSnapshot } from "./ticket-staff-runtime.js"

/** The implementation must check the authoritative Gateway owner/session lease.
 * A REST approximate count or partial cached-member count does not satisfy this service. */
export class TicketApprovalGuildCounts extends Context.Service<TicketApprovalGuildCounts, {
  readonly exact: (applicationId: string, guildId: string) => Effect.Effect<number, ApiFailure>
}>()("clashking/TicketApprovalGuildCounts") {}

const Text = Schema.String.check(Schema.isMaxLength(100))
const Count = Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 2147483647 }))
const Tag = Schema.String.check(Schema.isPattern(/^#[0289PYLQGRJCUV]+$/u))
const Player = Schema.Struct({ tag: Tag, name: Text, townHallLevel: Count,
  heroes: Schema.Array(Schema.Struct({ name: Text, level: Count, village: Schema.String })).check(Schema.isMaxLength(100)),
  heroEquipment: Schema.optionalKey(Schema.Array(Schema.Struct({ name: Text, level: Count, maxLevel: Count })).check(Schema.isMaxLength(100))),
})
const Named = Schema.Struct({ name: Text })
const Clan = Schema.Struct({ tag: Tag, name: Text, clanLevel: Count, members: Count,
  location: Schema.optionalKey(Schema.NullOr(Named)), warLeague: Schema.optionalKey(Schema.NullOr(Named)), capitalLeague: Schema.optionalKey(Schema.NullOr(Named)),
  memberList: Schema.Array(Schema.Struct({ tag: Tag, name: Text, role: Schema.String })).check(Schema.isMaxLength(50)),
})
const Emojis = Schema.Struct({ items: Schema.Array(Schema.Struct({ id: DecimalSnowflake,
  name: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_]{1,32}$/u)), animated: Schema.optionalKey(Schema.Boolean),
})).check(Schema.isMaxLength(2000)) })
const decode = <A>(schema: Schema.Codec<A, unknown, never, never>, value: unknown, message: string) =>
  Schema.decodeUnknownEffect(schema)(value).pipe(Effect.mapError(cause => new UpstreamUnavailable({ cause, message })))

interface ApprovalBindings {
  readonly DISCORD_APPLICATION_ID: string
  readonly CLASH_PROXY: { readonly fetch: (request: Request) => Promise<Response> }
}
export const resolveTicketApproval = (ticket: StaffTicketSnapshot, template: string, bindings: ApprovalBindings) => Effect.gen(function* () {
  const required = ticketApprovalTokens.filter(token => template.includes(`{${token}}`))
  const needs = (token: TicketApprovalToken) => required.includes(token)
  const discord = yield* DiscordApi
  const clash = <A>(kind: "players" | "clans", tag: string, schema: Schema.Codec<A, unknown, never, never>) => Effect.gen(function* () {
    yield* decode(Tag, tag, "Stored ticket Clash tag is invalid")
    const response = yield* Effect.tryPromise({
      try: () => bindings.CLASH_PROXY.fetch(new Request(`http://clash-proxy.internal/v1/${kind}/${encodeURIComponent(tag)}`, { signal: AbortSignal.timeout(15_000), redirect: "error" })),
      catch: cause => new UpstreamUnavailable({ cause, message: "Ticket approval Clash lookup failed" }),
    })
    if (!response.ok) {
      yield* Effect.promise(async()=>{try {await response.body?.cancel()} catch {/* Preserve the provider failure. */}})
      return yield* new UpstreamUnavailable({ cause: response.status, message: "Ticket approval Clash snapshot is unavailable" })
    }
    const value = yield* readBoundedJson(response, 262144).pipe(Effect.mapError(cause => new UpstreamUnavailable({ cause, message: "Ticket approval Clash response is invalid" })))
    const result = yield* decode(schema, value, "Ticket approval Clash response failed validation")
    if (typeof result !== "object" || result === null || !("tag" in result) || result.tag !== tag) {
      return yield* new UpstreamUnavailable({ cause: undefined, message: "Ticket approval Clash identity mismatch" })
    }
    return result
  })
  const user = needs("user_name") && ticket.applicant_user_id ? yield* discord.request(`/users/${ticket.applicant_user_id}`).pipe(
    Effect.flatMap(value => decode(Schema.Struct({ id: DecimalSnowflake, username: Text }), value, "Ticket applicant lookup is invalid"))) : undefined
  if (user && user.id !== ticket.applicant_user_id) return yield* new UpstreamUnavailable({ cause: undefined, message: "Ticket applicant identity mismatch" })
  const guild = needs("server_name") ? yield* discord.request(`/guilds/${ticket.server_id}`).pipe(
    Effect.flatMap(value => decode(Schema.Struct({ id: DecimalSnowflake, name: Text }), value, "Ticket guild lookup is invalid"))) : undefined
  if (guild && guild.id !== ticket.server_id) return yield* new UpstreamUnavailable({ cause: undefined, message: "Ticket guild identity mismatch" })
  const count = needs("server_member_count") ? yield* (yield* TicketApprovalGuildCounts).exact(bindings.DISCORD_APPLICATION_ID, ticket.server_id).pipe(
    Effect.flatMap(value => decode(Count, value, "Exact ticket guild count is invalid"))) : 0
  const firstAccount = ticket.applicant_accounts[0]
  const player = firstAccount && required.some(token => token.startsWith("account_")) ? yield* clash("players", firstAccount, Player) : undefined
  const clan = ticket.assigned_clan_tag && required.some(token => token.startsWith("clan_")) ? yield* clash("clans", ticket.assigned_clan_tag, Clan) : undefined
  let leaderUserId: string | undefined
  if (clan && (needs("clan_leader") || needs("clan_leader_mention"))) {
    const leaders = clan.memberList.filter(member => member.role === "leader")
    if (leaders.length !== 1 || new Set(clan.memberList.map(member=>member.tag)).size !== clan.memberList.length) {
      return yield* new UpstreamUnavailable({ cause: undefined, message: "Ticket clan leader snapshot is unavailable" })
    }
    const leader=leaders[0]!
    if (needs("clan_leader_mention")) {
      const sql = yield* SqlClient.SqlClient
      const linked = (yield* sql<{ user_id: string | null }>`SELECT user_id FROM player_links WHERE tag=${leader.tag}`)[0]?.user_id
      if (linked) leaderUserId = yield* decode(DecimalSnowflake, linked, "Ticket clan leader link is invalid")
    }
  }
  const emojis = new Map<string, string>()
  if (player && needs("account_heroes") || clan && needs("clan_badge_emoji")) {
    const list = yield* discord.request(`/applications/${bindings.DISCORD_APPLICATION_ID}/emojis`).pipe(
      Effect.flatMap(value => decode(Emojis, value, "Ticket application emoji list is invalid")))
    for (const emoji of list.items) {
      if (emojis.has(emoji.name)) return yield* new UpstreamUnavailable({ cause: undefined, message: "Ticket application emoji names are ambiguous" })
      emojis.set(emoji.name, `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>`)
    }
  }
  const values = approvalBuiltinValues({ ticket: { number: ticket.number, status: ticket.status, channelId: ticket.channel_id, applicantUserId: ticket.applicant_user_id },
    applicantName: user?.username ?? "", guild: { name: guild?.name ?? "", memberCount: count },
    player: player ? { ...player, heroEquipment: player.heroEquipment ?? [] } : undefined,
    clan: clan ? { ...clan, location: clan.location ?? null, warLeague: clan.warLeague ?? null, capitalLeague: clan.capitalLeague ?? null } : undefined,
    leaderUserId, emojis })
  return { builtins: Object.fromEntries(required.map(token => [token, values[token]])),
    userMentions: [...new Set([...(needs("user_mention") && ticket.applicant_user_id ? [ticket.applicant_user_id] : []),
      ...(needs("clan_leader_mention") && leaderUserId ? [leaderUserId] : [])])] }
}).pipe(Effect.catchTag("SqlError", cause => Effect.fail(new DatabaseFailure({ cause, message: "Ticket approval link lookup is unavailable" }))))

export const ticketApprovalResolverLayer = Layer.effect(TicketApprovalResolver, Effect.gen(function* () {
  const environment = yield* WorkerEnvironment, discord = yield* DiscordApi, sql = yield* SqlClient.SqlClient, counts = yield* TicketApprovalGuildCounts
  return TicketApprovalResolver.of({ resolve: (ticket, template) => resolveTicketApproval(ticket, template, environment).pipe(
    Effect.provideService(DiscordApi, discord),
    Effect.provideService(SqlClient.SqlClient, sql), Effect.provideService(TicketApprovalGuildCounts, counts)) })
}))
