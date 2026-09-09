import { DecimalSnowflake, GiveawayBooster } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { DiscordApi } from "./discord-api.js"
import { Conflict, DatabaseFailure, NotFound, UpstreamUnavailable } from "./errors.js"

interface Run {
  readonly id: string; readonly server_id: string; readonly cursor: string; readonly entry_count: string
  readonly winner_count: number; readonly boosters: unknown; readonly state: string
}
const MemberRoles = Schema.Struct({ user: Schema.Struct({ id: DecimalSnowflake }), roles: Schema.Array(DecimalSnowflake) })
export const giveawayRoleWeight = (boosters: readonly (typeof GiveawayBooster.Type)[], roles: readonly string[]) => {
  const applicable = boosters.filter((boost) => boost.roles.some((role) => roles.includes(role))).map((boost) => boost.value)
  return applicable.length === 0 ? 1 : Math.max(...applicable)
}
export const giveawayUniform = () => {
  const words = crypto.getRandomValues(new Uint32Array(2))
  // 52 random bits plus half a unit stays representably inside (0,1).
  return (((words[0]! & 0xfffff) * 4_294_967_296 + words[1]!) + 0.5) / 4_503_599_627_370_496
}
/** Log-domain exponential races preserve ordering without weight overflow. */
export const giveawayRaceScore = (weight: number, uniform = giveawayUniform()) => Math.log(-Math.log(uniform)) - Math.log(weight)

