import { AppConfigResponse } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { DatabaseFailure } from "./errors.js"
import { WorkerEnvironment } from "./environment.js"

interface FeatureFlagRow {
  readonly enabled: boolean
  readonly ends_at: Date | null
  readonly flag_key: string
  readonly min_app_version: string
  readonly platforms: ReadonlyArray<"android" | "ios" | "web">
  readonly rollout_percentage: number
  readonly starts_at: Date | null
}

export const loadAppConfig = Effect.gen(function* () {
  const env = yield* WorkerEnvironment
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<FeatureFlagRow>`
    SELECT flag_key, enabled, rollout_percentage, min_app_version, platforms,
           starts_at, ends_at
    FROM admin_feature_flags
    WHERE public_exposure = 'safe'
    ORDER BY flag_key
  `.pipe(
    Effect.mapError(
      (cause) => new DatabaseFailure({ cause, message: "Public app configuration lookup failed" }),
    ),
  )
  const candidate = {
    flags: rows.map((row) => ({
      key: row.flag_key,
      enabled: row.enabled,
      rollout_percentage: row.rollout_percentage,
      ...(row.min_app_version.length === 0 ? {} : { min_app_version: row.min_app_version }),
      platforms: [...row.platforms],
      ...(row.starts_at === null ? {} : { starts_at: row.starts_at.toISOString() }),
      ...(row.ends_at === null ? {} : { ends_at: row.ends_at.toISOString() }),
    })),
    updates: {
      ios: {
        minimum_version: env.IOS_MINIMUM_VERSION,
        store_url: env.IOS_STORE_URL,
        message: env.FORCED_UPDATE_MESSAGE,
      },
      android: {
        minimum_version: env.ANDROID_MINIMUM_VERSION,
        store_url: env.ANDROID_STORE_URL,
        message: env.FORCED_UPDATE_MESSAGE,
      },
      web: null,
    },
    generated_at: new Date().toISOString(),
  }
  return yield* Schema.decodeUnknownEffect(AppConfigResponse)(candidate).pipe(
    Effect.mapError(
      (cause) => new DatabaseFailure({ cause, message: "Public app configuration is invalid" }),
    ),
  )
}).pipe(Effect.withSpan("AppConfig.load"))
