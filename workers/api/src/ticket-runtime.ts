import { RuntimeUUID, TicketOperationAdvanceEndpoint, TicketOpenPrepareEndpoint, TicketOperationStatusEndpoint,
  TicketButtonSettings, DiscordEmbed } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { WorkerBindings } from "./environment.js"
import { Conflict, DatabaseFailure, Forbidden, InvalidRequest, NotFound, type ApiFailure } from "./errors.js"
import { requireFreshInteraction, type VerifiedRuntimeInteraction } from "./runtime-interaction.js"
import { loadTicketPanelSource } from "./ticket-panel-source.js"
import { prepareTicketLink, replayTicketLinkPreparation } from "./ticket-link-preparation.js"
import { ticketChannelName } from "./ticket-channel-name.js"
import { ticketOpeningEmbedPages, ticketWelcomeEmbeds, type TicketEmbed } from "./ticket-opening-message.js"

type Ready = Extract<typeof TicketOpenPrepareEndpoint.response.Type, { readonly outcome: "ready" }>
type Accepted = Extract<typeof TicketOperationAdvanceEndpoint.response.Type, { readonly outcome: "accepted" | "complete" }>
type Status = typeof TicketOperationStatusEndpoint.response.Type
type FormField = Extract<Ready["form"], { readonly kind: "modal" }>["fields"][number]

interface OperationRow {
  readonly id: string
  readonly interaction_id: string
  readonly action: "open" | "set_status" | "assign" | "approve"
  readonly ticket_id: string
  readonly ticket_number: number | null
  readonly server_id: string
  readonly actor_user_id: string
  readonly panel_id: string
  readonly button_id: string | null
  readonly origin_channel_id: string
  readonly origin_message_id: string
  readonly context: unknown
  readonly request_hash: string
  readonly progress: unknown
  readonly progress_receipts: unknown
  readonly state: "preparing" | "submitted" | "provisioning" | "reconciling" | "completed" | "failed"
  readonly result: unknown
  readonly expires_at: string
  readonly submission_interaction_id: string | null
  readonly submitted_request_hash: string | null
}
interface AccountRow {
  readonly tag: string
  readonly name: string | null
  readonly townhall_level: number | null
  readonly heroes: unknown
  readonly achievements: unknown
}
interface RuntimeContext {
  readonly panelName: string
  readonly actorLabel: string
  readonly settings: typeof TicketButtonSettings.Type
  readonly questions: ReadonlyArray<string>
  readonly pages: ReadonlyArray<ReadonlyArray<FormField>>
  readonly eligibleAccounts: ReadonlyArray<{ readonly tag: string; readonly label: string }>
  readonly welcomeEmbeds: ReadonlyArray<TicketEmbed>
  readonly openCategoryId?: string
}
interface Progress {
  readonly page: number
  readonly stage: "account" | "modal" | "continue"
  readonly answers: Readonly<Record<string, string>>
  readonly accounts: ReadonlyArray<string>
}

const jsonObject = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength
const uuid = (value: string) => Schema.decodeUnknownEffect(RuntimeUUID)(value).pipe(
  Effect.mapError(() => new InvalidRequest({ message: "Invalid ticket operation ID" })),
)
const stored = <A>(schema: Schema.Codec<A, unknown, never, never>, value: unknown, message: string) =>
  Schema.decodeUnknownEffect(schema)(value).pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message })))
