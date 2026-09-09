import { Campaign, Post, PostDeliveryAttempt } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { describe, expect, it } from "vitest"

import { adminOperationInternals } from "./admin-operations.js"

const now = "2026-09-03T00:00:00.000Z"
const campaignRow = {
  id: "123e4567-e89b-12d3-a456-426614174000",
  campaign_key: "season-start",
  title: "New season",
  body: "The season is live.",
  target_route: "/posts",
  platforms: ["ios", "android"] as const,
  target_locales: ["en", "es"],
  translations: { es: { title: "Nueva temporada", body: "La temporada está activa." } },
  status: "scheduled" as const,
  trigger_type: "monthly" as const,
  day_of_month: 1,
  send_at: null,
  send_time: "09:00",
  last_sent_at: null,
  created_by: "18446744073709551615",
  created_at: new Date(now),
  updated_at: now,
} satisfies Parameters<typeof adminOperationInternals.mapCampaign>[0]

const postRow = {
  id: "123e4567-e89b-12d3-a456-426614174001",
  slug: "new-season",
  title: "New season",
  summary: "The season is live.",
  hero_image_url: null,
  body_blocks: [{ type: "paragraph" as const, text: "Welcome." }],
  translations: { es: { title: "Nueva temporada", summary: "La temporada está activa." } },
  presentation_type: "article" as const,
  story_url: null,
  story_version: 1,
  story_history: [],
  revision_number: 2,
  show_on_home: true,
  pinned_on_home: false,
  target_route: null,
  platforms: ["ios", "android", "web"] as const,
  dismissible: true,
  priority: 10,
  status: "draft" as const,
  starts_at: null,
  ends_at: null,
  also_push_on_publish: false,
  push_title: null,
  push_body: null,
  published_at: null,
  push_sent_at: null,
  created_by: "18446744073709551615",
  created_at: new Date(now),
  updated_at: now,
} satisfies Parameters<typeof adminOperationInternals.mapPost>[0]

describe("admin SQL response mappings", () => {
  it.each(["queued", "processing"] as const)("preserves active %s delivery attempts", async (status) => {
    const value = adminOperationInternals.mapDelivery({
      id: "123e4567-e89b-12d3-a456-426614174002",
      post_id: postRow.id,
      attempt_number: 1,
      trigger: "manual",
      eligible_count: 0,
      sent_count: 0,
      skipped_count: 0,
      status,
      error_summary: null,
      attempted_at: new Date(now),
    })
    const encoded = await Effect.runPromise(Schema.encodeUnknownEffect(PostDeliveryAttempt)(value))
    expect(encoded.status).toBe(status)
    expect(encoded).not.toHaveProperty("error_summary")
  })

  it("maps every required populated campaign field explicitly", async () => {
    const value = adminOperationInternals.mapCampaign(campaignRow)
    const encoded = await Effect.runPromise(Schema.encodeUnknownEffect(Campaign)(value))
    expect(encoded).toMatchObject({
      key: "season-start", title: "New season", body: "The season is live.",
      platforms: ["ios", "android"], target_locales: ["en", "es"],
      created_by: "18446744073709551615", created_at: now,
      translations: campaignRow.translations,
    })
    expect(encoded).not.toHaveProperty("campaign_key")
  })

  it("rejects malformed nested campaign JSON at the response boundary", async () => {
    const value = adminOperationInternals.mapCampaign({ ...campaignRow, translations: '{"es":{"title":42,"body":"text"}}' })
    await expect(Effect.runPromise(Schema.encodeUnknownEffect(Campaign)(value))).rejects.toBeDefined()
  })

  it("maps every required populated post field and omits nullable optional strings", async () => {
    const value = adminOperationInternals.mapPost(postRow)
    const encoded = await Effect.runPromise(Schema.encodeUnknownEffect(Post)(value))
    expect(encoded).toMatchObject({
      slug: "new-season", title: "New season", body_blocks: postRow.body_blocks,
      story_version: 1, story_history: [], revision_number: 2,
      show_on_home: true, pinned_on_home: false, created_by: "18446744073709551615",
    })
    expect(encoded).not.toHaveProperty("hero_image_url")
    expect(encoded).not.toHaveProperty("story_url")
    expect(encoded).not.toHaveProperty("target_route")
  })

  it("rejects malformed nested post JSON at the response boundary", async () => {
    const value = adminOperationInternals.mapPost({ ...postRow, body_blocks: '[{"type":"paragraph","text":42}]' })
    await expect(Effect.runPromise(Schema.encodeUnknownEffect(Post)(value))).rejects.toBeDefined()
  })
})

describe("admin release and locale rules", () => {
  const release = {
    schemaVersion: 1 as const,
    version: "1.2.3-beta",
    appVersion: "1.2.3",
    track: "beta" as const,
    type: "ota" as const,
    gitSha: "abc123",
    createdAt: now,
    platforms: { ios: { runtimeVersion: "runtime-one", manifest: { id: "manifest-one" } } },
    rollbackTargets: {
      "1.2.0-beta": {
        type: "native" as const,
        platforms: {
          ios: { runtimeVersion: "runtime-one", key: "rollbacks/beta/1.2.3-beta/1.2.0-beta/ios-123e4567-e89b-12d3-a456-426614174000.json" },
        },
      },
    },
  }

  it("validates version, track, type, and appVersion agreement", () => {
    expect(adminOperationInternals.validReleaseMarker(release)).toBe(true)
    expect(adminOperationInternals.validReleaseMarker({ ...release, appVersion: "1.2.0" })).toBe(false)
    expect(adminOperationInternals.validReleaseMarker({ ...release, track: "production" })).toBe(false)
    expect(adminOperationInternals.validReleaseMarker({ ...release, type: "native" })).toBe(false)
  })

  it("rejects rollback references outside the pre-signed release namespace", () => {
    expect(adminOperationInternals.validReleaseMarker({
      ...release,
      rollbackTargets: {
        "1.2.0-beta": {
          type: "native",
          platforms: { ios: { runtimeVersion: "runtime-one", key: "unrelated/object.json" } },
        },
      },
    })).toBe(false)
  })

  it("compares release versions numerically", () => {
    expect(adminOperationInternals.compareVersions("1.2.10-beta", "1.2.9-beta")).toBeGreaterThan(0)
    expect(adminOperationInternals.compareVersions("1.2.2", "1.2.2")).toBe(0)
  })

  it("normalizes and deduplicates locale targets", () => {
    expect(adminOperationInternals.normalizeLocales(["en-US", "EN", "es_MX", "invalid"])).toEqual(["en", "es"])
  })
})
