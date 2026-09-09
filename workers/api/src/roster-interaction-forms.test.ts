import { RosterRuntimeForm } from "@clashking/api-contracts/deferred-runtime"
import { Effect, Schema } from "effect"
import { expect, it } from "vitest"
import { advanceRosterForm, createRosterForm, renderRosterForm } from "./roster-interaction-forms.js"
import type { VerifiedRuntimeInteraction } from "./runtime-interaction.js"

const operationId = "00000000-0000-4000-8000-000000000001"
const groupId = "00000000-0000-4000-8000-000000000002"
const interaction = (step: string, version: number, values?: readonly string[]): VerifiedRuntimeInteraction => ({
  id: "1334567890123456789", actorId: "2334567890123456789", actorLabel: "Player", actorRoleIds: [],
  guildId: "3334567890123456789", channelId: "4334567890123456789", messageId: "5334567890123456789",
  type: 3, permissions: "0", requestHash: "a".repeat(64), signedAt: Date.now(),
  data: { custom_id: `ck:roster:${step}:${operationId}:${version}`, component_type: 3, ...(values === undefined ? {} : { values }) },
})

it("offers owned accounts and advances the exact selected accounts into the configured group choice", async () => {
  const initial = await Effect.runPromise(createRosterForm({
    accounts: [{ tag: "#2PP", label: "One" }, { tag: "#2PQ", label: "Two" }],
    groups: [{ id: groupId, label: "War Team" }], questions: [],
  }))
  const first = await Effect.runPromise(renderRosterForm(operationId, "signup", initial))
  expect(Schema.decodeUnknownSync(RosterRuntimeForm)(first)).toMatchObject({ kind: "account_select",
    customId: `ck:roster:accounts:${operationId}:1`, minValues: 1, maxValues: 2,
    options: [{ value: "#2PP", label: "One" }, { value: "#2PQ", label: "Two" }] })
  const next = await Effect.runPromise(advanceRosterForm(operationId, "signup", initial, interaction("accounts", 1, ["#2PQ"])))
  expect(next.draft.selectedTags).toEqual(["#2PQ"])
  const group = await Effect.runPromise(renderRosterForm(operationId, "signup", next))
  expect(Schema.decodeUnknownSync(RosterRuntimeForm)(group)).toMatchObject({ kind: "string_select",
    customId: `ck:roster:group:${operationId}:2`, options: [{ value: "main", label: "Main Group" }, { value: groupId, label: "War Team" }] })
})

it("requires a configured group and explicit confirmation before a question-free signup is ready to commit", async () => {
  let cursor = await Effect.runPromise(createRosterForm({ accounts: [{ tag: "#2PP", label: "One" }],
    groups: [{ id: groupId, label: "War Team" }], questions: [] }))
  cursor = await Effect.runPromise(advanceRosterForm(operationId, "signup", cursor, interaction("accounts", 1, ["#2PP"])))
  cursor = await Effect.runPromise(advanceRosterForm(operationId, "signup", cursor, interaction("group", 2, [groupId])))
  expect(cursor.stage).toBe("confirm")
  expect(cursor.draft.selectedGroup).toBe(groupId)
  expect(await Effect.runPromise(renderRosterForm(operationId, "signup", cursor))).toMatchObject({
    kind: "continue", customId: `ck:roster:submit:${operationId}:3`,
  })
  cursor = await Effect.runPromise(advanceRosterForm(operationId, "signup", cursor, {
    ...interaction("submit", 3), data: { custom_id: `ck:roster:submit:${operationId}:3`, component_type: 2 },
  }))
  expect(cursor.stage).toBe("done")
  expect(cursor.version).toBe(4)
})

