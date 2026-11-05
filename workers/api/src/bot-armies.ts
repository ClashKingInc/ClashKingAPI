import { BotArmyInteractionEndpoint, BotArmyReply } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { AuthIdentity } from "./auth.js"
import { normalizeArmyLink } from "./army-link.js"
import type { WorkerBindings } from "./environment.js"
import { InvalidRequest } from "./errors.js"
import { readPersonalArmies } from "./mobile-persistence.js"
import { prepareBotArmy, savePreparedBotArmy } from "./bot-army-presentation.js"
import { readBoundedJson } from "./request-body.js"
import { requireFreshInteraction, verifyRuntimeInteraction, type VerifiedRuntimeInteraction } from "./runtime-interaction.js"

const Options = Schema.Array(Schema.Struct({
  name: Schema.String, type: Schema.Number,
  options: Schema.optionalKey(Schema.Array(Schema.Struct({ name: Schema.String, type: Schema.Number, value: Schema.Union([Schema.String, Schema.Number]) }))),
}))
const displayText = (value: unknown, maximum: number, label: string): string | undefined => {
  if (value === undefined || value === null) return undefined
  if (typeof value !== "string" || value.trim().length > maximum
    || [...value].some(character => character.charCodeAt(0) < 32 && ![9,10,13].includes(character.charCodeAt(0)))) throw new InvalidRequest({message:`Invalid army ${label}`})
  return value.trim() || undefined
}
const digestCode = (code: string) => Effect.promise(async () => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code)))].map(n => n.toString(16).padStart(2,"0")).join(""))
const modalValues = (components: readonly unknown[]): string[] => components.flatMap(component => {
  if (typeof component !== "object" || component === null) return []
  const row = component as {custom_id?: unknown;values?: unknown;component?: unknown;components?: unknown}
  if (row.custom_id === "army" && Array.isArray(row.values) && row.values.every(v => typeof v === "string")) return row.values as string[]
  return [...(row.component ? modalValues([row.component]) : []), ...(Array.isArray(row.components) ? modalValues(row.components) : [])]
})