const heroNames: Readonly<Record<string, string>> = {
  BK: "Barbarian King", AQ: "Archer Queen", GW: "Grand Warden", RC: "Royal Champion",
}
const accountEligible = (account: AccountRow, settings: typeof TicketButtonSettings.Type): boolean => {
  if (account.townhall_level === null || account.townhall_level < settings.th_min) return false
  const requirements = settings.townhall_requirements[String(account.townhall_level)]
  if (requirements === undefined) return true
  const heroes = Array.isArray(account.heroes) ? account.heroes : []
  const achievements = Array.isArray(account.achievements) ? account.achievements : []
  for (const [key, required] of Object.entries(requirements)) {
    if (!Number.isFinite(required) || required < 0) return false
    if (key === "WARST") {
      const warHero = achievements.find((item) => jsonObject(item)?.name === "War Hero")
      if (typeof jsonObject(warHero)?.value !== "number" || Number(jsonObject(warHero)?.value) < required) return false
      continue
    }
    const name = heroNames[key]
    if (name === undefined) return false
    const hero = heroes.find((item) => jsonObject(item)?.name === name && jsonObject(item)?.village === "home")
    if (typeof jsonObject(hero)?.level !== "number" || Number(jsonObject(hero)?.level) < required) return false
  }
  return true
}

const formPages = (questions: readonly string[]) => {
  const fields: Array<FormField> = []
  for (const [index, question] of questions.entries()) fields.push({
    customId: `q:${index}`, label: question.slice(0, 45), required: true,
    style: "paragraph", maxLength: 500,
  })
  return Array.from({ length: Math.ceil(fields.length / 5) }, (_, index) => fields.slice(index * 5, index * 5 + 5))
}

const decodeContext = (row: OperationRow) => stored(Schema.Struct({
  panelName: Schema.String, actorLabel: Schema.String, settings: TicketButtonSettings,
  questions: Schema.Array(Schema.String), pages: Schema.Array(Schema.Array(Schema.Struct({
    customId: Schema.String, label: Schema.String, required: Schema.Boolean,
    style: Schema.Literals(["short", "paragraph"]), maxLength: Schema.Number,
  }))), eligibleAccounts: Schema.Array(Schema.Struct({ tag:Schema.String,label:Schema.String })),
  welcomeEmbeds: Schema.Array(DiscordEmbed),
  openCategoryId: Schema.optionalKey(Schema.String),
}), row.context, "Stored ticket operation context is invalid") as Effect.Effect<RuntimeContext, DatabaseFailure>
const decodeProgress = (row: OperationRow) => stored(Schema.Struct({
  page: Schema.Number, stage:Schema.Literals(["account","modal","continue"]),
  answers: Schema.Record(Schema.String, Schema.String), accounts: Schema.Array(Schema.String),
}), row.progress, "Stored ticket operation progress is invalid") as Effect.Effect<Progress, DatabaseFailure>

const ready = (row: OperationRow, context: RuntimeContext, progress: Progress): Ready => ({
  outcome: "ready", operationId: row.id, ticketId: row.ticket_id, action:row.action === "approve" ? "approve" : "open",
  expiresAt: new Date(row.expires_at).toISOString(),
  form: progress.stage === "account" ? {
    kind:"account_select",customId:`ck:ticket:accounts:${row.id}`,content:"Select the account(s) to include in this ticket.",
    placeholder:"Select account(s)",minValues:1,maxValues:Math.max(1,Math.min(25,context.settings.num_apply,context.eligibleAccounts.length)),
    options:context.eligibleAccounts.map((account) => ({ value:account.tag,label:account.label })),
  } : progress.stage === "continue" ? {
    kind:"continue",customId:`ck:ticket:continue:${row.id}:${progress.page}`,
    content:"Continue to the next questionnaire page.",label:"Continue",
  } : { kind:"modal",customId:`ck:ticket:answers:${row.id}:${progress.page}`,
    title:`${context.panelName} application`.slice(0,45),fields:context.pages[progress.page] ?? [] },
})
const accepted = (row: OperationRow): Accepted => ({
  outcome: row.state === "completed" ? "complete" : "accepted", operationId: row.id,
  ticketId: row.ticket_id, state: row.state,
})
const assertOperationIdentity = (row: OperationRow, interaction: VerifiedRuntimeInteraction) =>
  row.interaction_id === interaction.id && row.server_id === interaction.guildId && row.actor_user_id === interaction.actorId
    && row.origin_channel_id === interaction.channelId && row.origin_message_id === interaction.messageId
    && row.request_hash === interaction.requestHash
    ? Effect.void
    : Effect.fail(new Conflict({ message: "Ticket interaction identity has already been used" }))

