import { Schema } from "effect";
export declare const NotificationDeviceRequest: Schema.Struct<{
    readonly token: Schema.String;
    readonly device_id: Schema.optionalKey<Schema.String>;
    readonly provider: Schema.optionalKey<Schema.Literal<"fcm">>;
    readonly platform: Schema.Literals<readonly ["ios", "android"]>;
    readonly environment: Schema.optionalKey<Schema.Literals<readonly ["sandbox", "production"]>>;
    readonly app_version: Schema.optionalKey<Schema.String>;
    readonly locale: Schema.optionalKey<Schema.String>;
    readonly authorization_status: Schema.optionalKey<Schema.Literals<readonly ["authorized", "provisional", "denied", "not_determined"]>>;
}>;
export declare const NotificationDeviceResponse: Schema.Struct<{
    readonly device_id: Schema.String;
    readonly provider: Schema.String;
    readonly platform: Schema.String;
    readonly environment: Schema.String;
    readonly authorization_status: Schema.String;
    readonly enabled: Schema.Boolean;
    readonly last_seen_at: Schema.String;
}>;
export declare const NotificationPreferencesRequest: Schema.Struct<{
    readonly deviceId: Schema.optionalKey<Schema.String>;
    readonly environment: Schema.optionalKey<Schema.Literals<readonly ["sandbox", "production"]>>;
    readonly notificationsEnabled: Schema.Boolean;
    readonly warAttacksEnabled: Schema.Boolean;
    readonly warStateEnabled: Schema.Boolean;
    readonly warRemindersEnabled: Schema.Boolean;
    readonly raidRemindersEnabled: Schema.Boolean;
    readonly eventsEnabled: Schema.Boolean;
    readonly announcementsEnabled: Schema.Boolean;
    readonly monthlySupportEnabled: Schema.Boolean;
    readonly reminderTimings: Schema.$Array<Schema.Number>;
    readonly raidReminderTimings: Schema.$Array<Schema.Number>;
}>;
export declare const NotificationAccount: Schema.Struct<{
    readonly playerTag: Schema.String;
    readonly source: Schema.Literal<"verified">;
    readonly active: Schema.Boolean;
}>;
export declare const NotificationPreferencesResponse: Schema.Struct<{
    readonly notificationsEnabled: Schema.Boolean;
    readonly warAttacksEnabled: Schema.Boolean;
    readonly warStateEnabled: Schema.Boolean;
    readonly warRemindersEnabled: Schema.Boolean;
    readonly raidRemindersEnabled: Schema.Boolean;
    readonly eventsEnabled: Schema.Boolean;
    readonly announcementsEnabled: Schema.Boolean;
    readonly monthlySupportEnabled: Schema.Boolean;
    readonly reminderTimings: Schema.$Array<Schema.Number>;
    readonly raidReminderTimings: Schema.$Array<Schema.Number>;
    readonly deviceId: Schema.String;
    readonly environment: Schema.String;
    readonly accounts: Schema.$Array<Schema.Struct<{
        readonly playerTag: Schema.String;
        readonly source: Schema.Literal<"verified">;
        readonly active: Schema.Boolean;
    }>>;
}>;
export declare const NotificationDeviceRegisterEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly token: Schema.String;
    readonly device_id: Schema.optionalKey<Schema.String>;
    readonly provider: Schema.optionalKey<Schema.Literal<"fcm">>;
    readonly platform: Schema.Literals<readonly ["ios", "android"]>;
    readonly environment: Schema.optionalKey<Schema.Literals<readonly ["sandbox", "production"]>>;
    readonly app_version: Schema.optionalKey<Schema.String>;
    readonly locale: Schema.optionalKey<Schema.String>;
    readonly authorization_status: Schema.optionalKey<Schema.Literals<readonly ["authorized", "provisional", "denied", "not_determined"]>>;
}>, Schema.Struct<{
    readonly device_id: Schema.String;
    readonly provider: Schema.String;
    readonly platform: Schema.String;
    readonly environment: Schema.String;
    readonly authorization_status: Schema.String;
    readonly enabled: Schema.Boolean;
    readonly last_seen_at: Schema.String;
}>, readonly []>;
export declare const NotificationDeviceDeleteEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly device_id: Schema.String;
    readonly environment: Schema.Literals<readonly ["sandbox", "production"]>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly message: Schema.String;
}>, readonly []>;
export declare const NotificationPreferencesGetEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly device_id: Schema.String;
    readonly environment: Schema.Literals<readonly ["sandbox", "production"]>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly notificationsEnabled: Schema.Boolean;
    readonly warAttacksEnabled: Schema.Boolean;
    readonly warStateEnabled: Schema.Boolean;
    readonly warRemindersEnabled: Schema.Boolean;
    readonly raidRemindersEnabled: Schema.Boolean;
    readonly eventsEnabled: Schema.Boolean;
    readonly announcementsEnabled: Schema.Boolean;
    readonly monthlySupportEnabled: Schema.Boolean;
    readonly reminderTimings: Schema.$Array<Schema.Number>;
    readonly raidReminderTimings: Schema.$Array<Schema.Number>;
    readonly deviceId: Schema.String;
    readonly environment: Schema.String;
    readonly accounts: Schema.$Array<Schema.Struct<{
        readonly playerTag: Schema.String;
        readonly source: Schema.Literal<"verified">;
        readonly active: Schema.Boolean;
    }>>;
}>, readonly []>;
export declare const NotificationPreferencesPutEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly deviceId: Schema.optionalKey<Schema.String>;
    readonly environment: Schema.optionalKey<Schema.Literals<readonly ["sandbox", "production"]>>;
    readonly notificationsEnabled: Schema.Boolean;
    readonly warAttacksEnabled: Schema.Boolean;
    readonly warStateEnabled: Schema.Boolean;
    readonly warRemindersEnabled: Schema.Boolean;
    readonly raidRemindersEnabled: Schema.Boolean;
    readonly eventsEnabled: Schema.Boolean;
    readonly announcementsEnabled: Schema.Boolean;
    readonly monthlySupportEnabled: Schema.Boolean;
    readonly reminderTimings: Schema.$Array<Schema.Number>;
    readonly raidReminderTimings: Schema.$Array<Schema.Number>;
}>, Schema.Struct<{
    readonly notificationsEnabled: Schema.Boolean;
    readonly warAttacksEnabled: Schema.Boolean;
    readonly warStateEnabled: Schema.Boolean;
    readonly warRemindersEnabled: Schema.Boolean;
    readonly raidRemindersEnabled: Schema.Boolean;
    readonly eventsEnabled: Schema.Boolean;
    readonly announcementsEnabled: Schema.Boolean;
    readonly monthlySupportEnabled: Schema.Boolean;
    readonly reminderTimings: Schema.$Array<Schema.Number>;
    readonly raidReminderTimings: Schema.$Array<Schema.Number>;
    readonly deviceId: Schema.String;
    readonly environment: Schema.String;
    readonly accounts: Schema.$Array<Schema.Struct<{
        readonly playerTag: Schema.String;
        readonly source: Schema.Literal<"verified">;
        readonly active: Schema.Boolean;
    }>>;
}>, readonly []>;
export declare const NotificationAccountPutEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly playerTag: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly enabled: Schema.Boolean;
}>, Schema.Struct<{
    readonly playerTag: Schema.String;
    readonly source: Schema.Literal<"verified">;
    readonly active: Schema.Boolean;
}>, readonly []>;
//# sourceMappingURL=expo-notifications.d.ts.map