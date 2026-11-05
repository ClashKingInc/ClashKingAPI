import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { AuthIdentity } from "./auth.js"
import { DatabaseFailure, InvalidRequest } from "./errors.js"
import { readBoundedJson } from "./request-body.js"

// The bot supplies the actor from a verified Discord interaction. This route
// accepts only a bot credential; it is not a public user-settings endpoint.
export const dispatchBotUserPreferences = (request: Request) => Effect.gen(function* () {
  const match = /^\/v2\/bot\/users\/([0-9]{15,20})\/preferences$/u.exec(new URL(request.url).pathname)
  if (!match) return undefined
  const auth = yield* AuthIdentity
  yield* auth.requireBot(request)
  const sql = yield* SqlClient.SqlClient
  if (request.method === "PATCH") {
    const body = yield* readBoundedJson(request, 1024)
    if (typeof body !== "object" || body === null || Array.isArray(body)
      || Object.keys(body).length !== 1 || !("privateMode" in body) || typeof body.privateMode !== "boolean") {
      return yield* new InvalidRequest({ message: "Provide only a boolean privateMode" })
    }
    // Preserve imported main-account preferences and unrelated app settings.
    yield* sql`INSERT INTO user_settings(user_id,app) VALUES(${match[1]},jsonb_build_object('private_mode',${body.privateMode}::boolean))
      ON CONFLICT(user_id) DO UPDATE SET app=user_settings.app || EXCLUDED.app,updated_at=now()`
  } else if (request.method !== "GET") return undefined
  const rows = yield* sql<{ private_mode: boolean }>`SELECT app->'private_mode'='true'::jsonb AS private_mode FROM user_settings WHERE user_id=${match[1]}`
  return Response.json({ privateMode: rows[0]?.private_mode === true })
}).pipe(Effect.catchTag("SqlError", cause => Effect.fail(new DatabaseFailure({ cause, message: "User preferences are unavailable" }))))
