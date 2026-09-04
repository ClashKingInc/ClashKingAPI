import { DashboardRosterSignupQuestion, RosterRuntimeForm, RuntimeUUID } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { Conflict, InvalidRequest } from "./errors.js"
import type { VerifiedRuntimeInteraction } from "./runtime-interaction.js"

const Account = Schema.Struct({ tag: Schema.String, label: Schema.String })
const Group = Schema.Struct({ id: RuntimeUUID, label: Schema.String })
const Configuration = Schema.Struct({
  accounts: Schema.Array(Account).check(Schema.isMinLength(1), Schema.isMaxLength(625)),
  groups: Schema.Array(Group).check(Schema.isMaxLength(24)),
  questions: Schema.Array(DashboardRosterSignupQuestion).check(Schema.isMaxLength(4)),
})
const Input = Configuration.check(Schema.makeFilter((value) => {
  if (new Set(value.accounts.map((account) => account.tag)).size !== value.accounts.length
    || new Set(value.groups.map((group) => group.id)).size !== value.groups.length
    || new Set(value.questions.map((question) => question.id)).size !== value.questions.length
    || new Set(value.questions.map((question) => question.order)).size !== value.questions.length
    || value.accounts.some((account) => !account.tag.startsWith("#") || account.tag.length < 2)
    || value.groups.some((group) => group.label.trim().length === 0)
    || value.questions.some((question) => !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u.test(question.id)
      || ["account", "account_selector", "player", "player_selector"].includes(question.id.toLowerCase())
      || question.label.trim().length === 0 || !Number.isSafeInteger(question.order) || question.order < 0
      || (question.type === "single_select" ? !question.options?.length || question.options.length > 20
        || question.options.some((option) => option.trim().length === 0) : (question.options?.length ?? 0) !== 0))) {
    return "Roster choices and questions must be bounded and unambiguous"
  }
  return undefined
}))
const ModalAnswers = Schema.Array(Schema.Struct({ type: Schema.Literal(18),
  component: Schema.Struct({ type: Schema.Literal(4), custom_id: Schema.String,
    value: Schema.String.check(Schema.isMaxLength(4000)) }),
})).check(Schema.isMinLength(1), Schema.isMaxLength(1))
const isConfiguration = Schema.is(Input)
export const RosterFormDraft = Schema.Struct({ ...Configuration.fields,
  configurationFingerprint: Schema.NullOr(Schema.String),
  accountPage: Schema.NullOr(Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 24 }))),
  selectedTags: Schema.Array(Schema.String).check(Schema.isMaxLength(25)),
  selectedGroup: Schema.NullOr(Schema.String), answers: Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Boolean])),
  textPromptOpened: Schema.Boolean,
}).check(Schema.makeFilter((value) => isConfiguration(value) ? undefined : "Invalid saved roster form configuration"))
export const RosterFormCursorSchema = Schema.Struct({
  stage: Schema.Literals(["account", "group", "question", "confirm", "done"]),
  version: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 2_147_483_647 })),
  questionIndex: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 4 })), draft: RosterFormDraft,
})
export type RosterFormCursor = typeof RosterFormCursorSchema.Type
type ParticipationAction = "signup" | "remove" | "sub"
const clipped = (value: string, max: number) => value.slice(0, max).replace(/[\uD800-\uDBFF]$/u, "")
const encodeForm = (value: typeof RosterRuntimeForm.Type) => Schema.decodeUnknownEffect(RosterRuntimeForm)(value).pipe(
  Effect.mapError(() => new InvalidRequest({ message: "Roster form exceeds Discord field limits" })),
)

export const createRosterForm = (input: typeof Input.Type): Effect.Effect<RosterFormCursor, InvalidRequest> =>
  Schema.decodeUnknownEffect(Input)(input).pipe(
    Effect.mapError(() => new InvalidRequest({ message: "Invalid roster form configuration" })),
    Effect.map((draft) => ({ stage: "account" as const, version: 1, questionIndex: 0,
      draft: { ...draft, questions: [...draft.questions].sort((left, right) => left.order - right.order),
        configurationFingerprint: null, accountPage: draft.accounts.length > 25 ? null : 0,
        selectedTags: [], selectedGroup: null, answers: {}, textPromptOpened: false } })),
  )

