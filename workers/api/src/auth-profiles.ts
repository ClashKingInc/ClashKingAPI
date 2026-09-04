import { DecimalSnowflake, type AuthUser, type CurrentUserResponse } from "@clashking/api-contracts"
import { Context, Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { UserPrincipal } from "./auth.js"
import type { SessionKind } from "./auth-crypto.js"
import { AuthSessions, emailAuthUser, requireSessionDevice, type AuthSession, type EmailAccount } from "./auth-sessions.js"
import { DiscordApi } from "./discord-api.js"
import { DiscordCredentials } from "./discord-credentials.js"
import { WorkerEnvironment } from "./environment.js"
import { DatabaseFailure, InvalidRequest, Unauthenticated, UpstreamUnavailable, type ApiFailure } from "./errors.js"
import { StoredTokenCipher } from "./fernet.js"

const OAuthTokens = Schema.Struct({ access_token: Schema.String, refresh_token: Schema.String, expires_in: Schema.Number })
const DiscordProfile = Schema.Struct({ id: DecimalSnowflake, username: Schema.String, discriminator: Schema.String,
  global_name: Schema.optionalKey(Schema.NullOr(Schema.String)), avatar: Schema.optionalKey(Schema.NullOr(Schema.String)),
})
export interface DiscordLogin {
  readonly code: string
  readonly code_verifier: string
  readonly redirect_uri: string
  readonly device_id: string
}

export class AuthProfiles extends Context.Service<AuthProfiles, {
  readonly discordLogin: (input: DiscordLogin, kind: SessionKind) => Effect.Effect<AuthSession, ApiFailure>
  readonly currentUser: (principal: UserPrincipal) => Effect.Effect<typeof CurrentUserResponse.Type, ApiFailure>
}>()("clashking/AuthProfiles") {
  static readonly layer = Layer.effect(AuthProfiles, Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const env = yield* WorkerEnvironment
    const discord = yield* DiscordApi
    const credentials = yield* DiscordCredentials
    const cipher = yield* StoredTokenCipher
    const sessions = yield* AuthSessions
    const profile = (access: string) => discord.request("/users/@me", { oauthAccessToken: access }).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(DiscordProfile)), Effect.mapError((cause) => cause._tag === "SchemaError"
        ? new UpstreamUnavailable({ cause, message: "Discord profile response is invalid" }) : cause),
    )
    return AuthProfiles.of({
      discordLogin: (input, kind) => Effect.gen(function* () {
        yield* requireSessionDevice(input.device_id, kind)
        if (!input.code.trim() || !input.code_verifier.trim() || !input.redirect_uri.trim()) {
          return yield* new InvalidRequest({ message: "Discord code, verifier, and redirect URI are required" })
        }
        if (!env.DISCORD_CLIENT_ID.trim() || !env.DISCORD_CLIENT_SECRET.trim()) {
          return yield* new UpstreamUnavailable({ cause: "Missing Discord client configuration", message: "Discord authentication is not configured" })
        }
        const tokens = yield* discord.token({ grant_type: "authorization_code", client_id: env.DISCORD_CLIENT_ID,
          client_secret: env.DISCORD_CLIENT_SECRET, code: input.code, code_verifier: input.code_verifier, redirect_uri: input.redirect_uri,
        }).pipe(Effect.flatMap(Schema.decodeUnknownEffect(OAuthTokens)), Effect.mapError((cause) => cause._tag === "SchemaError"
          ? new UpstreamUnavailable({ cause, message: "Discord did not provide valid session credentials" }) : cause))
        if (!tokens.access_token.trim() || !tokens.refresh_token.trim() || !Number.isFinite(tokens.expires_in)
          || tokens.expires_in <= 0 || !Number.isFinite(new Date(Date.now() + tokens.expires_in * 1000).valueOf())) {
          return yield* new UpstreamUnavailable({ cause: "Invalid Discord token lifetime or credential", message: "Discord did not provide valid session credentials" })
        }
        const user = discordAuthUser(yield* profile(tokens.access_token))
        const accessCiphertext = yield* cipher.encrypt(tokens.access_token)
        const refreshCiphertext = yield* cipher.encrypt(tokens.refresh_token)
        return yield* sql.withTransaction(Effect.gen(function* () {
          const stored = yield* database(sql<{ user_id: string }>`INSERT INTO auth_users (user_id,provider)
            VALUES (${user.user_id},'discord') ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
            WHERE auth_users.provider = 'discord' RETURNING user_id`)
          if (stored.length !== 1) return yield* new Unauthenticated({ message: "Discord identity does not match the existing account" })
          yield* database(sql`INSERT INTO auth_discord_tokens
            (user_id,device_id,access_token_ciphertext,refresh_token_ciphertext,expires_at)
            VALUES (${user.user_id},${input.device_id},${accessCiphertext},${refreshCiphertext},${new Date(Date.now() + tokens.expires_in * 1000)})
            ON CONFLICT (user_id,device_id) DO UPDATE SET access_token_ciphertext = EXCLUDED.access_token_ciphertext,
              refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext,expires_at = EXCLUDED.expires_at,updated_at = now()`)
          return { ...yield* sessions.issue(user.user_id, input.device_id, kind), user }
        })).pipe(Effect.mapError((cause) => cause._tag === "SqlError"
          ? new DatabaseFailure({ cause, message: "Discord authentication storage failed" }) : cause))
      }),
      currentUser: (principal) => Effect.gen(function* () {
        const rows = yield* database(sql<EmailAccount & { provider: string }>`SELECT user_id,provider,username,password_hash
          FROM auth_users WHERE user_id = ${principal.userId}`)
        const account = rows[0]
        if (account === undefined) return yield* new Unauthenticated({ message: "User session is no longer valid" })
        let user: typeof AuthUser.Type
        if (account.provider === "email") user = emailAuthUser(account)
        else if (account.provider === "discord") {
          if (principal.deviceId === undefined || principal.deviceId.trim() === "") {
            return yield* new Unauthenticated({ message: "Missing device identity" })
          }
          const access = yield* credentials.accessToken(principal.userId, principal.deviceId).pipe(Effect.provideService(SqlClient.SqlClient, sql))
          const current = yield* profile(access)
          if (current.id !== principal.userId) {
            return yield* new Unauthenticated({ message: "Discord session does not match the authenticated user" })
          }
          user = discordAuthUser(current)
        } else return yield* new Unauthenticated({ message: "User identity is not configured" })
        const counts = yield* database(sql<{ follower_count: number }>`SELECT COUNT(DISTINCT bookmarks.user_id)::float8 AS follower_count
          FROM player_links AS links JOIN user_bookmarks AS bookmarks ON bookmarks.tag = links.tag AND bookmarks.entity_type = 'player'
          WHERE links.user_id = ${principal.userId} AND links.is_verified = true`)
        return { ...user, account_summary: { follower_count: counts[0]?.follower_count ?? 0 } }
      }),
    })
  }))
}

export function discordAuthUser(profile: typeof DiscordProfile.Type): typeof AuthUser.Type {
  let avatar = ""
  if (profile.avatar !== null && profile.avatar !== undefined) {
    if (profile.avatar !== "") avatar = `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${profile.avatar.startsWith("a_") ? "gif" : "png"}`
  } else if (/^\d+$/u.test(profile.discriminator)) {
    // Match disgo's EffectiveAvatarURL, including its legacy discriminator branch.
    const legacy = BigInt(profile.discriminator) % 5n
    const index = legacy === 0n ? (BigInt(profile.id) >> 22n) % 6n : legacy
    avatar = `https://cdn.discordapp.com/embed/avatars/${index}.png`
  }
  return { user_id: profile.id, username: profile.global_name ?? profile.username, avatar_url: avatar, auth_methods: ["discord"] }
}

function database<A, E>(operation: Effect.Effect<A, E>) {
  return operation.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Authentication profile storage failed" })))
}
