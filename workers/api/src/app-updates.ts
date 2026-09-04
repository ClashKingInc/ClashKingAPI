import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { DatabaseFailure, InvalidRequest, UpstreamUnavailable } from "./errors.js"
import type { WorkerBindings } from "./environment.js"

interface ChannelRow {
  readonly active_version: string
  readonly paused: boolean
  readonly rollback_target_version: string
  readonly rollout_basis_points: number
  readonly rollout_ends_at: Date | string | null
  readonly rollout_from_basis_points: number | null
  readonly rollout_starts_at: Date | string | null
  readonly rollout_to_basis_points: number | null
}

interface UpdatePlatform {
  readonly manifest: unknown
  readonly runtimeVersion: string
  readonly signature: string
}

interface RollbackTarget {
  readonly platforms: Partial<Record<"android" | "ios", { readonly key: string; readonly runtimeVersion: string }>>
  readonly type: string
}

interface UpdateRelease {
  readonly platforms: Partial<Record<"android" | "ios", UpdatePlatform>>
  readonly rollbackTargets?: Readonly<Record<string, RollbackTarget>>
  readonly schemaVersion: number
  readonly track: string
  readonly type: string
  readonly version: string
}

const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-beta)?$/u
const signaturePattern = /^sig="[A-Za-z0-9+/]+={0,2}", keyid="main"$/u
const rollbackKeyPattern = /^rollbacks\/(beta|production)\/[^/]+\/[^/]+\/(ios|android)-[0-9a-f-]{36}\.json$/u

const invalid = (message: string) => new InvalidRequest({ message })

