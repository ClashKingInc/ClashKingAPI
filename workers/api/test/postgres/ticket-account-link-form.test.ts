import { PgClient } from "@effect/sql-pg"
import { Effect, Redacted } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"

import type { VerifiedRuntimeInteraction } from "../../src/runtime-interaction.js"
import { ticketAccountInteraction } from "../../src/ticket-account-runtime.js"
import { DiscordApi } from "../../src/discord-api.js"

if (!process.env.TEST_DATABASE_URL || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") {
  throw new Error("Run through the disposable Goose Timescale harness")
}
const database = PgClient.layer({ url: Redacted.make(process.env.TEST_DATABASE_URL), maxConnections: 3 })
const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient | DiscordApi>) =>
  Effect.runPromise(effect.pipe(Effect.provideService(DiscordApi, {
    request: () => Effect.die("Link forms must not call Discord"), token: () => Effect.die("Unexpected OAuth"),
  }), Effect.provide(database), Effect.scoped))
const settings = { questions: [], mod_role: [], no_ping_mod_role: [], private_thread: false,
  th_min: 0, num_apply: 25, naming: "{ticket_count}-{user}", account_apply: true,
  player_info: false, apply_clans: [], roles_to_add: [], roles_to_remove: [], townhall_requirements: {}, new_message: null }
const fixture = (suffix: number, options: { expired?: boolean; sourceMismatch?: boolean } = {}) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient, key = String(suffix).padStart(12, "0")
  const guildId = String(945000000000000000n + BigInt(suffix)), actorId = String(946000000000000000n + BigInt(suffix))
  const channelId = "947000000000000000", messageId = "948000000000000000"
  const panelId = `a5000000-0000-4000-8000-${key}`, buttonId = `a6000000-0000-4000-8000-${key}`
  const preparationId = `a7000000-0000-4000-8000-${key}`, customId = `ck:ticket:open:${panelId}:${buttonId}`
  yield* sql`INSERT INTO servers (id,name) VALUES (${guildId},'Ticket link form fixture')`
  const source = (yield* sql<{ updated_at: string }>`INSERT INTO ticket_panels (id,server_id,name,components,data)
    VALUES (${panelId}::uuid,${guildId},'Link form',
      ${JSON.stringify([{ id: buttonId, type: 2, custom_id: customId, style: 1, label: "Apply" }])}::jsonb,
      ${JSON.stringify({ [`${customId}_settings`]: settings })}::jsonb) RETURNING updated_at::text`)[0]!
  const effectId = `a5${String(suffix).padStart(62, "0")}`
  yield* sql`INSERT INTO ticket_panel_publication_effects
    (effect_id,panel_id,server_id,revision,source_updated_at,channel_id,payload,state,result_message_id)
    VALUES (${effectId},${panelId}::uuid,${guildId},1,${source.updated_at}::timestamptz,${channelId},'{}','succeeded',${messageId})`
  yield* sql`INSERT INTO ticket_panel_publications
    (effect_id,panel_id,server_id,revision,source_updated_at,channel_id,message_id)
    VALUES (${effectId},${panelId}::uuid,${guildId},1,${source.updated_at}::timestamptz,${channelId},${messageId})`
  yield* sql`INSERT INTO ticket_account_preparations
    (id,interaction_id,request_hash,action,actor_user_id,server_id,channel_id,origin_message_id,
      panel_id,button_id,source_updated_at,context,created_at,expires_at)
    VALUES (${preparationId}::uuid,${String(949000000000000000n + BigInt(suffix))},${"b".repeat(64)},'link',
      ${actorId},${guildId},${channelId},${messageId},${panelId}::uuid,${buttonId}::uuid,
      ${source.updated_at}::timestamptz - ${options.sourceMismatch ? "1 microsecond" : "0 seconds"}::interval,'{}',
      now() - ${options.expired ? "10 minutes" : "0 seconds"}::interval,
      now() + ${options.expired ? "-5 minutes" : "5 minutes"}::interval)`
  const proof: VerifiedRuntimeInteraction = {
    id: String(950000000000000000n + BigInt(suffix)), actorId, actorLabel: "Applicant", actorRoleIds: [],
    guildId, channelId, messageId: "951000000000000000", permissions: "0", requestHash: "c".repeat(64), signedAt: Date.now(),
    type: 3, data: { custom_id: `ck:ticket:link:${preparationId}`, component_type: 2 },
  }
  const snapshot = () => Effect.gen(function* () {
    return {
      preparations: yield* sql`SELECT to_jsonb(p) AS value,xmin::text AS version FROM ticket_account_preparations p WHERE id=${preparationId}::uuid`,
      receipts: yield* sql`SELECT to_jsonb(r) AS value FROM ticket_account_receipts r WHERE preparation_id=${preparationId}::uuid`,
      links: yield* sql`SELECT to_jsonb(l) AS value FROM player_links l WHERE user_id=${actorId}`,
      operations: yield* sql`SELECT id FROM ticket_runtime_operations WHERE server_id=${guildId}`,
      effects: yield* sql`SELECT effect_id FROM ticket_panel_publication_effects WHERE server_id=${guildId}`,
    }
  })
  return { sql, proof, panelId, preparationId, guildId, snapshot }
})

