import { Schema } from "effect";
import { defineEndpoint, NoBody, NoContent, NoPathParams, NoQuery } from "./endpoint.js";
const OptionalNumber = Schema.optionalKey(Schema.Number);
const OptionalString = Schema.optionalKey(Schema.String);
const NullableString = Schema.NullOr(Schema.String);
export const DashboardAuthUserInfo = Schema.Struct({
    user_id: Schema.String,
    username: Schema.String,
    avatar_url: Schema.String,
    auth_methods: Schema.Array(Schema.String),
});
export const DashboardUserAccountSummary = Schema.Struct({
    follower_count: Schema.Number,
});
export const DashboardCurrentUserInfo = Schema.Struct({
    ...DashboardAuthUserInfo.fields,
    account_summary: DashboardUserAccountSummary,
});
export const DashboardAuthWebResponse = Schema.Struct({
    access_token: Schema.String,
    user: DashboardAuthUserInfo,
});
export const DashboardAuthWebRefreshResponse = Schema.Struct({
    access_token: Schema.String,
});
export const DashboardAuthVerificationResponse = Schema.Struct({
    message: Schema.String,
    verification_code: Schema.optionalKey(Schema.String),
});
export const DashboardAuthForgotPasswordResponse = Schema.Struct({
    message: Schema.String,
    reset_code: Schema.optionalKey(Schema.String),
});
export const DashboardBillingSubscription = Schema.Struct({
    provider: Schema.Literal("stripe"),
    status: Schema.String,
    active: Schema.Boolean,
    checkoutEnabled: Schema.Boolean,
    bookmarkNotificationsLimit: Schema.Number,
    rosterAssistantMonthlyCreditUsd: Schema.Number,
    assignedServerId: NullableString,
    rosterAssistantSpentUsd: Schema.Number,
    rosterAssistantRemainingUsd: Schema.Number,
});
export const DashboardBillingSession = Schema.Struct({
    url: Schema.String,
});
export const DashboardBillingUsage = Schema.Struct({
    serverId: Schema.String,
    serverSpentUsd: Schema.Number,
    serverLimitUsd: Schema.Number,
    userSpentUsd: Schema.Number,
    userLimitUsd: Schema.Number,
    globalFreeAvailable: Schema.Boolean,
    subscriptionActive: Schema.Boolean,
    assignedSubscriberCount: Schema.Number,
    paidLimitUsd: Schema.Number,
    paidSpentUsd: Schema.Number,
    paidRemainingUsd: Schema.Number,
    resetsAt: Schema.String,
});
export const DashboardBillingCheckoutRequest = Schema.Struct({
    serverId: Schema.String,
});
export const DashboardBillingAssignmentRequest = Schema.Struct({
    serverId: NullableString,
});
export const DashboardBillingSubscriptionEndpoint = defineEndpoint({
    operationId: "dashboardBillingSubscription",
    method: "GET",
    path: "/v2/billing/subscription",
    auth: "user",
    summary: "Get the current Dashboard subscription entitlement",
    pathParams: NoPathParams,
    query: NoQuery,
    body: NoBody,
    bodyMode: "none",
    response: DashboardBillingSubscription,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardBillingCheckoutEndpoint = defineEndpoint({
    operationId: "dashboardBillingCheckout",
    method: "POST",
    path: "/v2/billing/stripe/checkout",
    auth: "user",
    summary: "Create a Stripe Checkout session",
    pathParams: NoPathParams,
    query: NoQuery,
    body: DashboardBillingCheckoutRequest,
    bodyMode: "json",
    response: DashboardBillingSession,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardBillingPortalEndpoint = defineEndpoint({
    operationId: "dashboardBillingPortal",
    method: "POST",
    path: "/v2/billing/stripe/portal",
    auth: "user",
    summary: "Create a Stripe customer portal session",
    pathParams: NoPathParams,
    query: NoQuery,
    body: NoBody,
    bodyMode: "none",
    response: DashboardBillingSession,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardBillingUsageEndpoint = defineEndpoint({
    operationId: "dashboardBillingUsage",
    method: "GET",
    path: "/v2/billing/usage",
    auth: "user",
    summary: "Get monthly roster assistant usage",
    pathParams: NoPathParams,
    query: Schema.Struct({ serverId: Schema.String }),
    body: NoBody,
    bodyMode: "none",
    response: DashboardBillingUsage,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardBillingAssignmentEndpoint = defineEndpoint({
    operationId: "dashboardBillingAssignment",
    method: "PUT",
    path: "/v2/billing/subscription/assignment",
    auth: "user",
    summary: "Assign subscription roster assistant credit",
    pathParams: NoPathParams,
    query: NoQuery,
    body: DashboardBillingAssignmentRequest,
    bodyMode: "json",
    response: NoContent,
    responseMode: "none",
    successStatus: 204,
    errors: [],
});
export const DashboardCocAccountRequest = Schema.Struct({
    player_tag: Schema.String,
    api_token: Schema.optionalKey(Schema.String),
});
export const DashboardLinkedPlayer = Schema.Struct({
    tag: Schema.String,
    name: Schema.String,
    townHallLevel: Schema.Number,
    is_verified: Schema.Boolean,
    hidden: Schema.Boolean,
});
export const DashboardLinkResponse = Schema.Struct({
    message: Schema.String,
    account: DashboardLinkedPlayer,
});
export const DashboardLinkedAccount = Schema.Struct({
    user_id: Schema.String,
    player_tag: Schema.String,
    order_index: Schema.Number,
    is_verified: Schema.Boolean,
    hidden: Schema.Boolean,
    added_at: Schema.String,
    verified_at: Schema.optionalKey(Schema.String),
    last_login: Schema.optionalKey(Schema.NullOr(Schema.String)),
});
export const DashboardLinkedAccountsResponse = Schema.Struct({
    items: Schema.Array(DashboardLinkedAccount),
});
export const DashboardMessageResponse = Schema.Struct({
    message: Schema.String,
});
export const DashboardLinkVisibilityRequest = Schema.Struct({
    hidden: Schema.Boolean,
});
export const DashboardReorderAccountsRequest = Schema.Struct({
    ordered_tags: Schema.Array(Schema.String),
});
const DashboardLinkSubjectPath = Schema.Struct({ userId: Schema.String });
const DashboardLinkedPlayerPath = Schema.Struct({
    userId: Schema.String,
    playerTag: Schema.String,
});
export const DashboardLinksListEndpoint = defineEndpoint({
    operationId: "dashboardLinksList",
    method: "GET",
    path: "/v2/links/:userId",
    auth: "user-or-bot",
    summary: "List linked Clash accounts",
    pathParams: DashboardLinkSubjectPath,
    query: NoQuery,
    body: NoBody,
    bodyMode: "none",
    response: DashboardLinkedAccountsResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardLinksAddEndpoint = defineEndpoint({
    operationId: "dashboardLinksAdd",
    method: "POST",
    path: "/v2/links/:userId",
    auth: "user-or-bot",
    summary: "Link a Clash account",
    pathParams: DashboardLinkSubjectPath,
    query: NoQuery,
    body: DashboardCocAccountRequest,
    bodyMode: "json",
    response: DashboardLinkResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardLinksRemoveEndpoint = defineEndpoint({
    operationId: "dashboardLinksRemove",
    method: "DELETE",
    path: "/v2/links/:userId/:playerTag",
    auth: "user-or-bot",
    summary: "Remove a linked Clash account",
    pathParams: DashboardLinkedPlayerPath,
    query: NoQuery,
    body: NoBody,
    bodyMode: "none",
    response: DashboardMessageResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardLinksVisibilityEndpoint = defineEndpoint({
    operationId: "dashboardLinksVisibility",
    method: "PATCH",
    path: "/v2/links/:userId/:playerTag",
    auth: "user-or-bot",
    summary: "Update linked-account visibility",
    pathParams: DashboardLinkedPlayerPath,
    query: NoQuery,
    body: DashboardLinkVisibilityRequest,
    bodyMode: "json",
    response: DashboardLinkedAccount,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardLinksOrderEndpoint = defineEndpoint({
    operationId: "dashboardLinksOrder",
    method: "PUT",
    path: "/v2/links/:userId/order",
    auth: "user-or-bot",
    summary: "Reorder linked Clash accounts",
    pathParams: DashboardLinkSubjectPath,
    query: NoQuery,
    body: DashboardReorderAccountsRequest,
    bodyMode: "json",
    response: DashboardMessageResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardSearchLocation = Schema.Struct({
    id: Schema.Number,
    name: Schema.String,
    isCountry: Schema.Boolean,
    countryCode: OptionalString,
    localizedName: OptionalString,
});
export const DashboardSearchLeagueReference = Schema.Struct({
    id: Schema.Number,
    name: Schema.String,
});
export const DashboardClanSearchResult = Schema.Struct({
    name: Schema.String,
    tag: Schema.String,
    badge: OptionalString,
    clanLevel: Schema.Number,
    location: Schema.optionalKey(DashboardSearchLocation),
    warLeague: Schema.optionalKey(DashboardSearchLeagueReference),
    members: Schema.Number,
});
export const DashboardSearchCursorPage = Schema.Struct({
    limit: Schema.Number,
    hasMore: Schema.Boolean,
    nextCursor: Schema.NullOr(Schema.String),
});
export const DashboardClanSearchResponse = Schema.Struct({
    items: Schema.Array(DashboardClanSearchResult),
    pagination: DashboardSearchCursorPage,
});
export const DashboardClanSearchEndpoint = defineEndpoint({
    operationId: "dashboardClanSearch",
    method: "GET",
    path: "/v2/clan/search",
    auth: "public",
    summary: "Search clans by name or tag",
    pathParams: NoPathParams,
    query: Schema.Struct({
        query: Schema.String,
        locationIds: Schema.optionalKey(Schema.Array(Schema.Number)),
        warLeagueIds: Schema.optionalKey(Schema.Array(Schema.Number)),
        "clanLevel[min]": OptionalNumber,
        "clanLevel[max]": OptionalNumber,
        "members[min]": OptionalNumber,
        "members[max]": OptionalNumber,
        limit: OptionalNumber,
        cursor: OptionalString,
    }),
    body: NoBody,
    bodyMode: "none",
    response: DashboardClanSearchResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardCwlBonusRecipient = Schema.Struct({
    playerTag: Schema.String,
    medalCount: Schema.Number,
});
export const DashboardCwlBonusRecipientsResponse = Schema.Struct({
    items: Schema.Array(DashboardCwlBonusRecipient),
});
export const DashboardReplaceCwlBonusRecipientsRequest = Schema.Struct({
    recipients: Schema.Array(DashboardCwlBonusRecipient),
});
const DashboardCwlBonusPath = Schema.Struct({
    serverId: Schema.String,
    clanTag: Schema.String,
});
const DashboardCwlBonusQuery = Schema.Struct({ season: Schema.String });
export const DashboardCwlBonusRecipientsEndpoint = defineEndpoint({
    operationId: "dashboardCwlBonusRecipients",
    method: "GET",
    path: "/v2/server/:serverId/cwl/:clanTag/bonus-recipients",
    auth: "server-read",
    summary: "Get saved CWL bonus recipients",
    pathParams: DashboardCwlBonusPath,
    query: DashboardCwlBonusQuery,
    body: NoBody,
    bodyMode: "none",
    response: DashboardCwlBonusRecipientsResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardReplaceCwlBonusRecipientsEndpoint = defineEndpoint({
    operationId: "dashboardReplaceCwlBonusRecipients",
    method: "PUT",
    path: "/v2/server/:serverId/cwl/:clanTag/bonus-recipients",
    auth: "server-write",
    summary: "Replace saved CWL bonus recipients",
    pathParams: DashboardCwlBonusPath,
    query: DashboardCwlBonusQuery,
    body: DashboardReplaceCwlBonusRecipientsRequest,
    bodyMode: "json",
    response: DashboardCwlBonusRecipientsResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardDateItemsResponse = Schema.Struct({
    items: Schema.Array(Schema.String),
});
export const DashboardCurrentDatesResponse = Schema.Struct({
    season: Schema.String,
    raid: Schema.String,
    legend: Schema.String,
    "clan-games": Schema.String,
});
export const DashboardSeasonBoundsResponse = Schema.Struct({
    season_start: Schema.String,
    season_end: Schema.String,
});
export const DashboardSeasonDatesEndpoint = defineEndpoint({
    operationId: "dashboardSeasonDates",
    method: "GET",
    path: "/v2/dates/seasons",
    auth: "public",
    summary: "Get season date identifiers",
    pathParams: NoPathParams,
    query: Schema.Struct({
        number_of_seasons: OptionalNumber,
        as_text: Schema.optionalKey(Schema.Boolean),
    }),
    body: NoBody,
    bodyMode: "none",
    response: DashboardDateItemsResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardRaidWeekendDatesEndpoint = defineEndpoint({
    operationId: "dashboardRaidWeekendDates",
    method: "GET",
    path: "/v2/dates/raid-weekends",
    auth: "public",
    summary: "Get raid weekend date identifiers",
    pathParams: NoPathParams,
    query: Schema.Struct({ number_of_weeks: OptionalNumber }),
    body: NoBody,
    bodyMode: "none",
    response: DashboardDateItemsResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardCurrentDatesEndpoint = defineEndpoint({
    operationId: "dashboardCurrentDates",
    method: "GET",
    path: "/v2/dates/current",
    auth: "public",
    summary: "Get current Clash event dates",
    pathParams: NoPathParams,
    query: NoQuery,
    body: NoBody,
    bodyMode: "none",
    response: DashboardCurrentDatesResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardSeasonBoundsEndpoint = defineEndpoint({
    operationId: "dashboardSeasonBounds",
    method: "GET",
    path: "/v2/dates/season-start-end",
    auth: "public",
    summary: "Get season start and end timestamps",
    pathParams: NoPathParams,
    query: Schema.Struct({
        season: OptionalString,
        gold_pass_season: Schema.optionalKey(Schema.Boolean),
    }),
    body: NoBody,
    bodyMode: "none",
    response: DashboardSeasonBoundsResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardSeasonRaidDatesEndpoint = defineEndpoint({
    operationId: "dashboardSeasonRaidDates",
    method: "GET",
    path: "/v2/dates/season-raid-dates",
    auth: "public",
    summary: "Get raid weekend dates within a season",
    pathParams: NoPathParams,
    query: Schema.Struct({ season: OptionalString }),
    body: NoBody,
    bodyMode: "none",
    response: DashboardDateItemsResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardStaticCategoryNamesResponse = Schema.Array(Schema.String);
export const DashboardStaticMaxLevelResponse = Schema.Struct({
    name: Schema.String,
    max_level: Schema.Number,
});
export const DashboardStaticCategoryNamesEndpoint = defineEndpoint({
    operationId: "dashboardStaticCategoryNames",
    method: "GET",
    path: "/v2/static/:category/names",
    auth: "public",
    summary: "Get names from one static-data category",
    pathParams: Schema.Struct({ category: Schema.String }),
    query: Schema.Struct({
        locale: OptionalString,
        name: OptionalString,
        village: OptionalString,
        type: OptionalString,
        category: OptionalString,
    }),
    body: NoBody,
    bodyMode: "none",
    response: DashboardStaticCategoryNamesResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardStaticMaxLevelEndpoint = defineEndpoint({
    operationId: "dashboardStaticMaxLevel",
    method: "GET",
    path: "/v2/static/:category/:itemIdOrName/max-level",
    auth: "public",
    summary: "Get the maximum level for one static-data item",
    pathParams: Schema.Struct({
        category: Schema.String,
        itemIdOrName: Schema.String,
    }),
    query: NoQuery,
    body: NoBody,
    bodyMode: "none",
    response: DashboardStaticMaxLevelResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardCdnUploadResponse = Schema.Struct({
    url: Schema.String,
    filename: Schema.String,
});
export const DashboardCdnUploadEndpoint = defineEndpoint({
    operationId: "dashboardCdnUpload",
    method: "POST",
    path: "/v2/cdn/upload",
    auth: "user",
    summary: "Upload a file to the ClashKing CDN",
    pathParams: NoPathParams,
    query: NoQuery,
    body: Schema.FormData,
    bodyMode: "multipart",
    response: DashboardCdnUploadResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
export const DashboardDiscohookResolveResponse = Schema.Union([
    Schema.Struct({ payload: Schema.Json }),
    Schema.Struct({ resolvedUrl: Schema.String }),
]);
export const DashboardDiscohookResolveEndpoint = defineEndpoint({
    operationId: "dashboardDiscohookResolve",
    method: "GET",
    path: "/v2/app/discohook-resolve",
    auth: "user",
    summary: "Resolve a Discohook share URL",
    pathParams: NoPathParams,
    query: Schema.Struct({ url: Schema.String }),
    body: NoBody,
    bodyMode: "none",
    response: DashboardDiscohookResolveResponse,
    responseMode: "json",
    successStatus: 200,
    errors: [],
});