const operationResponse = (row: OperationRow) => Effect.gen(function* () {
  if (row.state !== "preparing") return accepted(row)
  const context = yield* decodeContext(row), progress = yield* decodeProgress(row)
  return ready(row, context, progress)
})

const findValues = (value: unknown): Map<string, { readonly value?: string; readonly values?: readonly string[] }> => {
  const found = new Map<string, { readonly value?: string; readonly values?: readonly string[] }>()
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) { for (const child of item) visit(child); return }
    const object = jsonObject(item)
    if (object === undefined) return
    if (typeof object.custom_id === "string") {
      if (found.has(object.custom_id)) throw new InvalidRequest({ message: "Ticket form contains duplicate fields" })
      const value = typeof object.value === "string" ? object.value : undefined
      const values = Array.isArray(object.values) && object.values.every((entry) => typeof entry === "string")
        ? object.values as string[] : undefined
      found.set(object.custom_id, { ...(value === undefined ? {} : { value }), ...(values === undefined ? {} : { values }) })
    }
    for (const child of Object.values(object)) if (typeof child === "object" && child !== null) visit(child)
  }
  visit(value)
  return found
}

const enqueueOpenEffects = (row: OperationRow, context: RuntimeContext, progress: Progress, number: number) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const firstAccount = progress.accounts[0] ? (yield* sql<{name:string;townhall_level:number}>`SELECT name,townhall_level FROM basic_player WHERE tag=${progress.accounts[0]}`)[0] : undefined
  const name = ticketChannelName(context.settings.naming,{number,user:context.actorLabel,accountName:firstAccount?.name ?? "",
    accountTownhall:firstAccount?.townhall_level ?? null,status:"open"})
  const effects: Array<{ readonly key: string; readonly type: string; readonly request: unknown }> = [{
    key: "channel", type: "create_channel", request: { serverId:row.server_id,ticketId:row.ticket_id,name,
      parentId:context.openCategoryId,originChannelId:row.origin_channel_id,applicantUserId:row.actor_user_id,
      moderatorRoleIds:[...new Set([...context.settings.mod_role,...context.settings.no_ping_mod_role])] },
  }]
  const answers=context.questions.map((_,index)=>progress.answers[`q:${index}`] ?? "")
  const channelPages=yield* Effect.try({try:()=>ticketOpeningEmbedPages(context.welcomeEmbeds,context.questions,answers,progress.accounts),
    catch:()=>new Conflict({message:"Ticket application exceeds Discord message limits"})})
  for (const [page,embeds] of channelPages.entries()) effects.push({
    key:`application:${page}`,type:"send_message",request:{ target:"channel",nonce:`t:${number}:a:${page}`,
      applicantUserId:row.actor_user_id,pingRoleIds:page === 0 ? context.settings.mod_role : [],
      embeds,accounts:page === 0 ? progress.accounts : [] },
  })
  effects.push({ key:"pin-application",type:"pin_message",request:{ target:"channel",messageEffectKey:"application:0" } })
  if (context.settings.private_thread) {
    effects.push({ key:"thread",type:"create_thread",request:{ channelEffectKey:"channel",name:`Private | ${name.replaceAll("-"," ")}` } })
    // This is the internal staff thread, not an applicant conversation. The
    // legacy opener never invited the applicant into it.
    const threadPages=yield* Effect.try({try:()=>ticketOpeningEmbedPages(context.welcomeEmbeds.slice(1),context.questions,answers,progress.accounts),
      catch:()=>new Conflict({message:"Private ticket application exceeds Discord message limits"})})
    for (const [page,embeds] of threadPages.entries()) effects.push({
      key:`thread-application:${page}`,type:"send_message",request:{target:"thread",nonce:`t:${number}:s:${page}`,
        pingRoleIds:page === 0 ? [...new Set([...context.settings.mod_role,...context.settings.no_ping_mod_role])] : [],
        embeds,accounts:page === 0 ? progress.accounts : []},
    })
    effects.push({key:"pin-thread-application",type:"pin_message",request:{target:"thread",messageEffectKey:"thread-application:0"}})
  }
  for (const roleId of context.settings.roles_to_add) effects.push({ key:`add-role:${roleId}`,type:"add_role",request:{ roleId,userId:row.actor_user_id } })
  for (const roleId of context.settings.roles_to_remove) effects.push({ key:`remove-role:${roleId}`,type:"remove_role",request:{ roleId,userId:row.actor_user_id } })
  for (const [ordinal,effect] of effects.entries()) yield* sql`INSERT INTO ticket_runtime_effects(operation_id,effect_key,ordinal,effect_type,request)
    VALUES(${row.id}::uuid,${effect.key},${ordinal},${effect.type},${JSON.stringify(effect.request)}::jsonb)`
})