export const renderRosterForm = (operationId: string, action: ParticipationAction, cursor: RosterFormCursor):
  Effect.Effect<typeof RosterRuntimeForm.Type, Conflict | InvalidRequest> => {
  if (cursor.stage === "account" && cursor.draft.accountPage === null) return encodeForm({ kind: "string_select",
    customId: `ck:roster:accounts:${operationId}:${cursor.version}`, content: "Choose a page of your linked accounts, then select accounts from that page.",
    placeholder: "Choose Account Page", minValues: 1, maxValues: 1,
    options: Array.from({ length: Math.ceil(cursor.draft.accounts.length / 25) }, (_, page) => ({ value: `page:${page}`,
      label: `Accounts ${page * 25 + 1}–${Math.min((page + 1) * 25, cursor.draft.accounts.length)}`,
      description: clipped(`${cursor.draft.accounts[page * 25]?.tag} – ${cursor.draft.accounts[Math.min((page + 1) * 25, cursor.draft.accounts.length) - 1]?.tag}`, 100),
    })),
  })
  const accounts = cursor.draft.accounts.slice((cursor.draft.accountPage ?? 0) * 25, ((cursor.draft.accountPage ?? 0) + 1) * 25)
  if (cursor.stage === "account") return encodeForm({ kind: "account_select",
    customId: `ck:roster:accounts:${operationId}:${cursor.version}`, content: "Select your roster accounts.",
    placeholder: "Select Account(s)", minValues: 1, maxValues: accounts.length,
    options: accounts.map((account) => ({ value: account.tag, label: clipped(account.label || account.tag, 100) })),
  })
  if (cursor.stage === "group") return encodeForm({ kind: "string_select",
    customId: `ck:roster:group:${operationId}:${cursor.version}`, content: "Choose the roster group for these accounts.",
    placeholder: "Select Roster Group", minValues: 1, maxValues: 1,
    options: [{ value: "main", label: "Main Group" }, ...cursor.draft.groups.map((group) => ({ value: group.id, label: clipped(group.label, 100) }))],
  })
  if (cursor.stage === "confirm") return encodeForm({ kind: "continue",
    customId: `ck:roster:submit:${operationId}:${cursor.version}`, label: "Confirm",
    content: `Confirm ${action} for ${cursor.draft.selectedTags.length} account(s).`,
  })
  const question = cursor.draft.questions[cursor.questionIndex]
  if (cursor.stage === "question" && question !== undefined) {
    if (question.type === "text") {
      // The preceding message preserves the full configured prompt and makes a
      // second modal require a fresh component interaction, never a modal ACK.
      if (!cursor.draft.textPromptOpened) return encodeForm({ kind: "continue",
        customId: `ck:roster:continue:${operationId}:${cursor.version}`, label: "Answer question",
        content: `Question ${cursor.questionIndex + 1}: ${question.label}`,
      })
      return encodeForm({ kind: "modal", customId: `ck:roster:answers:${operationId}:${cursor.version}`,
        title: `Roster question ${cursor.questionIndex + 1}`, fields: [{ customId: `answer:${question.id}`,
          label: clipped(question.label, 45), required: question.required, style: "paragraph", maxLength: 4000 }],
      })
    }
    const options = question.type === "boolean" ? [{ value: "true", label: "Yes" }, { value: "false", label: "No" }]
      : (question.options ?? []).map((option, index) => ({ value: `option:${index}`, label: clipped(option, 100),
        ...(option.length > 100 ? { description: clipped(option.slice(clipped(option, 100).length), 100) } : {}) }))
    return encodeForm({ kind: "string_select", customId: `ck:roster:choice:${operationId}:${cursor.version}`,
      content: `Question ${cursor.questionIndex + 1}: ${question.label}`, placeholder: "Choose an answer",
      minValues: 1, maxValues: 1, options: [...options, ...(!question.required ? [{ value: "skip", label: "Skip this question" }] : [])],
    })
  }
  return Effect.fail(new Conflict({ message: "Roster form is not ready" }))
}

