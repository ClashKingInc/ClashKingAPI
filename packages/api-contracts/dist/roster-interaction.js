/** @internal Deferred bot orchestration reference; never include in active API endpoint maps. */
import { Schema } from "effect";
import { defineEndpoint, NoQuery } from "./endpoint.js";
import { ErrorResponse } from "./errors.js";
import { DecimalSnowflake } from "./discord.js";
import { RuntimeInteractionProof, RuntimeUUID, TicketAccountSelectForm, TicketStringSelectForm, TicketModalForm, TicketContinueForm } from "./persistent-runtime.js";
export const RosterRuntimeState = Schema.Literals(["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]);
export const RosterRuntimeAction = Schema.Literals(["signup", "remove", "sub", "refresh", "publish"]);
export const RosterRuntimeForm = Schema.Union([TicketAccountSelectForm, TicketStringSelectForm, TicketModalForm, TicketContinueForm]);
const CustomId = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100));
const Response = Schema.Union([
    Schema.Struct({ outcome: Schema.Literal("ready"), operationId: RuntimeUUID, rosterId: RuntimeUUID,
        action: RosterRuntimeAction, expiresAt: Schema.String, form: RosterRuntimeForm }),
    Schema.Struct({ outcome: Schema.Literals(["accepted", "complete"]), operationId: RuntimeUUID, rosterId: RuntimeUUID,
        action: RosterRuntimeAction, state: RosterRuntimeState, statusCustomId: CustomId }),
]);
const Status = Schema.Struct({ operationId: RuntimeUUID, rosterId: RuntimeUUID, action: RosterRuntimeAction,
    state: RosterRuntimeState, channelId: Schema.optionalKey(DecimalSnowflake), messageId: Schema.optionalKey(DecimalSnowflake),
    failure: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(2000))) });
const errors = [400, 401, 403, 404, 409, 413, 415, 429, 503].map(status => ({ status, body: ErrorResponse }));
const base = { auth: "bot", body: RuntimeInteractionProof, bodyMode: "json", method: "POST", query: NoQuery,
    responseMode: "json", successStatus: 200, errors };
const OperationPath = Schema.Struct({ operationId: RuntimeUUID });
export const RosterActionEndpoint = defineEndpoint({ ...base, operationId: "rosterAction", path: "/v2/runtime/rosters/actions",
    pathParams: Schema.Struct({}), response: Response, summary: "Prepare an independently signed canonical roster action" });
export const RosterOperationAdvanceEndpoint = defineEndpoint({ ...base, operationId: "rosterOperationAdvance",
    path: "/v2/runtime/roster-operations/:operationId/advance", pathParams: OperationPath, response: Response,
    summary: "Advance an actor-scoped versioned roster form or confirm its submission" });
export const RosterOperationStatusEndpoint = defineEndpoint({ ...base, operationId: "rosterOperationStatus",
    path: "/v2/runtime/roster-operations/:operationId/status", pathParams: OperationPath, response: Status,
    summary: "Read or wake a signed actor-scoped roster operation" });
export const RosterPublicationPrepareEndpoint = defineEndpoint({ ...base, operationId: "rosterPublicationPrepare",
    path: "/v2/runtime/roster-publications/prepare", pathParams: Schema.Struct({}), response: Response,
    summary: "Prepare a canonical roster publication from a signed Discord command" });
export const RosterPublicationStatusEndpoint = defineEndpoint({ ...base, operationId: "rosterPublicationStatus",
    path: "/v2/runtime/roster-publications/:operationId/status", pathParams: OperationPath, response: Status,
    summary: "Read or wake an actor-scoped roster publication" });
export const rosterInteractionEndpoints = {
    rosterAction: RosterActionEndpoint, rosterOperationAdvance: RosterOperationAdvanceEndpoint,
    rosterOperationStatus: RosterOperationStatusEndpoint, rosterPublicationPrepare: RosterPublicationPrepareEndpoint,
    rosterPublicationStatus: RosterPublicationStatusEndpoint,
};
