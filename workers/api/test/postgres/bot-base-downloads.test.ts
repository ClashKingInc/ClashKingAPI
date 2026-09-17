import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { afterEach, describe, expect, it, vi } from "vitest"

import { BotAdjacentStore } from "../../src/bot-adjacent-runtime.js"
import { databaseLayer } from "../../src/database.js"
import { DiscordApi } from "../../src/discord-api.js"
import { WorkerEnvironment, type WorkerBindings } from "../../src/environment.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Run through clashking_schemas/scripts/with-test-timescale.sh")
const bindings = { HYPERDRIVE: { connectionString: databaseUrl }, MEDIA: { put: vi.fn(async () => ({ key: "test" })) } } as unknown as WorkerBindings
const dependencies = Layer.mergeAll(
  databaseLayer(bindings), WorkerEnvironment.layer(bindings),
  Layer.succeed(DiscordApi, { request: () => Effect.die("Unexpected Discord request"), token: () => Effect.die("Unexpected Discord token") }),
)
const layer = BotAdjacentStore.layer.pipe(Layer.provide(dependencies))
afterEach(() => vi.unstubAllGlobals())

describe("posted base downloads against authoritative Goose migrations", () => {
  it("keeps concurrent voters and image positions on the base row", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("image", { headers: { "content-type": "image/png" } })))
    await Effect.runPromise(Effect.gen(function* () {
      const store = yield* BotAdjacentStore, sql = yield* SqlClient.SqlClient
      const base = (yield* sql<{id:string}>`INSERT INTO bases(base_link,message_id) VALUES
        ('https://link.clashofclans.com/en?action=OpenLayout&id=INLINE','7560000000000000099') RETURNING id::text`)[0]!
      yield* Effect.all(Array.from({length:10},(_,i)=>store.upsertBaseVote(base.id,String(100+i),"up")),{concurrency:10})
      yield* store.upsertBaseVote(base.id,"100","down")
      yield* store.upsertBaseVote(base.id,"100","down")
      yield* store.removeBaseVote(base.id,"101")
      yield* store.removeBaseVote(base.id,"101")
      expect((yield* sql`SELECT upvote_count::int,downvote_count::int FROM base_public_counts WHERE base_id=${base.id}::bigint`)[0]).toEqual({upvote_count:8,downvote_count:1})
      const third=yield* store.stageLegacyBaseImage(base.id,3,"https://cdn.discordapp.com/a.png")
      const images=yield* Effect.all([store.stageLegacyBaseImage(base.id,1,"https://cdn.discordapp.com/a.png"),store.stageLegacyBaseImage(base.id,2,"https://cdn.discordapp.com/b.png")],{concurrency:2})
      expect((yield* store.stageLegacyBaseImage(base.id,3,"https://cdn.discordapp.com/c.png")).imageUrl).toBe(third.imageUrl)
      expect((yield* store.resolveLegacyBase("7560000000000000099")).images).toEqual([images[0]!.imageUrl,images[1]!.imageUrl,third.imageUrl])
      expect((yield* sql`SELECT to_regclass('public.base_images') images,to_regclass('public.base_votes') votes`)[0]).toEqual({images:null,votes:null})
    }).pipe(Effect.provide(layer),Effect.provide(dependencies),Effect.scoped))
  })
  it("stores one immutable first-download timestamp and saves every authenticated click", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const store = yield* BotAdjacentStore
      const sql = yield* SqlClient.SqlClient
      const userId = "7560000000000000001"
      yield* sql`INSERT INTO auth_users(user_id,provider) VALUES (${userId},'discord')`
      const base = (yield* sql<{ id: string }>`INSERT INTO bases(base_link,message_id,server_id,channel_id,description)
        VALUES ('https://link.clashofclans.com/en?action=OpenLayout&id=BOT19','7560000000000000012','7560000000000000013','7560000000000000014','Bot') RETURNING id::text`)[0]!
      expect(yield* store.recordBaseDownload(base.id, userId)).toEqual({ baseId: base.id, userId, downloadCount: 1 })
      const first = (yield* sql<{ downloaded_at: string }>`SELECT downloads->>${userId} downloaded_at FROM bases WHERE id=${base.id}::bigint`)[0]!.downloaded_at
      expect(yield* store.recordBaseDownload(base.id, userId)).toEqual({ baseId: base.id, userId, downloadCount: 1 })
      expect((yield* sql<{ downloaded_at: string }>`SELECT downloads->>${userId} downloaded_at FROM bases WHERE id=${base.id}::bigint`)[0]!.downloaded_at).toBe(first)
      expect(yield* sql`SELECT user_id,base_id::text,kind FROM user_saved_bases WHERE user_id=${userId}`).toEqual([{ user_id: userId, base_id: base.id, kind: null }])
    }).pipe(Effect.provide(layer), Effect.provide(dependencies), Effect.scoped))
  })
})
