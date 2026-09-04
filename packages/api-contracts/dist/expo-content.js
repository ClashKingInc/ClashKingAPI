import { Schema } from "effect";
import { defineEndpoint, NoBody, NoPathParams, NoQuery } from "./endpoint.js";
import { ErrorResponse } from "./errors.js";
export const Achievement = Schema.Struct({ id: Schema.String, asset_url: Schema.String, repeatable: Schema.Boolean, earned_count: Schema.Number });
export const AchievementsResponse = Schema.Struct({ items: Schema.Array(Achievement) });
export const AppPostBlock = Schema.Union([
    Schema.Struct({ type: Schema.Literal("heading"), text: Schema.String }),
    Schema.Struct({ type: Schema.Literal("paragraph"), text: Schema.String }),
    Schema.Struct({ type: Schema.Literal("bullet_list"), items: Schema.Array(Schema.String) }),
    Schema.Struct({ type: Schema.Literal("image"), url: Schema.String, caption: Schema.optionalKey(Schema.String) }),
]);
export const AppAnnouncement = Schema.Struct({
    id: Schema.String, version: Schema.String, title: Schema.String, subtitle: Schema.String,
    banner_image_url: Schema.optionalKey(Schema.String), body_blocks: Schema.Array(AppPostBlock),
    presentation_type: Schema.Literals(["article", "story"]), story_url: Schema.optionalKey(Schema.String),
    show_on_home: Schema.Boolean, pinned_on_home: Schema.Boolean, target_route: Schema.optionalKey(Schema.String),
    status: Schema.Literals(["live", "expired"]), published_at: Schema.optionalKey(Schema.String),
    starts_at: Schema.optionalKey(Schema.String), ends_at: Schema.optionalKey(Schema.String),
});
export const ActiveAnnouncementsResponse = Schema.Struct({ item: Schema.NullOr(AppAnnouncement), items: Schema.Array(AppAnnouncement) });
export const AnnouncementResponse = Schema.Struct({ item: AppAnnouncement });
export const PostsResponse = Schema.Struct({ items: Schema.Array(AppAnnouncement), has_more: Schema.Boolean, next_offset: Schema.Number });
export const BillingSubscriptionResponse = Schema.Struct({
    provider: Schema.String, status: Schema.String, active: Schema.Boolean, checkoutEnabled: Schema.Boolean,
    bookmarkNotificationsLimit: Schema.Number, rosterAssistantMonthlyCreditUsd: Schema.Number,
    assignedServerId: Schema.NullOr(Schema.String), rosterAssistantSpentUsd: Schema.Number,
    rosterAssistantRemainingUsd: Schema.Number,
});
const NotFound = [{ status: 404, body: ErrorResponse }];
export const AchievementsCheckEndpoint = defineEndpoint({ operationId: "checkExpoAchievements", method: "POST", path: "/v2/achievements/check", auth: "user", summary: "Check and list Expo achievements", body: Schema.Struct({}), bodyMode: "json", pathParams: NoPathParams, query: NoQuery, response: AchievementsResponse, responseMode: "json", successStatus: 200 });
export const ActiveAnnouncementsEndpoint = defineEndpoint({ operationId: "listExpoActiveAnnouncements", method: "GET", path: "/v2/app/announcements/active", auth: "public", summary: "List active app announcements", body: NoBody, bodyMode: "none", pathParams: NoPathParams, query: Schema.Struct({ target: Schema.Literals(["ios", "android", "all"]), locale: Schema.String }), response: ActiveAnnouncementsResponse, responseMode: "json", successStatus: 200 });
export const AnnouncementEndpoint = defineEndpoint({ operationId: "getExpoAnnouncement", method: "GET", path: "/v2/app/announcements/:announcementId", auth: "public", summary: "Get one app announcement", body: NoBody, bodyMode: "none", pathParams: Schema.Struct({ announcementId: Schema.String }), query: Schema.Struct({ locale: Schema.String }), response: AnnouncementResponse, responseMode: "json", successStatus: 200, errors: NotFound });
export const PostsEndpoint = defineEndpoint({ operationId: "listExpoPosts", method: "GET", path: "/v2/app/posts", auth: "public", summary: "List published app posts", body: NoBody, bodyMode: "none", pathParams: NoPathParams, query: Schema.Struct({ target: Schema.Literals(["ios", "android", "all"]), limit: Schema.Number, offset: Schema.Number, locale: Schema.String }), response: PostsResponse, responseMode: "json", successStatus: 200 });
export const BillingSubscriptionEndpoint = defineEndpoint({ operationId: "getExpoBillingSubscription", method: "GET", path: "/v2/billing/subscription", auth: "user", summary: "Get the current Expo subscription status", body: NoBody, bodyMode: "none", pathParams: NoPathParams, query: NoQuery, response: BillingSubscriptionResponse, responseMode: "json", successStatus: 200 });
export const AppUpdateManifestEndpoint = defineEndpoint({
    operationId: "getExpoAppUpdateManifest",
    method: "GET",
    path: "/v2/app/updates/manifest",
    auth: "public",
    summary: "Resolve an Expo Updates manifest for an installation cohort",
    body: NoBody,
    bodyMode: "none",
    pathParams: NoPathParams,
    query: NoQuery,
    response: Schema.Union([Schema.instanceOf(Response), Schema.Void]),
    responseMode: "response",
    responseContentType: "multipart/mixed",
    successStatus: 200,
    errors: [
        { status: 400, body: ErrorResponse },
    ],
});
