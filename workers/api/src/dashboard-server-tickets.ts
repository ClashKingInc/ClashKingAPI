import { DecimalSnowflake, TicketButton, TicketButtonSettings, dashboardEndpoints } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { DashboardServerOperationInput } from "./dashboard-server-runtime.js"
import { lockServerDiscordResources } from "./discord-managed-resources.js"
import { Conflict, DatabaseFailure, InvalidRequest, NotFound, type ApiFailure } from "./errors.js"

export const dashboardTicketOperationIds = ["ticketPanels", "createTicketPanel", "deleteTicketPanel", "createTicketButton", "deleteTicketButton", "updateTicketButtonAppearance", "updateTicketPanel", "updateTicketButtonSettings", "updateTicketApproveMessages"] as const
const JsonObject = Schema.JsonObject
type Button = Schema.Schema.Type<typeof TicketButton>
const StoredTicketButton = Schema.Struct({ id: Schema.String, ...TicketButton.fields })
type StoredButton = Schema.Schema.Type<typeof StoredTicketButton>
interface PanelRow { readonly name: string; readonly server_id: string; readonly components: unknown; readonly data: unknown }
const text = (value: unknown): string => typeof value === "string" ? value : ""
const optional = (key: string, value: unknown) => value === undefined || value === null ? {} : { [key]: value }
const stored = <A>(schema: Schema.Codec<A, unknown, never, never>, value: unknown) => Schema.decodeUnknownEffect(schema)(value).pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Stored ticket configuration failed schema validation" })))
const requestBody = <A>(schema: Schema.Codec<A, unknown, never, never>, value: unknown) => Schema.decodeUnknownEffect(schema)(value).pipe(Effect.mapError(() => new InvalidRequest({ message: "Ticket request failed schema validation" })))
const categoryFields = { open_category: "open-category", sleep_category: "sleep-category", closed_category: "closed-category", status_change_log: "status_change_log", ticket_button_click_log: "ticket_button_click_log", ticket_close_log: "ticket_close_log" } as const
const emptySettings = { questions: [], mod_role: [], no_ping_mod_role: [], private_thread: false, th_min: 0, num_apply: 25, naming: "", account_apply: false, player_info: false, apply_clans: [], roles_to_add: [], roles_to_remove: [], townhall_requirements: {} } as const
const listSettingFields = ["questions", "mod_role", "no_ping_mod_role", "apply_clans", "roles_to_add", "roles_to_remove"] as const
const normalizedPanelColumns = `panel.server_id,panel.name,COALESCE((
  SELECT jsonb_agg(CASE
    WHEN component.value->'emoji' = 'null'::jsonb THEN component.value - 'emoji'::text
    WHEN jsonb_typeof(component.value->'emoji') = 'object' THEN jsonb_set(component.value,'{emoji}',CASE
      WHEN component.value->'emoji'->'id' = 'null'::jsonb THEN (component.value->'emoji') - 'id'::text
      WHEN jsonb_typeof(component.value->'emoji'->'id') = 'number' THEN jsonb_set(component.value->'emoji','{id}',to_jsonb(component.value->'emoji'->>'id'))
      ELSE component.value->'emoji' END)
    ELSE component.value END ORDER BY component.ordinality)
  FROM jsonb_array_elements(panel.components) WITH ORDINALITY component(value,ordinality)
),'[]'::jsonb) AS components,COALESCE((
  SELECT jsonb_object_agg(entry.key,CASE
    WHEN entry.key IN ('open-category','sleep-category','closed-category','status_change_log','ticket_button_click_log','ticket_close_log')
      AND jsonb_typeof(entry.value) = 'number' THEN to_jsonb(entry.value #>> '{}')
    ELSE entry.value END)
  FROM jsonb_each(panel.data) entry
),'{}'::jsonb) AS data`

const normalizeStoredSettings = (saved: Record<string, Schema.Json>) => {
  const normalized: Record<string, unknown> = { ...emptySettings, ...saved }
  for (const field of listSettingFields) {
    const value = saved[field]
    if (value === null) normalized[field] = []
    else if (typeof value === "string") normalized[field] = [value]
  }
  if (saved.townhall_requirements === null) normalized.townhall_requirements = {}
  return normalized
}

