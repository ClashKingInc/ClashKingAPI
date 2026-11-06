import { endpoints } from "@clashking/api-contracts"
import { PgClient, PgTypes } from "@effect/sql-pg"
import { Effect, Layer, Redacted, Result, Scope } from "effect"
import { SqlClient, Statement } from "effect/sql"
import { Reactivity } from "effect/reactivity"

import { Buffer } from "node:buffer"

import type { WorkerBindings } from "./environment.js"

/** Preserve the row types of the previous pg driver, including array elements.
 * Keep the registry client-local so other PostgreSQL consumers retain defaults. */
export const makeDatabaseTypes = () => {
  const types = PgTypes.makeRegistry()
  types.register(PgTypes.OID.int8, {
    encode: (value: bigint | string) => PgTypes.encode(typeof value === "string" ? BigInt(value) : value, PgTypes.OID.int8),
    decode: (bytes) => Result.map(PgTypes.decode(bytes, PgTypes.OID.int8, 1), String),
  })
  types.register(PgTypes.OID.bytea, {
    encode: (value: Uint8Array) => PgTypes.encode(value, PgTypes.OID.bytea),
    decode: (bytes) => Result.map(PgTypes.decode(bytes, PgTypes.OID.bytea, 1), (value) => Buffer.from(value as Uint8Array)),
  })
  return types
}

/** pg sent array/object parameters as text, allowing PostgreSQL to infer the
 * column type. Preserve that contract for empty/mixed arrays and JSON inputs. */
const quoteArrayElement = (value: string): string => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
const arrayParameter = (values: ReadonlyArray<unknown>): string => `{${values.map((value): string => {
  if (value === null || value === undefined) return "NULL"
  if (Array.isArray(value)) return arrayParameter(value)
  if (value instanceof Date) return quoteArrayElement(value.toISOString())
  if (value instanceof Uint8Array) return quoteArrayElement(`\\x${Buffer.from(value).toString("hex")}`)
  return quoteArrayElement(typeof value === "object" ? JSON.stringify(value) : String(value))
}).join(",")}}`
const databaseParameter = (value: unknown): unknown => {
  if (Array.isArray(value)) return arrayParameter(value)
  if (typeof value === "object" && value !== null && !(value instanceof Date) &&
    !(value instanceof Uint8Array) && !PgTypes.isParameter(value)) return JSON.stringify(value)
  return value
}
export const makeDatabaseCompiler = (): Statement.Compiler => {
  const compiler = PgClient.makeCompiler()
  const compatible: Statement.Compiler = {
    dialect: compiler.dialect,
    compile: (statement, withoutTransform) => {
      const [query, parameters] = compiler.compile(statement, withoutTransform)
      return [query, parameters.map(databaseParameter)]
    },
    get withoutTransform() { return compatible },
  }
  return compatible
}

/** Capture one request scope, but acquire its pool only when a query executes.
 * No sockets or request-owned promises escape into global state. */
export const lazyDatabaseLayer = (acquire: ReturnType<typeof PgClient.make>) => Layer.effect(SqlClient.SqlClient,
  Effect.gen(function* () {
    const scope = yield* Scope.Scope
    const reactivity = yield* Reactivity.Reactivity
    const client = yield* Effect.cached(acquire.pipe(
      Effect.provideService(Scope.Scope, scope), Effect.provideService(Reactivity.Reactivity, reactivity),
    ))
    return yield* SqlClient.make({
      acquirer: client.pipe(Effect.flatMap((value) => value.reserve)),
      compiler: makeDatabaseCompiler(), spanAttributes: [["db.system", "postgresql"]],
    })
  }),
).pipe(Layer.provide(Reactivity.layer))

/** Cache only explicitly public, read-only Clash data contracts. New routes
 * default to fresh reads, so adding a dashboard endpoint cannot accidentally
 * cache editable settings or its authorization queries for five minutes. */
const cachedClashPath = /^\/v2\/(?:stats|player|players|clan|clans|leaderboard|leaderboards|legends|ranked|army-setups|league|wars|war|esports)(?:\/|$)/u
const cachedClashReads = Object.values(endpoints)
  .filter(endpoint => endpoint.method === "GET" && endpoint.auth === "public" && cachedClashPath.test(endpoint.path))
  .map(endpoint => new RegExp(`^${endpoint.path.split("/").map(segment =>
    segment.startsWith(":") ? "[^/]+" : segment.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("/")}$`, "u"))

export const needsFreshDatabaseReads = (request: Request): boolean =>
  request.method !== "GET" || !cachedClashReads.some(pattern => pattern.test(new URL(request.url).pathname))

export const databaseLayer = (bindings: WorkerBindings, fresh = false) => {
  const connection = fresh ? bindings.HYPERDRIVE_FRESH : bindings.HYPERDRIVE
  // Never silently serve stale moderation/authorization data if a deployment
  // omitted the fresh binding. Local service runners supply both bindings too.
  if (!connection) throw new Error("Cache-disabled database binding is required for operational requests")
  return lazyDatabaseLayer(
  PgClient.makeClient({
    url: Redacted.make(connection.connectionString),
    applicationName: "clashking-api-worker",
    connectTimeout: "10 seconds",
    acquireForStream: true,
    types: makeDatabaseTypes(),
  }),
)
}