export const advanceRosterForm = (operationId: string, action: ParticipationAction, cursor: RosterFormCursor,
  interaction: VerifiedRuntimeInteraction): Effect.Effect<RosterFormCursor, Conflict | InvalidRequest> => Effect.gen(function* () {
  const question = cursor.draft.questions[cursor.questionIndex]
  const step = cursor.stage === "account" ? "accounts" : cursor.stage === "group" ? "group"
    : cursor.stage === "confirm" ? "submit" : cursor.stage === "question" && question !== undefined
      ? question.type === "text" ? cursor.draft.textPromptOpened ? "answers" : "continue" : "choice" : undefined
  const matchesType = step === "answers" ? interaction.type === 5
    : interaction.type === 3 && interaction.data.component_type === (step === "submit" || step === "continue" ? 2 : 3)
  if (step === undefined || !matchesType
    || interaction.data.custom_id !== `ck:roster:${step}:${operationId}:${cursor.version}`
    || !Number.isInteger(cursor.version) || cursor.version < 1 || cursor.version >= 2_147_483_647) {
    return yield* new Conflict({ message: "Roster form is stale or the control does not match its stage" })
  }
  const values = interaction.data.values ?? []
  if (step === "accounts") {
    if (cursor.draft.accountPage === null) {
      const selection = values[0] ?? ""
      const page = Number(selection.slice(5))
      if (values.length !== 1 || !/^page:(0|[1-9][0-9]*)$/u.test(selection) || page * 25 >= cursor.draft.accounts.length) {
        return yield* new InvalidRequest({ message: "Select an account page offered by this roster form" })
      }
      return { ...cursor, version: cursor.version + 1, draft: { ...cursor.draft, accountPage: page } }
    }
    const offered = cursor.draft.accounts.slice(cursor.draft.accountPage * 25, (cursor.draft.accountPage + 1) * 25)
    if (values.length === 0 || new Set(values).size !== values.length
      || values.some((value) => !offered.some((account) => account.tag === value))) {
      return yield* new InvalidRequest({ message: "Select only accounts offered by this roster form" })
    }
    const stage = action === "signup" ? "group" : action === "sub" && cursor.draft.questions.length ? "question" : "confirm"
    return { ...cursor, stage, version: cursor.version + 1,
      draft: { ...cursor.draft, selectedTags: [...values], selectedGroup: action === "signup" ? null : "main" } }
  }
  if (step === "group") {
    const selected = values[0]
    if (values.length !== 1 || selected === undefined
      || selected !== "main" && !cursor.draft.groups.some((group) => group.id === selected)) {
      return yield* new InvalidRequest({ message: "Select a group offered by this roster form" })
    }
    return { ...cursor, stage: cursor.draft.questions.length ? "question" : "confirm", version: cursor.version + 1,
      draft: { ...cursor.draft, selectedGroup: selected } }
  }
  if (step === "submit") return { ...cursor, stage: "done", version: cursor.version + 1 }
  if (step === "continue") return { ...cursor, version: cursor.version + 1, draft: { ...cursor.draft, textPromptOpened: true } }
  if (question === undefined) return yield* new Conflict({ message: "Roster question is no longer available" })
  let answer: string | boolean | undefined
  if (step === "answers") {
    const rows = yield* Schema.decodeUnknownEffect(ModalAnswers)(interaction.data.components).pipe(
      Effect.mapError(() => new InvalidRequest({ message: "Roster answer must contain exactly its offered text field" })),
    )
    const field = rows[0]?.component
    if (field?.custom_id !== `answer:${question.id}` || question.required && field.value.trim().length === 0) {
      return yield* new InvalidRequest({ message: "The roster question requires its matching answer" })
    }
    if (field.value.length > 0) answer = field.value
  } else {
    const selected = values[0]
    if (values.length !== 1 || selected === undefined) return yield* new InvalidRequest({ message: "Choose exactly one offered answer" })
    if (selected === "skip" && !question.required) answer = undefined
    else if (question.type === "boolean" && (selected === "true" || selected === "false")) answer = selected === "true"
    else if (question.type === "single_select" && /^option:(0|[1-9][0-9]*)$/u.test(selected)) answer = question.options?.[Number(selected.slice(7))]
    if (answer === undefined && (selected !== "skip" || question.required)) {
      return yield* new InvalidRequest({ message: "Choose an answer offered by this roster form" })
    }
  }
  const answers = { ...cursor.draft.answers }
  if (answer !== undefined) answers[question.id] = answer
  const questionIndex = cursor.questionIndex + 1
  return { ...cursor, questionIndex, stage: questionIndex < cursor.draft.questions.length ? "question" : "confirm",
    version: cursor.version + 1, draft: { ...cursor.draft, answers, textPromptOpened: false } }
})
