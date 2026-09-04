import { Schema } from "effect";
export declare const ManagedAppAnnouncement: Schema.Struct<{
    readonly id: Schema.String;
    readonly title: Schema.String;
    readonly subtitle: Schema.String;
    readonly body: Schema.optionalKey<Schema.String>;
    readonly status: Schema.Literals<readonly ["draft", "scheduled", "published", "archived"]>;
    readonly target: Schema.Literals<readonly ["all", "ios", "android"]>;
    readonly banner_image_url: Schema.optionalKey<Schema.String>;
    readonly html_object_key: Schema.optionalKey<Schema.String>;
    readonly html_url: Schema.optionalKey<Schema.String>;
    readonly starts_at: Schema.String;
    readonly ends_at: Schema.optionalKey<Schema.String>;
    readonly min_app_version: Schema.optionalKey<Schema.String>;
    readonly created_at: Schema.String;
    readonly updated_at: Schema.String;
}>;
export declare const AppAnnouncementsResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly title: Schema.String;
        readonly subtitle: Schema.String;
        readonly body: Schema.optionalKey<Schema.String>;
        readonly status: Schema.Literals<readonly ["draft", "scheduled", "published", "archived"]>;
        readonly target: Schema.Literals<readonly ["all", "ios", "android"]>;
        readonly banner_image_url: Schema.optionalKey<Schema.String>;
        readonly html_object_key: Schema.optionalKey<Schema.String>;
        readonly html_url: Schema.optionalKey<Schema.String>;
        readonly starts_at: Schema.String;
        readonly ends_at: Schema.optionalKey<Schema.String>;
        readonly min_app_version: Schema.optionalKey<Schema.String>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>>;
}>;
export declare const AppAnnouncementsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly status: Schema.optionalKey<Schema.Literals<readonly ["", "draft", "scheduled", "published", "archived"]>>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly title: Schema.String;
        readonly subtitle: Schema.String;
        readonly body: Schema.optionalKey<Schema.String>;
        readonly status: Schema.Literals<readonly ["draft", "scheduled", "published", "archived"]>;
        readonly target: Schema.Literals<readonly ["all", "ios", "android"]>;
        readonly banner_image_url: Schema.optionalKey<Schema.String>;
        readonly html_object_key: Schema.optionalKey<Schema.String>;
        readonly html_url: Schema.optionalKey<Schema.String>;
        readonly starts_at: Schema.String;
        readonly ends_at: Schema.optionalKey<Schema.String>;
        readonly min_app_version: Schema.optionalKey<Schema.String>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>>;
}>, readonly []>;
export declare const AppAnnouncementMutationRequest: Schema.Struct<{
    readonly title: Schema.String;
    readonly subtitle: Schema.String;
    readonly body: Schema.optionalKey<Schema.String>;
    readonly status: Schema.optionalKey<Schema.Literals<readonly ["draft", "scheduled", "published", "archived"]>>;
    readonly target: Schema.optionalKey<Schema.Literals<readonly ["all", "ios", "android"]>>;
    readonly banner_image_url: Schema.optionalKey<Schema.String>;
    readonly html_object_key: Schema.optionalKey<Schema.String>;
    readonly html_url: Schema.optionalKey<Schema.String>;
    readonly starts_at: Schema.optionalKey<Schema.String>;
    readonly ends_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly min_app_version: Schema.optionalKey<Schema.String>;
}>;
export declare const AppAnnouncementCreateEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly title: Schema.String;
    readonly subtitle: Schema.String;
    readonly body: Schema.optionalKey<Schema.String>;
    readonly status: Schema.optionalKey<Schema.Literals<readonly ["draft", "scheduled", "published", "archived"]>>;
    readonly target: Schema.optionalKey<Schema.Literals<readonly ["all", "ios", "android"]>>;
    readonly banner_image_url: Schema.optionalKey<Schema.String>;
    readonly html_object_key: Schema.optionalKey<Schema.String>;
    readonly html_url: Schema.optionalKey<Schema.String>;
    readonly starts_at: Schema.optionalKey<Schema.String>;
    readonly ends_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly min_app_version: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{
    readonly id: Schema.String;
    readonly title: Schema.String;
    readonly subtitle: Schema.String;
    readonly body: Schema.optionalKey<Schema.String>;
    readonly status: Schema.Literals<readonly ["draft", "scheduled", "published", "archived"]>;
    readonly target: Schema.Literals<readonly ["all", "ios", "android"]>;
    readonly banner_image_url: Schema.optionalKey<Schema.String>;
    readonly html_object_key: Schema.optionalKey<Schema.String>;
    readonly html_url: Schema.optionalKey<Schema.String>;
    readonly starts_at: Schema.String;
    readonly ends_at: Schema.optionalKey<Schema.String>;
    readonly min_app_version: Schema.optionalKey<Schema.String>;
    readonly created_at: Schema.String;
    readonly updated_at: Schema.String;
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
export declare const AppAnnouncementUpdateEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly id: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly title: Schema.String;
    readonly subtitle: Schema.String;
    readonly body: Schema.optionalKey<Schema.String>;
    readonly status: Schema.optionalKey<Schema.Literals<readonly ["draft", "scheduled", "published", "archived"]>>;
    readonly target: Schema.optionalKey<Schema.Literals<readonly ["all", "ios", "android"]>>;
    readonly banner_image_url: Schema.optionalKey<Schema.String>;
    readonly html_object_key: Schema.optionalKey<Schema.String>;
    readonly html_url: Schema.optionalKey<Schema.String>;
    readonly starts_at: Schema.optionalKey<Schema.String>;
    readonly ends_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly min_app_version: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{
    readonly id: Schema.String;
    readonly title: Schema.String;
    readonly subtitle: Schema.String;
    readonly body: Schema.optionalKey<Schema.String>;
    readonly status: Schema.Literals<readonly ["draft", "scheduled", "published", "archived"]>;
    readonly target: Schema.Literals<readonly ["all", "ios", "android"]>;
    readonly banner_image_url: Schema.optionalKey<Schema.String>;
    readonly html_object_key: Schema.optionalKey<Schema.String>;
    readonly html_url: Schema.optionalKey<Schema.String>;
    readonly starts_at: Schema.String;
    readonly ends_at: Schema.optionalKey<Schema.String>;
    readonly min_app_version: Schema.optionalKey<Schema.String>;
    readonly created_at: Schema.String;
    readonly updated_at: Schema.String;
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
export declare const AppAnnouncementArchiveEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly id: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly id: Schema.String;
    readonly title: Schema.String;
    readonly subtitle: Schema.String;
    readonly body: Schema.optionalKey<Schema.String>;
    readonly status: Schema.Literals<readonly ["draft", "scheduled", "published", "archived"]>;
    readonly target: Schema.Literals<readonly ["all", "ios", "android"]>;
    readonly banner_image_url: Schema.optionalKey<Schema.String>;
    readonly html_object_key: Schema.optionalKey<Schema.String>;
    readonly html_url: Schema.optionalKey<Schema.String>;
    readonly starts_at: Schema.String;
    readonly ends_at: Schema.optionalKey<Schema.String>;
    readonly min_app_version: Schema.optionalKey<Schema.String>;
    readonly created_at: Schema.String;
    readonly updated_at: Schema.String;
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
//# sourceMappingURL=app-announcements.d.ts.map