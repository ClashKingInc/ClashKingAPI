import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { DatabaseFailure, Forbidden, NotFound } from "./errors.js"
import { commitPreparedLink,type PreparedLink } from "./link-mutations.js"

export const commitServerScopedLink=(serverId:string,proof:PreparedLink)=>Effect.gen(function* () {
  const sql=yield* SqlClient.SqlClient
  return yield* sql.withTransaction(Effect.gen(function* () {
    const server=(yield* sql<{id:string}>`SELECT id FROM servers WHERE id=${serverId} FOR SHARE`)[0]
    if (server === undefined) return yield* new NotFound({message:"Server not found"})
    if (!proof.verifiedOwnership) return yield* new Forbidden({message:"A valid in-game API token is required to link an account"})
    return yield* commitPreparedLink(proof)
  }))
}).pipe(Effect.catchTag("SqlError",(cause)=>Effect.fail(new DatabaseFailure({cause,message:"Server account linking failed"}))))
