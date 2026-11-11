import { PushTokenRotationEndpoint } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { AuthIdentity, sameSecret } from "./auth.js"
import type { WorkerBindings } from "./environment.js"
import { DatabaseFailure, Forbidden, InvalidRequest, NotFound, UpstreamUnavailable } from "./errors.js"
import { readBoundedJson } from "./request-body.js"
import { decryptDevicePushToken, decryptPushToken, encryptPushToken, hashPushToken } from "./push-secrets.js"

interface DeviceRow {
  user_id: string; device_id: string; provider: string; environment: string
  token_ciphertext: string; token_hash: string
}

// Disabled without the temporary operator secret. Normal bot authorization is
// insufficient: rotation also requires this independent secret, never a key in
// the request body. Removing it closes the maintenance operation after repair.
export const dispatchPushTokenRotation = (request: Request, keys: WorkerBindings) => Effect.gen(function* () {
  if (request.method !== "POST" || new URL(request.url).pathname !== PushTokenRotationEndpoint.path) return undefined
  if (!keys.PUSH_TOKEN_MIGRATION_SECRET) return yield* new NotFound({ message: "Not found" })
  yield* (yield* AuthIdentity).requireBot(request)
  if (!(yield* sameSecret(request.headers.get("x-push-token-migration-key") ?? "", keys.PUSH_TOKEN_MIGRATION_SECRET))) {
    return yield* new Forbidden({ message: "Push token maintenance is not authorized" })
  }
  if (!keys.DATA_ENCRYPTION_KEY) return yield* new UpstreamUnavailable({ cause: undefined, message: "Current encryption is not configured" })
  const body = yield* Schema.decodeUnknownEffect(PushTokenRotationEndpoint.body)(yield* readBoundedJson(request)).pipe(
    Effect.mapError(() => new InvalidRequest({ message: "Invalid rotation request" })),
  )
  // This explicitly enabled handoff transfers only an authenticated encrypted
  // copy to the operator, so the reader can use the existing API key. Never
  // return plaintext keys or device tokens. Disable the operator secret after repair.
  if (body.action === "handoff") return Response.json({ visited: 0, rotated: 0, current: 0, unreadable: 0, conflicts: 0, next: null,
    wrappedCurrentKey: yield* encryptPushToken(keys.DATA_ENCRYPTION_KEY, keys.PUSH_TOKEN_MIGRATION_SECRET),
  }, { headers: { "cache-control": "no-store" } })
  const after = yield* Effect.try({
    try: () => {
      const value: unknown = body.after ? JSON.parse(decodeURIComponent(body.after)) : ["", "", "", ""]
      if (!Array.isArray(value) || value.length !== 4 || value.some(v => typeof v !== "string")) throw new Error()
      return value as [string, string, string, string]
    }, catch: () => new InvalidRequest({ message: "Invalid rotation cursor" }),
  })
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<DeviceRow>`SELECT user_id,device_id,provider,environment,token_ciphertext,token_hash
    FROM mobile_push_devices WHERE (user_id,device_id,provider,environment)>(${after[0]},${after[1]},${after[2]},${after[3]})
    ORDER BY user_id,device_id,provider,environment LIMIT 100`
  let rotated = 0, current = 0, unreadable = 0, conflicts = 0
  for (const row of rows) {
    const existing = yield* Effect.result(decryptPushToken(row.token_ciphertext, keys.DATA_ENCRYPTION_KEY))
    if (existing._tag === "Success" && (yield* hashPushToken(existing.success)) === row.token_hash) { current++; continue }
    const decoded = yield* Effect.result(decryptDevicePushToken(row.token_ciphertext, keys))
    if (decoded._tag === "Failure" || (yield* hashPushToken(decoded.success)) !== row.token_hash) { unreadable++; continue }
    if (body.dryRun) { rotated++; continue }
    const ciphertext = yield* encryptPushToken(decoded.success, keys.DATA_ENCRYPTION_KEY)
    // Registration may replace a token while this page runs. Never overwrite
    // that newer registration or alter user settings, token hashes, or timestamps.
    const changed = yield* sql`UPDATE mobile_push_devices SET token_ciphertext=${ciphertext}
      WHERE user_id=${row.user_id} AND device_id=${row.device_id} AND provider=${row.provider}
        AND environment=${row.environment} AND token_ciphertext=${row.token_ciphertext} AND token_hash=${row.token_hash}
      RETURNING device_id`
    if (changed.length) rotated++; else conflicts++
  }
  const last = rows.at(-1)
  return Response.json({ visited: rows.length, rotated, current, unreadable, conflicts,
    next: rows.length === 100 && last ? encodeURIComponent(JSON.stringify([last.user_id,last.device_id,last.provider,last.environment])) : null,
  }, { headers: { "cache-control": "no-store" } })
}).pipe(Effect.catchTag("SqlError", cause => Effect.fail(new DatabaseFailure({ cause, message: "Push token rotation failed" }))))