const finalizeOpen = (row: OperationRow, interaction: VerifiedRuntimeInteraction, context: RuntimeContext,
  progress: Progress, submittedRequest: unknown,
) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  if (bytes(progress)>30_000) return yield* new Conflict({message:"Ticket answers exceed the durable snapshot limit"})
  if (context.settings.account_apply) {
    if (!progress.accounts.length) return yield* new Conflict({message:"Ticket application requires a selected account"})
    // Match every canonical account writer: tag mutexes, subject mutex, then
    // link rows. A form's earlier account list is not current ownership proof.
    for (const tag of [...new Set(progress.accounts)].sort()) {
      yield* sql`INSERT INTO player_link_mutation_locks(tag) VALUES(${tag}) ON CONFLICT(tag) DO NOTHING`
      yield* sql`SELECT tag FROM player_link_mutation_locks WHERE tag=${tag} FOR UPDATE`
    }
    yield* sql`INSERT INTO subject_mutation_locks(subject_id) VALUES(${row.actor_user_id}) ON CONFLICT(subject_id) DO NOTHING`
    yield* sql`SELECT subject_id FROM subject_mutation_locks WHERE subject_id=${row.actor_user_id} FOR UPDATE`
    const current=yield* sql<AccountRow>`SELECT links.tag,player.name,player.townhall_level,details.heroes,details.achievements
      FROM player_links links LEFT JOIN basic_player player ON player.tag=links.tag
      LEFT JOIN player_profile_details details ON details.player_tag=links.tag
      WHERE links.user_id=${row.actor_user_id} AND links.hidden=false AND links.tag=ANY(${progress.accounts}::text[])
      FOR SHARE OF links`
    if (current.length !== progress.accounts.length || current.some(account=>!accountEligible(account,context.settings))) {
      return yield* new Forbidden({message:"A selected account is no longer linked or eligible for this ticket",reason:"linked_account"})
    }
  }
  const number = (yield* sql<{ number: number }>`SELECT nextval('tickets_number_seq')::integer AS number`)[0]?.number
  if (number === undefined) return yield* new DatabaseFailure({ cause: undefined, message: "Ticket number allocation failed" })
  yield* sql`UPDATE ticket_runtime_operations SET ticket_number=${number},submission_interaction_id=${interaction.id},
    submitted_request=${JSON.stringify(submittedRequest)}::jsonb,submitted_request_hash=${interaction.requestHash},
    progress=${JSON.stringify(progress)}::jsonb,state='submitted',updated_at=clock_timestamp() WHERE id=${row.id}::uuid`
  const submitted = { ...row, ticket_number:number,submission_interaction_id:interaction.id,
    submitted_request_hash:interaction.requestHash,progress,state:"submitted" as const }
  yield* enqueueOpenEffects(submitted,context,progress,number)
  return submitted
})

