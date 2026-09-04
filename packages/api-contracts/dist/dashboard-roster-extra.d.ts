import { Schema } from "effect";
export declare const DashboardRosterBatchRequest: Schema.Struct<{
    readonly serverId: Schema.String;
    readonly rosterIds: Schema.$Array<Schema.String>;
    readonly fields: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["playerName", "playerTag", "townhall", "trophies", "clanName", "clanTag", "leagueId", "leagueName", "heroLevelSum", "maxPercent", "warPreference", "lastOnline", "discordUsername", "signupAnswers"]>>>;
}>;
export declare const DashboardRosterSnapshotRow: Schema.Struct<{
    readonly rosterId: Schema.String;
    readonly playerTag: Schema.String;
    readonly playerName: Schema.optionalKey<Schema.String>;
    readonly townhall: Schema.optionalKey<Schema.Number>;
    readonly trophies: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly clanName: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly clanTag: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly leagueId: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly leagueName: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly heroLevelSum: Schema.optionalKey<Schema.Number>;
    readonly maxPercent: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly warPreference: Schema.optionalKey<Schema.NullOr<Schema.Boolean>>;
    readonly lastOnline: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly discordUsername: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly signupAnswers: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>>;
}>;
export declare const DashboardRosterMembersQueryEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly serverId: Schema.String;
    readonly rosterIds: Schema.$Array<Schema.String>;
    readonly fields: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["playerName", "playerTag", "townhall", "trophies", "clanName", "clanTag", "leagueId", "leagueName", "heroLevelSum", "maxPercent", "warPreference", "lastOnline", "discordUsername", "signupAnswers"]>>>;
}>, Schema.Struct<{
    readonly rows: Schema.$Array<Schema.Struct<{
        readonly rosterId: Schema.String;
        readonly playerTag: Schema.String;
        readonly playerName: Schema.optionalKey<Schema.String>;
        readonly townhall: Schema.optionalKey<Schema.Number>;
        readonly trophies: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        readonly clanName: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly clanTag: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly leagueId: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        readonly leagueName: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly heroLevelSum: Schema.optionalKey<Schema.Number>;
        readonly maxPercent: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        readonly warPreference: Schema.optionalKey<Schema.NullOr<Schema.Boolean>>;
        readonly lastOnline: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly discordUsername: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly signupAnswers: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>>;
    }>>;
}>, {
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
export declare const DashboardRosterAccountGroupsQueryEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly serverId: Schema.String;
    readonly rosterIds: Schema.$Array<Schema.String>;
    readonly fields: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["playerName", "playerTag", "townhall", "trophies", "clanName", "clanTag", "leagueId", "leagueName", "heroLevelSum", "maxPercent", "warPreference", "lastOnline", "discordUsername", "signupAnswers"]>>>;
}>, Schema.Struct<{
    readonly groups: Schema.$Array<Schema.Struct<{
        readonly group: Schema.Number;
        readonly accounts: Schema.$Array<Schema.Struct<{
            readonly rosterId: Schema.String;
            readonly playerTag: Schema.String;
            readonly playerName: Schema.String;
        }>>;
    }>>;
    readonly note: Schema.String;
}>, {
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
export declare const DashboardRosterRefreshBatchEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly serverId: Schema.String;
    readonly rosterIds: Schema.$Array<Schema.String>;
    readonly fields: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["playerName", "playerTag", "townhall", "trophies", "clanName", "clanTag", "leagueId", "leagueName", "heroLevelSum", "maxPercent", "warPreference", "lastOnline", "discordUsername", "signupAnswers"]>>>;
}>, Schema.Struct<{
    readonly rosters: Schema.$Array<Schema.Struct<{
        readonly rosterId: Schema.String;
        readonly status: Schema.Literals<readonly ["completed", "reused", "waiting"]>;
        readonly message: Schema.optionalKey<Schema.String>;
        readonly refreshedPlayers: Schema.optionalKey<Schema.Number>;
        readonly failedPlayers: Schema.optionalKey<Schema.Number>;
        readonly refreshedAt: Schema.optionalKey<Schema.String>;
    }>>;
}>, {
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
export declare const DashboardRosterMembershipValidateEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly serverId: Schema.String;
    readonly rosterIds: Schema.$Array<Schema.String>;
    readonly changes: Schema.$Array<Schema.Struct<{
        readonly action: Schema.Literals<readonly ["add", "remove", "move"]>;
        readonly playerTag: Schema.String;
        readonly fromRosterId: Schema.optionalKey<Schema.String>;
        readonly toRosterId: Schema.optionalKey<Schema.String>;
        readonly reason: Schema.optionalKey<Schema.String>;
    }>>;
}>, Schema.Struct<{
    readonly type: Schema.Literal<"membershipProposal">;
    readonly changes: Schema.$Array<Schema.Struct<{
        readonly action: Schema.Literals<readonly ["add", "remove", "move"]>;
        readonly playerTag: Schema.String;
        readonly fromRosterId: Schema.optionalKey<Schema.String>;
        readonly toRosterId: Schema.optionalKey<Schema.String>;
        readonly reason: Schema.optionalKey<Schema.String>;
    }>>;
    readonly expectedRevisions: Schema.$Record<Schema.String, Schema.Number>;
    readonly generatedAt: Schema.String;
    readonly counts: Schema.Struct<{
        readonly add: Schema.Number;
        readonly move: Schema.Number;
        readonly remove: Schema.Number;
    }>;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly action: Schema.Literals<readonly ["add", "move", "remove"]>;
        readonly playerTag: Schema.String;
        readonly fromRoster: Schema.String;
        readonly toRoster: Schema.String;
        readonly reason: Schema.String;
    }>>;
}>, {
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
export declare const DashboardRosterQuestion: Schema.Struct<{
    readonly id: Schema.String;
    readonly label: Schema.String;
    readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
    readonly required: Schema.Boolean;
    readonly options: Schema.$Array<Schema.String>;
    readonly order: Schema.Number;
}>;
export declare const DashboardRosterQuestionnaire: Schema.Struct<{
    readonly accountSelector: Schema.Struct<{
        readonly id: Schema.Literal<"account">;
        readonly type: Schema.Literal<"account">;
        readonly required: Schema.Literal<true>;
    }>;
    readonly questions: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly label: Schema.String;
        readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
        readonly required: Schema.Boolean;
        readonly options: Schema.$Array<Schema.String>;
        readonly order: Schema.Number;
    }>>;
}>;
export declare const DashboardRosterQuestionnaireEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly server_id: Schema.String;
    readonly roster_id: Schema.String;
}>, Schema.Struct<{
    readonly questions: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly label: Schema.String;
        readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
        readonly required: Schema.Boolean;
        readonly options: Schema.$Array<Schema.String>;
        readonly order: Schema.Number;
    }>>;
}>, Schema.Struct<{
    readonly questionnaire: Schema.Struct<{
        readonly accountSelector: Schema.Struct<{
            readonly id: Schema.Literal<"account">;
            readonly type: Schema.Literal<"account">;
            readonly required: Schema.Literal<true>;
        }>;
        readonly questions: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly label: Schema.String;
            readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
            readonly required: Schema.Boolean;
            readonly options: Schema.$Array<Schema.String>;
            readonly order: Schema.Number;
        }>>;
    }>;
    readonly affectedMemberCount: Schema.Number;
}>, {
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
export declare const DashboardRosterSignupFormEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly rosterId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly accountSelector: Schema.Struct<{
        readonly id: Schema.Literal<"account">;
        readonly type: Schema.Literal<"account">;
        readonly required: Schema.Literal<true>;
    }>;
    readonly questions: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly label: Schema.String;
        readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
        readonly required: Schema.Boolean;
        readonly options: Schema.$Array<Schema.String>;
        readonly order: Schema.Number;
    }>>;
}>, {
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
export declare const DashboardRosterSubmission: Schema.Struct<{
    readonly id: Schema.String;
    readonly rosterId: Schema.String;
    readonly playerTag: Schema.String;
    readonly answers: Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>;
    readonly createdAt: Schema.String;
    readonly updatedAt: Schema.String;
}>;
export declare const DashboardRosterSubmissionEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly rosterId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly playerTag: Schema.String;
    readonly answers: Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>;
    readonly discordUserId: Schema.optionalKey<Schema.String>;
    readonly discordUsername: Schema.optionalKey<Schema.String>;
    readonly discordAvatarUrl: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{
    readonly submission: Schema.Struct<{
        readonly id: Schema.String;
        readonly rosterId: Schema.String;
        readonly playerTag: Schema.String;
        readonly answers: Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>;
        readonly createdAt: Schema.String;
        readonly updatedAt: Schema.String;
    }>;
}>, {
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
export declare const DashboardRosterBuilderMissingMembersEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly rosterId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly playerTag: Schema.String;
        readonly playerName: Schema.String;
        readonly townhall: Schema.Number;
        readonly trophies: Schema.NullOr<Schema.Number>;
        readonly clanTag: Schema.NullOr<Schema.String>;
        readonly clanName: Schema.NullOr<Schema.String>;
        readonly discordUserId: Schema.NullOr<Schema.String>;
    }>>;
    readonly count: Schema.Number;
}>, {
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
export declare const DashboardRosterRefreshDataEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly server_id: Schema.String;
    readonly roster_id: Schema.String;
}>, Schema.Struct<{
    readonly scope: Schema.Literals<readonly ["data", "role"]>;
}>, Schema.Struct<{
    readonly refreshId: Schema.String;
    readonly scope: Schema.Literals<readonly ["data", "role"]>;
    readonly status: Schema.String;
    readonly refreshedPlayers: Schema.Number;
    readonly failedPlayers: Schema.Number;
    readonly refreshedAt: Schema.String;
    readonly reused: Schema.Boolean;
    readonly roleId: Schema.optionalKey<Schema.String>;
    readonly roleMemberUserIds: Schema.optionalKey<Schema.$Array<Schema.String>>;
}>, {
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
export declare const DashboardRosterAIMessagePart: Schema.Struct<{
    readonly type: Schema.String;
    readonly text: Schema.optionalKey<Schema.String>;
    readonly toolCallId: Schema.optionalKey<Schema.String>;
    readonly state: Schema.optionalKey<Schema.String>;
    readonly input: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
    readonly approval: Schema.optionalKey<Schema.Struct<{
        readonly id: Schema.String;
        readonly approved: Schema.optionalKey<Schema.Boolean>;
        readonly reason: Schema.optionalKey<Schema.String>;
    }>>;
}>;
export declare const DashboardRosterAIContextRequest: Schema.Struct<{
    readonly serverId: Schema.String;
    readonly rosterIds: Schema.$Array<Schema.String>;
    readonly viewId: Schema.optionalKey<Schema.String>;
    readonly messages: Schema.$Array<Schema.Struct<{
        readonly id: Schema.optionalKey<Schema.String>;
        readonly role: Schema.Literals<readonly ["user", "assistant"]>;
        readonly content: Schema.optionalKey<Schema.String>;
        readonly parts: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly type: Schema.String;
            readonly text: Schema.optionalKey<Schema.String>;
            readonly toolCallId: Schema.optionalKey<Schema.String>;
            readonly state: Schema.optionalKey<Schema.String>;
            readonly input: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
            readonly approval: Schema.optionalKey<Schema.Struct<{
                readonly id: Schema.String;
                readonly approved: Schema.optionalKey<Schema.Boolean>;
                readonly reason: Schema.optionalKey<Schema.String>;
            }>>;
        }>>>;
    }>>;
}>;
export declare const DashboardRosterAIContextResponse: Schema.Struct<{
    readonly requestId: Schema.String;
    readonly model: Schema.Literal<"gpt-5.6-luna">;
    readonly budget: Schema.Struct<{
        readonly serverSpentUsd: Schema.Number;
        readonly serverLimitUsd: Schema.Number;
        readonly globalSpentUsd: Schema.Number;
        readonly globalLimitUsd: Schema.Number;
        readonly userSpentUsd: Schema.Number;
        readonly userLimitUsd: Schema.Number;
        readonly paidSpentUsd: Schema.Number;
        readonly paidLimitUsd: Schema.Number;
        readonly paidRemainingUsd: Schema.Number;
        readonly usesPaidPool: Schema.Boolean;
        readonly resetsAt: Schema.String;
    }>;
    readonly context: Schema.Struct<{
        readonly attachments: Schema.NullOr<Schema.$Array<Schema.Struct<{
            readonly rosterId: Schema.String;
            readonly alias: Schema.String;
            readonly clanTag: Schema.NullOr<Schema.String>;
            readonly memberCount: Schema.Number;
            readonly revision: Schema.Number;
            readonly signupQuestions: Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly label: Schema.String;
                readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
                readonly required: Schema.Boolean;
                readonly options: Schema.$Array<Schema.String>;
                readonly order: Schema.Number;
            }>>;
        }>>>;
        readonly metrics: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly label: Schema.String;
            readonly valueType: Schema.Literals<readonly ["string", "number", "boolean", "json", "time"]>;
            readonly kind: Schema.Literals<readonly ["snapshot", "historical", "derived", "presentation"]>;
            readonly description: Schema.String;
            readonly cacheTtlSeconds: Schema.Number;
            readonly dependsOn: Schema.optionalKey<Schema.$Array<Schema.String>>;
        }>>;
        readonly currentView: Schema.NullOr<Schema.Struct<{
            readonly id: Schema.String;
            readonly shareId: Schema.String;
            readonly serverId: Schema.String;
            readonly name: Schema.String;
            readonly sourceCode: Schema.String;
            readonly sourceVersion: Schema.Literal<1>;
            readonly createdBy: Schema.String;
            readonly spec: Schema.optionalKey<Schema.Struct<{
                readonly schemaVersion: Schema.Literal<1>;
                readonly columns: Schema.$Array<Schema.Struct<{
                    readonly id: Schema.String;
                    readonly label: Schema.String;
                    readonly metricId: Schema.String;
                    readonly description: Schema.optionalKey<Schema.String>;
                    readonly parameters: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>>;
                    readonly format: Schema.optionalKey<Schema.String>;
                }>>;
                readonly sort: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                    readonly columnId: Schema.String;
                    readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
                }>>>;
                readonly filters: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                    readonly columnId: Schema.String;
                    readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                    readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
                }>>>;
                readonly highlights: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                    readonly id: Schema.String;
                    readonly target: Schema.Literals<readonly ["row", "column", "cell"]>;
                    readonly columnId: Schema.optionalKey<Schema.String>;
                    readonly when: Schema.optionalKey<Schema.Struct<{
                        readonly columnId: Schema.optionalKey<Schema.String>;
                        readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                        readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
                    }>>;
                    readonly tone: Schema.Literals<readonly ["red", "amber", "green", "blue", "purple", "gray"]>;
                }>>>;
                readonly limit: Schema.optionalKey<Schema.Number>;
            }>>;
            readonly createdAt: Schema.String;
            readonly updatedAt: Schema.String;
        }>>;
    }>;
}>;
export declare const DashboardRosterAIContextEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly serverId: Schema.String;
    readonly rosterIds: Schema.$Array<Schema.String>;
    readonly viewId: Schema.optionalKey<Schema.String>;
    readonly messages: Schema.$Array<Schema.Struct<{
        readonly id: Schema.optionalKey<Schema.String>;
        readonly role: Schema.Literals<readonly ["user", "assistant"]>;
        readonly content: Schema.optionalKey<Schema.String>;
        readonly parts: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly type: Schema.String;
            readonly text: Schema.optionalKey<Schema.String>;
            readonly toolCallId: Schema.optionalKey<Schema.String>;
            readonly state: Schema.optionalKey<Schema.String>;
            readonly input: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
            readonly approval: Schema.optionalKey<Schema.Struct<{
                readonly id: Schema.String;
                readonly approved: Schema.optionalKey<Schema.Boolean>;
                readonly reason: Schema.optionalKey<Schema.String>;
            }>>;
        }>>>;
    }>>;
}>, Schema.Struct<{
    readonly requestId: Schema.String;
    readonly model: Schema.Literal<"gpt-5.6-luna">;
    readonly budget: Schema.Struct<{
        readonly serverSpentUsd: Schema.Number;
        readonly serverLimitUsd: Schema.Number;
        readonly globalSpentUsd: Schema.Number;
        readonly globalLimitUsd: Schema.Number;
        readonly userSpentUsd: Schema.Number;
        readonly userLimitUsd: Schema.Number;
        readonly paidSpentUsd: Schema.Number;
        readonly paidLimitUsd: Schema.Number;
        readonly paidRemainingUsd: Schema.Number;
        readonly usesPaidPool: Schema.Boolean;
        readonly resetsAt: Schema.String;
    }>;
    readonly context: Schema.Struct<{
        readonly attachments: Schema.NullOr<Schema.$Array<Schema.Struct<{
            readonly rosterId: Schema.String;
            readonly alias: Schema.String;
            readonly clanTag: Schema.NullOr<Schema.String>;
            readonly memberCount: Schema.Number;
            readonly revision: Schema.Number;
            readonly signupQuestions: Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly label: Schema.String;
                readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
                readonly required: Schema.Boolean;
                readonly options: Schema.$Array<Schema.String>;
                readonly order: Schema.Number;
            }>>;
        }>>>;
        readonly metrics: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly label: Schema.String;
            readonly valueType: Schema.Literals<readonly ["string", "number", "boolean", "json", "time"]>;
            readonly kind: Schema.Literals<readonly ["snapshot", "historical", "derived", "presentation"]>;
            readonly description: Schema.String;
            readonly cacheTtlSeconds: Schema.Number;
            readonly dependsOn: Schema.optionalKey<Schema.$Array<Schema.String>>;
        }>>;
        readonly currentView: Schema.NullOr<Schema.Struct<{
            readonly id: Schema.String;
            readonly shareId: Schema.String;
            readonly serverId: Schema.String;
            readonly name: Schema.String;
            readonly sourceCode: Schema.String;
            readonly sourceVersion: Schema.Literal<1>;
            readonly createdBy: Schema.String;
            readonly spec: Schema.optionalKey<Schema.Struct<{
                readonly schemaVersion: Schema.Literal<1>;
                readonly columns: Schema.$Array<Schema.Struct<{
                    readonly id: Schema.String;
                    readonly label: Schema.String;
                    readonly metricId: Schema.String;
                    readonly description: Schema.optionalKey<Schema.String>;
                    readonly parameters: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>>;
                    readonly format: Schema.optionalKey<Schema.String>;
                }>>;
                readonly sort: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                    readonly columnId: Schema.String;
                    readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
                }>>>;
                readonly filters: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                    readonly columnId: Schema.String;
                    readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                    readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
                }>>>;
                readonly highlights: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                    readonly id: Schema.String;
                    readonly target: Schema.Literals<readonly ["row", "column", "cell"]>;
                    readonly columnId: Schema.optionalKey<Schema.String>;
                    readonly when: Schema.optionalKey<Schema.Struct<{
                        readonly columnId: Schema.optionalKey<Schema.String>;
                        readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                        readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
                    }>>;
                    readonly tone: Schema.Literals<readonly ["red", "amber", "green", "blue", "purple", "gray"]>;
                }>>>;
                readonly limit: Schema.optionalKey<Schema.Number>;
            }>>;
            readonly createdAt: Schema.String;
            readonly updatedAt: Schema.String;
        }>>;
    }>;
}>, {
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
export declare const DashboardRosterAITokenUsage: Schema.Struct<{
    readonly inputTokens: Schema.Number;
    readonly cachedInputTokens: Schema.Number;
    readonly cacheWriteTokens: Schema.Number;
    readonly outputTokens: Schema.Number;
    readonly reasoningTokens: Schema.Number;
}>;
export declare const DashboardRosterAIUsageEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly requestId: Schema.String;
    readonly model: Schema.Literal<"gpt-5.6-luna">;
    readonly usage: Schema.Struct<{
        readonly inputTokens: Schema.Number;
        readonly cachedInputTokens: Schema.Number;
        readonly cacheWriteTokens: Schema.Number;
        readonly outputTokens: Schema.Number;
        readonly reasoningTokens: Schema.Number;
    }>;
    readonly steps: Schema.$Array<Schema.Struct<{
        readonly inputTokens: Schema.Number;
        readonly cachedInputTokens: Schema.Number;
        readonly cacheWriteTokens: Schema.Number;
        readonly outputTokens: Schema.Number;
        readonly reasoningTokens: Schema.Number;
    }>>;
}>, Schema.Void, {
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
export declare const dashboardRosterExtraEndpoints: {
    readonly dashboardRosterMembersQuery: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly serverId: Schema.String;
        readonly rosterIds: Schema.$Array<Schema.String>;
        readonly fields: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["playerName", "playerTag", "townhall", "trophies", "clanName", "clanTag", "leagueId", "leagueName", "heroLevelSum", "maxPercent", "warPreference", "lastOnline", "discordUsername", "signupAnswers"]>>>;
    }>, Schema.Struct<{
        readonly rows: Schema.$Array<Schema.Struct<{
            readonly rosterId: Schema.String;
            readonly playerTag: Schema.String;
            readonly playerName: Schema.optionalKey<Schema.String>;
            readonly townhall: Schema.optionalKey<Schema.Number>;
            readonly trophies: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
            readonly clanName: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly clanTag: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly leagueId: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
            readonly leagueName: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly heroLevelSum: Schema.optionalKey<Schema.Number>;
            readonly maxPercent: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
            readonly warPreference: Schema.optionalKey<Schema.NullOr<Schema.Boolean>>;
            readonly lastOnline: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly discordUsername: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly signupAnswers: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>>;
        }>>;
    }>, {
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
    readonly dashboardRosterAccountGroupsQuery: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly serverId: Schema.String;
        readonly rosterIds: Schema.$Array<Schema.String>;
        readonly fields: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["playerName", "playerTag", "townhall", "trophies", "clanName", "clanTag", "leagueId", "leagueName", "heroLevelSum", "maxPercent", "warPreference", "lastOnline", "discordUsername", "signupAnswers"]>>>;
    }>, Schema.Struct<{
        readonly groups: Schema.$Array<Schema.Struct<{
            readonly group: Schema.Number;
            readonly accounts: Schema.$Array<Schema.Struct<{
                readonly rosterId: Schema.String;
                readonly playerTag: Schema.String;
                readonly playerName: Schema.String;
            }>>;
        }>>;
        readonly note: Schema.String;
    }>, {
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
    readonly dashboardRosterRefreshBatch: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly serverId: Schema.String;
        readonly rosterIds: Schema.$Array<Schema.String>;
        readonly fields: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["playerName", "playerTag", "townhall", "trophies", "clanName", "clanTag", "leagueId", "leagueName", "heroLevelSum", "maxPercent", "warPreference", "lastOnline", "discordUsername", "signupAnswers"]>>>;
    }>, Schema.Struct<{
        readonly rosters: Schema.$Array<Schema.Struct<{
            readonly rosterId: Schema.String;
            readonly status: Schema.Literals<readonly ["completed", "reused", "waiting"]>;
            readonly message: Schema.optionalKey<Schema.String>;
            readonly refreshedPlayers: Schema.optionalKey<Schema.Number>;
            readonly failedPlayers: Schema.optionalKey<Schema.Number>;
            readonly refreshedAt: Schema.optionalKey<Schema.String>;
        }>>;
    }>, {
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
    readonly dashboardRosterMembershipValidate: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly serverId: Schema.String;
        readonly rosterIds: Schema.$Array<Schema.String>;
        readonly changes: Schema.$Array<Schema.Struct<{
            readonly action: Schema.Literals<readonly ["add", "remove", "move"]>;
            readonly playerTag: Schema.String;
            readonly fromRosterId: Schema.optionalKey<Schema.String>;
            readonly toRosterId: Schema.optionalKey<Schema.String>;
            readonly reason: Schema.optionalKey<Schema.String>;
        }>>;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"membershipProposal">;
        readonly changes: Schema.$Array<Schema.Struct<{
            readonly action: Schema.Literals<readonly ["add", "remove", "move"]>;
            readonly playerTag: Schema.String;
            readonly fromRosterId: Schema.optionalKey<Schema.String>;
            readonly toRosterId: Schema.optionalKey<Schema.String>;
            readonly reason: Schema.optionalKey<Schema.String>;
        }>>;
        readonly expectedRevisions: Schema.$Record<Schema.String, Schema.Number>;
        readonly generatedAt: Schema.String;
        readonly counts: Schema.Struct<{
            readonly add: Schema.Number;
            readonly move: Schema.Number;
            readonly remove: Schema.Number;
        }>;
        readonly items: Schema.$Array<Schema.Struct<{
            readonly action: Schema.Literals<readonly ["add", "move", "remove"]>;
            readonly playerTag: Schema.String;
            readonly fromRoster: Schema.String;
            readonly toRoster: Schema.String;
            readonly reason: Schema.String;
        }>>;
    }>, {
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
    readonly dashboardRosterQuestionnaire: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
        readonly server_id: Schema.String;
        readonly roster_id: Schema.String;
    }>, Schema.Struct<{
        readonly questions: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly label: Schema.String;
            readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
            readonly required: Schema.Boolean;
            readonly options: Schema.$Array<Schema.String>;
            readonly order: Schema.Number;
        }>>;
    }>, Schema.Struct<{
        readonly questionnaire: Schema.Struct<{
            readonly accountSelector: Schema.Struct<{
                readonly id: Schema.Literal<"account">;
                readonly type: Schema.Literal<"account">;
                readonly required: Schema.Literal<true>;
            }>;
            readonly questions: Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly label: Schema.String;
                readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
                readonly required: Schema.Boolean;
                readonly options: Schema.$Array<Schema.String>;
                readonly order: Schema.Number;
            }>>;
        }>;
        readonly affectedMemberCount: Schema.Number;
    }>, {
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
    readonly dashboardRosterSignupForm: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly serverId: Schema.String;
        readonly rosterId: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly accountSelector: Schema.Struct<{
            readonly id: Schema.Literal<"account">;
            readonly type: Schema.Literal<"account">;
            readonly required: Schema.Literal<true>;
        }>;
        readonly questions: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly label: Schema.String;
            readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
            readonly required: Schema.Boolean;
            readonly options: Schema.$Array<Schema.String>;
            readonly order: Schema.Number;
        }>>;
    }>, {
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
    readonly dashboardRosterSubmission: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly serverId: Schema.String;
        readonly rosterId: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{
        readonly playerTag: Schema.String;
        readonly answers: Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>;
        readonly discordUserId: Schema.optionalKey<Schema.String>;
        readonly discordUsername: Schema.optionalKey<Schema.String>;
        readonly discordAvatarUrl: Schema.optionalKey<Schema.String>;
    }>, Schema.Struct<{
        readonly submission: Schema.Struct<{
            readonly id: Schema.String;
            readonly rosterId: Schema.String;
            readonly playerTag: Schema.String;
            readonly answers: Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>;
            readonly createdAt: Schema.String;
            readonly updatedAt: Schema.String;
        }>;
    }>, {
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
    readonly dashboardRosterBuilderMissingMembers: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly serverId: Schema.String;
        readonly rosterId: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly items: Schema.$Array<Schema.Struct<{
            readonly playerTag: Schema.String;
            readonly playerName: Schema.String;
            readonly townhall: Schema.Number;
            readonly trophies: Schema.NullOr<Schema.Number>;
            readonly clanTag: Schema.NullOr<Schema.String>;
            readonly clanName: Schema.NullOr<Schema.String>;
            readonly discordUserId: Schema.NullOr<Schema.String>;
        }>>;
        readonly count: Schema.Number;
    }>, {
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
    readonly dashboardRosterRefreshData: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
        readonly server_id: Schema.String;
        readonly roster_id: Schema.String;
    }>, Schema.Struct<{
        readonly scope: Schema.Literals<readonly ["data", "role"]>;
    }>, Schema.Struct<{
        readonly refreshId: Schema.String;
        readonly scope: Schema.Literals<readonly ["data", "role"]>;
        readonly status: Schema.String;
        readonly refreshedPlayers: Schema.Number;
        readonly failedPlayers: Schema.Number;
        readonly refreshedAt: Schema.String;
        readonly reused: Schema.Boolean;
        readonly roleId: Schema.optionalKey<Schema.String>;
        readonly roleMemberUserIds: Schema.optionalKey<Schema.$Array<Schema.String>>;
    }>, {
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
    readonly dashboardRosterAIContext: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly serverId: Schema.String;
        readonly rosterIds: Schema.$Array<Schema.String>;
        readonly viewId: Schema.optionalKey<Schema.String>;
        readonly messages: Schema.$Array<Schema.Struct<{
            readonly id: Schema.optionalKey<Schema.String>;
            readonly role: Schema.Literals<readonly ["user", "assistant"]>;
            readonly content: Schema.optionalKey<Schema.String>;
            readonly parts: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly type: Schema.String;
                readonly text: Schema.optionalKey<Schema.String>;
                readonly toolCallId: Schema.optionalKey<Schema.String>;
                readonly state: Schema.optionalKey<Schema.String>;
                readonly input: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
                readonly approval: Schema.optionalKey<Schema.Struct<{
                    readonly id: Schema.String;
                    readonly approved: Schema.optionalKey<Schema.Boolean>;
                    readonly reason: Schema.optionalKey<Schema.String>;
                }>>;
            }>>>;
        }>>;
    }>, Schema.Struct<{
        readonly requestId: Schema.String;
        readonly model: Schema.Literal<"gpt-5.6-luna">;
        readonly budget: Schema.Struct<{
            readonly serverSpentUsd: Schema.Number;
            readonly serverLimitUsd: Schema.Number;
            readonly globalSpentUsd: Schema.Number;
            readonly globalLimitUsd: Schema.Number;
            readonly userSpentUsd: Schema.Number;
            readonly userLimitUsd: Schema.Number;
            readonly paidSpentUsd: Schema.Number;
            readonly paidLimitUsd: Schema.Number;
            readonly paidRemainingUsd: Schema.Number;
            readonly usesPaidPool: Schema.Boolean;
            readonly resetsAt: Schema.String;
        }>;
        readonly context: Schema.Struct<{
            readonly attachments: Schema.NullOr<Schema.$Array<Schema.Struct<{
                readonly rosterId: Schema.String;
                readonly alias: Schema.String;
                readonly clanTag: Schema.NullOr<Schema.String>;
                readonly memberCount: Schema.Number;
                readonly revision: Schema.Number;
                readonly signupQuestions: Schema.$Array<Schema.Struct<{
                    readonly id: Schema.String;
                    readonly label: Schema.String;
                    readonly type: Schema.Literals<readonly ["text", "boolean", "single_select"]>;
                    readonly required: Schema.Boolean;
                    readonly options: Schema.$Array<Schema.String>;
                    readonly order: Schema.Number;
                }>>;
            }>>>;
            readonly metrics: Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly label: Schema.String;
                readonly valueType: Schema.Literals<readonly ["string", "number", "boolean", "json", "time"]>;
                readonly kind: Schema.Literals<readonly ["snapshot", "historical", "derived", "presentation"]>;
                readonly description: Schema.String;
                readonly cacheTtlSeconds: Schema.Number;
                readonly dependsOn: Schema.optionalKey<Schema.$Array<Schema.String>>;
            }>>;
            readonly currentView: Schema.NullOr<Schema.Struct<{
                readonly id: Schema.String;
                readonly shareId: Schema.String;
                readonly serverId: Schema.String;
                readonly name: Schema.String;
                readonly sourceCode: Schema.String;
                readonly sourceVersion: Schema.Literal<1>;
                readonly createdBy: Schema.String;
                readonly spec: Schema.optionalKey<Schema.Struct<{
                    readonly schemaVersion: Schema.Literal<1>;
                    readonly columns: Schema.$Array<Schema.Struct<{
                        readonly id: Schema.String;
                        readonly label: Schema.String;
                        readonly metricId: Schema.String;
                        readonly description: Schema.optionalKey<Schema.String>;
                        readonly parameters: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>>;
                        readonly format: Schema.optionalKey<Schema.String>;
                    }>>;
                    readonly sort: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                        readonly columnId: Schema.String;
                        readonly direction: Schema.Literals<readonly ["asc", "desc"]>;
                    }>>>;
                    readonly filters: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                        readonly columnId: Schema.String;
                        readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                        readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
                    }>>>;
                    readonly highlights: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                        readonly id: Schema.String;
                        readonly target: Schema.Literals<readonly ["row", "column", "cell"]>;
                        readonly columnId: Schema.optionalKey<Schema.String>;
                        readonly when: Schema.optionalKey<Schema.Struct<{
                            readonly columnId: Schema.optionalKey<Schema.String>;
                            readonly operator: Schema.Literals<readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]>;
                            readonly value: Schema.Codec<Schema.Json, Schema.Json, never, never>;
                        }>>;
                        readonly tone: Schema.Literals<readonly ["red", "amber", "green", "blue", "purple", "gray"]>;
                    }>>>;
                    readonly limit: Schema.optionalKey<Schema.Number>;
                }>>;
                readonly createdAt: Schema.String;
                readonly updatedAt: Schema.String;
            }>>;
        }>;
    }>, {
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
    readonly dashboardRosterAIUsage: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly requestId: Schema.String;
        readonly model: Schema.Literal<"gpt-5.6-luna">;
        readonly usage: Schema.Struct<{
            readonly inputTokens: Schema.Number;
            readonly cachedInputTokens: Schema.Number;
            readonly cacheWriteTokens: Schema.Number;
            readonly outputTokens: Schema.Number;
            readonly reasoningTokens: Schema.Number;
        }>;
        readonly steps: Schema.$Array<Schema.Struct<{
            readonly inputTokens: Schema.Number;
            readonly cachedInputTokens: Schema.Number;
            readonly cacheWriteTokens: Schema.Number;
            readonly outputTokens: Schema.Number;
            readonly reasoningTokens: Schema.Number;
        }>>;
    }>, Schema.Void, {
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
};
//# sourceMappingURL=dashboard-roster-extra.d.ts.map