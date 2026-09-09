import { DecimalSnowflake } from "@clashking/api-contracts"
import { DeferredRosterBoardData } from "@clashking/api-contracts/deferred-runtime"
import { RuntimeUUID } from "@clashking/api-contracts/deferred-runtime"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { loadRosterJson } from "./dashboard-roster-runtime.js"
import { DatabaseFailure, InvalidRequest, NotFound } from "./errors.js"
import { renderRosterBoard, type RosterBoardMode } from "./roster-interaction-board.js"

/** All roster writers lock the parent row. A shared parent lock makes the
 * multi-query presentation snapshot coherent without holding locks during I/O.
 * Callers receive plain message data and release the transaction before Discord. */
export const prepareRosterBoardSnapshot = (serverId: string, rosterId: string, mode: RosterBoardMode, now: number) => Effect.gen(function* () {
  if (!Schema.is(RuntimeUUID)(rosterId) || !Schema.is(DecimalSnowflake)(serverId)) {
    return yield* new InvalidRequest({ message: 'Invalid roster board identity' })
  }
  const sql = yield* SqlClient.SqlClient
  return yield* sql.withTransaction(Effect.gen(function* () {
    const parent = (yield* sql<{ revision: string }>`SELECT revision::text FROM rosters
      WHERE id = ${rosterId}::uuid AND server_id = ${serverId} FOR SHARE`)[0]
    if (parent === undefined) return yield* new NotFound({ message: 'Roster not found' })
    const raw = yield* loadRosterJson(sql, rosterId, serverId)
    const roster = yield* Schema.decodeUnknownEffect(DeferredRosterBoardData)(raw).pipe(Effect.mapError(cause =>
      new DatabaseFailure({ cause, message: 'Stored roster board failed validation' })))
    const message = yield* renderRosterBoard(roster, mode, now)
    return { rosterId, serverId, revision: parent.revision, message }
  }))
}).pipe(Effect.catchTag('SqlError', cause => Effect.fail(new DatabaseFailure({ cause, message: 'Unable to read roster board snapshot' }))))
