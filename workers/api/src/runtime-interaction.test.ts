import { RuntimeInteractionProof } from "@clashking/api-contracts/deferred-runtime"
import { Effect, Schema } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { giveawayRolesPermit } from "./giveaway-runtime.js"
import { requireFreshInteraction, verifyRuntimeInteraction } from "./runtime-interaction.js"

const bytesHex = (value: ArrayBuffer) => [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
const payload = { id: "1334567890123456789", application_id: "2334567890123456789", type: 3, guild_id: "3334567890123456789",
  channel_id: "4334567890123456789", member: { user: { id: "5334567890123456789" } }, message: { id: "6334567890123456789" },
  data: { custom_id: "ck:giveaway:enter:test", component_type: 2 }, token: "never-persist-this", locale: "中文" }
let keys: CryptoKeyPair
let configuration: { DISCORD_PUBLIC_KEY: string; DISCORD_APPLICATION_ID: string }
beforeAll(async () => {
  keys = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]) as CryptoKeyPair
  configuration = { DISCORD_PUBLIC_KEY: bytesHex(await crypto.subtle.exportKey("raw", keys.publicKey)), DISCORD_APPLICATION_ID: payload.application_id }
})
const sign = async (rawBody = JSON.stringify(payload), timestamp = String(Math.floor(Date.now() / 1000))) => ({ interaction: {
  rawBody, timestamp, signature: bytesHex(await crypto.subtle.sign("Ed25519", keys.privateKey, new TextEncoder().encode(timestamp + rawBody))),
} })

describe("independent Discord runtime proof", () => {
  it("derives scope only from signed data and excludes raw proof/token from verified value", async () => {
    const proof = await sign()
    const actual = await Effect.runPromise(verifyRuntimeInteraction(proof, configuration))
    expect(actual).toMatchObject({ id: payload.id, guildId: payload.guild_id, channelId: payload.channel_id, actorId: payload.member.user.id, messageId: payload.message.id })
    expect(actual.requestHash).toMatch(/^[a-f0-9]{64}$/u)
    expect(JSON.stringify(actual)).not.toContain("never-persist-this")
    expect(JSON.stringify(actual)).not.toContain(proof.interaction.signature)
  })
  it("rejects edited actors, whitespace, timestamps and wrong application", async () => {
    const proof = await sign()
    for (const interaction of [
      { ...proof.interaction, rawBody: proof.interaction.rawBody.replace(payload.member.user.id, "7334567890123456789") },
      { ...proof.interaction, rawBody: `${proof.interaction.rawBody} ` },
      { ...proof.interaction, timestamp: String(Number(proof.interaction.timestamp) + 1) },
    ]) expect((await Effect.runPromise(verifyRuntimeInteraction({ interaction }, configuration).pipe(Effect.flip)))._tag).toBe("Unauthenticated")
    expect((await Effect.runPromise(verifyRuntimeInteraction(proof, { ...configuration, DISCORD_APPLICATION_ID: "9" }).pipe(Effect.flip)))._tag).toBe("Forbidden")
  })
  it("verifies old proofs for receipt lookup but disallows old/future first use", async () => {
    const now = Date.now()
    for (const signedAt of [now - 301_000, now + 31_000]) {
      const actual = await Effect.runPromise(verifyRuntimeInteraction(await sign(undefined, String(Math.floor(signedAt / 1000))), configuration))
      expect((await Effect.runPromise(requireFreshInteraction(actual, now).pipe(Effect.flip)))._tag).toBe("Unauthenticated")
    }
  })
  it("rejects malformed signed JSON, BOM, DM and lone UTF-16 surrogate", async () => {
    for (const raw of ["{", `\uFEFF${JSON.stringify(payload)}`, JSON.stringify({ ...payload, guild_id: undefined }), `"\uD800"`]) {
      expect((await Effect.runPromise(verifyRuntimeInteraction(await sign(raw), configuration).pipe(Effect.flip)))._tag).toBe("InvalidRequest")
    }
  })
  it("counts UTF-8 bytes and accepts the exact raw limit with escaped wrapper overhead", async () => {
    const json = JSON.stringify(payload)
    const raw = `${json}${"\t".repeat(1_048_576 - new TextEncoder().encode(json).length)}`
    const proof = await sign(raw)
    expect(new TextEncoder().encode(JSON.stringify(proof)).length).toBeLessThanOrEqual(2 * 1_048_576 + 1024)
    expect(Schema.decodeUnknownSync(RuntimeInteractionProof)(proof)).toEqual(proof)
    await Effect.runPromise(verifyRuntimeInteraction(proof, configuration))
    expect((await Effect.runPromise(verifyRuntimeInteraction(await sign(`${raw} `), configuration).pipe(Effect.flip)))._tag).toBe("PayloadTooLarge")
    expect((await Effect.runPromise(verifyRuntimeInteraction(await sign(`{"x":"${"中".repeat(350_000)}"}`), configuration).pipe(Effect.flip)))._tag).toBe("PayloadTooLarge")
  })
  it("rejects missing verification configuration", async () => {
    expect((await Effect.runPromise(verifyRuntimeInteraction(await sign(), { ...configuration, DISCORD_PUBLIC_KEY: "" }).pipe(Effect.flip)))._tag).toBe("UpstreamUnavailable")
  })
  it("decodes signed guild commands and permission bitfields without accepting command data as a component", async () => {
    const command={ ...payload,type:2,message:undefined,member:{ ...payload.member,permissions:"40",roles:["7334567890123456789"] },
      data:{ name:"ticket",options:[{ name:"panel-post",type:1,options:[{ name:"panel-id",type:3,value:"00000000-0000-4000-8000-000000000001" }] }] } }
    const verified=await Effect.runPromise(verifyRuntimeInteraction(await sign(JSON.stringify(command)),configuration))
    expect(verified).toMatchObject({ type:2,permissions:"40",actorRoleIds:["7334567890123456789"],data:{ name:"ticket" } })
    const malformed={ ...payload,data:{ name:"ticket" } }
    expect((await Effect.runPromise(verifyRuntimeInteraction(await sign(JSON.stringify(malformed)),configuration).pipe(Effect.flip)))._tag).toBe("InvalidRequest")
  })
})

describe("Dashboard role mode semantics", () => {
  it.each([
    ["none", [], [], true], ["none", ["1"], [], true],
    ["allow", [], [], false], ["allow", ["1"], ["1"], true], ["allow", ["1"], ["2"], false],
    ["deny", [], [], true], ["deny", ["1"], ["1"], false], ["deny", ["1"], ["2"], true],
    ["unknown", [], [], false],
  ] as const)("%s required=%j actual=%j permits=%s", (mode, required, actual, expected) => expect(giveawayRolesPermit(mode, required, actual)).toBe(expected))
})