/** One bounded page per call; persisted SQL scores are never sampled again. */
export const resolveEndingGiveaway = (giveawayId: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const initialized = yield* sql.withTransaction(Effect.gen(function* () {
    const rows = yield* sql<{ id: string; ended: boolean; winner_count: number; existing_winners: number; channel_id: string | null }>`
      SELECT id,status='ended' AND end_time <= clock_timestamp() AS ended,winners AS winner_count,
        jsonb_array_length(winners_list) AS existing_winners,channel_id FROM giveaways WHERE id=${giveawayId} FOR UPDATE`
    const giveaway = rows[0]
    if (giveaway === undefined) return yield* new NotFound({ message: "Giveaway not found" })
    if (!giveaway.ended || giveaway.channel_id === null) return yield* new Conflict({ message: "Giveaway is not ready to resolve" })
    const prior = (yield* sql<Run>`SELECT id::text,server_id,cursor::text,entry_count::text,winner_count,boosters,state
      FROM giveaway_outcome_runs WHERE giveaway_id=${giveawayId}`)[0]
    if (prior !== undefined) return { done: prior.state === "completed", run: prior }
    // Imported completed outcomes already are authoritative; do not reroll them.
    if (giveaway.existing_winners > 0) return { done: true, run: undefined }
    const invalid = (yield* sql<{ count: number }>`SELECT count(*)::int AS count FROM giveaways,
      LATERAL jsonb_array_elements(entries) entry WHERE id=${giveawayId} AND
      COALESCE(CASE WHEN jsonb_typeof(entry)='string' THEN entry#>>'{}' ELSE entry->>'user_id' END,'') !~ '^[1-9][0-9]{0,19}$'`)[0]?.count
    if (invalid !== 0) return yield* new Conflict({ message: "Giveaway contains invalid participant identities", reason: "invalid_configuration" })
    const inserted = yield* sql<Run>`INSERT INTO giveaway_outcome_runs(giveaway_id,server_id,channel_id,start_time,end_time,
      source_updated_at,winner_count,boosters,entry_count)
      SELECT id,server_id,channel_id,start_time,end_time,updated_at,winners,boosters,
        (SELECT count(DISTINCT CASE WHEN jsonb_typeof(entry)='string' THEN entry#>>'{}' ELSE entry->>'user_id' END)
          FROM jsonb_array_elements(entries) entry) FROM giveaways WHERE id=${giveawayId}
      RETURNING id::text,server_id,cursor::text,entry_count::text,winner_count,boosters,state`
    const run = inserted[0]!
    yield* sql`INSERT INTO giveaway_outcome_entries(run_id,user_id,ordinal)
      SELECT ${run.id}::uuid,user_id,row_number() OVER(ORDER BY user_id) FROM
        (SELECT DISTINCT CASE WHEN jsonb_typeof(entry)='string' THEN entry#>>'{}' ELSE entry->>'user_id' END AS user_id
          FROM giveaways,LATERAL jsonb_array_elements(entries) entry WHERE id=${giveawayId}) participants`
    return { done: false, run }
  }))
  if (initialized.done) return true
  const token = crypto.randomUUID()
  const claimed = (yield* sql<Run>`UPDATE giveaway_outcome_runs SET lease_token=${token}::uuid,
    lease_expires_at=clock_timestamp()+interval '90 seconds',attempt_count=attempt_count+1,updated_at=clock_timestamp()
    WHERE giveaway_id=${giveawayId} AND state='resolving' AND (lease_expires_at IS NULL OR lease_expires_at < clock_timestamp())
    RETURNING id::text,server_id,cursor::text,entry_count::text,winner_count,boosters,state`)[0]
  if (claimed === undefined) {
    if (initialized.run?.state === "failed") return yield* new Conflict({ message: "Giveaway outcome requires reconciliation" })
    return false
  }
  return yield* Effect.gen(function* () {
    const boosters = yield* Schema.decodeUnknownEffect(Schema.Array(GiveawayBooster))(claimed.boosters).pipe(
      Effect.mapError(() => new Conflict({ message: "Giveaway boosters are invalid", reason: "invalid_configuration" })),
    )
    if (boosters.some((boost) => !Number.isFinite(boost.value) || boost.value < 0)) return yield* new Conflict({ message: "Giveaway boosters must have nonnegative finite weights", reason: "invalid_configuration" })
    const entries = yield* sql<{ user_id: string; ordinal: string }>`SELECT user_id,ordinal::text
      FROM giveaway_outcome_entries WHERE run_id=${claimed.id}::uuid AND ordinal > ${claimed.cursor}::bigint
      ORDER BY giveaway_outcome_entries.ordinal LIMIT 10`
    const discord = yield* DiscordApi
    const scores = yield* Effect.forEach(entries, (entry) => Effect.gen(function* () {
      // No sampling is needed when every participant wins, and legacy kept all.
      const allWin = BigInt(claimed.entry_count) <= BigInt(claimed.winner_count)
      const roles = allWin ? [] : yield* discord.request(`/guilds/${claimed.server_id}/members/${entry.user_id}`).pipe(
        Effect.flatMap((value) => Schema.decodeUnknownEffect(MemberRoles)(value).pipe(
          Effect.mapError(() => new UpstreamUnavailable({ cause: undefined, message: "Discord member roles are invalid" })),
          Effect.flatMap((member) => member.user.id === entry.user_id ? Effect.succeed(member.roles) : Effect.fail(new UpstreamUnavailable({ cause: undefined, message: "Discord member identity mismatch" }))),
        )),
        Effect.catchTag("NotFound", () => Effect.succeed([] as readonly string[])),
      )
      const weight = allWin ? 1 : giveawayRoleWeight(boosters, roles)
      return { ...entry, weight, score: weight === 0 ? null : allWin ? 0 : giveawayRaceScore(weight) }
    }), { concurrency: 5 })
    return yield* sql.withTransaction(Effect.gen(function* () {
      // Same lock order as initialization and publication preparation.
      yield* sql`SELECT id FROM giveaways WHERE id=${giveawayId} FOR UPDATE`
      const fenced = yield* sql<{ id: string }>`SELECT id FROM giveaway_outcome_runs WHERE id=${claimed.id}::uuid
        AND lease_token=${token}::uuid AND lease_expires_at > clock_timestamp() AND cursor=${claimed.cursor}::bigint AND state='resolving' FOR UPDATE`
      if (fenced.length !== 1) return false
      const identity = (yield* sql<{ valid: boolean }>`SELECT EXISTS(SELECT 1 FROM giveaways g JOIN giveaway_outcome_runs r
        ON g.id=r.giveaway_id AND g.server_id=r.server_id AND g.channel_id=r.channel_id AND g.start_time=r.start_time
        AND g.end_time=r.end_time AND g.updated_at=r.source_updated_at
        WHERE r.id=${claimed.id}::uuid AND g.status='ended' AND jsonb_array_length(g.winners_list)=0) AS valid`)[0]?.valid
      if (!identity) {
        yield* sql`UPDATE giveaway_outcome_runs SET state='failed',last_error='giveaway_identity_changed',
          lease_token=NULL,lease_expires_at=NULL,updated_at=clock_timestamp() WHERE id=${claimed.id}::uuid`
        return false
      }
      for (const entry of scores) yield* sql`UPDATE giveaway_outcome_entries SET weight=${entry.weight},score=${entry.score}
        WHERE run_id=${claimed.id}::uuid AND ordinal=${entry.ordinal}::bigint AND weight IS NULL`
      const cursor = scores.at(-1)?.ordinal ?? claimed.cursor
      const complete = BigInt(cursor) === BigInt(claimed.entry_count)
      if (complete) {
        const positive = (yield* sql<{ count: string }>`SELECT count(*)::text AS count FROM giveaway_outcome_entries
          WHERE run_id=${claimed.id}::uuid AND weight>0`)[0]!.count
        if (BigInt(claimed.entry_count) > BigInt(claimed.winner_count) && BigInt(positive) < BigInt(claimed.winner_count)) {
          yield* sql`UPDATE giveaway_outcome_runs SET cursor=${cursor}::bigint,state='failed',last_error='insufficient_positive_weights',
            lease_token=NULL,lease_expires_at=NULL,updated_at=clock_timestamp() WHERE id=${claimed.id}::uuid`
          return false
        }
        yield* sql`UPDATE giveaways SET winners_list=COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id',user_id,
            'status','winner','timestamp',clock_timestamp()) ORDER BY score,user_id)
          FROM (SELECT user_id,score FROM giveaway_outcome_entries WHERE run_id=${claimed.id}::uuid
            AND score IS NOT NULL AND weight>0 ORDER BY score,user_id LIMIT ${claimed.winner_count}) winners),'[]'::jsonb),
          updated_at=clock_timestamp() WHERE id=${giveawayId}`
      }
      yield* sql`UPDATE giveaway_outcome_runs SET cursor=${cursor}::bigint,state=${complete ? "completed" : "resolving"},
        completed_at=${complete ? new Date().toISOString() : null}::timestamptz,lease_token=NULL,lease_expires_at=NULL,
        updated_at=clock_timestamp() WHERE id=${claimed.id}::uuid AND lease_token=${token}::uuid`
      return complete
    }))
  }).pipe(Effect.tapError((failure) => sql`UPDATE giveaway_outcome_runs SET lease_token=NULL,lease_expires_at=NULL,
    state=${failure instanceof Conflict ? "failed" : "resolving"},last_error='outcome_page_failed',updated_at=clock_timestamp()
    WHERE id=${claimed.id}::uuid AND lease_token=${token}::uuid`.pipe(Effect.ignore)))
}).pipe(Effect.catchTag("SqlError", (cause) => Effect.fail(new DatabaseFailure({ cause, message: "Giveaway outcome storage is unavailable" }))))
