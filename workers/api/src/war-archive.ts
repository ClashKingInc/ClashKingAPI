import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { WorkerEnvironment, type WorkerBindings } from "./environment.js"
import { DatabaseFailure, InvalidRequest, UpstreamUnavailable } from "./errors.js"
import { MAX_ARCHIVE_FRAME_BYTES, MAX_ARCHIVE_JSON_BYTES } from "./war-archive-codec.js"
import { decodeArchiveFrame } from "./war-archive-decoder.js"
import { type ArchivedWar, StoredArchivedWar, hydrateArchivedWar, archiveAttackFacts } from "./war-archive-model.js"

interface ArchiveRef {
  readonly war_id: string
  readonly war_type: string
  readonly end_time?: Date | string
  readonly archive_pack_id: string | number | null
  readonly archive_offset: string | number | null
  readonly archive_compressed_bytes: number | null
  readonly payload: unknown
  readonly pending?: boolean
}
const archiveFailure = (cause: unknown) => new UpstreamUnavailable({ cause, message: "War archive is unavailable" })
export const readArchiveWar = (warId: string, endTime?: Date | string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<ArchiveRef>`
    SELECT w.war_id::text, w.war_type, w.archive_pack_id::text,
           w.archive_offset::text, w.archive_compressed_bytes, p.payload
    FROM wars w LEFT JOIN war_archive_pending p ON p.war_id = w.war_id AND p.end_time = w.end_time
    WHERE w.war_id = ${warId}::integer ${endTime === undefined ? sql`` : sql`AND w.end_time = ${endTime}`}
  `.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "War archive lookup failed" })))
  const row = rows[0]
  return row === undefined ? undefined : yield* decodeArchiveRef(row, yield* WorkerEnvironment)
}).pipe(Effect.withSpan("WarArchive.read"))

const readArchiveFrame = async (row: ArchiveRef, bindings: WorkerBindings): Promise<Uint8Array> => {
  const offset = Number(row.archive_offset)
  const length = row.archive_compressed_bytes
  if (row.archive_pack_id == null || row.archive_offset == null || length == null ||
      !/^\d+$/u.test(String(row.archive_pack_id)) || !Number.isSafeInteger(offset) || offset < 0 ||
      !Number.isInteger(length) || length <= 0 || length > MAX_ARCHIVE_FRAME_BYTES) {
    throw new Error("Missing or invalid war archive locator")
  }
  const key = `packs/${String(row.archive_pack_id).padStart(6, "0")}.pack`
  const object = await bindings.WAR_ARCHIVE.get(key, { range: { offset, length } })
  if (!object || !("body" in object)) throw new Error("War archive pack is missing")
  const bytes = new Uint8Array(await object.arrayBuffer())
  if (bytes.byteLength !== length) throw new Error("Incomplete war archive range")
  return bytes
}

const decodeArchiveRef = (row: ArchiveRef, bindings: WorkerBindings, prefetched?: Uint8Array) => Effect.gen(function* () {
    const payload = yield* Effect.tryPromise({ try: async () => {
      if (row.payload != null) {
        const raw = typeof row.payload === "string" ? row.payload : JSON.stringify(row.payload)
        const bytes = new TextEncoder().encode(raw).byteLength
        if (bytes > MAX_ARCHIVE_JSON_BYTES) throw new Error("Pending war archive exceeds decoded size limit")
        return { value: typeof row.payload === "string" ? JSON.parse(row.payload) as unknown : row.payload, bytes }
      }
      const bytes = prefetched ?? await readArchiveFrame(row, bindings)
      const decoded = decodeArchiveFrame(bytes)
      return { value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decoded)) as unknown, bytes: decoded.byteLength }
    }, catch: archiveFailure })
    const stored = yield* Schema.decodeUnknownEffect(StoredArchivedWar)(payload.value).pipe(Effect.mapError(archiveFailure))
    return { war: hydrateArchivedWar(stored, row.war_type), bytes: payload.bytes }
})

