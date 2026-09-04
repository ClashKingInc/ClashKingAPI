import { Schema } from "effect";
import { defineEndpoint, NoBody, NoPathParams, NoQuery } from "./endpoint.js";
import { ErrorResponse } from "./errors.js";
const OptionalText = Schema.optionalKey(Schema.String);
export const ManagedAppAnnouncement = Schema.Struct({
    id: Schema.String, title: Schema.String, subtitle: Schema.String, body: OptionalText,
    status: Schema.Literals(["draft", "scheduled", "published", "archived"]),
    target: Schema.Literals(["all", "ios", "android"]),
    banner_image_url: OptionalText, html_object_key: OptionalText, html_url: OptionalText,
    starts_at: Schema.String, ends_at: OptionalText, min_app_version: OptionalText,
    created_at: Schema.String, updated_at: Schema.String,
});
export const AppAnnouncementsResponse = Schema.Struct({ items: Schema.Array(ManagedAppAnnouncement) });
export const AppAnnouncementsEndpoint = defineEndpoint({
    operationId: "listAppAnnouncements", method: "GET", path: "/v2/app/announcements", auth: "bot",
    summary: "List application announcements for the bot", pathParams: NoPathParams,
    query: Schema.Struct({ status: Schema.optionalKey(Schema.Literals(["", "draft", "scheduled", "published", "archived"])) }),
    body: NoBody, bodyMode: "none", response: AppAnnouncementsResponse, responseMode: "json", successStatus: 200,
});
const AnnouncementText = Schema.String.check(Schema.makeFilter((value) => value.trim().length > 0 ? undefined : "Must not be blank"));
const AnnouncementTimestamp = Schema.String.check(Schema.makeFilter((value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) && Number.isFinite(Date.parse(value))
    && (() => {
        const year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)), day = Number(value.slice(8, 10));
        const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        const maximum = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
        return maximum !== undefined && day >= 1 && day <= maximum;
    })()
    ? undefined : "Must be an RFC3339 timestamp"));
export const AppAnnouncementMutationRequest = Schema.Struct({
    title: AnnouncementText, subtitle: AnnouncementText, body: OptionalText,
    status: Schema.optionalKey(Schema.Literals(["draft", "scheduled", "published", "archived"])),
    target: Schema.optionalKey(Schema.Literals(["all", "ios", "android"])),
    banner_image_url: OptionalText, html_object_key: OptionalText, html_url: OptionalText,
    starts_at: Schema.optionalKey(AnnouncementTimestamp), ends_at: Schema.optionalKey(Schema.NullOr(AnnouncementTimestamp)),
    min_app_version: OptionalText,
});
const AnnouncementId = Schema.String.check(Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu));
const mutation = { auth: "bot", query: NoQuery, response: ManagedAppAnnouncement, responseMode: "json", successStatus: 200,
    errors: [400, 401, 404, 409, 413, 415, 503].map((status) => ({ status, body: ErrorResponse })) };
export const AppAnnouncementCreateEndpoint = defineEndpoint({ ...mutation,
    operationId: "createAppAnnouncement", method: "POST", path: "/v2/app/announcements", pathParams: NoPathParams,
    body: AppAnnouncementMutationRequest, bodyMode: "json", summary: "Create an application announcement",
});
export const AppAnnouncementUpdateEndpoint = defineEndpoint({ ...mutation,
    operationId: "updateAppAnnouncement", method: "PUT", path: "/v2/app/announcements/:id", pathParams: Schema.Struct({ id: AnnouncementId }),
    body: AppAnnouncementMutationRequest, bodyMode: "json", summary: "Update an application announcement",
});
export const AppAnnouncementArchiveEndpoint = defineEndpoint({ ...mutation,
    operationId: "archiveAppAnnouncement", method: "DELETE", path: "/v2/app/announcements/:id", pathParams: Schema.Struct({ id: AnnouncementId }),
    body: NoBody, bodyMode: "none", summary: "Archive an application announcement",
});