describe("actor-bound ticket linking forms", () => {
  it("uses the current default-off or enabled policy without account, receipt, or operation mutations", () => run(Effect.gen(function* () {
    const current = yield* fixture(1), before = yield* current.snapshot()
    for (const required of [false, true, false]) {
      yield* current.sql`UPDATE servers SET require_api_token_when_linking=${required} WHERE id=${current.guildId}`
      const result = yield* ticketAccountInteraction(current.proof)
      expect(result).toMatchObject({ outcome: "form", preparationId: current.preparationId,
        form: { kind: "modal", customId: `ck:ticket:link-submit:${current.preparationId}`, title: "Link an account",
          fields: [
            { customId: "player_tag", label: "Player tag", required: true, style: "short", maxLength: 12 },
            { customId: "api_token", label: "API token", required, style: "short", maxLength: 12 },
          ] } })
      expect(yield* current.snapshot()).toEqual(before)
    }
  })))

  it("rejects another actor, guild, or channel while accepting the ephemeral response message", () => run(Effect.gen(function* () {
    const current = yield* fixture(2), before = yield* current.snapshot()
    for (const override of [{ actorId: "952000000000000000" }, { guildId: "953000000000000000" }, { channelId: "954000000000000000" }]) {
      expect(yield* ticketAccountInteraction({ ...current.proof, ...override }).pipe(Effect.flip)).toMatchObject({ _tag: "Forbidden" })
    }
    expect(yield* ticketAccountInteraction(current.proof)).toMatchObject({ outcome: "form" })
    expect(yield* current.snapshot()).toEqual(before)
  })))

  it("rejects an expired preparation and a stale signed interaction", () => run(Effect.gen(function* () {
    const expired = yield* fixture(3, { expired: true }), fresh = yield* fixture(4)
    expect(yield* ticketAccountInteraction(expired.proof).pipe(Effect.flip)).toMatchObject({ _tag: "Forbidden" })
    expect(yield* ticketAccountInteraction({ ...fresh.proof, signedAt: Date.now() - 301_000 }).pipe(Effect.flip))
      .toMatchObject({ _tag: "Unauthenticated" })
  })))

  it("rejects a changed source fingerprint even when the publication remains active", () => run(Effect.gen(function* () {
    const current = yield* fixture(5, { sourceMismatch: true })
    expect(yield* ticketAccountInteraction(current.proof).pipe(Effect.flip))
      .toMatchObject({ _tag: "Forbidden", message: "Ticket linking source has changed" })
  })))

  it("rejects an archived or superseded opening panel", () => run(Effect.gen(function* () {
    const archived = yield* fixture(6), revised = yield* fixture(7)
    yield* archived.sql`UPDATE ticket_panels SET archived_at=now() WHERE id=${archived.panelId}::uuid`
    yield* revised.sql`UPDATE ticket_panels SET updated_at=updated_at+interval '1 microsecond' WHERE id=${revised.panelId}::uuid`
    for (const current of [archived, revised]) {
      expect(yield* ticketAccountInteraction(current.proof).pipe(Effect.flip)).toMatchObject({ _tag: "Forbidden" })
    }
  })))

  it("rejects an unknown preparation and keeps submission fail-closed", () => run(Effect.gen(function* () {
    const current = yield* fixture(8), before = yield* current.snapshot()
    expect(yield* ticketAccountInteraction({ ...current.proof,
      data: { custom_id: "ck:ticket:link:a7000000-0000-4000-8000-000000000099", component_type: 2 } }).pipe(Effect.flip))
      .toMatchObject({ _tag: "NotFound" })
    expect(yield* ticketAccountInteraction({ ...current.proof, type: 5,
      data: { custom_id: `ck:ticket:link-submit:${current.preparationId}` } }).pipe(Effect.flip))
      .toMatchObject({ _tag: "Conflict" })
    expect(yield* current.snapshot()).toEqual(before)
  })))
})