/** Batch small locator rows, not pending JSON blobs. Pending wars are loaded
 * individually so a large set cannot materialize hundreds of full wars in SQL. */
const archiveRefs = (ids: readonly string[]) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  return yield* sql<ArchiveRef>`SELECT w.war_id::text, w.war_type, w.end_time, w.archive_pack_id::text,
    w.archive_offset::text, w.archive_compressed_bytes, NULL AS payload,
    w.archive_pack_id IS NULL AS pending FROM wars w WHERE w.war_id = ANY(${[...ids]}::integer[])`
    .pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "War archive lookup failed" })))
})
const readRef = (ref: ArchiveRef, bindings: WorkerBindings) => ref.pending === true
  ? readArchiveWar(ref.war_id, ref.end_time) : decodeArchiveRef(ref, bindings)
export const archiveReadConcurrency = 2
export const historyArchiveReadConcurrency = 4

// Public endpoints already support time/limit pagination. Reject oversized
// pages explicitly; never return a silently truncated history.
export const MAX_ARCHIVE_PAGE_BYTES = 8 * 1024 * 1024
export const loadArchiveWars = (warIds: readonly string[]) => Effect.gen(function* () {
  const wars = new Map<string, ArchivedWar>()
  const bindings = yield* WorkerEnvironment
  let bytes = 0
  const ids = [...new Set(warIds)]
  for (let offset = 0; offset < ids.length; offset += 128) {
    const refs = yield* archiveRefs(ids.slice(offset, offset + 128))
    for (let index = 0; index < refs.length; index += historyArchiveReadConcurrency) {
      const batch = refs.slice(index, index + historyArchiveReadConcurrency)
      // Prefetch only compressed frames (at most 4 * 2 MiB). Decode one war at
      // a time so faster R2 I/O does not multiply the decoded object footprint.
      const packed = batch.filter((ref) => ref.pending !== true)
      const frames = new Map(yield* Effect.forEach(packed, (ref) => Effect.tryPromise({
        try: async () => [ref.war_id, await readArchiveFrame(ref, bindings)] as const,
        catch: archiveFailure,
      }), { concurrency: historyArchiveReadConcurrency }))
      const retain = (ref: ArchiveRef, entry: { bytes: number; war: ArchivedWar } | undefined) => Effect.gen(function* () {
        if (!entry) return
        bytes += entry.bytes
        if (bytes > MAX_ARCHIVE_PAGE_BYTES) return yield* new InvalidRequest({ message: "War history page exceeds the supported response size; request a smaller limit or time range" })
        wars.set(ref.war_id, entry.war)
      })
      for (const ref of packed) {
        yield* retain(ref, yield* decodeArchiveRef(ref, bindings, frames.get(ref.war_id)))
        frames.delete(ref.war_id)
      }
      // Pending JSON keeps its existing two-reader bound.
      yield* Effect.forEach(batch.filter((ref) => ref.pending === true), (ref) => Effect.gen(function* () {
        yield* retain(ref, yield* readRef(ref, bindings))
      }), { concurrency: archiveReadConcurrency, discard: true })
    }
  }
  return wars
})

/** Read an ordered list of archives with batched locator SQL and bounded I/O.
 * The callback runs in input order, while each group of archive reads runs in
 * parallel. Commutative consumers may opt into completion order to avoid
 * batch barriers. Only one small locator page and bounded I/O are retained. */
