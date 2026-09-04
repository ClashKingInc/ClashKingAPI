import { Schema } from "effect";
export declare const RosterCapacity: Schema.Number;
export declare const RosterMemberGroup: Schema.Struct<{
    readonly id: Schema.String;
    readonly name: Schema.String;
    readonly position: Schema.Number;
}>;
export declare const RosterMemberGroupSetting: Schema.Struct<{
    readonly id: Schema.String;
    readonly name: Schema.String;
    readonly position: Schema.Number;
    readonly signup_enabled: Schema.Boolean;
    readonly role_id: Schema.NullOr<Schema.String>;
}>;
export declare const RosterBuilderMemberGroupSetting: Schema.Struct<{
    readonly id: Schema.String;
    readonly name: Schema.String;
    readonly position: Schema.Number;
    readonly signupEnabled: Schema.Boolean;
    readonly roleId: Schema.NullOr<Schema.String>;
}>;
export declare const RosterMemberGroupSettingsRequest: Schema.Struct<{
    readonly groups: Schema.$Array<Schema.Struct<{
        readonly member_group_id: Schema.String;
        readonly signup_enabled: Schema.Boolean;
        readonly position: Schema.Number;
        readonly role_id: Schema.NullOr<Schema.String>;
    }>>;
}>;
export declare const DashboardRosterMemberGroupsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly name: Schema.String;
        readonly position: Schema.Number;
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
export declare const DashboardCreateRosterMemberGroupEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly name: Schema.String;
    readonly position: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{
    readonly group: Schema.Struct<{
        readonly id: Schema.String;
        readonly name: Schema.String;
        readonly position: Schema.Number;
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
export declare const DashboardUpdateRosterMemberGroupEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly memberGroupId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly name: Schema.optionalKey<Schema.String>;
    readonly position: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{
    readonly group: Schema.Struct<{
        readonly id: Schema.String;
        readonly name: Schema.String;
        readonly position: Schema.Number;
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
export declare const DashboardDeleteRosterMemberGroupEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly memberGroupId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Void, {
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
export declare const DashboardReplaceRosterMemberGroupsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly rosterId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly groups: Schema.$Array<Schema.Struct<{
        readonly member_group_id: Schema.String;
        readonly signup_enabled: Schema.Boolean;
        readonly position: Schema.Number;
        readonly role_id: Schema.NullOr<Schema.String>;
    }>>;
}>, Schema.Struct<{
    readonly groups: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly name: Schema.String;
        readonly position: Schema.Number;
        readonly signup_enabled: Schema.Boolean;
        readonly role_id: Schema.NullOr<Schema.String>;
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
export declare const rosterConfigurationEndpoints: {
    readonly dashboardRosterMemberGroups: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly serverId: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly items: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly name: Schema.String;
            readonly position: Schema.Number;
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
    readonly dashboardCreateRosterMemberGroup: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly serverId: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{
        readonly name: Schema.String;
        readonly position: Schema.optionalKey<Schema.Number>;
    }>, Schema.Struct<{
        readonly group: Schema.Struct<{
            readonly id: Schema.String;
            readonly name: Schema.String;
            readonly position: Schema.Number;
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
    readonly dashboardUpdateRosterMemberGroup: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly serverId: Schema.String;
        readonly memberGroupId: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{
        readonly name: Schema.optionalKey<Schema.String>;
        readonly position: Schema.optionalKey<Schema.Number>;
    }>, Schema.Struct<{
        readonly group: Schema.Struct<{
            readonly id: Schema.String;
            readonly name: Schema.String;
            readonly position: Schema.Number;
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
    readonly dashboardDeleteRosterMemberGroup: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly serverId: Schema.String;
        readonly memberGroupId: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Void, {
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
    readonly dashboardReplaceRosterMemberGroups: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly serverId: Schema.String;
        readonly rosterId: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{
        readonly groups: Schema.$Array<Schema.Struct<{
            readonly member_group_id: Schema.String;
            readonly signup_enabled: Schema.Boolean;
            readonly position: Schema.Number;
            readonly role_id: Schema.NullOr<Schema.String>;
        }>>;
    }>, Schema.Struct<{
        readonly groups: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly name: Schema.String;
            readonly position: Schema.Number;
            readonly signup_enabled: Schema.Boolean;
            readonly role_id: Schema.NullOr<Schema.String>;
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
};
//# sourceMappingURL=roster-configuration.d.ts.map