const prepareTicketOpenTransaction = (interaction: VerifiedRuntimeInteraction) => Effect.gen(function* () {
  if (interaction.type !== 3 || interaction.data.component_type !== 2 || interaction.messageId === undefined ||
    interaction.data.custom_id === undefined) {
    return yield* new Forbidden({ message: "A canonical ticket panel button is required", reason: "wrong_message" })
  }
  const match = /^ck:ticket:open:([0-9a-f-]{36}):([0-9a-f-]{36})$/iu.exec(interaction.data.custom_id)
  if (!match) return yield* new Forbidden({ message: "A canonical ticket panel button is required", reason: "wrong_message" })
  const panelId = yield* uuid(match[1]!), buttonId = yield* uuid(match[2]!)
  const sql = yield* SqlClient.SqlClient
  // Serialize opening preparation on its canonical panel row, also preventing
  // configuration changes during the snapshot. All work here is SQL-only.
  yield* sql`SELECT id FROM ticket_panels WHERE id=${panelId}::uuid AND server_id=${interaction.guildId} FOR UPDATE`
  const replay = (yield* sql<OperationRow>`SELECT id::text,interaction_id,action,ticket_id::text,ticket_number,server_id,actor_user_id,
    panel_id::text,button_id::text,origin_channel_id,origin_message_id,context,request_hash,progress,progress_receipts,state,result,
    expires_at::text,submission_interaction_id,submitted_request_hash FROM ticket_runtime_operations WHERE interaction_id=${interaction.id}`)[0]
  if (replay) { yield* assertOperationIdentity(replay,interaction); return yield* operationResponse(replay) }
  const linkReplay = yield* replayTicketLinkPreparation(interaction,panelId,buttonId)
  if (linkReplay !== undefined) return linkReplay
  yield* requireFreshInteraction(interaction)
  const panel = yield* loadTicketPanelSource({ guildId: interaction.guildId, channelId: interaction.channelId,
    messageId: interaction.messageId, panelId, buttonId })
  const data = jsonObject(panel.data)
  const settings = panel.settings
  if ([...settings.mod_role,...settings.no_ping_mod_role].includes(interaction.guildId)) {
    return yield* new Conflict({message:"The everyone role cannot be configured as ticket staff"})
  }
  const questions = settings.questions.map((question) => question.trim()).filter((question) => question !== "")
  if (questions.length > 100) return yield* new Conflict({ message: "Ticket questionnaire exceeds 100 supported questions" })
  const accounts = settings.account_apply ? yield* sql<AccountRow>`SELECT links.tag,player.name,player.townhall_level,
    details.heroes,details.achievements FROM player_links links LEFT JOIN basic_player player ON player.tag=links.tag
    LEFT JOIN player_profile_details details ON details.player_tag=links.tag
    WHERE links.user_id=${interaction.actorId} AND links.hidden=false ORDER BY links.order_index,links.added_at` : []
  const eligible = accounts.filter((account) => accountEligible(account,settings)).slice(0,25)
  if (settings.account_apply && accounts.length === 0) return yield* prepareTicketLink(interaction,panel)
  if (settings.account_apply && eligible.length === 0) return yield* new Forbidden({ message: "No linked account meets this ticket's requirements", reason:"linked_account" })
  const operationId = crypto.randomUUID(), ticketId = crypto.randomUUID(), pages = formPages(questions)
  const pingLength = settings.mod_role.map((roleId) => `<@&${roleId}>`).join(" ").length + interaction.actorId.length + 4
  const staffPingLength = settings.private_thread ? [...new Set([...settings.mod_role,...settings.no_ping_mod_role])].map(roleId=>`<@&${roleId}>`).join(" ").length : 0
  if (pingLength > 2000 || staffPingLength > 2000) return yield* new Conflict({ message:"Ticket configuration exceeds Discord message limits" })
  const configuredWelcome=settings.new_message ? (yield* sql<{data:unknown}>`SELECT data FROM server_custom_embeds
    WHERE server_id=${interaction.guildId} AND name=${settings.new_message}`)[0] : undefined
  if (settings.new_message && !configuredWelcome) return yield* new Conflict({message:"Configured ticket welcome embed no longer exists"})
  const welcomeEmbeds=yield* Effect.try({try:()=>ticketWelcomeEmbeds(configuredWelcome?.data),
    catch:()=>new Conflict({message:"Configured ticket welcome embeds cannot be published"})})
  const context: RuntimeContext = { panelName:panel.name,actorLabel:interaction.actorLabel,settings,questions,pages,welcomeEmbeds,
    eligibleAccounts:eligible.map((account) => ({ tag:account.tag,label:(account.name ?? account.tag).slice(0,100) })),
    ...(typeof data?.["open-category"] === "string" ? { openCategoryId:data["open-category"] } : {}) }
  if (bytes(context) > 60_000) return yield* new Conflict({ message: "Ticket configuration exceeds the runtime snapshot limit" })
  const worstProgress: Progress = { page:pages.length,stage:"modal",
    answers:Object.fromEntries(questions.map((_,index) => [`q:${index}`,"x".repeat(500)])),
    accounts:eligible.map((account) => account.tag) }
  if (bytes(worstProgress) > 30_000) return yield* new Conflict({ message:"Ticket questionnaire exceeds the durable answer limit" })
  const progress: Progress = { page:0,stage:settings.account_apply ? "account" : "modal",answers:{},accounts:[] }
  const request = { customId:interaction.data.custom_id,type:interaction.type }
  const inserted = (yield* sql<OperationRow>`INSERT INTO ticket_runtime_operations(id,interaction_id,action,ticket_id,server_id,
    actor_user_id,panel_id,button_id,origin_channel_id,origin_message_id,context,request,request_hash,progress)
    VALUES(${operationId}::uuid,${interaction.id},'open',${ticketId}::uuid,${interaction.guildId},${interaction.actorId},
      ${panelId}::uuid,${buttonId}::uuid,${interaction.channelId},${interaction.messageId},${JSON.stringify(context)}::jsonb,
      ${JSON.stringify(request)}::jsonb,${interaction.requestHash},${JSON.stringify(progress)}::jsonb)
    ON CONFLICT(interaction_id) DO NOTHING RETURNING id::text,interaction_id,action,ticket_id::text,ticket_number,server_id,
      actor_user_id,panel_id::text,button_id::text,origin_channel_id,origin_message_id,context,request_hash,progress,
      progress_receipts,state,result,expires_at::text,submission_interaction_id,submitted_request_hash`)[0]
  if (!inserted) {
    const raced = (yield* sql<OperationRow>`SELECT id::text,interaction_id,action,ticket_id::text,ticket_number,server_id,actor_user_id,
      panel_id::text,button_id::text,origin_channel_id,origin_message_id,context,request_hash,progress,progress_receipts,state,result,
      expires_at::text,submission_interaction_id,submitted_request_hash FROM ticket_runtime_operations WHERE interaction_id=${interaction.id}`)[0]
    if (!raced) return yield* new DatabaseFailure({ cause:undefined,message:"Ticket operation replay disappeared" })
    yield* assertOperationIdentity(raced,interaction)
    return yield* operationResponse(raced)
  }
  if (settings.account_apply || pages.length > 0) return ready(inserted,context,progress)
  const submitted = yield* finalizeOpen(inserted,interaction,context,progress,request)
  return accepted(submitted)
})

