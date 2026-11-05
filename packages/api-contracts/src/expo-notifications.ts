import { Schema } from "effect"

import { defineEndpoint, NoBody, NoPathParams, NoQuery } from "./endpoint.js"
import { MessageResponse } from "./expo-common.js"

export const NotificationDeviceRequest = Schema.Struct({
  token: Schema.String, device_id: Schema.optionalKey(Schema.String), provider: Schema.optionalKey(Schema.Literal("fcm")),
  platform: Schema.Literals(["ios", "android"]), environment: Schema.optionalKey(Schema.Literals(["sandbox", "production"])),
  enabled: Schema.Boolean,
  app_version: Schema.optionalKey(Schema.String), locale: Schema.optionalKey(Schema.String),
  authorization_status: Schema.optionalKey(Schema.Literals(["authorized", "provisional", "denied", "not_determined"])),
})
export const NotificationDeviceResponse = Schema.Struct({
  device_id: Schema.String, provider: Schema.String, platform: Schema.String, environment: Schema.String,
  authorization_status: Schema.String, enabled: Schema.Boolean, last_seen_at: Schema.String,
})
export const NotificationPreferencesRequest = Schema.Struct({
  warAttacksEnabled: Schema.Boolean, warStateEnabled: Schema.Boolean,
  warRemindersEnabled: Schema.Boolean, raidRemindersEnabled: Schema.Boolean, eventsEnabled: Schema.Boolean,
  announcementsEnabled: Schema.Boolean, monthlySupportEnabled: Schema.Boolean, legendDefensesEnabled: Schema.Boolean,
  reminderTimings: Schema.Array(Schema.Number), raidReminderTimings: Schema.Array(Schema.Number),
})
export const NotificationAccount = Schema.Struct({ tag: Schema.String, enabled: Schema.Boolean })
export const NotificationClan = Schema.Struct({
  tag: Schema.String, warEnabled: Schema.Boolean, raidEnabled: Schema.Boolean,
  warActiveUntil: Schema.NullOr(Schema.String), raidActiveUntil: Schema.NullOr(Schema.String),
  warTracked: Schema.Boolean, raidTracked: Schema.Boolean,
})
export const NotificationClansResponse = Schema.Struct({
  clans: Schema.Array(NotificationClan),
  limits: Schema.Struct({ war: Schema.Number, raid: Schema.Number }),
  usage: Schema.Struct({ war: Schema.Number, raid: Schema.Number }),
})
export const NotificationClanRequest = Schema.Struct({
  warEnabled: Schema.Boolean, raidEnabled: Schema.Boolean,
  removeBookmark: Schema.optionalKey(Schema.Boolean),
})
export const NotificationClansGetEndpoint = defineEndpoint({ operationId: "getExpoNotificationClans", method: "GET", path: "/v2/notifications/clans", auth: "user", summary: "List clan notification choices and allowances", body: NoBody, bodyMode: "none", pathParams: NoPathParams, query: NoQuery, response: NotificationClansResponse, responseMode: "json", successStatus: 200 })
export const NotificationClanPutEndpoint = defineEndpoint({ operationId: "putExpoNotificationClan", method: "PUT", path: "/v2/notifications/clans/:tag", auth: "user", summary: "Set clan notifications and automatically bookmark the clan", body: NotificationClanRequest, bodyMode: "json", pathParams: Schema.Struct({ tag: Schema.String }), query: NoQuery, response: NotificationClansResponse, responseMode: "json", successStatus: 200 })
export const NotificationPreferencesResponse = Schema.Struct({
  ...NotificationPreferencesRequest.fields, accounts: Schema.Array(NotificationAccount),
})

export const NotificationDeviceRegisterEndpoint = defineEndpoint({ operationId: "registerExpoNotificationDevice", method: "POST", path: "/v2/notifications/devices", auth: "user", summary: "Register an Expo push-notification device", body: NotificationDeviceRequest, bodyMode: "json", pathParams: NoPathParams, query: NoQuery, response: NotificationDeviceResponse, responseMode: "json", successStatus: 200 })
export const NotificationDeviceDeleteEndpoint = defineEndpoint({ operationId: "deleteExpoNotificationDevice", method: "DELETE", path: "/v2/notifications/devices", auth: "user", summary: "Unregister an Expo push-notification device", body: NoBody, bodyMode: "none", pathParams: NoPathParams, query: Schema.Struct({ device_id: Schema.String, environment: Schema.Literals(["sandbox", "production"]) }), response: MessageResponse, responseMode: "json", successStatus: 200 })
export const NotificationPreferencesGetEndpoint = defineEndpoint({ operationId: "getExpoNotificationPreferences", method: "GET", path: "/v2/notifications/preferences", auth: "user", summary: "Get user notification preferences", body: NoBody, bodyMode: "none", pathParams: NoPathParams, query: NoQuery, response: NotificationPreferencesResponse, responseMode: "json", successStatus: 200 })
export const NotificationPreferencesPutEndpoint = defineEndpoint({ operationId: "putExpoNotificationPreferences", method: "PUT", path: "/v2/notifications/preferences", auth: "user", summary: "Replace Expo notification preferences", body: NotificationPreferencesRequest, bodyMode: "json", pathParams: NoPathParams, query: NoQuery, response: NotificationPreferencesResponse, responseMode: "json", successStatus: 200 })
export const NotificationAccountPutEndpoint = defineEndpoint({ operationId: "putExpoNotificationAccount", method: "PUT", path: "/v2/notifications/accounts/:tag", auth: "user", summary: "Enable or disable notifications for one verified owned account", body: Schema.Struct({ enabled: Schema.Boolean }), bodyMode: "json", pathParams: Schema.Struct({ tag: Schema.String }), query: NoQuery, response: NotificationAccount, responseMode: "json", successStatus: 200 })