export const forEachArchiveWar = <E, R>(
  warIds: readonly string[],
  consume: (warId: string, war: ArchivedWar) => Effect.Effect<void, E, R>,
  options: { readonly unordered?: boolean } = {},
) => Effect.gen(function* () {
  const bindings = yield* WorkerEnvironment
  const ids = [...new Set(warIds)]
  for (let pageOffset = 0; pageOffset < ids.length; pageOffset += 64) {
    const page = ids.slice(pageOffset, pageOffset + 64)
    const refs = new Map((yield* archiveRefs(page)).map((ref) => [ref.war_id, ref]))
    if (options.unordered) {
      // Commutative aggregators can release each war and start the next read
      // immediately, instead of waiting for the slowest read in every batch.
      yield* Effect.forEach(page, (id) => Effect.gen(function* () {
        const ref = refs.get(id)
        if (!ref) return
        const entry = yield* readRef(ref, bindings)
        if (entry) yield* consume(id, entry.war)
      }), { concurrency: historyArchiveReadConcurrency, discard: true })
      continue
    }
    for (let offset = 0; offset < page.length; offset += historyArchiveReadConcurrency) {
      const batch = page.slice(offset, offset + historyArchiveReadConcurrency)
      const entries = yield* Effect.forEach(batch, (id) => {
        const ref = refs.get(id)
        return ref === undefined ? Effect.succeed(undefined) : readRef(ref, bindings)
      }, { concurrency: historyArchiveReadConcurrency })
      for (const [index, id] of batch.entries()) {
        const entry = entries[index]
        if (entry) yield* consume(id, entry.war)
      }
    }
  }
})

/** Newest-first keyset traversal for bounded feeds. The consumer indicates
 * when it has enough results. Every war sharing that end time is still read so
 * attack-order and war-id tie breaking remain exact. */
export const forEachNewestPlayerWar = <E, R>(
  playerTags: readonly string[],
  start: Date,
  end: Date,
  warTypes: readonly string[],
  pageSize: number,
  consume: (warId: string, war: ArchivedWar) => Effect.Effect<boolean, E, R>,
) => Effect.gen(function* () {
  if (!playerTags.length) return
  const sql = yield* SqlClient.SqlClient
  const bindings = yield* WorkerEnvironment
  const size = Math.max(1, Math.min(64, Math.trunc(pageSize)))
  let cursorEnd: Date | string | undefined
  let cursorId: number | undefined
  let satisfiedAt: number | undefined
  for (;;) {
    const parameters: unknown[] = [[...playerTags], start, end]
    let statement = `
      SELECT DISTINCT w.war_id, w.end_time
      FROM player_war_history history
      CROSS JOIN LATERAL unnest(history.war_ids) history_war_id
      JOIN wars w ON w.war_id = history_war_id
      WHERE history.player_tag = ANY($1::text[])
        AND w.end_time >= $2 AND w.end_time <= $3`
    if (warTypes.length) { parameters.push([...warTypes]); statement += ` AND w.war_type = ANY($${parameters.length}::text[])` }
    if (cursorEnd !== undefined && cursorId !== undefined) {
      parameters.push(cursorEnd, cursorId)
      statement += ` AND (w.end_time < $${parameters.length - 1} OR (w.end_time = $${parameters.length - 1} AND w.war_id < $${parameters.length}))`
    }
    parameters.push(size)
    statement += ` ORDER BY w.end_time DESC, w.war_id DESC LIMIT $${parameters.length}`
    const rows = yield* sql.unsafe<{ readonly war_id: number; readonly end_time: Date | string }>(statement, parameters)
      .pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Player war history query failed" })))
    if (!rows.length) return
    const refs = new Map((yield* archiveRefs(rows.map((row) => String(row.war_id)))).map((ref) => [ref.war_id, ref]))
    for (let offset = 0; offset < rows.length; offset += historyArchiveReadConcurrency) {
      const firstTimestamp = new Date(rows[offset]!.end_time).getTime()
      if (satisfiedAt !== undefined && firstTimestamp < satisfiedAt) return
      const batch = rows.slice(offset, offset + historyArchiveReadConcurrency)
      const entries = yield* Effect.forEach(batch, (row) => {
        const ref = refs.get(String(row.war_id))
        return ref === undefined ? Effect.succeed(undefined) : readRef(ref, bindings)
      }, { concurrency: historyArchiveReadConcurrency })
      for (const [index, row] of batch.entries()) {
        const timestamp = new Date(row.end_time).getTime()
        if (satisfiedAt !== undefined && timestamp < satisfiedAt) return
        const entry = entries[index]
        if (entry && (yield* consume(String(row.war_id), entry.war))) satisfiedAt = timestamp
      }
    }
    const last = rows.at(-1)!
    cursorEnd = last.end_time
    cursorId = last.war_id
    if (rows.length < size) return
  }
})