export const dispatchBotArmies = (request: Request, bindings: WorkerBindings) => Effect.gen(function* () {
  if (request.method !== "POST" || new URL(request.url).pathname !== BotArmyInteractionEndpoint.path) return undefined
  yield* (yield* AuthIdentity).requireBot(request)
  const proof = yield* Schema.decodeUnknownEffect(BotArmyInteractionEndpoint.body)(yield* readBoundedJson(request, 2_100_000)).pipe(
    Effect.mapError(() => new InvalidRequest({ message: "Invalid army interaction proof" })),
  )
  const interaction: VerifiedRuntimeInteraction = yield* verifyRuntimeInteraction(proof, bindings)
  yield* requireFreshInteraction(interaction)
  const reply = (value: typeof BotArmyReply.Type) => Schema.encodeEffect(BotArmyReply)(value).pipe(
    Effect.map(result => Response.json(result, { headers: { "cache-control": "no-store" } })), Effect.orDie)
  if (interaction.type === 5) {
    if (interaction.data.custom_id !== `ck:army:share:${interaction.actorId}`) return yield* new InvalidRequest({message:"This army selection belongs to another user"})
    const values = modalValues(interaction.data.components ?? [])
    if (values.length !== 1) return yield* new InvalidRequest({message:"Select one saved army"})
    // Re-read ownership on submission: a saved choice may have been removed
    // after the modal opened. Never trust its label or a client-supplied owner.
    const state = yield* readPersonalArmies(interaction.actorId)
    const hashes = yield* Effect.forEach(state.items, item => digestCode(item.shareCode))
    const item = state.items.find((_, index) => hashes[index] === values[0])
    if (!item) return yield* new InvalidRequest({message:"This army is no longer in your saved library"})
    const prepared = yield* prepareBotArmy(item.shareCode, bindings)
    return yield* reply({items:[],saved:false,shareCode:item.shareCode,armyLink:item.armyLink,presentation:prepared.presentation,
      ...(item.name ? {name:item.name} : {}), ...(item.notes ? {notes:item.notes} : {})})
  }
  if (interaction.type === 3) {
    const save = /^ck:army:save:([a-f0-9]{64})$/u.exec(interaction.data.custom_id ?? "")
    if (save) {
      if (interaction.messageAuthorId !== bindings.DISCORD_APPLICATION_ID || interaction.data.component_type !== 2) {
        return yield* new InvalidRequest({ message: "Save Army requires this bot's original message" })
      }
      const components = interaction.messageSnapshot?.components ?? []
      const buttons = components.flatMap(row => typeof row === "object" && row !== null && Array.isArray((row as { components?: unknown }).components)
        ? (row as { components: unknown[] }).components : [])
      if (!buttons.some(button => typeof button === "object" && button !== null && (button as { custom_id?: unknown }).custom_id === interaction.data.custom_id)) {
        return yield* new InvalidRequest({ message: "The original Save Army button is missing" })
      }
      const urls = buttons
        .filter((component): component is { type: number; style: number; url: string } => typeof component === "object" && component !== null
          && (component as { type?: unknown }).type === 2 && (component as { style?: unknown }).style === 5 && typeof (component as { url?: unknown }).url === "string")
      const codes = urls.flatMap(component => { try { return [normalizeArmyLink(component.url)] } catch { return [] } })
      if (codes.length !== 1) return yield* new InvalidRequest({ message: "The original Copy Army link is missing" })
      const prepared = yield* prepareBotArmy(codes[0]!, bindings)
      const digest = yield* Effect.promise(async () => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(prepared.shareCode)))].map(n => n.toString(16).padStart(2, "0")).join(""))
      if (digest !== save[1]) return yield* new InvalidRequest({ message: "The Save Army button does not match its army" })
      const original = interaction.messageSnapshot?.embeds?.[0] as {title?: unknown;fields?: Array<{name?:unknown;value?:unknown}>} | undefined
      const metadata = yield* Effect.try({try:() => ({name:displayText(original?.title,100,"name") ?? null,
        notes:displayText(original?.fields?.find(field => field.name === "Notes")?.value,450,"notes") ?? null}),
        catch: error => error instanceof InvalidRequest ? error : new InvalidRequest({message:"Invalid army display metadata"})})
      const state = yield* savePreparedBotArmy(interaction.actorId, prepared, metadata)
      return yield* reply({ ...state, saved: true, shareCode: prepared.shareCode, presentation: prepared.presentation,
        armyLink: `https://link.clashofclans.com/en?action=CopyArmy&army=${encodeURIComponent(prepared.shareCode)}` })
    }
    if (interaction.data.custom_id !== `ck:army:pick:${interaction.actorId}` || interaction.data.values?.length !== 1) {
      return yield* new InvalidRequest({ message: "This army selection belongs to another user" })
    }
    const state = yield* readPersonalArmies(interaction.actorId)
    const selected = interaction.data.values[0]
    const hashes = yield* Effect.promise(() => Promise.all(state.items.map(async item => {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(item.shareCode))
      return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2,"0")).join("")
    })))
    const item = state.items.find((_, index) => hashes[index] === selected)
    if (!item) return yield* new InvalidRequest({ message: "This army is no longer in your saved library" })
    const prepared = yield* prepareBotArmy(item.shareCode, bindings)
    return yield* reply({ ...state, shareCode: item.shareCode, armyLink: item.armyLink, saved: false, presentation: prepared.presentation,
      ...(item.name ? {name:item.name} : {}), ...(item.notes ? {notes:item.notes} : {}) })
  }
  if (interaction.type !== 2 || interaction.data.name !== "army") return yield* new InvalidRequest({ message: "An army command is required" })
  const options = yield* Schema.decodeUnknownEffect(Options)(interaction.data.options ?? []).pipe(
    Effect.mapError(() => new InvalidRequest({ message: "Invalid army command options" })),
  )
  const command = options[0]
  const fields = command?.options ?? []
  if (options.length !== 1 || command?.type !== 1 || !["link", "share"].includes(command.name)
    || new Set(fields.map(field => field.name)).size !== fields.length) return yield* new InvalidRequest({ message: "Invalid army command" })
  if (command.name === "share") {
    if (fields.length) return yield* new InvalidRequest({message:"Share does not accept options"})
    const state = yield* readPersonalArmies(interaction.actorId)
    if (state.items.length === 0) return yield* reply({items:[],saved:false})
    if (state.items.length > 25) return yield* new InvalidRequest({message:"Your library has more than 25 armies. Remove extras in the app before sharing."})
    const choices = yield* Effect.forEach(state.items, item => Effect.gen(function* () {
      const prepared = yield* prepareBotArmy(item.shareCode, bindings)
      return {label:item.name ?? "Unnamed army",value:yield* digestCode(item.shareCode),
        description:`Saved ${item.savedAt.slice(0,10)}`,townhall:prepared.presentation.minimumTownHall}
    }), {concurrency:4})
    return yield* reply({items:[],saved:false,picker:{options:choices}})
  }
  if (fields.some(field => !["army","nickname","notes"].includes(field.name) || field.type !== 3 || typeof field.value !== "string")) return yield* new InvalidRequest({message:"Invalid army link options"})
  const raw = fields.find(field => field.name === "army")?.value
  if (typeof raw !== "string" || !raw.trim()) return yield* new InvalidRequest({message:"An army link is required"})
  const shareCode = yield* Effect.try({
    try: () => normalizeArmyLink(raw), catch: () => new InvalidRequest({ message: "Provide a valid Clash army link or share code" }),
  })
  const metadata = yield* Effect.try({try:() => ({name:displayText(fields.find(field => field.name === "nickname")?.value,100,"name"),
    notes:displayText(fields.find(field => field.name === "notes")?.value,450,"notes")}),
    catch:error => error instanceof InvalidRequest ? error : new InvalidRequest({message:"Invalid army display metadata"})})
  // The slash-command schema is only UX. Enforce a real name at the signed API
  // boundary too, so old registrations and whitespace cannot create unnamed saves.
  if (!metadata.name) return yield* new InvalidRequest({message:"An army nickname is required"})
  const prepared = yield* prepareBotArmy(shareCode, bindings)
  return yield* reply({items:[],saved:false,shareCode,armyLink:`https://link.clashofclans.com/en?action=CopyArmy&army=${encodeURIComponent(shareCode)}`,
    presentation:prepared.presentation,...(metadata.name ? {name:metadata.name} : {}),...(metadata.notes ? {notes:metadata.notes} : {})})
})
