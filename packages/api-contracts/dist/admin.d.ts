import { Schema } from "effect";
export declare const AdminRole: Schema.Literals<readonly ["owner", "admin"]>;
export declare const AdminUser: Schema.Struct<{
    readonly id: Schema.String;
    readonly email: Schema.String;
    readonly username: Schema.String;
    readonly display_name: Schema.String;
    readonly avatar_url: Schema.optionalKey<Schema.String>;
    readonly role: Schema.Literals<readonly ["owner", "admin"]>;
    readonly active: Schema.Boolean;
    readonly last_login_at: Schema.optionalKey<Schema.String>;
    readonly created_at: Schema.String;
    readonly updated_at: Schema.String;
}>;
export declare const Platform: Schema.Literals<readonly ["ios", "android", "web"]>;
export declare const FeatureFlag: Schema.Struct<{
    readonly key: Schema.String;
    readonly name: Schema.String;
    readonly description: Schema.String;
    readonly enabled: Schema.Boolean;
    readonly rolloutPercentage: Schema.Int;
    readonly minAppVersion: Schema.optionalKey<Schema.String>;
    readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
    readonly owner: Schema.String;
    readonly lastUpdated: Schema.String;
    readonly publicExposure: Schema.Literals<readonly ["safe", "sensitive"]>;
    readonly startsAt: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly endsAt: Schema.optionalKey<Schema.NullOr<Schema.String>>;
}>;
export declare const CreateFeatureFlagInput: Schema.Struct<{
    readonly key: Schema.String;
    readonly name: Schema.String;
    readonly description: Schema.optionalKey<Schema.String>;
    readonly enabled: Schema.optionalKey<Schema.Boolean>;
    readonly rolloutPercentage: Schema.optionalKey<Schema.Int>;
    readonly minAppVersion: Schema.optionalKey<Schema.String>;
    readonly platforms: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>>;
    readonly owner: Schema.optionalKey<Schema.String>;
    readonly publicExposure: Schema.optionalKey<Schema.Literals<readonly ["safe", "sensitive"]>>;
    readonly startsAt: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly endsAt: Schema.optionalKey<Schema.NullOr<Schema.String>>;
}>;
export declare const UpdateFeatureFlagInput: Schema.Struct<{
    readonly name: Schema.optionalKey<Schema.String>;
    readonly description: Schema.optionalKey<Schema.String>;
    readonly enabled: Schema.optionalKey<Schema.Boolean>;
    readonly rolloutPercentage: Schema.optionalKey<Schema.Int>;
    readonly minAppVersion: Schema.optionalKey<Schema.String>;
    readonly platforms: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>>;
    readonly owner: Schema.optionalKey<Schema.String>;
    readonly publicExposure: Schema.optionalKey<Schema.Literals<readonly ["safe", "sensitive"]>>;
    readonly startsAt: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly endsAt: Schema.optionalKey<Schema.NullOr<Schema.String>>;
}>;
export declare const DeveloperApplication: Schema.Struct<{
    readonly application_id: Schema.String;
    readonly developer_name: Schema.String;
    readonly api_request_count: Schema.String;
    readonly links_lookup_count: Schema.String;
    readonly token_prefix: Schema.String;
    readonly token_last_used_at: Schema.NullOr<Schema.String>;
    readonly created_at: Schema.String;
    readonly updated_at: Schema.String;
    readonly revoked_at: Schema.NullOr<Schema.String>;
}>;
export declare const CreateDeveloperApplicationInput: Schema.Struct<{
    readonly developer_name: Schema.String;
}>;
export declare const UpdateDeveloperApplicationInput: Schema.Struct<{
    readonly developer_name: Schema.String;
}>;
export declare const CreatedDeveloperApplication: Schema.Struct<{
    readonly application_id: Schema.String;
    readonly developer_name: Schema.String;
    readonly api_request_count: Schema.String;
    readonly links_lookup_count: Schema.String;
    readonly token_prefix: Schema.String;
    readonly token_last_used_at: Schema.NullOr<Schema.String>;
    readonly created_at: Schema.String;
    readonly updated_at: Schema.String;
    readonly revoked_at: Schema.NullOr<Schema.String>;
    readonly api_token: Schema.String;
}>;
export declare const PostStatus: Schema.Literals<readonly ["draft", "scheduled", "live", "expired", "archived"]>;
export declare const PostPresentationType: Schema.Literals<readonly ["article", "story"]>;
export declare const PostBlock: Schema.Union<readonly [Schema.Struct<{
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
export declare const PostTranslation: Schema.Struct<{
    readonly title: Schema.String;
    readonly summary: Schema.String;
    readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
    }>]>>>;
    readonly push_title: Schema.optionalKey<Schema.String>;
    readonly push_body: Schema.optionalKey<Schema.String>;
}>;
export declare const Post: Schema.Struct<{
    readonly id: Schema.String;
    readonly slug: Schema.String;
    readonly title: Schema.String;
    readonly summary: Schema.String;
    readonly hero_image_url: Schema.optionalKey<Schema.String>;
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
    readonly translations: Schema.$Record<Schema.String, Schema.Struct<{
        readonly title: Schema.String;
        readonly summary: Schema.String;
        readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
        }>]>>>;
        readonly push_title: Schema.optionalKey<Schema.String>;
        readonly push_body: Schema.optionalKey<Schema.String>;
    }>>;
    readonly presentation_type: Schema.Literals<readonly ["article", "story"]>;
    readonly story_url: Schema.optionalKey<Schema.String>;
    readonly story_version: Schema.Number;
    readonly story_history: Schema.$Array<Schema.String>;
    readonly revision_number: Schema.Number;
    readonly show_on_home: Schema.Boolean;
    readonly pinned_on_home: Schema.Boolean;
    readonly target_route: Schema.optionalKey<Schema.String>;
    readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
    readonly dismissible: Schema.Boolean;
    readonly priority: Schema.Int;
    readonly status: Schema.Literals<readonly ["draft", "scheduled", "live", "expired", "archived"]>;
    readonly starts_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly ends_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly also_push_on_publish: Schema.Boolean;
    readonly push_title: Schema.optionalKey<Schema.String>;
    readonly push_body: Schema.optionalKey<Schema.String>;
    readonly published_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly push_sent_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly created_by: Schema.String;
    readonly created_at: Schema.String;
    readonly updated_at: Schema.String;
}>;
export declare const CreatePostInput: Schema.Struct<{
    readonly hero_image_url: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
    }>]>>>;
    readonly translations: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Struct<{
        readonly title: Schema.String;
        readonly summary: Schema.String;
        readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
        }>]>>>;
        readonly push_title: Schema.optionalKey<Schema.String>;
        readonly push_body: Schema.optionalKey<Schema.String>;
    }>>>;
    readonly presentation_type: Schema.optionalKey<Schema.Literals<readonly ["article", "story"]>>;
    readonly story_url: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly show_on_home: Schema.optionalKey<Schema.Boolean>;
    readonly pinned_on_home: Schema.optionalKey<Schema.Boolean>;
    readonly target_route: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly platforms: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>>;
    readonly dismissible: Schema.optionalKey<Schema.Boolean>;
    readonly priority: Schema.optionalKey<Schema.Int>;
    readonly starts_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly ends_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly also_push_on_publish: Schema.optionalKey<Schema.Boolean>;
    readonly push_title: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly push_body: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly title: Schema.String;
    readonly summary: Schema.String;
}>;
export declare const UpdatePostInput: Schema.Struct<{
    readonly title: Schema.optionalKey<Schema.String>;
    readonly summary: Schema.optionalKey<Schema.String>;
    readonly hero_image_url: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
    }>]>>>;
    readonly translations: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Struct<{
        readonly title: Schema.String;
        readonly summary: Schema.String;
        readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
        }>]>>>;
        readonly push_title: Schema.optionalKey<Schema.String>;
        readonly push_body: Schema.optionalKey<Schema.String>;
    }>>>;
    readonly presentation_type: Schema.optionalKey<Schema.Literals<readonly ["article", "story"]>>;
    readonly story_url: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly show_on_home: Schema.optionalKey<Schema.Boolean>;
    readonly pinned_on_home: Schema.optionalKey<Schema.Boolean>;
    readonly target_route: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly platforms: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>>;
    readonly dismissible: Schema.optionalKey<Schema.Boolean>;
    readonly priority: Schema.optionalKey<Schema.Int>;
    readonly starts_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly ends_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly also_push_on_publish: Schema.optionalKey<Schema.Boolean>;
    readonly push_title: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly push_body: Schema.optionalKey<Schema.NullOr<Schema.String>>;
}>;
export declare const PostRevision: Schema.Struct<{
    readonly id: Schema.String;
    readonly post_id: Schema.String;
    readonly revision_number: Schema.Number;
    readonly snapshot: Schema.Struct<{
        readonly id: Schema.String;
        readonly slug: Schema.String;
        readonly title: Schema.String;
        readonly summary: Schema.String;
        readonly hero_image_url: Schema.optionalKey<Schema.String>;
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
        readonly translations: Schema.$Record<Schema.String, Schema.Struct<{
            readonly title: Schema.String;
            readonly summary: Schema.String;
            readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
            }>]>>>;
            readonly push_title: Schema.optionalKey<Schema.String>;
            readonly push_body: Schema.optionalKey<Schema.String>;
        }>>;
        readonly presentation_type: Schema.Literals<readonly ["article", "story"]>;
        readonly story_url: Schema.optionalKey<Schema.String>;
        readonly story_version: Schema.Number;
        readonly story_history: Schema.$Array<Schema.String>;
        readonly revision_number: Schema.Number;
        readonly show_on_home: Schema.Boolean;
        readonly pinned_on_home: Schema.Boolean;
        readonly target_route: Schema.optionalKey<Schema.String>;
        readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
        readonly dismissible: Schema.Boolean;
        readonly priority: Schema.Int;
        readonly status: Schema.Literals<readonly ["draft", "scheduled", "live", "expired", "archived"]>;
        readonly starts_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly ends_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly also_push_on_publish: Schema.Boolean;
        readonly push_title: Schema.optionalKey<Schema.String>;
        readonly push_body: Schema.optionalKey<Schema.String>;
        readonly published_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly push_sent_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly created_by: Schema.String;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>;
    readonly created_by: Schema.String;
    readonly created_at: Schema.String;
}>;
export declare const PostDeliveryAttempt: Schema.Struct<{
    readonly id: Schema.String;
    readonly post_id: Schema.String;
    readonly attempt_number: Schema.Number;
    readonly trigger: Schema.Literals<readonly ["publish", "retry", "manual"]>;
    readonly eligible_count: Schema.Number;
    readonly sent_count: Schema.Number;
    readonly skipped_count: Schema.Number;
    readonly status: Schema.Literals<readonly ["queued", "processing", "sent", "partial", "failed", "no_audience"]>;
    readonly error_summary: Schema.optionalKey<Schema.String>;
    readonly attempted_at: Schema.String;
}>;
export declare const CampaignTranslation: Schema.Struct<{
    readonly title: Schema.String;
    readonly body: Schema.String;
}>;
export declare const CampaignStatus: Schema.Literals<readonly ["draft", "scheduled", "sent", "paused"]>;
export declare const CampaignTriggerType: Schema.Literals<readonly ["manual", "monthly"]>;
export declare const Campaign: Schema.Struct<{
    readonly id: Schema.String;
    readonly key: Schema.String;
    readonly title: Schema.String;
    readonly body: Schema.String;
    readonly target_route: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
    readonly target_locales: Schema.$Array<Schema.String>;
    readonly translations: Schema.$Record<Schema.String, Schema.Struct<{
        readonly title: Schema.String;
        readonly body: Schema.String;
    }>>;
    readonly status: Schema.Literals<readonly ["draft", "scheduled", "sent", "paused"]>;
    readonly trigger_type: Schema.Literals<readonly ["manual", "monthly"]>;
    readonly day_of_month: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly send_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly send_time: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly last_sent_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly created_by: Schema.String;
    readonly created_at: Schema.String;
    readonly updated_at: Schema.String;
}>;
export declare const CreateCampaignInput: Schema.Struct<{
    readonly target_route: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly platforms: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>>;
    readonly target_locales: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly translations: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Struct<{
        readonly title: Schema.String;
        readonly body: Schema.String;
    }>>>;
    readonly status: Schema.optionalKey<Schema.Literals<readonly ["draft", "scheduled", "sent", "paused"]>>;
    readonly trigger_type: Schema.optionalKey<Schema.Literals<readonly ["manual", "monthly"]>>;
    readonly day_of_month: Schema.optionalKey<Schema.NullOr<Schema.Int>>;
    readonly send_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly send_time: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly title: Schema.String;
    readonly body: Schema.String;
}>;
export declare const UpdateCampaignInput: Schema.Struct<{
    readonly title: Schema.optionalKey<Schema.String>;
    readonly body: Schema.optionalKey<Schema.String>;
    readonly target_route: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly platforms: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>>;
    readonly target_locales: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly translations: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Struct<{
        readonly title: Schema.String;
        readonly body: Schema.String;
    }>>>;
    readonly status: Schema.optionalKey<Schema.Literals<readonly ["draft", "scheduled", "sent", "paused"]>>;
    readonly trigger_type: Schema.optionalKey<Schema.Literals<readonly ["manual", "monthly"]>>;
    readonly day_of_month: Schema.optionalKey<Schema.NullOr<Schema.Int>>;
    readonly send_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly send_time: Schema.optionalKey<Schema.NullOr<Schema.String>>;
}>;
export declare const TestPushInput: Schema.Struct<{
    readonly title: Schema.String;
    readonly body: Schema.String;
    readonly campaign_id: Schema.optionalKey<Schema.String>;
    readonly target_route: Schema.optionalKey<Schema.String>;
    readonly platforms: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>>;
    readonly target_locales: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly translations: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Struct<{
        readonly title: Schema.String;
        readonly body: Schema.String;
    }>>>;
}>;
export declare const PushResult: Schema.Struct<{
    readonly push_sent: Schema.Number;
    readonly push_skipped: Schema.Number;
    readonly eligible_devices: Schema.Number;
}>;
export declare const NotificationPreset: Schema.Struct<{
    readonly id: Schema.String;
    readonly category: Schema.String;
    readonly label: Schema.String;
    readonly description: Schema.String;
    readonly title: Schema.String;
    readonly body: Schema.String;
    readonly data: Schema.$Record<Schema.String, Schema.String>;
}>;
export declare const LabDevice: Schema.Struct<{
    readonly id: Schema.String;
    readonly user_id: Schema.String;
    readonly user_label: Schema.String;
    readonly device_id: Schema.String;
    readonly platform: Schema.Literals<readonly ["ios", "android"]>;
    readonly provider: Schema.String;
    readonly environment: Schema.Literals<readonly ["sandbox", "production"]>;
    readonly app_version: Schema.String;
    readonly build_number: Schema.String;
    readonly os_version: Schema.String;
    readonly device_model: Schema.String;
    readonly enabled: Schema.Boolean;
    readonly authorization_status: Schema.String;
    readonly locale: Schema.String;
    readonly last_seen_at: Schema.String;
    readonly war_attacks_enabled: Schema.Boolean;
    readonly war_state_enabled: Schema.Boolean;
    readonly war_reminders_enabled: Schema.Boolean;
    readonly events_enabled: Schema.Boolean;
    readonly announcements_enabled: Schema.Boolean;
    readonly monthly_support_enabled: Schema.Boolean;
    readonly reminder_timings: Schema.$Array<Schema.Number>;
}>;
export declare const LabStatus: Schema.Struct<{
    readonly ready: Schema.Boolean;
}>;
export declare const LabSendInput: Schema.Struct<{
    readonly device_ids: Schema.$Array<Schema.String>;
    readonly title: Schema.String;
    readonly body: Schema.String;
    readonly data: Schema.$Record<Schema.String, Schema.String>;
}>;
export declare const LabResult: Schema.Struct<{
    readonly device_id: Schema.String;
    readonly device_name: Schema.optionalKey<Schema.String>;
    readonly platform: Schema.optionalKey<Schema.String>;
    readonly environment: Schema.optionalKey<Schema.String>;
    readonly status: Schema.Literals<readonly ["sent", "failed", "not_found"]>;
    readonly detail: Schema.optionalKey<Schema.String>;
    readonly provider_message_id: Schema.optionalKey<Schema.String>;
}>;
export declare const LabSendResponse: Schema.Struct<{
    readonly selected: Schema.Number;
    readonly sent: Schema.Number;
    readonly failed: Schema.Number;
    readonly results: Schema.$Array<Schema.Struct<{
        readonly device_id: Schema.String;
        readonly device_name: Schema.optionalKey<Schema.String>;
        readonly platform: Schema.optionalKey<Schema.String>;
        readonly environment: Schema.optionalKey<Schema.String>;
        readonly status: Schema.Literals<readonly ["sent", "failed", "not_found"]>;
        readonly detail: Schema.optionalKey<Schema.String>;
        readonly provider_message_id: Schema.optionalKey<Schema.String>;
    }>>;
}>;
export declare const AdminDashboardSnapshot: Schema.Struct<{
    readonly generated_at: Schema.String;
    readonly devices: Schema.Struct<{
        readonly total: Schema.Number;
        readonly production: Schema.Number;
        readonly sandbox: Schema.Number;
        readonly android: Schema.Number;
        readonly ios: Schema.Number;
        readonly authorized: Schema.Number;
        readonly opted_in: Schema.Number;
        readonly active_24h: Schema.Number;
        readonly active_7d: Schema.Number;
    }>;
    readonly content: Schema.Struct<{
        readonly live_posts: Schema.Number;
        readonly scheduled_posts: Schema.Number;
        readonly draft_posts: Schema.Number;
        readonly scheduled_campaigns: Schema.Number;
        readonly recurring_campaigns: Schema.Number;
    }>;
    readonly delivery: Schema.Struct<{
        readonly attempts: Schema.Number;
        readonly eligible: Schema.Number;
        readonly sent: Schema.Number;
        readonly skipped: Schema.Number;
        readonly failed: Schema.Number;
        readonly success_rate: Schema.Number;
        readonly last_attempt: Schema.optionalKey<Schema.String>;
        readonly next_send_at: Schema.optionalKey<Schema.String>;
    }>;
    readonly daily: Schema.$Array<Schema.Struct<{
        readonly date: Schema.String;
        readonly attempts: Schema.Number;
        readonly eligible: Schema.Number;
        readonly sent: Schema.Number;
        readonly skipped: Schema.Number;
        readonly failed: Schema.Number;
    }>>;
    readonly audience_daily: Schema.$Array<Schema.Struct<{
        readonly date: Schema.String;
        readonly total: Schema.Number;
        readonly production: Schema.Number;
        readonly sandbox: Schema.Number;
        readonly opted_in: Schema.Number;
    }>>;
    readonly app_versions: Schema.$Array<Schema.Struct<{
        readonly value: Schema.String;
        readonly count: Schema.Number;
    }>>;
    readonly locales: Schema.$Array<Schema.Struct<{
        readonly value: Schema.String;
        readonly count: Schema.Number;
    }>>;
}>;
export declare const AdminAuditEvent: Schema.Struct<{
    readonly id: Schema.String;
    readonly actor: Schema.String;
    readonly action: Schema.String;
    readonly resource_type: Schema.String;
    readonly resource_id: Schema.String;
    readonly summary: Schema.String;
    readonly metadata: Schema.$Record<Schema.String, Schema.Unknown>;
    readonly ip_address: Schema.String;
    readonly user_agent: Schema.String;
    readonly created_at: Schema.String;
}>;
export declare const ProxyStatusCounts: Schema.Struct<{
    readonly "2xx": Schema.Number;
    readonly "3xx": Schema.Number;
    readonly "4xx": Schema.Number;
    readonly "5xx": Schema.Number;
}>;
export declare const ProxyStatsWindow: Schema.Struct<{
    readonly requests: Schema.Number;
    readonly avg_rps: Schema.Number;
    readonly avg_latency_ms: Schema.NullOr<Schema.Number>;
    readonly status_counts: Schema.Struct<{
        readonly "2xx": Schema.Number;
        readonly "3xx": Schema.Number;
        readonly "4xx": Schema.Number;
        readonly "5xx": Schema.Number;
    }>;
    readonly proxy_failures: Schema.Number;
}>;
export declare const ProxySeriesPoint: Schema.Struct<{
    readonly requests: Schema.Number;
    readonly avg_rps: Schema.Number;
    readonly avg_latency_ms: Schema.NullOr<Schema.Number>;
    readonly status_counts: Schema.Struct<{
        readonly "2xx": Schema.Number;
        readonly "3xx": Schema.Number;
        readonly "4xx": Schema.Number;
        readonly "5xx": Schema.Number;
    }>;
    readonly proxy_failures: Schema.Number;
    readonly start: Schema.String;
    readonly end: Schema.String;
}>;
export declare const ProxyStatsResponse: Schema.Struct<{
    readonly now: Schema.String;
    readonly windows: Schema.$Record<Schema.String, Schema.Struct<{
        readonly requests: Schema.Number;
        readonly avg_rps: Schema.Number;
        readonly avg_latency_ms: Schema.NullOr<Schema.Number>;
        readonly status_counts: Schema.Struct<{
            readonly "2xx": Schema.Number;
            readonly "3xx": Schema.Number;
            readonly "4xx": Schema.Number;
            readonly "5xx": Schema.Number;
        }>;
        readonly proxy_failures: Schema.Number;
    }>>;
    readonly series_data: Schema.optionalKey<Schema.Struct<{
        readonly interval: Schema.Literals<readonly ["1m", "5m", "15m", "30m", "1h"]>;
        readonly lookback: Schema.Literals<readonly ["1h", "6h", "12h", "24h", "48h"]>;
        readonly points: Schema.$Array<Schema.Struct<{
            readonly requests: Schema.Number;
            readonly avg_rps: Schema.Number;
            readonly avg_latency_ms: Schema.NullOr<Schema.Number>;
            readonly status_counts: Schema.Struct<{
                readonly "2xx": Schema.Number;
                readonly "3xx": Schema.Number;
                readonly "4xx": Schema.Number;
                readonly "5xx": Schema.Number;
            }>;
            readonly proxy_failures: Schema.Number;
            readonly start: Schema.String;
            readonly end: Schema.String;
        }>>;
    }>>;
    readonly endpoint_breakdown: Schema.optionalKey<Schema.Struct<{
        readonly window: Schema.Literals<readonly ["24h", "7d"]>;
        readonly limit: Schema.Number;
        readonly endpoints: Schema.$Array<Schema.Struct<{
            readonly endpoint: Schema.String;
            readonly requests: Schema.Number;
        }>>;
    }>>;
}>;
export declare const TrackingSummaryResponse: Schema.Struct<{
    readonly generated_at: Schema.String;
    readonly stale_after_seconds: Schema.Number;
    readonly processes: Schema.$Array<Schema.Struct<{
        readonly script: Schema.String;
        readonly run_id: Schema.Number;
        readonly interval_start: Schema.String;
        readonly interval_end: Schema.String;
        readonly process_started_at: Schema.String;
        readonly ram_bytes: Schema.Number;
        readonly uptime_seconds: Schema.Number;
        readonly goroutines: Schema.Number;
        readonly heap_objects: Schema.Number;
        readonly gc_cycles: Schema.Number;
        readonly health: Schema.Struct<{
            readonly healthy: Schema.Boolean;
            readonly reported_healthy: Schema.Boolean;
            readonly stale: Schema.Boolean;
            readonly observed_at: Schema.String;
            readonly age_seconds: Schema.Number;
            readonly stale_after_seconds: Schema.Number;
        }>;
    }>>;
    readonly domains: Schema.$Array<Schema.Struct<{
        readonly script: Schema.String;
        readonly domain: Schema.String;
        readonly run_id: Schema.Number;
        readonly interval_start: Schema.String;
        readonly interval_end: Schema.String;
        readonly interval_duration_seconds: Schema.Number;
        readonly last_success: Schema.optionalKey<Schema.String>;
        readonly latest_error: Schema.optionalKey<Schema.String>;
        readonly request_count: Schema.Number;
        readonly requests_per_second: Schema.Number;
        readonly error_count: Schema.Number;
        readonly error_rate: Schema.Number;
        readonly average_request_latency_ms: Schema.Number;
        readonly write_count: Schema.Number;
        readonly writes_per_second: Schema.Number;
        readonly processing_count: Schema.Number;
        readonly average_processing_duration_ms: Schema.Number;
        readonly queue_depth: Schema.Number;
        readonly database: Schema.Struct<{
            readonly batch_count: Schema.Number;
            readonly rows_requested: Schema.Number;
            readonly rows_affected: Schema.Number;
            readonly average_store_duration_ms: Schema.Number;
        }>;
        readonly targets: Schema.Struct<{
            readonly target_count: Schema.Number;
            readonly current_cycle: Schema.Number;
            readonly processed_targets: Schema.Number;
            readonly targets_per_second: Schema.Number;
            readonly completion_percentage: Schema.Number;
            readonly estimated_seconds_remaining: Schema.optionalKey<Schema.Number>;
            readonly estimated_loop_completion: Schema.optionalKey<Schema.String>;
        }>;
        readonly health: Schema.Struct<{
            readonly healthy: Schema.Boolean;
            readonly reported_healthy: Schema.Boolean;
            readonly stale: Schema.Boolean;
            readonly observed_at: Schema.String;
            readonly age_seconds: Schema.Number;
            readonly stale_after_seconds: Schema.Number;
        }>;
    }>>;
    readonly globalclans: Schema.optionalKey<Schema.Struct<{
        readonly priority: Schema.optionalKey<Schema.Struct<{
            readonly target_count: Schema.Number;
            readonly current_cycle: Schema.Number;
            readonly processed_targets: Schema.Number;
            readonly targets_per_second: Schema.Number;
            readonly completion_percentage: Schema.Number;
            readonly estimated_seconds_remaining: Schema.optionalKey<Schema.Number>;
            readonly estimated_loop_completion: Schema.optionalKey<Schema.String>;
        }>>;
        readonly non_priority: Schema.optionalKey<Schema.Struct<{
            readonly target_count: Schema.Number;
            readonly current_cycle: Schema.Number;
            readonly processed_targets: Schema.Number;
            readonly targets_per_second: Schema.Number;
            readonly completion_percentage: Schema.Number;
            readonly estimated_seconds_remaining: Schema.optionalKey<Schema.Number>;
            readonly estimated_loop_completion: Schema.optionalKey<Schema.String>;
        }>>;
    }>>;
}>;
export declare const TrackingTimeSeriesResponse: Schema.Struct<{
    readonly generated_at: Schema.String;
    readonly window: Schema.Literals<readonly ["15m", "1h", "6h", "24h"]>;
    readonly start: Schema.String;
    readonly end: Schema.String;
    readonly bucket_seconds: Schema.Number;
    readonly max_points_per_series: Schema.Number;
    readonly processes: Schema.$Array<Schema.Struct<{
        readonly script: Schema.String;
        readonly points: Schema.$Array<Schema.Struct<{
            readonly timestamp: Schema.String;
            readonly observed_at: Schema.String;
            readonly ram_bytes: Schema.Number;
            readonly uptime_seconds: Schema.Number;
            readonly goroutines: Schema.Number;
            readonly heap_objects: Schema.Number;
            readonly gc_cycles: Schema.Number;
        }>>;
    }>>;
    readonly domains: Schema.$Array<Schema.Struct<{
        readonly script: Schema.String;
        readonly domain: Schema.String;
        readonly points: Schema.$Array<Schema.Struct<{
            readonly timestamp: Schema.String;
            readonly observed_at: Schema.String;
            readonly interval_duration_seconds: Schema.Number;
            readonly request_count: Schema.Number;
            readonly requests_per_second: Schema.Number;
            readonly error_count: Schema.Number;
            readonly error_rate: Schema.Number;
            readonly average_request_latency_ms: Schema.Number;
            readonly write_count: Schema.Number;
            readonly writes_per_second: Schema.Number;
            readonly processing_count: Schema.Number;
            readonly average_processing_duration_ms: Schema.Number;
            readonly queue_depth: Schema.Number;
            readonly database: Schema.Struct<{
                readonly batch_count: Schema.Number;
                readonly rows_requested: Schema.Number;
                readonly rows_affected: Schema.Number;
                readonly average_store_duration_ms: Schema.Number;
            }>;
            readonly targets: Schema.Struct<{
                readonly target_count: Schema.Number;
                readonly current_cycle: Schema.Number;
                readonly processed_targets: Schema.Number;
                readonly targets_per_second: Schema.Number;
                readonly completion_percentage: Schema.Number;
                readonly estimated_seconds_remaining: Schema.optionalKey<Schema.Number>;
                readonly estimated_loop_completion: Schema.optionalKey<Schema.String>;
            }>;
            readonly reported_healthy: Schema.Boolean;
        }>>;
    }>>;
}>;
export declare const AppReleaseTrack: Schema.Literals<readonly ["beta", "production"]>;
export declare const AppReleasePlatform: Schema.Literals<readonly ["ios", "android"]>;
export declare const AppReleaseMarker: Schema.Struct<{
    readonly schemaVersion: Schema.Literal<1>;
    readonly version: Schema.String;
    readonly appVersion: Schema.String;
    readonly track: Schema.Literals<readonly ["beta", "production"]>;
    readonly type: Schema.Literals<readonly ["native", "ota"]>;
    readonly gitSha: Schema.String;
    readonly createdAt: Schema.String;
    readonly releaseNotes: Schema.optionalKey<Schema.String>;
    readonly platforms: Schema.Struct<{
        readonly ios: Schema.optionalKey<Schema.Struct<{
            readonly runtimeVersion: Schema.String;
            readonly fingerprint: Schema.optionalKey<Schema.String>;
            readonly manifest: Schema.optionalKey<Schema.Struct<{
                readonly id: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
        readonly android: Schema.optionalKey<Schema.Struct<{
            readonly runtimeVersion: Schema.String;
            readonly fingerprint: Schema.optionalKey<Schema.String>;
            readonly manifest: Schema.optionalKey<Schema.Struct<{
                readonly id: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
    }>;
    readonly rollbackTargets: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Struct<{
        readonly type: Schema.Literals<readonly ["native", "ota"]>;
        readonly gitSha: Schema.optionalKey<Schema.String>;
        readonly platforms: Schema.Struct<{
            readonly ios: Schema.optionalKey<Schema.Struct<{
                readonly runtimeVersion: Schema.String;
                readonly key: Schema.String;
            }>>;
            readonly android: Schema.optionalKey<Schema.Struct<{
                readonly runtimeVersion: Schema.String;
                readonly key: Schema.String;
            }>>;
        }>;
    }>>>;
}>;
export declare const AppUpdateChannel: Schema.Struct<{
    readonly channel: Schema.Literals<readonly ["beta", "production"]>;
    readonly platform: Schema.Literals<readonly ["ios", "android"]>;
    readonly runtimeVersion: Schema.String;
    readonly activeVersion: Schema.NullOr<Schema.String>;
    readonly rollbackTargetVersion: Schema.NullOr<Schema.String>;
    readonly rolloutBasisPoints: Schema.Int;
    readonly paused: Schema.Boolean;
    readonly schedule: Schema.NullOr<Schema.Struct<{
        readonly fromBasisPoints: Schema.Int;
        readonly toBasisPoints: Schema.Int;
        readonly startsAt: Schema.String;
        readonly endsAt: Schema.String;
    }>>;
    readonly updatedAt: Schema.String;
}>;
export declare const AppUpdateChannelInput: Schema.Struct<{
    readonly activeVersion: Schema.NullOr<Schema.String>;
    readonly rollbackTargetVersion: Schema.NullOr<Schema.String>;
    readonly rolloutBasisPoints: Schema.Int;
    readonly paused: Schema.Boolean;
    readonly schedule: Schema.NullOr<Schema.Struct<{
        readonly fromBasisPoints: Schema.Int;
        readonly toBasisPoints: Schema.Int;
        readonly startsAt: Schema.String;
        readonly endsAt: Schema.String;
    }>>;
}>;
export declare const AppReleasesResponse: Schema.Struct<{
    readonly releases: Schema.$Array<Schema.Struct<{
        readonly schemaVersion: Schema.Literal<1>;
        readonly version: Schema.String;
        readonly appVersion: Schema.String;
        readonly track: Schema.Literals<readonly ["beta", "production"]>;
        readonly type: Schema.Literals<readonly ["native", "ota"]>;
        readonly gitSha: Schema.String;
        readonly createdAt: Schema.String;
        readonly releaseNotes: Schema.optionalKey<Schema.String>;
        readonly platforms: Schema.Struct<{
            readonly ios: Schema.optionalKey<Schema.Struct<{
                readonly runtimeVersion: Schema.String;
                readonly fingerprint: Schema.optionalKey<Schema.String>;
                readonly manifest: Schema.optionalKey<Schema.Struct<{
                    readonly id: Schema.optionalKey<Schema.String>;
                }>>;
            }>>;
            readonly android: Schema.optionalKey<Schema.Struct<{
                readonly runtimeVersion: Schema.String;
                readonly fingerprint: Schema.optionalKey<Schema.String>;
                readonly manifest: Schema.optionalKey<Schema.Struct<{
                    readonly id: Schema.optionalKey<Schema.String>;
                }>>;
            }>>;
        }>;
        readonly rollbackTargets: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Struct<{
            readonly type: Schema.Literals<readonly ["native", "ota"]>;
            readonly gitSha: Schema.optionalKey<Schema.String>;
            readonly platforms: Schema.Struct<{
                readonly ios: Schema.optionalKey<Schema.Struct<{
                    readonly runtimeVersion: Schema.String;
                    readonly key: Schema.String;
                }>>;
                readonly android: Schema.optionalKey<Schema.Struct<{
                    readonly runtimeVersion: Schema.String;
                    readonly key: Schema.String;
                }>>;
            }>;
        }>>>;
    }>>;
    readonly channels: Schema.$Array<Schema.Struct<{
        readonly channel: Schema.Literals<readonly ["beta", "production"]>;
        readonly platform: Schema.Literals<readonly ["ios", "android"]>;
        readonly runtimeVersion: Schema.String;
        readonly activeVersion: Schema.NullOr<Schema.String>;
        readonly rollbackTargetVersion: Schema.NullOr<Schema.String>;
        readonly rolloutBasisPoints: Schema.Int;
        readonly paused: Schema.Boolean;
        readonly schedule: Schema.NullOr<Schema.Struct<{
            readonly fromBasisPoints: Schema.Int;
            readonly toBasisPoints: Schema.Int;
            readonly startsAt: Schema.String;
            readonly endsAt: Schema.String;
        }>>;
        readonly updatedAt: Schema.String;
    }>>;
}>;
export declare const AdminMeEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly id: Schema.String;
    readonly email: Schema.String;
    readonly username: Schema.String;
    readonly display_name: Schema.String;
    readonly avatar_url: Schema.optionalKey<Schema.String>;
    readonly role: Schema.Literals<readonly ["owner", "admin"]>;
    readonly active: Schema.Boolean;
    readonly last_login_at: Schema.optionalKey<Schema.String>;
    readonly created_at: Schema.String;
    readonly updated_at: Schema.String;
}>, readonly []>;
export declare const AdminDashboardEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly days: Schema.optionalKey<Schema.Int>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly generated_at: Schema.String;
    readonly devices: Schema.Struct<{
        readonly total: Schema.Number;
        readonly production: Schema.Number;
        readonly sandbox: Schema.Number;
        readonly android: Schema.Number;
        readonly ios: Schema.Number;
        readonly authorized: Schema.Number;
        readonly opted_in: Schema.Number;
        readonly active_24h: Schema.Number;
        readonly active_7d: Schema.Number;
    }>;
    readonly content: Schema.Struct<{
        readonly live_posts: Schema.Number;
        readonly scheduled_posts: Schema.Number;
        readonly draft_posts: Schema.Number;
        readonly scheduled_campaigns: Schema.Number;
        readonly recurring_campaigns: Schema.Number;
    }>;
    readonly delivery: Schema.Struct<{
        readonly attempts: Schema.Number;
        readonly eligible: Schema.Number;
        readonly sent: Schema.Number;
        readonly skipped: Schema.Number;
        readonly failed: Schema.Number;
        readonly success_rate: Schema.Number;
        readonly last_attempt: Schema.optionalKey<Schema.String>;
        readonly next_send_at: Schema.optionalKey<Schema.String>;
    }>;
    readonly daily: Schema.$Array<Schema.Struct<{
        readonly date: Schema.String;
        readonly attempts: Schema.Number;
        readonly eligible: Schema.Number;
        readonly sent: Schema.Number;
        readonly skipped: Schema.Number;
        readonly failed: Schema.Number;
    }>>;
    readonly audience_daily: Schema.$Array<Schema.Struct<{
        readonly date: Schema.String;
        readonly total: Schema.Number;
        readonly production: Schema.Number;
        readonly sandbox: Schema.Number;
        readonly opted_in: Schema.Number;
    }>>;
    readonly app_versions: Schema.$Array<Schema.Struct<{
        readonly value: Schema.String;
        readonly count: Schema.Number;
    }>>;
    readonly locales: Schema.$Array<Schema.Struct<{
        readonly value: Schema.String;
        readonly count: Schema.Number;
    }>>;
}>, readonly []>;
export declare const AdminAuditEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly actor: Schema.optionalKey<Schema.String>;
    readonly action: Schema.optionalKey<Schema.String>;
    readonly resource_type: Schema.optionalKey<Schema.String>;
    readonly limit: Schema.optionalKey<Schema.Int>;
}>, Schema.Struct<{}>, Schema.$Array<Schema.Struct<{
    readonly id: Schema.String;
    readonly actor: Schema.String;
    readonly action: Schema.String;
    readonly resource_type: Schema.String;
    readonly resource_id: Schema.String;
    readonly summary: Schema.String;
    readonly metadata: Schema.$Record<Schema.String, Schema.Unknown>;
    readonly ip_address: Schema.String;
    readonly user_agent: Schema.String;
    readonly created_at: Schema.String;
}>>, readonly []>;
export declare const AdminProxyStatsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly series: Schema.optionalKey<Schema.Literals<readonly ["1m", "5m", "15m", "30m", "1h"]>>;
    readonly lookback: Schema.optionalKey<Schema.Literals<readonly ["1h", "6h", "12h", "24h", "48h"]>>;
    readonly endpoints: Schema.optionalKey<Schema.Literals<readonly ["24h", "7d"]>>;
    readonly limit: Schema.optionalKey<Schema.Int>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly now: Schema.String;
    readonly windows: Schema.$Record<Schema.String, Schema.Struct<{
        readonly requests: Schema.Number;
        readonly avg_rps: Schema.Number;
        readonly avg_latency_ms: Schema.NullOr<Schema.Number>;
        readonly status_counts: Schema.Struct<{
            readonly "2xx": Schema.Number;
            readonly "3xx": Schema.Number;
            readonly "4xx": Schema.Number;
            readonly "5xx": Schema.Number;
        }>;
        readonly proxy_failures: Schema.Number;
    }>>;
    readonly series_data: Schema.optionalKey<Schema.Struct<{
        readonly interval: Schema.Literals<readonly ["1m", "5m", "15m", "30m", "1h"]>;
        readonly lookback: Schema.Literals<readonly ["1h", "6h", "12h", "24h", "48h"]>;
        readonly points: Schema.$Array<Schema.Struct<{
            readonly requests: Schema.Number;
            readonly avg_rps: Schema.Number;
            readonly avg_latency_ms: Schema.NullOr<Schema.Number>;
            readonly status_counts: Schema.Struct<{
                readonly "2xx": Schema.Number;
                readonly "3xx": Schema.Number;
                readonly "4xx": Schema.Number;
                readonly "5xx": Schema.Number;
            }>;
            readonly proxy_failures: Schema.Number;
            readonly start: Schema.String;
            readonly end: Schema.String;
        }>>;
    }>>;
    readonly endpoint_breakdown: Schema.optionalKey<Schema.Struct<{
        readonly window: Schema.Literals<readonly ["24h", "7d"]>;
        readonly limit: Schema.Number;
        readonly endpoints: Schema.$Array<Schema.Struct<{
            readonly endpoint: Schema.String;
            readonly requests: Schema.Number;
        }>>;
    }>>;
}>, readonly []>;
export declare const AdminTrackingSummaryEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly generated_at: Schema.String;
    readonly stale_after_seconds: Schema.Number;
    readonly processes: Schema.$Array<Schema.Struct<{
        readonly script: Schema.String;
        readonly run_id: Schema.Number;
        readonly interval_start: Schema.String;
        readonly interval_end: Schema.String;
        readonly process_started_at: Schema.String;
        readonly ram_bytes: Schema.Number;
        readonly uptime_seconds: Schema.Number;
        readonly goroutines: Schema.Number;
        readonly heap_objects: Schema.Number;
        readonly gc_cycles: Schema.Number;
        readonly health: Schema.Struct<{
            readonly healthy: Schema.Boolean;
            readonly reported_healthy: Schema.Boolean;
            readonly stale: Schema.Boolean;
            readonly observed_at: Schema.String;
            readonly age_seconds: Schema.Number;
            readonly stale_after_seconds: Schema.Number;
        }>;
    }>>;
    readonly domains: Schema.$Array<Schema.Struct<{
        readonly script: Schema.String;
        readonly domain: Schema.String;
        readonly run_id: Schema.Number;
        readonly interval_start: Schema.String;
        readonly interval_end: Schema.String;
        readonly interval_duration_seconds: Schema.Number;
        readonly last_success: Schema.optionalKey<Schema.String>;
        readonly latest_error: Schema.optionalKey<Schema.String>;
        readonly request_count: Schema.Number;
        readonly requests_per_second: Schema.Number;
        readonly error_count: Schema.Number;
        readonly error_rate: Schema.Number;
        readonly average_request_latency_ms: Schema.Number;
        readonly write_count: Schema.Number;
        readonly writes_per_second: Schema.Number;
        readonly processing_count: Schema.Number;
        readonly average_processing_duration_ms: Schema.Number;
        readonly queue_depth: Schema.Number;
        readonly database: Schema.Struct<{
            readonly batch_count: Schema.Number;
            readonly rows_requested: Schema.Number;
            readonly rows_affected: Schema.Number;
            readonly average_store_duration_ms: Schema.Number;
        }>;
        readonly targets: Schema.Struct<{
            readonly target_count: Schema.Number;
            readonly current_cycle: Schema.Number;
            readonly processed_targets: Schema.Number;
            readonly targets_per_second: Schema.Number;
            readonly completion_percentage: Schema.Number;
            readonly estimated_seconds_remaining: Schema.optionalKey<Schema.Number>;
            readonly estimated_loop_completion: Schema.optionalKey<Schema.String>;
        }>;
        readonly health: Schema.Struct<{
            readonly healthy: Schema.Boolean;
            readonly reported_healthy: Schema.Boolean;
            readonly stale: Schema.Boolean;
            readonly observed_at: Schema.String;
            readonly age_seconds: Schema.Number;
            readonly stale_after_seconds: Schema.Number;
        }>;
    }>>;
    readonly globalclans: Schema.optionalKey<Schema.Struct<{
        readonly priority: Schema.optionalKey<Schema.Struct<{
            readonly target_count: Schema.Number;
            readonly current_cycle: Schema.Number;
            readonly processed_targets: Schema.Number;
            readonly targets_per_second: Schema.Number;
            readonly completion_percentage: Schema.Number;
            readonly estimated_seconds_remaining: Schema.optionalKey<Schema.Number>;
            readonly estimated_loop_completion: Schema.optionalKey<Schema.String>;
        }>>;
        readonly non_priority: Schema.optionalKey<Schema.Struct<{
            readonly target_count: Schema.Number;
            readonly current_cycle: Schema.Number;
            readonly processed_targets: Schema.Number;
            readonly targets_per_second: Schema.Number;
            readonly completion_percentage: Schema.Number;
            readonly estimated_seconds_remaining: Schema.optionalKey<Schema.Number>;
            readonly estimated_loop_completion: Schema.optionalKey<Schema.String>;
        }>>;
    }>>;
}>, readonly []>;
export declare const AdminTrackingTimeseriesEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly window: Schema.Literals<readonly ["15m", "1h", "6h", "24h"]>;
    readonly script: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly generated_at: Schema.String;
    readonly window: Schema.Literals<readonly ["15m", "1h", "6h", "24h"]>;
    readonly start: Schema.String;
    readonly end: Schema.String;
    readonly bucket_seconds: Schema.Number;
    readonly max_points_per_series: Schema.Number;
    readonly processes: Schema.$Array<Schema.Struct<{
        readonly script: Schema.String;
        readonly points: Schema.$Array<Schema.Struct<{
            readonly timestamp: Schema.String;
            readonly observed_at: Schema.String;
            readonly ram_bytes: Schema.Number;
            readonly uptime_seconds: Schema.Number;
            readonly goroutines: Schema.Number;
            readonly heap_objects: Schema.Number;
            readonly gc_cycles: Schema.Number;
        }>>;
    }>>;
    readonly domains: Schema.$Array<Schema.Struct<{
        readonly script: Schema.String;
        readonly domain: Schema.String;
        readonly points: Schema.$Array<Schema.Struct<{
            readonly timestamp: Schema.String;
            readonly observed_at: Schema.String;
            readonly interval_duration_seconds: Schema.Number;
            readonly request_count: Schema.Number;
            readonly requests_per_second: Schema.Number;
            readonly error_count: Schema.Number;
            readonly error_rate: Schema.Number;
            readonly average_request_latency_ms: Schema.Number;
            readonly write_count: Schema.Number;
            readonly writes_per_second: Schema.Number;
            readonly processing_count: Schema.Number;
            readonly average_processing_duration_ms: Schema.Number;
            readonly queue_depth: Schema.Number;
            readonly database: Schema.Struct<{
                readonly batch_count: Schema.Number;
                readonly rows_requested: Schema.Number;
                readonly rows_affected: Schema.Number;
                readonly average_store_duration_ms: Schema.Number;
            }>;
            readonly targets: Schema.Struct<{
                readonly target_count: Schema.Number;
                readonly current_cycle: Schema.Number;
                readonly processed_targets: Schema.Number;
                readonly targets_per_second: Schema.Number;
                readonly completion_percentage: Schema.Number;
                readonly estimated_seconds_remaining: Schema.optionalKey<Schema.Number>;
                readonly estimated_loop_completion: Schema.optionalKey<Schema.String>;
            }>;
            readonly reported_healthy: Schema.Boolean;
        }>>;
    }>>;
}>, readonly []>;
export declare const AdminListDeveloperApplicationsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.$Array<Schema.Struct<{
    readonly application_id: Schema.String;
    readonly developer_name: Schema.String;
    readonly api_request_count: Schema.String;
    readonly links_lookup_count: Schema.String;
    readonly token_prefix: Schema.String;
    readonly token_last_used_at: Schema.NullOr<Schema.String>;
    readonly created_at: Schema.String;
    readonly updated_at: Schema.String;
    readonly revoked_at: Schema.NullOr<Schema.String>;
}>>, readonly []>;
export declare const AdminCreateDeveloperApplicationEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly developer_name: Schema.String;
}>, Schema.Struct<{
    readonly application_id: Schema.String;
    readonly developer_name: Schema.String;
    readonly api_request_count: Schema.String;
    readonly links_lookup_count: Schema.String;
    readonly token_prefix: Schema.String;
    readonly token_last_used_at: Schema.NullOr<Schema.String>;
    readonly created_at: Schema.String;
    readonly updated_at: Schema.String;
    readonly revoked_at: Schema.NullOr<Schema.String>;
    readonly api_token: Schema.String;
}>, readonly []>;
export declare const AdminGetDeveloperApplicationEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly applicationId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly application_id: Schema.String;
    readonly developer_name: Schema.String;
    readonly api_request_count: Schema.String;
    readonly links_lookup_count: Schema.String;
    readonly token_prefix: Schema.String;
    readonly token_last_used_at: Schema.NullOr<Schema.String>;
    readonly created_at: Schema.String;
    readonly updated_at: Schema.String;
    readonly revoked_at: Schema.NullOr<Schema.String>;
}>, readonly []>;
export declare const AdminUpdateDeveloperApplicationEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly applicationId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly developer_name: Schema.String;
}>, Schema.Struct<{
    readonly application_id: Schema.String;
    readonly developer_name: Schema.String;
    readonly api_request_count: Schema.String;
    readonly links_lookup_count: Schema.String;
    readonly token_prefix: Schema.String;
    readonly token_last_used_at: Schema.NullOr<Schema.String>;
    readonly created_at: Schema.String;
    readonly updated_at: Schema.String;
    readonly revoked_at: Schema.NullOr<Schema.String>;
}>, readonly []>;
export declare const AdminDeleteDeveloperApplicationEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly applicationId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Void, readonly []>;
export declare const AdminListFeatureFlagsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.$Array<Schema.Struct<{
    readonly key: Schema.String;
    readonly name: Schema.String;
    readonly description: Schema.String;
    readonly enabled: Schema.Boolean;
    readonly rolloutPercentage: Schema.Int;
    readonly minAppVersion: Schema.optionalKey<Schema.String>;
    readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
    readonly owner: Schema.String;
    readonly lastUpdated: Schema.String;
    readonly publicExposure: Schema.Literals<readonly ["safe", "sensitive"]>;
    readonly startsAt: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly endsAt: Schema.optionalKey<Schema.NullOr<Schema.String>>;
}>>, readonly []>;
export declare const AdminCreateFeatureFlagEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly key: Schema.String;
    readonly name: Schema.String;
    readonly description: Schema.optionalKey<Schema.String>;
    readonly enabled: Schema.optionalKey<Schema.Boolean>;
    readonly rolloutPercentage: Schema.optionalKey<Schema.Int>;
    readonly minAppVersion: Schema.optionalKey<Schema.String>;
    readonly platforms: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>>;
    readonly owner: Schema.optionalKey<Schema.String>;
    readonly publicExposure: Schema.optionalKey<Schema.Literals<readonly ["safe", "sensitive"]>>;
    readonly startsAt: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly endsAt: Schema.optionalKey<Schema.NullOr<Schema.String>>;
}>, Schema.Struct<{
    readonly key: Schema.String;
    readonly name: Schema.String;
    readonly description: Schema.String;
    readonly enabled: Schema.Boolean;
    readonly rolloutPercentage: Schema.Int;
    readonly minAppVersion: Schema.optionalKey<Schema.String>;
    readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
    readonly owner: Schema.String;
    readonly lastUpdated: Schema.String;
    readonly publicExposure: Schema.Literals<readonly ["safe", "sensitive"]>;
    readonly startsAt: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly endsAt: Schema.optionalKey<Schema.NullOr<Schema.String>>;
}>, readonly []>;
export declare const AdminUpdateFeatureFlagEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly key: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly name: Schema.optionalKey<Schema.String>;
    readonly description: Schema.optionalKey<Schema.String>;
    readonly enabled: Schema.optionalKey<Schema.Boolean>;
    readonly rolloutPercentage: Schema.optionalKey<Schema.Int>;
    readonly minAppVersion: Schema.optionalKey<Schema.String>;
    readonly platforms: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>>;
    readonly owner: Schema.optionalKey<Schema.String>;
    readonly publicExposure: Schema.optionalKey<Schema.Literals<readonly ["safe", "sensitive"]>>;
    readonly startsAt: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly endsAt: Schema.optionalKey<Schema.NullOr<Schema.String>>;
}>, Schema.Struct<{
    readonly key: Schema.String;
    readonly name: Schema.String;
    readonly description: Schema.String;
    readonly enabled: Schema.Boolean;
    readonly rolloutPercentage: Schema.Int;
    readonly minAppVersion: Schema.optionalKey<Schema.String>;
    readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
    readonly owner: Schema.String;
    readonly lastUpdated: Schema.String;
    readonly publicExposure: Schema.Literals<readonly ["safe", "sensitive"]>;
    readonly startsAt: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly endsAt: Schema.optionalKey<Schema.NullOr<Schema.String>>;
}>, readonly []>;
export declare const AdminListAppReleasesEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly releases: Schema.$Array<Schema.Struct<{
        readonly schemaVersion: Schema.Literal<1>;
        readonly version: Schema.String;
        readonly appVersion: Schema.String;
        readonly track: Schema.Literals<readonly ["beta", "production"]>;
        readonly type: Schema.Literals<readonly ["native", "ota"]>;
        readonly gitSha: Schema.String;
        readonly createdAt: Schema.String;
        readonly releaseNotes: Schema.optionalKey<Schema.String>;
        readonly platforms: Schema.Struct<{
            readonly ios: Schema.optionalKey<Schema.Struct<{
                readonly runtimeVersion: Schema.String;
                readonly fingerprint: Schema.optionalKey<Schema.String>;
                readonly manifest: Schema.optionalKey<Schema.Struct<{
                    readonly id: Schema.optionalKey<Schema.String>;
                }>>;
            }>>;
            readonly android: Schema.optionalKey<Schema.Struct<{
                readonly runtimeVersion: Schema.String;
                readonly fingerprint: Schema.optionalKey<Schema.String>;
                readonly manifest: Schema.optionalKey<Schema.Struct<{
                    readonly id: Schema.optionalKey<Schema.String>;
                }>>;
            }>>;
        }>;
        readonly rollbackTargets: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Struct<{
            readonly type: Schema.Literals<readonly ["native", "ota"]>;
            readonly gitSha: Schema.optionalKey<Schema.String>;
            readonly platforms: Schema.Struct<{
                readonly ios: Schema.optionalKey<Schema.Struct<{
                    readonly runtimeVersion: Schema.String;
                    readonly key: Schema.String;
                }>>;
                readonly android: Schema.optionalKey<Schema.Struct<{
                    readonly runtimeVersion: Schema.String;
                    readonly key: Schema.String;
                }>>;
            }>;
        }>>>;
    }>>;
    readonly channels: Schema.$Array<Schema.Struct<{
        readonly channel: Schema.Literals<readonly ["beta", "production"]>;
        readonly platform: Schema.Literals<readonly ["ios", "android"]>;
        readonly runtimeVersion: Schema.String;
        readonly activeVersion: Schema.NullOr<Schema.String>;
        readonly rollbackTargetVersion: Schema.NullOr<Schema.String>;
        readonly rolloutBasisPoints: Schema.Int;
        readonly paused: Schema.Boolean;
        readonly schedule: Schema.NullOr<Schema.Struct<{
            readonly fromBasisPoints: Schema.Int;
            readonly toBasisPoints: Schema.Int;
            readonly startsAt: Schema.String;
            readonly endsAt: Schema.String;
        }>>;
        readonly updatedAt: Schema.String;
    }>>;
}>, readonly []>;
export declare const AdminUpdateAppReleaseChannelEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly track: Schema.Literals<readonly ["beta", "production"]>;
    readonly platform: Schema.Literals<readonly ["ios", "android"]>;
    readonly runtimeVersion: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly activeVersion: Schema.NullOr<Schema.String>;
    readonly rollbackTargetVersion: Schema.NullOr<Schema.String>;
    readonly rolloutBasisPoints: Schema.Int;
    readonly paused: Schema.Boolean;
    readonly schedule: Schema.NullOr<Schema.Struct<{
        readonly fromBasisPoints: Schema.Int;
        readonly toBasisPoints: Schema.Int;
        readonly startsAt: Schema.String;
        readonly endsAt: Schema.String;
    }>>;
}>, Schema.Struct<{
    readonly channel: Schema.Literals<readonly ["beta", "production"]>;
    readonly platform: Schema.Literals<readonly ["ios", "android"]>;
    readonly runtimeVersion: Schema.String;
    readonly activeVersion: Schema.NullOr<Schema.String>;
    readonly rollbackTargetVersion: Schema.NullOr<Schema.String>;
    readonly rolloutBasisPoints: Schema.Int;
    readonly paused: Schema.Boolean;
    readonly schedule: Schema.NullOr<Schema.Struct<{
        readonly fromBasisPoints: Schema.Int;
        readonly toBasisPoints: Schema.Int;
        readonly startsAt: Schema.String;
        readonly endsAt: Schema.String;
    }>>;
    readonly updatedAt: Schema.String;
}>, readonly []>;
export declare const AdminListPostsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly status: Schema.optionalKey<Schema.Literals<readonly ["draft", "scheduled", "live", "expired", "archived"]>>;
}>, Schema.Struct<{}>, Schema.$Array<Schema.Struct<{
    readonly id: Schema.String;
    readonly slug: Schema.String;
    readonly title: Schema.String;
    readonly summary: Schema.String;
    readonly hero_image_url: Schema.optionalKey<Schema.String>;
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
    readonly translations: Schema.$Record<Schema.String, Schema.Struct<{
        readonly title: Schema.String;
        readonly summary: Schema.String;
        readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
        }>]>>>;
        readonly push_title: Schema.optionalKey<Schema.String>;
        readonly push_body: Schema.optionalKey<Schema.String>;
    }>>;
    readonly presentation_type: Schema.Literals<readonly ["article", "story"]>;
    readonly story_url: Schema.optionalKey<Schema.String>;
    readonly story_version: Schema.Number;
    readonly story_history: Schema.$Array<Schema.String>;
    readonly revision_number: Schema.Number;
    readonly show_on_home: Schema.Boolean;
    readonly pinned_on_home: Schema.Boolean;
    readonly target_route: Schema.optionalKey<Schema.String>;
    readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
    readonly dismissible: Schema.Boolean;
    readonly priority: Schema.Int;
    readonly status: Schema.Literals<readonly ["draft", "scheduled", "live", "expired", "archived"]>;
    readonly starts_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly ends_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly also_push_on_publish: Schema.Boolean;
    readonly push_title: Schema.optionalKey<Schema.String>;
    readonly push_body: Schema.optionalKey<Schema.String>;
    readonly published_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly push_sent_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly created_by: Schema.String;
    readonly created_at: Schema.String;
    readonly updated_at: Schema.String;
}>>, readonly []>;
export declare const AdminCreatePostEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly hero_image_url: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
    }>]>>>;
    readonly translations: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Struct<{
        readonly title: Schema.String;
        readonly summary: Schema.String;
        readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
        }>]>>>;
        readonly push_title: Schema.optionalKey<Schema.String>;
        readonly push_body: Schema.optionalKey<Schema.String>;
    }>>>;
    readonly presentation_type: Schema.optionalKey<Schema.Literals<readonly ["article", "story"]>>;
    readonly story_url: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly show_on_home: Schema.optionalKey<Schema.Boolean>;
    readonly pinned_on_home: Schema.optionalKey<Schema.Boolean>;
    readonly target_route: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly platforms: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>>;
    readonly dismissible: Schema.optionalKey<Schema.Boolean>;
    readonly priority: Schema.optionalKey<Schema.Int>;
    readonly starts_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly ends_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly also_push_on_publish: Schema.optionalKey<Schema.Boolean>;
    readonly push_title: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly push_body: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly title: Schema.String;
    readonly summary: Schema.String;
}>, Schema.Struct<{
    readonly id: Schema.String;
    readonly slug: Schema.String;
    readonly title: Schema.String;
    readonly summary: Schema.String;
    readonly hero_image_url: Schema.optionalKey<Schema.String>;
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
    readonly translations: Schema.$Record<Schema.String, Schema.Struct<{
        readonly title: Schema.String;
        readonly summary: Schema.String;
        readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
        }>]>>>;
        readonly push_title: Schema.optionalKey<Schema.String>;
        readonly push_body: Schema.optionalKey<Schema.String>;
    }>>;
    readonly presentation_type: Schema.Literals<readonly ["article", "story"]>;
    readonly story_url: Schema.optionalKey<Schema.String>;
    readonly story_version: Schema.Number;
    readonly story_history: Schema.$Array<Schema.String>;
    readonly revision_number: Schema.Number;
    readonly show_on_home: Schema.Boolean;
    readonly pinned_on_home: Schema.Boolean;
    readonly target_route: Schema.optionalKey<Schema.String>;
    readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
    readonly dismissible: Schema.Boolean;
    readonly priority: Schema.Int;
    readonly status: Schema.Literals<readonly ["draft", "scheduled", "live", "expired", "archived"]>;
    readonly starts_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly ends_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly also_push_on_publish: Schema.Boolean;
    readonly push_title: Schema.optionalKey<Schema.String>;
    readonly push_body: Schema.optionalKey<Schema.String>;
    readonly published_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly push_sent_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly created_by: Schema.String;
    readonly created_at: Schema.String;
    readonly updated_at: Schema.String;
}>, readonly []>;
export declare const AdminGetPostEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly id: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly id: Schema.String;
    readonly slug: Schema.String;
    readonly title: Schema.String;
    readonly summary: Schema.String;
    readonly hero_image_url: Schema.optionalKey<Schema.String>;
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
    readonly translations: Schema.$Record<Schema.String, Schema.Struct<{
        readonly title: Schema.String;
        readonly summary: Schema.String;
        readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
        }>]>>>;
        readonly push_title: Schema.optionalKey<Schema.String>;
        readonly push_body: Schema.optionalKey<Schema.String>;
    }>>;
    readonly presentation_type: Schema.Literals<readonly ["article", "story"]>;
    readonly story_url: Schema.optionalKey<Schema.String>;
    readonly story_version: Schema.Number;
    readonly story_history: Schema.$Array<Schema.String>;
    readonly revision_number: Schema.Number;
    readonly show_on_home: Schema.Boolean;
    readonly pinned_on_home: Schema.Boolean;
    readonly target_route: Schema.optionalKey<Schema.String>;
    readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
    readonly dismissible: Schema.Boolean;
    readonly priority: Schema.Int;
    readonly status: Schema.Literals<readonly ["draft", "scheduled", "live", "expired", "archived"]>;
    readonly starts_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly ends_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly also_push_on_publish: Schema.Boolean;
    readonly push_title: Schema.optionalKey<Schema.String>;
    readonly push_body: Schema.optionalKey<Schema.String>;
    readonly published_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly push_sent_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly created_by: Schema.String;
    readonly created_at: Schema.String;
    readonly updated_at: Schema.String;
}>, readonly []>;
export declare const AdminUpdatePostEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly id: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly title: Schema.optionalKey<Schema.String>;
    readonly summary: Schema.optionalKey<Schema.String>;
    readonly hero_image_url: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
    }>]>>>;
    readonly translations: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Struct<{
        readonly title: Schema.String;
        readonly summary: Schema.String;
        readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
        }>]>>>;
        readonly push_title: Schema.optionalKey<Schema.String>;
        readonly push_body: Schema.optionalKey<Schema.String>;
    }>>>;
    readonly presentation_type: Schema.optionalKey<Schema.Literals<readonly ["article", "story"]>>;
    readonly story_url: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly show_on_home: Schema.optionalKey<Schema.Boolean>;
    readonly pinned_on_home: Schema.optionalKey<Schema.Boolean>;
    readonly target_route: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly platforms: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>>;
    readonly dismissible: Schema.optionalKey<Schema.Boolean>;
    readonly priority: Schema.optionalKey<Schema.Int>;
    readonly starts_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly ends_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly also_push_on_publish: Schema.optionalKey<Schema.Boolean>;
    readonly push_title: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly push_body: Schema.optionalKey<Schema.NullOr<Schema.String>>;
}>, Schema.Struct<{
    readonly id: Schema.String;
    readonly slug: Schema.String;
    readonly title: Schema.String;
    readonly summary: Schema.String;
    readonly hero_image_url: Schema.optionalKey<Schema.String>;
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
    readonly translations: Schema.$Record<Schema.String, Schema.Struct<{
        readonly title: Schema.String;
        readonly summary: Schema.String;
        readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
        }>]>>>;
        readonly push_title: Schema.optionalKey<Schema.String>;
        readonly push_body: Schema.optionalKey<Schema.String>;
    }>>;
    readonly presentation_type: Schema.Literals<readonly ["article", "story"]>;
    readonly story_url: Schema.optionalKey<Schema.String>;
    readonly story_version: Schema.Number;
    readonly story_history: Schema.$Array<Schema.String>;
    readonly revision_number: Schema.Number;
    readonly show_on_home: Schema.Boolean;
    readonly pinned_on_home: Schema.Boolean;
    readonly target_route: Schema.optionalKey<Schema.String>;
    readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
    readonly dismissible: Schema.Boolean;
    readonly priority: Schema.Int;
    readonly status: Schema.Literals<readonly ["draft", "scheduled", "live", "expired", "archived"]>;
    readonly starts_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly ends_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly also_push_on_publish: Schema.Boolean;
    readonly push_title: Schema.optionalKey<Schema.String>;
    readonly push_body: Schema.optionalKey<Schema.String>;
    readonly published_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly push_sent_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly created_by: Schema.String;
    readonly created_at: Schema.String;
    readonly updated_at: Schema.String;
}>, readonly []>;
export declare const AdminArchivePostEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly id: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Void, readonly []>;
export declare const AdminPostAudienceEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly id: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly estimated_recipients: Schema.Number;
}>, readonly []>;
export declare const AdminPostDeliveriesEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly id: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.$Array<Schema.Struct<{
    readonly id: Schema.String;
    readonly post_id: Schema.String;
    readonly attempt_number: Schema.Number;
    readonly trigger: Schema.Literals<readonly ["publish", "retry", "manual"]>;
    readonly eligible_count: Schema.Number;
    readonly sent_count: Schema.Number;
    readonly skipped_count: Schema.Number;
    readonly status: Schema.Literals<readonly ["queued", "processing", "sent", "partial", "failed", "no_audience"]>;
    readonly error_summary: Schema.optionalKey<Schema.String>;
    readonly attempted_at: Schema.String;
}>>, readonly []>;
export declare const AdminPostRevisionsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly id: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.$Array<Schema.Struct<{
    readonly id: Schema.String;
    readonly post_id: Schema.String;
    readonly revision_number: Schema.Number;
    readonly snapshot: Schema.Struct<{
        readonly id: Schema.String;
        readonly slug: Schema.String;
        readonly title: Schema.String;
        readonly summary: Schema.String;
        readonly hero_image_url: Schema.optionalKey<Schema.String>;
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
        readonly translations: Schema.$Record<Schema.String, Schema.Struct<{
            readonly title: Schema.String;
            readonly summary: Schema.String;
            readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
            }>]>>>;
            readonly push_title: Schema.optionalKey<Schema.String>;
            readonly push_body: Schema.optionalKey<Schema.String>;
        }>>;
        readonly presentation_type: Schema.Literals<readonly ["article", "story"]>;
        readonly story_url: Schema.optionalKey<Schema.String>;
        readonly story_version: Schema.Number;
        readonly story_history: Schema.$Array<Schema.String>;
        readonly revision_number: Schema.Number;
        readonly show_on_home: Schema.Boolean;
        readonly pinned_on_home: Schema.Boolean;
        readonly target_route: Schema.optionalKey<Schema.String>;
        readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
        readonly dismissible: Schema.Boolean;
        readonly priority: Schema.Int;
        readonly status: Schema.Literals<readonly ["draft", "scheduled", "live", "expired", "archived"]>;
        readonly starts_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly ends_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly also_push_on_publish: Schema.Boolean;
        readonly push_title: Schema.optionalKey<Schema.String>;
        readonly push_body: Schema.optionalKey<Schema.String>;
        readonly published_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly push_sent_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly created_by: Schema.String;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>;
    readonly created_by: Schema.String;
    readonly created_at: Schema.String;
}>>, readonly []>;
export declare const AdminRestorePostRevisionEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly id: Schema.String;
    readonly revision: Schema.Int;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly id: Schema.String;
    readonly slug: Schema.String;
    readonly title: Schema.String;
    readonly summary: Schema.String;
    readonly hero_image_url: Schema.optionalKey<Schema.String>;
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
    readonly translations: Schema.$Record<Schema.String, Schema.Struct<{
        readonly title: Schema.String;
        readonly summary: Schema.String;
        readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
        }>]>>>;
        readonly push_title: Schema.optionalKey<Schema.String>;
        readonly push_body: Schema.optionalKey<Schema.String>;
    }>>;
    readonly presentation_type: Schema.Literals<readonly ["article", "story"]>;
    readonly story_url: Schema.optionalKey<Schema.String>;
    readonly story_version: Schema.Number;
    readonly story_history: Schema.$Array<Schema.String>;
    readonly revision_number: Schema.Number;
    readonly show_on_home: Schema.Boolean;
    readonly pinned_on_home: Schema.Boolean;
    readonly target_route: Schema.optionalKey<Schema.String>;
    readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
    readonly dismissible: Schema.Boolean;
    readonly priority: Schema.Int;
    readonly status: Schema.Literals<readonly ["draft", "scheduled", "live", "expired", "archived"]>;
    readonly starts_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly ends_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly also_push_on_publish: Schema.Boolean;
    readonly push_title: Schema.optionalKey<Schema.String>;
    readonly push_body: Schema.optionalKey<Schema.String>;
    readonly published_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly push_sent_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly created_by: Schema.String;
    readonly created_at: Schema.String;
    readonly updated_at: Schema.String;
}>, readonly []>;
export declare const AdminPublishPostEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly id: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly id: Schema.String;
    readonly slug: Schema.String;
    readonly title: Schema.String;
    readonly summary: Schema.String;
    readonly hero_image_url: Schema.optionalKey<Schema.String>;
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
    readonly translations: Schema.$Record<Schema.String, Schema.Struct<{
        readonly title: Schema.String;
        readonly summary: Schema.String;
        readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
        }>]>>>;
        readonly push_title: Schema.optionalKey<Schema.String>;
        readonly push_body: Schema.optionalKey<Schema.String>;
    }>>;
    readonly presentation_type: Schema.Literals<readonly ["article", "story"]>;
    readonly story_url: Schema.optionalKey<Schema.String>;
    readonly story_version: Schema.Number;
    readonly story_history: Schema.$Array<Schema.String>;
    readonly revision_number: Schema.Number;
    readonly show_on_home: Schema.Boolean;
    readonly pinned_on_home: Schema.Boolean;
    readonly target_route: Schema.optionalKey<Schema.String>;
    readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
    readonly dismissible: Schema.Boolean;
    readonly priority: Schema.Int;
    readonly status: Schema.Literals<readonly ["draft", "scheduled", "live", "expired", "archived"]>;
    readonly starts_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly ends_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly also_push_on_publish: Schema.Boolean;
    readonly push_title: Schema.optionalKey<Schema.String>;
    readonly push_body: Schema.optionalKey<Schema.String>;
    readonly published_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly push_sent_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly created_by: Schema.String;
    readonly created_at: Schema.String;
    readonly updated_at: Schema.String;
    readonly push_queued: Schema.Boolean;
}>, readonly []>;
export declare const AdminPushPostEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly id: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly queued: Schema.Boolean;
}>, readonly []>;
export declare const AdminDuplicatePostEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly id: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly id: Schema.String;
    readonly slug: Schema.String;
    readonly title: Schema.String;
    readonly summary: Schema.String;
    readonly hero_image_url: Schema.optionalKey<Schema.String>;
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
    readonly translations: Schema.$Record<Schema.String, Schema.Struct<{
        readonly title: Schema.String;
        readonly summary: Schema.String;
        readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
        }>]>>>;
        readonly push_title: Schema.optionalKey<Schema.String>;
        readonly push_body: Schema.optionalKey<Schema.String>;
    }>>;
    readonly presentation_type: Schema.Literals<readonly ["article", "story"]>;
    readonly story_url: Schema.optionalKey<Schema.String>;
    readonly story_version: Schema.Number;
    readonly story_history: Schema.$Array<Schema.String>;
    readonly revision_number: Schema.Number;
    readonly show_on_home: Schema.Boolean;
    readonly pinned_on_home: Schema.Boolean;
    readonly target_route: Schema.optionalKey<Schema.String>;
    readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
    readonly dismissible: Schema.Boolean;
    readonly priority: Schema.Int;
    readonly status: Schema.Literals<readonly ["draft", "scheduled", "live", "expired", "archived"]>;
    readonly starts_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly ends_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly also_push_on_publish: Schema.Boolean;
    readonly push_title: Schema.optionalKey<Schema.String>;
    readonly push_body: Schema.optionalKey<Schema.String>;
    readonly published_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly push_sent_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly created_by: Schema.String;
    readonly created_at: Schema.String;
    readonly updated_at: Schema.String;
}>, readonly []>;
export declare const AdminListCampaignsEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.$Array<Schema.Struct<{
    readonly id: Schema.String;
    readonly key: Schema.String;
    readonly title: Schema.String;
    readonly body: Schema.String;
    readonly target_route: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
    readonly target_locales: Schema.$Array<Schema.String>;
    readonly translations: Schema.$Record<Schema.String, Schema.Struct<{
        readonly title: Schema.String;
        readonly body: Schema.String;
    }>>;
    readonly status: Schema.Literals<readonly ["draft", "scheduled", "sent", "paused"]>;
    readonly trigger_type: Schema.Literals<readonly ["manual", "monthly"]>;
    readonly day_of_month: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly send_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly send_time: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly last_sent_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly created_by: Schema.String;
    readonly created_at: Schema.String;
    readonly updated_at: Schema.String;
}>>, readonly []>;
export declare const AdminCreateCampaignEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly target_route: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly platforms: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>>;
    readonly target_locales: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly translations: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Struct<{
        readonly title: Schema.String;
        readonly body: Schema.String;
    }>>>;
    readonly status: Schema.optionalKey<Schema.Literals<readonly ["draft", "scheduled", "sent", "paused"]>>;
    readonly trigger_type: Schema.optionalKey<Schema.Literals<readonly ["manual", "monthly"]>>;
    readonly day_of_month: Schema.optionalKey<Schema.NullOr<Schema.Int>>;
    readonly send_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly send_time: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly title: Schema.String;
    readonly body: Schema.String;
}>, Schema.Struct<{
    readonly id: Schema.String;
    readonly key: Schema.String;
    readonly title: Schema.String;
    readonly body: Schema.String;
    readonly target_route: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
    readonly target_locales: Schema.$Array<Schema.String>;
    readonly translations: Schema.$Record<Schema.String, Schema.Struct<{
        readonly title: Schema.String;
        readonly body: Schema.String;
    }>>;
    readonly status: Schema.Literals<readonly ["draft", "scheduled", "sent", "paused"]>;
    readonly trigger_type: Schema.Literals<readonly ["manual", "monthly"]>;
    readonly day_of_month: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly send_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly send_time: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly last_sent_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly created_by: Schema.String;
    readonly created_at: Schema.String;
    readonly updated_at: Schema.String;
}>, readonly []>;
export declare const AdminUpdateCampaignEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly id: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly title: Schema.optionalKey<Schema.String>;
    readonly body: Schema.optionalKey<Schema.String>;
    readonly target_route: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly platforms: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>>;
    readonly target_locales: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly translations: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Struct<{
        readonly title: Schema.String;
        readonly body: Schema.String;
    }>>>;
    readonly status: Schema.optionalKey<Schema.Literals<readonly ["draft", "scheduled", "sent", "paused"]>>;
    readonly trigger_type: Schema.optionalKey<Schema.Literals<readonly ["manual", "monthly"]>>;
    readonly day_of_month: Schema.optionalKey<Schema.NullOr<Schema.Int>>;
    readonly send_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly send_time: Schema.optionalKey<Schema.NullOr<Schema.String>>;
}>, Schema.Struct<{
    readonly id: Schema.String;
    readonly key: Schema.String;
    readonly title: Schema.String;
    readonly body: Schema.String;
    readonly target_route: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
    readonly target_locales: Schema.$Array<Schema.String>;
    readonly translations: Schema.$Record<Schema.String, Schema.Struct<{
        readonly title: Schema.String;
        readonly body: Schema.String;
    }>>;
    readonly status: Schema.Literals<readonly ["draft", "scheduled", "sent", "paused"]>;
    readonly trigger_type: Schema.Literals<readonly ["manual", "monthly"]>;
    readonly day_of_month: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
    readonly send_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly send_time: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly last_sent_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    readonly created_by: Schema.String;
    readonly created_at: Schema.String;
    readonly updated_at: Schema.String;
}>, readonly []>;
export declare const AdminPushAudienceEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
    readonly platforms: Schema.optionalKey<Schema.String>;
    readonly locales: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly estimated_recipients: Schema.Number;
}>, readonly []>;
export declare const AdminTestPushEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly title: Schema.String;
    readonly body: Schema.String;
    readonly campaign_id: Schema.optionalKey<Schema.String>;
    readonly target_route: Schema.optionalKey<Schema.String>;
    readonly platforms: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>>;
    readonly target_locales: Schema.optionalKey<Schema.$Array<Schema.String>>;
    readonly translations: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Struct<{
        readonly title: Schema.String;
        readonly body: Schema.String;
    }>>>;
}>, Schema.Struct<{
    readonly push_sent: Schema.Number;
    readonly push_skipped: Schema.Number;
    readonly eligible_devices: Schema.Number;
}>, readonly []>;
export declare const AdminLabTypesEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.$Array<Schema.Struct<{
    readonly id: Schema.String;
    readonly category: Schema.String;
    readonly label: Schema.String;
    readonly description: Schema.String;
    readonly title: Schema.String;
    readonly body: Schema.String;
    readonly data: Schema.$Record<Schema.String, Schema.String>;
}>>, readonly []>;
export declare const AdminLabStatusEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly ready: Schema.Boolean;
}>, readonly []>;
export declare const AdminLabDevicesEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.$Array<Schema.Struct<{
    readonly id: Schema.String;
    readonly user_id: Schema.String;
    readonly user_label: Schema.String;
    readonly device_id: Schema.String;
    readonly platform: Schema.Literals<readonly ["ios", "android"]>;
    readonly provider: Schema.String;
    readonly environment: Schema.Literals<readonly ["sandbox", "production"]>;
    readonly app_version: Schema.String;
    readonly build_number: Schema.String;
    readonly os_version: Schema.String;
    readonly device_model: Schema.String;
    readonly enabled: Schema.Boolean;
    readonly authorization_status: Schema.String;
    readonly locale: Schema.String;
    readonly last_seen_at: Schema.String;
    readonly war_attacks_enabled: Schema.Boolean;
    readonly war_state_enabled: Schema.Boolean;
    readonly war_reminders_enabled: Schema.Boolean;
    readonly events_enabled: Schema.Boolean;
    readonly announcements_enabled: Schema.Boolean;
    readonly monthly_support_enabled: Schema.Boolean;
    readonly reminder_timings: Schema.$Array<Schema.Number>;
}>>, readonly []>;
export declare const AdminLabSendEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly device_ids: Schema.$Array<Schema.String>;
    readonly title: Schema.String;
    readonly body: Schema.String;
    readonly data: Schema.$Record<Schema.String, Schema.String>;
}>, Schema.Struct<{
    readonly selected: Schema.Number;
    readonly sent: Schema.Number;
    readonly failed: Schema.Number;
    readonly results: Schema.$Array<Schema.Struct<{
        readonly device_id: Schema.String;
        readonly device_name: Schema.optionalKey<Schema.String>;
        readonly platform: Schema.optionalKey<Schema.String>;
        readonly environment: Schema.optionalKey<Schema.String>;
        readonly status: Schema.Literals<readonly ["sent", "failed", "not_found"]>;
        readonly detail: Schema.optionalKey<Schema.String>;
        readonly provider_message_id: Schema.optionalKey<Schema.String>;
    }>>;
}>, readonly []>;
export declare const AdminMediaUploadEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.FormData, Schema.Struct<{
    readonly url: Schema.String;
}>, readonly []>;
export declare const AdminStoryUploadEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.FormData, Schema.Struct<{
    readonly url: Schema.String;
    readonly version: Schema.Literal<1>;
    readonly storage_provider: Schema.Literal<"r2">;
    readonly key: Schema.String;
    readonly size_bytes: Schema.Number;
    readonly checksum: Schema.String;
}>, readonly []>;
export declare const adminEndpoints: {
    readonly me: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly id: Schema.String;
        readonly email: Schema.String;
        readonly username: Schema.String;
        readonly display_name: Schema.String;
        readonly avatar_url: Schema.optionalKey<Schema.String>;
        readonly role: Schema.Literals<readonly ["owner", "admin"]>;
        readonly active: Schema.Boolean;
        readonly last_login_at: Schema.optionalKey<Schema.String>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>, readonly []>;
    readonly dashboard: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
        readonly days: Schema.optionalKey<Schema.Int>;
    }>, Schema.Struct<{}>, Schema.Struct<{
        readonly generated_at: Schema.String;
        readonly devices: Schema.Struct<{
            readonly total: Schema.Number;
            readonly production: Schema.Number;
            readonly sandbox: Schema.Number;
            readonly android: Schema.Number;
            readonly ios: Schema.Number;
            readonly authorized: Schema.Number;
            readonly opted_in: Schema.Number;
            readonly active_24h: Schema.Number;
            readonly active_7d: Schema.Number;
        }>;
        readonly content: Schema.Struct<{
            readonly live_posts: Schema.Number;
            readonly scheduled_posts: Schema.Number;
            readonly draft_posts: Schema.Number;
            readonly scheduled_campaigns: Schema.Number;
            readonly recurring_campaigns: Schema.Number;
        }>;
        readonly delivery: Schema.Struct<{
            readonly attempts: Schema.Number;
            readonly eligible: Schema.Number;
            readonly sent: Schema.Number;
            readonly skipped: Schema.Number;
            readonly failed: Schema.Number;
            readonly success_rate: Schema.Number;
            readonly last_attempt: Schema.optionalKey<Schema.String>;
            readonly next_send_at: Schema.optionalKey<Schema.String>;
        }>;
        readonly daily: Schema.$Array<Schema.Struct<{
            readonly date: Schema.String;
            readonly attempts: Schema.Number;
            readonly eligible: Schema.Number;
            readonly sent: Schema.Number;
            readonly skipped: Schema.Number;
            readonly failed: Schema.Number;
        }>>;
        readonly audience_daily: Schema.$Array<Schema.Struct<{
            readonly date: Schema.String;
            readonly total: Schema.Number;
            readonly production: Schema.Number;
            readonly sandbox: Schema.Number;
            readonly opted_in: Schema.Number;
        }>>;
        readonly app_versions: Schema.$Array<Schema.Struct<{
            readonly value: Schema.String;
            readonly count: Schema.Number;
        }>>;
        readonly locales: Schema.$Array<Schema.Struct<{
            readonly value: Schema.String;
            readonly count: Schema.Number;
        }>>;
    }>, readonly []>;
    readonly audit: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
        readonly actor: Schema.optionalKey<Schema.String>;
        readonly action: Schema.optionalKey<Schema.String>;
        readonly resource_type: Schema.optionalKey<Schema.String>;
        readonly limit: Schema.optionalKey<Schema.Int>;
    }>, Schema.Struct<{}>, Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly actor: Schema.String;
        readonly action: Schema.String;
        readonly resource_type: Schema.String;
        readonly resource_id: Schema.String;
        readonly summary: Schema.String;
        readonly metadata: Schema.$Record<Schema.String, Schema.Unknown>;
        readonly ip_address: Schema.String;
        readonly user_agent: Schema.String;
        readonly created_at: Schema.String;
    }>>, readonly []>;
    readonly proxyStats: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
        readonly series: Schema.optionalKey<Schema.Literals<readonly ["1m", "5m", "15m", "30m", "1h"]>>;
        readonly lookback: Schema.optionalKey<Schema.Literals<readonly ["1h", "6h", "12h", "24h", "48h"]>>;
        readonly endpoints: Schema.optionalKey<Schema.Literals<readonly ["24h", "7d"]>>;
        readonly limit: Schema.optionalKey<Schema.Int>;
    }>, Schema.Struct<{}>, Schema.Struct<{
        readonly now: Schema.String;
        readonly windows: Schema.$Record<Schema.String, Schema.Struct<{
            readonly requests: Schema.Number;
            readonly avg_rps: Schema.Number;
            readonly avg_latency_ms: Schema.NullOr<Schema.Number>;
            readonly status_counts: Schema.Struct<{
                readonly "2xx": Schema.Number;
                readonly "3xx": Schema.Number;
                readonly "4xx": Schema.Number;
                readonly "5xx": Schema.Number;
            }>;
            readonly proxy_failures: Schema.Number;
        }>>;
        readonly series_data: Schema.optionalKey<Schema.Struct<{
            readonly interval: Schema.Literals<readonly ["1m", "5m", "15m", "30m", "1h"]>;
            readonly lookback: Schema.Literals<readonly ["1h", "6h", "12h", "24h", "48h"]>;
            readonly points: Schema.$Array<Schema.Struct<{
                readonly requests: Schema.Number;
                readonly avg_rps: Schema.Number;
                readonly avg_latency_ms: Schema.NullOr<Schema.Number>;
                readonly status_counts: Schema.Struct<{
                    readonly "2xx": Schema.Number;
                    readonly "3xx": Schema.Number;
                    readonly "4xx": Schema.Number;
                    readonly "5xx": Schema.Number;
                }>;
                readonly proxy_failures: Schema.Number;
                readonly start: Schema.String;
                readonly end: Schema.String;
            }>>;
        }>>;
        readonly endpoint_breakdown: Schema.optionalKey<Schema.Struct<{
            readonly window: Schema.Literals<readonly ["24h", "7d"]>;
            readonly limit: Schema.Number;
            readonly endpoints: Schema.$Array<Schema.Struct<{
                readonly endpoint: Schema.String;
                readonly requests: Schema.Number;
            }>>;
        }>>;
    }>, readonly []>;
    readonly trackingSummary: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly generated_at: Schema.String;
        readonly stale_after_seconds: Schema.Number;
        readonly processes: Schema.$Array<Schema.Struct<{
            readonly script: Schema.String;
            readonly run_id: Schema.Number;
            readonly interval_start: Schema.String;
            readonly interval_end: Schema.String;
            readonly process_started_at: Schema.String;
            readonly ram_bytes: Schema.Number;
            readonly uptime_seconds: Schema.Number;
            readonly goroutines: Schema.Number;
            readonly heap_objects: Schema.Number;
            readonly gc_cycles: Schema.Number;
            readonly health: Schema.Struct<{
                readonly healthy: Schema.Boolean;
                readonly reported_healthy: Schema.Boolean;
                readonly stale: Schema.Boolean;
                readonly observed_at: Schema.String;
                readonly age_seconds: Schema.Number;
                readonly stale_after_seconds: Schema.Number;
            }>;
        }>>;
        readonly domains: Schema.$Array<Schema.Struct<{
            readonly script: Schema.String;
            readonly domain: Schema.String;
            readonly run_id: Schema.Number;
            readonly interval_start: Schema.String;
            readonly interval_end: Schema.String;
            readonly interval_duration_seconds: Schema.Number;
            readonly last_success: Schema.optionalKey<Schema.String>;
            readonly latest_error: Schema.optionalKey<Schema.String>;
            readonly request_count: Schema.Number;
            readonly requests_per_second: Schema.Number;
            readonly error_count: Schema.Number;
            readonly error_rate: Schema.Number;
            readonly average_request_latency_ms: Schema.Number;
            readonly write_count: Schema.Number;
            readonly writes_per_second: Schema.Number;
            readonly processing_count: Schema.Number;
            readonly average_processing_duration_ms: Schema.Number;
            readonly queue_depth: Schema.Number;
            readonly database: Schema.Struct<{
                readonly batch_count: Schema.Number;
                readonly rows_requested: Schema.Number;
                readonly rows_affected: Schema.Number;
                readonly average_store_duration_ms: Schema.Number;
            }>;
            readonly targets: Schema.Struct<{
                readonly target_count: Schema.Number;
                readonly current_cycle: Schema.Number;
                readonly processed_targets: Schema.Number;
                readonly targets_per_second: Schema.Number;
                readonly completion_percentage: Schema.Number;
                readonly estimated_seconds_remaining: Schema.optionalKey<Schema.Number>;
                readonly estimated_loop_completion: Schema.optionalKey<Schema.String>;
            }>;
            readonly health: Schema.Struct<{
                readonly healthy: Schema.Boolean;
                readonly reported_healthy: Schema.Boolean;
                readonly stale: Schema.Boolean;
                readonly observed_at: Schema.String;
                readonly age_seconds: Schema.Number;
                readonly stale_after_seconds: Schema.Number;
            }>;
        }>>;
        readonly globalclans: Schema.optionalKey<Schema.Struct<{
            readonly priority: Schema.optionalKey<Schema.Struct<{
                readonly target_count: Schema.Number;
                readonly current_cycle: Schema.Number;
                readonly processed_targets: Schema.Number;
                readonly targets_per_second: Schema.Number;
                readonly completion_percentage: Schema.Number;
                readonly estimated_seconds_remaining: Schema.optionalKey<Schema.Number>;
                readonly estimated_loop_completion: Schema.optionalKey<Schema.String>;
            }>>;
            readonly non_priority: Schema.optionalKey<Schema.Struct<{
                readonly target_count: Schema.Number;
                readonly current_cycle: Schema.Number;
                readonly processed_targets: Schema.Number;
                readonly targets_per_second: Schema.Number;
                readonly completion_percentage: Schema.Number;
                readonly estimated_seconds_remaining: Schema.optionalKey<Schema.Number>;
                readonly estimated_loop_completion: Schema.optionalKey<Schema.String>;
            }>>;
        }>>;
    }>, readonly []>;
    readonly trackingTimeseries: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
        readonly window: Schema.Literals<readonly ["15m", "1h", "6h", "24h"]>;
        readonly script: Schema.optionalKey<Schema.String>;
    }>, Schema.Struct<{}>, Schema.Struct<{
        readonly generated_at: Schema.String;
        readonly window: Schema.Literals<readonly ["15m", "1h", "6h", "24h"]>;
        readonly start: Schema.String;
        readonly end: Schema.String;
        readonly bucket_seconds: Schema.Number;
        readonly max_points_per_series: Schema.Number;
        readonly processes: Schema.$Array<Schema.Struct<{
            readonly script: Schema.String;
            readonly points: Schema.$Array<Schema.Struct<{
                readonly timestamp: Schema.String;
                readonly observed_at: Schema.String;
                readonly ram_bytes: Schema.Number;
                readonly uptime_seconds: Schema.Number;
                readonly goroutines: Schema.Number;
                readonly heap_objects: Schema.Number;
                readonly gc_cycles: Schema.Number;
            }>>;
        }>>;
        readonly domains: Schema.$Array<Schema.Struct<{
            readonly script: Schema.String;
            readonly domain: Schema.String;
            readonly points: Schema.$Array<Schema.Struct<{
                readonly timestamp: Schema.String;
                readonly observed_at: Schema.String;
                readonly interval_duration_seconds: Schema.Number;
                readonly request_count: Schema.Number;
                readonly requests_per_second: Schema.Number;
                readonly error_count: Schema.Number;
                readonly error_rate: Schema.Number;
                readonly average_request_latency_ms: Schema.Number;
                readonly write_count: Schema.Number;
                readonly writes_per_second: Schema.Number;
                readonly processing_count: Schema.Number;
                readonly average_processing_duration_ms: Schema.Number;
                readonly queue_depth: Schema.Number;
                readonly database: Schema.Struct<{
                    readonly batch_count: Schema.Number;
                    readonly rows_requested: Schema.Number;
                    readonly rows_affected: Schema.Number;
                    readonly average_store_duration_ms: Schema.Number;
                }>;
                readonly targets: Schema.Struct<{
                    readonly target_count: Schema.Number;
                    readonly current_cycle: Schema.Number;
                    readonly processed_targets: Schema.Number;
                    readonly targets_per_second: Schema.Number;
                    readonly completion_percentage: Schema.Number;
                    readonly estimated_seconds_remaining: Schema.optionalKey<Schema.Number>;
                    readonly estimated_loop_completion: Schema.optionalKey<Schema.String>;
                }>;
                readonly reported_healthy: Schema.Boolean;
            }>>;
        }>>;
    }>, readonly []>;
    readonly listDeveloperApplications: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.$Array<Schema.Struct<{
        readonly application_id: Schema.String;
        readonly developer_name: Schema.String;
        readonly api_request_count: Schema.String;
        readonly links_lookup_count: Schema.String;
        readonly token_prefix: Schema.String;
        readonly token_last_used_at: Schema.NullOr<Schema.String>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
        readonly revoked_at: Schema.NullOr<Schema.String>;
    }>>, readonly []>;
    readonly createDeveloperApplication: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly developer_name: Schema.String;
    }>, Schema.Struct<{
        readonly application_id: Schema.String;
        readonly developer_name: Schema.String;
        readonly api_request_count: Schema.String;
        readonly links_lookup_count: Schema.String;
        readonly token_prefix: Schema.String;
        readonly token_last_used_at: Schema.NullOr<Schema.String>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
        readonly revoked_at: Schema.NullOr<Schema.String>;
        readonly api_token: Schema.String;
    }>, readonly []>;
    readonly getDeveloperApplication: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly applicationId: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly application_id: Schema.String;
        readonly developer_name: Schema.String;
        readonly api_request_count: Schema.String;
        readonly links_lookup_count: Schema.String;
        readonly token_prefix: Schema.String;
        readonly token_last_used_at: Schema.NullOr<Schema.String>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
        readonly revoked_at: Schema.NullOr<Schema.String>;
    }>, readonly []>;
    readonly updateDeveloperApplication: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly applicationId: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{
        readonly developer_name: Schema.String;
    }>, Schema.Struct<{
        readonly application_id: Schema.String;
        readonly developer_name: Schema.String;
        readonly api_request_count: Schema.String;
        readonly links_lookup_count: Schema.String;
        readonly token_prefix: Schema.String;
        readonly token_last_used_at: Schema.NullOr<Schema.String>;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
        readonly revoked_at: Schema.NullOr<Schema.String>;
    }>, readonly []>;
    readonly deleteDeveloperApplication: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly applicationId: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Void, readonly []>;
    readonly listFeatureFlags: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.$Array<Schema.Struct<{
        readonly key: Schema.String;
        readonly name: Schema.String;
        readonly description: Schema.String;
        readonly enabled: Schema.Boolean;
        readonly rolloutPercentage: Schema.Int;
        readonly minAppVersion: Schema.optionalKey<Schema.String>;
        readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
        readonly owner: Schema.String;
        readonly lastUpdated: Schema.String;
        readonly publicExposure: Schema.Literals<readonly ["safe", "sensitive"]>;
        readonly startsAt: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly endsAt: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    }>>, readonly []>;
    readonly createFeatureFlag: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly key: Schema.String;
        readonly name: Schema.String;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly enabled: Schema.optionalKey<Schema.Boolean>;
        readonly rolloutPercentage: Schema.optionalKey<Schema.Int>;
        readonly minAppVersion: Schema.optionalKey<Schema.String>;
        readonly platforms: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>>;
        readonly owner: Schema.optionalKey<Schema.String>;
        readonly publicExposure: Schema.optionalKey<Schema.Literals<readonly ["safe", "sensitive"]>>;
        readonly startsAt: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly endsAt: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    }>, Schema.Struct<{
        readonly key: Schema.String;
        readonly name: Schema.String;
        readonly description: Schema.String;
        readonly enabled: Schema.Boolean;
        readonly rolloutPercentage: Schema.Int;
        readonly minAppVersion: Schema.optionalKey<Schema.String>;
        readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
        readonly owner: Schema.String;
        readonly lastUpdated: Schema.String;
        readonly publicExposure: Schema.Literals<readonly ["safe", "sensitive"]>;
        readonly startsAt: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly endsAt: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    }>, readonly []>;
    readonly updateFeatureFlag: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly key: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{
        readonly name: Schema.optionalKey<Schema.String>;
        readonly description: Schema.optionalKey<Schema.String>;
        readonly enabled: Schema.optionalKey<Schema.Boolean>;
        readonly rolloutPercentage: Schema.optionalKey<Schema.Int>;
        readonly minAppVersion: Schema.optionalKey<Schema.String>;
        readonly platforms: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>>;
        readonly owner: Schema.optionalKey<Schema.String>;
        readonly publicExposure: Schema.optionalKey<Schema.Literals<readonly ["safe", "sensitive"]>>;
        readonly startsAt: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly endsAt: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    }>, Schema.Struct<{
        readonly key: Schema.String;
        readonly name: Schema.String;
        readonly description: Schema.String;
        readonly enabled: Schema.Boolean;
        readonly rolloutPercentage: Schema.Int;
        readonly minAppVersion: Schema.optionalKey<Schema.String>;
        readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
        readonly owner: Schema.String;
        readonly lastUpdated: Schema.String;
        readonly publicExposure: Schema.Literals<readonly ["safe", "sensitive"]>;
        readonly startsAt: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly endsAt: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    }>, readonly []>;
    readonly listAppReleases: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly releases: Schema.$Array<Schema.Struct<{
            readonly schemaVersion: Schema.Literal<1>;
            readonly version: Schema.String;
            readonly appVersion: Schema.String;
            readonly track: Schema.Literals<readonly ["beta", "production"]>;
            readonly type: Schema.Literals<readonly ["native", "ota"]>;
            readonly gitSha: Schema.String;
            readonly createdAt: Schema.String;
            readonly releaseNotes: Schema.optionalKey<Schema.String>;
            readonly platforms: Schema.Struct<{
                readonly ios: Schema.optionalKey<Schema.Struct<{
                    readonly runtimeVersion: Schema.String;
                    readonly fingerprint: Schema.optionalKey<Schema.String>;
                    readonly manifest: Schema.optionalKey<Schema.Struct<{
                        readonly id: Schema.optionalKey<Schema.String>;
                    }>>;
                }>>;
                readonly android: Schema.optionalKey<Schema.Struct<{
                    readonly runtimeVersion: Schema.String;
                    readonly fingerprint: Schema.optionalKey<Schema.String>;
                    readonly manifest: Schema.optionalKey<Schema.Struct<{
                        readonly id: Schema.optionalKey<Schema.String>;
                    }>>;
                }>>;
            }>;
            readonly rollbackTargets: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Struct<{
                readonly type: Schema.Literals<readonly ["native", "ota"]>;
                readonly gitSha: Schema.optionalKey<Schema.String>;
                readonly platforms: Schema.Struct<{
                    readonly ios: Schema.optionalKey<Schema.Struct<{
                        readonly runtimeVersion: Schema.String;
                        readonly key: Schema.String;
                    }>>;
                    readonly android: Schema.optionalKey<Schema.Struct<{
                        readonly runtimeVersion: Schema.String;
                        readonly key: Schema.String;
                    }>>;
                }>;
            }>>>;
        }>>;
        readonly channels: Schema.$Array<Schema.Struct<{
            readonly channel: Schema.Literals<readonly ["beta", "production"]>;
            readonly platform: Schema.Literals<readonly ["ios", "android"]>;
            readonly runtimeVersion: Schema.String;
            readonly activeVersion: Schema.NullOr<Schema.String>;
            readonly rollbackTargetVersion: Schema.NullOr<Schema.String>;
            readonly rolloutBasisPoints: Schema.Int;
            readonly paused: Schema.Boolean;
            readonly schedule: Schema.NullOr<Schema.Struct<{
                readonly fromBasisPoints: Schema.Int;
                readonly toBasisPoints: Schema.Int;
                readonly startsAt: Schema.String;
                readonly endsAt: Schema.String;
            }>>;
            readonly updatedAt: Schema.String;
        }>>;
    }>, readonly []>;
    readonly updateAppReleaseChannel: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly track: Schema.Literals<readonly ["beta", "production"]>;
        readonly platform: Schema.Literals<readonly ["ios", "android"]>;
        readonly runtimeVersion: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{
        readonly activeVersion: Schema.NullOr<Schema.String>;
        readonly rollbackTargetVersion: Schema.NullOr<Schema.String>;
        readonly rolloutBasisPoints: Schema.Int;
        readonly paused: Schema.Boolean;
        readonly schedule: Schema.NullOr<Schema.Struct<{
            readonly fromBasisPoints: Schema.Int;
            readonly toBasisPoints: Schema.Int;
            readonly startsAt: Schema.String;
            readonly endsAt: Schema.String;
        }>>;
    }>, Schema.Struct<{
        readonly channel: Schema.Literals<readonly ["beta", "production"]>;
        readonly platform: Schema.Literals<readonly ["ios", "android"]>;
        readonly runtimeVersion: Schema.String;
        readonly activeVersion: Schema.NullOr<Schema.String>;
        readonly rollbackTargetVersion: Schema.NullOr<Schema.String>;
        readonly rolloutBasisPoints: Schema.Int;
        readonly paused: Schema.Boolean;
        readonly schedule: Schema.NullOr<Schema.Struct<{
            readonly fromBasisPoints: Schema.Int;
            readonly toBasisPoints: Schema.Int;
            readonly startsAt: Schema.String;
            readonly endsAt: Schema.String;
        }>>;
        readonly updatedAt: Schema.String;
    }>, readonly []>;
    readonly listPosts: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
        readonly status: Schema.optionalKey<Schema.Literals<readonly ["draft", "scheduled", "live", "expired", "archived"]>>;
    }>, Schema.Struct<{}>, Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly slug: Schema.String;
        readonly title: Schema.String;
        readonly summary: Schema.String;
        readonly hero_image_url: Schema.optionalKey<Schema.String>;
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
        readonly translations: Schema.$Record<Schema.String, Schema.Struct<{
            readonly title: Schema.String;
            readonly summary: Schema.String;
            readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
            }>]>>>;
            readonly push_title: Schema.optionalKey<Schema.String>;
            readonly push_body: Schema.optionalKey<Schema.String>;
        }>>;
        readonly presentation_type: Schema.Literals<readonly ["article", "story"]>;
        readonly story_url: Schema.optionalKey<Schema.String>;
        readonly story_version: Schema.Number;
        readonly story_history: Schema.$Array<Schema.String>;
        readonly revision_number: Schema.Number;
        readonly show_on_home: Schema.Boolean;
        readonly pinned_on_home: Schema.Boolean;
        readonly target_route: Schema.optionalKey<Schema.String>;
        readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
        readonly dismissible: Schema.Boolean;
        readonly priority: Schema.Int;
        readonly status: Schema.Literals<readonly ["draft", "scheduled", "live", "expired", "archived"]>;
        readonly starts_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly ends_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly also_push_on_publish: Schema.Boolean;
        readonly push_title: Schema.optionalKey<Schema.String>;
        readonly push_body: Schema.optionalKey<Schema.String>;
        readonly published_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly push_sent_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly created_by: Schema.String;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>>, readonly []>;
    readonly createPost: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly hero_image_url: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
        }>]>>>;
        readonly translations: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Struct<{
            readonly title: Schema.String;
            readonly summary: Schema.String;
            readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
            }>]>>>;
            readonly push_title: Schema.optionalKey<Schema.String>;
            readonly push_body: Schema.optionalKey<Schema.String>;
        }>>>;
        readonly presentation_type: Schema.optionalKey<Schema.Literals<readonly ["article", "story"]>>;
        readonly story_url: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly show_on_home: Schema.optionalKey<Schema.Boolean>;
        readonly pinned_on_home: Schema.optionalKey<Schema.Boolean>;
        readonly target_route: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly platforms: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>>;
        readonly dismissible: Schema.optionalKey<Schema.Boolean>;
        readonly priority: Schema.optionalKey<Schema.Int>;
        readonly starts_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly ends_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly also_push_on_publish: Schema.optionalKey<Schema.Boolean>;
        readonly push_title: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly push_body: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly title: Schema.String;
        readonly summary: Schema.String;
    }>, Schema.Struct<{
        readonly id: Schema.String;
        readonly slug: Schema.String;
        readonly title: Schema.String;
        readonly summary: Schema.String;
        readonly hero_image_url: Schema.optionalKey<Schema.String>;
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
        readonly translations: Schema.$Record<Schema.String, Schema.Struct<{
            readonly title: Schema.String;
            readonly summary: Schema.String;
            readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
            }>]>>>;
            readonly push_title: Schema.optionalKey<Schema.String>;
            readonly push_body: Schema.optionalKey<Schema.String>;
        }>>;
        readonly presentation_type: Schema.Literals<readonly ["article", "story"]>;
        readonly story_url: Schema.optionalKey<Schema.String>;
        readonly story_version: Schema.Number;
        readonly story_history: Schema.$Array<Schema.String>;
        readonly revision_number: Schema.Number;
        readonly show_on_home: Schema.Boolean;
        readonly pinned_on_home: Schema.Boolean;
        readonly target_route: Schema.optionalKey<Schema.String>;
        readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
        readonly dismissible: Schema.Boolean;
        readonly priority: Schema.Int;
        readonly status: Schema.Literals<readonly ["draft", "scheduled", "live", "expired", "archived"]>;
        readonly starts_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly ends_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly also_push_on_publish: Schema.Boolean;
        readonly push_title: Schema.optionalKey<Schema.String>;
        readonly push_body: Schema.optionalKey<Schema.String>;
        readonly published_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly push_sent_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly created_by: Schema.String;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>, readonly []>;
    readonly getPost: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly id: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly id: Schema.String;
        readonly slug: Schema.String;
        readonly title: Schema.String;
        readonly summary: Schema.String;
        readonly hero_image_url: Schema.optionalKey<Schema.String>;
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
        readonly translations: Schema.$Record<Schema.String, Schema.Struct<{
            readonly title: Schema.String;
            readonly summary: Schema.String;
            readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
            }>]>>>;
            readonly push_title: Schema.optionalKey<Schema.String>;
            readonly push_body: Schema.optionalKey<Schema.String>;
        }>>;
        readonly presentation_type: Schema.Literals<readonly ["article", "story"]>;
        readonly story_url: Schema.optionalKey<Schema.String>;
        readonly story_version: Schema.Number;
        readonly story_history: Schema.$Array<Schema.String>;
        readonly revision_number: Schema.Number;
        readonly show_on_home: Schema.Boolean;
        readonly pinned_on_home: Schema.Boolean;
        readonly target_route: Schema.optionalKey<Schema.String>;
        readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
        readonly dismissible: Schema.Boolean;
        readonly priority: Schema.Int;
        readonly status: Schema.Literals<readonly ["draft", "scheduled", "live", "expired", "archived"]>;
        readonly starts_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly ends_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly also_push_on_publish: Schema.Boolean;
        readonly push_title: Schema.optionalKey<Schema.String>;
        readonly push_body: Schema.optionalKey<Schema.String>;
        readonly published_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly push_sent_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly created_by: Schema.String;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>, readonly []>;
    readonly updatePost: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly id: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{
        readonly title: Schema.optionalKey<Schema.String>;
        readonly summary: Schema.optionalKey<Schema.String>;
        readonly hero_image_url: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
        }>]>>>;
        readonly translations: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Struct<{
            readonly title: Schema.String;
            readonly summary: Schema.String;
            readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
            }>]>>>;
            readonly push_title: Schema.optionalKey<Schema.String>;
            readonly push_body: Schema.optionalKey<Schema.String>;
        }>>>;
        readonly presentation_type: Schema.optionalKey<Schema.Literals<readonly ["article", "story"]>>;
        readonly story_url: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly show_on_home: Schema.optionalKey<Schema.Boolean>;
        readonly pinned_on_home: Schema.optionalKey<Schema.Boolean>;
        readonly target_route: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly platforms: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>>;
        readonly dismissible: Schema.optionalKey<Schema.Boolean>;
        readonly priority: Schema.optionalKey<Schema.Int>;
        readonly starts_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly ends_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly also_push_on_publish: Schema.optionalKey<Schema.Boolean>;
        readonly push_title: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly push_body: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    }>, Schema.Struct<{
        readonly id: Schema.String;
        readonly slug: Schema.String;
        readonly title: Schema.String;
        readonly summary: Schema.String;
        readonly hero_image_url: Schema.optionalKey<Schema.String>;
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
        readonly translations: Schema.$Record<Schema.String, Schema.Struct<{
            readonly title: Schema.String;
            readonly summary: Schema.String;
            readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
            }>]>>>;
            readonly push_title: Schema.optionalKey<Schema.String>;
            readonly push_body: Schema.optionalKey<Schema.String>;
        }>>;
        readonly presentation_type: Schema.Literals<readonly ["article", "story"]>;
        readonly story_url: Schema.optionalKey<Schema.String>;
        readonly story_version: Schema.Number;
        readonly story_history: Schema.$Array<Schema.String>;
        readonly revision_number: Schema.Number;
        readonly show_on_home: Schema.Boolean;
        readonly pinned_on_home: Schema.Boolean;
        readonly target_route: Schema.optionalKey<Schema.String>;
        readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
        readonly dismissible: Schema.Boolean;
        readonly priority: Schema.Int;
        readonly status: Schema.Literals<readonly ["draft", "scheduled", "live", "expired", "archived"]>;
        readonly starts_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly ends_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly also_push_on_publish: Schema.Boolean;
        readonly push_title: Schema.optionalKey<Schema.String>;
        readonly push_body: Schema.optionalKey<Schema.String>;
        readonly published_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly push_sent_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly created_by: Schema.String;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>, readonly []>;
    readonly archivePost: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly id: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Void, readonly []>;
    readonly postAudience: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly id: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly estimated_recipients: Schema.Number;
    }>, readonly []>;
    readonly postDeliveries: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly id: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly post_id: Schema.String;
        readonly attempt_number: Schema.Number;
        readonly trigger: Schema.Literals<readonly ["publish", "retry", "manual"]>;
        readonly eligible_count: Schema.Number;
        readonly sent_count: Schema.Number;
        readonly skipped_count: Schema.Number;
        readonly status: Schema.Literals<readonly ["queued", "processing", "sent", "partial", "failed", "no_audience"]>;
        readonly error_summary: Schema.optionalKey<Schema.String>;
        readonly attempted_at: Schema.String;
    }>>, readonly []>;
    readonly postRevisions: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly id: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly post_id: Schema.String;
        readonly revision_number: Schema.Number;
        readonly snapshot: Schema.Struct<{
            readonly id: Schema.String;
            readonly slug: Schema.String;
            readonly title: Schema.String;
            readonly summary: Schema.String;
            readonly hero_image_url: Schema.optionalKey<Schema.String>;
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
            readonly translations: Schema.$Record<Schema.String, Schema.Struct<{
                readonly title: Schema.String;
                readonly summary: Schema.String;
                readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
                }>]>>>;
                readonly push_title: Schema.optionalKey<Schema.String>;
                readonly push_body: Schema.optionalKey<Schema.String>;
            }>>;
            readonly presentation_type: Schema.Literals<readonly ["article", "story"]>;
            readonly story_url: Schema.optionalKey<Schema.String>;
            readonly story_version: Schema.Number;
            readonly story_history: Schema.$Array<Schema.String>;
            readonly revision_number: Schema.Number;
            readonly show_on_home: Schema.Boolean;
            readonly pinned_on_home: Schema.Boolean;
            readonly target_route: Schema.optionalKey<Schema.String>;
            readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
            readonly dismissible: Schema.Boolean;
            readonly priority: Schema.Int;
            readonly status: Schema.Literals<readonly ["draft", "scheduled", "live", "expired", "archived"]>;
            readonly starts_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly ends_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly also_push_on_publish: Schema.Boolean;
            readonly push_title: Schema.optionalKey<Schema.String>;
            readonly push_body: Schema.optionalKey<Schema.String>;
            readonly published_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly push_sent_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
            readonly created_by: Schema.String;
            readonly created_at: Schema.String;
            readonly updated_at: Schema.String;
        }>;
        readonly created_by: Schema.String;
        readonly created_at: Schema.String;
    }>>, readonly []>;
    readonly restorePostRevision: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly id: Schema.String;
        readonly revision: Schema.Int;
    }>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly id: Schema.String;
        readonly slug: Schema.String;
        readonly title: Schema.String;
        readonly summary: Schema.String;
        readonly hero_image_url: Schema.optionalKey<Schema.String>;
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
        readonly translations: Schema.$Record<Schema.String, Schema.Struct<{
            readonly title: Schema.String;
            readonly summary: Schema.String;
            readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
            }>]>>>;
            readonly push_title: Schema.optionalKey<Schema.String>;
            readonly push_body: Schema.optionalKey<Schema.String>;
        }>>;
        readonly presentation_type: Schema.Literals<readonly ["article", "story"]>;
        readonly story_url: Schema.optionalKey<Schema.String>;
        readonly story_version: Schema.Number;
        readonly story_history: Schema.$Array<Schema.String>;
        readonly revision_number: Schema.Number;
        readonly show_on_home: Schema.Boolean;
        readonly pinned_on_home: Schema.Boolean;
        readonly target_route: Schema.optionalKey<Schema.String>;
        readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
        readonly dismissible: Schema.Boolean;
        readonly priority: Schema.Int;
        readonly status: Schema.Literals<readonly ["draft", "scheduled", "live", "expired", "archived"]>;
        readonly starts_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly ends_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly also_push_on_publish: Schema.Boolean;
        readonly push_title: Schema.optionalKey<Schema.String>;
        readonly push_body: Schema.optionalKey<Schema.String>;
        readonly published_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly push_sent_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly created_by: Schema.String;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>, readonly []>;
    readonly publishPost: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly id: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly id: Schema.String;
        readonly slug: Schema.String;
        readonly title: Schema.String;
        readonly summary: Schema.String;
        readonly hero_image_url: Schema.optionalKey<Schema.String>;
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
        readonly translations: Schema.$Record<Schema.String, Schema.Struct<{
            readonly title: Schema.String;
            readonly summary: Schema.String;
            readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
            }>]>>>;
            readonly push_title: Schema.optionalKey<Schema.String>;
            readonly push_body: Schema.optionalKey<Schema.String>;
        }>>;
        readonly presentation_type: Schema.Literals<readonly ["article", "story"]>;
        readonly story_url: Schema.optionalKey<Schema.String>;
        readonly story_version: Schema.Number;
        readonly story_history: Schema.$Array<Schema.String>;
        readonly revision_number: Schema.Number;
        readonly show_on_home: Schema.Boolean;
        readonly pinned_on_home: Schema.Boolean;
        readonly target_route: Schema.optionalKey<Schema.String>;
        readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
        readonly dismissible: Schema.Boolean;
        readonly priority: Schema.Int;
        readonly status: Schema.Literals<readonly ["draft", "scheduled", "live", "expired", "archived"]>;
        readonly starts_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly ends_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly also_push_on_publish: Schema.Boolean;
        readonly push_title: Schema.optionalKey<Schema.String>;
        readonly push_body: Schema.optionalKey<Schema.String>;
        readonly published_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly push_sent_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly created_by: Schema.String;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
        readonly push_queued: Schema.Boolean;
    }>, readonly []>;
    readonly pushPost: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly id: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly queued: Schema.Boolean;
    }>, readonly []>;
    readonly duplicatePost: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly id: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly id: Schema.String;
        readonly slug: Schema.String;
        readonly title: Schema.String;
        readonly summary: Schema.String;
        readonly hero_image_url: Schema.optionalKey<Schema.String>;
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
        readonly translations: Schema.$Record<Schema.String, Schema.Struct<{
            readonly title: Schema.String;
            readonly summary: Schema.String;
            readonly body_blocks: Schema.optionalKey<Schema.$Array<Schema.Union<readonly [Schema.Struct<{
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
            }>]>>>;
            readonly push_title: Schema.optionalKey<Schema.String>;
            readonly push_body: Schema.optionalKey<Schema.String>;
        }>>;
        readonly presentation_type: Schema.Literals<readonly ["article", "story"]>;
        readonly story_url: Schema.optionalKey<Schema.String>;
        readonly story_version: Schema.Number;
        readonly story_history: Schema.$Array<Schema.String>;
        readonly revision_number: Schema.Number;
        readonly show_on_home: Schema.Boolean;
        readonly pinned_on_home: Schema.Boolean;
        readonly target_route: Schema.optionalKey<Schema.String>;
        readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
        readonly dismissible: Schema.Boolean;
        readonly priority: Schema.Int;
        readonly status: Schema.Literals<readonly ["draft", "scheduled", "live", "expired", "archived"]>;
        readonly starts_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly ends_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly also_push_on_publish: Schema.Boolean;
        readonly push_title: Schema.optionalKey<Schema.String>;
        readonly push_body: Schema.optionalKey<Schema.String>;
        readonly published_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly push_sent_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly created_by: Schema.String;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>, readonly []>;
    readonly listCampaigns: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly key: Schema.String;
        readonly title: Schema.String;
        readonly body: Schema.String;
        readonly target_route: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
        readonly target_locales: Schema.$Array<Schema.String>;
        readonly translations: Schema.$Record<Schema.String, Schema.Struct<{
            readonly title: Schema.String;
            readonly body: Schema.String;
        }>>;
        readonly status: Schema.Literals<readonly ["draft", "scheduled", "sent", "paused"]>;
        readonly trigger_type: Schema.Literals<readonly ["manual", "monthly"]>;
        readonly day_of_month: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        readonly send_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly send_time: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly last_sent_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly created_by: Schema.String;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>>, readonly []>;
    readonly createCampaign: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly target_route: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly platforms: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>>;
        readonly target_locales: Schema.optionalKey<Schema.$Array<Schema.String>>;
        readonly translations: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Struct<{
            readonly title: Schema.String;
            readonly body: Schema.String;
        }>>>;
        readonly status: Schema.optionalKey<Schema.Literals<readonly ["draft", "scheduled", "sent", "paused"]>>;
        readonly trigger_type: Schema.optionalKey<Schema.Literals<readonly ["manual", "monthly"]>>;
        readonly day_of_month: Schema.optionalKey<Schema.NullOr<Schema.Int>>;
        readonly send_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly send_time: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly title: Schema.String;
        readonly body: Schema.String;
    }>, Schema.Struct<{
        readonly id: Schema.String;
        readonly key: Schema.String;
        readonly title: Schema.String;
        readonly body: Schema.String;
        readonly target_route: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
        readonly target_locales: Schema.$Array<Schema.String>;
        readonly translations: Schema.$Record<Schema.String, Schema.Struct<{
            readonly title: Schema.String;
            readonly body: Schema.String;
        }>>;
        readonly status: Schema.Literals<readonly ["draft", "scheduled", "sent", "paused"]>;
        readonly trigger_type: Schema.Literals<readonly ["manual", "monthly"]>;
        readonly day_of_month: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        readonly send_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly send_time: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly last_sent_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly created_by: Schema.String;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>, readonly []>;
    readonly updateCampaign: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly id: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{
        readonly title: Schema.optionalKey<Schema.String>;
        readonly body: Schema.optionalKey<Schema.String>;
        readonly target_route: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly platforms: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>>;
        readonly target_locales: Schema.optionalKey<Schema.$Array<Schema.String>>;
        readonly translations: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Struct<{
            readonly title: Schema.String;
            readonly body: Schema.String;
        }>>>;
        readonly status: Schema.optionalKey<Schema.Literals<readonly ["draft", "scheduled", "sent", "paused"]>>;
        readonly trigger_type: Schema.optionalKey<Schema.Literals<readonly ["manual", "monthly"]>>;
        readonly day_of_month: Schema.optionalKey<Schema.NullOr<Schema.Int>>;
        readonly send_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly send_time: Schema.optionalKey<Schema.NullOr<Schema.String>>;
    }>, Schema.Struct<{
        readonly id: Schema.String;
        readonly key: Schema.String;
        readonly title: Schema.String;
        readonly body: Schema.String;
        readonly target_route: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly platforms: Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>;
        readonly target_locales: Schema.$Array<Schema.String>;
        readonly translations: Schema.$Record<Schema.String, Schema.Struct<{
            readonly title: Schema.String;
            readonly body: Schema.String;
        }>>;
        readonly status: Schema.Literals<readonly ["draft", "scheduled", "sent", "paused"]>;
        readonly trigger_type: Schema.Literals<readonly ["manual", "monthly"]>;
        readonly day_of_month: Schema.optionalKey<Schema.NullOr<Schema.Number>>;
        readonly send_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly send_time: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly last_sent_at: Schema.optionalKey<Schema.NullOr<Schema.String>>;
        readonly created_by: Schema.String;
        readonly created_at: Schema.String;
        readonly updated_at: Schema.String;
    }>, readonly []>;
    readonly pushAudience: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{
        readonly platforms: Schema.optionalKey<Schema.String>;
        readonly locales: Schema.optionalKey<Schema.String>;
    }>, Schema.Struct<{}>, Schema.Struct<{
        readonly estimated_recipients: Schema.Number;
    }>, readonly []>;
    readonly testPush: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly title: Schema.String;
        readonly body: Schema.String;
        readonly campaign_id: Schema.optionalKey<Schema.String>;
        readonly target_route: Schema.optionalKey<Schema.String>;
        readonly platforms: Schema.optionalKey<Schema.$Array<Schema.Literals<readonly ["ios", "android", "web"]>>>;
        readonly target_locales: Schema.optionalKey<Schema.$Array<Schema.String>>;
        readonly translations: Schema.optionalKey<Schema.$Record<Schema.String, Schema.Struct<{
            readonly title: Schema.String;
            readonly body: Schema.String;
        }>>>;
    }>, Schema.Struct<{
        readonly push_sent: Schema.Number;
        readonly push_skipped: Schema.Number;
        readonly eligible_devices: Schema.Number;
    }>, readonly []>;
    readonly labTypes: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly category: Schema.String;
        readonly label: Schema.String;
        readonly description: Schema.String;
        readonly title: Schema.String;
        readonly body: Schema.String;
        readonly data: Schema.$Record<Schema.String, Schema.String>;
    }>>, readonly []>;
    readonly labStatus: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly ready: Schema.Boolean;
    }>, readonly []>;
    readonly labDevices: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly user_id: Schema.String;
        readonly user_label: Schema.String;
        readonly device_id: Schema.String;
        readonly platform: Schema.Literals<readonly ["ios", "android"]>;
        readonly provider: Schema.String;
        readonly environment: Schema.Literals<readonly ["sandbox", "production"]>;
        readonly app_version: Schema.String;
        readonly build_number: Schema.String;
        readonly os_version: Schema.String;
        readonly device_model: Schema.String;
        readonly enabled: Schema.Boolean;
        readonly authorization_status: Schema.String;
        readonly locale: Schema.String;
        readonly last_seen_at: Schema.String;
        readonly war_attacks_enabled: Schema.Boolean;
        readonly war_state_enabled: Schema.Boolean;
        readonly war_reminders_enabled: Schema.Boolean;
        readonly events_enabled: Schema.Boolean;
        readonly announcements_enabled: Schema.Boolean;
        readonly monthly_support_enabled: Schema.Boolean;
        readonly reminder_timings: Schema.$Array<Schema.Number>;
    }>>, readonly []>;
    readonly labSend: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly device_ids: Schema.$Array<Schema.String>;
        readonly title: Schema.String;
        readonly body: Schema.String;
        readonly data: Schema.$Record<Schema.String, Schema.String>;
    }>, Schema.Struct<{
        readonly selected: Schema.Number;
        readonly sent: Schema.Number;
        readonly failed: Schema.Number;
        readonly results: Schema.$Array<Schema.Struct<{
            readonly device_id: Schema.String;
            readonly device_name: Schema.optionalKey<Schema.String>;
            readonly platform: Schema.optionalKey<Schema.String>;
            readonly environment: Schema.optionalKey<Schema.String>;
            readonly status: Schema.Literals<readonly ["sent", "failed", "not_found"]>;
            readonly detail: Schema.optionalKey<Schema.String>;
            readonly provider_message_id: Schema.optionalKey<Schema.String>;
        }>>;
    }>, readonly []>;
    readonly mediaUpload: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.FormData, Schema.Struct<{
        readonly url: Schema.String;
    }>, readonly []>;
    readonly storyUpload: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.FormData, Schema.Struct<{
        readonly url: Schema.String;
        readonly version: Schema.Literal<1>;
        readonly storage_provider: Schema.Literal<"r2">;
        readonly key: Schema.String;
        readonly size_bytes: Schema.Number;
        readonly checksum: Schema.String;
    }>, readonly []>;
};
export type AdminUser = typeof AdminUser.Type;
export type DeveloperApplication = typeof DeveloperApplication.Type;
export type FeatureFlag = typeof FeatureFlag.Type;
export type Post = typeof Post.Type;
export type Campaign = typeof Campaign.Type;
//# sourceMappingURL=admin.d.ts.map