// The original Dashboard keeps the first named approval template. This is
// independent of any proposed multi-template bot interaction design.
const approvalMessages = (messages: ReadonlyArray<{ readonly name: string; readonly message: string }>) =>
  messages.filter(message => message.name.trim() !== "").slice(0, 1)

export const nextTicketButtonCustomId = (name: string, components: ReadonlyArray<Button>, timestamp = Date.now()) => {
  const used = new Set(components.map(button => button.custom_id))
  while (used.has(`${name}_${timestamp}`)) timestamp += 1
  return `${name}_${timestamp}`
}

const panelValue = (row: PanelRow) => Effect.gen(function* () {
  const data = yield* stored(JsonObject, row.data)
  const storedComponents = yield* stored(Schema.Array(StoredTicketButton), row.components)
  const components: ReadonlyArray<Button> = storedComponents.map(({ id: _id, ...button }) => button)
  const settings: Record<string, Schema.Schema.Type<typeof TicketButtonSettings>> = {}
  for (const [key, value] of Object.entries(data)) if (key.endsWith("_settings")) {
    const saved = yield* stored(JsonObject, value)
    settings[key.slice(0, -"_settings".length)] = yield* stored(TicketButtonSettings, normalizeStoredSettings(saved))
  }
  const messages = Array.isArray(data.approve_messages) ? data.approve_messages : []
  const decoded = yield* stored(dashboardEndpoints.updateTicketApproveMessages.body, { messages })
  const categories = Object.fromEntries(Object.entries(categoryFields).flatMap(([output, source]) => data[source] === undefined || data[source] === null ? [] : [[output, data[source]]]))
  return { name: row.name, server_id: row.server_id, components, button_settings: settings, ...optional("embed_name", data.embed_name), ...categories,
    approve_messages: approvalMessages(decoded.messages) }
})

