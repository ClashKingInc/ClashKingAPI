import { Schema } from "effect";
export declare const AppPlatform: Schema.Literals<readonly ["android", "ios", "web"]>;
export declare const PublicFeatureFlag: Schema.Struct<{
    readonly key: Schema.String;
    readonly enabled: Schema.Boolean;
    readonly rollout_percentage: Schema.Number;
    readonly min_app_version: Schema.optionalKey<Schema.String>;
    readonly platforms: Schema.$Array<Schema.Literals<readonly ["android", "ios", "web"]>>;
    readonly starts_at: Schema.optionalKey<Schema.String>;
    readonly ends_at: Schema.optionalKey<Schema.String>;
}>;
export declare const NativeUpdatePolicy: Schema.Struct<{
    readonly minimum_version: Schema.String;
    readonly store_url: Schema.String;
    readonly message: Schema.String;
}>;
export declare const AppUpdatePolicy: Schema.Struct<{
    readonly ios: Schema.Struct<{
        readonly minimum_version: Schema.String;
        readonly store_url: Schema.String;
        readonly message: Schema.String;
    }>;
    readonly android: Schema.Struct<{
        readonly minimum_version: Schema.String;
        readonly store_url: Schema.String;
        readonly message: Schema.String;
    }>;
    readonly web: Schema.Null;
}>;
export declare const AppConfigResponse: Schema.Struct<{
    readonly flags: Schema.$Array<Schema.Struct<{
        readonly key: Schema.String;
        readonly enabled: Schema.Boolean;
        readonly rollout_percentage: Schema.Number;
        readonly min_app_version: Schema.optionalKey<Schema.String>;
        readonly platforms: Schema.$Array<Schema.Literals<readonly ["android", "ios", "web"]>>;
        readonly starts_at: Schema.optionalKey<Schema.String>;
        readonly ends_at: Schema.optionalKey<Schema.String>;
    }>>;
    readonly updates: Schema.Struct<{
        readonly ios: Schema.Struct<{
            readonly minimum_version: Schema.String;
            readonly store_url: Schema.String;
            readonly message: Schema.String;
        }>;
        readonly android: Schema.Struct<{
            readonly minimum_version: Schema.String;
            readonly store_url: Schema.String;
            readonly message: Schema.String;
        }>;
        readonly web: Schema.Null;
    }>;
    readonly generated_at: Schema.String;
}>;
export declare const AppConfigEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly flags: Schema.$Array<Schema.Struct<{
        readonly key: Schema.String;
        readonly enabled: Schema.Boolean;
        readonly rollout_percentage: Schema.Number;
        readonly min_app_version: Schema.optionalKey<Schema.String>;
        readonly platforms: Schema.$Array<Schema.Literals<readonly ["android", "ios", "web"]>>;
        readonly starts_at: Schema.optionalKey<Schema.String>;
        readonly ends_at: Schema.optionalKey<Schema.String>;
    }>>;
    readonly updates: Schema.Struct<{
        readonly ios: Schema.Struct<{
            readonly minimum_version: Schema.String;
            readonly store_url: Schema.String;
            readonly message: Schema.String;
        }>;
        readonly android: Schema.Struct<{
            readonly minimum_version: Schema.String;
            readonly store_url: Schema.String;
            readonly message: Schema.String;
        }>;
        readonly web: Schema.Null;
    }>;
    readonly generated_at: Schema.String;
}>, readonly []>;
export type AppConfigResponse = typeof AppConfigResponse.Type;
export type AppPlatform = typeof AppPlatform.Type;
export type AppUpdatePolicy = typeof AppUpdatePolicy.Type;
//# sourceMappingURL=app-config.d.ts.map