export const prepareTicketOpen = (interaction: VerifiedRuntimeInteraction): Effect.Effect<typeof TicketOpenPrepareEndpoint.response.Type, ApiFailure, SqlClient.SqlClient> => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  return yield* sql.withTransaction(prepareTicketOpenTransaction(interaction))
}).pipe(Effect.catchTag("SqlError", (cause) => Effect.fail(new DatabaseFailure({ cause, message:"Ticket opening storage is unavailable" }))))

export const advanceTicketOperation = (operationId: string, interaction: VerifiedRuntimeInteraction): Effect.Effect<Ready | Accepted, ApiFailure, SqlClient.SqlClient> => Effect.gen(function* () {
  yield* uuid(operationId)
  const sql = yield* SqlClient.SqlClient
  return yield* sql.withTransaction(Effect.gen(function* () {
    const row = (yield* sql<OperationRow>`SELECT id::text,interaction_id,action,ticket_id::text,ticket_number,server_id,actor_user_id,
      panel_id::text,button_id::text,origin_channel_id,origin_message_id,context,request_hash,progress,progress_receipts,state,result,
      expires_at::text,submission_interaction_id,submitted_request_hash FROM ticket_runtime_operations WHERE id=${operationId}::uuid FOR UPDATE`)[0]
    if (!row || row.action !== "open") return yield* new NotFound({ message:"Ticket operation not found" })
    // Continuation components and their modals live on ephemeral callback messages,
    // so the durable session ID + actor + guild + channel is authoritative after
    // prepare has bound the original public panel message exactly.
    if (row.server_id !== interaction.guildId || row.actor_user_id !== interaction.actorId ||
      row.origin_channel_id !== interaction.channelId) {
      return yield* new Forbidden({ message:"Ticket submission does not belong to this applicant or panel",reason:"wrong_message" })
    }
    if (row.submission_interaction_id === interaction.id) {
      if (row.submitted_request_hash !== interaction.requestHash) return yield* new Conflict({ message:"Ticket submission identity was reused" })
      return accepted(row)
    }
    const receipts = jsonObject(row.progress_receipts) ?? {}
    const prior = jsonObject(receipts[interaction.id])
    if (prior) {
      if (prior.requestHash !== interaction.requestHash) return yield* new Conflict({ message:"Ticket submission identity was reused" })
      return yield* operationResponse(row)
    }
    if (row.state !== "preparing") return yield* new Conflict({ message:"Ticket operation is no longer accepting form pages" })
    yield* requireFreshInteraction(interaction)
    if (new Date(row.expires_at).getTime() <= Date.now()) return yield* new Conflict({ message:"Ticket application session expired" })
    const context = yield* decodeContext(row), progress = yield* decodeProgress(row)
    const answers: Record<string,string> = { ...progress.answers }
    let accounts = [...progress.accounts]
    let next: Progress
    let final = false
    if (progress.stage === "account") {
      if (interaction.type !== 3 || interaction.data.component_type !== 3 ||
        interaction.data.custom_id !== `ck:ticket:accounts:${row.id}`) {
        return yield* new Forbidden({ message:"Unexpected ticket account selection",reason:"wrong_message" })
      }
      const selected = [...new Set(interaction.data.values ?? [])]
      const maximum = Math.max(1,Math.min(25,context.settings.num_apply,context.eligibleAccounts.length))
      if (selected.length < 1 || selected.length > maximum ||
        selected.some((tag) => !context.eligibleAccounts.some((account) => account.tag === tag))) {
        return yield* new InvalidRequest({ message:"Ticket account selection is invalid" })
      }
      accounts = selected
      final = context.pages.length === 0
      next = { page:0,stage:"modal",answers,accounts }
    } else if (progress.stage === "continue") {
      if (interaction.type !== 3 || interaction.data.component_type !== 2 ||
        interaction.data.custom_id !== `ck:ticket:continue:${row.id}:${progress.page}`) {
        return yield* new Forbidden({ message:"Unexpected ticket questionnaire continuation",reason:"wrong_message" })
      }
      next = { ...progress,stage:"modal" }
    } else {
      if (interaction.type !== 5 || interaction.data.custom_id !== `ck:ticket:answers:${row.id}:${progress.page}`) {
        return yield* new Forbidden({ message:"Unexpected ticket questionnaire page",reason:"wrong_message" })
      }
      const page = context.pages[progress.page]
      if (!page) return yield* new Conflict({ message:"Ticket form page is no longer available" })
      const submitted = yield* Effect.try({ try:() => findValues(interaction.data.components),
        catch:(cause) => cause instanceof InvalidRequest ? cause : new InvalidRequest({ message:"Ticket form is invalid" }) })
      for (const field of page) {
        const answer = submitted.get(field.customId)?.value
        if (answer === undefined || answer.length > field.maxLength || field.required && answer.trim() === "") {
          return yield* new InvalidRequest({ message:`Ticket answer ${field.customId} is invalid` })
        }
        answers[field.customId] = answer
      }
      if ([...submitted.keys()].some((key) => !page.some((field) => field.customId === key))) {
        return yield* new InvalidRequest({ message:"Ticket form contains unexpected fields" })
      }
      const questionPage = progress.page + 1
      final = questionPage >= context.pages.length
      next = { page:questionPage,stage:final ? "modal" : "continue",answers,accounts }
    }
    const nextReceipts = { ...receipts,[interaction.id]:{ requestHash:interaction.requestHash,
      outcome:final ? "accepted" : "ready",page:progress.page,stage:progress.stage } }
    if (bytes(nextReceipts) > 30_000) return yield* new Conflict({ message:"Ticket form replay journal is full" })
    if (!final) {
      yield* sql`UPDATE ticket_runtime_operations SET progress=${JSON.stringify(next)}::jsonb,
        progress_receipts=${JSON.stringify(nextReceipts)}::jsonb,version=version+1,updated_at=clock_timestamp() WHERE id=${row.id}::uuid`
      return ready(row,context,next)
    }
    const completed = yield* finalizeOpen(row,interaction,context,next,{ customId:interaction.data.custom_id,type:interaction.type })
    return accepted(completed)
  }))
}).pipe(Effect.catchTag("SqlError", (cause) => Effect.fail(new DatabaseFailure({ cause,message:"Ticket submission storage is unavailable" }))))

