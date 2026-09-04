import {
  AppAnnouncementCreateEndpoint, AppAnnouncementMutationRequest,
  AppAnnouncementUpdateEndpoint, ManagedAppAnnouncement,
} from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { AuthIdentity } from "./auth.js"
import { DatabaseFailure, InvalidRequest, NotFound, UpstreamUnavailable } from "./errors.js"
import { readBoundedJson } from "./request-body.js"

type Announcement = typeof ManagedAppAnnouncement.Type
type Row = Omit<Announcement, "starts_at" | "ends_at" | "created_at" | "updated_at" | "banner_image_url" | "html_object_key" | "html_url" | "min_app_version"> & {
  starts_at: string | Date; ends_at: string | Date | null; created_at: string | Date; updated_at: string | Date
  banner_image_url: string | null; html_object_key: string | null; html_url: string | null; min_app_version: string | null
}
const iso = (value: string | Date) => new Date(value).toISOString()
const project = (row: Row): Announcement => ({
  id: row.id, title: row.title, subtitle: row.subtitle, status: row.status, target: row.target,
  ...(row.body ? { body: row.body } : {}),
  ...(row.banner_image_url ? { banner_image_url: row.banner_image_url } : {}),
  ...(row.html_object_key ? { html_object_key: row.html_object_key } : {}),
  ...(row.html_url ? { html_url: row.html_url } : {}),
  ...(row.min_app_version ? { min_app_version: row.min_app_version } : {}),
  starts_at: iso(row.starts_at), ...(row.ends_at === null ? {} : { ends_at: iso(row.ends_at) }),
  created_at: iso(row.created_at), updated_at: iso(row.updated_at),
})
const decode = <A>(schema: Schema.Codec<A, unknown, never, never>, value: unknown) =>
  Schema.decodeUnknownEffect(schema)(value, { onExcessProperty: "error" }).pipe(Effect.mapError(() => new InvalidRequest({ message: "Invalid announcement request" })))
const database = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(
  Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Announcement mutation failed" })),
)

export const announcementMutationRuntimeRoutes = [
  { method: "POST", path: "/v2/app/announcements" },
  { method: "PUT", path: "/v2/app/announcements/:id" },
  { method: "DELETE", path: "/v2/app/announcements/:id" },
] as const

/** These Bot-owned management records deliberately remain separate from admin_posts. */
export const dispatchAnnouncementMutations = (request: Request) => Effect.gen(function* () {
  const pathname = new URL(request.url).pathname
  const create = request.method === "POST" && pathname === AppAnnouncementCreateEndpoint.path
  const match = /^\/v2\/app\/announcements\/([^/]+)$/u.exec(pathname)
  if (!create && !(match && (request.method === "PUT" || request.method === "DELETE"))) return undefined
  yield* (yield* AuthIdentity).requireBot(request)
  let id: string | undefined
  if (!create) {
    const raw = yield* Effect.try({ try: () => decodeURIComponent(match![1]!), catch: () => new InvalidRequest({ message: "Invalid announcement ID" }) })
    id = (yield* decode(AppAnnouncementUpdateEndpoint.pathParams, { id: raw })).id
  }
  const sql = yield* SqlClient.SqlClient
  let rows: ReadonlyArray<Row>
  if (request.method === "DELETE") {
    rows = yield* database(sql<Row>`UPDATE app_announcements SET status = 'archived', updated_at = now()
      WHERE id = ${id!} RETURNING *`)
  } else {
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
      return yield* new InvalidRequest({ message: "Content-Type must be application/json", status: 415 })
    }
    const body = yield* decode(AppAnnouncementMutationRequest, yield* readBoundedJson(request))
    const title = body.title.trim(), subtitle = body.subtitle.trim()
    const status = body.status ?? "draft", target = body.target ?? "all"
    const banner = body.banner_image_url?.trim() || null, key = body.html_object_key?.trim() || null
    const url = body.html_url?.trim() || null, version = body.min_app_version?.trim() || null
    if (create) {
      rows = yield* database(sql<Row>`INSERT INTO app_announcements
        (title, subtitle, body, status, target, banner_image_url, html_object_key, html_url, starts_at, ends_at, min_app_version)
        VALUES (${title}, ${subtitle}, ${body.body ?? ""}, ${status}, ${target}, ${banner}, ${key}, ${url},
          COALESCE(${body.starts_at ?? null}::timestamptz, now()), ${body.ends_at ?? null}::timestamptz, ${version}) RETURNING *`)
    } else {
      rows = yield* database(sql<Row>`UPDATE app_announcements SET title = ${title}, subtitle = ${subtitle},
        body = ${body.body ?? ""}, status = ${status}, target = ${target}, banner_image_url = ${banner},
        html_object_key = ${key}, html_url = ${url}, starts_at = COALESCE(${body.starts_at ?? null}::timestamptz, starts_at),
        ends_at = ${body.ends_at ?? null}::timestamptz, min_app_version = ${version}, updated_at = now()
        WHERE id = ${id!} RETURNING *`)
    }
  }
  if (rows[0] === undefined) return yield* new NotFound({ message: "Announcement not found" })
  const value = yield* Effect.try({ try: () => project(rows[0]!), catch: (cause) => new UpstreamUnavailable({ cause, message: "Invalid announcement data" }) })
  const encoded = yield* Schema.encodeEffect(ManagedAppAnnouncement)(value).pipe(
    Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Announcement response failed its contract" })),
  )
  return Response.json(encoded, { status: 200, headers: { "cache-control": "no-store" } })
})
