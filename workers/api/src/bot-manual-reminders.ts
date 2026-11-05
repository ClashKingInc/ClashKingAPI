import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { AuthIdentity } from "./auth.js"
import { InvalidRequest } from "./errors.js"
import { readBoundedJson } from "./request-body.js"
import { requestManualReminders } from "./manual-reminders.js"

const snowflake = /^[0-9]{15,20}$/u
const tagPattern = /^#[0289PYLQGRJCUV]{3,15}$/u
const types = new Set(["War", "Clan Capital", "Clan Games", "roster"])

export const dispatchBotManualReminders = (request: Request) => Effect.gen(function* () {
  if (request.method !== "POST") return undefined
  const match = /^\/v2\/bot\/server\/([^/]+)\/reminders\/manual$/u.exec(new URL(request.url).pathname)
  if (!match) return undefined
  const serverId = match[1]!
  if (!snowflake.test(serverId)) return yield* new InvalidRequest({ message: "Invalid server" })
  const auth = yield* AuthIdentity
  yield* auth.requireBot(request)
  const input = yield* readBoundedJson(request, 4096)
  if (typeof input !== "object" || input === null || Array.isArray(input)) return yield* new InvalidRequest({ message: "Invalid reminder request" })
  const body = input as { clanTag?: unknown; type?: unknown }
  if (typeof body.clanTag !== "string" || !tagPattern.test(body.clanTag)
    || typeof body.type !== "string" || !types.has(body.type)) {
    return yield* new InvalidRequest({ message: "Invalid reminder request" })
  }
  const sql = yield* SqlClient.SqlClient
  // The signed Discord command enforces Manage Server before calling this
  // bot-authenticated route. A caller-supplied actor ID adds no authorization.
  const result = yield* requestManualReminders(sql, serverId, { clanTag: body.clanTag, type: body.type })
  return Response.json(result, { status: 202 })
})
