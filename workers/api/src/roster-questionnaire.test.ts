import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { normalizeRosterQuestions } from "./roster-questionnaire.js"
const question = { id: "89d263c3-f2f1-4bea-bc8c-bd2fabcde012", label: "Ready?", type: "boolean", required: true }
describe("roster questionnaire normalization", () => {
  it("accepts Dashboard UUIDs and supplies empty options for non-select questions", async () => {
    expect(await Effect.runPromise(normalizeRosterQuestions([question]))).toEqual([{ ...question, options: [], order: 0 }])
  })
  it("supports 25 options but rejects 26", async () => {
    const dropdown = { ...question, type: "single_select", options: Array.from({ length: 25 }, (_, i) => String(i)) }
    expect((await Effect.runPromise(normalizeRosterQuestions([dropdown])))[0]?.options).toHaveLength(25)
    await expect(Effect.runPromise(normalizeRosterQuestions([{ ...dropdown, options: [...dropdown.options, "26"] }]))).rejects.toThrow()
  })
  it.each(["account", "player", "bad id"])("rejects reserved or invalid ID %s", async id => {
    await expect(Effect.runPromise(normalizeRosterQuestions([{ ...question, id }]))).rejects.toThrow()
  })
})
