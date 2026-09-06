import { Schema } from "effect";
import { DecimalSnowflake } from "./discord.js";
import { defineEndpoint, NoBody, NoContent, NoQuery } from "./endpoint.js";
import { ErrorResponse } from "./errors.js";
import { RuntimeUUID } from "./persistent-runtime.js";
export const RosterCapacity = Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 2147483647 }));
const Position = Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 2147483647 }));
const GroupName = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(49), Schema.makeFilter(name => name.trim().length ? undefined : "Roster member group name must not be blank"));
export const RosterMemberGroup = Schema.Struct({ id: RuntimeUUID, name: GroupName, position: Position });
export const RosterMemberGroupSetting = Schema.Struct({ id: RuntimeUUID, name: GroupName, position: Position,
    signup_enabled: Schema.Boolean, role_id: Schema.NullOr(DecimalSnowflake) });
export const RosterBuilderMemberGroupSetting = Schema.Struct({ id: RuntimeUUID, name: GroupName, position: Position,
    signupEnabled: Schema.Boolean, roleId: Schema.NullOr(DecimalSnowflake) });
// The request and five endpoint descriptors below are deferred Bot/configuration
// references, exported only from ./deferred-runtime. The value schemas above
// remain dependencies of retained roster payloads, without enabling new routes.
export const RosterMemberGroupSettingsRequest = Schema.Struct({ groups: Schema.Array(Schema.Struct({
        member_group_id: RuntimeUUID, signup_enabled: Schema.Boolean, position: Position, role_id: Schema.NullOr(DecimalSnowflake),
    })).check(Schema.isMaxLength(25), Schema.makeFilter(groups => {
        if (new Set(groups.map(group => group.member_group_id)).size !== groups.length)
            return "Roster member groups must be unique";
        if (groups.filter(group => group.signup_enabled).length > 24)
            return "At most 24 signup groups plus Main are supported";
        return undefined;
    })) });
const errors = [400, 401, 403, 404, 409, 413, 429, 503].map(status => ({ status, body: ErrorResponse }));
const ServerPath = Schema.Struct({ serverId: DecimalSnowflake });
const GroupPath = Schema.Struct({ serverId: DecimalSnowflake, memberGroupId: RuntimeUUID });
export const DashboardRosterMemberGroupsEndpoint = defineEndpoint({
    operationId: "dashboardRosterMemberGroups", method: "GET", path: "/v2/server/:serverId/roster-member-groups",
    auth: "server-read", body: NoBody, bodyMode: "none", pathParams: ServerPath, query: NoQuery,
    response: Schema.Struct({ items: Schema.Array(RosterMemberGroup) }), responseMode: "json", successStatus: 200, errors,
    summary: "List server account groups, distinct from groups of rosters",
});
export const DashboardCreateRosterMemberGroupEndpoint = defineEndpoint({
    operationId: "dashboardCreateRosterMemberGroup", method: "POST", path: "/v2/server/:serverId/roster-member-groups",
    auth: "server-write", body: Schema.Struct({ name: GroupName, position: Schema.optionalKey(Position) }), bodyMode: "json",
    pathParams: ServerPath, query: NoQuery, response: Schema.Struct({ group: RosterMemberGroup }), responseMode: "json", successStatus: 201, errors,
    summary: "Create one of at most 25 server account groups",
});
export const DashboardUpdateRosterMemberGroupEndpoint = defineEndpoint({
    operationId: "dashboardUpdateRosterMemberGroup", method: "PATCH", path: "/v2/server/:serverId/roster-member-groups/:memberGroupId",
    auth: "server-write", body: Schema.Struct({ name: Schema.optionalKey(GroupName), position: Schema.optionalKey(Position) }), bodyMode: "json",
    pathParams: GroupPath, query: NoQuery, response: Schema.Struct({ group: RosterMemberGroup }), responseMode: "json", successStatus: 200, errors,
    summary: "Rename or reorder a server account group",
});
export const DashboardDeleteRosterMemberGroupEndpoint = defineEndpoint({
    operationId: "dashboardDeleteRosterMemberGroup", method: "DELETE", path: "/v2/server/:serverId/roster-member-groups/:memberGroupId",
    auth: "server-write", body: NoBody, bodyMode: "none", pathParams: GroupPath, query: NoQuery,
    response: NoContent, responseMode: "none", successStatus: 204, errors, summary: "Delete an unassigned server account group",
});
export const DashboardReplaceRosterMemberGroupsEndpoint = defineEndpoint({
    operationId: "dashboardReplaceRosterMemberGroups", method: "PUT", path: "/v2/server/:serverId/rosters/:rosterId/member-groups",
    auth: "server-write", body: RosterMemberGroupSettingsRequest, bodyMode: "json",
    pathParams: Schema.Struct({ serverId: DecimalSnowflake, rosterId: RuntimeUUID }), query: NoQuery,
    response: Schema.Struct({ groups: Schema.Array(RosterMemberGroupSetting) }), responseMode: "json", successStatus: 200, errors,
    summary: "Configure account signup groups and roles while retaining referenced disabled groups",
});
export const rosterConfigurationEndpoints = {
    dashboardRosterMemberGroups: DashboardRosterMemberGroupsEndpoint,
    dashboardCreateRosterMemberGroup: DashboardCreateRosterMemberGroupEndpoint,
    dashboardUpdateRosterMemberGroup: DashboardUpdateRosterMemberGroupEndpoint,
    dashboardDeleteRosterMemberGroup: DashboardDeleteRosterMemberGroupEndpoint,
    dashboardReplaceRosterMemberGroups: DashboardReplaceRosterMemberGroupsEndpoint,
};
