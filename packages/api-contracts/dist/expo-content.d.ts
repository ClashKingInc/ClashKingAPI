import { Schema } from "effect";
export declare const Achievement: Schema.Struct<{
    readonly id: Schema.String;
    readonly asset_url: Schema.String;
    readonly repeatable: Schema.Boolean;
    readonly earned_count: Schema.Number;
}>;
export declare const AchievementsResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly asset_url: Schema.String;
        readonly repeatable: Schema.Boolean;
        readonly earned_count: Schema.Number;
    }>>;
}>;
export declare const AppPostBlock: Schema.Union<readonly [Schema.Struct<{
    readonly type: Schema.Literal<"heading">;
    readonly text: Schema.String;
}>, Schema.Struct<{
    readonly type: Schema.Literal<"paragraph">;
    readonly text: Schema.String;
}>, Schema.Struct<{
    readonly type: Schema.Literal<"bullet_list">;
    readonly items: Schema.$Array<Schema.String>;
}>, Schema.Struct<{
    readonly type: Schema.Literal<"image">;
    readonly url: Schema.String;
    readonly caption: Schema.optionalKey<Schema.String>;
}>]>;
export declare const AppAnnouncement: Schema.Struct<{
    readonly id: Schema.String;
    readonly version: Schema.String;
    readonly title: Schema.String;
    readonly subtitle: Schema.String;
    readonly banner_image_url: Schema.optionalKey<Schema.String>;
    readonly body_blocks: Schema.$Array<Schema.Union<readonly [Schema.Struct<{
        readonly type: Schema.Literal<"heading">;
        readonly text: Schema.String;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"paragraph">;
        readonly text: Schema.String;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"bullet_list">;
        readonly items: Schema.$Array<Schema.String>;
    }>, Schema.Struct<{
        readonly type: Schema.Literal<"image">;
        readonly url: Schema.String;
        readonly caption: Schema.optionalKey<Schema.String>;
    }>]>>;
    readonly presentation_type: Schema.Literals<readonly ["article", "story"]>;
    readonly story_url: Schema.optionalKey<Schema.String>;
    readonly show_on_home: Schema.Boolean;
    readonly pinned_on_home: Schema.Boolean;
    readonly target_route: Schema.optionalKey<Schema.String>;
    readonly status: Schema.Literals<readonly ["live", "expired"]>;
    readonly published_at: Schema.optionalKey<Schema.String>;
    readonly starts_at: Schema.optionalKey<Schema.String>;
    readonly ends_at: Schema.optionalKey<Schema.String>;
}>;
export declare const ActiveAnnouncementsResponse: Schema.Struct<{
    readonly item: Schema.NullOr<Schema.Struct<{
        readonly id: Schema.String;
        readonly version: Schema.String;
        readonly title: Schema.String;
        readonly subtitle: Schema.String;
        readonly banner_image_url: Schema.optionalKey<Schema.String>;
        readonly body_blocks: Schema.$Array<Schema.Union<readonly [Schema.Struct<{
            readonly type: Schema.Literal<"heading">;
            readonly text: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"paragraph">;
            readonly text: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"bullet_list">;
            readonly items: Schema.$Array<Schema.String>;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"image">;
            readonly url: Schema.String;
            readonly caption: Schema.optionalKey<Schema.String>;
        }>]>>;
        readonly presentation_type: Schema.Literals<readonly ["article", "story"]>;
        readonly story_url: Schema.optionalKey<Schema.String>;
        readonly show_on_home: Schema.Boolean;
        readonly pinned_on_home: Schema.Boolean;
        readonly target_route: Schema.optionalKey<Schema.String>;
        readonly status: Schema.Literals<readonly ["live", "expired"]>;
        readonly published_at: Schema.optionalKey<Schema.String>;
        readonly starts_at: Schema.optionalKey<Schema.String>;
        readonly ends_at: Schema.optionalKey<Schema.String>;
    }>>;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly version: Schema.String;
        readonly title: Schema.String;
        readonly subtitle: Schema.String;
        readonly banner_image_url: Schema.optionalKey<Schema.String>;
        readonly body_blocks: Schema.$Array<Schema.Union<readonly [Schema.Struct<{
            readonly type: Schema.Literal<"heading">;
            readonly text: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"paragraph">;
            readonly text: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"bullet_list">;
            readonly items: Schema.$Array<Schema.String>;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"image">;
            readonly url: Schema.String;
            readonly caption: Schema.optionalKey<Schema.String>;
        }>]>>;
        readonly presentation_type: Schema.Literals<readonly ["article", "story"]>;
        readonly story_url: Schema.optionalKey<Schema.String>;
        readonly show_on_home: Schema.Boolean;
        readonly pinned_on_home: Schema.Boolean;
        readonly target_route: Schema.optionalKey<Schema.String>;
        readonly status: Schema.Literals<readonly ["live", "expired"]>;
        readonly published_at: Schema.optionalKey<Schema.String>;
        readonly starts_at: Schema.optionalKey<Schema.String>;
        readonly ends_at: Schema.optionalKey<Schema.String>;
    }>>;
}>;
export declare const AnnouncementResponse: Schema.Struct<{
    readonly item: Schema.Struct<{
        readonly id: Schema.String;
        readonly version: Schema.String;
        readonly title: Schema.String;
        readonly subtitle: Schema.String;
        readonly banner_image_url: Schema.optionalKey<Schema.String>;
        readonly body_blocks: Schema.$Array<Schema.Union<readonly [Schema.Struct<{
            readonly type: Schema.Literal<"heading">;
            readonly text: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"paragraph">;
            readonly text: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"bullet_list">;
            readonly items: Schema.$Array<Schema.String>;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"image">;
            readonly url: Schema.String;
            readonly caption: Schema.optionalKey<Schema.String>;
        }>]>>;
        readonly presentation_type: Schema.Literals<readonly ["article", "story"]>;
        readonly story_url: Schema.optionalKey<Schema.String>;
        readonly show_on_home: Schema.Boolean;
        readonly pinned_on_home: Schema.Boolean;
        readonly target_route: Schema.optionalKey<Schema.String>;
        readonly status: Schema.Literals<readonly ["live", "expired"]>;
        readonly published_at: Schema.optionalKey<Schema.String>;
        readonly starts_at: Schema.optionalKey<Schema.String>;
        readonly ends_at: Schema.optionalKey<Schema.String>;
    }>;
}>;
export declare const PostsResponse: Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly version: Schema.String;
        readonly title: Schema.String;
        readonly subtitle: Schema.String;
        readonly banner_image_url: Schema.optionalKey<Schema.String>;
        readonly body_blocks: Schema.$Array<Schema.Union<readonly [Schema.Struct<{
            readonly type: Schema.Literal<"heading">;
            readonly text: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"paragraph">;
            readonly text: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"bullet_list">;
            readonly items: Schema.$Array<Schema.String>;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"image">;
            readonly url: Schema.String;
            readonly caption: Schema.optionalKey<Schema.String>;
        }>]>>;
        readonly presentation_type: Schema.Literals<readonly ["article", "story"]>;
        readonly story_url: Schema.optionalKey<Schema.String>;
        readonly show_on_home: Schema.Boolean;
        readonly pinned_on_home: Schema.Boolean;
        readonly target_route: Schema.optionalKey<Schema.String>;
        readonly status: Schema.Literals<readonly ["live", "expired"]>;
        readonly published_at: Schema.optionalKey<Schema.String>;
        readonly starts_at: Schema.optionalKey<Schema.String>;
        readonly ends_at: Schema.optionalKey<Schema.String>;
    }>>;
    readonly has_more: Schema.Boolean;
    readonly next_offset: Schema.Number;
}>;
export declare const BillingSubscriptionResponse: Schema.Struct<{
    readonly provider: Schema.String;
    readonly status: Schema.String;
    readonly active: Schema.Boolean;
    readonly checkoutEnabled: Schema.Boolean;
    readonly bookmarkNotificationsLimit: Schema.Number;
    readonly rosterAssistantMonthlyCreditUsd: Schema.Number;
    readonly assignedServerId: Schema.NullOr<Schema.String>;
    readonly rosterAssistantSpentUsd: Schema.Number;
    readonly rosterAssistantRemainingUsd: Schema.Number;
}>;
export declare const AchievementsCheckEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly asset_url: Schema.String;
        readonly repeatable: Schema.Boolean;
        readonly earned_count: Schema.Number;
    }>>;
}>, readonly []>;
export declare const ActiveAnnouncementsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly target: Schema.Literals<readonly ["ios", "android", "all"]>;
    readonly locale: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly item: Schema.NullOr<Schema.Struct<{
        readonly id: Schema.String;
        readonly version: Schema.String;
        readonly title: Schema.String;
        readonly subtitle: Schema.String;
        readonly banner_image_url: Schema.optionalKey<Schema.String>;
        readonly body_blocks: Schema.$Array<Schema.Union<readonly [Schema.Struct<{
            readonly type: Schema.Literal<"heading">;
            readonly text: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"paragraph">;
            readonly text: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"bullet_list">;
            readonly items: Schema.$Array<Schema.String>;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"image">;
            readonly url: Schema.String;
            readonly caption: Schema.optionalKey<Schema.String>;
        }>]>>;
        readonly presentation_type: Schema.Literals<readonly ["article", "story"]>;
        readonly story_url: Schema.optionalKey<Schema.String>;
        readonly show_on_home: Schema.Boolean;
        readonly pinned_on_home: Schema.Boolean;
        readonly target_route: Schema.optionalKey<Schema.String>;
        readonly status: Schema.Literals<readonly ["live", "expired"]>;
        readonly published_at: Schema.optionalKey<Schema.String>;
        readonly starts_at: Schema.optionalKey<Schema.String>;
        readonly ends_at: Schema.optionalKey<Schema.String>;
    }>>;
    readonly items: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly version: Schema.String;
        readonly title: Schema.String;
        readonly subtitle: Schema.String;
        readonly banner_image_url: Schema.optionalKey<Schema.String>;
        readonly body_blocks: Schema.$Array<Schema.Union<readonly [Schema.Struct<{
            readonly type: Schema.Literal<"heading">;
            readonly text: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"paragraph">;
            readonly text: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"bullet_list">;
            readonly items: Schema.$Array<Schema.String>;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"image">;
            readonly url: Schema.String;
            readonly caption: Schema.optionalKey<Schema.String>;
        }>]>>;
        readonly presentation_type: Schema.Literals<readonly ["article", "story"]>;
        readonly story_url: Schema.optionalKey<Schema.String>;
        readonly show_on_home: Schema.Boolean;
        readonly pinned_on_home: Schema.Boolean;
        readonly target_route: Schema.optionalKey<Schema.String>;
        readonly status: Schema.Literals<readonly ["live", "expired"]>;
        readonly published_at: Schema.optionalKey<Schema.String>;
        readonly starts_at: Schema.optionalKey<Schema.String>;
        readonly ends_at: Schema.optionalKey<Schema.String>;
    }>>;
}>, readonly []>;
export declare const AnnouncementEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly announcementId: Schema.String;
}>, Schema.Struct<{
    readonly locale: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly item: Schema.Struct<{
        readonly id: Schema.String;
        readonly version: Schema.String;
        readonly title: Schema.String;
        readonly subtitle: Schema.String;
        readonly banner_image_url: Schema.optionalKey<Schema.String>;
        readonly body_blocks: Schema.$Array<Schema.Union<readonly [Schema.Struct<{
            readonly type: Schema.Literal<"heading">;
            readonly text: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"paragraph">;
            readonly text: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"bullet_list">;
            readonly items: Schema.$Array<Schema.String>;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"image">;
            readonly url: Schema.String;
            readonly caption: Schema.optionalKey<Schema.String>;
        }>]>>;
        readonly presentation_type: Schema.Literals<readonly ["article", "story"]>;
        readonly story_url: Schema.optionalKey<Schema.String>;
        readonly show_on_home: Schema.Boolean;
        readonly pinned_on_home: Schema.Boolean;
        readonly target_route: Schema.optionalKey<Schema.String>;
        readonly status: Schema.Literals<readonly ["live", "expired"]>;
        readonly published_at: Schema.optionalKey<Schema.String>;
        readonly starts_at: Schema.optionalKey<Schema.String>;
        readonly ends_at: Schema.optionalKey<Schema.String>;
    }>;
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
export declare const PostsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly target: Schema.Literals<readonly ["ios", "android", "all"]>;
    readonly limit: Schema.Number;
    readonly offset: Schema.Number;
    readonly locale: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly version: Schema.String;
        readonly title: Schema.String;
        readonly subtitle: Schema.String;
        readonly banner_image_url: Schema.optionalKey<Schema.String>;
        readonly body_blocks: Schema.$Array<Schema.Union<readonly [Schema.Struct<{
            readonly type: Schema.Literal<"heading">;
            readonly text: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"paragraph">;
            readonly text: Schema.String;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"bullet_list">;
            readonly items: Schema.$Array<Schema.String>;
        }>, Schema.Struct<{
            readonly type: Schema.Literal<"image">;
            readonly url: Schema.String;
            readonly caption: Schema.optionalKey<Schema.String>;
        }>]>>;
        readonly presentation_type: Schema.Literals<readonly ["article", "story"]>;
        readonly story_url: Schema.optionalKey<Schema.String>;
        readonly show_on_home: Schema.Boolean;
        readonly pinned_on_home: Schema.Boolean;
        readonly target_route: Schema.optionalKey<Schema.String>;
        readonly status: Schema.Literals<readonly ["live", "expired"]>;
        readonly published_at: Schema.optionalKey<Schema.String>;
        readonly starts_at: Schema.optionalKey<Schema.String>;
        readonly ends_at: Schema.optionalKey<Schema.String>;
    }>>;
    readonly has_more: Schema.Boolean;
    readonly next_offset: Schema.Number;
}>, readonly []>;
export declare const BillingSubscriptionEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly provider: Schema.String;
    readonly status: Schema.String;
    readonly active: Schema.Boolean;
    readonly checkoutEnabled: Schema.Boolean;
    readonly bookmarkNotificationsLimit: Schema.Number;
    readonly rosterAssistantMonthlyCreditUsd: Schema.Number;
    readonly assignedServerId: Schema.NullOr<Schema.String>;
    readonly rosterAssistantSpentUsd: Schema.Number;
    readonly rosterAssistantRemainingUsd: Schema.Number;
}>, readonly []>;
export declare const AppUpdateManifestEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Union<readonly [Schema.instanceOf<Response, unknown>, Schema.Void]>, readonly [{
    readonly status: 400;
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
//# sourceMappingURL=expo-content.d.ts.map