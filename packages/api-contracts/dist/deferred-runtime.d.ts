/**
 * @internal Reference-only schemas for deferred Discord bot/configuration work.
 *
 * These descriptors do not describe supported API routes. They remain available
 * solely to type-check preserved source/tests while a separate bot plan replaces
 * the former API-owned orchestration design. Do not add them to active endpoint
 * maps, consumer clients, generated OpenAPI, or deployment readiness checks.
 */
export * from "./persistent-runtime.js";
export * from "./roster-interaction.js";
export * from "./deferred-roster-board.js";
export { DashboardRosterMemberGroupsEndpoint, DashboardCreateRosterMemberGroupEndpoint, DashboardUpdateRosterMemberGroupEndpoint, DashboardDeleteRosterMemberGroupEndpoint, DashboardReplaceRosterMemberGroupsEndpoint, RosterMemberGroup, RosterMemberGroupSettingsRequest, rosterConfigurationEndpoints, } from "./roster-configuration.js";
import { Schema } from "effect";
/** @internal Deferred ticket notification orchestration, not an active API route. */
export declare const TicketMessageEventEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly id: Schema.String;
    readonly guild_id: Schema.String;
    readonly channel_id: Schema.String;
    readonly author_id: Schema.String;
    readonly application_id: Schema.String;
}>, Schema.Union<readonly [Schema.Struct<{
    readonly outcome: Schema.Literal<"ignored">;
}>, Schema.Struct<{
    readonly outcome: Schema.Literal<"accepted">;
    readonly operationId: Schema.String;
}>]>, {
    status: number;
    body: Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>;
}[]>;
//# sourceMappingURL=deferred-runtime.d.ts.map