/** Complete keyset scan with at most 128 IDs and one decoded war retained.
 * Aggregators should update their bounded result state in the callback. */
export const forEachPlayerWar = <E, R>(playerTags: readonly string[], start: Date, end: Date, consume: (warId: string, war: ArchivedWar) => Effect.Effect<void, E, R>) => Effect.gen(function* () {
  if (!playerTags.length) return
  const sql = yield* SqlClient.SqlClient
  const bindings = yield* WorkerEnvironment
  let lastId = 0
  for (;;) {
    const rows = yield* sql<{ readonly war_id: number; readonly end_time: Date | string }>`
      SELECT DISTINCT w.war_id, w.end_time
      FROM player_war_history history
      CROSS JOIN LATERAL unnest(history.war_ids) history_war_id
      JOIN wars w ON w.war_id = history_war_id
      WHERE history.player_tag = ANY(${[...playerTags]}::text[]) AND w.war_id > ${lastId}
        AND w.end_time >= ${start} AND w.end_time <= ${end}
      ORDER BY w.war_id, w.end_time LIMIT 128
    `.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Player war history query failed" })))
    if (!rows.length) return
    const refs = new Map((yield* archiveRefs(rows.map((row) => String(row.war_id)))).map((ref) => [ref.war_id, ref]))
    for (let offset = 0; offset < rows.length; offset += archiveReadConcurrency) {
      const batch = rows.slice(offset, offset + archiveReadConcurrency)
      const entries = yield* Effect.forEach(batch, (row) => {
        const ref = refs.get(String(row.war_id))
        return ref === undefined ? Effect.succeed(undefined) : readRef(ref, bindings)
      }, { concurrency: archiveReadConcurrency })
      // Keep consumer ordering deterministic; only I/O is concurrent.
      for (const [index, row] of batch.entries()) {
        const entry = entries[index]
        if (entry) yield* consume(String(row.war_id), entry.war)
        lastId = row.war_id
      }
    }
    if (rows.length < 128) return
  }
})

/** Bounded compatibility helper for callers returning full war objects. Bulk
 * statistics and roster calculations use forEachPlayerWar instead. */
export const loadWarsForPlayers = (playerTags: readonly string[], start: Date, end: Date) => Effect.gen(function* () {
  const wars = new Map<string, ArchivedWar>()
  let bytes = 0
  yield* forEachPlayerWar(playerTags, start, end, (id, war) => Effect.gen(function* () {
    bytes += new TextEncoder().encode(JSON.stringify(war)).byteLength
    if (bytes > MAX_ARCHIVE_PAGE_BYTES) return yield* new InvalidRequest({ message: "War history exceeds the supported response size; request a narrower time range" })
    wars.set(id, war)
  }))
  return wars
})

/** Shared equivalent of Go sqlAttacksForPlayersContext. Includes every matching
 * war for missed-attack/defense calculations, but only requested attackers. */
export const attacksForPlayers = (playerTags: readonly string[], start: Date, end: Date) => Effect.gen(function* () {
  const wars = yield* loadWarsForPlayers(playerTags, start, end)
  const wanted = new Set(playerTags)
  const attacks = []
  for (const [id, war] of wars) for (const attack of archiveAttackFacts(id, war)) if (wanted.has(attack.attackerTag)) attacks.push(attack)
  return { attacks, wars }
})
