import { Schema } from "effect";
export declare const AuthUser: Schema.Struct<{
    readonly user_id: Schema.String;
    readonly username: Schema.String;
    readonly avatar_url: Schema.String;
    readonly auth_methods: Schema.$Array<Schema.String>;
    readonly is_admin: Schema.optionalKey<Schema.Boolean>;
}>;
export declare const CurrentUserResponse: Schema.Struct<{
    readonly user_id: Schema.String;
    readonly username: Schema.String;
    readonly avatar_url: Schema.String;
    readonly auth_methods: Schema.$Array<Schema.String>;
    readonly is_admin: Schema.optionalKey<Schema.Boolean>;
    readonly account_summary: Schema.Struct<{
        readonly follower_count: Schema.Number;
    }>;
}>;
export declare const NativeAuthResponse: Schema.Struct<{
    readonly access_token: Schema.String;
    readonly refresh_token: Schema.String;
    readonly user: Schema.Struct<{
        readonly user_id: Schema.String;
        readonly username: Schema.String;
        readonly avatar_url: Schema.String;
        readonly auth_methods: Schema.$Array<Schema.String>;
        readonly is_admin: Schema.optionalKey<Schema.Boolean>;
    }>;
}>;
export declare const WebAuthResponse: Schema.Struct<{
    readonly access_token: Schema.String;
    readonly user: Schema.Struct<{
        readonly user_id: Schema.String;
        readonly username: Schema.String;
        readonly avatar_url: Schema.String;
        readonly auth_methods: Schema.$Array<Schema.String>;
        readonly is_admin: Schema.optionalKey<Schema.Boolean>;
    }>;
}>;
export declare const NativeRefreshResponse: Schema.Struct<{
    readonly access_token: Schema.String;
    readonly refresh_token: Schema.String;
}>;
export declare const WebRefreshResponse: Schema.Struct<{
    readonly access_token: Schema.String;
}>;
export declare const VerificationResponse: Schema.Struct<{
    readonly message: Schema.String;
    readonly verification_code: Schema.optionalKey<Schema.String>;
}>;
export declare const ForgotPasswordResponse: Schema.Struct<{
    readonly message: Schema.String;
    readonly reset_code: Schema.optionalKey<Schema.String>;
}>;
export declare const PrivacyExportResponse: Schema.Struct<{
    readonly account: Schema.$Record<Schema.String, Schema.Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>;
    readonly player_links: Schema.$Array<Schema.$Record<Schema.String, Schema.Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
    readonly bookmarks: Schema.$Array<Schema.$Record<Schema.String, Schema.Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
    readonly recent_searches: Schema.$Array<Schema.$Record<Schema.String, Schema.Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
    readonly legacy_search_settings: Schema.$Array<Schema.$Record<Schema.String, Schema.Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
    readonly discord_sessions: Schema.$Array<Schema.$Record<Schema.String, Schema.Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
    readonly notification_accounts: Schema.$Array<Schema.$Record<Schema.String, Schema.Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
    readonly notification_devices: Schema.$Array<Schema.$Record<Schema.String, Schema.Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
    readonly billing_subscription: Schema.$Array<Schema.$Record<Schema.String, Schema.Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
    readonly subscription_entitlements: Schema.$Array<Schema.$Record<Schema.String, Schema.Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
}>;
export declare const PrivacyDeleteResponse: Schema.Struct<{
    readonly ok: Schema.Boolean;
    readonly message: Schema.String;
    readonly deleted: Schema.$Record<Schema.String, Schema.Number>;
}>;
export declare const AuthMeEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly user_id: Schema.String;
    readonly username: Schema.String;
    readonly avatar_url: Schema.String;
    readonly auth_methods: Schema.$Array<Schema.String>;
    readonly is_admin: Schema.optionalKey<Schema.Boolean>;
    readonly account_summary: Schema.Struct<{
        readonly follower_count: Schema.Number;
    }>;
}>, readonly []>;
export declare const AuthDiscordEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly code: Schema.String;
    readonly redirect_uri: Schema.String;
    readonly code_verifier: Schema.String;
    readonly device_id: Schema.String;
}>, Schema.Struct<{
    readonly access_token: Schema.String;
    readonly refresh_token: Schema.String;
    readonly user: Schema.Struct<{
        readonly user_id: Schema.String;
        readonly username: Schema.String;
        readonly avatar_url: Schema.String;
        readonly auth_methods: Schema.$Array<Schema.String>;
        readonly is_admin: Schema.optionalKey<Schema.Boolean>;
    }>;
}>, readonly [{
    readonly status: 409;
    readonly body: Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>;
}]>;
export declare const AuthWebDiscordEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly code: Schema.String;
    readonly redirect_uri: Schema.String;
    readonly code_verifier: Schema.String;
    readonly device_id: Schema.String;
}>, Schema.Struct<{
    readonly access_token: Schema.String;
    readonly user: Schema.Struct<{
        readonly user_id: Schema.String;
        readonly username: Schema.String;
        readonly avatar_url: Schema.String;
        readonly auth_methods: Schema.$Array<Schema.String>;
        readonly is_admin: Schema.optionalKey<Schema.Boolean>;
    }>;
}>, readonly [{
    readonly status: 409;
    readonly body: Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>;
}]>;
export declare const AuthEmailEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly device_id: Schema.String;
    readonly device_name: Schema.String;
    readonly email: Schema.String;
    readonly password: Schema.String;
}>, Schema.Struct<{
    readonly access_token: Schema.String;
    readonly refresh_token: Schema.String;
    readonly user: Schema.Struct<{
        readonly user_id: Schema.String;
        readonly username: Schema.String;
        readonly avatar_url: Schema.String;
        readonly auth_methods: Schema.$Array<Schema.String>;
        readonly is_admin: Schema.optionalKey<Schema.Boolean>;
    }>;
}>, readonly [{
    readonly status: 409;
    readonly body: Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>;
}]>;
export declare const AuthWebEmailEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly device_id: Schema.String;
    readonly device_name: Schema.String;
    readonly email: Schema.String;
    readonly password: Schema.String;
}>, Schema.Struct<{
    readonly access_token: Schema.String;
    readonly user: Schema.Struct<{
        readonly user_id: Schema.String;
        readonly username: Schema.String;
        readonly avatar_url: Schema.String;
        readonly auth_methods: Schema.$Array<Schema.String>;
        readonly is_admin: Schema.optionalKey<Schema.Boolean>;
    }>;
}>, readonly [{
    readonly status: 409;
    readonly body: Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>;
}]>;
export declare const AuthVerifyEmailEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly email: Schema.String;
    readonly code: Schema.String;
}>, Schema.Struct<{
    readonly access_token: Schema.String;
    readonly refresh_token: Schema.String;
    readonly user: Schema.Struct<{
        readonly user_id: Schema.String;
        readonly username: Schema.String;
        readonly avatar_url: Schema.String;
        readonly auth_methods: Schema.$Array<Schema.String>;
        readonly is_admin: Schema.optionalKey<Schema.Boolean>;
    }>;
}>, readonly [{
    readonly status: 409;
    readonly body: Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>;
}]>;
export declare const AuthWebVerifyEmailEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly email: Schema.String;
    readonly code: Schema.String;
}>, Schema.Struct<{
    readonly access_token: Schema.String;
    readonly user: Schema.Struct<{
        readonly user_id: Schema.String;
        readonly username: Schema.String;
        readonly avatar_url: Schema.String;
        readonly auth_methods: Schema.$Array<Schema.String>;
        readonly is_admin: Schema.optionalKey<Schema.Boolean>;
    }>;
}>, readonly [{
    readonly status: 409;
    readonly body: Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>;
}]>;
export declare const AuthResetPasswordEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly device_id: Schema.String;
    readonly device_name: Schema.String;
    readonly email: Schema.String;
    readonly reset_code: Schema.String;
    readonly new_password: Schema.String;
}>, Schema.Struct<{
    readonly access_token: Schema.String;
    readonly refresh_token: Schema.String;
    readonly user: Schema.Struct<{
        readonly user_id: Schema.String;
        readonly username: Schema.String;
        readonly avatar_url: Schema.String;
        readonly auth_methods: Schema.$Array<Schema.String>;
        readonly is_admin: Schema.optionalKey<Schema.Boolean>;
    }>;
}>, readonly [{
    readonly status: 409;
    readonly body: Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>;
}]>;
export declare const AuthWebResetPasswordEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly device_id: Schema.String;
    readonly device_name: Schema.String;
    readonly email: Schema.String;
    readonly reset_code: Schema.String;
    readonly new_password: Schema.String;
}>, Schema.Struct<{
    readonly access_token: Schema.String;
    readonly user: Schema.Struct<{
        readonly user_id: Schema.String;
        readonly username: Schema.String;
        readonly avatar_url: Schema.String;
        readonly auth_methods: Schema.$Array<Schema.String>;
        readonly is_admin: Schema.optionalKey<Schema.Boolean>;
    }>;
}>, readonly [{
    readonly status: 409;
    readonly body: Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>;
}]>;
export declare const AuthRegisterEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly device_id: Schema.String;
    readonly device_name: Schema.String;
    readonly email: Schema.String;
    readonly password: Schema.String;
    readonly username: Schema.String;
    readonly locale: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly verification_code: Schema.optionalKey<Schema.String>;
}>, readonly [{
    readonly status: 409;
    readonly body: Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>;
}]>;
export declare const AuthResendVerificationEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly email: Schema.String;
    readonly locale: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly verification_code: Schema.optionalKey<Schema.String>;
}>, readonly [{
    readonly status: 404;
    readonly body: Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>;
}, {
    readonly status: 410;
    readonly body: Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>;
}]>;
export declare const AuthForgotPasswordEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly email: Schema.String;
    readonly locale: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{
    readonly message: Schema.String;
    readonly reset_code: Schema.optionalKey<Schema.String>;
}>, readonly []>;
export declare const AuthRefreshEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly refresh_token: Schema.String;
    readonly device_id: Schema.String;
}>, Schema.Struct<{
    readonly access_token: Schema.String;
    readonly refresh_token: Schema.String;
}>, readonly []>;
export declare const AuthWebRefreshEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly access_token: Schema.String;
}>, readonly []>;
export declare const AuthExportEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly account: Schema.$Record<Schema.String, Schema.Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>;
    readonly player_links: Schema.$Array<Schema.$Record<Schema.String, Schema.Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
    readonly bookmarks: Schema.$Array<Schema.$Record<Schema.String, Schema.Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
    readonly recent_searches: Schema.$Array<Schema.$Record<Schema.String, Schema.Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
    readonly legacy_search_settings: Schema.$Array<Schema.$Record<Schema.String, Schema.Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
    readonly discord_sessions: Schema.$Array<Schema.$Record<Schema.String, Schema.Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
    readonly notification_accounts: Schema.$Array<Schema.$Record<Schema.String, Schema.Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
    readonly notification_devices: Schema.$Array<Schema.$Record<Schema.String, Schema.Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
    readonly billing_subscription: Schema.$Array<Schema.$Record<Schema.String, Schema.Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
    readonly subscription_entitlements: Schema.$Array<Schema.$Record<Schema.String, Schema.Codec<import("./expo-common.js").JsonValue, import("./expo-common.js").JsonValue, never, never>>>;
}>, readonly [{
    readonly status: 404;
    readonly body: Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>;
}]>;
export declare const AuthDeleteEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly ok: Schema.Boolean;
    readonly message: Schema.String;
    readonly deleted: Schema.$Record<Schema.String, Schema.Number>;
}>, readonly []>;
export declare const AuthWebLogoutEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Void, readonly []>;
//# sourceMappingURL=expo-auth.d.ts.map