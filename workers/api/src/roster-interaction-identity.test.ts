import { Effect } from "effect"
import { beforeAll, expect, it } from "vitest"
import { verifyRosterInteraction } from "./roster-interaction-identity.js"

const rosterId = "00000000-0000-4000-8000-000000000001"
const hex = (value: ArrayBuffer) => [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
let keys: CryptoKeyPair
let configuration: { DISCORD_PUBLIC_KEY: string; DISCORD_APPLICATION_ID: string }
beforeAll(async () => {
  keys = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]) as CryptoKeyPair
  configuration = { DISCORD_PUBLIC_KEY: hex(await crypto.subtle.exportKey("raw", keys.publicKey)), DISCORD_APPLICATION_ID: "2334567890123456789" }
})
const payload = (data: unknown, type = 3) => ({
  id: "1334567890123456789", application_id: configuration.DISCORD_APPLICATION_ID, type,
  guild_id: "3334567890123456789", channel_id: "4334567890123456789",
  member: { user: { id: "5334567890123456789", username: "Applicant" } },
  message: { id: "6334567890123456789" }, token: "must-never-enter-a-receipt", data,
})
const sign = async (value: unknown) => {
  const rawBody = JSON.stringify(value), timestamp = String(Math.floor(Date.now() / 1000))
  return { interaction: { rawBody, timestamp,
    signature: hex(await crypto.subtle.sign("Ed25519", keys.privateKey, new TextEncoder().encode(timestamp + rawBody))),
  } }
}

it("derives a roster signup and its actor/message scope from the verified Discord button", async () => {
  const proof = await sign(payload({ custom_id: `ck:roster:signup:${rosterId}`, component_type: 2 }))
  const result = await Effect.runPromise(verifyRosterInteraction(proof, configuration))
  expect(result.control).toEqual({ kind: "action", action: "signup", rosterId })
  expect(result.interaction).toMatchObject({ actorId: "5334567890123456789", guildId: "3334567890123456789",
    channelId: "4334567890123456789", messageId: "6334567890123456789" })
  expect(JSON.stringify(result)).not.toContain("must-never-enter-a-receipt")
  expect(JSON.stringify(result)).not.toContain(proof.interaction.signature)
})

it("recognizes each retained board action without accepting legacy aliases or wrong component types", async () => {
  for (const action of ["signup", "remove", "sub", "refresh"]) {
    const result = await Effect.runPromise(verifyRosterInteraction(await sign(payload({
      custom_id: `ck:roster:${action}:${rosterId}`, component_type: 2,
    })), configuration))
    expect(result.control).toEqual({ kind: "action", action, rosterId })
  }
  for (const data of [
    { custom_id: "Signup_MyRoster", component_type: 2 },
    { custom_id: `ck:roster:signup:${rosterId}:extra`, component_type: 2 },
    { custom_id: "ck:roster:signup:roster-alias", component_type: 2 },
    { custom_id: `ck:roster:signup:${rosterId}`, component_type: 3, values: ["#2PP"] },
    { custom_id: `ck:ticket:open:${rosterId}`, component_type: 2 },
  ]) {
    const failure = await Effect.runPromise(verifyRosterInteraction(await sign(payload(data)), configuration).pipe(Effect.flip))
    expect(failure._tag).toBe("Forbidden")
  }
})

it("binds each form control to its operation, canonical version, and Discord interaction type", async () => {
  for (const [step, type, componentType] of [
    ["accounts", 3, 3], ["group", 3, 3], ["choice", 3, 3],
    ["answers", 5, undefined], ["continue", 3, 2], ["submit", 3, 2],
  ] as const) {
    const data = { custom_id: `ck:roster:${step}:${rosterId}:12`, component_type: componentType }
    const result = await Effect.runPromise(verifyRosterInteraction(await sign(payload(data, type)), configuration))
    expect(result.control).toEqual({ kind: "advance", step, operationId: rosterId, version: 12 })
    const wrong = await Effect.runPromise(verifyRosterInteraction(await sign(payload(data, type === 5 ? 3 : 5)), configuration).pipe(Effect.flip))
    expect(wrong._tag).toBe("Forbidden")
  }
  for (const version of ["0", "01", "-1", "1.5", "1e2", "2147483648", "9007199254740993", "1:extra"]) {
    const failure = await Effect.runPromise(verifyRosterInteraction(await sign(payload({
      custom_id: `ck:roster:submit:${rosterId}:${version}`, component_type: 2,
    })), configuration).pipe(Effect.flip))
    expect(failure._tag).toBe("Forbidden")
  }
})

it("distinguishes normal and publication status without relying on prior Bot state", async () => {
  for (const [prefix, kind] of [["status", "status"], ["publication-status", "publication-status"]] as const) {
    const result = await Effect.runPromise(verifyRosterInteraction(await sign(payload({
      custom_id: `ck:roster:${prefix}:${rosterId}`, component_type: 2,
    })), configuration))
    expect(result.control).toEqual({ kind, operationId: rosterId })
  }
})

it("decodes only the signed roster-post UUID and exact legacy publication mode", async () => {
  for (const [value, mode] of [["Signup", "signup"], ["Post", "post"], ["Static", "static"]] as const) {
    const command = { ...payload({ name: "roster", options: [{ name: "post", type: 1, options: [
      { name: "roster", type: 3, value: rosterId }, { name: "type", type: 3, value },
    ] }] }, 2), message: undefined }
    const result = await Effect.runPromise(verifyRosterInteraction(await sign(command), configuration))
    expect(result.control).toEqual({ kind: "publish", rosterId, mode })
  }
  for (const options of [
    [{ name: "roster", type: 3, value: "old-alias" }, { name: "type", type: 3, value: "Signup" }],
    [{ name: "roster", type: 3, value: rosterId }, { name: "type", type: 3, value: "signup" }],
    [{ name: "roster", type: 3, value: rosterId }, { name: "roster", type: 3, value: rosterId }],
    [{ name: "roster", type: 3, value: rosterId }, { name: "type", type: 3, value: "Signup" }, { name: "channel", type: 7, value: "123" }],
  ]) {
    const failure = await Effect.runPromise(verifyRosterInteraction(await sign(payload({
      name: "roster", options: [{ name: "post", type: 1, options }],
    }, 2)), configuration).pipe(Effect.flip))
    expect(failure._tag).toBe("Forbidden")
  }
})