export const ticketOperationStatus = (operationId: string, interaction: VerifiedRuntimeInteraction): Effect.Effect<Status, ApiFailure, SqlClient.SqlClient> => Effect.gen(function* () {
  yield* uuid(operationId)
  if (interaction.type !== 3 || interaction.data.component_type !== 2 || interaction.data.custom_id !== `ck:ticket:status:${operationId}`) {
    return yield* new Forbidden({ message:"A matching ticket status button is required",reason:"wrong_message" })
  }
  const sql = yield* SqlClient.SqlClient
  const row = (yield* sql<Pick<OperationRow,"id"|"ticket_id"|"state"|"result"|"actor_user_id"|"server_id"|"action">>`SELECT id::text,ticket_id::text,state,result,actor_user_id,server_id,action
    FROM ticket_runtime_operations WHERE id=${operationId}::uuid`)[0]
  if (!row) return yield* new NotFound({ message:"Ticket operation not found" })
  if (row.actor_user_id !== interaction.actorId || row.server_id !== interaction.guildId) {
    return yield* new Forbidden({ message:"Ticket operation does not belong to this applicant",reason:"wrong_message" })
  }
  const result = jsonObject(row.result) ?? {}
  return yield* stored(TicketOperationStatusEndpoint.response,{ operationId:row.id,ticketId:row.ticket_id,state:row.state,action:row.action,
    ...(typeof result.channelId === "string" ? { channelId:result.channelId } : {}),
    ...(typeof result.threadId === "string" ? { threadId:result.threadId } : {}),
    ...(typeof result.failure === "string" ? { failure:result.failure } : {}) },"Stored ticket operation status is invalid")
}).pipe(Effect.catchTag("SqlError", (cause) => Effect.fail(new DatabaseFailure({ cause,message:"Ticket operation status is unavailable" }))))

export const wakeTicketOperation = (bindings: WorkerBindings, operationId: string, serverId: string, ticketId: string) =>
  Effect.tryPromise({ try:() => bindings.TICKET_RUNTIME.getByName(`${serverId}:${ticketId}`).wake(operationId),
    catch:(cause) => new DatabaseFailure({ cause,message:"Ticket runtime coordinator is unavailable" }) })
