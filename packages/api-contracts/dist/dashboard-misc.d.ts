import { Schema } from "effect";
export declare const DashboardAuthUserInfo: Schema.Struct<{
    readonly user_id: Schema.String;
    readonly username: Schema.String;
    readonly avatar_url: Schema.String;
    readonly auth_methods: Schema.$Array<Schema.String>;
}>;
export declare const DashboardUserAccountSummary: Schema.Struct<{
    readonly follower_count: Schema.Number;
}>;
export declare const DashboardCurrentUserInfo: Schema.Struct<{
    readonly user_id: Schema.String;
    readonly username: Schema.String;
    readonly avatar_url: Schema.String;
    readonly auth_methods: Schema.$Array<Schema.String>;
    readonly account_summary: Schema.Struct<{
        readonly follower_count: Schema.Number;
    }>;
}>;
export declare const DashboardAuthWebResponse: Schema.Struct<{
    readonly access_token: Schema.String;
    readonly user: Schema.Struct<{
        readonly user_id: Schema.String;
        readonly username: Schema.String;
        readonly avatar_url: Schema.String;
        readonly auth_methods: Schema.$Array<Schema.String>;
    }>;
}>;
export declare const DashboardAuthWebRefreshResponse: Schema.Struct<{
    readonly access_token: Schema.String;
}>;
export declare const DashboardAuthVerificationResponse: Schema.Struct<{
    readonly message: Schema.String;
    readonly verification_code: Schema.optionalKey<Schema.String>;
}>;
export declare const DashboardAuthForgotPasswordResponse: Schema.Struct<{
    readonly message: Schema.String;
    readonly reset_code: Schema.optionalKey<Schema.String>;
}>;
export declare const DashboardBillingSubscription: Schema.Struct<{
    readonly provider: Schema.Literal<"stripe">;
    readonly status: Schema.String;
    readonly active: Schema.Boolean;
    readonly checkoutEnabled: Schema.Boolean;
    readonly bookmarkNotificationsLimit: Schema.Number;
    readonly rosterAssistantMonthlyCreditUsd: Schema.Number;
    readonly assignedServerId: Schema.NullOr<Schema.String>;
    readonly rosterAssistantSpentUsd: Schema.Number;
    readonly rosterAssistantRemainingUsd: Schema.Number;
}>;
export declare const DashboardBillingSession: Schema.Struct<{
    readonly url: Schema.String;
}>;
export declare const DashboardBillingUsage: Schema.Struct<{
    readonly serverId: Schema.String;
    readonly serverSpentUsd: Schema.Number;
    readonly serverLimitUsd: Schema.Number;
    readonly userSpentUsd: Schema.Number;
    readonly userLimitUsd: Schema.Number;
    readonly globalFreeAvailable: Schema.Boolean;
    readonly subscriptionActive: Schema.Boolean;
    readonly assignedSubscriberCount: Schema.Number;
    readonly paidLimitUsd: Schema.Number;
    readonly paidSpentUsd: Schema.Number;
    readonly paidRemainingUsd: Schema.Number;
    readonly resetsAt: Schema.String;
}>;
export declare const DashboardBillingCheckoutRequest: Schema.Struct<{
    readonly serverId: Schema.String;
}>;
export declare const DashboardBillingAssignmentRequest: Schema.Struct<{
    readonly serverId: Schema.NullOr<Schema.String>;
}>;
export declare const DashboardBillingSubscriptionEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly provider: Schema.Literal<"stripe">;
    readonly status: Schema.String;
    readonly active: Schema.Boolean;
    readonly checkoutEnabled: Schema.Boolean;
    readonly bookmarkNotificationsLimit: Schema.Number;
    readonly rosterAssistantMonthlyCreditUsd: Schema.Number;
    readonly assignedServerId: Schema.NullOr<Schema.String>;
    readonly rosterAssistantSpentUsd: Schema.Number;
    readonly rosterAssistantRemainingUsd: Schema.Number;
}>, readonly []>;
export declare const DashboardBillingCheckoutEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{
    readonly url: Schema.String;
}>, readonly []>;
export declare const DashboardBillingPortalEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly url: Schema.String;
}>, readonly []>;
export declare const DashboardBillingUsageEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly serverId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly serverId: Schema.String;
    readonly serverSpentUsd: Schema.Number;
    readonly serverLimitUsd: Schema.Number;
    readonly userSpentUsd: Schema.Number;
    readonly userLimitUsd: Schema.Number;
    readonly globalFreeAvailable: Schema.Boolean;
    readonly subscriptionActive: Schema.Boolean;
    readonly assignedSubscriberCount: Schema.Number;
    readonly paidLimitUsd: Schema.Number;
    readonly paidSpentUsd: Schema.Number;
    readonly paidRemainingUsd: Schema.Number;
    readonly resetsAt: Schema.String;
}>, readonly []>;
export declare const DashboardBillingAssignmentEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly serverId: Schema.NullOr<Schema.String>;
}>, Schema.Void, readonly []>;
export declare const DashboardCocAccountRequest: Schema.Struct<{
    readonly player_tag: Schema.String;
    readonly api_token: Schema.optionalKey<Schema.String>;
}>;
export declare const DashboardLinkedPlayer: Schema.Struct<{
    readonly tag: Schema.String;
    readonly name: Schema.String;
    readonly townHallLevel: Schema.Number;
    readonly is_verified: Schema.Boolean;
    readonly hidden: Schema.Boolean;
}>;
export declare const DashboardLinkResponse: Schema.Struct<{
    readonly message: Schema.String;
    readonly account: Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly townHallLevel: Schema.Number;
        readonly is_verified: Schema.Boolean;
        readonly hidden: Schema.Boolean;
    }>;
}>;
export declare const DashboardLinkedAccount: Schema.Struct<{
    readonly user_id: Schema.String;
    readonly player_tag: Schema.String;
    readonly order_index: Schema.Number;
    readonly is_verified: Schema.Boolean;
    readonly hidden: Schema.Boolean;
    readonly added_at: Schema.String;
    readonly verified_at: Schema.optionalKey<Schema.String>;
    readonly last_login: Schema.optionalKey<Schema.NullOr<Schema.String>>;
}>;
export declare const DashboardLinkedAccountsResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly user_id: Schema.String;
        readonly player_tag: Schema.String;
        readonly order_index: Schema.Number;
        readonly is_verified: Schema.Boolean;
        readonly hidden: Schema.Boolean;
        readonly added_at: Schema.String;
        readonly verified_at: Schema.optionalKey<Schema.String>;
        readonly last_login: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    }>>;
}>;
export declare const DashboardMessageResponse: Schema.Struct<{
    readonly message: Schema.String;
}>;
export declare const DashboardLinkVisibilityRequest: Schema.Struct<{
    readonly hidden: Schema.Boolean;
}>;
export declare const DashboardReorderAccountsRequest: Schema.Struct<{
    readonly ordered_tags: Schema.$Array<Schema.String>;
}>;
export declare const DashboardLinksListEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly userId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly user_id: Schema.String;
        readonly player_tag: Schema.String;
        readonly order_index: Schema.Number;
        readonly is_verified: Schema.Boolean;
        readonly hidden: Schema.Boolean;
        readonly added_at: Schema.String;
        readonly verified_at: Schema.optionalKey<Schema.String>;
        readonly last_login: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    }>>;
}>, readonly []>;
export declare const DashboardLinksAddEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly userId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly player_tag: Schema.String;
    readonly api_token: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly account: Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly townHallLevel: Schema.Number;
        readonly is_verified: Schema.Boolean;
        readonly hidden: Schema.Boolean;
    }>;
}>, readonly []>;
export declare const DashboardLinksRemoveEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly userId: Schema.String;
    readonly playerTag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly message: Schema.String;
}>, readonly []>;
export declare const DashboardLinksVisibilityEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly userId: Schema.String;
    readonly playerTag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly hidden: Schema.Boolean;
}>, Schema.Struct<{
    readonly user_id: Schema.String;
    readonly player_tag: Schema.String;
    readonly order_index: Schema.Number;
    readonly is_verified: Schema.Boolean;
    readonly hidden: Schema.Boolean;
    readonly added_at: Schema.String;
    readonly verified_at: Schema.optionalKey<Schema.String>;
    readonly last_login: Schema.optionalKey<Schema.NullOr<Schema.String>>;
}>, readonly []>;
export declare const DashboardLinksOrderEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly userId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly ordered_tags: Schema.$Array<Schema.String>;
}>, Schema.Struct<{
    readonly message: Schema.String;
}>, readonly []>;
export declare const DashboardSearchLocation: Schema.Struct<{
    readonly id: Schema.Number;
    readonly name: Schema.String;
    readonly isCountry: Schema.Boolean;
    readonly countryCode: Schema.optionalKey<Schema.String>;
    readonly localizedName: Schema.optionalKey<Schema.String>;
}>;
export declare const DashboardSearchLeagueReference: Schema.Struct<{
    readonly id: Schema.Number;
    readonly name: Schema.String;
}>;
export declare const DashboardClanSearchResult: Schema.Struct<{
    readonly name: Schema.String;
    readonly tag: Schema.String;
    readonly badge: Schema.optionalKey<Schema.String>;
    readonly clanLevel: Schema.Number;
    readonly location: Schema.optionalKey<Schema.Struct<{
        readonly id: Schema.Number;
        readonly name: Schema.String;
        readonly isCountry: Schema.Boolean;
        readonly countryCode: Schema.optionalKey<Schema.String>;
        readonly localizedName: Schema.optionalKey<Schema.String>;
    }>>;
    readonly warLeague: Schema.optionalKey<Schema.Struct<{
        readonly id: Schema.Number;
        readonly name: Schema.String;
    }>>;
    readonly members: Schema.Number;
}>;
export declare const DashboardSearchCursorPage: Schema.Struct<{
    readonly limit: Schema.Number;
    readonly hasMore: Schema.Boolean;
    readonly nextCursor: Schema.NullOr<Schema.String>;
}>;
export declare const DashboardClanSearchResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly name: Schema.String;
        readonly tag: Schema.String;
        readonly badge: Schema.optionalKey<Schema.String>;
        readonly clanLevel: Schema.Number;
        readonly location: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly isCountry: Schema.Boolean;
            readonly countryCode: Schema.optionalKey<Schema.String>;
            readonly localizedName: Schema.optionalKey<Schema.String>;
        }>>;
        readonly warLeague: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
        }>>;
        readonly members: Schema.Number;
    }>>;
    readonly pagination: Schema.Struct<{
        readonly limit: Schema.Number;
        readonly hasMore: Schema.Boolean;
        readonly nextCursor: Schema.NullOr<Schema.String>;
    }>;
}>;
export declare const DashboardClanSearchEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly query: Schema.String;
    readonly locationIds: Schema.optionalKey<Schema.$Array<Schema.Number>>;
    readonly warLeagueIds: Schema.optionalKey<Schema.$Array<Schema.Number>>;
    readonly "clanLevel[min]": Schema.optionalKey<Schema.Number>;
    readonly "clanLevel[max]": Schema.optionalKey<Schema.Number>;
    readonly "members[min]": Schema.optionalKey<Schema.Number>;
    readonly "members[max]": Schema.optionalKey<Schema.Number>;
    readonly limit: Schema.optionalKey<Schema.Number>;
    readonly cursor: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly name: Schema.String;
        readonly tag: Schema.String;
        readonly badge: Schema.optionalKey<Schema.String>;
        readonly clanLevel: Schema.Number;
        readonly location: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
            readonly isCountry: Schema.Boolean;
            readonly countryCode: Schema.optionalKey<Schema.String>;
            readonly localizedName: Schema.optionalKey<Schema.String>;
        }>>;
        readonly warLeague: Schema.optionalKey<Schema.Struct<{
            readonly id: Schema.Number;
            readonly name: Schema.String;
        }>>;
        readonly members: Schema.Number;
    }>>;
    readonly pagination: Schema.Struct<{
        readonly limit: Schema.Number;
        readonly hasMore: Schema.Boolean;
        readonly nextCursor: Schema.NullOr<Schema.String>;
    }>;
}>, readonly []>;
export declare const DashboardCwlBonusRecipient: Schema.Struct<{
    readonly playerTag: Schema.String;
    readonly medalCount: Schema.Number;
}>;
export declare const DashboardCwlBonusRecipientsResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly playerTag: Schema.String;
        readonly medalCount: Schema.Number;
    }>>;
}>;
export declare const DashboardReplaceCwlBonusRecipientsRequest: Schema.Struct<{
    readonly recipients: Schema.$Array<Schema.Struct<{
        readonly playerTag: Schema.String;
        readonly medalCount: Schema.Number;
    }>>;
}>;
export declare const DashboardCwlBonusRecipientsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly clanTag: Schema.String;
}>, Schema.Struct<{
    readonly season: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly playerTag: Schema.String;
        readonly medalCount: Schema.Number;
    }>>;
}>, readonly []>;
export declare const DashboardReplaceCwlBonusRecipientsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly serverId: Schema.String;
    readonly clanTag: Schema.String;
}>, Schema.Struct<{
    readonly season: Schema.String;
}>, Schema.Struct<{
    readonly recipients: Schema.$Array<Schema.Struct<{
        readonly playerTag: Schema.String;
        readonly medalCount: Schema.Number;
    }>>;
}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly playerTag: Schema.String;
        readonly medalCount: Schema.Number;
    }>>;
}>, readonly []>;
export declare const DashboardDateItemsResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.String>;
}>;
export declare const DashboardCurrentDatesResponse: Schema.Struct<{
    readonly season: Schema.String;
    readonly raid: Schema.String;
    readonly legend: Schema.String;
    readonly "clan-games": Schema.String;
}>;
export declare const DashboardSeasonBoundsResponse: Schema.Struct<{
    readonly season_start: Schema.String;
    readonly season_end: Schema.String;
}>;
export declare const DashboardSeasonDatesEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly number_of_seasons: Schema.optionalKey<Schema.Number>;
    readonly as_text: Schema.optionalKey<Schema.Boolean>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.String>;
}>, readonly []>;
export declare const DashboardRaidWeekendDatesEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly number_of_weeks: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.String>;
}>, readonly []>;
export declare const DashboardCurrentDatesEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly season: Schema.String;
    readonly raid: Schema.String;
    readonly legend: Schema.String;
    readonly "clan-games": Schema.String;
}>, readonly []>;
export declare const DashboardSeasonBoundsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly season: Schema.optionalKey<Schema.String>;
    readonly gold_pass_season: Schema.optionalKey<Schema.Boolean>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly season_start: Schema.String;
    readonly season_end: Schema.String;
}>, readonly []>;
export declare const DashboardSeasonRaidDatesEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly season: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.String>;
}>, readonly []>;
export declare const DashboardStaticCategoryNamesResponse: Schema.$Array<Schema.String>;
export declare const DashboardStaticMaxLevelResponse: Schema.Struct<{
    readonly name: Schema.String;
    readonly max_level: Schema.Number;
}>;
export declare const DashboardStaticCategoryNamesEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly category: Schema.String;
}>, Schema.Struct<{
    readonly locale: Schema.optionalKey<Schema.String>;
    readonly name: Schema.optionalKey<Schema.String>;
    readonly village: Schema.optionalKey<Schema.String>;
    readonly type: Schema.optionalKey<Schema.String>;
    readonly category: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{}>, Schema.$Array<Schema.String>, readonly []>;
export declare const DashboardStaticMaxLevelEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly category: Schema.String;
    readonly itemIdOrName: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly name: Schema.String;
    readonly max_level: Schema.Number;
}>, readonly []>;
export declare const DashboardCdnUploadResponse: Schema.Struct<{
    readonly url: Schema.String;
    readonly filename: Schema.String;
}>;
export declare const DashboardCdnUploadEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.FormData, Schema.Struct<{
    readonly url: Schema.String;
    readonly filename: Schema.String;
}>, readonly []>;
export declare const DashboardDiscohookResolveResponse: Schema.Union<readonly [Schema.Struct<{
    readonly payload: Schema.Codec<Schema.Json, Schema.Json, never, never>;
}>, Schema.Struct<{
    readonly resolvedUrl: Schema.String;
}>]>;
export declare const DashboardDiscohookResolveEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly url: Schema.String;
}>, Schema.Struct<{}>, Schema.Union<readonly [Schema.Struct<{
    readonly payload: Schema.Codec<Schema.Json, Schema.Json, never, never>;
}>, Schema.Struct<{
    readonly resolvedUrl: Schema.String;
}>]>, readonly []>;
//# sourceMappingURL=dashboard-misc.d.ts.map