it("preserves all four mixed-type answers and requires a component continuation before every text modal", async () => {
  const longOption = "A very specific option ".repeat(6)
  let cursor = await Effect.runPromise(createRosterForm({ accounts: [{ tag: "#2PP", label: "One" }], groups: [], questions: [
    { id: "first", label: "Describe your availability in enough detail for the roster leader", type: "text", required: true, order: 0 },
    { id: "second", label: "Notes", type: "text", required: false, order: 1 },
    { id: "ready", label: "Ready?", type: "boolean", required: true, order: 2 },
    { id: "strategy", label: "Strategy", type: "single_select", required: true, order: 3, options: ["Other", longOption] },
  ] }))
  cursor = await Effect.runPromise(advanceRosterForm(operationId, "signup", cursor, interaction("accounts", 1, ["#2PP"])))
  cursor = await Effect.runPromise(advanceRosterForm(operationId, "signup", cursor, interaction("group", 2, ["main"])))
  for (const [id, answer] of [["first", "Weekends only"], ["second", "My optional notes"]]) {
    const continuation = await Effect.runPromise(renderRosterForm(operationId, "signup", cursor))
    expect(continuation.kind).toBe("continue")
    cursor = await Effect.runPromise(advanceRosterForm(operationId, "signup", cursor, {
      ...interaction("continue", cursor.version), data: { custom_id: continuation.customId, component_type: 2 },
    }))
    const modal = await Effect.runPromise(renderRosterForm(operationId, "signup", cursor))
    expect(modal.kind).toBe("modal")
    cursor = await Effect.runPromise(advanceRosterForm(operationId, "signup", cursor, {
      ...interaction("answers", cursor.version), type: 5, data: { custom_id: modal.customId,
        components: [{ type: 18, component: { type: 4, custom_id: `answer:${id}`, value: answer } }] },
    }))
  }
  const boolean = await Effect.runPromise(renderRosterForm(operationId, "signup", cursor))
  expect(boolean).toMatchObject({ kind: "string_select", options: [{ value: "true", label: "Yes" }, { value: "false", label: "No" }] })
  cursor = await Effect.runPromise(advanceRosterForm(operationId, "signup", cursor, interaction("choice", cursor.version, ["false"])))
  const choice = await Effect.runPromise(renderRosterForm(operationId, "signup", cursor))
  expect(Schema.decodeUnknownSync(RosterRuntimeForm)(choice)).toMatchObject({ kind: "string_select" })
  cursor = await Effect.runPromise(advanceRosterForm(operationId, "signup", cursor, interaction("choice", cursor.version, ["option:1"])))
  expect(cursor.stage).toBe("confirm")
  expect(cursor.draft.answers).toEqual({ first: "Weekends only", second: "My optional notes", ready: false, strategy: longOption })
})

it("does not ask removal applicants for signup answers and keeps substitutes in the main group", async () => {
  const initial = await Effect.runPromise(createRosterForm({ accounts: [{ tag: "#2PP", label: "One" }], groups: [],
    questions: [{ id: "ready", label: "Ready?", type: "boolean", required: true, order: 0 }] }))
  const removal = await Effect.runPromise(advanceRosterForm(operationId, "remove", initial, interaction("accounts", 1, ["#2PP"])))
  expect(removal.stage).toBe("confirm")
  expect(removal.draft.answers).toEqual({})
  const substitute = await Effect.runPromise(advanceRosterForm(operationId, "sub", initial, interaction("accounts", 1, ["#2PP"])))
  expect(substitute.stage).toBe("question")
  expect(substitute.draft.selectedGroup).toBe("main")
})

it("accepts only one matching Label-wrapped text field and enforces required text and length", async () => {
  let cursor = await Effect.runPromise(createRosterForm({ accounts: [{ tag: "#2PP", label: "One" }], groups: [],
    questions: [{ id: "notes", label: "Notes", type: "text", required: true, order: 0 }] }))
  cursor = await Effect.runPromise(advanceRosterForm(operationId, "sub", cursor, interaction("accounts", 1, ["#2PP"])))
  cursor = await Effect.runPromise(advanceRosterForm(operationId, "sub", cursor, {
    ...interaction("continue", 2), data: { custom_id: `ck:roster:continue:${operationId}:2`, component_type: 2 },
  }))
  const field = { type: 4, custom_id: "answer:notes", value: "Valid answer" }
  for (const components of [[], [{ type: 18, component: field }, { type: 18, component: field }],
    [{ type: 1, components: [field] }], [{ type: 18, component: { ...field, custom_id: "answer:other" } }],
    [{ type: 18, component: { ...field, value: "   " } }], [{ type: 18, component: { ...field, value: "x".repeat(4001) } }],
    [{ type: 18, component: { ...field, type: 3 } }],
  ]) expect(await Effect.runPromise(advanceRosterForm(operationId, "sub", cursor, {
    ...interaction("answers", 3), type: 5, data: { custom_id: `ck:roster:answers:${operationId}:3`, components },
  }).pipe(Effect.flip))).toMatchObject({ _tag: "InvalidRequest" })
  expect(cursor.draft.answers).toEqual({})
})

