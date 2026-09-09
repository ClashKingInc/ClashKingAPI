import { Context, Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { DiscordApi } from "./discord-api.js"
import { DatabaseFailure, Unauthenticated, UpstreamUnavailable, type ApiFailure } from "./errors.js"
import { WorkerEnvironment } from "./environment.js"
import { StoredTokenCipher } from "./fernet.js"

const TokenResponse = Schema.Struct({
  access_token: Schema.String,
  expires_in: Schema.Number,
  refresh_token: Schema.optionalKey(Schema.String),
})

interface TokenRow {
  readonly access_token_ciphertext: string
  readonly expires_at: Date | string | null
  readonly refresh_token_ciphertext: string | null
}

export class DiscordCredentials extends Context.Service<
  DiscordCredentials,
  {
    readonly accessToken: (
      userId: string,
      deviceId: string | undefined,
    ) => Effect.Effect<string, ApiFailure, SqlClient.SqlClient>
  }
>()("clashking/DiscordCredentials") {
  static readonly layer = Layer.effect(
    DiscordCredentials,
    Effect.gen(function* () {
      const bindings = yield* WorkerEnvironment
      const discord = yield* DiscordApi
      const cipher = yield* StoredTokenCipher

      const accessToken = Effect.fn("DiscordCredentials.accessToken")(function* (
        userId: string,
        deviceId: string | undefined,
      ) {
        if (deviceId === undefined || deviceId.trim().length === 0) {
          return yield* new Unauthenticated({ message: "Missing device identity" })
        }
        const sql = yield* SqlClient.SqlClient
        // Reading a usable access token does not rotate any state and should
        // not serialize every Dashboard request on this device's token row.
        const currentRows = yield* sql<TokenRow>`SELECT access_token_ciphertext, refresh_token_ciphertext, expires_at
          FROM auth_discord_tokens WHERE user_id = ${userId} AND device_id = ${deviceId}`
          .pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Discord credential lookup failed" })))
        const current = currentRows[0]
        if (current === undefined || !current.access_token_ciphertext || !current.refresh_token_ciphertext) {
          return yield* new Unauthenticated({ message: "Missing Discord token; please link your Discord account" })
        }
        const currentExpiry = current.expires_at === null ? 0 : new Date(current.expires_at).valueOf()
        if (Number.isFinite(currentExpiry) && currentExpiry - 60_000 > Date.now()) return yield* cipher.decrypt(current.access_token_ciphertext)
        return yield* sql.withTransaction(Effect.gen(function* () {
        const rows = yield* sql<TokenRow>`
          SELECT access_token_ciphertext, refresh_token_ciphertext, expires_at
          FROM auth_discord_tokens WHERE user_id = ${userId} AND device_id = ${deviceId}
          FOR UPDATE
        `.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Discord credential lookup failed" })))
        const row = rows[0]
        if (row === undefined || row.access_token_ciphertext.length === 0 ||
            row.refresh_token_ciphertext === null || row.refresh_token_ciphertext.length === 0) {
          return yield* new Unauthenticated({ message: "Missing Discord token; please link your Discord account" })
        }
        const access = yield* cipher.decrypt(row.access_token_ciphertext)
        const expiresAt = row.expires_at === null ? 0 : new Date(row.expires_at).valueOf()
        if (Number.isFinite(expiresAt) && expiresAt - 60_000 > Date.now()) return access

        const refresh = yield* cipher.decrypt(row.refresh_token_ciphertext)
        const token = yield* discord.token({
          client_id: bindings.DISCORD_CLIENT_ID,
          client_secret: bindings.DISCORD_CLIENT_SECRET,
          grant_type: "refresh_token",
          refresh_token: refresh,
        })
        const decoded = yield* Schema.decodeUnknownEffect(TokenResponse)(token).pipe(
          Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Discord token response is invalid" })),
        )
        if (decoded.access_token.length === 0 || !Number.isFinite(decoded.expires_in) || decoded.expires_in <= 0) {
          return yield* new UpstreamUnavailable({ cause: new Error("Invalid token lifetime or empty credential"), message: "Discord token response is invalid" })
        }
        const encryptedAccess = yield* cipher.encrypt(decoded.access_token)
        const encryptedRefresh = decoded.refresh_token === undefined || decoded.refresh_token.trim().length === 0
          ? row.refresh_token_ciphertext
          : yield* cipher.encrypt(decoded.refresh_token)
        yield* sql`
          UPDATE auth_discord_tokens SET access_token_ciphertext = ${encryptedAccess},
            refresh_token_ciphertext = ${encryptedRefresh},
            expires_at = ${new Date(Date.now() + decoded.expires_in * 1_000)}, updated_at = now()
          WHERE user_id = ${userId} AND device_id = ${deviceId}
        `.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Discord credential refresh could not be stored" })))
        return decoded.access_token
        })).pipe(Effect.mapError((cause) => cause._tag === "SqlError"
          ? new DatabaseFailure({ cause, message: "Discord credential transaction failed" })
          : cause))
      })

      return { accessToken }
    }),
  )
}
