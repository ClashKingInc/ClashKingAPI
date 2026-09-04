import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"
import { AuthCrypto } from "../../src/auth-crypto.js"
import { AuthProfiles, discordAuthUser } from "../../src/auth-profiles.js"
import { AuthSessions } from "../../src/auth-sessions.js"
import { databaseLayer } from "../../src/database.js"
import { DiscordApi } from "../../src/discord-api.js"
import { DiscordCredentials } from "../../src/discord-credentials.js"
import { WorkerEnvironment, type WorkerBindings } from "../../src/environment.js"
import { DatabaseFailure, InvalidRequest, Unauthenticated, UpstreamUnavailable } from "../../src/errors.js"
import { StoredTokenCipher } from "../../src/fernet.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (databaseUrl === undefined || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") {
  throw new Error("Run this suite through clashking_schemas/scripts/with-test-timescale.sh")
}
const bindings = { HYPERDRIVE: { connectionString: databaseUrl }, JWT_ACCESS_SECRET: "fixture-access-secret",
  JWT_REFRESH_SECRET: "fixture-refresh-secret", NATIVE_TOKEN_AUDIENCE: "fixture-native", WEB_TOKEN_AUDIENCE: "fixture-web",
  DATA_ENCRYPTION_KEY: "11".repeat(32), DISCORD_CLIENT_ID: "fixture-client", DISCORD_CLIENT_SECRET: "fixture-secret",
} as WorkerBindings
const idA = "923456789012345671", idB = "923456789012345672"
const input = (id = idA, device = "browser-a") => ({ code: id, code_verifier: "fixture-verifier", redirect_uri: "https://dash.clashk.ing/auth/callback", device_id: device })
const profile = (id: string) => ({ id, username: "Reader", global_name: "Display name", discriminator: "0", avatar: "a_avatar" })
const mockDiscord = () => DiscordApi.of({
  token: vi.fn((request) => Effect.succeed({ access_token: `access-${request.code}`, refresh_token: `refresh-${request.code}`, expires_in: 3600 })),
  request: vi.fn((_path, options) => Effect.succeed(profile(options!.oauthAccessToken!.replace("access-", "")))),
})
const run = <A, E>(program: Effect.Effect<A, E, AuthProfiles | AuthSessions | StoredTokenCipher | SqlClient.SqlClient>,
  discord = mockDiscord(), sessions?: AuthSessions["Service"]) => Effect.runPromise(program.pipe(
  Effect.provide(AuthProfiles.layer), Effect.provide(DiscordCredentials.layer),
  Effect.provide(sessions === undefined ? AuthSessions.layer : Layer.succeed(AuthSessions, sessions)),
  Effect.provide(AuthCrypto.layer), Effect.provide(StoredTokenCipher.layer), Effect.provideService(DiscordApi, discord),
  Effect.provideService(WorkerEnvironment, bindings), Effect.provide(databaseLayer(bindings)), Effect.scoped,
))