const installationToken = (value: string | null): Effect.Effect<string, InvalidRequest> => {
  const token = value?.trim().toLowerCase() ?? ""
  if (token.length > 0) {
    return /^[0-9a-f]{32}$/u.test(token)
      ? Effect.succeed(token)
      : Effect.fail(invalid("Invalid installation cohort token"))
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Effect.succeed([...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(""))
}

const validVersion = (version: string, channel: string, releaseType: string): boolean => {
  const match = versionPattern.exec(version)
  if (match === null || (channel === "beta") !== version.endsWith("-beta")) return false
  return releaseType === "native" ? match[3] === "0" : releaseType === "ota" && match[3] !== "0"
}

const basisPoints = (state: ChannelRow, now: Date): number => {
  const clamp = (value: number) => Math.max(0, Math.min(10_000, value))
  if (state.rollout_from_basis_points === null || state.rollout_to_basis_points === null ||
      state.rollout_starts_at === null || state.rollout_ends_at === null) {
    return clamp(state.rollout_basis_points)
  }
  const start = new Date(state.rollout_starts_at).valueOf()
  const end = new Date(state.rollout_ends_at).valueOf()
  if (now.valueOf() <= start) return clamp(state.rollout_from_basis_points)
  if (now.valueOf() >= end) return clamp(state.rollout_to_basis_points)
  const progress = (now.valueOf() - start) / (end - start)
  return clamp(Math.round(state.rollout_from_basis_points +
    (state.rollout_to_basis_points - state.rollout_from_basis_points) * progress))
}

const rolloutBucket = (version: string, token: string) => Effect.promise(async () => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${version}:${token}`))
  const view = new DataView(digest)
  return Number(view.getBigUint64(0) % 10_000n)
})

const loadJson = <A>(bucket: R2Bucket, key: string): Effect.Effect<A, UpstreamUnavailable> =>
  Effect.tryPromise({
    try: async () => {
      const object = await bucket.get(key)
      if (object === null || object.size > 2 * 1024 * 1024) throw new Error(`Missing or oversized R2 object ${key}`)
      return await object.json() as A
    },
    catch: (cause) => new UpstreamUnavailable({ cause, message: "Update release is unavailable" }),
  })

const noUpdate = (token: string): Response => new Response(null, {
  status: 204,
  headers: updateHeaders(token),
})

const updateHeaders = (token: string): Headers => new Headers({
  "cache-control": "private, max-age=0",
  "expo-protocol-version": "1",
  "expo-server-defined-headers": `x-clashking-installation="${token}"`,
  "expo-sfv-version": "0",
})

const manifestResponse = (manifest: unknown, signature: string, token: string): Response => {
  const random = crypto.getRandomValues(new Uint8Array(12))
  const boundary = `expo-${[...random].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`
  const encoded = JSON.stringify(manifest)
  const body = `--${boundary}\r\ncontent-disposition: form-data; name="manifest"\r\ncontent-type: application/json; charset=utf-8\r\nexpo-signature: ${signature}\r\n\r\n${encoded}\r\n--${boundary}--\r\n`
  const headers = updateHeaders(token)
  headers.set("content-type", `multipart/mixed; boundary=${boundary}`)
  return new Response(body, { status: 200, headers })
}

export const serveAppUpdateManifest = (
  request: Request,
  bindings: WorkerBindings,
): Effect.Effect<Response, DatabaseFailure | InvalidRequest | UpstreamUnavailable, SqlClient.SqlClient> => Effect.gen(function* () {
  if (request.headers.get("expo-protocol-version") !== "1") {
    return yield* invalid("Unsupported Expo Updates protocol version")
  }
  const platform = request.headers.get("expo-platform")?.trim().toLowerCase()
  if (platform !== "ios" && platform !== "android") return yield* invalid("Unsupported update platform")
  const runtimeVersion = request.headers.get("expo-runtime-version")?.trim() ?? ""
  if (runtimeVersion.length === 0 || runtimeVersion.length > 200) return yield* invalid("Invalid Expo runtime version")
  const channel = request.headers.get("expo-channel-name")?.trim().toLowerCase() || "production"
  if (channel !== "beta" && channel !== "production") return yield* invalid("Unsupported update channel")
  const token = yield* installationToken(request.headers.get("x-clashking-installation"))
  const sql = yield* SqlClient.SqlClient
  const states = yield* sql<ChannelRow>`
    SELECT COALESCE(active_version, '') AS active_version,
      COALESCE(rollback_target_version, '') AS rollback_target_version,
      rollout_basis_points, paused, rollout_from_basis_points, rollout_to_basis_points,
      rollout_starts_at, rollout_ends_at
    FROM app_update_channels
    WHERE channel = ${channel} AND platform = ${platform} AND runtime_version = ${runtimeVersion}
  `.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Update service is unavailable" })))
  const state = states[0]
  if (state === undefined || state.active_version.length === 0 || state.paused) return noUpdate(token)
  if ((yield* rolloutBucket(state.active_version, token)) >= basisPoints(state, new Date())) return noUpdate(token)

  const release = yield* loadJson<UpdateRelease>(
    bindings.APP_UPDATES,
    `releases/${channel}/${state.active_version}/release.json`,
  )
  if (release.schemaVersion !== 1 || release.type !== "ota" || release.track !== channel ||
      release.version !== state.active_version || !validVersion(release.version, channel, release.type)) {
    return yield* new UpstreamUnavailable({ cause: release, message: "Update release marker is invalid" })
  }
  let update = release.platforms[platform]
  let servedVersion = release.version
  if (state.rollback_target_version.length > 0) {
    if (state.rollback_target_version === state.active_version) {
      return yield* new UpstreamUnavailable({ cause: state, message: "Update rollback marker is invalid" })
    }
    const target = release.rollbackTargets?.[state.rollback_target_version]
    const reference = target?.platforms[platform]
    const prefix = `rollbacks/${channel}/${release.version}/${state.rollback_target_version}/${platform}-`
    if (target === undefined || reference === undefined || !validVersion(state.rollback_target_version, channel, target.type) ||
        !reference.key.startsWith(prefix) || !rollbackKeyPattern.test(reference.key)) {
      return yield* new UpstreamUnavailable({ cause: target, message: "Update rollback marker is invalid" })
    }
    update = yield* loadJson<UpdatePlatform>(bindings.APP_UPDATES, reference.key)
    servedVersion = state.rollback_target_version
    if (update.runtimeVersion !== reference.runtimeVersion) {
      return yield* new UpstreamUnavailable({ cause: update, message: "Update rollback marker is invalid" })
    }
  }
  if (update === undefined || update.runtimeVersion !== runtimeVersion || !signaturePattern.test(update.signature) ||
      typeof update.manifest !== "object" || update.manifest === null) {
    return yield* new UpstreamUnavailable({ cause: update, message: "Update release marker is invalid" })
  }
  const manifest = update.manifest as { readonly id?: unknown; readonly runtimeVersion?: unknown; readonly metadata?: unknown }
  const metadata = manifest.metadata as { readonly rollbackFrom?: unknown; readonly version?: unknown } | undefined
  if (typeof manifest.id !== "string" || manifest.runtimeVersion !== runtimeVersion || metadata?.version !== servedVersion ||
      (state.rollback_target_version.length > 0 && metadata.rollbackFrom !== state.active_version)) {
    return yield* new UpstreamUnavailable({ cause: manifest, message: "Update manifest is invalid" })
  }
  if (request.headers.get("expo-current-update-id")?.trim() === manifest.id) return noUpdate(token)
  return manifestResponse(manifest, update.signature, token)
}).pipe(Effect.withSpan("AppUpdates.manifest"))

export const appUpdateInternals = { basisPoints, installationToken, rolloutBucket, validVersion }