it("rejects stale controls and unoffered or duplicate selections without mutating the saved draft", async () => {
  const initial = await Effect.runPromise(createRosterForm({ accounts: [{ tag: "#2PP", label: "One" }], groups: [], questions: [] }))
  for (const [version, values, expected] of [[2, ["#2PP"], "Conflict"], [1, ["#2PQ"], "InvalidRequest"],
    [1, ["#2PP", "#2PP"], "InvalidRequest"], [1, [], "InvalidRequest"]] as const) {
    expect(await Effect.runPromise(advanceRosterForm(operationId, "signup", initial,
      interaction("accounts", version, values)).pipe(Effect.flip))).toMatchObject({ _tag: expected })
  }
  expect(initial.draft.selectedTags).toEqual([])
  const invalid = { ...initial, version: 2_147_483_647 }
  expect(await Effect.runPromise(advanceRosterForm(operationId, "signup", invalid,
    interaction("accounts", invalid.version, ["#2PP"])).pipe(Effect.flip))).toMatchObject({ _tag: "Conflict" })
})

it("refuses ambiguous configuration instead of discarding questions or duplicate account choices", async () => {
  const base = { accounts: [{ tag: "#2PP", label: "One" }], groups: [], questions: [] }
  const question = { id: "ready", label: "Ready?", type: "boolean" as const, required: true, order: 0 }
  for (const input of [
    { ...base, accounts: [...base.accounts, ...base.accounts] },
    { ...base, accounts: [] },
    { ...base, questions: [question, question] },
    { ...base, questions: Array.from({ length: 5 }, (_, index) => ({ ...question, id: `q${index}`, order: index })) },
    { ...base, groups: [{ id: groupId, label: "A" }, { id: groupId, label: "B" }] },
  ]) expect(await Effect.runPromise(createRosterForm(input).pipe(Effect.flip))).toMatchObject({ _tag: "InvalidRequest" })
})

it("lets owners with more than 25 accounts choose an account page without hiding the final accounts", async () => {
  const accounts = Array.from({ length: 26 }, (_, index) => ({ tag: `#P${index}`, label: `Player ${index}` }))
  const initial = await Effect.runPromise(createRosterForm({ accounts, groups: [], questions: [] }))
  expect(await Effect.runPromise(renderRosterForm(operationId, "signup", initial))).toMatchObject({ kind: "string_select",
    options: [{ value: "page:0" }, { value: "page:1" }], minValues: 1, maxValues: 1,
  })
  expect(await Effect.runPromise(advanceRosterForm(operationId, "signup", initial,
    interaction("accounts", 1, ["#P25"])).pipe(Effect.flip))).toMatchObject({ _tag: "InvalidRequest" })
  const lastPage = await Effect.runPromise(advanceRosterForm(operationId, "signup", initial, interaction("accounts", 1, ["page:1"])))
  expect(await Effect.runPromise(renderRosterForm(operationId, "signup", lastPage))).toMatchObject({ kind: "account_select",
    options: [{ value: "#P25", label: "Player 25" }], maxValues: 1,
  })
  expect(await Effect.runPromise(advanceRosterForm(operationId, "signup", lastPage,
    interaction("accounts", 2, ["#P0"])).pipe(Effect.flip))).toMatchObject({ _tag: "InvalidRequest" })
  const selected = await Effect.runPromise(advanceRosterForm(operationId, "signup", lastPage, interaction("accounts", 2, ["#P25"])))
  expect(selected.draft.selectedTags).toEqual(["#P25"])
  expect(selected.stage).toBe("group")
})
