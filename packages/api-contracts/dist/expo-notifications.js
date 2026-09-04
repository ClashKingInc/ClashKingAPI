import { Schema } from "effect";
import { defineEndpoint, NoBody, NoPathParams, NoQuery } from "./endpoint.js";
import { MessageResponse } from "./expo-common.js";
export const NotificationDeviceRequest = Schema.Struct({
    token: Schema.String, device_id: Schema.optionalKey(Schema.String), provider: Schema.optionalKey(Schema.Literal("fcm")),
    platform: Schema.Literals(["ios", "android"]), environment: Schema.optionalKey(Schema.Literals(["sandbox", "production"])),
    app_version: Schema.optionalKey(Schema.String), locale: Schema.optionalKey(Schema.String),
    authorization_status: Schema.optionalKey(Schema.Literals(["authorized", "provisional", "denied", "not_determined"])),
});
export const NotificationDeviceResponse = Schema.Struct({
    device_id: Schema.String, provider: Schema.String, platform: Schema.String, environment: Schema.String,
    authorization_status: Schema.String, enabled: Schema.Boolean, last_seen_at: Schema.String,
});
export const NotificationPreferencesRequest = Schema.Struct({
    deviceId: Schema.optionalKey(Schema.String), environment: Schema.optionalKey(Schema.Literals(["sandbox", "production"])),
    notificationsEnabled: Schema.Boolean, warAttacksEnabled: Schema.Boolean, warStateEnabled: Schema.Boolean,
    warRemindersEnabled: Schema.Boolean, raidRemindersEnabled: Schema.Boolean, eventsEnabled: Schema.Boolean,
    announcementsEnabled: Schema.Boolean, monthlySupportEnabled: Schema.Boolean,
    reminderTimings: Schema.Array(Schema.Number), raidReminderTimings: Schema.Array(Schema.Number),
});
export const NotificationAccount = Schema.Struct({ playerTag: Schema.String, source: Schema.Literal("verified"), active: Schema.Boolean });
export const NotificationPreferencesResponse = Schema.Struct({
    ...NotificationPreferencesRequest.fields,
    deviceId: Schema.String, environment: Schema.String, accounts: Schema.Array(NotificationAccount),
});
export const NotificationDeviceRegisterEndpoint = defineEndpoint({ operationId: "registerExpoNotificationDevice", method: "POST", path: "/v2/notifications/devices", auth: "user", summary: "Register an Expo push-notification device", body: NotificationDeviceRequest, bodyMode: "json", pathParams: NoPathParams, query: NoQuery, response: NotificationDeviceResponse, responseMode: "json", successStatus: 200 });
export const NotificationDeviceDeleteEndpoint = defineEndpoint({ operationId: "deleteExpoNotificationDevice", method: "DELETE", path: "/v2/notifications/devices", auth: "user", summary: "Unregister an Expo push-notification device", body: NoBody, bodyMode: "none", pathParams: NoPathParams, query: Schema.Struct({ device_id: Schema.String, environment: Schema.Literals(["sandbox", "production"]) }), response: MessageResponse, responseMode: "json", successStatus: 200 });
export const NotificationPreferencesGetEndpoint = defineEndpoint({ operationId: "getExpoNotificationPreferences", method: "GET", path: "/v2/notifications/preferences", auth: "user", summary: "Get Expo notification preferences", body: NoBody, bodyMode: "none", pathParams: NoPathParams, query: Schema.Struct({ device_id: Schema.String, environment: Schema.Literals(["sandbox", "production"]) }), response: NotificationPreferencesResponse, responseMode: "json", successStatus: 200 });
export const NotificationPreferencesPutEndpoint = defineEndpoint({ operationId: "putExpoNotificationPreferences", method: "PUT", path: "/v2/notifications/preferences", auth: "user", summary: "Replace Expo notification preferences", body: NotificationPreferencesRequest, bodyMode: "json", pathParams: NoPathParams, query: NoQuery, response: NotificationPreferencesResponse, responseMode: "json", successStatus: 200 });
export const NotificationAccountPutEndpoint = defineEndpoint({ operationId: "putExpoNotificationAccount", method: "PUT", path: "/v2/notifications/accounts/:playerTag", auth: "user", summary: "Update notifications for one linked account", body: Schema.Struct({ enabled: Schema.Boolean }), bodyMode: "json", pathParams: Schema.Struct({ playerTag: Schema.String }), query: NoQuery, response: NotificationAccount, responseMode: "json", successStatus: 200 });