export const executeDashboardTickets = (input: DashboardServerOperationInput): Effect.Effect<unknown, ApiFailure, SqlClient.SqlClient> => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient, serverId = text(input.path.serverId), operation = input.endpoint.operationId
  if (operation === "ticketPanels") {
    const rows = yield* sql.unsafe<PanelRow>(`SELECT ${normalizedPanelColumns} FROM ticket_panels panel WHERE panel.server_id=$1 ORDER BY panel.name`, [serverId])
    const embeds = yield* sql<{ name: string }>`SELECT name FROM server_custom_embeds WHERE server_id = ${serverId} AND name <> '' ORDER BY name`
    return { items: yield* Effect.forEach(rows, panelValue), total: rows.length, available_embeds: embeds.map((row) => row.name), townhall_requirement_fields: ["BK", "AQ", "GW", "RC", "WARST"] }
  }
  return yield* sql.withTransaction(Effect.gen(function* () {
    yield* lockServerDiscordResources(serverId)
    if (operation === "createTicketPanel") {
      const body = yield* requestBody(dashboardEndpoints.createTicketPanel.body, input.body), name = body.name.trim()
      if (name === "") return yield* new InvalidRequest({ message: "Panel name cannot be empty" })
      const rows = yield* sql<{ name: string }>`INSERT INTO ticket_panels(server_id,name,components,data) VALUES(${serverId},${name},'[]'::jsonb,'{}'::jsonb) ON CONFLICT(server_id,name) DO NOTHING RETURNING name`
      if (rows.length === 0) return yield* new Conflict({ message: "A panel with this name already exists" })
      return { message: "Panel created successfully" }
    }
    const name = text(input.path.panelName)
    if (operation === "deleteTicketPanel") {
      const rows = yield* sql<{ name: string }>`DELETE FROM ticket_panels WHERE server_id=${serverId} AND name=${name} RETURNING name`
      if (rows.length === 0) return yield* new NotFound({ message: "Panel not found" })
      return { message: "Panel deleted successfully" }
    }
    const rows = yield* sql.unsafe<PanelRow>(`SELECT ${normalizedPanelColumns} FROM ticket_panels panel WHERE panel.server_id=$1 AND panel.name=$2 FOR UPDATE`, [serverId,name])
    const row = rows[0]
    if (row === undefined) return yield* new NotFound({ message: "Panel not found" })
    const parsed = yield* stored(JsonObject, row.data), data: Record<string, Schema.Json> = { ...parsed }
    let components: ReadonlyArray<StoredButton> = yield* stored(Schema.Array(StoredTicketButton), row.components)
    const customId = text(input.path.customId)
    let message: string
    switch (operation) {
      case "createTicketButton": {
        const body = yield* requestBody(dashboardEndpoints.createTicketButton.body, input.body)
        if (components.length >= 5) return yield* new InvalidRequest({ message: "A panel can have at most 5 buttons" })
        components = [...components, { id: crypto.randomUUID(),type:2,custom_id:nextTicketButtonCustomId(row.name, components),style:body.style,label:body.label,...(body.emoji == null ? {} : { emoji:body.emoji }) }]
        message = "Button added successfully"
        break
      }
      case "deleteTicketButton":
        components = components.filter((button) => button.custom_id !== customId)
        delete data[`${customId}_settings`]
        message = "Button deleted successfully"
        break
      case "updateTicketButtonAppearance": {
        const body = yield* requestBody(dashboardEndpoints.updateTicketButtonAppearance.body, input.body)
        components = components.map((button) => button.custom_id !== customId ? button : { id: button.id, custom_id: button.custom_id, type: button.type, style: body.style, label: body.label, ...(body.emoji == null ? {} : { emoji: body.emoji }) })
        message = "Button appearance updated successfully"
        break
      }
      case "updateTicketPanel": {
        const body = yield* requestBody(dashboardEndpoints.updateTicketPanel.body, input.body)
        for (const [field, storedField] of Object.entries(categoryFields)) {
          const value = body[field as keyof typeof categoryFields]
          if (value === undefined) continue
          if (value === null || value === "") delete data[storedField]
          else data[storedField] = yield* requestBody(DecimalSnowflake, value)
        }
        if (body.embed_name !== undefined) {
          if (body.embed_name === null || body.embed_name === "") delete data.embed_name
          else data.embed_name = body.embed_name
        }
        message = "Panel updated successfully"
        break
      }
      case "updateTicketButtonSettings": {
        const body = yield* requestBody(dashboardEndpoints.updateTicketButtonSettings.body, input.body)
        for (const roleId of [...body.mod_role, ...body.no_ping_mod_role, ...body.roles_to_add, ...body.roles_to_remove]) yield* requestBody(DecimalSnowflake, roleId)
        if ([...body.mod_role,...body.no_ping_mod_role].includes(serverId)) return yield* new InvalidRequest({message:"The everyone role cannot be configured as ticket staff"})
        data[`${customId}_settings`] = { ...body, naming: body.naming || "{ticket_count}-{user}", num_apply: body.num_apply || 25 }
        message = "Button settings updated successfully"
        break
      }
      case "updateTicketApproveMessages": {
        const body = yield* requestBody(dashboardEndpoints.updateTicketApproveMessages.body, input.body)
        data.approve_messages = approvalMessages(body.messages)
        message = "Approve messages updated successfully"
        break
      }
      default: return yield* Effect.die(new Error(`Unexpected ticket operation ${operation}`))
    }
    yield* sql`UPDATE ticket_panels SET components = ${JSON.stringify(components)}::jsonb, data = ${JSON.stringify(data)}::jsonb, updated_at = now() WHERE server_id = ${serverId} AND name = ${row.name}`
    return { message }
  }))
}).pipe(Effect.mapError((cause) => cause instanceof Conflict || cause instanceof InvalidRequest || cause instanceof NotFound || cause instanceof DatabaseFailure ? cause : new DatabaseFailure({ cause, message: "Ticket configuration operation failed" })))
