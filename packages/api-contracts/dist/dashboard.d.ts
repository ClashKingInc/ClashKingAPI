export * from "./dashboard-misc.js";
export * from "./dashboard-roster.js";
export * from "./dashboard-server.js";
export * from "./dashboard-server-extra.js";
export * from "./dashboard-roster-extra.js";
export * from "./roster-configuration.js";
export declare const dashboardEndpoints: {
    readonly dashboardRosterMemberGroups: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly position: import("effect/Schema").Number;
        }>>;
    }>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly dashboardCreateRosterMemberGroup: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly name: import("effect/Schema").String;
        readonly position: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{
        readonly group: import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly position: import("effect/Schema").Number;
        }>;
    }>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly dashboardUpdateRosterMemberGroup: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly memberGroupId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly position: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{
        readonly group: import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly position: import("effect/Schema").Number;
        }>;
    }>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly dashboardDeleteRosterMemberGroup: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly memberGroupId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Void, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly dashboardReplaceRosterMemberGroups: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly rosterId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly groups: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly member_group_id: import("effect/Schema").String;
            readonly signup_enabled: import("effect/Schema").Boolean;
            readonly position: import("effect/Schema").Number;
            readonly role_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
        }>>;
    }>, import("effect/Schema").Struct<{
        readonly groups: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly position: import("effect/Schema").Number;
            readonly signup_enabled: import("effect/Schema").Boolean;
            readonly role_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
        }>>;
    }>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly dashboardRosterMembersQuery: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly rosterIds: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly fields: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Literals<readonly ["playerName", "playerTag", "townhall", "trophies", "clanName", "clanTag", "leagueId", "leagueName", "heroLevelSum", "maxPercent", "warPreference", "lastOnline", "discordUsername", "signupAnswers"]>>>;
    }>, import("effect/Schema").Struct<{
        readonly rows: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly rosterId: import("effect/Schema").String;
            readonly playerTag: import("effect/Schema").String;
            readonly playerName: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly townhall: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly trophies: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
            readonly clanName: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly clanTag: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly leagueId: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
            readonly leagueName: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly heroLevelSum: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly maxPercent: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
            readonly warPreference: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Boolean>>;
            readonly lastOnline: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly discordUsername: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly signupAnswers: import("effect/Schema").optionalKey<import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>>;
        }>>;
    }>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly dashboardRosterAccountGroupsQuery: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly rosterIds: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly fields: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Literals<readonly ["playerName", "playerTag", "townhall", "trophies", "clanName", "clanTag", "leagueId", "leagueName", "heroLevelSum", "maxPercent", "warPreference", "lastOnline", "discordUsername", "signupAnswers"]>>>;
    }>, import("effect/Schema").Struct<{
        readonly groups: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly group: import("effect/Schema").Number;
            readonly accounts: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly rosterId: import("effect/Schema").String;
                readonly playerTag: import("effect/Schema").String;
                readonly playerName: import("effect/Schema").String;
            }>>;
        }>>;
        readonly note: import("effect/Schema").String;
    }>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly dashboardRosterRefreshBatch: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly rosterIds: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly fields: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Literals<readonly ["playerName", "playerTag", "townhall", "trophies", "clanName", "clanTag", "leagueId", "leagueName", "heroLevelSum", "maxPercent", "warPreference", "lastOnline", "discordUsername", "signupAnswers"]>>>;
    }>, import("effect/Schema").Struct<{
        readonly rosters: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly rosterId: import("effect/Schema").String;
            readonly status: import("effect/Schema").Literals<readonly ["completed", "reused", "waiting"]>;
            readonly message: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly refreshedPlayers: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly failedPlayers: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly refreshedAt: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
    }>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly dashboardRosterMembershipValidate: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly rosterIds: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly changes: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly action: import("effect/Schema").Literals<readonly ["add", "remove", "move"]>;
            readonly playerTag: import("effect/Schema").String;
            readonly fromRosterId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly toRosterId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly reason: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
    }>, import("effect/Schema").Struct<{
        readonly type: import("effect/Schema").Literal<"membershipProposal">;
        readonly changes: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly action: import("effect/Schema").Literals<readonly ["add", "remove", "move"]>;
            readonly playerTag: import("effect/Schema").String;
            readonly fromRosterId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly toRosterId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly reason: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
        readonly expectedRevisions: import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Number>;
        readonly generatedAt: import("effect/Schema").String;
        readonly counts: import("effect/Schema").Struct<{
            readonly add: import("effect/Schema").Number;
            readonly move: import("effect/Schema").Number;
            readonly remove: import("effect/Schema").Number;
        }>;
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly action: import("effect/Schema").Literals<readonly ["add", "move", "remove"]>;
            readonly playerTag: import("effect/Schema").String;
            readonly fromRoster: import("effect/Schema").String;
            readonly toRoster: import("effect/Schema").String;
            readonly reason: import("effect/Schema").String;
        }>>;
    }>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly dashboardRosterQuestionnaire: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
        readonly roster_id: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly questions: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly label: import("effect/Schema").String;
            readonly type: import("effect/Schema").Literals<readonly ["text", "boolean", "single_select"]>;
            readonly required: import("effect/Schema").Boolean;
            readonly options: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly order: import("effect/Schema").Number;
        }>>;
    }>, import("effect/Schema").Struct<{
        readonly questionnaire: import("effect/Schema").Struct<{
            readonly accountSelector: import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Literal<"account">;
                readonly type: import("effect/Schema").Literal<"account">;
                readonly required: import("effect/Schema").Literal<true>;
            }>;
            readonly questions: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
                readonly type: import("effect/Schema").Literals<readonly ["text", "boolean", "single_select"]>;
                readonly required: import("effect/Schema").Boolean;
                readonly options: import("effect/Schema").$Array<import("effect/Schema").String>;
                readonly order: import("effect/Schema").Number;
            }>>;
        }>;
        readonly affectedMemberCount: import("effect/Schema").Number;
    }>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly dashboardRosterSignupForm: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly rosterId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly accountSelector: import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").Literal<"account">;
            readonly type: import("effect/Schema").Literal<"account">;
            readonly required: import("effect/Schema").Literal<true>;
        }>;
        readonly questions: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly label: import("effect/Schema").String;
            readonly type: import("effect/Schema").Literals<readonly ["text", "boolean", "single_select"]>;
            readonly required: import("effect/Schema").Boolean;
            readonly options: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly order: import("effect/Schema").Number;
        }>>;
    }>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly dashboardRosterSubmission: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly rosterId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly playerTag: import("effect/Schema").String;
        readonly answers: import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>;
        readonly discordUserId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly discordUsername: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly discordAvatarUrl: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{
        readonly submission: import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly rosterId: import("effect/Schema").String;
            readonly playerTag: import("effect/Schema").String;
            readonly answers: import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>;
            readonly createdAt: import("effect/Schema").String;
            readonly updatedAt: import("effect/Schema").String;
        }>;
    }>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly dashboardRosterBuilderMissingMembers: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly rosterId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly playerTag: import("effect/Schema").String;
            readonly playerName: import("effect/Schema").String;
            readonly townhall: import("effect/Schema").Number;
            readonly trophies: import("effect/Schema").NullOr<import("effect/Schema").Number>;
            readonly clanTag: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly clanName: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly discordUserId: import("effect/Schema").NullOr<import("effect/Schema").String>;
        }>>;
        readonly count: import("effect/Schema").Number;
    }>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly dashboardRosterRefreshData: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
        readonly roster_id: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly scope: import("effect/Schema").Literals<readonly ["data", "role"]>;
    }>, import("effect/Schema").Struct<{
        readonly refreshId: import("effect/Schema").String;
        readonly scope: import("effect/Schema").Literals<readonly ["data", "role"]>;
        readonly status: import("effect/Schema").String;
        readonly refreshedPlayers: import("effect/Schema").Number;
        readonly failedPlayers: import("effect/Schema").Number;
        readonly refreshedAt: import("effect/Schema").String;
        readonly reused: import("effect/Schema").Boolean;
        readonly roleId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly roleMemberUserIds: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
    }>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly dashboardRosterAIContext: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly rosterIds: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly viewId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly messages: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly role: import("effect/Schema").Literals<readonly ["user", "assistant"]>;
            readonly content: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly parts: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly type: import("effect/Schema").String;
                readonly text: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly toolCallId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly state: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly input: import("effect/Schema").optionalKey<import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>;
                readonly approval: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly id: import("effect/Schema").String;
                    readonly approved: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                    readonly reason: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
            }>>>;
        }>>;
    }>, import("effect/Schema").Struct<{
        readonly requestId: import("effect/Schema").String;
        readonly model: import("effect/Schema").Literal<"gpt-5.6-luna">;
        readonly budget: import("effect/Schema").Struct<{
            readonly serverSpentUsd: import("effect/Schema").Number;
            readonly serverLimitUsd: import("effect/Schema").Number;
            readonly globalSpentUsd: import("effect/Schema").Number;
            readonly globalLimitUsd: import("effect/Schema").Number;
            readonly userSpentUsd: import("effect/Schema").Number;
            readonly userLimitUsd: import("effect/Schema").Number;
            readonly paidSpentUsd: import("effect/Schema").Number;
            readonly paidLimitUsd: import("effect/Schema").Number;
            readonly paidRemainingUsd: import("effect/Schema").Number;
            readonly usesPaidPool: import("effect/Schema").Boolean;
            readonly resetsAt: import("effect/Schema").String;
        }>;
        readonly context: import("effect/Schema").Struct<{
            readonly attachments: import("effect/Schema").NullOr<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly rosterId: import("effect/Schema").String;
                readonly alias: import("effect/Schema").String;
                readonly clanTag: import("effect/Schema").NullOr<import("effect/Schema").String>;
                readonly memberCount: import("effect/Schema").Number;
                readonly revision: import("effect/Schema").Number;
                readonly signupQuestions: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly id: import("effect/Schema").String;
                    readonly label: import("effect/Schema").String;
                    readonly type: import("effect/Schema").Literals<readonly ["text", "boolean", "single_select"]>;
                    readonly required: import("effect/Schema").Boolean;
                    readonly options: import("effect/Schema").$Array<import("effect/Schema").String>;
                    readonly order: import("effect/Schema").Number;
                }>>;
            }>>>;
            readonly metrics: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
                readonly valueType: import("effect/Schema").Literals<readonly ["string", "number", "boolean", "json", "time"]>;
                readonly kind: import("effect/Schema").Literals<readonly ["snapshot", "historical", "derived", "presentation"]>;
                readonly description: import("effect/Schema").String;
                readonly cacheTtlSeconds: import("effect/Schema").Number;
                readonly dependsOn: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
            }>>;
            readonly currentView: import("effect/Schema").NullOr<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").String;
                readonly shareId: import("effect/Schema").String;
                readonly serverId: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly sourceCode: import("effect/Schema").String;
                readonly sourceVersion: import("effect/Schema").Literal<1>;
                readonly createdBy: import("effect/Schema").String;
                readonly spec: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly schemaVersion: import("effect/Schema").Literal<1>;
                    readonly columns: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                        readonly id: import("effect/Schema").String;
                        readonly label: import("effect/Schema").String;
                        readonly metricId: import("effect/Schema").String;
                        readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                        readonly parameters: import("effect/Schema").optionalKey<import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>>;
                        readonly format: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    }>>;
                    readonly sort: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                        readonly columnId: import("effect/Schema").String;
                        readonly direction: import("effect/Schema").Literals<readonly ["asc", "desc"]>;
                    }>>>;
                    readonly filters: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                        readonly columnId: import("effect/Schema").String;
                        readonly operator: import("effect/Schema").Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                        readonly value: import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>;
                    }>>>;
                    readonly highlights: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                        readonly id: import("effect/Schema").String;
                        readonly target: import("effect/Schema").Literals<readonly ["row", "column", "cell"]>;
                        readonly columnId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                        readonly when: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                            readonly columnId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                            readonly operator: import("effect/Schema").Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                            readonly value: import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>;
                        }>>;
                        readonly tone: import("effect/Schema").Literals<readonly ["red", "amber", "green", "blue", "purple", "gray"]>;
                    }>>>;
                    readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                }>>;
                readonly createdAt: import("effect/Schema").String;
                readonly updatedAt: import("effect/Schema").String;
            }>>;
        }>;
    }>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly dashboardRosterAIUsage: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly requestId: import("effect/Schema").String;
        readonly model: import("effect/Schema").Literal<"gpt-5.6-luna">;
        readonly usage: import("effect/Schema").Struct<{
            readonly inputTokens: import("effect/Schema").Number;
            readonly cachedInputTokens: import("effect/Schema").Number;
            readonly cacheWriteTokens: import("effect/Schema").Number;
            readonly outputTokens: import("effect/Schema").Number;
            readonly reasoningTokens: import("effect/Schema").Number;
        }>;
        readonly steps: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly inputTokens: import("effect/Schema").Number;
            readonly cachedInputTokens: import("effect/Schema").Number;
            readonly cacheWriteTokens: import("effect/Schema").Number;
            readonly outputTokens: import("effect/Schema").Number;
            readonly reasoningTokens: import("effect/Schema").Number;
        }>>;
    }>, import("effect/Schema").Void, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly serverGiveaway: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly giveawayId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly id: import("effect/Schema").String;
        readonly serverId: import("effect/Schema").String;
        readonly prize: import("effect/Schema").String;
        readonly channelId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly status: import("effect/Schema").Literals<readonly ["scheduled", "ongoing", "ended"]>;
        readonly start: import("effect/Schema").String;
        readonly end: import("effect/Schema").String;
        readonly winners: import("effect/Schema").Number;
        readonly mentions: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly textAboveEmbed: import("effect/Schema").String;
        readonly textInEmbed: import("effect/Schema").String;
        readonly textOnEnd: import("effect/Schema").String;
        readonly imageUrl: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly profilePictureRequired: import("effect/Schema").Boolean;
        readonly cocAccountRequired: import("effect/Schema").Boolean;
        readonly rolesMode: import("effect/Schema").Literals<readonly ["allow", "deny", "none"]>;
        readonly roles: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly boosters: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly value: import("effect/Schema").Number;
            readonly roles: import("effect/Schema").$Array<import("effect/Schema").String>;
        }>>;
        readonly entries: import("effect/Schema").$Array<import("effect/Schema").Union<readonly [import("effect/Schema").String, import("effect/Schema").Struct<{
            readonly user_id: import("effect/Schema").String;
        }>]>>;
        readonly winnersList: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly userId: import("effect/Schema").String;
            readonly username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly avatarUrl: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly inServer: import("effect/Schema").Boolean;
            readonly status: import("effect/Schema").Literals<readonly ["winner", "rerolled"]>;
            readonly timestamp: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly reason: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
        readonly updated: import("effect/Schema").Boolean;
        readonly messageId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly eventPending: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly eventPendingAt: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly createdAt: import("effect/Schema").String;
        readonly updatedAt: import("effect/Schema").String;
    }>, readonly []>;
    readonly serverDiscordTest: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly status: import("effect/Schema").Literals<readonly ["success", "error"]>;
        readonly message: import("effect/Schema").String;
        readonly bot_token_present: import("effect/Schema").Boolean;
        readonly guild_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly status_code: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, readonly []>;
    readonly autoboardCapabilities: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly boardTypes: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly boardType: import("effect/Schema").String;
            readonly label: import("effect/Schema").String;
            readonly targetKind: import("effect/Schema").String;
            readonly minTargets: import("effect/Schema").Number;
            readonly maxTargets: import("effect/Schema").Number;
            readonly allowedScopes: import("effect/Schema").$Array<import("effect/Schema").Literals<readonly ["family", "custom"]>>;
            readonly allowedModes: import("effect/Schema").$Array<import("effect/Schema").Literals<readonly ["refresh", "send"]>>;
            readonly refreshInterval: import("effect/Schema").NullOr<import("effect/Schema").Struct<{
                readonly minMinutes: import("effect/Schema").Number;
                readonly maxMinutes: import("effect/Schema").Number;
                readonly defaultMinutes: import("effect/Schema").Number;
            }>>;
            readonly uiCapabilities: import("effect/Schema").$Array<import("effect/Schema").String>;
        }>>;
    }>, readonly []>;
    readonly serverAutoboards: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly boardType: import("effect/Schema").String;
            readonly targetKind: import("effect/Schema").String;
            readonly targetScope: import("effect/Schema").Literals<readonly ["family", "custom"]>;
            readonly targets: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly deliveryMode: import("effect/Schema").Literals<readonly ["refresh", "send"]>;
            readonly channelId: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly channelDeleted: import("effect/Schema").Boolean;
            readonly threadId: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly messageId: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly enabled: import("effect/Schema").Boolean;
            readonly intervalMinutes: import("effect/Schema").NullOr<import("effect/Schema").Number>;
            readonly schedule: import("effect/Schema").NullOr<import("effect/Schema").Struct<{
                readonly kind: import("effect/Schema").Literals<readonly ["daily", "weekdays", "day_of_month"]>;
                readonly timeOfDay: import("effect/Schema").String;
                readonly weekdays: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").$Array<import("effect/Schema").Number>>>;
                readonly dayOfMonth: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
            }>>;
            readonly nextRunAt: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly lastRunAt: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly createdAt: import("effect/Schema").String;
            readonly updatedAt: import("effect/Schema").String;
        }>>;
        readonly total: import("effect/Schema").Number;
        readonly refreshCount: import("effect/Schema").Number;
        readonly sendCount: import("effect/Schema").Number;
        readonly limit: import("effect/Schema").Number;
    }>, readonly []>;
    readonly createAutoboard: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly boardType: import("effect/Schema").String;
        readonly targetScope: import("effect/Schema").Literals<readonly ["family", "custom"]>;
        readonly targets: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly deliveryMode: import("effect/Schema").Literals<readonly ["refresh", "send"]>;
        readonly channelId: import("effect/Schema").String;
        readonly threadId: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly enabled: import("effect/Schema").Boolean;
        readonly intervalMinutes: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        readonly schedule: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literals<readonly ["daily", "weekdays", "day_of_month"]>;
            readonly timeOfDay: import("effect/Schema").String;
            readonly weekdays: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").$Array<import("effect/Schema").Number>>>;
            readonly dayOfMonth: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        }>>>;
    }>, import("effect/Schema").Struct<{
        readonly item: import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly boardType: import("effect/Schema").String;
            readonly targetKind: import("effect/Schema").String;
            readonly targetScope: import("effect/Schema").Literals<readonly ["family", "custom"]>;
            readonly targets: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly deliveryMode: import("effect/Schema").Literals<readonly ["refresh", "send"]>;
            readonly channelId: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly channelDeleted: import("effect/Schema").Boolean;
            readonly threadId: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly messageId: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly enabled: import("effect/Schema").Boolean;
            readonly intervalMinutes: import("effect/Schema").NullOr<import("effect/Schema").Number>;
            readonly schedule: import("effect/Schema").NullOr<import("effect/Schema").Struct<{
                readonly kind: import("effect/Schema").Literals<readonly ["daily", "weekdays", "day_of_month"]>;
                readonly timeOfDay: import("effect/Schema").String;
                readonly weekdays: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").$Array<import("effect/Schema").Number>>>;
                readonly dayOfMonth: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
            }>>;
            readonly nextRunAt: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly lastRunAt: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly createdAt: import("effect/Schema").String;
            readonly updatedAt: import("effect/Schema").String;
        }>;
    }>, readonly []>;
    readonly replaceAutoboard: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly autoboardId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly boardType: import("effect/Schema").String;
        readonly targetScope: import("effect/Schema").Literals<readonly ["family", "custom"]>;
        readonly targets: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly deliveryMode: import("effect/Schema").Literals<readonly ["refresh", "send"]>;
        readonly channelId: import("effect/Schema").String;
        readonly threadId: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly enabled: import("effect/Schema").Boolean;
        readonly intervalMinutes: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        readonly schedule: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literals<readonly ["daily", "weekdays", "day_of_month"]>;
            readonly timeOfDay: import("effect/Schema").String;
            readonly weekdays: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").$Array<import("effect/Schema").Number>>>;
            readonly dayOfMonth: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        }>>>;
    }>, import("effect/Schema").Struct<{
        readonly item: import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly boardType: import("effect/Schema").String;
            readonly targetKind: import("effect/Schema").String;
            readonly targetScope: import("effect/Schema").Literals<readonly ["family", "custom"]>;
            readonly targets: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly deliveryMode: import("effect/Schema").Literals<readonly ["refresh", "send"]>;
            readonly channelId: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly channelDeleted: import("effect/Schema").Boolean;
            readonly threadId: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly messageId: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly enabled: import("effect/Schema").Boolean;
            readonly intervalMinutes: import("effect/Schema").NullOr<import("effect/Schema").Number>;
            readonly schedule: import("effect/Schema").NullOr<import("effect/Schema").Struct<{
                readonly kind: import("effect/Schema").Literals<readonly ["daily", "weekdays", "day_of_month"]>;
                readonly timeOfDay: import("effect/Schema").String;
                readonly weekdays: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").$Array<import("effect/Schema").Number>>>;
                readonly dayOfMonth: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
            }>>;
            readonly nextRunAt: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly lastRunAt: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly createdAt: import("effect/Schema").String;
            readonly updatedAt: import("effect/Schema").String;
        }>;
    }>, readonly []>;
    readonly deleteAutoboard: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly autoboardId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly id: import("effect/Schema").String;
        readonly deleted: import("effect/Schema").Literal<true>;
    }>, readonly []>;
    readonly serverLeaderboards: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly limit_players: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly limit_clans: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly sort_by: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
        readonly total_players: import("effect/Schema").Number;
        readonly total_clans: import("effect/Schema").Number;
        readonly players: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly player_tag: import("effect/Schema").String;
            readonly player_name: import("effect/Schema").String;
            readonly townhall_level: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
            readonly clan_tag: import("effect/Schema").String;
            readonly clan_name: import("effect/Schema").String;
            readonly trophies: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
            readonly global_rank: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
            readonly local_rank: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
            readonly location_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly country_code: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly country_name: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly legend_trophies: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        }>>;
        readonly clans: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly clan_tag: import("effect/Schema").String;
            readonly clan_name: import("effect/Schema").String;
            readonly global_rank: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
            readonly local_rank: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
            readonly country_code: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly country_name: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly clan_level: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
            readonly clan_points: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
            readonly member_count: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
            readonly capital_points: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        }>>;
    }>, readonly []>;
    readonly dashboardBillingSubscription: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly provider: import("effect/Schema").Literal<"stripe">;
        readonly status: import("effect/Schema").String;
        readonly active: import("effect/Schema").Boolean;
        readonly checkoutEnabled: import("effect/Schema").Boolean;
        readonly bookmarkNotificationsLimit: import("effect/Schema").Number;
        readonly rosterAssistantMonthlyCreditUsd: import("effect/Schema").Number;
        readonly assignedServerId: import("effect/Schema").NullOr<import("effect/Schema").String>;
        readonly rosterAssistantSpentUsd: import("effect/Schema").Number;
        readonly rosterAssistantRemainingUsd: import("effect/Schema").Number;
    }>, readonly []>;
    readonly dashboardBillingCheckout: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly url: import("effect/Schema").String;
    }>, readonly []>;
    readonly dashboardBillingPortal: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly url: import("effect/Schema").String;
    }>, readonly []>;
    readonly dashboardBillingUsage: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly serverSpentUsd: import("effect/Schema").Number;
        readonly serverLimitUsd: import("effect/Schema").Number;
        readonly userSpentUsd: import("effect/Schema").Number;
        readonly userLimitUsd: import("effect/Schema").Number;
        readonly globalFreeAvailable: import("effect/Schema").Boolean;
        readonly subscriptionActive: import("effect/Schema").Boolean;
        readonly assignedSubscriberCount: import("effect/Schema").Number;
        readonly paidLimitUsd: import("effect/Schema").Number;
        readonly paidSpentUsd: import("effect/Schema").Number;
        readonly paidRemainingUsd: import("effect/Schema").Number;
        readonly resetsAt: import("effect/Schema").String;
    }>, readonly []>;
    readonly dashboardBillingAssignment: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").NullOr<import("effect/Schema").String>;
    }>, import("effect/Schema").Void, readonly []>;
    readonly dashboardLinksList: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly userId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly user_id: import("effect/Schema").String;
            readonly player_tag: import("effect/Schema").String;
            readonly order_index: import("effect/Schema").Number;
            readonly is_verified: import("effect/Schema").Boolean;
            readonly hidden: import("effect/Schema").Boolean;
            readonly added_at: import("effect/Schema").String;
            readonly verified_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly last_login: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        }>>;
    }>, readonly []>;
    readonly dashboardLinksAdd: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly userId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly player_tag: import("effect/Schema").String;
        readonly api_token: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly account: import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly townHallLevel: import("effect/Schema").Number;
            readonly is_verified: import("effect/Schema").Boolean;
            readonly hidden: import("effect/Schema").Boolean;
        }>;
    }>, readonly []>;
    readonly dashboardLinksRemove: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly userId: import("effect/Schema").String;
        readonly playerTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
    }>, readonly []>;
    readonly dashboardLinksVisibility: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly userId: import("effect/Schema").String;
        readonly playerTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly hidden: import("effect/Schema").Boolean;
    }>, import("effect/Schema").Struct<{
        readonly user_id: import("effect/Schema").String;
        readonly player_tag: import("effect/Schema").String;
        readonly order_index: import("effect/Schema").Number;
        readonly is_verified: import("effect/Schema").Boolean;
        readonly hidden: import("effect/Schema").Boolean;
        readonly added_at: import("effect/Schema").String;
        readonly verified_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly last_login: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
    }>, readonly []>;
    readonly dashboardLinksOrder: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly userId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly ordered_tags: import("effect/Schema").$Array<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
    }>, readonly []>;
    readonly dashboardClanSearch: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly query: import("effect/Schema").String;
        readonly locationIds: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Number>>;
        readonly warLeagueIds: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Number>>;
        readonly "clanLevel[min]": import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly "clanLevel[max]": import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly "members[min]": import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly "members[max]": import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly cursor: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly name: import("effect/Schema").String;
            readonly tag: import("effect/Schema").String;
            readonly badge: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly clanLevel: import("effect/Schema").Number;
            readonly location: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly isCountry: import("effect/Schema").Boolean;
                readonly countryCode: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly localizedName: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
            readonly warLeague: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
            }>>;
            readonly members: import("effect/Schema").Number;
        }>>;
        readonly pagination: import("effect/Schema").Struct<{
            readonly limit: import("effect/Schema").Number;
            readonly hasMore: import("effect/Schema").Boolean;
            readonly nextCursor: import("effect/Schema").NullOr<import("effect/Schema").String>;
        }>;
    }>, readonly []>;
    readonly dashboardCwlBonusRecipients: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly clanTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly season: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly playerTag: import("effect/Schema").String;
            readonly medalCount: import("effect/Schema").Number;
        }>>;
    }>, readonly []>;
    readonly dashboardReplaceCwlBonusRecipients: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly clanTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly season: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly recipients: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly playerTag: import("effect/Schema").String;
            readonly medalCount: import("effect/Schema").Number;
        }>>;
    }>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly playerTag: import("effect/Schema").String;
            readonly medalCount: import("effect/Schema").Number;
        }>>;
    }>, readonly []>;
    readonly dashboardSeasonDates: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly number_of_seasons: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly as_text: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").String>;
    }>, readonly []>;
    readonly dashboardRaidWeekendDates: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly number_of_weeks: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").String>;
    }>, readonly []>;
    readonly dashboardCurrentDates: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly season: import("effect/Schema").String;
        readonly raid: import("effect/Schema").String;
        readonly legend: import("effect/Schema").String;
        readonly "clan-games": import("effect/Schema").String;
    }>, readonly []>;
    readonly dashboardSeasonBounds: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly season: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly gold_pass_season: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly season_start: import("effect/Schema").String;
        readonly season_end: import("effect/Schema").String;
    }>, readonly []>;
    readonly dashboardSeasonRaidDates: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly season: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").String>;
    }>, readonly []>;
    readonly dashboardStaticCategoryNames: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly category: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly locale: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly village: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly type: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly category: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").$Array<import("effect/Schema").String>, readonly []>;
    readonly dashboardStaticMaxLevel: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly category: import("effect/Schema").String;
        readonly itemIdOrName: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly name: import("effect/Schema").String;
        readonly max_level: import("effect/Schema").Number;
    }>, readonly []>;
    readonly dashboardCdnUpload: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").FormData, import("effect/Schema").Struct<{
        readonly url: import("effect/Schema").String;
        readonly filename: import("effect/Schema").String;
    }>, readonly []>;
    readonly dashboardDiscohookResolve: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly url: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
        readonly payload: import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>;
    }>, import("effect/Schema").Struct<{
        readonly resolvedUrl: import("effect/Schema").String;
    }>]>, readonly []>;
    readonly dashboardCreateRoster: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly capacity: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly roster_role_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly max_accounts_per_user: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        readonly server_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly alias: import("effect/Schema").String;
        readonly description: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly roster_type: import("effect/Schema").Literals<readonly ["clan", "family"]>;
        readonly signup_scope: import("effect/Schema").Literals<readonly ["clan-only", "family-wide"]>;
        readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly group_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly members: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly member_group_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly is_substitute: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
            readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly tag: import("effect/Schema").String;
            readonly townhall: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly trophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly current_clan: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly current_clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly league_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly league_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly hero_level_sum: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly max_percent: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly war_pref: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
            readonly discord: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly discord_username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly discord_avatar_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly last_online: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly refreshed_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly answers: import("effect/Schema").optionalKey<import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>;
        }>>>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly roster_id: import("effect/Schema").String;
        readonly roster: import("effect/Schema").Struct<{
            readonly capacity: import("effect/Schema").Number;
            readonly roster_role_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly member_groups: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly position: import("effect/Schema").Number;
                readonly signup_enabled: import("effect/Schema").Boolean;
                readonly role_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
            }>>;
            readonly id: import("effect/Schema").String;
            readonly server_id: import("effect/Schema").String;
            readonly alias: import("effect/Schema").String;
            readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly roster_type: import("effect/Schema").Literals<readonly ["clan", "family"]>;
            readonly signup_scope: import("effect/Schema").Literals<readonly ["clan-only", "family-wide"]>;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly clan_name: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly clan_badge: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly group_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly member_group_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
                readonly is_substitute: import("effect/Schema").Boolean;
                readonly name: import("effect/Schema").String;
                readonly tag: import("effect/Schema").String;
                readonly townhall: import("effect/Schema").Number;
                readonly trophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly current_clan: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly current_clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly league_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly league_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly hero_level_sum: import("effect/Schema").Number;
                readonly max_percent: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly war_pref: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                readonly discord: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly discord_username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly discord_avatar_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly last_online: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly refreshed_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly hitrate: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
                readonly added_at: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                readonly last_updated: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                readonly is_in_family: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                readonly member_status: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly error_details: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                readonly answers: import("effect/Schema").optionalKey<import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>;
            }>>;
            readonly min_th: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly max_th: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly min_signups: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly max_accounts_per_user: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly columns: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly sort: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly columnId: import("effect/Schema").String;
                readonly direction: import("effect/Schema").Literals<readonly ["asc", "desc"]>;
            }>>;
            readonly webhook_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly message_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly image: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly event_start_time: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly recurrence_days: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly recurrence_day_of_month: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly signup_questions: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
                readonly type: import("effect/Schema").Literals<readonly ["text", "boolean", "single_select"]>;
                readonly required: import("effect/Schema").Boolean;
                readonly options: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
                readonly order: import("effect/Schema").Number;
            }>>>;
            readonly created_at: import("effect/Schema").String;
            readonly updated_at: import("effect/Schema").String;
            readonly revision: import("effect/Schema").Number;
        }>;
    }>, readonly []>;
    readonly dashboardUpdateRoster: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly rosterId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly capacity: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly roster_role_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly alias: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly description: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly roster_type: import("effect/Schema").optionalKey<import("effect/Schema").Literals<readonly ["clan", "family"]>>;
        readonly signup_scope: import("effect/Schema").optionalKey<import("effect/Schema").Literals<readonly ["clan-only", "family-wide"]>>;
        readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly group_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly min_th: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        readonly max_th: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        readonly min_signups: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        readonly max_accounts_per_user: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        readonly columns: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
        readonly sort: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly columnId: import("effect/Schema").String;
            readonly direction: import("effect/Schema").Literals<readonly ["asc", "desc"]>;
        }>>>;
        readonly webhook_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly message_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly image: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly event_start_time: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        readonly recurrence_days: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        readonly recurrence_day_of_month: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        readonly signup_questions: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly label: import("effect/Schema").String;
            readonly type: import("effect/Schema").Literals<readonly ["text", "boolean", "single_select"]>;
            readonly required: import("effect/Schema").Boolean;
            readonly options: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
            readonly order: import("effect/Schema").Number;
        }>>>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly roster: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly capacity: import("effect/Schema").Number;
            readonly roster_role_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly member_groups: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly position: import("effect/Schema").Number;
                readonly signup_enabled: import("effect/Schema").Boolean;
                readonly role_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
            }>>;
            readonly id: import("effect/Schema").String;
            readonly server_id: import("effect/Schema").String;
            readonly alias: import("effect/Schema").String;
            readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly roster_type: import("effect/Schema").Literals<readonly ["clan", "family"]>;
            readonly signup_scope: import("effect/Schema").Literals<readonly ["clan-only", "family-wide"]>;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly clan_name: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly clan_badge: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly group_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly member_group_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
                readonly is_substitute: import("effect/Schema").Boolean;
                readonly name: import("effect/Schema").String;
                readonly tag: import("effect/Schema").String;
                readonly townhall: import("effect/Schema").Number;
                readonly trophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly current_clan: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly current_clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly league_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly league_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly hero_level_sum: import("effect/Schema").Number;
                readonly max_percent: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly war_pref: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                readonly discord: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly discord_username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly discord_avatar_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly last_online: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly refreshed_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly hitrate: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
                readonly added_at: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                readonly last_updated: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                readonly is_in_family: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                readonly member_status: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly error_details: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                readonly answers: import("effect/Schema").optionalKey<import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>;
            }>>;
            readonly min_th: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly max_th: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly min_signups: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly max_accounts_per_user: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly columns: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly sort: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly columnId: import("effect/Schema").String;
                readonly direction: import("effect/Schema").Literals<readonly ["asc", "desc"]>;
            }>>;
            readonly webhook_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly message_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly image: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly event_start_time: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly recurrence_days: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly recurrence_day_of_month: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly signup_questions: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
                readonly type: import("effect/Schema").Literals<readonly ["text", "boolean", "single_select"]>;
                readonly required: import("effect/Schema").Boolean;
                readonly options: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
                readonly order: import("effect/Schema").Number;
            }>>>;
            readonly created_at: import("effect/Schema").String;
            readonly updated_at: import("effect/Schema").String;
            readonly revision: import("effect/Schema").Number;
        }>>;
    }>, readonly []>;
    readonly dashboardGetRoster: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly rosterId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly roster: import("effect/Schema").Struct<{
            readonly capacity: import("effect/Schema").Number;
            readonly roster_role_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly member_groups: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly position: import("effect/Schema").Number;
                readonly signup_enabled: import("effect/Schema").Boolean;
                readonly role_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
            }>>;
            readonly id: import("effect/Schema").String;
            readonly server_id: import("effect/Schema").String;
            readonly alias: import("effect/Schema").String;
            readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly roster_type: import("effect/Schema").Literals<readonly ["clan", "family"]>;
            readonly signup_scope: import("effect/Schema").Literals<readonly ["clan-only", "family-wide"]>;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly clan_name: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly clan_badge: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly group_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly member_group_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
                readonly is_substitute: import("effect/Schema").Boolean;
                readonly name: import("effect/Schema").String;
                readonly tag: import("effect/Schema").String;
                readonly townhall: import("effect/Schema").Number;
                readonly trophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly current_clan: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly current_clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly league_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly league_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly hero_level_sum: import("effect/Schema").Number;
                readonly max_percent: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly war_pref: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                readonly discord: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly discord_username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly discord_avatar_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly last_online: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly refreshed_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly hitrate: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
                readonly added_at: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                readonly last_updated: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                readonly is_in_family: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                readonly member_status: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly error_details: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                readonly answers: import("effect/Schema").optionalKey<import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>;
            }>>;
            readonly min_th: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly max_th: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly min_signups: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly max_accounts_per_user: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly columns: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly sort: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly columnId: import("effect/Schema").String;
                readonly direction: import("effect/Schema").Literals<readonly ["asc", "desc"]>;
            }>>;
            readonly webhook_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly message_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly image: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly event_start_time: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly recurrence_days: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly recurrence_day_of_month: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly signup_questions: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
                readonly type: import("effect/Schema").Literals<readonly ["text", "boolean", "single_select"]>;
                readonly required: import("effect/Schema").Boolean;
                readonly options: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
                readonly order: import("effect/Schema").Number;
            }>>>;
            readonly created_at: import("effect/Schema").String;
            readonly updated_at: import("effect/Schema").String;
            readonly revision: import("effect/Schema").Number;
        }>;
    }>, readonly []>;
    readonly dashboardDeleteRoster: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly rosterId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
        readonly members_only: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
    }>, readonly []>;
    readonly dashboardListRosters: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly group_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly rosters: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly capacity: import("effect/Schema").Number;
            readonly roster_role_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly member_groups: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly position: import("effect/Schema").Number;
                readonly signup_enabled: import("effect/Schema").Boolean;
                readonly role_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
            }>>;
            readonly id: import("effect/Schema").String;
            readonly server_id: import("effect/Schema").String;
            readonly alias: import("effect/Schema").String;
            readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly roster_type: import("effect/Schema").Literals<readonly ["clan", "family"]>;
            readonly signup_scope: import("effect/Schema").Literals<readonly ["clan-only", "family-wide"]>;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly clan_name: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly clan_badge: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly group_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly member_group_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
                readonly is_substitute: import("effect/Schema").Boolean;
                readonly name: import("effect/Schema").String;
                readonly tag: import("effect/Schema").String;
                readonly townhall: import("effect/Schema").Number;
                readonly trophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly current_clan: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly current_clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly league_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly league_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly hero_level_sum: import("effect/Schema").Number;
                readonly max_percent: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly war_pref: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                readonly discord: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly discord_username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly discord_avatar_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly last_online: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly refreshed_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly hitrate: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
                readonly added_at: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                readonly last_updated: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                readonly is_in_family: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                readonly member_status: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly error_details: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                readonly answers: import("effect/Schema").optionalKey<import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>;
            }>>;
            readonly min_th: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly max_th: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly min_signups: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly max_accounts_per_user: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly columns: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly sort: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly columnId: import("effect/Schema").String;
                readonly direction: import("effect/Schema").Literals<readonly ["asc", "desc"]>;
            }>>;
            readonly webhook_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly message_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly image: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly event_start_time: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly recurrence_days: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly recurrence_day_of_month: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly signup_questions: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
                readonly type: import("effect/Schema").Literals<readonly ["text", "boolean", "single_select"]>;
                readonly required: import("effect/Schema").Boolean;
                readonly options: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
                readonly order: import("effect/Schema").Number;
            }>>>;
            readonly created_at: import("effect/Schema").String;
            readonly updated_at: import("effect/Schema").String;
            readonly revision: import("effect/Schema").Number;
        }>>;
        readonly count: import("effect/Schema").Number;
    }>, readonly []>;
    readonly dashboardCloneRoster: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly rosterId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly new_alias: import("effect/Schema").String;
        readonly copy_members: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly new_roster_id: import("effect/Schema").String;
        readonly new_alias: import("effect/Schema").String;
        readonly target_server_id: import("effect/Schema").String;
        readonly source_server_id: import("effect/Schema").String;
        readonly members_copied: import("effect/Schema").Number;
        readonly roster: import("effect/Schema").Struct<{
            readonly capacity: import("effect/Schema").Number;
            readonly roster_role_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly member_groups: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly position: import("effect/Schema").Number;
                readonly signup_enabled: import("effect/Schema").Boolean;
                readonly role_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
            }>>;
            readonly id: import("effect/Schema").String;
            readonly server_id: import("effect/Schema").String;
            readonly alias: import("effect/Schema").String;
            readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly roster_type: import("effect/Schema").Literals<readonly ["clan", "family"]>;
            readonly signup_scope: import("effect/Schema").Literals<readonly ["clan-only", "family-wide"]>;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly clan_name: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly clan_badge: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly group_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly member_group_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
                readonly is_substitute: import("effect/Schema").Boolean;
                readonly name: import("effect/Schema").String;
                readonly tag: import("effect/Schema").String;
                readonly townhall: import("effect/Schema").Number;
                readonly trophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly current_clan: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly current_clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly league_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly league_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly hero_level_sum: import("effect/Schema").Number;
                readonly max_percent: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly war_pref: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                readonly discord: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly discord_username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly discord_avatar_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly last_online: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly refreshed_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly hitrate: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
                readonly added_at: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                readonly last_updated: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                readonly is_in_family: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                readonly member_status: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly error_details: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                readonly answers: import("effect/Schema").optionalKey<import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>;
            }>>;
            readonly min_th: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly max_th: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly min_signups: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly max_accounts_per_user: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly columns: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly sort: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly columnId: import("effect/Schema").String;
                readonly direction: import("effect/Schema").Literals<readonly ["asc", "desc"]>;
            }>>;
            readonly webhook_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly message_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly image: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly event_start_time: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly recurrence_days: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly recurrence_day_of_month: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly signup_questions: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
                readonly type: import("effect/Schema").Literals<readonly ["text", "boolean", "single_select"]>;
                readonly required: import("effect/Schema").Boolean;
                readonly options: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
                readonly order: import("effect/Schema").Number;
            }>>>;
            readonly created_at: import("effect/Schema").String;
            readonly updated_at: import("effect/Schema").String;
            readonly revision: import("effect/Schema").Number;
        }>;
    }>, readonly []>;
    readonly dashboardRefreshRosters: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
        readonly group_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly roster_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly refreshed_rosters: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly capacity: import("effect/Schema").Number;
            readonly roster_role_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly member_groups: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly position: import("effect/Schema").Number;
                readonly signup_enabled: import("effect/Schema").Boolean;
                readonly role_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
            }>>;
            readonly id: import("effect/Schema").String;
            readonly server_id: import("effect/Schema").String;
            readonly alias: import("effect/Schema").String;
            readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly roster_type: import("effect/Schema").Literals<readonly ["clan", "family"]>;
            readonly signup_scope: import("effect/Schema").Literals<readonly ["clan-only", "family-wide"]>;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly clan_name: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly clan_badge: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly group_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly member_group_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
                readonly is_substitute: import("effect/Schema").Boolean;
                readonly name: import("effect/Schema").String;
                readonly tag: import("effect/Schema").String;
                readonly townhall: import("effect/Schema").Number;
                readonly trophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly current_clan: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly current_clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly league_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly league_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly hero_level_sum: import("effect/Schema").Number;
                readonly max_percent: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly war_pref: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                readonly discord: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly discord_username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly discord_avatar_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly last_online: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly refreshed_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly hitrate: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
                readonly added_at: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                readonly last_updated: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                readonly is_in_family: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                readonly member_status: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly error_details: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                readonly answers: import("effect/Schema").optionalKey<import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>;
            }>>;
            readonly min_th: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly max_th: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly min_signups: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly max_accounts_per_user: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly columns: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly sort: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly columnId: import("effect/Schema").String;
                readonly direction: import("effect/Schema").Literals<readonly ["asc", "desc"]>;
            }>>;
            readonly webhook_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly message_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly image: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly event_start_time: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly recurrence_days: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly recurrence_day_of_month: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly signup_questions: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
                readonly type: import("effect/Schema").Literals<readonly ["text", "boolean", "single_select"]>;
                readonly required: import("effect/Schema").Boolean;
                readonly options: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
                readonly order: import("effect/Schema").Number;
            }>>>;
            readonly created_at: import("effect/Schema").String;
            readonly updated_at: import("effect/Schema").String;
            readonly revision: import("effect/Schema").Number;
        }>>;
    }>, readonly []>;
    readonly dashboardManageRosterMembers: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly rosterId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly members: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly member_group_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly is_substitute: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
            readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly tag: import("effect/Schema").String;
            readonly townhall: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly trophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly current_clan: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly current_clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly league_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly league_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly hero_level_sum: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly max_percent: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly war_pref: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
            readonly discord: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly discord_username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly discord_avatar_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly last_online: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly refreshed_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly answers: import("effect/Schema").optionalKey<import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>;
        }>>>;
        readonly add: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly member_group_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly is_substitute: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
            readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly tag: import("effect/Schema").String;
            readonly townhall: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly trophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly current_clan: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly current_clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly league_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly league_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly hero_level_sum: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly max_percent: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly war_pref: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
            readonly discord: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly discord_username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly discord_avatar_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly last_online: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly refreshed_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly answers: import("effect/Schema").optionalKey<import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>;
        }>>>;
        readonly operation: import("effect/Schema").optionalKey<import("effect/Schema").Literals<readonly ["add", "remove", "update"]>>;
        readonly player_tags: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
    }>, readonly []>;
    readonly dashboardUpdateRosterMember: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly rosterId: import("effect/Schema").String;
        readonly memberTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly member_group_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly is_substitute: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        readonly answers: import("effect/Schema").optionalKey<import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
    }>, readonly []>;
    readonly dashboardRemoveRosterMember: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly rosterId: import("effect/Schema").String;
        readonly memberTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
    }>, readonly []>;
    readonly dashboardRefreshRosterMember: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly rosterId: import("effect/Schema").String;
        readonly memberTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly member: import("effect/Schema").Struct<{
            readonly member_group_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly is_substitute: import("effect/Schema").Boolean;
            readonly name: import("effect/Schema").String;
            readonly tag: import("effect/Schema").String;
            readonly townhall: import("effect/Schema").Number;
            readonly trophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly current_clan: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly current_clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly league_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly league_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly hero_level_sum: import("effect/Schema").Number;
            readonly max_percent: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly war_pref: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
            readonly discord: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly discord_username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly discord_avatar_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly last_online: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly refreshed_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly hitrate: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
            readonly added_at: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly last_updated: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly is_in_family: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
            readonly member_status: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly error_details: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly answers: import("effect/Schema").optionalKey<import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>;
        }>;
    }>, readonly []>;
    readonly dashboardMissingRosterMembers: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
        readonly roster_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly group_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly query_type: import("effect/Schema").Literals<readonly ["roster", "group"]>;
        readonly query_value: import("effect/Schema").String;
        readonly results: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly state: import("effect/Schema").Literals<readonly ["ok", "error"]>;
            readonly roster_info: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly roster_id: import("effect/Schema").String;
                readonly alias: import("effect/Schema").String;
                readonly clan_tag: import("effect/Schema").String;
                readonly clan_name: import("effect/Schema").String;
                readonly registered_count: import("effect/Schema").Number;
            }>>;
            readonly missing_members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly townhall: import("effect/Schema").Number;
                readonly role: import("effect/Schema").String;
                readonly trophies: import("effect/Schema").Number;
                readonly discord: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
            readonly summary: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly total_missing: import("effect/Schema").Number;
                readonly total_clan_members: import("effect/Schema").Number;
                readonly coverage_percentage: import("effect/Schema").Number;
            }>>;
            readonly error_message: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
        readonly total_rosters_checked: import("effect/Schema").Number;
    }>, readonly []>;
    readonly dashboardServerClanMembers: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly clan_tag: import("effect/Schema").String;
            readonly clan_name: import("effect/Schema").String;
            readonly townhall: import("effect/Schema").Number;
            readonly role: import("effect/Schema").String;
            readonly trophies: import("effect/Schema").Number;
        }>>;
        readonly count: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, readonly []>;
    readonly dashboardCreateRosterGroup: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly alias: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly description: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly max_accounts_per_user: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        readonly min_signups: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly group_id: import("effect/Schema").String;
        readonly group: import("effect/Schema").Struct<{
            readonly group_id: import("effect/Schema").String;
            readonly server_id: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly alias: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly description: import("effect/Schema").String;
            readonly max_accounts_per_user: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly min_signups: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly rosters: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly capacity: import("effect/Schema").Number;
                readonly roster_role_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
                readonly member_groups: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly id: import("effect/Schema").String;
                    readonly name: import("effect/Schema").String;
                    readonly position: import("effect/Schema").Number;
                    readonly signup_enabled: import("effect/Schema").Boolean;
                    readonly role_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
                }>>;
                readonly id: import("effect/Schema").String;
                readonly server_id: import("effect/Schema").String;
                readonly alias: import("effect/Schema").String;
                readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly roster_type: import("effect/Schema").Literals<readonly ["clan", "family"]>;
                readonly signup_scope: import("effect/Schema").Literals<readonly ["clan-only", "family-wide"]>;
                readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly clan_name: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                readonly clan_badge: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                readonly group_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly member_group_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
                    readonly is_substitute: import("effect/Schema").Boolean;
                    readonly name: import("effect/Schema").String;
                    readonly tag: import("effect/Schema").String;
                    readonly townhall: import("effect/Schema").Number;
                    readonly trophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                    readonly current_clan: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly current_clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly league_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                    readonly league_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly hero_level_sum: import("effect/Schema").Number;
                    readonly max_percent: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                    readonly war_pref: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                    readonly discord: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly discord_username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly discord_avatar_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly last_online: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly refreshed_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly hitrate: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
                    readonly added_at: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                    readonly last_updated: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                    readonly is_in_family: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                    readonly member_status: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly error_details: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                    readonly answers: import("effect/Schema").optionalKey<import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>;
                }>>;
                readonly min_th: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly max_th: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly min_signups: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly max_accounts_per_user: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly columns: import("effect/Schema").$Array<import("effect/Schema").String>;
                readonly sort: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly columnId: import("effect/Schema").String;
                    readonly direction: import("effect/Schema").Literals<readonly ["asc", "desc"]>;
                }>>;
                readonly webhook_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly message_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly image: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly event_start_time: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly recurrence_days: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly recurrence_day_of_month: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly signup_questions: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly id: import("effect/Schema").String;
                    readonly label: import("effect/Schema").String;
                    readonly type: import("effect/Schema").Literals<readonly ["text", "boolean", "single_select"]>;
                    readonly required: import("effect/Schema").Boolean;
                    readonly options: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
                    readonly order: import("effect/Schema").Number;
                }>>>;
                readonly created_at: import("effect/Schema").String;
                readonly updated_at: import("effect/Schema").String;
                readonly revision: import("effect/Schema").Number;
            }>>>;
            readonly created_at: import("effect/Schema").String;
            readonly updated_at: import("effect/Schema").String;
        }>;
    }>, readonly []>;
    readonly dashboardListRosterGroups: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly group_id: import("effect/Schema").String;
            readonly server_id: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly alias: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly description: import("effect/Schema").String;
            readonly max_accounts_per_user: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly min_signups: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly rosters: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly capacity: import("effect/Schema").Number;
                readonly roster_role_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
                readonly member_groups: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly id: import("effect/Schema").String;
                    readonly name: import("effect/Schema").String;
                    readonly position: import("effect/Schema").Number;
                    readonly signup_enabled: import("effect/Schema").Boolean;
                    readonly role_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
                }>>;
                readonly id: import("effect/Schema").String;
                readonly server_id: import("effect/Schema").String;
                readonly alias: import("effect/Schema").String;
                readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly roster_type: import("effect/Schema").Literals<readonly ["clan", "family"]>;
                readonly signup_scope: import("effect/Schema").Literals<readonly ["clan-only", "family-wide"]>;
                readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly clan_name: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                readonly clan_badge: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                readonly group_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly member_group_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
                    readonly is_substitute: import("effect/Schema").Boolean;
                    readonly name: import("effect/Schema").String;
                    readonly tag: import("effect/Schema").String;
                    readonly townhall: import("effect/Schema").Number;
                    readonly trophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                    readonly current_clan: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly current_clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly league_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                    readonly league_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly hero_level_sum: import("effect/Schema").Number;
                    readonly max_percent: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                    readonly war_pref: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                    readonly discord: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly discord_username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly discord_avatar_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly last_online: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly refreshed_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly hitrate: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
                    readonly added_at: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                    readonly last_updated: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                    readonly is_in_family: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                    readonly member_status: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly error_details: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                    readonly answers: import("effect/Schema").optionalKey<import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>;
                }>>;
                readonly min_th: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly max_th: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly min_signups: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly max_accounts_per_user: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly columns: import("effect/Schema").$Array<import("effect/Schema").String>;
                readonly sort: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly columnId: import("effect/Schema").String;
                    readonly direction: import("effect/Schema").Literals<readonly ["asc", "desc"]>;
                }>>;
                readonly webhook_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly message_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly image: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly event_start_time: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly recurrence_days: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly recurrence_day_of_month: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly signup_questions: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly id: import("effect/Schema").String;
                    readonly label: import("effect/Schema").String;
                    readonly type: import("effect/Schema").Literals<readonly ["text", "boolean", "single_select"]>;
                    readonly required: import("effect/Schema").Boolean;
                    readonly options: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
                    readonly order: import("effect/Schema").Number;
                }>>>;
                readonly created_at: import("effect/Schema").String;
                readonly updated_at: import("effect/Schema").String;
                readonly revision: import("effect/Schema").Number;
            }>>>;
            readonly created_at: import("effect/Schema").String;
            readonly updated_at: import("effect/Schema").String;
        }>>;
        readonly count: import("effect/Schema").Number;
    }>, readonly []>;
    readonly dashboardGetRosterGroup: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly groupId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly group: import("effect/Schema").Struct<{
            readonly group_id: import("effect/Schema").String;
            readonly server_id: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly alias: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly description: import("effect/Schema").String;
            readonly max_accounts_per_user: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly min_signups: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly rosters: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly capacity: import("effect/Schema").Number;
                readonly roster_role_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
                readonly member_groups: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly id: import("effect/Schema").String;
                    readonly name: import("effect/Schema").String;
                    readonly position: import("effect/Schema").Number;
                    readonly signup_enabled: import("effect/Schema").Boolean;
                    readonly role_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
                }>>;
                readonly id: import("effect/Schema").String;
                readonly server_id: import("effect/Schema").String;
                readonly alias: import("effect/Schema").String;
                readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly roster_type: import("effect/Schema").Literals<readonly ["clan", "family"]>;
                readonly signup_scope: import("effect/Schema").Literals<readonly ["clan-only", "family-wide"]>;
                readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly clan_name: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                readonly clan_badge: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                readonly group_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly member_group_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
                    readonly is_substitute: import("effect/Schema").Boolean;
                    readonly name: import("effect/Schema").String;
                    readonly tag: import("effect/Schema").String;
                    readonly townhall: import("effect/Schema").Number;
                    readonly trophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                    readonly current_clan: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly current_clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly league_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                    readonly league_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly hero_level_sum: import("effect/Schema").Number;
                    readonly max_percent: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                    readonly war_pref: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                    readonly discord: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly discord_username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly discord_avatar_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly last_online: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly refreshed_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly hitrate: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
                    readonly added_at: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                    readonly last_updated: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                    readonly is_in_family: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                    readonly member_status: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly error_details: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                    readonly answers: import("effect/Schema").optionalKey<import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>;
                }>>;
                readonly min_th: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly max_th: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly min_signups: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly max_accounts_per_user: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly columns: import("effect/Schema").$Array<import("effect/Schema").String>;
                readonly sort: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly columnId: import("effect/Schema").String;
                    readonly direction: import("effect/Schema").Literals<readonly ["asc", "desc"]>;
                }>>;
                readonly webhook_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly message_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly image: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly event_start_time: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly recurrence_days: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly recurrence_day_of_month: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly signup_questions: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly id: import("effect/Schema").String;
                    readonly label: import("effect/Schema").String;
                    readonly type: import("effect/Schema").Literals<readonly ["text", "boolean", "single_select"]>;
                    readonly required: import("effect/Schema").Boolean;
                    readonly options: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
                    readonly order: import("effect/Schema").Number;
                }>>>;
                readonly created_at: import("effect/Schema").String;
                readonly updated_at: import("effect/Schema").String;
                readonly revision: import("effect/Schema").Number;
            }>>>;
            readonly created_at: import("effect/Schema").String;
            readonly updated_at: import("effect/Schema").String;
        }>;
    }>, readonly []>;
    readonly dashboardUpdateRosterGroup: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly groupId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly alias: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly description: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly max_accounts_per_user: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        readonly min_signups: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly group: import("effect/Schema").Struct<{
            readonly group_id: import("effect/Schema").String;
            readonly server_id: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly alias: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly description: import("effect/Schema").String;
            readonly max_accounts_per_user: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly min_signups: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly rosters: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly capacity: import("effect/Schema").Number;
                readonly roster_role_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
                readonly member_groups: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly id: import("effect/Schema").String;
                    readonly name: import("effect/Schema").String;
                    readonly position: import("effect/Schema").Number;
                    readonly signup_enabled: import("effect/Schema").Boolean;
                    readonly role_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
                }>>;
                readonly id: import("effect/Schema").String;
                readonly server_id: import("effect/Schema").String;
                readonly alias: import("effect/Schema").String;
                readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly roster_type: import("effect/Schema").Literals<readonly ["clan", "family"]>;
                readonly signup_scope: import("effect/Schema").Literals<readonly ["clan-only", "family-wide"]>;
                readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly clan_name: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                readonly clan_badge: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                readonly group_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly member_group_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
                    readonly is_substitute: import("effect/Schema").Boolean;
                    readonly name: import("effect/Schema").String;
                    readonly tag: import("effect/Schema").String;
                    readonly townhall: import("effect/Schema").Number;
                    readonly trophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                    readonly current_clan: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly current_clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly league_id: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                    readonly league_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly hero_level_sum: import("effect/Schema").Number;
                    readonly max_percent: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                    readonly war_pref: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                    readonly discord: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly discord_username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly discord_avatar_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly last_online: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly refreshed_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly hitrate: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
                    readonly added_at: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                    readonly last_updated: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                    readonly is_in_family: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                    readonly member_status: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly error_details: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                    readonly answers: import("effect/Schema").optionalKey<import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>;
                }>>;
                readonly min_th: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly max_th: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly min_signups: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly max_accounts_per_user: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly columns: import("effect/Schema").$Array<import("effect/Schema").String>;
                readonly sort: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly columnId: import("effect/Schema").String;
                    readonly direction: import("effect/Schema").Literals<readonly ["asc", "desc"]>;
                }>>;
                readonly webhook_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly message_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly image: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly event_start_time: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly recurrence_days: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly recurrence_day_of_month: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly signup_questions: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly id: import("effect/Schema").String;
                    readonly label: import("effect/Schema").String;
                    readonly type: import("effect/Schema").Literals<readonly ["text", "boolean", "single_select"]>;
                    readonly required: import("effect/Schema").Boolean;
                    readonly options: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
                    readonly order: import("effect/Schema").Number;
                }>>>;
                readonly created_at: import("effect/Schema").String;
                readonly updated_at: import("effect/Schema").String;
                readonly revision: import("effect/Schema").Number;
            }>>>;
            readonly created_at: import("effect/Schema").String;
            readonly updated_at: import("effect/Schema").String;
        }>;
    }>, readonly []>;
    readonly dashboardDeleteRosterGroup: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly groupId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly affected_rosters: import("effect/Schema").Number;
    }>, readonly []>;
    readonly dashboardCreateRosterAutomation: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly roster_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly group_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly action_type: import("effect/Schema").String;
        readonly trigger_type: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly scheduled_at: import("effect/Schema").String;
        readonly discord_channel_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly options: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly ping_type: import("effect/Schema").optionalKey<import("effect/Schema").Literals<readonly ["signup_reminder", "missing"]>>;
        }>>;
        readonly active: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly automation_id: import("effect/Schema").String;
        readonly rule: import("effect/Schema").Struct<{
            readonly automation_id: import("effect/Schema").String;
            readonly server_id: import("effect/Schema").String;
            readonly roster_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly group_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly action_type: import("effect/Schema").String;
            readonly trigger_type: import("effect/Schema").String;
            readonly scheduled_at: import("effect/Schema").String;
            readonly discord_channel_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly options: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly ping_type: import("effect/Schema").optionalKey<import("effect/Schema").Literals<readonly ["signup_reminder", "missing"]>>;
            }>>;
            readonly active: import("effect/Schema").Boolean;
            readonly executed: import("effect/Schema").Boolean;
            readonly executed_at: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly last_triggered_at: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly execution_status: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly last_missed_at: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly created_at: import("effect/Schema").String;
            readonly updated_at: import("effect/Schema").String;
        }>;
    }>, readonly []>;
    readonly dashboardListRosterAutomations: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
        readonly roster_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly group_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly active_only: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly automation_id: import("effect/Schema").String;
            readonly server_id: import("effect/Schema").String;
            readonly roster_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly group_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly action_type: import("effect/Schema").String;
            readonly trigger_type: import("effect/Schema").String;
            readonly scheduled_at: import("effect/Schema").String;
            readonly discord_channel_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly options: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly ping_type: import("effect/Schema").optionalKey<import("effect/Schema").Literals<readonly ["signup_reminder", "missing"]>>;
            }>>;
            readonly active: import("effect/Schema").Boolean;
            readonly executed: import("effect/Schema").Boolean;
            readonly executed_at: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly last_triggered_at: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly execution_status: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly last_missed_at: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly created_at: import("effect/Schema").String;
            readonly updated_at: import("effect/Schema").String;
        }>>;
        readonly rules: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly automation_id: import("effect/Schema").String;
            readonly server_id: import("effect/Schema").String;
            readonly roster_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly group_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly action_type: import("effect/Schema").String;
            readonly trigger_type: import("effect/Schema").String;
            readonly scheduled_at: import("effect/Schema").String;
            readonly discord_channel_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly options: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly ping_type: import("effect/Schema").optionalKey<import("effect/Schema").Literals<readonly ["signup_reminder", "missing"]>>;
            }>>;
            readonly active: import("effect/Schema").Boolean;
            readonly executed: import("effect/Schema").Boolean;
            readonly executed_at: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly last_triggered_at: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly execution_status: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly last_missed_at: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly created_at: import("effect/Schema").String;
            readonly updated_at: import("effect/Schema").String;
        }>>;
        readonly count: import("effect/Schema").Number;
        readonly server_id: import("effect/Schema").String;
        readonly roster_id: import("effect/Schema").String;
        readonly group_id: import("effect/Schema").String;
    }>, readonly []>;
    readonly dashboardUpdateRosterAutomation: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly automationId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly roster_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly group_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly action_type: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly trigger_type: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly scheduled_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly discord_channel_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly options: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly ping_type: import("effect/Schema").optionalKey<import("effect/Schema").Literals<readonly ["signup_reminder", "missing"]>>;
        }>>;
        readonly active: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly rule: import("effect/Schema").Struct<{
            readonly automation_id: import("effect/Schema").String;
            readonly server_id: import("effect/Schema").String;
            readonly roster_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly group_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly action_type: import("effect/Schema").String;
            readonly trigger_type: import("effect/Schema").String;
            readonly scheduled_at: import("effect/Schema").String;
            readonly discord_channel_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly options: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly ping_type: import("effect/Schema").optionalKey<import("effect/Schema").Literals<readonly ["signup_reminder", "missing"]>>;
            }>>;
            readonly active: import("effect/Schema").Boolean;
            readonly executed: import("effect/Schema").Boolean;
            readonly executed_at: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly last_triggered_at: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly execution_status: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly last_missed_at: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly created_at: import("effect/Schema").String;
            readonly updated_at: import("effect/Schema").String;
        }>;
    }>, readonly []>;
    readonly dashboardDeleteRosterAutomation: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly automationId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
    }>, readonly []>;
    readonly dashboardListRosterMetrics: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly label: import("effect/Schema").String;
            readonly valueType: import("effect/Schema").Literals<readonly ["string", "number", "boolean", "json", "time"]>;
            readonly kind: import("effect/Schema").Literals<readonly ["snapshot", "historical", "derived", "presentation"]>;
            readonly description: import("effect/Schema").String;
            readonly cacheTtlSeconds: import("effect/Schema").Number;
            readonly dependsOn: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
        }>>;
    }>, readonly []>;
    readonly dashboardQueryRosterMetric: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly rosterIds: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly metricId: import("effect/Schema").String;
        readonly parameters: import("effect/Schema").optionalKey<import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>>;
        readonly force: import("effect/Schema").Boolean;
    }>, import("effect/Schema").Struct<{
        readonly metricId: import("effect/Schema").String;
        readonly parameters: import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>;
        readonly rows: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly rosterId: import("effect/Schema").String;
            readonly playerTag: import("effect/Schema").String;
            readonly value: import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>;
        }>>;
        readonly cached: import("effect/Schema").Boolean;
        readonly evaluatedAt: import("effect/Schema").String;
    }>, readonly []>;
    readonly dashboardListRosterViews: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").$Array<import("effect/Schema").Struct<{
        readonly id: import("effect/Schema").String;
        readonly shareId: import("effect/Schema").String;
        readonly serverId: import("effect/Schema").String;
        readonly name: import("effect/Schema").String;
        readonly sourceCode: import("effect/Schema").String;
        readonly sourceVersion: import("effect/Schema").Literal<1>;
        readonly createdBy: import("effect/Schema").String;
        readonly spec: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly schemaVersion: import("effect/Schema").Literal<1>;
            readonly columns: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
                readonly metricId: import("effect/Schema").String;
                readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly parameters: import("effect/Schema").optionalKey<import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>>;
                readonly format: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
            readonly sort: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly columnId: import("effect/Schema").String;
                readonly direction: import("effect/Schema").Literals<readonly ["asc", "desc"]>;
            }>>>;
            readonly filters: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly columnId: import("effect/Schema").String;
                readonly operator: import("effect/Schema").Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                readonly value: import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>;
            }>>>;
            readonly highlights: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").String;
                readonly target: import("effect/Schema").Literals<readonly ["row", "column", "cell"]>;
                readonly columnId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly when: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly columnId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly operator: import("effect/Schema").Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                    readonly value: import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>;
                }>>;
                readonly tone: import("effect/Schema").Literals<readonly ["red", "amber", "green", "blue", "purple", "gray"]>;
            }>>>;
            readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        }>>;
        readonly createdAt: import("effect/Schema").String;
        readonly updatedAt: import("effect/Schema").String;
    }>>, readonly []>;
    readonly dashboardGetRosterView: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly viewId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly id: import("effect/Schema").String;
        readonly shareId: import("effect/Schema").String;
        readonly serverId: import("effect/Schema").String;
        readonly name: import("effect/Schema").String;
        readonly sourceCode: import("effect/Schema").String;
        readonly sourceVersion: import("effect/Schema").Literal<1>;
        readonly createdBy: import("effect/Schema").String;
        readonly spec: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly schemaVersion: import("effect/Schema").Literal<1>;
            readonly columns: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
                readonly metricId: import("effect/Schema").String;
                readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly parameters: import("effect/Schema").optionalKey<import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>>;
                readonly format: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
            readonly sort: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly columnId: import("effect/Schema").String;
                readonly direction: import("effect/Schema").Literals<readonly ["asc", "desc"]>;
            }>>>;
            readonly filters: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly columnId: import("effect/Schema").String;
                readonly operator: import("effect/Schema").Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                readonly value: import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>;
            }>>>;
            readonly highlights: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").String;
                readonly target: import("effect/Schema").Literals<readonly ["row", "column", "cell"]>;
                readonly columnId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly when: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly columnId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly operator: import("effect/Schema").Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                    readonly value: import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>;
                }>>;
                readonly tone: import("effect/Schema").Literals<readonly ["red", "amber", "green", "blue", "purple", "gray"]>;
            }>>>;
            readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        }>>;
        readonly createdAt: import("effect/Schema").String;
        readonly updatedAt: import("effect/Schema").String;
    }>, readonly []>;
    readonly dashboardResolveSharedRosterView: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly viewId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly id: import("effect/Schema").String;
        readonly shareId: import("effect/Schema").String;
        readonly serverId: import("effect/Schema").String;
        readonly name: import("effect/Schema").String;
        readonly sourceCode: import("effect/Schema").String;
        readonly sourceVersion: import("effect/Schema").Literal<1>;
        readonly createdBy: import("effect/Schema").String;
        readonly spec: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly schemaVersion: import("effect/Schema").Literal<1>;
            readonly columns: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
                readonly metricId: import("effect/Schema").String;
                readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly parameters: import("effect/Schema").optionalKey<import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>>;
                readonly format: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
            readonly sort: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly columnId: import("effect/Schema").String;
                readonly direction: import("effect/Schema").Literals<readonly ["asc", "desc"]>;
            }>>>;
            readonly filters: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly columnId: import("effect/Schema").String;
                readonly operator: import("effect/Schema").Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                readonly value: import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>;
            }>>>;
            readonly highlights: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").String;
                readonly target: import("effect/Schema").Literals<readonly ["row", "column", "cell"]>;
                readonly columnId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly when: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly columnId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly operator: import("effect/Schema").Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                    readonly value: import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>;
                }>>;
                readonly tone: import("effect/Schema").Literals<readonly ["red", "amber", "green", "blue", "purple", "gray"]>;
            }>>>;
            readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        }>>;
        readonly createdAt: import("effect/Schema").String;
        readonly updatedAt: import("effect/Schema").String;
    }>, readonly []>;
    readonly dashboardCreateRosterView: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly name: import("effect/Schema").String;
        readonly sourceCode: import("effect/Schema").String;
        readonly sourceVersion: import("effect/Schema").Literal<1>;
    }>, import("effect/Schema").Struct<{
        readonly id: import("effect/Schema").String;
        readonly shareId: import("effect/Schema").String;
        readonly serverId: import("effect/Schema").String;
        readonly name: import("effect/Schema").String;
        readonly sourceCode: import("effect/Schema").String;
        readonly sourceVersion: import("effect/Schema").Literal<1>;
        readonly createdBy: import("effect/Schema").String;
        readonly spec: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly schemaVersion: import("effect/Schema").Literal<1>;
            readonly columns: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
                readonly metricId: import("effect/Schema").String;
                readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly parameters: import("effect/Schema").optionalKey<import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>>;
                readonly format: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
            readonly sort: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly columnId: import("effect/Schema").String;
                readonly direction: import("effect/Schema").Literals<readonly ["asc", "desc"]>;
            }>>>;
            readonly filters: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly columnId: import("effect/Schema").String;
                readonly operator: import("effect/Schema").Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                readonly value: import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>;
            }>>>;
            readonly highlights: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").String;
                readonly target: import("effect/Schema").Literals<readonly ["row", "column", "cell"]>;
                readonly columnId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly when: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly columnId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly operator: import("effect/Schema").Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                    readonly value: import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>;
                }>>;
                readonly tone: import("effect/Schema").Literals<readonly ["red", "amber", "green", "blue", "purple", "gray"]>;
            }>>>;
            readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        }>>;
        readonly createdAt: import("effect/Schema").String;
        readonly updatedAt: import("effect/Schema").String;
    }>, readonly []>;
    readonly dashboardUpdateRosterView: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly viewId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly name: import("effect/Schema").String;
        readonly sourceCode: import("effect/Schema").String;
        readonly sourceVersion: import("effect/Schema").Literal<1>;
    }>, import("effect/Schema").Struct<{
        readonly id: import("effect/Schema").String;
        readonly shareId: import("effect/Schema").String;
        readonly serverId: import("effect/Schema").String;
        readonly name: import("effect/Schema").String;
        readonly sourceCode: import("effect/Schema").String;
        readonly sourceVersion: import("effect/Schema").Literal<1>;
        readonly createdBy: import("effect/Schema").String;
        readonly spec: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly schemaVersion: import("effect/Schema").Literal<1>;
            readonly columns: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
                readonly metricId: import("effect/Schema").String;
                readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly parameters: import("effect/Schema").optionalKey<import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>>;
                readonly format: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
            readonly sort: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly columnId: import("effect/Schema").String;
                readonly direction: import("effect/Schema").Literals<readonly ["asc", "desc"]>;
            }>>>;
            readonly filters: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly columnId: import("effect/Schema").String;
                readonly operator: import("effect/Schema").Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                readonly value: import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>;
            }>>>;
            readonly highlights: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").String;
                readonly target: import("effect/Schema").Literals<readonly ["row", "column", "cell"]>;
                readonly columnId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly when: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly columnId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly operator: import("effect/Schema").Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                    readonly value: import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>;
                }>>;
                readonly tone: import("effect/Schema").Literals<readonly ["red", "amber", "green", "blue", "purple", "gray"]>;
            }>>>;
            readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        }>>;
        readonly createdAt: import("effect/Schema").String;
        readonly updatedAt: import("effect/Schema").String;
    }>, readonly []>;
    readonly dashboardDeleteRosterView: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly viewId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Void, readonly []>;
    readonly dashboardPreviewRosterView: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly rosterIds: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly viewId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly name: import("effect/Schema").String;
        readonly sourceCode: import("effect/Schema").String;
        readonly sourceVersion: import("effect/Schema").Literal<1>;
        readonly columns: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly label: import("effect/Schema").String;
            readonly metricId: import("effect/Schema").String;
            readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly parameters: import("effect/Schema").optionalKey<import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>>;
            readonly format: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
        readonly filters: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly columnId: import("effect/Schema").String;
            readonly operator: import("effect/Schema").Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
            readonly value: import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>;
        }>>;
        readonly sort: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly columnId: import("effect/Schema").String;
            readonly direction: import("effect/Schema").Literals<readonly ["asc", "desc"]>;
        }>>;
        readonly highlights: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly target: import("effect/Schema").Literals<readonly ["row", "column", "cell"]>;
            readonly columnId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly when: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly columnId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly operator: import("effect/Schema").Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                readonly value: import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>;
            }>>;
            readonly tone: import("effect/Schema").Literals<readonly ["red", "amber", "green", "blue", "purple", "gray"]>;
        }>>;
        readonly limit: import("effect/Schema").NullOr<import("effect/Schema").Number>;
        readonly rows: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly rosterId: import("effect/Schema").String;
            readonly playerTag: import("effect/Schema").String;
            readonly values: import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>;
            readonly highlight: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        }>>>;
    }>, import("effect/Schema").Struct<{
        readonly view: import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly shareId: import("effect/Schema").String;
            readonly serverId: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly sourceCode: import("effect/Schema").String;
            readonly sourceVersion: import("effect/Schema").Literal<1>;
            readonly createdBy: import("effect/Schema").String;
            readonly spec: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly schemaVersion: import("effect/Schema").Literal<1>;
                readonly columns: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly id: import("effect/Schema").String;
                    readonly label: import("effect/Schema").String;
                    readonly metricId: import("effect/Schema").String;
                    readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly parameters: import("effect/Schema").optionalKey<import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>>;
                    readonly format: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
                readonly sort: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly columnId: import("effect/Schema").String;
                    readonly direction: import("effect/Schema").Literals<readonly ["asc", "desc"]>;
                }>>>;
                readonly filters: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly columnId: import("effect/Schema").String;
                    readonly operator: import("effect/Schema").Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                    readonly value: import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>;
                }>>>;
                readonly highlights: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly id: import("effect/Schema").String;
                    readonly target: import("effect/Schema").Literals<readonly ["row", "column", "cell"]>;
                    readonly columnId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly when: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                        readonly columnId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                        readonly operator: import("effect/Schema").Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                        readonly value: import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>;
                    }>>;
                    readonly tone: import("effect/Schema").Literals<readonly ["red", "amber", "green", "blue", "purple", "gray"]>;
                }>>>;
                readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            }>>;
            readonly createdAt: import("effect/Schema").String;
            readonly updatedAt: import("effect/Schema").String;
        }>;
        readonly result: import("effect/Schema").Struct<{
            readonly viewId: import("effect/Schema").String;
            readonly rosterIds: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly schemaVersion: import("effect/Schema").Literal<1>;
            readonly rows: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly rosterId: import("effect/Schema").String;
                readonly playerTag: import("effect/Schema").String;
                readonly values: import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>;
                readonly highlight: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            }>>;
            readonly cachedMetricIds: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly evaluatedAt: import("effect/Schema").String;
        }>;
    }>, readonly []>;
    readonly dashboardApplyRosterMembershipChanges: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly changes: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly action: import("effect/Schema").Literals<readonly ["add", "remove", "move"]>;
            readonly playerTag: import("effect/Schema").String;
            readonly fromRosterId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly toRosterId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly reason: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
        readonly expectedRevisions: import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{
        readonly applied: import("effect/Schema").Boolean;
        readonly changeCount: import("effect/Schema").Number;
        readonly revisions: import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Number>;
    }>, readonly []>;
    readonly dashboardRefreshRosterDiscordIdentity: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly rosterId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly playerTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly playerTag: import("effect/Schema").String;
        readonly discordUserId: import("effect/Schema").String;
        readonly discordUsername: import("effect/Schema").String;
        readonly discordAvatarUrl: import("effect/Schema").String;
    }>, readonly []>;
    readonly dashboardPublicRoster: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly publicShareId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly id: import("effect/Schema").String;
        readonly name: import("effect/Schema").String;
        readonly minTownhall: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        readonly maxTownhall: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly clanName: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly clanTag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly clanBadgeUrl: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly updatedAt: import("effect/Schema").String;
        readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly playerTag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly townhall: import("effect/Schema").Number;
            readonly refreshedAt: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly currentClanName: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly currentClanTag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
    }>, readonly []>;
    readonly dashboardCapabilities: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
        readonly full_access: import("effect/Schema").Boolean;
        readonly sections: import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Literals<readonly ["view", "manage"]>>;
    }>, readonly []>;
    readonly dashboardAccess: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
        readonly roles: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly color: import("effect/Schema").Number;
            readonly position: import("effect/Schema").Number;
        }>>;
        readonly grants: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly role_id: import("effect/Schema").String;
            readonly section: import("effect/Schema").String;
            readonly access_level: import("effect/Schema").Literals<readonly ["view", "manage"]>;
        }>>;
        readonly sections: import("effect/Schema").$Array<import("effect/Schema").String>;
    }>, readonly []>;
    readonly updateDashboardAccess: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly grants: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly role_id: import("effect/Schema").String;
            readonly section: import("effect/Schema").String;
            readonly access_level: import("effect/Schema").Literals<readonly ["view", "manage"]>;
        }>>;
    }>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
        readonly roles: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly color: import("effect/Schema").Number;
            readonly position: import("effect/Schema").Number;
        }>>;
        readonly grants: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly role_id: import("effect/Schema").String;
            readonly section: import("effect/Schema").String;
            readonly access_level: import("effect/Schema").Literals<readonly ["view", "manage"]>;
        }>>;
        readonly sections: import("effect/Schema").$Array<import("effect/Schema").String>;
    }>, readonly []>;
    readonly botGuildProfile: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly name: import("effect/Schema").String;
        readonly avatar_url: import("effect/Schema").NullOr<import("effect/Schema").String>;
        readonly banner_url: import("effect/Schema").NullOr<import("effect/Schema").String>;
        readonly bio: import("effect/Schema").String;
        readonly name_inherited: import("effect/Schema").Boolean;
        readonly avatar_inherited: import("effect/Schema").Boolean;
        readonly banner_inherited: import("effect/Schema").Boolean;
        readonly bio_inherited: import("effect/Schema").Boolean;
    }>, readonly []>;
    readonly updateBotGuildProfile: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly avatar: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly banner: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly bio: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly clear_name: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        readonly clear_avatar: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        readonly clear_banner: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        readonly clear_bio: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
    }>, import("effect/Schema").Struct<{
        readonly name: import("effect/Schema").String;
        readonly avatar_url: import("effect/Schema").NullOr<import("effect/Schema").String>;
        readonly banner_url: import("effect/Schema").NullOr<import("effect/Schema").String>;
        readonly bio: import("effect/Schema").String;
        readonly name_inherited: import("effect/Schema").Boolean;
        readonly avatar_inherited: import("effect/Schema").Boolean;
        readonly banner_inherited: import("effect/Schema").Boolean;
        readonly bio_inherited: import("effect/Schema").Boolean;
    }>, readonly []>;
    readonly dashboardGuilds: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").$Array<import("effect/Schema").Struct<{
        readonly id: import("effect/Schema").String;
        readonly name: import("effect/Schema").String;
        readonly icon: import("effect/Schema").NullOr<import("effect/Schema").String>;
        readonly owner: import("effect/Schema").Boolean;
        readonly permissions: import("effect/Schema").String;
        readonly role: import("effect/Schema").String;
        readonly features: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly has_bot: import("effect/Schema").Boolean;
        readonly member_count: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly delegated: import("effect/Schema").Boolean;
        readonly last_command_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly inactive: import("effect/Schema").Boolean;
    }>>, readonly []>;
    readonly dashboardGuild: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly guildId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly id: import("effect/Schema").String;
        readonly name: import("effect/Schema").String;
        readonly icon: import("effect/Schema").NullOr<import("effect/Schema").String>;
        readonly owner: import("effect/Schema").Boolean;
        readonly permissions: import("effect/Schema").String;
        readonly role: import("effect/Schema").String;
        readonly features: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly has_bot: import("effect/Schema").Boolean;
        readonly member_count: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly delegated: import("effect/Schema").Boolean;
        readonly last_command_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly inactive: import("effect/Schema").Boolean;
    }>, readonly []>;
    readonly reactivateServer: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
    }>, readonly []>;
    readonly serverSettings: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly clan_settings: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
        readonly server: import("effect/Schema").String;
        readonly name: import("effect/Schema").String;
        readonly require_api_token_when_linking: import("effect/Schema").Boolean;
        readonly embed_color: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly nickname_rule: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly non_family_nickname_rule: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly change_nickname: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        readonly flair_non_family: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        readonly auto_eval_nickname: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        readonly autoeval_triggers: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
        readonly autoeval_log: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly autoeval: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        readonly full_whitelist_role: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly autoboard_limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly tied: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        readonly family_label: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly link_parse: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly clan: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
            readonly army: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
            readonly player: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
            readonly base: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
            readonly show: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        }>>;
        readonly countdowns: import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").String>;
        readonly server_roles: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly server_id: import("effect/Schema").String;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly type: import("effect/Schema").Literals<readonly ["townhall", "builderhall", "league", "builder_league", "clan_role", "clan_category", "family", "achievement", "status"]>;
            readonly option: import("effect/Schema").String;
            readonly role_id: import("effect/Schema").String;
            readonly mode: import("effect/Schema").Literals<readonly ["both", "add", "remove"]>;
            readonly created_at: import("effect/Schema").String;
            readonly updated_at: import("effect/Schema").String;
        }>>;
        readonly clans: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly server_id: import("effect/Schema").String;
            readonly category: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly abbreviation: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>>;
    }>, readonly []>;
    readonly updateServerSettings: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly require_api_token_when_linking: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        readonly embed_color: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly nickname_rule: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly non_family_nickname_rule: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly change_nickname: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        readonly flair_non_family: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        readonly auto_eval_nickname: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        readonly autoeval_triggers: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
        readonly autoeval_log: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly autoeval: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        readonly full_whitelist_role: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly autoboard_limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly tied: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        readonly family_label: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly link_parse: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly clan: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
            readonly army: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
            readonly player: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
            readonly base: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
            readonly show: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        }>>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly server_id: import("effect/Schema").String;
        readonly updated_fields: import("effect/Schema").Number;
    }>, readonly []>;
    readonly serverClanSettings: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly clanTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
        readonly name: import("effect/Schema").String;
        readonly server_id: import("effect/Schema").String;
        readonly category: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly abbreviation: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, readonly []>;
    readonly updateServerClanSettings: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly clanTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly category: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly abbreviation: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly server_id: import("effect/Schema").String;
        readonly clan_tag: import("effect/Schema").String;
        readonly updated_fields: import("effect/Schema").Number;
        readonly category: import("effect/Schema").NullOr<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly serverId: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly position: import("effect/Schema").Number;
            readonly clanCount: import("effect/Schema").Number;
        }>>;
    }>, readonly []>;
    readonly serverClans: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").$Array<import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
        readonly name: import("effect/Schema").String;
        readonly badge_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly level: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly member_count: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly added_at: import("effect/Schema").String;
        readonly settings: import("effect/Schema").Struct<{
            readonly category: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly abbreviation: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>;
    }>>, readonly []>;
    readonly serverClansBasic: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").$Array<import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
        readonly name: import("effect/Schema").String;
    }>>, readonly []>;
    readonly addServerClan: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly server_id: import("effect/Schema").String;
        readonly clan_tag: import("effect/Schema").String;
        readonly clan_name: import("effect/Schema").String;
    }>, readonly []>;
    readonly removeServerClan: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly clanTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly server_id: import("effect/Schema").String;
        readonly clan_tag: import("effect/Schema").String;
        readonly deleted_count: import("effect/Schema").Number;
    }>, readonly []>;
    readonly updateServerEmbedColor: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly hexCode: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly server_id: import("effect/Schema").String;
        readonly embed_color: import("effect/Schema").Number;
    }>, readonly []>;
    readonly serverBans: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly user_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly VillageTag: import("effect/Schema").String;
            readonly VillageName: import("effect/Schema").String;
            readonly DateCreated: import("effect/Schema").String;
            readonly Notes: import("effect/Schema").String;
            readonly server: import("effect/Schema").String;
            readonly added_by: import("effect/Schema").String;
            readonly added_by_username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly added_by_avatar_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly edited_by: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly user: import("effect/Schema").String;
                readonly previous: import("effect/Schema").Struct<{
                    readonly reason: import("effect/Schema").String;
                }>;
            }>>;
            readonly image: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly town_hall: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly clan_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly current_role: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly trophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        }>>;
        readonly count: import("effect/Schema").Number;
    }>, readonly []>;
    readonly addServerBan: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly playerTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly user_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{
        readonly reason: import("effect/Schema").NullOr<import("effect/Schema").String>;
        readonly added_by: import("effect/Schema").String;
        readonly image: import("effect/Schema").NullOr<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{
        readonly status: import("effect/Schema").String;
        readonly player_tag: import("effect/Schema").String;
        readonly player_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly server_id: import("effect/Schema").String;
    }>, readonly []>;
    readonly removeServerBan: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly playerTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly user_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly status: import("effect/Schema").String;
        readonly player_tag: import("effect/Schema").String;
        readonly player_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly server_id: import("effect/Schema").String;
    }>, readonly []>;
    readonly searchBannedPlayers: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly guildId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly query: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
        }>>;
    }>, readonly []>;
    readonly serverStrikes: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly player_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly view_expired: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly strike_id: import("effect/Schema").String;
            readonly tag: import("effect/Schema").String;
            readonly server: import("effect/Schema").String;
            readonly reason: import("effect/Schema").String;
            readonly added_by: import("effect/Schema").String;
            readonly added_by_username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly added_by_avatar_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly strike_weight: import("effect/Schema").Number;
            readonly image: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly date_created: import("effect/Schema").String;
            readonly rollover_date: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly player_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly town_hall: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly clan_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly current_role: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly trophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        }>>;
        readonly count: import("effect/Schema").Number;
    }>, readonly []>;
    readonly addServerStrike: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly playerTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly reason: import("effect/Schema").String;
        readonly added_by: import("effect/Schema").String;
        readonly rollover_days: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly strike_weight: import("effect/Schema").Number;
        readonly image: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{
        readonly status: import("effect/Schema").String;
        readonly strike_id: import("effect/Schema").String;
        readonly player_tag: import("effect/Schema").String;
        readonly player_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly server_id: import("effect/Schema").String;
        readonly total_strikes: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly total_weight: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, readonly []>;
    readonly removeServerStrike: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly strikeId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly status: import("effect/Schema").String;
        readonly strike_id: import("effect/Schema").String;
        readonly player_tag: import("effect/Schema").String;
        readonly player_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly server_id: import("effect/Schema").String;
        readonly total_strikes: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly total_weight: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, readonly []>;
    readonly playerStrikeSummary: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly playerTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly player_tag: import("effect/Schema").String;
        readonly server_id: import("effect/Schema").String;
        readonly total_strikes: import("effect/Schema").Number;
        readonly total_weight: import("effect/Schema").Number;
        readonly strikes: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly strike_id: import("effect/Schema").String;
            readonly tag: import("effect/Schema").String;
            readonly server: import("effect/Schema").String;
            readonly reason: import("effect/Schema").String;
            readonly added_by: import("effect/Schema").String;
            readonly added_by_username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly added_by_avatar_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly strike_weight: import("effect/Schema").Number;
            readonly image: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly date_created: import("effect/Schema").String;
            readonly rollover_date: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly player_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly town_hall: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly clan_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly current_role: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly trophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        }>>;
    }>, readonly []>;
    readonly discordRoles: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
        readonly roles: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly color: import("effect/Schema").Number;
            readonly position: import("effect/Schema").Number;
            readonly managed: import("effect/Schema").Boolean;
            readonly mentionable: import("effect/Schema").Boolean;
        }>>;
        readonly count: import("effect/Schema").Number;
    }>, readonly []>;
    readonly roleSettings: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
        readonly auto_eval_status: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        readonly auto_eval_nickname: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        readonly autoeval_triggers: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
        readonly autoeval_log: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, readonly []>;
    readonly updateRoleSettings: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly auto_eval_status: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        readonly auto_eval_nickname: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        readonly autoeval_triggers: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
        readonly autoeval_log: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly server_id: import("effect/Schema").String;
    }>, readonly []>;
    readonly serverRoles: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly type: import("effect/Schema").optionalKey<import("effect/Schema").Literals<readonly ["townhall", "builderhall", "league", "builder_league", "clan_role", "clan_category", "family", "achievement", "status"]>>;
        readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
        readonly roles: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly server_id: import("effect/Schema").String;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly type: import("effect/Schema").Literals<readonly ["townhall", "builderhall", "league", "builder_league", "clan_role", "clan_category", "family", "achievement", "status"]>;
            readonly option: import("effect/Schema").String;
            readonly role_id: import("effect/Schema").String;
            readonly mode: import("effect/Schema").Literals<readonly ["both", "add", "remove"]>;
            readonly created_at: import("effect/Schema").String;
            readonly updated_at: import("effect/Schema").String;
        }>>;
        readonly count: import("effect/Schema").Number;
    }>, readonly []>;
    readonly createServerRole: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly type: import("effect/Schema").Literals<readonly ["townhall", "builderhall", "league", "builder_league", "clan_role", "clan_category", "family", "achievement", "status"]>;
        readonly option: import("effect/Schema").String;
        readonly role_id: import("effect/Schema").String;
        readonly mode: import("effect/Schema").optionalKey<import("effect/Schema").Literals<readonly ["both", "add", "remove"]>>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly role: import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly server_id: import("effect/Schema").String;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly type: import("effect/Schema").Literals<readonly ["townhall", "builderhall", "league", "builder_league", "clan_role", "clan_category", "family", "achievement", "status"]>;
            readonly option: import("effect/Schema").String;
            readonly role_id: import("effect/Schema").String;
            readonly mode: import("effect/Schema").Literals<readonly ["both", "add", "remove"]>;
            readonly created_at: import("effect/Schema").String;
            readonly updated_at: import("effect/Schema").String;
        }>;
    }>, readonly []>;
    readonly updateServerRole: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly roleId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly type: import("effect/Schema").optionalKey<import("effect/Schema").Literals<readonly ["townhall", "builderhall", "league", "builder_league", "clan_role", "clan_category", "family", "achievement", "status"]>>;
        readonly option: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly role_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly mode: import("effect/Schema").optionalKey<import("effect/Schema").Literals<readonly ["both", "add", "remove"]>>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly role: import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly server_id: import("effect/Schema").String;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly type: import("effect/Schema").Literals<readonly ["townhall", "builderhall", "league", "builder_league", "clan_role", "clan_category", "family", "achievement", "status"]>;
            readonly option: import("effect/Schema").String;
            readonly role_id: import("effect/Schema").String;
            readonly mode: import("effect/Schema").Literals<readonly ["both", "add", "remove"]>;
            readonly created_at: import("effect/Schema").String;
            readonly updated_at: import("effect/Schema").String;
        }>;
    }>, readonly []>;
    readonly deleteServerRole: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly roleId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly role: import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly server_id: import("effect/Schema").String;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly type: import("effect/Schema").Literals<readonly ["townhall", "builderhall", "league", "builder_league", "clan_role", "clan_category", "family", "achievement", "status"]>;
            readonly option: import("effect/Schema").String;
            readonly role_id: import("effect/Schema").String;
            readonly mode: import("effect/Schema").Literals<readonly ["both", "add", "remove"]>;
            readonly created_at: import("effect/Schema").String;
            readonly updated_at: import("effect/Schema").String;
        }>;
    }>, readonly []>;
    readonly serverLogs: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly logs: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly type: import("effect/Schema").String;
            readonly webhook_id: import("effect/Schema").String;
            readonly channel_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly thread_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly disabled: import("effect/Schema").Boolean;
        }>>;
        readonly count: import("effect/Schema").Number;
    }>, readonly []>;
    readonly saveServerLogs: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly channel_id: import("effect/Schema").String;
        readonly thread_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly log_types: import("effect/Schema").$Array<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly server_id: import("effect/Schema").String;
        readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly updated_log_types: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
        readonly deleted_log_types: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
        readonly logs: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly type: import("effect/Schema").String;
            readonly webhook_id: import("effect/Schema").String;
            readonly channel_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly thread_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly disabled: import("effect/Schema").Boolean;
        }>>>;
    }>, readonly []>;
    readonly updateServerLogsState: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly log_types: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly disabled: import("effect/Schema").Boolean;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly server_id: import("effect/Schema").String;
        readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly updated_log_types: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
        readonly deleted_log_types: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
        readonly logs: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly type: import("effect/Schema").String;
            readonly webhook_id: import("effect/Schema").String;
            readonly channel_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly thread_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly disabled: import("effect/Schema").Boolean;
        }>>>;
    }>, readonly []>;
    readonly deleteServerLogs: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly log_types: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly server_id: import("effect/Schema").String;
        readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly updated_log_types: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
        readonly deleted_log_types: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
        readonly logs: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly type: import("effect/Schema").String;
            readonly webhook_id: import("effect/Schema").String;
            readonly channel_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly thread_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly disabled: import("effect/Schema").Boolean;
        }>>>;
    }>, readonly []>;
    readonly serverCountdowns: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
        readonly countdowns: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly type: import("effect/Schema").Literals<readonly ["clan_games_timer", "cwl_timer", "raid_weekend_timer", "season_end_timer", "season_day_timer", "war_score", "war_timer"]>;
            readonly name: import("effect/Schema").String;
            readonly enabled: import("effect/Schema").Boolean;
            readonly channel_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
    }>, readonly []>;
    readonly clanCountdowns: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly clanTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
        readonly clan_tag: import("effect/Schema").String;
        readonly countdowns: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly type: import("effect/Schema").Literals<readonly ["clan_games_timer", "cwl_timer", "raid_weekend_timer", "season_end_timer", "season_day_timer", "war_score", "war_timer"]>;
            readonly name: import("effect/Schema").String;
            readonly enabled: import("effect/Schema").Boolean;
            readonly channel_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
    }>, readonly []>;
    readonly enableCountdown: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly countdown_type: import("effect/Schema").Literals<readonly ["clan_games_timer", "cwl_timer", "raid_weekend_timer", "season_end_timer", "season_day_timer", "war_score", "war_timer"]>;
        readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly countdown_type: import("effect/Schema").Literals<readonly ["clan_games_timer", "cwl_timer", "raid_weekend_timer", "season_end_timer", "season_day_timer", "war_score", "war_timer"]>;
        readonly channel_id: import("effect/Schema").String;
        readonly channel_name: import("effect/Schema").String;
    }>, readonly []>;
    readonly disableCountdown: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly countdown_type: import("effect/Schema").Literals<readonly ["clan_games_timer", "cwl_timer", "raid_weekend_timer", "season_end_timer", "season_day_timer", "war_score", "war_timer"]>;
        readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly countdown_type: import("effect/Schema").Literals<readonly ["clan_games_timer", "cwl_timer", "raid_weekend_timer", "season_end_timer", "season_day_timer", "war_score", "war_timer"]>;
    }>, readonly []>;
    readonly serverChannels: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").$Array<import("effect/Schema").Struct<{
        readonly id: import("effect/Schema").String;
        readonly name: import("effect/Schema").String;
        readonly type: import("effect/Schema").Literals<readonly ["category", "text", "news", "forum"]>;
        readonly parent_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly parent_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>>, readonly []>;
    readonly serverDiscordChannels: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").$Array<import("effect/Schema").Struct<{
        readonly id: import("effect/Schema").String;
        readonly name: import("effect/Schema").String;
        readonly type: import("effect/Schema").Literals<readonly ["category", "text", "news", "forum"]>;
        readonly parent_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly parent_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>>, readonly []>;
    readonly serverThreads: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").$Array<import("effect/Schema").Struct<{
        readonly id: import("effect/Schema").String;
        readonly name: import("effect/Schema").String;
        readonly parent_channel_id: import("effect/Schema").String;
        readonly parent_channel_name: import("effect/Schema").String;
        readonly archived: import("effect/Schema").Boolean;
    }>>, readonly []>;
    readonly serverReminders: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly war_reminders: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly type: import("effect/Schema").String;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly channel_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly thread_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly time: import("effect/Schema").String;
            readonly custom_text: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly townhall_filter: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Number>>;
            readonly roles: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
            readonly war_types: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
            readonly point_threshold: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly attack_threshold: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly roster_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly ping_type: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
        readonly capital_reminders: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly type: import("effect/Schema").String;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly channel_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly thread_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly time: import("effect/Schema").String;
            readonly custom_text: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly townhall_filter: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Number>>;
            readonly roles: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
            readonly war_types: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
            readonly point_threshold: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly attack_threshold: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly roster_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly ping_type: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
        readonly clan_games_reminders: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly type: import("effect/Schema").String;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly channel_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly thread_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly time: import("effect/Schema").String;
            readonly custom_text: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly townhall_filter: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Number>>;
            readonly roles: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
            readonly war_types: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
            readonly point_threshold: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly attack_threshold: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly roster_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly ping_type: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
        readonly inactivity_reminders: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly type: import("effect/Schema").String;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly channel_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly thread_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly time: import("effect/Schema").String;
            readonly custom_text: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly townhall_filter: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Number>>;
            readonly roles: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
            readonly war_types: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
            readonly point_threshold: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly attack_threshold: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly roster_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly ping_type: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
        readonly roster_reminders: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly type: import("effect/Schema").String;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly channel_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly thread_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly time: import("effect/Schema").String;
            readonly custom_text: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly townhall_filter: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Number>>;
            readonly roles: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
            readonly war_types: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
            readonly point_threshold: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly attack_threshold: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly roster_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly ping_type: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
    }>, readonly []>;
    readonly createServerReminder: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly type: import("effect/Schema").String;
        readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly channel_id: import("effect/Schema").String;
        readonly thread_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly time: import("effect/Schema").String;
        readonly custom_text: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly townhall_filter: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Number>>;
        readonly roles: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
        readonly war_types: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
        readonly point_threshold: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly attack_threshold: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly roster_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly ping_type: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly reminder_id: import("effect/Schema").String;
        readonly server_id: import("effect/Schema").String;
    }>, readonly []>;
    readonly updateServerReminder: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly reminderId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly channel_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly thread_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly time: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly custom_text: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly townhall_filter: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Number>>;
        readonly roles: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
        readonly war_types: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
        readonly point_threshold: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly attack_threshold: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly ping_type: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly reminder_id: import("effect/Schema").String;
        readonly server_id: import("effect/Schema").String;
    }>, readonly []>;
    readonly deleteServerReminder: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly reminderId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly reminder_id: import("effect/Schema").String;
        readonly server_id: import("effect/Schema").String;
    }>, readonly []>;
    readonly serverGiveaways: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly ongoing: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly serverId: import("effect/Schema").String;
            readonly prize: import("effect/Schema").String;
            readonly channelId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly status: import("effect/Schema").Literals<readonly ["scheduled", "ongoing", "ended"]>;
            readonly start: import("effect/Schema").String;
            readonly end: import("effect/Schema").String;
            readonly winners: import("effect/Schema").Number;
            readonly mentions: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly textAboveEmbed: import("effect/Schema").String;
            readonly textInEmbed: import("effect/Schema").String;
            readonly textOnEnd: import("effect/Schema").String;
            readonly imageUrl: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly profilePictureRequired: import("effect/Schema").Boolean;
            readonly cocAccountRequired: import("effect/Schema").Boolean;
            readonly rolesMode: import("effect/Schema").Literals<readonly ["allow", "deny", "none"]>;
            readonly roles: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly boosters: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly value: import("effect/Schema").Number;
                readonly roles: import("effect/Schema").$Array<import("effect/Schema").String>;
            }>>;
            readonly entries: import("effect/Schema").$Array<import("effect/Schema").Union<readonly [import("effect/Schema").String, import("effect/Schema").Struct<{
                readonly user_id: import("effect/Schema").String;
            }>]>>;
            readonly winnersList: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly userId: import("effect/Schema").String;
                readonly username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly avatarUrl: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly inServer: import("effect/Schema").Boolean;
                readonly status: import("effect/Schema").Literals<readonly ["winner", "rerolled"]>;
                readonly timestamp: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly reason: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
            readonly updated: import("effect/Schema").Boolean;
            readonly messageId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly eventPending: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly eventPendingAt: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly createdAt: import("effect/Schema").String;
            readonly updatedAt: import("effect/Schema").String;
        }>>;
        readonly upcoming: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly serverId: import("effect/Schema").String;
            readonly prize: import("effect/Schema").String;
            readonly channelId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly status: import("effect/Schema").Literals<readonly ["scheduled", "ongoing", "ended"]>;
            readonly start: import("effect/Schema").String;
            readonly end: import("effect/Schema").String;
            readonly winners: import("effect/Schema").Number;
            readonly mentions: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly textAboveEmbed: import("effect/Schema").String;
            readonly textInEmbed: import("effect/Schema").String;
            readonly textOnEnd: import("effect/Schema").String;
            readonly imageUrl: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly profilePictureRequired: import("effect/Schema").Boolean;
            readonly cocAccountRequired: import("effect/Schema").Boolean;
            readonly rolesMode: import("effect/Schema").Literals<readonly ["allow", "deny", "none"]>;
            readonly roles: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly boosters: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly value: import("effect/Schema").Number;
                readonly roles: import("effect/Schema").$Array<import("effect/Schema").String>;
            }>>;
            readonly entries: import("effect/Schema").$Array<import("effect/Schema").Union<readonly [import("effect/Schema").String, import("effect/Schema").Struct<{
                readonly user_id: import("effect/Schema").String;
            }>]>>;
            readonly winnersList: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly userId: import("effect/Schema").String;
                readonly username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly avatarUrl: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly inServer: import("effect/Schema").Boolean;
                readonly status: import("effect/Schema").Literals<readonly ["winner", "rerolled"]>;
                readonly timestamp: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly reason: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
            readonly updated: import("effect/Schema").Boolean;
            readonly messageId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly eventPending: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly eventPendingAt: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly createdAt: import("effect/Schema").String;
            readonly updatedAt: import("effect/Schema").String;
        }>>;
        readonly ended: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly serverId: import("effect/Schema").String;
            readonly prize: import("effect/Schema").String;
            readonly channelId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly status: import("effect/Schema").Literals<readonly ["scheduled", "ongoing", "ended"]>;
            readonly start: import("effect/Schema").String;
            readonly end: import("effect/Schema").String;
            readonly winners: import("effect/Schema").Number;
            readonly mentions: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly textAboveEmbed: import("effect/Schema").String;
            readonly textInEmbed: import("effect/Schema").String;
            readonly textOnEnd: import("effect/Schema").String;
            readonly imageUrl: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly profilePictureRequired: import("effect/Schema").Boolean;
            readonly cocAccountRequired: import("effect/Schema").Boolean;
            readonly rolesMode: import("effect/Schema").Literals<readonly ["allow", "deny", "none"]>;
            readonly roles: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly boosters: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly value: import("effect/Schema").Number;
                readonly roles: import("effect/Schema").$Array<import("effect/Schema").String>;
            }>>;
            readonly entries: import("effect/Schema").$Array<import("effect/Schema").Union<readonly [import("effect/Schema").String, import("effect/Schema").Struct<{
                readonly user_id: import("effect/Schema").String;
            }>]>>;
            readonly winnersList: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly userId: import("effect/Schema").String;
                readonly username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly avatarUrl: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly inServer: import("effect/Schema").Boolean;
                readonly status: import("effect/Schema").Literals<readonly ["winner", "rerolled"]>;
                readonly timestamp: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly reason: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
            readonly updated: import("effect/Schema").Boolean;
            readonly messageId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly eventPending: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly eventPendingAt: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly createdAt: import("effect/Schema").String;
            readonly updatedAt: import("effect/Schema").String;
        }>>;
        readonly total: import("effect/Schema").Number;
    }>, readonly []>;
    readonly createServerGiveaway: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").FormData, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly giveawayId: import("effect/Schema").String;
        readonly serverId: import("effect/Schema").String;
    }>, readonly []>;
    readonly updateServerGiveaway: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly giveawayId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").FormData, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly giveawayId: import("effect/Schema").String;
        readonly serverId: import("effect/Schema").String;
    }>, readonly []>;
    readonly deleteServerGiveaway: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly giveawayId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly giveawayId: import("effect/Schema").String;
        readonly serverId: import("effect/Schema").String;
    }>, readonly []>;
    readonly giveawayEntries: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly giveawayId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly giveawayId: import("effect/Schema").String;
        readonly serverId: import("effect/Schema").String;
        readonly totalEntries: import("effect/Schema").Number;
        readonly uniqueUsers: import("effect/Schema").Number;
        readonly entrants: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly userId: import("effect/Schema").String;
            readonly entries: import("effect/Schema").Number;
            readonly winChance: import("effect/Schema").Number;
        }>>;
    }>, readonly []>;
    readonly rerollGiveaway: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly giveawayId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly user_ids_to_replace: import("effect/Schema").$Array<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly giveawayId: import("effect/Schema").String;
        readonly serverId: import("effect/Schema").String;
        readonly newWinners: import("effect/Schema").$Array<import("effect/Schema").String>;
    }>, readonly []>;
    readonly ticketPanels: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly server_id: import("effect/Schema").String;
            readonly embed_name: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly components: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").String;
                readonly custom_id: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
                readonly style: import("effect/Schema").Number;
                readonly emoji: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly animated: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                }>>;
                readonly type: import("effect/Schema").Number;
            }>>;
            readonly button_settings: import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Struct<{
                readonly questions: import("effect/Schema").$Array<import("effect/Schema").String>;
                readonly mod_role: import("effect/Schema").$Array<import("effect/Schema").String>;
                readonly no_ping_mod_role: import("effect/Schema").$Array<import("effect/Schema").String>;
                readonly private_thread: import("effect/Schema").Boolean;
                readonly th_min: import("effect/Schema").Number;
                readonly num_apply: import("effect/Schema").Number;
                readonly naming: import("effect/Schema").String;
                readonly account_apply: import("effect/Schema").Boolean;
                readonly player_info: import("effect/Schema").Boolean;
                readonly apply_clans: import("effect/Schema").$Array<import("effect/Schema").String>;
                readonly roles_to_add: import("effect/Schema").$Array<import("effect/Schema").String>;
                readonly roles_to_remove: import("effect/Schema").$Array<import("effect/Schema").String>;
                readonly townhall_requirements: import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Number>>;
                readonly new_message: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            }>>;
            readonly open_category: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly sleep_category: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly closed_category: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly status_change_log: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly ticket_button_click_log: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly ticket_close_log: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly approve_messages: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly name: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>;
        }>>;
        readonly total: import("effect/Schema").Number;
        readonly available_embeds: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly townhall_requirement_fields: import("effect/Schema").$Array<import("effect/Schema").String>;
    }>, readonly []>;
    readonly createTicketPanel: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly name: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
    }>, readonly []>;
    readonly deleteTicketPanel: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly panelName: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
    }>, readonly []>;
    readonly createTicketButton: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly panelName: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly label: import("effect/Schema").String;
        readonly style: import("effect/Schema").Number;
        readonly emoji: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly animated: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        }>>>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
    }>, readonly []>;
    readonly deleteTicketButton: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly panelName: import("effect/Schema").String;
        readonly customId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
    }>, readonly []>;
    readonly updateTicketButtonAppearance: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly panelName: import("effect/Schema").String;
        readonly customId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly label: import("effect/Schema").String;
        readonly style: import("effect/Schema").Number;
        readonly emoji: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly animated: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
        }>>>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
    }>, readonly []>;
    readonly updateTicketPanel: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly panelName: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly open_category: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly sleep_category: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly closed_category: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly status_change_log: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly ticket_button_click_log: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly ticket_close_log: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly embed_name: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
    }>, readonly []>;
    readonly updateTicketButtonSettings: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly panelName: import("effect/Schema").String;
        readonly customId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly questions: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly mod_role: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly no_ping_mod_role: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly private_thread: import("effect/Schema").Boolean;
        readonly th_min: import("effect/Schema").Number;
        readonly num_apply: import("effect/Schema").Number;
        readonly naming: import("effect/Schema").String;
        readonly account_apply: import("effect/Schema").Boolean;
        readonly player_info: import("effect/Schema").Boolean;
        readonly apply_clans: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly roles_to_add: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly roles_to_remove: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly townhall_requirements: import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Number>>;
        readonly new_message: import("effect/Schema").NullOr<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
    }>, readonly []>;
    readonly updateTicketApproveMessages: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly panelName: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly messages: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly name: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
    }>, readonly []>;
    readonly serverEmbeds: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly name: import("effect/Schema").String;
            readonly data: import("effect/Schema").StructWithRest<import("effect/Schema").Struct<{
                readonly content: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                readonly username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly avatar_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly embeds: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly title: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly timestamp: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly color: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                    readonly footer: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                        readonly text: import("effect/Schema").String;
                        readonly icon_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    }>>;
                    readonly image: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                        readonly url: import("effect/Schema").String;
                    }>>;
                    readonly thumbnail: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                        readonly url: import("effect/Schema").String;
                    }>>;
                    readonly author: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                        readonly name: import("effect/Schema").String;
                        readonly url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                        readonly icon_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    }>>;
                    readonly fields: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                        readonly name: import("effect/Schema").String;
                        readonly value: import("effect/Schema").String;
                        readonly inline: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                    }>>>;
                }>>>;
                readonly components: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
                readonly messages: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").StructWithRest<import("effect/Schema").Struct<{
                    readonly data: import("effect/Schema").StructWithRest<import("effect/Schema").Struct<{
                        readonly content: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                        readonly username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                        readonly avatar_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                        readonly tts: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                        readonly embeds: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                            readonly title: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                            readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                            readonly url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                            readonly timestamp: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                            readonly color: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                            readonly footer: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                                readonly text: import("effect/Schema").String;
                                readonly icon_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                            }>>;
                            readonly image: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                                readonly url: import("effect/Schema").String;
                            }>>;
                            readonly thumbnail: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                                readonly url: import("effect/Schema").String;
                            }>>;
                            readonly author: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                                readonly name: import("effect/Schema").String;
                                readonly url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                                readonly icon_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                            }>>;
                            readonly fields: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                                readonly name: import("effect/Schema").String;
                                readonly value: import("effect/Schema").String;
                                readonly inline: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                            }>>>;
                        }>>>;
                        readonly components: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
                        readonly attachments: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
                        readonly allowed_mentions: import("effect/Schema").optionalKey<import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>;
                        readonly flags: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                    }>, readonly [import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>]>;
                }>, readonly [import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>]>>>;
                readonly application_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>, readonly [import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>]>;
        }>>;
        readonly total: import("effect/Schema").Number;
    }>, readonly []>;
    readonly createServerEmbed: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly name: import("effect/Schema").String;
        readonly data: import("effect/Schema").StructWithRest<import("effect/Schema").Struct<{
            readonly content: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly avatar_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly embeds: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly title: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly timestamp: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly color: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly footer: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly text: import("effect/Schema").String;
                    readonly icon_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
                readonly image: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly url: import("effect/Schema").String;
                }>>;
                readonly thumbnail: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly url: import("effect/Schema").String;
                }>>;
                readonly author: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly name: import("effect/Schema").String;
                    readonly url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly icon_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
                readonly fields: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly name: import("effect/Schema").String;
                    readonly value: import("effect/Schema").String;
                    readonly inline: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                }>>>;
            }>>>;
            readonly components: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
            readonly messages: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").StructWithRest<import("effect/Schema").Struct<{
                readonly data: import("effect/Schema").StructWithRest<import("effect/Schema").Struct<{
                    readonly content: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                    readonly username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly avatar_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly tts: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                    readonly embeds: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                        readonly title: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                        readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                        readonly url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                        readonly timestamp: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                        readonly color: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                        readonly footer: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                            readonly text: import("effect/Schema").String;
                            readonly icon_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                        }>>;
                        readonly image: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                            readonly url: import("effect/Schema").String;
                        }>>;
                        readonly thumbnail: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                            readonly url: import("effect/Schema").String;
                        }>>;
                        readonly author: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                            readonly name: import("effect/Schema").String;
                            readonly url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                            readonly icon_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                        }>>;
                        readonly fields: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                            readonly name: import("effect/Schema").String;
                            readonly value: import("effect/Schema").String;
                            readonly inline: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                        }>>>;
                    }>>>;
                    readonly components: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
                    readonly attachments: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
                    readonly allowed_mentions: import("effect/Schema").optionalKey<import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>;
                    readonly flags: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                }>, readonly [import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>]>;
            }>, readonly [import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>]>>>;
            readonly application_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>, readonly [import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>]>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
    }>, readonly []>;
    readonly updateServerEmbed: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly embedName: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly name: import("effect/Schema").String;
        readonly data: import("effect/Schema").StructWithRest<import("effect/Schema").Struct<{
            readonly content: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly avatar_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly embeds: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly title: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly timestamp: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly color: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly footer: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly text: import("effect/Schema").String;
                    readonly icon_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
                readonly image: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly url: import("effect/Schema").String;
                }>>;
                readonly thumbnail: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly url: import("effect/Schema").String;
                }>>;
                readonly author: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly name: import("effect/Schema").String;
                    readonly url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly icon_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
                readonly fields: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly name: import("effect/Schema").String;
                    readonly value: import("effect/Schema").String;
                    readonly inline: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                }>>>;
            }>>>;
            readonly components: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
            readonly messages: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").StructWithRest<import("effect/Schema").Struct<{
                readonly data: import("effect/Schema").StructWithRest<import("effect/Schema").Struct<{
                    readonly content: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                    readonly username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly avatar_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly tts: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                    readonly embeds: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                        readonly title: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                        readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                        readonly url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                        readonly timestamp: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                        readonly color: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                        readonly footer: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                            readonly text: import("effect/Schema").String;
                            readonly icon_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                        }>>;
                        readonly image: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                            readonly url: import("effect/Schema").String;
                        }>>;
                        readonly thumbnail: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                            readonly url: import("effect/Schema").String;
                        }>>;
                        readonly author: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                            readonly name: import("effect/Schema").String;
                            readonly url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                            readonly icon_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                        }>>;
                        readonly fields: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                            readonly name: import("effect/Schema").String;
                            readonly value: import("effect/Schema").String;
                            readonly inline: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                        }>>>;
                    }>>>;
                    readonly components: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
                    readonly attachments: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
                    readonly allowed_mentions: import("effect/Schema").optionalKey<import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>;
                    readonly flags: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                }>, readonly [import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>]>;
            }>, readonly [import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>]>>>;
            readonly application_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>, readonly [import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>]>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
    }>, readonly []>;
    readonly deleteServerEmbed: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly embedName: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
    }>, readonly []>;
    readonly serverPanel: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly embed_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly buttons: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly button_color: import("effect/Schema").String;
        readonly welcome_channel: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
    }>, readonly []>;
    readonly updateServerPanel: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly embed_name: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
        readonly buttons: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly button_color: import("effect/Schema").String;
        readonly welcome_channel: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
    }>, import("effect/Schema").Struct<{
        readonly embed_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly buttons: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly button_color: import("effect/Schema").String;
        readonly welcome_channel: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
    }>, readonly []>;
    readonly dashboardBases: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly offset: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly serverId: import("effect/Schema").String;
            readonly channelId: import("effect/Schema").String;
            readonly messageId: import("effect/Schema").String;
            readonly baseLink: import("effect/Schema").String;
            readonly images: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly description: import("effect/Schema").String;
            readonly downloadCount: import("effect/Schema").Number;
            readonly upvotes: import("effect/Schema").Number;
            readonly downvotes: import("effect/Schema").Number;
            readonly downloaders: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly createdAt: import("effect/Schema").String;
            readonly discordMessageUrl: import("effect/Schema").String;
        }>>;
        readonly total: import("effect/Schema").Number;
        readonly limit: import("effect/Schema").Number;
        readonly offset: import("effect/Schema").Number;
    }>, readonly []>;
    readonly dashboardBase: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly baseId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly id: import("effect/Schema").String;
        readonly serverId: import("effect/Schema").String;
        readonly channelId: import("effect/Schema").String;
        readonly messageId: import("effect/Schema").String;
        readonly baseLink: import("effect/Schema").String;
        readonly images: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly description: import("effect/Schema").String;
        readonly downloadCount: import("effect/Schema").Number;
        readonly upvotes: import("effect/Schema").Number;
        readonly downvotes: import("effect/Schema").Number;
        readonly downloaders: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly createdAt: import("effect/Schema").String;
        readonly discordMessageUrl: import("effect/Schema").String;
    }>, readonly []>;
    readonly createDashboardBase: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly channelId: import("effect/Schema").String;
        readonly baseLink: import("effect/Schema").String;
        readonly images: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly description: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly id: import("effect/Schema").String;
        readonly serverId: import("effect/Schema").String;
        readonly channelId: import("effect/Schema").String;
        readonly messageId: import("effect/Schema").String;
        readonly baseLink: import("effect/Schema").String;
        readonly images: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly description: import("effect/Schema").String;
        readonly downloadCount: import("effect/Schema").Number;
        readonly upvotes: import("effect/Schema").Number;
        readonly downvotes: import("effect/Schema").Number;
        readonly downloaders: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly createdAt: import("effect/Schema").String;
        readonly discordMessageUrl: import("effect/Schema").String;
    }>, readonly [{
        readonly status: 409;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Union<readonly [import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>, import("effect/Schema").Literals<readonly ["database_insert_failed", "database_delete_failed", "discord_unavailable", "discord_invalid_response", "discord_cleanup_failed", "invalid_discord_location"]>]>;
            readonly message: import("effect/Schema").String;
            readonly requestId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly databaseInserted: import("effect/Schema").Literal<false>;
            readonly discordMessageCreated: import("effect/Schema").Boolean;
            readonly discordMessageId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly discordMessageCleanup: import("effect/Schema").Literals<readonly ["notNeeded", "deleted", "alreadyMissing", "failed"]>;
            readonly retryable: import("effect/Schema").Boolean;
        }>;
    }, {
        readonly status: 500;
        readonly body: import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Union<readonly [import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>, import("effect/Schema").Literals<readonly ["database_insert_failed", "database_delete_failed", "discord_unavailable", "discord_invalid_response", "discord_cleanup_failed", "invalid_discord_location"]>]>;
            readonly message: import("effect/Schema").String;
            readonly requestId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly databaseInserted: import("effect/Schema").Literal<false>;
            readonly discordMessageCreated: import("effect/Schema").Boolean;
            readonly discordMessageId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly discordMessageCleanup: import("effect/Schema").Literals<readonly ["notNeeded", "deleted", "alreadyMissing", "failed"]>;
            readonly retryable: import("effect/Schema").Boolean;
        }>, import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>]>;
    }, {
        readonly status: 502;
        readonly body: import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Union<readonly [import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>, import("effect/Schema").Literals<readonly ["database_insert_failed", "database_delete_failed", "discord_unavailable", "discord_invalid_response", "discord_cleanup_failed", "invalid_discord_location"]>]>;
            readonly message: import("effect/Schema").String;
            readonly requestId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly databaseInserted: import("effect/Schema").Literal<false>;
            readonly discordMessageCreated: import("effect/Schema").Boolean;
            readonly discordMessageId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly discordMessageCleanup: import("effect/Schema").Literals<readonly ["notNeeded", "deleted", "alreadyMissing", "failed"]>;
            readonly retryable: import("effect/Schema").Boolean;
        }>, import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>]>;
    }, {
        readonly status: 503;
        readonly body: import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Union<readonly [import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>, import("effect/Schema").Literals<readonly ["database_insert_failed", "database_delete_failed", "discord_unavailable", "discord_invalid_response", "discord_cleanup_failed", "invalid_discord_location"]>]>;
            readonly message: import("effect/Schema").String;
            readonly requestId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly databaseInserted: import("effect/Schema").Literal<false>;
            readonly discordMessageCreated: import("effect/Schema").Boolean;
            readonly discordMessageId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly discordMessageCleanup: import("effect/Schema").Literals<readonly ["notNeeded", "deleted", "alreadyMissing", "failed"]>;
            readonly retryable: import("effect/Schema").Boolean;
        }>, import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>]>;
    }]>;
    readonly deleteDashboardBase: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly baseId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly baseId: import("effect/Schema").String;
        readonly databaseDeleted: import("effect/Schema").Literal<true>;
        readonly discordMessageCleanup: import("effect/Schema").Literals<readonly ["deleted", "alreadyMissing"]>;
    }>, readonly [{
        readonly status: 409;
        readonly body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Union<readonly [import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>, import("effect/Schema").Literals<readonly ["database_insert_failed", "database_delete_failed", "discord_unavailable", "discord_invalid_response", "discord_cleanup_failed", "invalid_discord_location"]>]>;
            readonly message: import("effect/Schema").String;
            readonly requestId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly baseId: import("effect/Schema").String;
            readonly databaseDeleted: import("effect/Schema").Literal<false>;
            readonly discordMessageCleanup: import("effect/Schema").Literals<readonly ["deleted", "alreadyMissing", "failed"]>;
            readonly retryable: import("effect/Schema").Boolean;
        }>;
    }, {
        readonly status: 500;
        readonly body: import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Union<readonly [import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>, import("effect/Schema").Literals<readonly ["database_insert_failed", "database_delete_failed", "discord_unavailable", "discord_invalid_response", "discord_cleanup_failed", "invalid_discord_location"]>]>;
            readonly message: import("effect/Schema").String;
            readonly requestId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly baseId: import("effect/Schema").String;
            readonly databaseDeleted: import("effect/Schema").Literal<false>;
            readonly discordMessageCleanup: import("effect/Schema").Literals<readonly ["deleted", "alreadyMissing", "failed"]>;
            readonly retryable: import("effect/Schema").Boolean;
        }>, import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>]>;
    }, {
        readonly status: 502;
        readonly body: import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Union<readonly [import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>, import("effect/Schema").Literals<readonly ["database_insert_failed", "database_delete_failed", "discord_unavailable", "discord_invalid_response", "discord_cleanup_failed", "invalid_discord_location"]>]>;
            readonly message: import("effect/Schema").String;
            readonly requestId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly baseId: import("effect/Schema").String;
            readonly databaseDeleted: import("effect/Schema").Literal<false>;
            readonly discordMessageCleanup: import("effect/Schema").Literals<readonly ["deleted", "alreadyMissing", "failed"]>;
            readonly retryable: import("effect/Schema").Boolean;
        }>, import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>]>;
    }, {
        readonly status: 503;
        readonly body: import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Union<readonly [import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>, import("effect/Schema").Literals<readonly ["database_insert_failed", "database_delete_failed", "discord_unavailable", "discord_invalid_response", "discord_cleanup_failed", "invalid_discord_location"]>]>;
            readonly message: import("effect/Schema").String;
            readonly requestId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly baseId: import("effect/Schema").String;
            readonly databaseDeleted: import("effect/Schema").Literal<false>;
            readonly discordMessageCleanup: import("effect/Schema").Literals<readonly ["deleted", "alreadyMissing", "failed"]>;
            readonly retryable: import("effect/Schema").Boolean;
        }>, import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>]>;
    }]>;
    readonly uploadDashboardBaseImage: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").FormData, import("effect/Schema").Struct<{
        readonly url: import("effect/Schema").String;
        readonly filename: import("effect/Schema").String;
    }>, readonly []>;
    readonly baseDownloader: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly baseId: import("effect/Schema").String;
        readonly userId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly userId: import("effect/Schema").String;
        readonly displayName: import("effect/Schema").NullOr<import("effect/Schema").String>;
        readonly avatarUrl: import("effect/Schema").NullOr<import("effect/Schema").String>;
    }>, readonly []>;
    readonly clanCategories: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly serverId: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly position: import("effect/Schema").Number;
            readonly clanCount: import("effect/Schema").Number;
        }>>;
        readonly total: import("effect/Schema").Number;
    }>, readonly []>;
    readonly createClanCategory: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly name: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly category: import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly serverId: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly position: import("effect/Schema").Number;
            readonly clanCount: import("effect/Schema").Number;
        }>;
    }>, readonly []>;
    readonly renameClanCategory: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly categoryId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly name: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly category: import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly serverId: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly position: import("effect/Schema").Number;
            readonly clanCount: import("effect/Schema").Number;
        }>;
    }>, readonly []>;
    readonly reorderClanCategories: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly categoryIds: import("effect/Schema").$Array<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly serverId: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly position: import("effect/Schema").Number;
            readonly clanCount: import("effect/Schema").Number;
        }>>;
        readonly total: import("effect/Schema").Number;
    }>, readonly []>;
    readonly previewClanCategoryDelete: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly categoryId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly category: import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly serverId: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly position: import("effect/Schema").Number;
            readonly clanCount: import("effect/Schema").Number;
        }>;
        readonly affectedClanCount: import("effect/Schema").Number;
    }>, readonly []>;
    readonly deleteClanCategory: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly categoryId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly categoryId: import("effect/Schema").String;
        readonly name: import("effect/Schema").String;
        readonly deleted: import("effect/Schema").Boolean;
        readonly uncategorizedClanCount: import("effect/Schema").Number;
    }>, readonly []>;
    readonly serverLinks: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly offset: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly query: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly account_filter: import("effect/Schema").optionalKey<import("effect/Schema").Literal<"none">>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly user_id: import("effect/Schema").String;
            readonly username: import("effect/Schema").String;
            readonly display_name: import("effect/Schema").String;
            readonly avatar_url: import("effect/Schema").String;
            readonly linked_accounts: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly player_tag: import("effect/Schema").String;
                readonly player_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly town_hall: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly is_verified: import("effect/Schema").Boolean;
                readonly added_at: import("effect/Schema").String;
            }>>;
            readonly account_count: import("effect/Schema").Number;
        }>>;
        readonly roles: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly color: import("effect/Schema").Number;
            readonly position: import("effect/Schema").Number;
        }>>;
        readonly total_members: import("effect/Schema").Number;
        readonly filtered_members: import("effect/Schema").Number;
        readonly members_with_links: import("effect/Schema").Number;
        readonly total_linked_accounts: import("effect/Schema").Number;
        readonly verified_accounts: import("effect/Schema").Number;
    }>, readonly []>;
};
//# sourceMappingURL=dashboard.d.ts.map