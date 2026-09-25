import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { DeleteOldPersonalBasesEndpoint, PersonalBasesEndpoint, PersonalBasesState, SavePersonalBaseEndpoint, UnsavePersonalBaseEndpoint } from "./personal-bases.js"

describe("personal base contracts", () => {
  it("publishes authenticated list, bodyless save, unsave, and cleanup routes", () => {
    expect(PersonalBasesEndpoint).toMatchObject({ auth: "user", method: "GET", path: "/v2/bases/personal" })
    expect(SavePersonalBaseEndpoint).toMatchObject({ auth: "user", method: "PUT", path: "/v2/bases/personal/:baseId", bodyMode: "none" })
    expect(UnsavePersonalBaseEndpoint).toMatchObject({ auth: "user", method: "DELETE", path: "/v2/bases/personal/:baseId" })
    expect(DeleteOldPersonalBasesEndpoint).toMatchObject({ auth: "user", method: "DELETE", path: "/v2/bases/personal/older-than-90-days" })
  })

  it("keeps base IDs as decimal strings and returns one items collection without slots", () => {
    const state = { items: [{ id: "9223372036854775807", baseLink: "https://link.clashofclans.com/en?action=OpenLayout&id=TH17",
      images: ["https://api.clashk.ing/v2/media/base.png"], description: "War layout", createdAt: "2026-09-11T00:00:00.000Z",
      serverId: "1", channelId: "2", messageId: "3", discordMessageUrl: "https://discord.com/channels/1/2/3",
      downloadCount: 2, upvotes: 1, downvotes: 0, saved: true,
      savedAt: "2026-09-11T01:00:00.000Z", downloadedAt: null }] }
    expect(Schema.decodeUnknownSync(PersonalBasesState)(state)).toEqual(state)
    expect(() => Schema.decodeUnknownSync(PersonalBasesState)({ ...state, slots: [] })).toThrow()
    expect(() => Schema.decodeUnknownSync(PersonalBasesState)({ ...state, items: [{ ...state.items[0], id: 1 }] })).toThrow()
  })
})
