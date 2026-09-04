import { Schema } from "effect";
import { defineEndpoint, NoBody, NoContent, NoPathParams, NoQuery } from "./endpoint.js";
import { DecimalSnowflake } from "./discord.js";
import { RuntimeUUID } from "./persistent-runtime.js";
import { RosterCapacity, RosterMemberGroupSetting } from "./roster-configuration.js";
const ServerID = Schema.String;
const JsonRecord = Schema.Record(Schema.String, Schema.Json);
const RevisionRecord = Schema.Record(Schema.String, Schema.Number);
export const DashboardRosterType = Schema.Literals(["clan", "family"]);
export const DashboardRosterSignupScope = Schema.Literals(["clan-only", "family-wide"]);
export const DashboardRosterSortDirection = Schema.Literals(["asc", "desc"]);
export const DashboardRosterSort = Schema.Struct({
    columnId: Schema.String,
    direction: DashboardRosterSortDirection,
});
export const DashboardRosterSignupQuestion = Schema.Struct({
    id: Schema.String,
    label: Schema.String,
    type: Schema.Literals(["text", "boolean", "single_select"]),
    required: Schema.Boolean,
    options: Schema.optionalKey(Schema.Array(Schema.String)),
    order: Schema.Number,
});
export const DashboardRosterMember = Schema.Struct({
    member_group_id: Schema.NullOr(RuntimeUUID),
    is_substitute: Schema.Boolean,
    name: Schema.String,
    tag: Schema.String,
    townhall: Schema.Number,
    trophies: Schema.optionalKey(Schema.Number),
    current_clan: Schema.optionalKey(Schema.String),
    current_clan_tag: Schema.optionalKey(Schema.String),
    league_id: Schema.optionalKey(Schema.Number),
    league_name: Schema.optionalKey(Schema.String),
    hero_level_sum: Schema.Number,
    max_percent: Schema.optionalKey(Schema.Number),
    war_pref: Schema.optionalKey(Schema.Boolean),
    discord: Schema.optionalKey(Schema.String),
    discord_username: Schema.optionalKey(Schema.String),
    discord_avatar_url: Schema.optionalKey(Schema.String),
    last_online: Schema.optionalKey(Schema.String),
    refreshed_at: Schema.optionalKey(Schema.String),
    hitrate: Schema.optionalKey(Schema.NullOr(Schema.Number)),
    added_at: Schema.optionalKey(Schema.NullOr(Schema.String)),
    last_updated: Schema.optionalKey(Schema.NullOr(Schema.String)),
    is_in_family: Schema.optionalKey(Schema.Boolean),
    member_status: Schema.optionalKey(Schema.String),
    error_details: Schema.optionalKey(Schema.NullOr(Schema.String)),
    answers: Schema.optionalKey(Schema.Json),
});
export const DashboardRosterMemberInput = Schema.Struct({
    member_group_id: Schema.optionalKey(Schema.NullOr(RuntimeUUID)),
    is_substitute: Schema.optionalKey(Schema.Boolean),
    name: Schema.optionalKey(Schema.String),
    tag: Schema.String,
    townhall: Schema.optionalKey(Schema.Number),
    trophies: Schema.optionalKey(Schema.Number),
    current_clan: Schema.optionalKey(Schema.String),
    current_clan_tag: Schema.optionalKey(Schema.String),
    league_id: Schema.optionalKey(Schema.Number),
    league_name: Schema.optionalKey(Schema.String),
    hero_level_sum: Schema.optionalKey(Schema.Number),
    max_percent: Schema.optionalKey(Schema.Number),
    war_pref: Schema.optionalKey(Schema.Boolean),
    discord: Schema.optionalKey(Schema.String),
    discord_username: Schema.optionalKey(Schema.String),
    discord_avatar_url: Schema.optionalKey(Schema.String),
    last_online: Schema.optionalKey(Schema.String),
    refreshed_at: Schema.optionalKey(Schema.String),
    answers: Schema.optionalKey(Schema.Json),
});
export const DashboardRoster = Schema.Struct({
    capacity: RosterCapacity,
    roster_role_id: Schema.NullOr(DecimalSnowflake),
    member_groups: Schema.Array(RosterMemberGroupSetting),
    id: Schema.String,
    server_id: Schema.String,
    alias: Schema.String,
    description: Schema.optionalKey(Schema.String),
    roster_type: DashboardRosterType,
    signup_scope: DashboardRosterSignupScope,
    clan_tag: Schema.optionalKey(Schema.String),
    clan_name: Schema.optionalKey(Schema.NullOr(Schema.String)),
    clan_badge: Schema.optionalKey(Schema.NullOr(Schema.String)),
    group_id: Schema.optionalKey(Schema.String),
    members: Schema.Array(DashboardRosterMember),
    min_th: Schema.optionalKey(Schema.Number),
    max_th: Schema.optionalKey(Schema.Number),
    min_signups: Schema.optionalKey(Schema.Number),
    max_accounts_per_user: Schema.optionalKey(RosterCapacity),
    columns: Schema.Array(Schema.String),
    sort: Schema.Array(DashboardRosterSort),
    webhook_id: Schema.optionalKey(Schema.String),
    message_id: Schema.optionalKey(Schema.String),
    image: Schema.optionalKey(Schema.String),
    event_start_time: Schema.optionalKey(Schema.Number),
    recurrence_days: Schema.optionalKey(Schema.Number),
    recurrence_day_of_month: Schema.optionalKey(Schema.Number),
    signup_questions: Schema.optionalKey(Schema.Array(DashboardRosterSignupQuestion)),
    created_at: Schema.String,
    updated_at: Schema.String,
    revision: Schema.Number,
});
export const DashboardCreateRosterRequest = Schema.Struct({
    capacity: Schema.optionalKey(RosterCapacity),
    roster_role_id: Schema.optionalKey(Schema.NullOr(DecimalSnowflake)),
    max_accounts_per_user: Schema.optionalKey(Schema.NullOr(RosterCapacity)),
    server_id: Schema.optionalKey(ServerID),
    alias: Schema.String,
    description: Schema.optionalKey(Schema.NullOr(Schema.String)),
    roster_type: DashboardRosterType,
    signup_scope: DashboardRosterSignupScope,
    clan_tag: Schema.optionalKey(Schema.NullOr(Schema.String)),
    group_id: Schema.optionalKey(Schema.NullOr(Schema.String)),
    members: Schema.optionalKey(Schema.Array(DashboardRosterMemberInput)),
});
export const DashboardUpdateRosterRequest = Schema.Struct({
    capacity: Schema.optionalKey(RosterCapacity),
    roster_role_id: Schema.optionalKey(Schema.NullOr(DecimalSnowflake)),
    alias: Schema.optionalKey(Schema.String),
    description: Schema.optionalKey(Schema.NullOr(Schema.String)),
    roster_type: Schema.optionalKey(DashboardRosterType),
    signup_scope: Schema.optionalKey(DashboardRosterSignupScope),
    clan_tag: Schema.optionalKey(Schema.NullOr(Schema.String)),
    group_id: Schema.optionalKey(Schema.NullOr(Schema.String)),
    min_th: Schema.optionalKey(Schema.NullOr(Schema.Number)),
    max_th: Schema.optionalKey(Schema.NullOr(Schema.Number)),
    min_signups: Schema.optionalKey(Schema.NullOr(Schema.Number)),
    max_accounts_per_user: Schema.optionalKey(Schema.NullOr(RosterCapacity)),
    columns: Schema.optionalKey(Schema.Array(Schema.String)),
    sort: Schema.optionalKey(Schema.Array(DashboardRosterSort)),
    webhook_id: Schema.optionalKey(Schema.NullOr(Schema.String)),
    message_id: Schema.optionalKey(Schema.NullOr(Schema.String)),
    image: Schema.optionalKey(Schema.NullOr(Schema.String)),
    event_start_time: Schema.optionalKey(Schema.NullOr(Schema.Number)),
    recurrence_days: Schema.optionalKey(Schema.NullOr(Schema.Number)),
    recurrence_day_of_month: Schema.optionalKey(Schema.NullOr(Schema.Number)),
    signup_questions: Schema.optionalKey(Schema.Array(DashboardRosterSignupQuestion)),
});
export const DashboardRosterMessageResponse = Schema.Struct({ message: Schema.String });
export const DashboardCreateRosterResponse = Schema.Struct({
    message: Schema.String,
    roster_id: Schema.String,
    roster: DashboardRoster,
});
export const DashboardUpdateRosterResponse = Schema.Struct({
    message: Schema.String,
    roster: Schema.optionalKey(DashboardRoster),
});
export const DashboardGetRosterResponse = Schema.Struct({ roster: DashboardRoster });
export const DashboardRosterListResponse = Schema.Struct({
    rosters: Schema.Array(DashboardRoster),
    count: Schema.Number,
});
export const DashboardCloneRosterRequest = Schema.Struct({
    new_alias: Schema.String,
    copy_members: Schema.optionalKey(Schema.Boolean),
});
export const DashboardCloneRosterResponse = Schema.Struct({
    message: Schema.String,
    new_roster_id: Schema.String,
    new_alias: Schema.String,
    target_server_id: Schema.String,
    source_server_id: Schema.String,
    members_copied: Schema.Number,
    roster: DashboardRoster,
});
export const DashboardRefreshRostersResponse = Schema.Struct({
    message: Schema.String,
    refreshed_rosters: Schema.Array(DashboardRoster),
});
export const DashboardManageRosterMembersRequest = Schema.Struct({
    members: Schema.optionalKey(Schema.Array(DashboardRosterMemberInput)),
    add: Schema.optionalKey(Schema.Array(DashboardRosterMemberInput)),
    operation: Schema.optionalKey(Schema.Literals(["add", "remove", "update"])),
    player_tags: Schema.optionalKey(Schema.Array(Schema.String)),
});
export const DashboardUpdateRosterMemberRequest = Schema.Struct({
    member_group_id: Schema.optionalKey(Schema.NullOr(RuntimeUUID)),
    is_substitute: Schema.optionalKey(Schema.Boolean),
    answers: Schema.optionalKey(Schema.Json),
});
export const DashboardRefreshRosterMemberResponse = Schema.Struct({
    message: Schema.String,
    member: DashboardRosterMember,
});
export const DashboardMissingRosterMember = Schema.Struct({
    tag: Schema.String,
    name: Schema.String,
    townhall: Schema.Number,
    role: Schema.String,
    trophies: Schema.Number,
    discord: Schema.optionalKey(Schema.String),
});
export const DashboardMissingRosterInfo = Schema.Struct({
    roster_id: Schema.String,
    alias: Schema.String,
    clan_tag: Schema.String,
    clan_name: Schema.String,
    registered_count: Schema.Number,
});
export const DashboardMissingRosterSummary = Schema.Struct({
    total_missing: Schema.Number,
    total_clan_members: Schema.Number,
    coverage_percentage: Schema.Number,
});
export const DashboardMissingRosterResult = Schema.Struct({
    state: Schema.Literals(["ok", "error"]),
    roster_info: Schema.optionalKey(DashboardMissingRosterInfo),
    missing_members: Schema.Array(DashboardMissingRosterMember),
    summary: Schema.optionalKey(DashboardMissingRosterSummary),
    error_message: Schema.optionalKey(Schema.String),
});
export const DashboardMissingRosterMembersResponse = Schema.Struct({
    query_type: Schema.Literals(["roster", "group"]),
    query_value: Schema.String,
    results: Schema.Array(DashboardMissingRosterResult),
    total_rosters_checked: Schema.Number,
});
export const DashboardServerClanMember = Schema.Struct({
    tag: Schema.String,
    name: Schema.String,
    clan_tag: Schema.String,
    clan_name: Schema.String,
    townhall: Schema.Number,
    role: Schema.String,
    trophies: Schema.Number,
});
export const DashboardServerClanMembersResponse = Schema.Struct({
    members: Schema.Array(DashboardServerClanMember),
    count: Schema.optionalKey(Schema.Number),
});
export const DashboardRosterGroup = Schema.Struct({
    group_id: Schema.String,
    server_id: Schema.String,
    name: Schema.String,
    alias: Schema.optionalKey(Schema.String),
    description: Schema.String,
    max_accounts_per_user: Schema.optionalKey(Schema.Number),
    min_signups: Schema.optionalKey(Schema.Number),
    rosters: Schema.optionalKey(Schema.Array(DashboardRoster)),
    created_at: Schema.String,
    updated_at: Schema.String,
});
export const DashboardRosterGroupRequest = Schema.Struct({
    server_id: Schema.optionalKey(ServerID),
    name: Schema.optionalKey(Schema.String),
    alias: Schema.optionalKey(Schema.String),
    description: Schema.optionalKey(Schema.NullOr(Schema.String)),
    max_accounts_per_user: Schema.optionalKey(Schema.NullOr(Schema.Number)),
    min_signups: Schema.optionalKey(Schema.NullOr(Schema.Number)),
});
export const DashboardCreateRosterGroupResponse = Schema.Struct({
    message: Schema.String,
    group_id: Schema.String,
    group: DashboardRosterGroup,
});
export const DashboardGetRosterGroupResponse = Schema.Struct({ group: DashboardRosterGroup });
export const DashboardUpdateRosterGroupResponse = Schema.Struct({
    message: Schema.String,
    group: DashboardRosterGroup,
});
export const DashboardRosterGroupListResponse = Schema.Struct({
    items: Schema.Array(DashboardRosterGroup),
    count: Schema.Number,
});
export const DashboardDeleteRosterGroupResponse = Schema.Struct({
    message: Schema.String,
    affected_rosters: Schema.Number,
});
export const DashboardRosterAutomationOptions = Schema.Struct({
    ping_type: Schema.optionalKey(Schema.Literals(["signup_reminder", "missing"])),
});
export const DashboardRosterAutomation = Schema.Struct({
    automation_id: Schema.String,
    server_id: Schema.String,
    roster_id: Schema.optionalKey(Schema.String),
    group_id: Schema.optionalKey(Schema.String),
    action_type: Schema.String,
    trigger_type: Schema.String,
    scheduled_at: Schema.String,
    discord_channel_id: Schema.optionalKey(Schema.String),
    options: Schema.optionalKey(DashboardRosterAutomationOptions),
    active: Schema.Boolean,
    executed: Schema.Boolean,
    executed_at: Schema.optionalKey(Schema.Number),
    last_triggered_at: Schema.optionalKey(Schema.Number),
    execution_status: Schema.optionalKey(Schema.String),
    last_missed_at: Schema.optionalKey(Schema.Number),
    created_at: Schema.String,
    updated_at: Schema.String,
});
export const DashboardCreateRosterAutomationRequest = Schema.Struct({
    roster_id: Schema.optionalKey(Schema.NullOr(Schema.String)),
    group_id: Schema.optionalKey(Schema.NullOr(Schema.String)),
    action_type: Schema.String,
    trigger_type: Schema.optionalKey(Schema.String),
    scheduled_at: Schema.String,
    discord_channel_id: Schema.optionalKey(Schema.NullOr(Schema.String)),
    options: Schema.optionalKey(DashboardRosterAutomationOptions),
    active: Schema.optionalKey(Schema.Boolean),
});
export const DashboardUpdateRosterAutomationRequest = Schema.Struct({
    roster_id: Schema.optionalKey(Schema.NullOr(Schema.String)),
    group_id: Schema.optionalKey(Schema.NullOr(Schema.String)),
    action_type: Schema.optionalKey(Schema.String),
    trigger_type: Schema.optionalKey(Schema.String),
    scheduled_at: Schema.optionalKey(Schema.String),
    discord_channel_id: Schema.optionalKey(Schema.NullOr(Schema.String)),
    options: Schema.optionalKey(DashboardRosterAutomationOptions),
    active: Schema.optionalKey(Schema.Boolean),
});
export const DashboardCreateRosterAutomationResponse = Schema.Struct({
    message: Schema.String,
    automation_id: Schema.String,
    rule: DashboardRosterAutomation,
});
export const DashboardUpdateRosterAutomationResponse = Schema.Struct({
    message: Schema.String,
    rule: DashboardRosterAutomation,
});
export const DashboardRosterAutomationListResponse = Schema.Struct({
    items: Schema.Array(DashboardRosterAutomation),
    rules: Schema.Array(DashboardRosterAutomation),
    count: Schema.Number,
    server_id: Schema.String,
    roster_id: Schema.String,
    group_id: Schema.String,
});
export const DashboardRosterMetric = Schema.Struct({
    id: Schema.String,
    label: Schema.String,
    valueType: Schema.Literals(["string", "number", "boolean", "json", "time"]),
    kind: Schema.Literals(["snapshot", "historical", "derived", "presentation"]),
    description: Schema.String,
    cacheTtlSeconds: Schema.Number,
    dependsOn: Schema.optionalKey(Schema.Array(Schema.String)),
});
export const DashboardRosterMetricsResponse = Schema.Struct({
    items: Schema.Array(DashboardRosterMetric),
});
export const DashboardRosterMetricQueryRequest = Schema.Struct({
    rosterIds: Schema.Array(Schema.String),
    metricId: Schema.String,
    parameters: Schema.optionalKey(JsonRecord),
    force: Schema.Boolean,
});
export const DashboardRosterMetricQueryRow = Schema.Struct({
    rosterId: Schema.String,
    playerTag: Schema.String,
    value: Schema.Json,
});
export const DashboardRosterMetricQueryResponse = Schema.Struct({
    metricId: Schema.String,
    parameters: JsonRecord,
    rows: Schema.Array(DashboardRosterMetricQueryRow),
    cached: Schema.Boolean,
    evaluatedAt: Schema.String,
});
export const DashboardRosterViewColumn = Schema.Struct({
    id: Schema.String,
    label: Schema.String,
    metricId: Schema.String,
    description: Schema.optionalKey(Schema.String),
    parameters: Schema.optionalKey(JsonRecord),
    format: Schema.optionalKey(Schema.String),
});
export const DashboardRosterViewFilterOperator = Schema.Literals([
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "in",
    "contains",
]);
export const DashboardRosterViewFilter = Schema.Struct({
    columnId: Schema.String,
    operator: DashboardRosterViewFilterOperator,
    value: Schema.Json,
});
export const DashboardRosterViewHighlightCondition = Schema.Struct({
    columnId: Schema.optionalKey(Schema.String),
    operator: DashboardRosterViewFilterOperator,
    value: Schema.Json,
});
export const DashboardRosterViewHighlight = Schema.Struct({
    id: Schema.String,
    target: Schema.Literals(["row", "column", "cell"]),
    columnId: Schema.optionalKey(Schema.String),
    when: Schema.optionalKey(DashboardRosterViewHighlightCondition),
    tone: Schema.Literals(["red", "amber", "green", "blue", "purple", "gray"]),
});
export const DashboardRosterViewSpec = Schema.Struct({
    schemaVersion: Schema.Literal(1),
    columns: Schema.Array(DashboardRosterViewColumn),
    sort: Schema.optionalKey(Schema.Array(DashboardRosterSort)),
    filters: Schema.optionalKey(Schema.Array(DashboardRosterViewFilter)),
    highlights: Schema.optionalKey(Schema.Array(DashboardRosterViewHighlight)),
    limit: Schema.optionalKey(Schema.Number),
});
export const DashboardRosterViewWrite = Schema.Struct({
    name: Schema.String,
    sourceCode: Schema.String,
    sourceVersion: Schema.Literal(1),
});
export const DashboardRosterView = Schema.Struct({
    id: Schema.String,
    shareId: Schema.String,
    serverId: Schema.String,
    name: Schema.String,
    sourceCode: Schema.String,
    sourceVersion: Schema.Literal(1),
    createdBy: Schema.String,
    spec: Schema.optionalKey(DashboardRosterViewSpec),
    createdAt: Schema.String,
    updatedAt: Schema.String,
});
export const DashboardRosterViewResultRow = Schema.Struct({
    rosterId: Schema.String,
    playerTag: Schema.String,
    values: JsonRecord,
    highlight: Schema.optionalKey(Schema.NullOr(Schema.String)),
});
export const DashboardRosterViewResult = Schema.Struct({
    viewId: Schema.String,
    rosterIds: Schema.Array(Schema.String),
    schemaVersion: Schema.Literal(1),
    rows: Schema.Array(DashboardRosterViewResultRow),
    cachedMetricIds: Schema.Array(Schema.String),
    evaluatedAt: Schema.String,
});
export const DashboardRosterViewPreviewRequest = Schema.Struct({
    serverId: Schema.String,
    rosterIds: Schema.Array(Schema.String),
    viewId: Schema.optionalKey(Schema.String),
    name: Schema.String,
    sourceCode: Schema.String,
    sourceVersion: Schema.Literal(1),
    columns: Schema.Array(DashboardRosterViewColumn),
    filters: Schema.Array(DashboardRosterViewFilter),
    sort: Schema.Array(DashboardRosterSort),
    highlights: Schema.Array(DashboardRosterViewHighlight),
    limit: Schema.NullOr(Schema.Number),
    rows: Schema.optionalKey(Schema.Array(DashboardRosterViewResultRow)),
});
export const DashboardRosterViewPreviewResponse = Schema.Struct({
    view: DashboardRosterView,
    result: DashboardRosterViewResult,
});
export const DashboardRosterMembershipAction = Schema.Literals(["add", "remove", "move"]);
export const DashboardRosterMembershipChange = Schema.Struct({
    action: DashboardRosterMembershipAction,
    playerTag: Schema.String,
    fromRosterId: Schema.optionalKey(Schema.String),
    toRosterId: Schema.optionalKey(Schema.String),
    reason: Schema.optionalKey(Schema.String),
});
export const DashboardApplyRosterMembershipChangesRequest = Schema.Struct({
    serverId: Schema.String,
    changes: Schema.Array(DashboardRosterMembershipChange),
    expectedRevisions: RevisionRecord,
});
export const DashboardApplyRosterMembershipChangesResponse = Schema.Struct({
    applied: Schema.Boolean,
    changeCount: Schema.Number,
    revisions: RevisionRecord,
});
export const DashboardRosterDiscordIdentityRefreshRequest = Schema.Struct({
    playerTag: Schema.String,
});
export const DashboardRosterDiscordIdentityResponse = Schema.Struct({
    playerTag: Schema.String,
    discordUserId: Schema.String,
    discordUsername: Schema.String,
    discordAvatarUrl: Schema.String,
});
export const DashboardPublicRosterMember = Schema.Struct({
    playerTag: Schema.String,
    name: Schema.String,
    townhall: Schema.Number,
    refreshedAt: Schema.NullOr(Schema.String),
    currentClanName: Schema.optionalKey(Schema.String),
    currentClanTag: Schema.optionalKey(Schema.String),
});
export const DashboardPublicRoster = Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    minTownhall: Schema.optionalKey(Schema.NullOr(Schema.Number)),
    maxTownhall: Schema.optionalKey(Schema.NullOr(Schema.Number)),
    description: Schema.optionalKey(Schema.String),
    clanName: Schema.optionalKey(Schema.String),
    clanTag: Schema.optionalKey(Schema.String),
    clanBadgeUrl: Schema.optionalKey(Schema.String),
    updatedAt: Schema.String,
    members: Schema.Array(DashboardPublicRosterMember),
});
const RosterPath = Schema.Struct({ rosterId: Schema.String });
const RosterMemberPath = Schema.Struct({ rosterId: Schema.String, memberTag: Schema.String });
const ServerPath = Schema.Struct({ serverId: ServerID });
const ServerRosterPath = Schema.Struct({ serverId: ServerID, rosterId: Schema.String });
const GroupPath = Schema.Struct({ groupId: Schema.String });
const AutomationPath = Schema.Struct({ automationId: Schema.String });
const ViewPath = Schema.Struct({ viewId: Schema.String });
const ServerQuery = Schema.Struct({ server_id: ServerID });
export const DashboardCreateRosterEndpoint = defineEndpoint({
    operationId: "dashboardCreateRoster",
    method: "POST",
    path: "/v2/roster",
    auth: "server-write",
    summary: "Create a dashboard roster",
    body: DashboardCreateRosterRequest,
    bodyMode: "json",
    pathParams: NoPathParams,
    query: ServerQuery,
    response: DashboardCreateRosterResponse,
    responseMode: "json",
    successStatus: 201,
    errors: [],
});
export const DashboardUpdateRosterEndpoint = defineEndpoint({
    operationId: "dashboardUpdateRoster",
    method: "PATCH",
    path: "/v2/roster/:rosterId",
    auth: "server-write",
    summary: "Update a dashboard roster",
    body: DashboardUpdateRosterRequest,
    bodyMode: "json",
    pathParams: RosterPath,
    query: ServerQuery,
    response: DashboardUpdateRosterResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardGetRosterEndpoint = defineEndpoint({
    operationId: "dashboardGetRoster",
    method: "GET",
    path: "/v2/roster/:rosterId",
    auth: "server-read",
    summary: "Get a dashboard roster",
    body: NoBody,
    bodyMode: "none",
    pathParams: RosterPath,
    query: ServerQuery,
    response: DashboardGetRosterResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardDeleteRosterEndpoint = defineEndpoint({
    operationId: "dashboardDeleteRoster",
    method: "DELETE",
    path: "/v2/roster/:rosterId",
    auth: "server-write",
    summary: "Delete a roster or clear its members",
    body: NoBody,
    bodyMode: "none",
    pathParams: RosterPath,
    query: Schema.Struct({ server_id: ServerID, members_only: Schema.optionalKey(Schema.Boolean) }),
    response: DashboardRosterMessageResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardListRostersEndpoint = defineEndpoint({
    operationId: "dashboardListRosters",
    method: "GET",
    path: "/v2/roster/:serverId/list",
    auth: "server-read",
    summary: "List dashboard rosters",
    body: NoBody,
    bodyMode: "none",
    pathParams: ServerPath,
    query: Schema.Struct({
        group_id: Schema.optionalKey(Schema.String),
        clan_tag: Schema.optionalKey(Schema.String),
    }),
    response: DashboardRosterListResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardCloneRosterEndpoint = defineEndpoint({
    operationId: "dashboardCloneRoster",
    method: "POST",
    path: "/v2/roster/:rosterId/clone",
    auth: "server-write",
    summary: "Clone a dashboard roster",
    body: DashboardCloneRosterRequest,
    bodyMode: "json",
    pathParams: RosterPath,
    query: ServerQuery,
    response: DashboardCloneRosterResponse,
    responseMode: "json",
    successStatus: 201,
    errors: [],
});
export const DashboardRefreshRostersEndpoint = defineEndpoint({
    operationId: "dashboardRefreshRosters",
    method: "POST",
    path: "/v2/roster/refresh",
    auth: "server-write",
    summary: "Refresh legacy roster snapshots",
    body: NoBody,
    bodyMode: "none",
    pathParams: NoPathParams,
    query: Schema.Struct({
        server_id: ServerID,
        group_id: Schema.optionalKey(Schema.String),
        roster_id: Schema.optionalKey(Schema.String),
    }),
    response: DashboardRefreshRostersResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardManageRosterMembersEndpoint = defineEndpoint({
    operationId: "dashboardManageRosterMembers",
    method: "POST",
    path: "/v2/roster/:rosterId/members",
    auth: "server-write",
    summary: "Add, remove, or update roster members",
    body: DashboardManageRosterMembersRequest,
    bodyMode: "json",
    pathParams: RosterPath,
    query: ServerQuery,
    response: DashboardRosterMessageResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardUpdateRosterMemberEndpoint = defineEndpoint({
    operationId: "dashboardUpdateRosterMember",
    method: "PATCH",
    path: "/v2/roster/:rosterId/members/:memberTag",
    auth: "server-write",
    summary: "Update a roster member",
    body: DashboardUpdateRosterMemberRequest,
    bodyMode: "json",
    pathParams: RosterMemberPath,
    query: ServerQuery,
    response: DashboardRosterMessageResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardRemoveRosterMemberEndpoint = defineEndpoint({
    operationId: "dashboardRemoveRosterMember",
    method: "DELETE",
    path: "/v2/roster/:rosterId/members/:memberTag",
    auth: "server-write",
    summary: "Remove a roster member",
    body: NoBody,
    bodyMode: "none",
    pathParams: RosterMemberPath,
    query: ServerQuery,
    response: DashboardRosterMessageResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardRefreshRosterMemberEndpoint = defineEndpoint({
    operationId: "dashboardRefreshRosterMember",
    method: "POST",
    path: "/v2/roster/:rosterId/members/:memberTag/refresh",
    auth: "server-write",
    summary: "Refresh one roster member",
    body: NoBody,
    bodyMode: "none",
    pathParams: RosterMemberPath,
    query: ServerQuery,
    response: DashboardRefreshRosterMemberResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardMissingRosterMembersEndpoint = defineEndpoint({
    operationId: "dashboardMissingRosterMembers",
    method: "GET",
    path: "/v2/roster/missing-members",
    auth: "server-read",
    summary: "Find clan members missing from dashboard rosters",
    body: NoBody,
    bodyMode: "none",
    pathParams: NoPathParams,
    query: Schema.Struct({
        server_id: ServerID,
        roster_id: Schema.optionalKey(Schema.String),
        group_id: Schema.optionalKey(Schema.String),
    }),
    response: DashboardMissingRosterMembersResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardServerClanMembersEndpoint = defineEndpoint({
    operationId: "dashboardServerClanMembers",
    method: "GET",
    path: "/v2/roster/server/:serverId/members",
    auth: "server-read",
    summary: "List clan members for a dashboard server",
    body: NoBody,
    bodyMode: "none",
    pathParams: ServerPath,
    query: NoQuery,
    response: DashboardServerClanMembersResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardCreateRosterGroupEndpoint = defineEndpoint({
    operationId: "dashboardCreateRosterGroup",
    method: "POST",
    path: "/v2/roster-group",
    auth: "server-write",
    summary: "Create a roster group",
    body: DashboardRosterGroupRequest,
    bodyMode: "json",
    pathParams: NoPathParams,
    query: ServerQuery,
    response: DashboardCreateRosterGroupResponse,
    responseMode: "json",
    successStatus: 201,
    errors: [],
});
export const DashboardListRosterGroupsEndpoint = defineEndpoint({
    operationId: "dashboardListRosterGroups",
    method: "GET",
    path: "/v2/roster-group/list",
    auth: "server-read",
    summary: "List roster groups",
    body: NoBody,
    bodyMode: "none",
    pathParams: NoPathParams,
    query: ServerQuery,
    response: DashboardRosterGroupListResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardGetRosterGroupEndpoint = defineEndpoint({
    operationId: "dashboardGetRosterGroup",
    method: "GET",
    path: "/v2/roster-group/:groupId",
    auth: "server-read",
    summary: "Get a roster group",
    body: NoBody,
    bodyMode: "none",
    pathParams: GroupPath,
    query: ServerQuery,
    response: DashboardGetRosterGroupResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardUpdateRosterGroupEndpoint = defineEndpoint({
    operationId: "dashboardUpdateRosterGroup",
    method: "PATCH",
    path: "/v2/roster-group/:groupId",
    auth: "server-write",
    summary: "Update a roster group",
    body: DashboardRosterGroupRequest,
    bodyMode: "json",
    pathParams: GroupPath,
    query: ServerQuery,
    response: DashboardUpdateRosterGroupResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardDeleteRosterGroupEndpoint = defineEndpoint({
    operationId: "dashboardDeleteRosterGroup",
    method: "DELETE",
    path: "/v2/roster-group/:groupId",
    auth: "server-write",
    summary: "Delete a roster group",
    body: NoBody,
    bodyMode: "none",
    pathParams: GroupPath,
    query: ServerQuery,
    response: DashboardDeleteRosterGroupResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardCreateRosterAutomationEndpoint = defineEndpoint({
    operationId: "dashboardCreateRosterAutomation",
    method: "POST",
    path: "/v2/roster-automation",
    auth: "server-write",
    summary: "Create roster automation",
    body: DashboardCreateRosterAutomationRequest,
    bodyMode: "json",
    pathParams: NoPathParams,
    query: ServerQuery,
    response: DashboardCreateRosterAutomationResponse,
    responseMode: "json",
    successStatus: 201,
    errors: [],
});
export const DashboardListRosterAutomationsEndpoint = defineEndpoint({
    operationId: "dashboardListRosterAutomations",
    method: "GET",
    path: "/v2/roster-automation/list",
    auth: "server-read",
    summary: "List roster automation",
    body: NoBody,
    bodyMode: "none",
    pathParams: NoPathParams,
    query: Schema.Struct({
        server_id: ServerID,
        roster_id: Schema.optionalKey(Schema.String),
        group_id: Schema.optionalKey(Schema.String),
        active_only: Schema.optionalKey(Schema.Boolean),
    }),
    response: DashboardRosterAutomationListResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardUpdateRosterAutomationEndpoint = defineEndpoint({
    operationId: "dashboardUpdateRosterAutomation",
    method: "PATCH",
    path: "/v2/roster-automation/:automationId",
    auth: "server-write",
    summary: "Update roster automation",
    body: DashboardUpdateRosterAutomationRequest,
    bodyMode: "json",
    pathParams: AutomationPath,
    query: ServerQuery,
    response: DashboardUpdateRosterAutomationResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardDeleteRosterAutomationEndpoint = defineEndpoint({
    operationId: "dashboardDeleteRosterAutomation",
    method: "DELETE",
    path: "/v2/roster-automation/:automationId",
    auth: "server-write",
    summary: "Delete roster automation",
    body: NoBody,
    bodyMode: "none",
    pathParams: AutomationPath,
    query: ServerQuery,
    response: DashboardRosterMessageResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardListRosterMetricsEndpoint = defineEndpoint({
    operationId: "dashboardListRosterMetrics",
    method: "GET",
    path: "/v2/roster/metrics",
    auth: "server-read",
    summary: "List roster-view metrics",
    body: NoBody,
    bodyMode: "none",
    pathParams: NoPathParams,
    query: ServerQuery,
    response: DashboardRosterMetricsResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardQueryRosterMetricEndpoint = defineEndpoint({
    operationId: "dashboardQueryRosterMetric",
    method: "POST",
    path: "/v2/roster/metrics/query",
    auth: "server-read",
    summary: "Evaluate one roster metric",
    body: DashboardRosterMetricQueryRequest,
    bodyMode: "json",
    pathParams: NoPathParams,
    query: ServerQuery,
    response: DashboardRosterMetricQueryResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardListRosterViewsEndpoint = defineEndpoint({
    operationId: "dashboardListRosterViews",
    method: "GET",
    path: "/v2/roster/views",
    auth: "server-read",
    summary: "List saved roster views",
    body: NoBody,
    bodyMode: "none",
    pathParams: NoPathParams,
    query: ServerQuery,
    response: Schema.Array(DashboardRosterView),
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardGetRosterViewEndpoint = defineEndpoint({
    operationId: "dashboardGetRosterView",
    method: "GET",
    path: "/v2/roster/views/:viewId",
    auth: "server-read",
    summary: "Get a saved roster view",
    body: NoBody,
    bodyMode: "none",
    pathParams: ViewPath,
    query: ServerQuery,
    response: DashboardRosterView,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardResolveSharedRosterViewEndpoint = defineEndpoint({
    operationId: "dashboardResolveSharedRosterView",
    method: "GET",
    path: "/v2/roster/views/shared/:viewId",
    auth: "server-read",
    summary: "Resolve a saved roster-view share link",
    body: NoBody,
    bodyMode: "none",
    pathParams: ViewPath,
    query: NoQuery,
    response: DashboardRosterView,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardCreateRosterViewEndpoint = defineEndpoint({
    operationId: "dashboardCreateRosterView",
    method: "POST",
    path: "/v2/roster/views",
    auth: "server-write",
    summary: "Create a saved roster view",
    body: DashboardRosterViewWrite,
    bodyMode: "json",
    pathParams: NoPathParams,
    query: ServerQuery,
    response: DashboardRosterView,
    responseMode: "json",
    successStatus: 201,
    errors: [],
});
export const DashboardUpdateRosterViewEndpoint = defineEndpoint({
    operationId: "dashboardUpdateRosterView",
    method: "PATCH",
    path: "/v2/roster/views/:viewId",
    auth: "server-write",
    summary: "Update a saved roster view",
    body: DashboardRosterViewWrite,
    bodyMode: "json",
    pathParams: ViewPath,
    query: ServerQuery,
    response: DashboardRosterView,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardDeleteRosterViewEndpoint = defineEndpoint({
    operationId: "dashboardDeleteRosterView",
    method: "DELETE",
    path: "/v2/roster/views/:viewId",
    auth: "server-write",
    summary: "Delete a saved roster view",
    body: NoBody,
    bodyMode: "none",
    pathParams: ViewPath,
    query: ServerQuery,
    response: NoContent,
    responseMode: "none",
    successStatus: 204,
    errors: [],
});
export const DashboardPreviewRosterViewEndpoint = defineEndpoint({
    operationId: "dashboardPreviewRosterView",
    method: "POST",
    path: "/v2/roster/views/preview",
    auth: "server-read",
    summary: "Preview a materialized roster view",
    body: DashboardRosterViewPreviewRequest,
    bodyMode: "json",
    pathParams: NoPathParams,
    query: ServerQuery,
    response: DashboardRosterViewPreviewResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardApplyRosterMembershipChangesEndpoint = defineEndpoint({
    operationId: "dashboardApplyRosterMembershipChanges",
    method: "POST",
    path: "/v2/roster/membership-changes",
    auth: "server-write",
    summary: "Apply approved roster membership changes",
    body: DashboardApplyRosterMembershipChangesRequest,
    bodyMode: "json",
    pathParams: NoPathParams,
    query: ServerQuery,
    response: DashboardApplyRosterMembershipChangesResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardRefreshRosterDiscordIdentityEndpoint = defineEndpoint({
    operationId: "dashboardRefreshRosterDiscordIdentity",
    method: "POST",
    path: "/v2/server/:serverId/rosters/:rosterId/discord-identity/refresh",
    auth: "server-write",
    summary: "Refresh one roster member's Discord identity",
    body: DashboardRosterDiscordIdentityRefreshRequest,
    bodyMode: "json",
    pathParams: ServerRosterPath,
    query: NoQuery,
    response: DashboardRosterDiscordIdentityResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardPublicRosterEndpoint = defineEndpoint({
    operationId: "dashboardPublicRoster",
    method: "GET",
    path: "/v2/public/rosters/:publicShareId",
    auth: "public",
    summary: "Get a public roster snapshot",
    body: NoBody,
    bodyMode: "none",
    pathParams: Schema.Struct({ publicShareId: Schema.String }),
    query: NoQuery,
    response: DashboardPublicRoster,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