describe("Discord auth and current user against authoritative Goose migrations", () => {
  it("stores encrypted Discord credentials by user and device, with Go-compatible user profiles", async () => {
    const discord = mockDiscord()
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const auth = yield* AuthProfiles
      const cipher = yield* StoredTokenCipher
      const session = yield* auth.discordLogin(input(), "web")
      yield* auth.discordLogin(input(idA, "browser-b"), "web")
      yield* auth.discordLogin(input(idB), "native")
      expect(session.user).toEqual({ user_id: idA, username: "Display name", auth_methods: ["discord"],
        avatar_url: `https://cdn.discordapp.com/avatars/${idA}/a_avatar.gif` })
      expect(yield* sql`SELECT provider,email_hash,username,password_hash FROM auth_users WHERE user_id = ${idA}`)
        .toEqual([{ provider: "discord", email_hash: null, username: null, password_hash: null }])
      const rows = yield* sql<{ user_id: string; device_id: string; access_token_ciphertext: string; refresh_token_ciphertext: string }>`
        SELECT user_id,device_id,access_token_ciphertext,refresh_token_ciphertext FROM auth_discord_tokens WHERE user_id IN (${idA},${idB})`
      expect(rows).toHaveLength(3)
      for (const row of rows) {
        expect(row.access_token_ciphertext).not.toBe(`access-${row.user_id}`)
        expect(yield* cipher.decrypt(row.access_token_ciphertext)).toBe(`access-${row.user_id}`)
        expect(yield* cipher.decrypt(row.refresh_token_ciphertext)).toBe(`refresh-${row.user_id}`)
      }
      const me = yield* auth.currentUser({ kind: "user", userId: idA, deviceId: "browser-a" })
      expect(me.user_id).toBe(idA)
      expect(me.account_summary.follower_count).toBe(0)
    }), discord)
    expect(discord.token).toHaveBeenCalledWith({ grant_type: "authorization_code", client_id: "fixture-client", client_secret: "fixture-secret",
      code: idA, code_verifier: "fixture-verifier", redirect_uri: "https://dash.clashk.ing/auth/callback" })
  })

  it("rejects incomplete input before OAuth and incomplete OAuth credentials before storage", async () => {
    const discord = mockDiscord()
    for (const body of [{ ...input(), code_verifier: "" }, { ...input(), device_id: " " }]) {
      await expect(run(AuthProfiles.use((auth) => auth.discordLogin(body, "web")), discord)).rejects.toBeInstanceOf(InvalidRequest)
    }
    expect(discord.token).not.toHaveBeenCalled()
    for (const returned of [{ access_token: "access", expires_in: 3600 }, { access_token: "", refresh_token: "refresh", expires_in: 3600 },
      { access_token: "access", refresh_token: "refresh", expires_in: -1 }]) {
      await expect(run(AuthProfiles.use((auth) => auth.discordLogin(input("923456789012345673"), "web")),
        { ...discord, token: () => Effect.succeed(returned) })).rejects.toBeInstanceOf(UpstreamUnavailable)
    }
    expect(discord.request).not.toHaveBeenCalled()
  })

  it("rolls back the Discord user and credential rows if app session storage fails", async () => {
    const id = "923456789012345674"
    const fail = () => Effect.fail(new DatabaseFailure({ cause: "fixture failure", message: "Fixture session failure" }))
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const auth = yield* AuthProfiles
      expect(yield* auth.discordLogin(input(id), "web").pipe(Effect.flip)).toBeInstanceOf(DatabaseFailure)
      expect(yield* sql`SELECT user_id FROM auth_users WHERE user_id = ${id}`).toHaveLength(0)
      expect(yield* sql`SELECT user_id FROM auth_discord_tokens WHERE user_id = ${id}`).toHaveLength(0)
    }), mockDiscord(), AuthSessions.of({ issue: fail, emailLogin: fail, refresh: fail, logout: fail }))
  })

  it("requires the authenticated Discord device and rejects a mismatching provider profile", async () => {
    const id = "923456789012345675"
    const discord = mockDiscord()
    await run(Effect.gen(function* () {
      const auth = yield* AuthProfiles
      yield* auth.discordLogin(input(id), "web")
      expect(yield* auth.currentUser({ kind: "user", userId: id }).pipe(Effect.flip)).toBeInstanceOf(Unauthenticated)
      expect(yield* auth.currentUser({ kind: "user", userId: id, deviceId: "unrelated-device" }).pipe(Effect.flip)).toBeInstanceOf(Unauthenticated)
    }), discord)
    await expect(run(AuthProfiles.use((auth) => auth.currentUser({ kind: "user", userId: id, deviceId: "browser-a" })),
      { ...mockDiscord(), request: () => Effect.succeed(profile(idB)) })).rejects.toBeInstanceOf(Unauthenticated)
  })

  it("counts distinct followers only for the current user's verified player links", async () => {
    const discord = mockDiscord()
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const auth = yield* AuthProfiles
      const id = crypto.randomUUID()
      yield* sql`INSERT INTO auth_users(user_id,provider,email_hash,username,password_hash) VALUES (${id},'email',${id},'Email reader','fixture-hash')`
      yield* sql`INSERT INTO player_links(tag,user_id,is_verified,source) VALUES
        ('#P0YQQQ',${id},true,'fixture'),('#P0YQQR',${id},true,'fixture'),('#P0YQQG',${id},false,'fixture')`
      yield* sql`INSERT INTO user_bookmarks(user_id,entity_type,tag) VALUES
        ('follower-a','player','#P0YQQQ'),('follower-a','player','#P0YQQR'),('follower-b','player','#P0YQQQ'),
        ('ignored-clan','clan','#P0YQQQ'),('ignored-unverified','player','#P0YQQG')`
      const me = yield* auth.currentUser({ kind: "user", userId: id })
      expect(me).toMatchObject({ user_id: id, username: "Email reader", auth_methods: ["email"], account_summary: { follower_count: 2 } })
    }), discord)
    expect(discord.request).not.toHaveBeenCalled()
  })

  it("matches disgo's custom, animated, default and empty-avatar behavior", () => {
    const base = { id: idA, username: "Name", discriminator: "0002" }
    expect(discordAuthUser(base).avatar_url).toBe("https://cdn.discordapp.com/embed/avatars/2.png")
    expect(discordAuthUser({ ...base, avatar: "" }).avatar_url).toBe("")
    expect(discordAuthUser({ ...base, avatar: "hash" }).avatar_url).toBe(`https://cdn.discordapp.com/avatars/${idA}/hash.png`)
    expect(discordAuthUser({ ...base, global_name: "" }).username).toBe("")
  })
})
