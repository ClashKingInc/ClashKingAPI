import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { DatabaseFailure, Forbidden, NotFound } from "./errors.js"
import { addLink,commitPreparedLink,type PreparedLink } from "./link-mutations.js"

/** Read only inside the signed handler's link/receipt/journal transaction.
 * Holding the server row keeps an in-flight attempt on one canonical policy;
 * an unknown server never silently receives the schema's default-off policy.
 */
const serverLinkTokenPolicy = (serverId: string, locked:boolean) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const row = (yield* sql.unsafe<{ require_api_token_when_linking: boolean }>(
    `SELECT require_api_token_when_linking FROM servers WHERE id=$1${locked ? " FOR SHARE" : ""}`,[serverId]))[0]
  if (row === undefined) return yield* new NotFound({ message: "Server linking policy not found" })
  return row.require_api_token_when_linking
}).pipe(Effect.catchTag("SqlError", (cause) => Effect.fail(new DatabaseFailure({ cause, message: "Server linking policy is unavailable" }))))
export const loadServerLinkTokenPolicy=(serverId:string)=>serverLinkTokenPolicy(serverId,true)
/** Cheap preflight only; final mutation must recheck the locked policy. */
export const readServerLinkTokenPolicy=(serverId:string)=>serverLinkTokenPolicy(serverId,false)

export const commitServerScopedLink=(serverId:string,proof:PreparedLink)=>Effect.gen(function* () {
  const sql=yield* SqlClient.SqlClient
  return yield* sql.withTransaction(Effect.gen(function* () {
    const required=yield* loadServerLinkTokenPolicy(serverId)
    if (required && !proof.verifiedOwnership) return yield* new Forbidden({message:"This server requires a valid in-game API token when linking an account"})
    return yield* commitPreparedLink(proof)
  }))
})

/** The caller supplies the validated canonical server policy. There is no
 * implicit default and no existing-verification exemption for a new attempt.
 * The canonical linker verifies a supplied token before entering its mutation.
 */
export const requireServerLinkToken = (requireApiTokenWhenLinking: boolean, apiToken: string | undefined): Effect.Effect<void, Forbidden> =>
  requireApiTokenWhenLinking && (apiToken?.trim() ?? "") === ""
    ? Effect.fail(new Forbidden({ message: "This server requires a valid in-game API token when linking an account" }))
    : Effect.void

/** Invoke only for a new, independently authorized server-scoped attempt.
 * The signed handler must return an exact accepted receipt before calling this
 * helper on a replay. Global linking and ownership-transfer rules stay in addLink.
 */
export const addServerScopedLink = (options: {
  readonly requireApiTokenWhenLinking: boolean
  readonly principal: Parameters<typeof addLink>[0]
  readonly userId: Parameters<typeof addLink>[1]
  readonly input: Parameters<typeof addLink>[2]
  readonly bindings: Parameters<typeof addLink>[3]
}) => requireServerLinkToken(options.requireApiTokenWhenLinking, options.input.api_token).pipe(
  Effect.flatMap(() => addLink(options.principal, options.userId, options.input, options.bindings)),
)
