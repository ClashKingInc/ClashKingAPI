export * from "./roster-interaction.js";
export * from "./bot-public.js";
export * from "./bot-server.js";
export * from "./bot-adjacent.js";
export * from "./persistent-runtime.js";
export declare const botEndpoints: {
    readonly sharedLinksLookup: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly discord_ids: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
        readonly player_tags: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
    }>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly is_verified: import("effect/Schema").Boolean;
            readonly player_tag: import("effect/Schema").String;
            readonly user_id: import("effect/Schema").String;
        }>>;
    }>, readonly []>;
    readonly createServerLink: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly playerTag: import("effect/Schema").String;
        readonly userID: import("effect/Schema").String;
        readonly api_token: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly player_tag: import("effect/Schema").String;
        readonly user_id: import("effect/Schema").String;
    }>, readonly []>;
    readonly deleteServerLink: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly playerTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly player_tag: import("effect/Schema").String;
        readonly user_id: import("effect/Schema").String;
    }>, readonly []>;
    readonly updateLinkLastLogin: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly userId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly timestamp: import("effect/Schema").String;
        readonly updated_count: import("effect/Schema").Number;
    }>, readonly []>;
    readonly refreshVerifiedPlayerTracking: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly player_tags: import("effect/Schema").$Array<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{
        readonly player_tags: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly expires_at: import("effect/Schema").String;
    }>, readonly []>;
    readonly upsertBaseVote: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly baseId: import("effect/Schema").String;
        readonly voterId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly direction: import("effect/Schema").Literals<readonly ["up", "down"]>;
    }>, import("effect/Schema").Struct<{
        readonly baseId: import("effect/Schema").String;
        readonly voterId: import("effect/Schema").String;
        readonly direction: import("effect/Schema").Literals<readonly ["up", "down"]>;
    }>, readonly []>;
    readonly removeBaseVote: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly baseId: import("effect/Schema").String;
        readonly voterId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Void, readonly []>;
    readonly recordBaseDownload: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly baseId: import("effect/Schema").String;
        readonly userId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly baseId: import("effect/Schema").String;
        readonly userId: import("effect/Schema").String;
        readonly downloadCount: import("effect/Schema").Number;
    }>, readonly []>;
    readonly giveawayEnter: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly giveawayId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly interaction: import("effect/Schema").Struct<{
            readonly rawBody: import("effect/Schema").String;
            readonly signature: import("effect/Schema").String;
            readonly timestamp: import("effect/Schema").String;
        }>;
    }>, import("effect/Schema").Struct<{
        readonly giveawayId: import("effect/Schema").String;
        readonly outcome: import("effect/Schema").Literals<readonly ["entered", "already_entered"]>;
        readonly entryCount: import("effect/Schema").Number;
    }>, readonly [{
        readonly status: 403;
        readonly body: import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
            readonly reason: import("effect/Schema").Literals<readonly ["roles", "avatar", "linked_account", "not_member", "not_open", "invalid_configuration", "wrong_message"]>;
        }>, import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>]>;
    }, {
        readonly status: 409;
        readonly body: import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
            readonly reason: import("effect/Schema").Literals<readonly ["roles", "avatar", "linked_account", "not_member", "not_open", "invalid_configuration", "wrong_message"]>;
        }>, import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>]>;
    }, ...{
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]]>;
    readonly giveawayPublicationPrepare: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly giveawayId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly kind: import("effect/Schema").Literals<readonly ["start", "update", "end"]>;
    }>, import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
        readonly outcome: import("effect/Schema").Literal<"pending">;
    }>, import("effect/Schema").Struct<{
        readonly outcome: import("effect/Schema").Literal<"ready">;
        readonly effectId: import("effect/Schema").String;
    }>]>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly giveawayPublicationClaim: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly giveawayId: import("effect/Schema").String;
        readonly effectId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
        readonly outcome: import("effect/Schema").Literals<readonly ["pending", "complete", "ambiguous", "failed"]>;
    }>, import("effect/Schema").Struct<{
        readonly outcome: import("effect/Schema").Literal<"claimed">;
        readonly claimToken: import("effect/Schema").String;
        readonly effect: import("effect/Schema").Struct<{
            readonly effectId: import("effect/Schema").String;
            readonly kind: import("effect/Schema").Literals<readonly ["start", "update", "end", "reroll"]>;
            readonly sourceMessageId: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly startTime: import("effect/Schema").String;
            readonly payload: import("effect/Schema").Struct<{
                readonly version: import("effect/Schema").Literal<1>;
                readonly occurred_at: import("effect/Schema").String;
                readonly giveaway: import("effect/Schema").Struct<{
                    readonly id: import("effect/Schema").String;
                    readonly server_id: import("effect/Schema").String;
                    readonly channel_id: import("effect/Schema").String;
                    readonly message_id: import("effect/Schema").NullOr<import("effect/Schema").String>;
                    readonly prize: import("effect/Schema").String;
                    readonly status: import("effect/Schema").Literals<readonly ["scheduled", "ongoing", "ended"]>;
                    readonly end_time: import("effect/Schema").String;
                    readonly winners: import("effect/Schema").Number;
                    readonly mentions: import("effect/Schema").$Array<import("effect/Schema").String>;
                    readonly text_above_embed: import("effect/Schema").String;
                    readonly text_in_embed: import("effect/Schema").String;
                    readonly text_on_end: import("effect/Schema").String;
                    readonly image_url: import("effect/Schema").NullOr<import("effect/Schema").String>;
                    readonly entry_count: import("effect/Schema").Number;
                }>;
                readonly winner_ids: import("effect/Schema").$Array<import("effect/Schema").String>;
                readonly replaced_user_ids: import("effect/Schema").$Array<import("effect/Schema").String>;
                readonly reason: import("effect/Schema").String;
                readonly actor_label: import("effect/Schema").String;
            }>;
        }>;
    }>]>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly giveawayPublicationComplete: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly giveawayId: import("effect/Schema").String;
        readonly effectId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly claimToken: import("effect/Schema").String;
        readonly outcome: import("effect/Schema").Literals<readonly ["succeeded", "ambiguous", "failed", "retry"]>;
        readonly messageId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly failureReason: import("effect/Schema").optionalKey<import("effect/Schema").Literals<readonly ["payload_validation", "http_rejected", "transport_uncertain", "source_update_uncertain", "rate_limited"]>>;
        readonly retryAfterSeconds: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{
        readonly outcome: import("effect/Schema").Literals<readonly ["succeeded", "ambiguous", "failed", "pending"]>;
    }>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly giveawayPublicationPending: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly giveawayId: import("effect/Schema").String;
            readonly effectId: import("effect/Schema").String;
        }>>;
    }>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly ticketOpenPrepare: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly interaction: import("effect/Schema").Struct<{
            readonly rawBody: import("effect/Schema").String;
            readonly signature: import("effect/Schema").String;
            readonly timestamp: import("effect/Schema").String;
        }>;
    }>, import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
        readonly outcome: import("effect/Schema").Literal<"ready">;
        readonly operationId: import("effect/Schema").String;
        readonly ticketId: import("effect/Schema").String;
        readonly action: import("effect/Schema").Literals<readonly ["open", "approve", "assign"]>;
        readonly expiresAt: import("effect/Schema").String;
        readonly form: import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literal<"account_select">;
            readonly customId: import("effect/Schema").String;
            readonly content: import("effect/Schema").String;
            readonly placeholder: import("effect/Schema").String;
            readonly minValues: import("effect/Schema").Number;
            readonly maxValues: import("effect/Schema").Number;
            readonly options: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly value: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
            }>>;
        }>, import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literal<"string_select">;
            readonly customId: import("effect/Schema").String;
            readonly content: import("effect/Schema").String;
            readonly placeholder: import("effect/Schema").String;
            readonly minValues: import("effect/Schema").Literal<1>;
            readonly maxValues: import("effect/Schema").Literal<1>;
            readonly options: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly value: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
                readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
        }>, import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literal<"modal">;
            readonly customId: import("effect/Schema").String;
            readonly title: import("effect/Schema").String;
            readonly fields: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly customId: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
                readonly required: import("effect/Schema").Boolean;
                readonly style: import("effect/Schema").Literals<readonly ["short", "paragraph"]>;
                readonly maxLength: import("effect/Schema").Number;
            }>>;
        }>, import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literal<"continue">;
            readonly customId: import("effect/Schema").String;
            readonly content: import("effect/Schema").String;
            readonly label: import("effect/Schema").String;
        }>]>;
    }>, import("effect/Schema").Struct<{
        readonly outcome: import("effect/Schema").Literals<readonly ["accepted", "complete"]>;
        readonly operationId: import("effect/Schema").String;
        readonly ticketId: import("effect/Schema").String;
        readonly state: import("effect/Schema").Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
    }>, import("effect/Schema").Struct<{
        readonly outcome: import("effect/Schema").Literal<"link_required">;
        readonly preparationId: import("effect/Schema").String;
        readonly expiresAt: import("effect/Schema").String;
        readonly content: import("effect/Schema").String;
        readonly link: import("effect/Schema").Struct<{
            readonly customId: import("effect/Schema").String;
            readonly label: import("effect/Schema").String;
        }>;
    }>]>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly ticketApprovePrepare: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly interaction: import("effect/Schema").Struct<{
            readonly rawBody: import("effect/Schema").String;
            readonly signature: import("effect/Schema").String;
            readonly timestamp: import("effect/Schema").String;
        }>;
    }>, import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
        readonly outcome: import("effect/Schema").Literal<"ready">;
        readonly operationId: import("effect/Schema").String;
        readonly ticketId: import("effect/Schema").String;
        readonly action: import("effect/Schema").Literals<readonly ["open", "approve", "assign"]>;
        readonly expiresAt: import("effect/Schema").String;
        readonly form: import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literal<"account_select">;
            readonly customId: import("effect/Schema").String;
            readonly content: import("effect/Schema").String;
            readonly placeholder: import("effect/Schema").String;
            readonly minValues: import("effect/Schema").Number;
            readonly maxValues: import("effect/Schema").Number;
            readonly options: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly value: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
            }>>;
        }>, import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literal<"string_select">;
            readonly customId: import("effect/Schema").String;
            readonly content: import("effect/Schema").String;
            readonly placeholder: import("effect/Schema").String;
            readonly minValues: import("effect/Schema").Literal<1>;
            readonly maxValues: import("effect/Schema").Literal<1>;
            readonly options: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly value: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
                readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
        }>, import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literal<"modal">;
            readonly customId: import("effect/Schema").String;
            readonly title: import("effect/Schema").String;
            readonly fields: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly customId: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
                readonly required: import("effect/Schema").Boolean;
                readonly style: import("effect/Schema").Literals<readonly ["short", "paragraph"]>;
                readonly maxLength: import("effect/Schema").Number;
            }>>;
        }>, import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literal<"continue">;
            readonly customId: import("effect/Schema").String;
            readonly content: import("effect/Schema").String;
            readonly label: import("effect/Schema").String;
        }>]>;
    }>, import("effect/Schema").Struct<{
        readonly outcome: import("effect/Schema").Literals<readonly ["accepted", "complete"]>;
        readonly operationId: import("effect/Schema").String;
        readonly ticketId: import("effect/Schema").String;
        readonly state: import("effect/Schema").Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
    }>]>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly ticketOperationAdvance: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly operationId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly interaction: import("effect/Schema").Struct<{
            readonly rawBody: import("effect/Schema").String;
            readonly signature: import("effect/Schema").String;
            readonly timestamp: import("effect/Schema").String;
        }>;
    }>, import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
        readonly outcome: import("effect/Schema").Literal<"ready">;
        readonly operationId: import("effect/Schema").String;
        readonly ticketId: import("effect/Schema").String;
        readonly action: import("effect/Schema").Literals<readonly ["open", "approve", "assign"]>;
        readonly expiresAt: import("effect/Schema").String;
        readonly form: import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literal<"account_select">;
            readonly customId: import("effect/Schema").String;
            readonly content: import("effect/Schema").String;
            readonly placeholder: import("effect/Schema").String;
            readonly minValues: import("effect/Schema").Number;
            readonly maxValues: import("effect/Schema").Number;
            readonly options: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly value: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
            }>>;
        }>, import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literal<"string_select">;
            readonly customId: import("effect/Schema").String;
            readonly content: import("effect/Schema").String;
            readonly placeholder: import("effect/Schema").String;
            readonly minValues: import("effect/Schema").Literal<1>;
            readonly maxValues: import("effect/Schema").Literal<1>;
            readonly options: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly value: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
                readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
        }>, import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literal<"modal">;
            readonly customId: import("effect/Schema").String;
            readonly title: import("effect/Schema").String;
            readonly fields: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly customId: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
                readonly required: import("effect/Schema").Boolean;
                readonly style: import("effect/Schema").Literals<readonly ["short", "paragraph"]>;
                readonly maxLength: import("effect/Schema").Number;
            }>>;
        }>, import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literal<"continue">;
            readonly customId: import("effect/Schema").String;
            readonly content: import("effect/Schema").String;
            readonly label: import("effect/Schema").String;
        }>]>;
    }>, import("effect/Schema").Struct<{
        readonly outcome: import("effect/Schema").Literals<readonly ["accepted", "complete"]>;
        readonly operationId: import("effect/Schema").String;
        readonly ticketId: import("effect/Schema").String;
        readonly state: import("effect/Schema").Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
    }>]>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly ticketAction: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly interaction: import("effect/Schema").Struct<{
            readonly rawBody: import("effect/Schema").String;
            readonly signature: import("effect/Schema").String;
            readonly timestamp: import("effect/Schema").String;
        }>;
    }>, import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
        readonly outcome: import("effect/Schema").Literal<"ready">;
        readonly operationId: import("effect/Schema").String;
        readonly ticketId: import("effect/Schema").String;
        readonly action: import("effect/Schema").Literals<readonly ["open", "approve", "assign"]>;
        readonly expiresAt: import("effect/Schema").String;
        readonly form: import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literal<"account_select">;
            readonly customId: import("effect/Schema").String;
            readonly content: import("effect/Schema").String;
            readonly placeholder: import("effect/Schema").String;
            readonly minValues: import("effect/Schema").Number;
            readonly maxValues: import("effect/Schema").Number;
            readonly options: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly value: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
            }>>;
        }>, import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literal<"string_select">;
            readonly customId: import("effect/Schema").String;
            readonly content: import("effect/Schema").String;
            readonly placeholder: import("effect/Schema").String;
            readonly minValues: import("effect/Schema").Literal<1>;
            readonly maxValues: import("effect/Schema").Literal<1>;
            readonly options: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly value: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
                readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
        }>, import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literal<"modal">;
            readonly customId: import("effect/Schema").String;
            readonly title: import("effect/Schema").String;
            readonly fields: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly customId: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
                readonly required: import("effect/Schema").Boolean;
                readonly style: import("effect/Schema").Literals<readonly ["short", "paragraph"]>;
                readonly maxLength: import("effect/Schema").Number;
            }>>;
        }>, import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literal<"continue">;
            readonly customId: import("effect/Schema").String;
            readonly content: import("effect/Schema").String;
            readonly label: import("effect/Schema").String;
        }>]>;
    }>, import("effect/Schema").Struct<{
        readonly outcome: import("effect/Schema").Literals<readonly ["accepted", "complete"]>;
        readonly operationId: import("effect/Schema").String;
        readonly ticketId: import("effect/Schema").String;
        readonly state: import("effect/Schema").Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
    }>]>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly ticketAccountInteraction: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly interaction: import("effect/Schema").Struct<{
            readonly rawBody: import("effect/Schema").String;
            readonly signature: import("effect/Schema").String;
            readonly timestamp: import("effect/Schema").String;
        }>;
    }>, import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
        readonly outcome: import("effect/Schema").Literal<"form">;
        readonly preparationId: import("effect/Schema").String;
        readonly expiresAt: import("effect/Schema").String;
        readonly form: import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literal<"modal">;
            readonly customId: import("effect/Schema").String;
            readonly title: import("effect/Schema").String;
            readonly fields: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly customId: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
                readonly required: import("effect/Schema").Boolean;
                readonly style: import("effect/Schema").Literals<readonly ["short", "paragraph"]>;
                readonly maxLength: import("effect/Schema").Number;
            }>>;
        }>;
    }>, import("effect/Schema").Struct<{
        readonly outcome: import("effect/Schema").Literal<"linked">;
        readonly preparationId: import("effect/Schema").String;
        readonly accountTag: import("effect/Schema").String;
        readonly content: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly outcome: import("effect/Schema").Literal<"accounts">;
        readonly ticketId: import("effect/Schema").String;
        readonly sessionId: import("effect/Schema").String;
        readonly expiresAt: import("effect/Schema").String;
        readonly content: import("effect/Schema").String;
        readonly accounts: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly townHallLevel: import("effect/Schema").Number;
        }>>;
        readonly select: import("effect/Schema").Struct<{
            readonly customId: import("effect/Schema").String;
            readonly placeholder: import("effect/Schema").String;
            readonly options: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly label: import("effect/Schema").String;
                readonly value: import("effect/Schema").String;
            }>>;
            readonly minValues: import("effect/Schema").Literal<1>;
            readonly maxValues: import("effect/Schema").Literal<1>;
        }>;
    }>, import("effect/Schema").Struct<{
        readonly outcome: import("effect/Schema").Literal<"account">;
        readonly ticketId: import("effect/Schema").String;
        readonly sessionId: import("effect/Schema").String;
        readonly content: import("effect/Schema").String;
        readonly account: import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly townHallLevel: import("effect/Schema").Number;
        }>;
    }>]>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly ticketOperationStatus: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly operationId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly interaction: import("effect/Schema").Struct<{
            readonly rawBody: import("effect/Schema").String;
            readonly signature: import("effect/Schema").String;
            readonly timestamp: import("effect/Schema").String;
        }>;
    }>, import("effect/Schema").Struct<{
        readonly operationId: import("effect/Schema").String;
        readonly ticketId: import("effect/Schema").String;
        readonly state: import("effect/Schema").Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
        readonly action: import("effect/Schema").Literals<readonly ["open", "set_status", "assign", "approve", "add_member", "opt", "notify"]>;
        readonly channelId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly threadId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly failure: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly ticketPanelPublicationPrepare: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly interaction: import("effect/Schema").Struct<{
            readonly rawBody: import("effect/Schema").String;
            readonly signature: import("effect/Schema").String;
            readonly timestamp: import("effect/Schema").String;
        }>;
    }>, import("effect/Schema").Struct<{
        readonly effectId: import("effect/Schema").String;
        readonly panelId: import("effect/Schema").String;
        readonly state: import("effect/Schema").Literals<readonly ["pending", "executing", "uncertain", "succeeded", "failed"]>;
        readonly statusCustomId: import("effect/Schema").String;
    }>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly ticketPanelPublicationStatus: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly effectId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly interaction: import("effect/Schema").Struct<{
            readonly rawBody: import("effect/Schema").String;
            readonly signature: import("effect/Schema").String;
            readonly timestamp: import("effect/Schema").String;
        }>;
    }>, import("effect/Schema").Struct<{
        readonly effectId: import("effect/Schema").String;
        readonly panelId: import("effect/Schema").String;
        readonly state: import("effect/Schema").Literals<readonly ["pending", "executing", "uncertain", "succeeded", "failed"]>;
        readonly statusCustomId: import("effect/Schema").String;
        readonly messageId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly rosterAction: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly interaction: import("effect/Schema").Struct<{
            readonly rawBody: import("effect/Schema").String;
            readonly signature: import("effect/Schema").String;
            readonly timestamp: import("effect/Schema").String;
        }>;
    }>, import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
        readonly outcome: import("effect/Schema").Literal<"ready">;
        readonly operationId: import("effect/Schema").String;
        readonly rosterId: import("effect/Schema").String;
        readonly action: import("effect/Schema").Literals<readonly ["signup", "remove", "sub", "refresh", "publish"]>;
        readonly expiresAt: import("effect/Schema").String;
        readonly form: import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literal<"account_select">;
            readonly customId: import("effect/Schema").String;
            readonly content: import("effect/Schema").String;
            readonly placeholder: import("effect/Schema").String;
            readonly minValues: import("effect/Schema").Number;
            readonly maxValues: import("effect/Schema").Number;
            readonly options: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly value: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
            }>>;
        }>, import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literal<"string_select">;
            readonly customId: import("effect/Schema").String;
            readonly content: import("effect/Schema").String;
            readonly placeholder: import("effect/Schema").String;
            readonly minValues: import("effect/Schema").Literal<1>;
            readonly maxValues: import("effect/Schema").Literal<1>;
            readonly options: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly value: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
                readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
        }>, import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literal<"modal">;
            readonly customId: import("effect/Schema").String;
            readonly title: import("effect/Schema").String;
            readonly fields: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly customId: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
                readonly required: import("effect/Schema").Boolean;
                readonly style: import("effect/Schema").Literals<readonly ["short", "paragraph"]>;
                readonly maxLength: import("effect/Schema").Number;
            }>>;
        }>, import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literal<"continue">;
            readonly customId: import("effect/Schema").String;
            readonly content: import("effect/Schema").String;
            readonly label: import("effect/Schema").String;
        }>]>;
    }>, import("effect/Schema").Struct<{
        readonly outcome: import("effect/Schema").Literals<readonly ["accepted", "complete"]>;
        readonly operationId: import("effect/Schema").String;
        readonly rosterId: import("effect/Schema").String;
        readonly action: import("effect/Schema").Literals<readonly ["signup", "remove", "sub", "refresh", "publish"]>;
        readonly state: import("effect/Schema").Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
        readonly statusCustomId: import("effect/Schema").String;
    }>]>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly rosterOperationAdvance: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly operationId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly interaction: import("effect/Schema").Struct<{
            readonly rawBody: import("effect/Schema").String;
            readonly signature: import("effect/Schema").String;
            readonly timestamp: import("effect/Schema").String;
        }>;
    }>, import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
        readonly outcome: import("effect/Schema").Literal<"ready">;
        readonly operationId: import("effect/Schema").String;
        readonly rosterId: import("effect/Schema").String;
        readonly action: import("effect/Schema").Literals<readonly ["signup", "remove", "sub", "refresh", "publish"]>;
        readonly expiresAt: import("effect/Schema").String;
        readonly form: import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literal<"account_select">;
            readonly customId: import("effect/Schema").String;
            readonly content: import("effect/Schema").String;
            readonly placeholder: import("effect/Schema").String;
            readonly minValues: import("effect/Schema").Number;
            readonly maxValues: import("effect/Schema").Number;
            readonly options: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly value: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
            }>>;
        }>, import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literal<"string_select">;
            readonly customId: import("effect/Schema").String;
            readonly content: import("effect/Schema").String;
            readonly placeholder: import("effect/Schema").String;
            readonly minValues: import("effect/Schema").Literal<1>;
            readonly maxValues: import("effect/Schema").Literal<1>;
            readonly options: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly value: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
                readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
        }>, import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literal<"modal">;
            readonly customId: import("effect/Schema").String;
            readonly title: import("effect/Schema").String;
            readonly fields: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly customId: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
                readonly required: import("effect/Schema").Boolean;
                readonly style: import("effect/Schema").Literals<readonly ["short", "paragraph"]>;
                readonly maxLength: import("effect/Schema").Number;
            }>>;
        }>, import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literal<"continue">;
            readonly customId: import("effect/Schema").String;
            readonly content: import("effect/Schema").String;
            readonly label: import("effect/Schema").String;
        }>]>;
    }>, import("effect/Schema").Struct<{
        readonly outcome: import("effect/Schema").Literals<readonly ["accepted", "complete"]>;
        readonly operationId: import("effect/Schema").String;
        readonly rosterId: import("effect/Schema").String;
        readonly action: import("effect/Schema").Literals<readonly ["signup", "remove", "sub", "refresh", "publish"]>;
        readonly state: import("effect/Schema").Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
        readonly statusCustomId: import("effect/Schema").String;
    }>]>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly rosterOperationStatus: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly operationId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly interaction: import("effect/Schema").Struct<{
            readonly rawBody: import("effect/Schema").String;
            readonly signature: import("effect/Schema").String;
            readonly timestamp: import("effect/Schema").String;
        }>;
    }>, import("effect/Schema").Struct<{
        readonly operationId: import("effect/Schema").String;
        readonly rosterId: import("effect/Schema").String;
        readonly action: import("effect/Schema").Literals<readonly ["signup", "remove", "sub", "refresh", "publish"]>;
        readonly state: import("effect/Schema").Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
        readonly channelId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly messageId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly failure: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly rosterPublicationPrepare: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly interaction: import("effect/Schema").Struct<{
            readonly rawBody: import("effect/Schema").String;
            readonly signature: import("effect/Schema").String;
            readonly timestamp: import("effect/Schema").String;
        }>;
    }>, import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
        readonly outcome: import("effect/Schema").Literal<"ready">;
        readonly operationId: import("effect/Schema").String;
        readonly rosterId: import("effect/Schema").String;
        readonly action: import("effect/Schema").Literals<readonly ["signup", "remove", "sub", "refresh", "publish"]>;
        readonly expiresAt: import("effect/Schema").String;
        readonly form: import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literal<"account_select">;
            readonly customId: import("effect/Schema").String;
            readonly content: import("effect/Schema").String;
            readonly placeholder: import("effect/Schema").String;
            readonly minValues: import("effect/Schema").Number;
            readonly maxValues: import("effect/Schema").Number;
            readonly options: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly value: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
            }>>;
        }>, import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literal<"string_select">;
            readonly customId: import("effect/Schema").String;
            readonly content: import("effect/Schema").String;
            readonly placeholder: import("effect/Schema").String;
            readonly minValues: import("effect/Schema").Literal<1>;
            readonly maxValues: import("effect/Schema").Literal<1>;
            readonly options: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly value: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
                readonly description: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
        }>, import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literal<"modal">;
            readonly customId: import("effect/Schema").String;
            readonly title: import("effect/Schema").String;
            readonly fields: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly customId: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
                readonly required: import("effect/Schema").Boolean;
                readonly style: import("effect/Schema").Literals<readonly ["short", "paragraph"]>;
                readonly maxLength: import("effect/Schema").Number;
            }>>;
        }>, import("effect/Schema").Struct<{
            readonly kind: import("effect/Schema").Literal<"continue">;
            readonly customId: import("effect/Schema").String;
            readonly content: import("effect/Schema").String;
            readonly label: import("effect/Schema").String;
        }>]>;
    }>, import("effect/Schema").Struct<{
        readonly outcome: import("effect/Schema").Literals<readonly ["accepted", "complete"]>;
        readonly operationId: import("effect/Schema").String;
        readonly rosterId: import("effect/Schema").String;
        readonly action: import("effect/Schema").Literals<readonly ["signup", "remove", "sub", "refresh", "publish"]>;
        readonly state: import("effect/Schema").Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
        readonly statusCustomId: import("effect/Schema").String;
    }>]>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly rosterPublicationStatus: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly operationId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly interaction: import("effect/Schema").Struct<{
            readonly rawBody: import("effect/Schema").String;
            readonly signature: import("effect/Schema").String;
            readonly timestamp: import("effect/Schema").String;
        }>;
    }>, import("effect/Schema").Struct<{
        readonly operationId: import("effect/Schema").String;
        readonly rosterId: import("effect/Schema").String;
        readonly action: import("effect/Schema").Literals<readonly ["signup", "remove", "sub", "refresh", "publish"]>;
        readonly state: import("effect/Schema").Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
        readonly channelId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly messageId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly failure: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, {
        status: number;
        body: import("effect/Schema").Struct<{
            readonly code: import("effect/Schema").Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: import("effect/Schema").String;
            readonly request_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly details: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly field: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>>;
        }>;
    }[]>;
    readonly accounts: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly userId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly user_id: import("effect/Schema").String;
            readonly player_tag: import("effect/Schema").String;
            readonly order_index: import("effect/Schema").Number;
            readonly is_verified: import("effect/Schema").Boolean;
            readonly hidden: import("effect/Schema").Boolean;
            readonly added_at: import("effect/Schema").String;
            readonly verified_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly last_login: import("effect/Schema").NullOr<import("effect/Schema").String>;
        }>>;
    }>, readonly []>;
    readonly addStrike: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly tag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly reason: import("effect/Schema").String;
        readonly added_by: import("effect/Schema").String;
        readonly rollover_days: import("effect/Schema").Number;
        readonly strike_weight: import("effect/Schema").Number;
        readonly image: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly status: import("effect/Schema").String;
        readonly strike_id: import("effect/Schema").String;
        readonly player_tag: import("effect/Schema").String;
        readonly player_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly server_id: import("effect/Schema").String;
        readonly total_strikes: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly total_weight: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, readonly []>;
    readonly base: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly baseId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly id: import("effect/Schema").String;
        readonly serverId: import("effect/Schema").String;
        readonly channelId: import("effect/Schema").String;
        readonly messageId: import("effect/Schema").String;
        readonly baseLink: import("effect/Schema").String;
        readonly images: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly description: import("effect/Schema").String;
        readonly downloadCount: import("effect/Schema").Number;
        readonly upvotes: import("effect/Schema").Number;
        readonly downvotes: import("effect/Schema").Number;
        readonly downloaders: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly createdAt: import("effect/Schema").String;
        readonly discordMessageUrl: import("effect/Schema").String;
    }>, readonly []>;
    readonly bases: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly offset: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly serverId: import("effect/Schema").String;
            readonly channelId: import("effect/Schema").String;
            readonly messageId: import("effect/Schema").String;
            readonly baseLink: import("effect/Schema").String;
            readonly images: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly description: import("effect/Schema").String;
            readonly downloadCount: import("effect/Schema").Number;
            readonly upvotes: import("effect/Schema").Number;
            readonly downvotes: import("effect/Schema").Number;
            readonly downloaders: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly createdAt: import("effect/Schema").String;
            readonly discordMessageUrl: import("effect/Schema").String;
        }>>;
        readonly total: import("effect/Schema").Number;
        readonly limit: import("effect/Schema").Number;
        readonly offset: import("effect/Schema").Number;
    }>, readonly []>;
    readonly bans: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly VillageTag: import("effect/Schema").String;
            readonly VillageName: import("effect/Schema").String;
            readonly DateCreated: import("effect/Schema").String;
            readonly Notes: import("effect/Schema").String;
            readonly server: import("effect/Schema").String;
            readonly added_by: import("effect/Schema").String;
            readonly added_by_username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly added_by_avatar_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly edited_by: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly user: import("effect/Schema").String;
                readonly previous: import("effect/Schema").Struct<{
                    readonly reason: import("effect/Schema").String;
                }>;
            }>>;
            readonly image: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly town_hall: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly clan_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly current_role: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly trophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        }>>;
        readonly count: import("effect/Schema").Number;
    }>, readonly []>;
    readonly clanCached: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").NullOr<import("effect/Schema").Struct<{
        readonly name: import("effect/Schema").String;
        readonly tag: import("effect/Schema").String;
        readonly badgeUrls: import("effect/Schema").Struct<{
            readonly small: import("effect/Schema").String;
            readonly medium: import("effect/Schema").String;
            readonly large: import("effect/Schema").String;
        }>;
        readonly description: import("effect/Schema").String;
        readonly clanLevel: import("effect/Schema").Number;
        readonly clanPoints: import("effect/Schema").Number;
        readonly capitalGoldTotal: import("effect/Schema").Number;
        readonly location: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").Number;
            readonly name: import("effect/Schema").String;
            readonly isCountry: import("effect/Schema").Boolean;
            readonly countryCode: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly localizedName: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
        readonly warLeague: import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").Number;
            readonly name: import("effect/Schema").String;
        }>;
        readonly capitalLeague: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").Number;
            readonly name: import("effect/Schema").String;
        }>>;
        readonly publicWarLog: import("effect/Schema").Boolean;
        readonly warWins: import("effect/Schema").Number;
        readonly warWinStreak: import("effect/Schema").Number;
        readonly memberCount: import("effect/Schema").Number;
        readonly troopsDonated: import("effect/Schema").Number;
        readonly troopsReceived: import("effect/Schema").Number;
        readonly lastActive: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly townHallLevel: import("effect/Schema").Number;
        }>>;
    }>>, readonly []>;
    readonly clanCapitalLeaderboard: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly locationId: import("effect/Schema").Number;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly location_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        readonly kind: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly location_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
            readonly badge_url: import("effect/Schema").String;
            readonly badgeUrls: import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>;
            readonly donations: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly war_wins: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly capital_gold_total: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly war_win_streak: import("effect/Schema").Number;
            readonly rank: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        }>>;
        readonly count: import("effect/Schema").Number;
    }>, readonly []>;
    readonly clanDonationsLeaderboard: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly locationId: import("effect/Schema").Number;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly location_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        readonly kind: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly location_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
            readonly badge_url: import("effect/Schema").String;
            readonly badgeUrls: import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>;
            readonly donations: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly war_wins: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly capital_gold_total: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly war_win_streak: import("effect/Schema").Number;
            readonly rank: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        }>>;
        readonly count: import("effect/Schema").Number;
    }>, readonly []>;
    readonly clanHistory: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly "time[after]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly "time[before]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly type: import("effect/Schema").optionalKey<import("effect/Schema").Literals<readonly ["description", "clanLevel"]>>;
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly time: import("effect/Schema").String;
            readonly type: import("effect/Schema").String;
            readonly previous: import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>;
            readonly current: import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>;
        }>>;
    }>, readonly []>;
    readonly clanJoinLeave: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly "time[after]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly "time[before]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly time: import("effect/Schema").String;
            readonly type: import("effect/Schema").String;
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly townHallLevel: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clan: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly name: import("effect/Schema").String;
                readonly tag: import("effect/Schema").String;
            }>>;
        }>>;
        readonly available: import("effect/Schema").Number;
        readonly uniquePlayers: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, readonly []>;
    readonly clanLegendSummary: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly top: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly seasons: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly season: import("effect/Schema").String;
            readonly after: import("effect/Schema").String;
            readonly before: import("effect/Schema").String;
            readonly playerCount: import("effect/Schema").Number;
        }>>;
        readonly topFinishes: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly season: import("effect/Schema").String;
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly trophies: import("effect/Schema").Number;
            readonly attackWins: import("effect/Schema").Number;
            readonly defenseWins: import("effect/Schema").Number;
            readonly rank: import("effect/Schema").Number;
        }>>;
    }>, readonly []>;
    readonly clanRankings: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly name: import("effect/Schema").NullOr<import("effect/Schema").String>;
        readonly tag: import("effect/Schema").String;
        readonly badge: import("effect/Schema").NullOr<import("effect/Schema").String>;
        readonly homeVillage: import("effect/Schema").Struct<{
            readonly points: import("effect/Schema").Number;
            readonly placements: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly locationId: import("effect/Schema").String;
                readonly rank: import("effect/Schema").Number;
                readonly points: import("effect/Schema").Number;
            }>>;
        }>;
        readonly builderBase: import("effect/Schema").Struct<{
            readonly points: import("effect/Schema").Number;
            readonly placements: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly locationId: import("effect/Schema").String;
                readonly rank: import("effect/Schema").Number;
                readonly points: import("effect/Schema").Number;
            }>>;
        }>;
        readonly clanCapital: import("effect/Schema").Struct<{
            readonly points: import("effect/Schema").Number;
            readonly placements: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly locationId: import("effect/Schema").String;
                readonly rank: import("effect/Schema").Number;
                readonly points: import("effect/Schema").Number;
            }>>;
        }>;
    }>, readonly []>;
    readonly clanRecords: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly clanPoints: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly value: import("effect/Schema").Number;
            readonly time: import("effect/Schema").String;
        }>>;
        readonly warWinStreak: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly value: import("effect/Schema").Number;
            readonly time: import("effect/Schema").String;
        }>>;
    }>, readonly []>;
    readonly clanWarLog: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly "time[after]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly "time[before]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly type: import("effect/Schema").optionalKey<import("effect/Schema").Literals<readonly ["cwl", "random", "friendly"]>>;
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly result: import("effect/Schema").String;
            readonly type: import("effect/Schema").String;
            readonly endTime: import("effect/Schema").String;
            readonly teamSize: import("effect/Schema").Number;
            readonly attacksPerMember: import("effect/Schema").Number;
            readonly clan: import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly badgeUrls: import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").String;
                    readonly medium: import("effect/Schema").String;
                    readonly large: import("effect/Schema").String;
                }>;
                readonly clanLevel: import("effect/Schema").Number;
                readonly attacks: import("effect/Schema").Number;
                readonly stars: import("effect/Schema").Number;
                readonly destructionPercentage: import("effect/Schema").Number;
            }>;
            readonly opponent: import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly badgeUrls: import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").String;
                    readonly medium: import("effect/Schema").String;
                    readonly large: import("effect/Schema").String;
                }>;
                readonly clanLevel: import("effect/Schema").Number;
                readonly attacks: import("effect/Schema").Number;
                readonly stars: import("effect/Schema").Number;
                readonly destructionPercentage: import("effect/Schema").Number;
            }>;
        }>>;
    }>, readonly []>;
    readonly clanWars: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly "time[after]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly "time[before]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly type: import("effect/Schema").optionalKey<import("effect/Schema").Literals<readonly ["cwl", "random", "friendly"]>>;
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly state: import("effect/Schema").String;
            readonly teamSize: import("effect/Schema").Number;
            readonly attacksPerMember: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly battleModifier: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly preparationStartTime: import("effect/Schema").String;
            readonly startTime: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly endTime: import("effect/Schema").String;
            readonly clan: import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly badgeUrls: import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").String;
                    readonly medium: import("effect/Schema").String;
                    readonly large: import("effect/Schema").String;
                }>;
                readonly clanLevel: import("effect/Schema").Number;
                readonly attacks: import("effect/Schema").Number;
                readonly stars: import("effect/Schema").Number;
                readonly destructionPercentage: import("effect/Schema").Number;
                readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly tag: import("effect/Schema").String;
                    readonly name: import("effect/Schema").String;
                    readonly townhallLevel: import("effect/Schema").Number;
                    readonly mapPosition: import("effect/Schema").Number;
                    readonly attacks: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                        readonly attackerTag: import("effect/Schema").String;
                        readonly defenderTag: import("effect/Schema").String;
                        readonly stars: import("effect/Schema").Number;
                        readonly destructionPercentage: import("effect/Schema").Number;
                        readonly order: import("effect/Schema").Number;
                        readonly duration: import("effect/Schema").Number;
                    }>>>;
                    readonly opponentAttacks: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                    readonly bestOpponentAttack: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                        readonly attackerTag: import("effect/Schema").String;
                        readonly defenderTag: import("effect/Schema").String;
                        readonly stars: import("effect/Schema").Number;
                        readonly destructionPercentage: import("effect/Schema").Number;
                        readonly order: import("effect/Schema").Number;
                        readonly duration: import("effect/Schema").Number;
                    }>>;
                }>>;
            }>;
            readonly opponent: import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly badgeUrls: import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").String;
                    readonly medium: import("effect/Schema").String;
                    readonly large: import("effect/Schema").String;
                }>;
                readonly clanLevel: import("effect/Schema").Number;
                readonly attacks: import("effect/Schema").Number;
                readonly stars: import("effect/Schema").Number;
                readonly destructionPercentage: import("effect/Schema").Number;
                readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly tag: import("effect/Schema").String;
                    readonly name: import("effect/Schema").String;
                    readonly townhallLevel: import("effect/Schema").Number;
                    readonly mapPosition: import("effect/Schema").Number;
                    readonly attacks: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                        readonly attackerTag: import("effect/Schema").String;
                        readonly defenderTag: import("effect/Schema").String;
                        readonly stars: import("effect/Schema").Number;
                        readonly destructionPercentage: import("effect/Schema").Number;
                        readonly order: import("effect/Schema").Number;
                        readonly duration: import("effect/Schema").Number;
                    }>>>;
                    readonly opponentAttacks: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                    readonly bestOpponentAttack: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                        readonly attackerTag: import("effect/Schema").String;
                        readonly defenderTag: import("effect/Schema").String;
                        readonly stars: import("effect/Schema").Number;
                        readonly destructionPercentage: import("effect/Schema").Number;
                        readonly order: import("effect/Schema").Number;
                        readonly duration: import("effect/Schema").Number;
                    }>>;
                }>>;
            }>;
            readonly warStartTime: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
    }>, readonly []>;
    readonly clanWarWinsLeaderboard: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly locationId: import("effect/Schema").Number;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly location_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        readonly kind: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly location_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
            readonly badge_url: import("effect/Schema").String;
            readonly badgeUrls: import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>;
            readonly donations: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly war_wins: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly capital_gold_total: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly war_win_streak: import("effect/Schema").Number;
            readonly rank: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        }>>;
        readonly count: import("effect/Schema").Number;
    }>, readonly []>;
    readonly clanWinStreakLeaderboard: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly location_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        readonly kind: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly location_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
            readonly badge_url: import("effect/Schema").String;
            readonly badgeUrls: import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>;
            readonly donations: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly war_wins: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly capital_gold_total: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly war_win_streak: import("effect/Schema").Number;
            readonly rank: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        }>>;
        readonly count: import("effect/Schema").Number;
    }>, readonly []>;
    readonly counts: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly players_in_war: import("effect/Schema").Number;
        readonly clans_in_war: import("effect/Schema").Number;
        readonly total_join_leaves: import("effect/Schema").Number;
        readonly players_in_legends: import("effect/Schema").Number;
        readonly player_count: import("effect/Schema").Number;
        readonly clan_count: import("effect/Schema").Number;
        readonly wars_stored: import("effect/Schema").Number;
    }>, readonly []>;
    readonly currentWar: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly clan: import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly publicWarLog: import("effect/Schema").NullOr<import("effect/Schema").Boolean>;
        }>;
        readonly opponent: import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly publicWarLog: import("effect/Schema").NullOr<import("effect/Schema").Boolean>;
        }>;
        readonly preparationStartTime: import("effect/Schema").String;
        readonly endTime: import("effect/Schema").String;
        readonly type: import("effect/Schema").String;
        readonly warTag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, readonly []>;
    readonly cwlGroup: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly season: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly state: import("effect/Schema").String;
        readonly season: import("effect/Schema").String;
        readonly warLeague: import("effect/Schema").NullOr<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").Number;
            readonly name: import("effect/Schema").String;
        }>>;
        readonly clans: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly clanLevel: import("effect/Schema").Number;
            readonly badgeUrls: import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>;
            readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly townHallLevel: import("effect/Schema").Number;
            }>>;
        }>>;
        readonly rounds: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly warTags: import("effect/Schema").$Array<import("effect/Schema").Union<readonly [import("effect/Schema").Struct<{
                readonly state: import("effect/Schema").String;
                readonly teamSize: import("effect/Schema").Number;
                readonly attacksPerMember: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly battleModifier: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly preparationStartTime: import("effect/Schema").String;
                readonly startTime: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly endTime: import("effect/Schema").String;
                readonly clan: import("effect/Schema").Struct<{
                    readonly tag: import("effect/Schema").String;
                    readonly name: import("effect/Schema").String;
                    readonly badgeUrls: import("effect/Schema").Struct<{
                        readonly small: import("effect/Schema").String;
                        readonly medium: import("effect/Schema").String;
                        readonly large: import("effect/Schema").String;
                    }>;
                    readonly clanLevel: import("effect/Schema").Number;
                    readonly attacks: import("effect/Schema").Number;
                    readonly stars: import("effect/Schema").Number;
                    readonly destructionPercentage: import("effect/Schema").Number;
                    readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                        readonly tag: import("effect/Schema").String;
                        readonly name: import("effect/Schema").String;
                        readonly townhallLevel: import("effect/Schema").Number;
                        readonly mapPosition: import("effect/Schema").Number;
                        readonly attacks: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                            readonly attackerTag: import("effect/Schema").String;
                            readonly defenderTag: import("effect/Schema").String;
                            readonly stars: import("effect/Schema").Number;
                            readonly destructionPercentage: import("effect/Schema").Number;
                            readonly order: import("effect/Schema").Number;
                            readonly duration: import("effect/Schema").Number;
                        }>>>;
                        readonly opponentAttacks: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                        readonly bestOpponentAttack: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                            readonly attackerTag: import("effect/Schema").String;
                            readonly defenderTag: import("effect/Schema").String;
                            readonly stars: import("effect/Schema").Number;
                            readonly destructionPercentage: import("effect/Schema").Number;
                            readonly order: import("effect/Schema").Number;
                            readonly duration: import("effect/Schema").Number;
                        }>>;
                    }>>;
                }>;
                readonly opponent: import("effect/Schema").Struct<{
                    readonly tag: import("effect/Schema").String;
                    readonly name: import("effect/Schema").String;
                    readonly badgeUrls: import("effect/Schema").Struct<{
                        readonly small: import("effect/Schema").String;
                        readonly medium: import("effect/Schema").String;
                        readonly large: import("effect/Schema").String;
                    }>;
                    readonly clanLevel: import("effect/Schema").Number;
                    readonly attacks: import("effect/Schema").Number;
                    readonly stars: import("effect/Schema").Number;
                    readonly destructionPercentage: import("effect/Schema").Number;
                    readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                        readonly tag: import("effect/Schema").String;
                        readonly name: import("effect/Schema").String;
                        readonly townhallLevel: import("effect/Schema").Number;
                        readonly mapPosition: import("effect/Schema").Number;
                        readonly attacks: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                            readonly attackerTag: import("effect/Schema").String;
                            readonly defenderTag: import("effect/Schema").String;
                            readonly stars: import("effect/Schema").Number;
                            readonly destructionPercentage: import("effect/Schema").Number;
                            readonly order: import("effect/Schema").Number;
                            readonly duration: import("effect/Schema").Number;
                        }>>>;
                        readonly opponentAttacks: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                        readonly bestOpponentAttack: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                            readonly attackerTag: import("effect/Schema").String;
                            readonly defenderTag: import("effect/Schema").String;
                            readonly stars: import("effect/Schema").Number;
                            readonly destructionPercentage: import("effect/Schema").Number;
                            readonly order: import("effect/Schema").Number;
                            readonly duration: import("effect/Schema").Number;
                        }>>;
                    }>>;
                }>;
                readonly warStartTime: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly season: import("effect/Schema").String;
            }>, import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
            }>]>>;
        }>>;
    }>, readonly []>;
    readonly cwlLeaderboard: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly leagueId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly season: import("effect/Schema").String;
        readonly team_size: import("effect/Schema").Number;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly season: import("effect/Schema").String;
        readonly cwlLeagueId: import("effect/Schema").Number;
        readonly warSize: import("effect/Schema").Number;
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly clanTag: import("effect/Schema").String;
            readonly season: import("effect/Schema").String;
            readonly cwlLeagueId: import("effect/Schema").Number;
            readonly warSize: import("effect/Schema").Number;
            readonly stars: import("effect/Schema").Number;
            readonly destruction: import("effect/Schema").Number;
            readonly wins: import("effect/Schema").Number;
            readonly losses: import("effect/Schema").Number;
            readonly ties: import("effect/Schema").Number;
            readonly warsFinished: import("effect/Schema").Number;
            readonly totalClansInGroup: import("effect/Schema").Number;
            readonly groupRank: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly globalRank: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly updatedAt: import("effect/Schema").String;
        }>>;
    }>, readonly []>;
    readonly cwlRankingHistory: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly clanTag: import("effect/Schema").String;
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly season: import("effect/Schema").String;
            readonly cwlLeagueId: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly state: import("effect/Schema").String;
            readonly warSize: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly rounds: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly warTags: import("effect/Schema").$Array<import("effect/Schema").String>;
            }>>;
            readonly clan: import("effect/Schema").Struct<{
                readonly clanTag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly clanLevel: import("effect/Schema").Number;
                readonly badgeToken: import("effect/Schema").String;
                readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly tag: import("effect/Schema").String;
                    readonly name: import("effect/Schema").String;
                    readonly townHallLevel: import("effect/Schema").Number;
                }>>;
            }>;
            readonly standing: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly clanTag: import("effect/Schema").String;
                readonly season: import("effect/Schema").String;
                readonly cwlLeagueId: import("effect/Schema").Number;
                readonly warSize: import("effect/Schema").Number;
                readonly stars: import("effect/Schema").Number;
                readonly destruction: import("effect/Schema").Number;
                readonly wins: import("effect/Schema").Number;
                readonly losses: import("effect/Schema").Number;
                readonly ties: import("effect/Schema").Number;
                readonly warsFinished: import("effect/Schema").Number;
                readonly totalClansInGroup: import("effect/Schema").Number;
                readonly groupRank: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly globalRank: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly updatedAt: import("effect/Schema").String;
            }>>;
        }>>;
    }>, readonly []>;
    readonly cwlSeasons: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly season: import("effect/Schema").String;
            readonly state: import("effect/Schema").String;
            readonly warSize: import("effect/Schema").NullOr<import("effect/Schema").Number>;
            readonly warLeague: import("effect/Schema").NullOr<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
            }>>;
            readonly rank: import("effect/Schema").NullOr<import("effect/Schema").Number>;
            readonly stars: import("effect/Schema").NullOr<import("effect/Schema").Number>;
            readonly destruction: import("effect/Schema").NullOr<import("effect/Schema").Number>;
            readonly rounds: import("effect/Schema").NullOr<import("effect/Schema").Struct<{
                readonly won: import("effect/Schema").Number;
                readonly tied: import("effect/Schema").Number;
                readonly lost: import("effect/Schema").Number;
            }>>;
        }>>;
    }>, readonly []>;
    readonly dashboardCapabilities: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
        readonly full_access: import("effect/Schema").Boolean;
        readonly sections: import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").String>;
    }>, readonly []>;
    readonly deleteBan: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly tag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly status: import("effect/Schema").String;
        readonly player_tag: import("effect/Schema").String;
        readonly player_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly server_id: import("effect/Schema").String;
    }>, readonly []>;
    readonly deleteStrike: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly strikeId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly status: import("effect/Schema").String;
        readonly strike_id: import("effect/Schema").String;
        readonly player_tag: import("effect/Schema").String;
        readonly player_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly server_id: import("effect/Schema").String;
        readonly total_strikes: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly total_weight: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, readonly []>;
    readonly embeds: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly name: import("effect/Schema").String;
            readonly data: import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>;
        }>>;
        readonly total: import("effect/Schema").Number;
    }>, readonly []>;
    readonly giveaway: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly giveawayId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly id: import("effect/Schema").String;
        readonly serverId: import("effect/Schema").String;
        readonly prize: import("effect/Schema").String;
        readonly channelId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly status: import("effect/Schema").String;
        readonly start: import("effect/Schema").String;
        readonly end: import("effect/Schema").String;
        readonly winners: import("effect/Schema").Number;
        readonly mentions: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly textAboveEmbed: import("effect/Schema").String;
        readonly textInEmbed: import("effect/Schema").String;
        readonly textOnEnd: import("effect/Schema").String;
        readonly imageUrl: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly profilePictureRequired: import("effect/Schema").Boolean;
        readonly cocAccountRequired: import("effect/Schema").Boolean;
        readonly rolesMode: import("effect/Schema").String;
        readonly roles: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly boosters: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly value: import("effect/Schema").Number;
            readonly roles: import("effect/Schema").$Array<import("effect/Schema").String>;
        }>>;
        readonly entries: import("effect/Schema").$Array<import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>;
        readonly winnersList: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly userId: import("effect/Schema").String;
            readonly username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly avatarUrl: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly inServer: import("effect/Schema").Boolean;
            readonly status: import("effect/Schema").String;
            readonly timestamp: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly reason: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
        readonly updated: import("effect/Schema").Boolean;
        readonly messageId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly eventPending: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly eventPendingAt: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly createdAt: import("effect/Schema").String;
        readonly updatedAt: import("effect/Schema").String;
    }>, readonly []>;
    readonly giveaways: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly ongoing: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly serverId: import("effect/Schema").String;
            readonly prize: import("effect/Schema").String;
            readonly channelId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly status: import("effect/Schema").String;
            readonly start: import("effect/Schema").String;
            readonly end: import("effect/Schema").String;
            readonly winners: import("effect/Schema").Number;
            readonly mentions: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly textAboveEmbed: import("effect/Schema").String;
            readonly textInEmbed: import("effect/Schema").String;
            readonly textOnEnd: import("effect/Schema").String;
            readonly imageUrl: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly profilePictureRequired: import("effect/Schema").Boolean;
            readonly cocAccountRequired: import("effect/Schema").Boolean;
            readonly rolesMode: import("effect/Schema").String;
            readonly roles: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly boosters: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly value: import("effect/Schema").Number;
                readonly roles: import("effect/Schema").$Array<import("effect/Schema").String>;
            }>>;
            readonly entries: import("effect/Schema").$Array<import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>;
            readonly winnersList: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly userId: import("effect/Schema").String;
                readonly username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly avatarUrl: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly inServer: import("effect/Schema").Boolean;
                readonly status: import("effect/Schema").String;
                readonly timestamp: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly reason: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
            readonly updated: import("effect/Schema").Boolean;
            readonly messageId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly eventPending: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly eventPendingAt: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly createdAt: import("effect/Schema").String;
            readonly updatedAt: import("effect/Schema").String;
        }>>;
        readonly upcoming: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly serverId: import("effect/Schema").String;
            readonly prize: import("effect/Schema").String;
            readonly channelId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly status: import("effect/Schema").String;
            readonly start: import("effect/Schema").String;
            readonly end: import("effect/Schema").String;
            readonly winners: import("effect/Schema").Number;
            readonly mentions: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly textAboveEmbed: import("effect/Schema").String;
            readonly textInEmbed: import("effect/Schema").String;
            readonly textOnEnd: import("effect/Schema").String;
            readonly imageUrl: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly profilePictureRequired: import("effect/Schema").Boolean;
            readonly cocAccountRequired: import("effect/Schema").Boolean;
            readonly rolesMode: import("effect/Schema").String;
            readonly roles: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly boosters: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly value: import("effect/Schema").Number;
                readonly roles: import("effect/Schema").$Array<import("effect/Schema").String>;
            }>>;
            readonly entries: import("effect/Schema").$Array<import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>;
            readonly winnersList: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly userId: import("effect/Schema").String;
                readonly username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly avatarUrl: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly inServer: import("effect/Schema").Boolean;
                readonly status: import("effect/Schema").String;
                readonly timestamp: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly reason: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
            readonly updated: import("effect/Schema").Boolean;
            readonly messageId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly eventPending: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly eventPendingAt: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly createdAt: import("effect/Schema").String;
            readonly updatedAt: import("effect/Schema").String;
        }>>;
        readonly ended: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly serverId: import("effect/Schema").String;
            readonly prize: import("effect/Schema").String;
            readonly channelId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly status: import("effect/Schema").String;
            readonly start: import("effect/Schema").String;
            readonly end: import("effect/Schema").String;
            readonly winners: import("effect/Schema").Number;
            readonly mentions: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly textAboveEmbed: import("effect/Schema").String;
            readonly textInEmbed: import("effect/Schema").String;
            readonly textOnEnd: import("effect/Schema").String;
            readonly imageUrl: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly profilePictureRequired: import("effect/Schema").Boolean;
            readonly cocAccountRequired: import("effect/Schema").Boolean;
            readonly rolesMode: import("effect/Schema").String;
            readonly roles: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly boosters: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly value: import("effect/Schema").Number;
                readonly roles: import("effect/Schema").$Array<import("effect/Schema").String>;
            }>>;
            readonly entries: import("effect/Schema").$Array<import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>;
            readonly winnersList: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly userId: import("effect/Schema").String;
                readonly username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly avatarUrl: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly inServer: import("effect/Schema").Boolean;
                readonly status: import("effect/Schema").String;
                readonly timestamp: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly reason: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
            readonly updated: import("effect/Schema").Boolean;
            readonly messageId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly eventPending: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly eventPendingAt: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly createdAt: import("effect/Schema").String;
            readonly updatedAt: import("effect/Schema").String;
        }>>;
        readonly total: import("effect/Schema").Number;
    }>, readonly []>;
    readonly leagueLeaderboard: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly leagueId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly league_tier_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        readonly townhall_level: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly rank: import("effect/Schema").Number;
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly league_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
            readonly league: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly badge: import("effect/Schema").String;
            }>>;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly clan: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                readonly badge: import("effect/Schema").String;
            }>>;
            readonly townhall_level: import("effect/Schema").Number;
            readonly trophies: import("effect/Schema").Number;
            readonly country_code: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly country_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
        readonly count: import("effect/Schema").Number;
        readonly generated_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, readonly []>;
    readonly legendSeason: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly season: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly season: import("effect/Schema").String;
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly expLevel: import("effect/Schema").Number;
            readonly trophies: import("effect/Schema").Number;
            readonly attackWins: import("effect/Schema").Number;
            readonly defenseWins: import("effect/Schema").Number;
            readonly rank: import("effect/Schema").Number;
            readonly clan: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly badgeUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
            }>>;
            readonly leagueTier: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
            }>>;
        }>>;
    }>, readonly []>;
    readonly linkAccount: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly userId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly player_tag: import("effect/Schema").String;
        readonly api_token: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly account: import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly townHallLevel: import("effect/Schema").Number;
            readonly is_verified: import("effect/Schema").Boolean;
            readonly hidden: import("effect/Schema").Boolean;
        }>;
    }>, readonly []>;
    readonly playerCwlHistory: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly season: import("effect/Schema").String;
            readonly townHallLevel: import("effect/Schema").Number;
            readonly teamSize: import("effect/Schema").NullOr<import("effect/Schema").Number>;
            readonly clan: import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly badgeUrls: import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").String;
                    readonly medium: import("effect/Schema").String;
                    readonly large: import("effect/Schema").String;
                }>;
                readonly warLeague: import("effect/Schema").NullOr<import("effect/Schema").Struct<{
                    readonly id: import("effect/Schema").Number;
                    readonly name: import("effect/Schema").String;
                }>>;
                readonly wars: import("effect/Schema").NullOr<import("effect/Schema").Struct<{
                    readonly won: import("effect/Schema").Number;
                    readonly lost: import("effect/Schema").Number;
                    readonly tied: import("effect/Schema").Number;
                }>>;
                readonly totalStars: import("effect/Schema").NullOr<import("effect/Schema").Number>;
                readonly placement: import("effect/Schema").NullOr<import("effect/Schema").Struct<{
                    readonly group: import("effect/Schema").NullOr<import("effect/Schema").Number>;
                    readonly global: import("effect/Schema").NullOr<import("effect/Schema").Number>;
                }>>;
            }>;
            readonly attacks: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly warTag: import("effect/Schema").String;
                readonly round: import("effect/Schema").Number;
                readonly opponent: import("effect/Schema").Struct<{
                    readonly tag: import("effect/Schema").String;
                    readonly name: import("effect/Schema").String;
                }>;
                readonly defender: import("effect/Schema").Struct<{
                    readonly tag: import("effect/Schema").String;
                    readonly name: import("effect/Schema").String;
                    readonly townHallLevel: import("effect/Schema").Number;
                    readonly mapPosition: import("effect/Schema").Number;
                }>;
                readonly stars: import("effect/Schema").Number;
                readonly destructionPercentage: import("effect/Schema").Number;
                readonly order: import("effect/Schema").Number;
                readonly duration: import("effect/Schema").Number;
            }>>;
            readonly placement: import("effect/Schema").NullOr<import("effect/Schema").Struct<{
                readonly clan: import("effect/Schema").Number;
                readonly group: import("effect/Schema").Number;
            }>>;
            readonly missedAttacks: import("effect/Schema").Number;
        }>>;
    }>, readonly []>;
    readonly playerHistory: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly "time[after]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly "time[before]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly type: import("effect/Schema").Literals<readonly ["troop_level", "super_troop_boost", "hero_level", "spell_level", "pet_level", "equipment_level", "townhall_level", "best_trophies", "best_builder_base_trophies", "exp_level", "war_preference", "name"]>;
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly time: import("effect/Schema").String;
            readonly townhall_level: import("effect/Schema").NullOr<import("effect/Schema").Number>;
            readonly type: import("effect/Schema").String;
            readonly item: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly name: import("effect/Schema").String;
                readonly id: import("effect/Schema").Number;
            }>>;
            readonly previous: import("effect/Schema").optionalKey<import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>;
            readonly current: import("effect/Schema").optionalKey<import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>>;
        }>>;
    }>, readonly []>;
    readonly playerLegendHistory: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly season: import("effect/Schema").String;
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly expLevel: import("effect/Schema").Number;
            readonly trophies: import("effect/Schema").Number;
            readonly attackWins: import("effect/Schema").Number;
            readonly defenseWins: import("effect/Schema").Number;
            readonly rank: import("effect/Schema").Number;
            readonly clan: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly badgeUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
            }>>;
            readonly leagueTier: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>>;
            }>>;
        }>>;
    }>, readonly []>;
    readonly playerRankings: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
        readonly homeVillage: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly trophies: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
            readonly globalRank: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
            readonly localRank: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        }>>;
        readonly builderBase: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly trophies: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
            readonly globalRank: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
            readonly localRank: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        }>>;
        readonly location: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").Number;
            readonly isCountry: import("effect/Schema").Boolean;
            readonly countryCode: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly localizedName: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
    }>, readonly []>;
    readonly playerTimers: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly type: import("effect/Schema").Literals<readonly ["war", "cwl", "capital"]>;
            readonly expiresAt: import("effect/Schema").String;
            readonly warTag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly clans: import("effect/Schema").$Array<import("effect/Schema").String>;
        }>>;
    }>, readonly []>;
    readonly playerWarAttacks: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly "time[after]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly "time[before]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly type: import("effect/Schema").optionalKey<import("effect/Schema").Literals<readonly ["cwl", "random", "friendly"]>>;
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly war_id: import("effect/Schema").String;
            readonly warEndTime: import("effect/Schema").String;
            readonly warType: import("effect/Schema").String;
            readonly warSize: import("effect/Schema").Number;
            readonly attackingClanTag: import("effect/Schema").String;
            readonly defendingClanTag: import("effect/Schema").String;
            readonly attackerTag: import("effect/Schema").String;
            readonly attackerName: import("effect/Schema").String;
            readonly defenderTag: import("effect/Schema").String;
            readonly defenderName: import("effect/Schema").String;
            readonly attackerTownhall: import("effect/Schema").Number;
            readonly defenderTownhall: import("effect/Schema").Number;
            readonly attackerMapPosition: import("effect/Schema").Number;
            readonly defenderMapPosition: import("effect/Schema").Number;
            readonly stars: import("effect/Schema").Number;
            readonly destructionPercentage: import("effect/Schema").Number;
            readonly duration: import("effect/Schema").Number;
            readonly attackOrder: import("effect/Schema").Number;
            readonly battleModifier: import("effect/Schema").String;
            readonly side: import("effect/Schema").String;
        }>>;
    }>, readonly []>;
    readonly playerWarStats: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly "time[after]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly "time[before]": import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly type: import("effect/Schema").optionalKey<import("effect/Schema").Literals<readonly ["cwl", "random", "friendly"]>>;
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly teamSize: import("effect/Schema").Number;
            readonly attacksPerMember: import("effect/Schema").Number;
            readonly preparationStartTime: import("effect/Schema").String;
            readonly startTime: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly endTime: import("effect/Schema").String;
            readonly clan: import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly badgeUrls: import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>;
                readonly clanLevel: import("effect/Schema").Number;
                readonly attacks: import("effect/Schema").Number;
                readonly stars: import("effect/Schema").Number;
                readonly destructionPercentage: import("effect/Schema").Number;
            }>;
            readonly opponent: import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly badgeUrls: import("effect/Schema").Struct<{
                    readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                }>;
                readonly clanLevel: import("effect/Schema").Number;
                readonly attacks: import("effect/Schema").Number;
                readonly stars: import("effect/Schema").Number;
                readonly destructionPercentage: import("effect/Schema").Number;
            }>;
            readonly type: import("effect/Schema").String;
            readonly player: import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly townhallLevel: import("effect/Schema").Number;
                readonly mapPosition: import("effect/Schema").Number;
            }>;
            readonly attacks: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly stars: import("effect/Schema").Number;
                readonly destructionPercentage: import("effect/Schema").Number;
                readonly order: import("effect/Schema").Number;
                readonly duration: import("effect/Schema").Number;
                readonly fresh: import("effect/Schema").Boolean;
                readonly player: import("effect/Schema").Struct<{
                    readonly tag: import("effect/Schema").String;
                    readonly name: import("effect/Schema").String;
                    readonly townhallLevel: import("effect/Schema").Number;
                    readonly mapPosition: import("effect/Schema").Number;
                }>;
            }>>;
            readonly defenses: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly stars: import("effect/Schema").Number;
                readonly destructionPercentage: import("effect/Schema").Number;
                readonly order: import("effect/Schema").Number;
                readonly duration: import("effect/Schema").Number;
                readonly fresh: import("effect/Schema").Boolean;
                readonly player: import("effect/Schema").Struct<{
                    readonly tag: import("effect/Schema").String;
                    readonly name: import("effect/Schema").String;
                    readonly townhallLevel: import("effect/Schema").Number;
                    readonly mapPosition: import("effect/Schema").Number;
                }>;
            }>>;
        }>>;
    }>, readonly []>;
    readonly previousWar: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
        readonly endTime: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly state: import("effect/Schema").String;
        readonly teamSize: import("effect/Schema").Number;
        readonly attacksPerMember: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly battleModifier: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly preparationStartTime: import("effect/Schema").String;
        readonly startTime: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly endTime: import("effect/Schema").String;
        readonly clan: import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly badgeUrls: import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").String;
                readonly medium: import("effect/Schema").String;
                readonly large: import("effect/Schema").String;
            }>;
            readonly clanLevel: import("effect/Schema").Number;
            readonly attacks: import("effect/Schema").Number;
            readonly stars: import("effect/Schema").Number;
            readonly destructionPercentage: import("effect/Schema").Number;
            readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly townhallLevel: import("effect/Schema").Number;
                readonly mapPosition: import("effect/Schema").Number;
                readonly attacks: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly attackerTag: import("effect/Schema").String;
                    readonly defenderTag: import("effect/Schema").String;
                    readonly stars: import("effect/Schema").Number;
                    readonly destructionPercentage: import("effect/Schema").Number;
                    readonly order: import("effect/Schema").Number;
                    readonly duration: import("effect/Schema").Number;
                }>>>;
                readonly opponentAttacks: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly bestOpponentAttack: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly attackerTag: import("effect/Schema").String;
                    readonly defenderTag: import("effect/Schema").String;
                    readonly stars: import("effect/Schema").Number;
                    readonly destructionPercentage: import("effect/Schema").Number;
                    readonly order: import("effect/Schema").Number;
                    readonly duration: import("effect/Schema").Number;
                }>>;
            }>>;
        }>;
        readonly opponent: import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly badgeUrls: import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").String;
                readonly medium: import("effect/Schema").String;
                readonly large: import("effect/Schema").String;
            }>;
            readonly clanLevel: import("effect/Schema").Number;
            readonly attacks: import("effect/Schema").Number;
            readonly stars: import("effect/Schema").Number;
            readonly destructionPercentage: import("effect/Schema").Number;
            readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly townhallLevel: import("effect/Schema").Number;
                readonly mapPosition: import("effect/Schema").Number;
                readonly attacks: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly attackerTag: import("effect/Schema").String;
                    readonly defenderTag: import("effect/Schema").String;
                    readonly stars: import("effect/Schema").Number;
                    readonly destructionPercentage: import("effect/Schema").Number;
                    readonly order: import("effect/Schema").Number;
                    readonly duration: import("effect/Schema").Number;
                }>>>;
                readonly opponentAttacks: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly bestOpponentAttack: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly attackerTag: import("effect/Schema").String;
                    readonly defenderTag: import("effect/Schema").String;
                    readonly stars: import("effect/Schema").Number;
                    readonly destructionPercentage: import("effect/Schema").Number;
                    readonly order: import("effect/Schema").Number;
                    readonly duration: import("effect/Schema").Number;
                }>>;
            }>>;
        }>;
        readonly warStartTime: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, readonly []>;
    readonly proxyCapitalRaidSeasons: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly clanTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly state: import("effect/Schema").String;
            readonly startTime: import("effect/Schema").String;
            readonly endTime: import("effect/Schema").String;
            readonly capitalTotalLoot: import("effect/Schema").Number;
            readonly raidsCompleted: import("effect/Schema").Number;
            readonly totalAttacks: import("effect/Schema").Number;
            readonly enemyDistrictsDestroyed: import("effect/Schema").Number;
            readonly offensiveReward: import("effect/Schema").Number;
            readonly defensiveReward: import("effect/Schema").Number;
            readonly members: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly attacks: import("effect/Schema").Number;
                readonly attackLimit: import("effect/Schema").Number;
                readonly bonusAttackLimit: import("effect/Schema").Number;
                readonly capitalResourcesLooted: import("effect/Schema").Number;
            }>>>;
            readonly attackLog: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly defender: import("effect/Schema").Struct<{
                    readonly tag: import("effect/Schema").String;
                    readonly name: import("effect/Schema").String;
                    readonly level: import("effect/Schema").Number;
                    readonly badgeUrls: import("effect/Schema").Struct<{
                        readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                        readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                        readonly large: import("effect/Schema").String;
                    }>;
                }>;
                readonly attackCount: import("effect/Schema").Number;
                readonly districtCount: import("effect/Schema").Number;
                readonly districtsDestroyed: import("effect/Schema").Number;
                readonly districts: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly id: import("effect/Schema").Number;
                    readonly name: import("effect/Schema").String;
                    readonly districtHallLevel: import("effect/Schema").Number;
                    readonly destructionPercent: import("effect/Schema").Number;
                    readonly stars: import("effect/Schema").Number;
                    readonly attackCount: import("effect/Schema").Number;
                    readonly totalLooted: import("effect/Schema").Number;
                    readonly attacks: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                        readonly attacker: import("effect/Schema").Struct<{
                            readonly tag: import("effect/Schema").String;
                            readonly name: import("effect/Schema").String;
                        }>;
                        readonly destructionPercent: import("effect/Schema").Number;
                        readonly stars: import("effect/Schema").Number;
                    }>>>;
                }>>;
            }>>;
            readonly defenseLog: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly attackCount: import("effect/Schema").Number;
                readonly districtCount: import("effect/Schema").Number;
                readonly districtsDestroyed: import("effect/Schema").Number;
                readonly districts: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly id: import("effect/Schema").Number;
                    readonly name: import("effect/Schema").String;
                    readonly districtHallLevel: import("effect/Schema").Number;
                    readonly destructionPercent: import("effect/Schema").Number;
                    readonly stars: import("effect/Schema").Number;
                    readonly attackCount: import("effect/Schema").Number;
                    readonly totalLooted: import("effect/Schema").Number;
                    readonly attacks: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                        readonly attacker: import("effect/Schema").Struct<{
                            readonly tag: import("effect/Schema").String;
                            readonly name: import("effect/Schema").String;
                        }>;
                        readonly destructionPercent: import("effect/Schema").Number;
                        readonly stars: import("effect/Schema").Number;
                    }>>>;
                }>>;
                readonly attacker: import("effect/Schema").Struct<{
                    readonly tag: import("effect/Schema").String;
                    readonly name: import("effect/Schema").String;
                    readonly level: import("effect/Schema").Number;
                    readonly badgeUrls: import("effect/Schema").Struct<{
                        readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                        readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                        readonly large: import("effect/Schema").String;
                    }>;
                }>;
            }>>;
        }>>;
        readonly paging: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly cursors: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly after: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly before: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
        }>>;
    }>, readonly [{
        readonly status: 400;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 403;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 429;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }]>;
    readonly proxyPlayer: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly playerTag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
        readonly name: import("effect/Schema").String;
        readonly townHallLevel: import("effect/Schema").Number;
        readonly townHallWeaponLevel: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly expLevel: import("effect/Schema").Number;
        readonly trophies: import("effect/Schema").Number;
        readonly bestTrophies: import("effect/Schema").Number;
        readonly warStars: import("effect/Schema").Number;
        readonly attackWins: import("effect/Schema").Number;
        readonly defenseWins: import("effect/Schema").Number;
        readonly builderHallLevel: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly builderBaseTrophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly bestBuilderBaseTrophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly builderBaseLeague: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").Number;
            readonly name: import("effect/Schema").String;
            readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
        }>>;
        readonly clan: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly clanLevel: import("effect/Schema").Number;
            readonly badgeUrls: import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").String;
            }>;
        }>>;
        readonly role: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly warPreference: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly donations: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly donationsReceived: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly clanCapitalContributions: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly league: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").Number;
            readonly name: import("effect/Schema").String;
            readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
        }>>;
        readonly leagueTier: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").Number;
            readonly name: import("effect/Schema").String;
            readonly iconUrls: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly small: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly medium: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly tiny: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly large: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
        }>>;
        readonly achievements: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly name: import("effect/Schema").String;
            readonly stars: import("effect/Schema").Number;
            readonly value: import("effect/Schema").Number;
            readonly target: import("effect/Schema").Number;
            readonly info: import("effect/Schema").String;
            readonly completionInfo: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly village: import("effect/Schema").String;
        }>>;
        readonly heroes: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly name: import("effect/Schema").String;
            readonly level: import("effect/Schema").Number;
            readonly maxLevel: import("effect/Schema").Number;
            readonly village: import("effect/Schema").String;
            readonly superTroopIsActive: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
            readonly equipment: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly name: import("effect/Schema").String;
                readonly level: import("effect/Schema").Number;
                readonly maxLevel: import("effect/Schema").Number;
                readonly village: import("effect/Schema").String;
            }>>>;
        }>>;
        readonly troops: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly name: import("effect/Schema").String;
            readonly level: import("effect/Schema").Number;
            readonly maxLevel: import("effect/Schema").Number;
            readonly village: import("effect/Schema").String;
            readonly superTroopIsActive: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
            readonly equipment: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly name: import("effect/Schema").String;
                readonly level: import("effect/Schema").Number;
                readonly maxLevel: import("effect/Schema").Number;
                readonly village: import("effect/Schema").String;
            }>>>;
        }>>;
        readonly spells: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly name: import("effect/Schema").String;
            readonly level: import("effect/Schema").Number;
            readonly maxLevel: import("effect/Schema").Number;
            readonly village: import("effect/Schema").String;
            readonly superTroopIsActive: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
            readonly equipment: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly name: import("effect/Schema").String;
                readonly level: import("effect/Schema").Number;
                readonly maxLevel: import("effect/Schema").Number;
                readonly village: import("effect/Schema").String;
            }>>>;
        }>>;
        readonly heroEquipment: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly name: import("effect/Schema").String;
            readonly level: import("effect/Schema").Number;
            readonly maxLevel: import("effect/Schema").Number;
            readonly village: import("effect/Schema").String;
            readonly superTroopIsActive: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
            readonly equipment: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly name: import("effect/Schema").String;
                readonly level: import("effect/Schema").Number;
                readonly maxLevel: import("effect/Schema").Number;
                readonly village: import("effect/Schema").String;
            }>>>;
        }>>>;
        readonly currentLeagueGroupTag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly currentLeagueSeasonId: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly previousLeagueGroupTag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly previousLeagueSeasonId: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, readonly [{
        readonly status: 400;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 403;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 404;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }, {
        readonly status: 429;
        readonly body: import("effect/Schema").Struct<{
            readonly reason: import("effect/Schema").String;
            readonly message: import("effect/Schema").String;
        }>;
    }]>;
    readonly refreshRoster: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly rosterId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly scope: import("effect/Schema").Literals<readonly ["data", "role"]>;
    }>, import("effect/Schema").Struct<{
        readonly refreshId: import("effect/Schema").String;
        readonly scope: import("effect/Schema").String;
        readonly status: import("effect/Schema").String;
        readonly refreshedPlayers: import("effect/Schema").Number;
        readonly failedPlayers: import("effect/Schema").Number;
        readonly refreshedAt: import("effect/Schema").String;
        readonly reused: import("effect/Schema").Boolean;
        readonly roleId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly roleMemberUserIds: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
    }>, readonly []>;
    readonly reminders: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly war_reminders: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly type: import("effect/Schema").String;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly channel_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly thread_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly time: import("effect/Schema").String;
            readonly custom_text: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly townhall_filter: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Number>>;
            readonly roles: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
            readonly war_types: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
            readonly point_threshold: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly attack_threshold: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly roster_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly ping_type: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
        readonly capital_reminders: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly type: import("effect/Schema").String;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly channel_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly thread_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly time: import("effect/Schema").String;
            readonly custom_text: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly townhall_filter: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Number>>;
            readonly roles: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
            readonly war_types: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
            readonly point_threshold: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly attack_threshold: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly roster_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly ping_type: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
        readonly clan_games_reminders: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly type: import("effect/Schema").String;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly channel_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly thread_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly time: import("effect/Schema").String;
            readonly custom_text: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly townhall_filter: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Number>>;
            readonly roles: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
            readonly war_types: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
            readonly point_threshold: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly attack_threshold: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly roster_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly ping_type: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
        readonly inactivity_reminders: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly type: import("effect/Schema").String;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly channel_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly thread_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly time: import("effect/Schema").String;
            readonly custom_text: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly townhall_filter: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Number>>;
            readonly roles: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
            readonly war_types: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
            readonly point_threshold: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly attack_threshold: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly roster_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly ping_type: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
        readonly roster_reminders: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly type: import("effect/Schema").String;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly channel_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly thread_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly time: import("effect/Schema").String;
            readonly custom_text: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly townhall_filter: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").Number>>;
            readonly roles: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
            readonly war_types: import("effect/Schema").optionalKey<import("effect/Schema").$Array<import("effect/Schema").String>>;
            readonly point_threshold: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly attack_threshold: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly roster_id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly ping_type: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
    }>, readonly []>;
    readonly rerollGiveaway: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly giveawayId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly user_ids_to_replace: import("effect/Schema").$Array<import("effect/Schema").String>;
    }>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
        readonly giveawayId: import("effect/Schema").String;
        readonly serverId: import("effect/Schema").String;
        readonly newWinners: import("effect/Schema").$Array<import("effect/Schema").String>;
    }>, readonly []>;
    readonly roster: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly rosterId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly roster: import("effect/Schema").Struct<{
            readonly capacity: import("effect/Schema").Number;
            readonly minTownhall: import("effect/Schema").NullOr<import("effect/Schema").Number>;
            readonly maxTownhall: import("effect/Schema").NullOr<import("effect/Schema").Number>;
            readonly rosterRoleId: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly memberGroups: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly position: import("effect/Schema").Number;
                readonly signupEnabled: import("effect/Schema").Boolean;
                readonly roleId: import("effect/Schema").NullOr<import("effect/Schema").String>;
            }>>;
            readonly databaseId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly id: import("effect/Schema").String;
            readonly serverId: import("effect/Schema").String;
            readonly alias: import("effect/Schema").String;
            readonly description: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly clanTag: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly publicShareId: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly displayColumnIds: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly sortConfiguration: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly columnId: import("effect/Schema").String;
                readonly direction: import("effect/Schema").Literals<readonly ["asc", "desc"]>;
            }>>;
            readonly webhookId: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly messageId: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly questionnaire: import("effect/Schema").Struct<{
                readonly accountSelector: import("effect/Schema").Struct<{
                    readonly id: import("effect/Schema").String;
                    readonly type: import("effect/Schema").String;
                    readonly required: import("effect/Schema").Boolean;
                }>;
                readonly questions: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly id: import("effect/Schema").String;
                    readonly label: import("effect/Schema").String;
                    readonly type: import("effect/Schema").String;
                    readonly required: import("effect/Schema").Boolean;
                    readonly options: import("effect/Schema").$Array<import("effect/Schema").String>;
                    readonly order: import("effect/Schema").Number;
                }>>;
            }>;
            readonly memberCount: import("effect/Schema").Number;
            readonly refreshedAt: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly revision: import("effect/Schema").Number;
            readonly createdAt: import("effect/Schema").String;
            readonly updatedAt: import("effect/Schema").String;
            readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly memberGroupId: import("effect/Schema").NullOr<import("effect/Schema").String>;
                readonly isSubstitute: import("effect/Schema").Boolean;
                readonly playerTag: import("effect/Schema").String;
                readonly playerName: import("effect/Schema").String;
                readonly clanTag: import("effect/Schema").NullOr<import("effect/Schema").String>;
                readonly clanName: import("effect/Schema").NullOr<import("effect/Schema").String>;
                readonly townhall: import("effect/Schema").Number;
                readonly trophies: import("effect/Schema").NullOr<import("effect/Schema").Number>;
                readonly leagueId: import("effect/Schema").NullOr<import("effect/Schema").Number>;
                readonly leagueName: import("effect/Schema").NullOr<import("effect/Schema").String>;
                readonly heroLevelSum: import("effect/Schema").Number;
                readonly maxPercent: import("effect/Schema").NullOr<import("effect/Schema").Number>;
                readonly warPreference: import("effect/Schema").NullOr<import("effect/Schema").Boolean>;
                readonly discordUserId: import("effect/Schema").NullOr<import("effect/Schema").String>;
                readonly discordUsername: import("effect/Schema").NullOr<import("effect/Schema").String>;
                readonly discordAvatarUrl: import("effect/Schema").NullOr<import("effect/Schema").String>;
                readonly lastOnline: import("effect/Schema").NullOr<import("effect/Schema").String>;
                readonly refreshedAt: import("effect/Schema").NullOr<import("effect/Schema").String>;
                readonly answers: import("effect/Schema").Codec<import("effect/Schema").Json, import("effect/Schema").Json, never, never>;
            }>>;
        }>;
    }>, readonly []>;
    readonly rosters: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly capacity: import("effect/Schema").Number;
            readonly minTownhall: import("effect/Schema").NullOr<import("effect/Schema").Number>;
            readonly maxTownhall: import("effect/Schema").NullOr<import("effect/Schema").Number>;
            readonly rosterRoleId: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly memberGroups: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").String;
                readonly name: import("effect/Schema").String;
                readonly position: import("effect/Schema").Number;
                readonly signupEnabled: import("effect/Schema").Boolean;
                readonly roleId: import("effect/Schema").NullOr<import("effect/Schema").String>;
            }>>;
            readonly databaseId: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly id: import("effect/Schema").String;
            readonly serverId: import("effect/Schema").String;
            readonly alias: import("effect/Schema").String;
            readonly description: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly clanTag: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly publicShareId: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly displayColumnIds: import("effect/Schema").$Array<import("effect/Schema").String>;
            readonly sortConfiguration: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly columnId: import("effect/Schema").String;
                readonly direction: import("effect/Schema").Literals<readonly ["asc", "desc"]>;
            }>>;
            readonly webhookId: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly messageId: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly questionnaire: import("effect/Schema").Struct<{
                readonly accountSelector: import("effect/Schema").Struct<{
                    readonly id: import("effect/Schema").String;
                    readonly type: import("effect/Schema").String;
                    readonly required: import("effect/Schema").Boolean;
                }>;
                readonly questions: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                    readonly id: import("effect/Schema").String;
                    readonly label: import("effect/Schema").String;
                    readonly type: import("effect/Schema").String;
                    readonly required: import("effect/Schema").Boolean;
                    readonly options: import("effect/Schema").$Array<import("effect/Schema").String>;
                    readonly order: import("effect/Schema").Number;
                }>>;
            }>;
            readonly memberCount: import("effect/Schema").Number;
            readonly refreshedAt: import("effect/Schema").NullOr<import("effect/Schema").String>;
            readonly revision: import("effect/Schema").Number;
            readonly createdAt: import("effect/Schema").String;
            readonly updatedAt: import("effect/Schema").String;
        }>>;
    }>, readonly []>;
    readonly saveBan: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly tag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly reason: import("effect/Schema").String;
        readonly added_by: import("effect/Schema").String;
        readonly image: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly status: import("effect/Schema").String;
        readonly player_tag: import("effect/Schema").String;
        readonly player_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly server_id: import("effect/Schema").String;
    }>, readonly []>;
    readonly serverClanGamesLeaderboard: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly season: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
        readonly season: import("effect/Schema").String;
        readonly type: import("effect/Schema").String;
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly rank: import("effect/Schema").Number;
            readonly player_tag: import("effect/Schema").String;
            readonly player_name: import("effect/Schema").String;
            readonly townhall_level: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clan_tag: import("effect/Schema").String;
            readonly clan_name: import("effect/Schema").String;
            readonly clan_games: import("effect/Schema").Number;
            readonly score: import("effect/Schema").Number;
        }>>;
        readonly total: import("effect/Schema").Number;
    }>, readonly []>;
    readonly serverClans: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").$Array<import("effect/Schema").Struct<{
        readonly tag: import("effect/Schema").String;
        readonly name: import("effect/Schema").String;
    }>>, readonly []>;
    readonly serverDonationsLeaderboard: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly season: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
        readonly season: import("effect/Schema").String;
        readonly type: import("effect/Schema").String;
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly rank: import("effect/Schema").Number;
            readonly player_tag: import("effect/Schema").String;
            readonly player_name: import("effect/Schema").String;
            readonly townhall_level: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clan_tag: import("effect/Schema").String;
            readonly clan_name: import("effect/Schema").String;
            readonly donated: import("effect/Schema").Number;
            readonly received: import("effect/Schema").Number;
            readonly score: import("effect/Schema").Number;
        }>>;
        readonly total: import("effect/Schema").Number;
    }>, readonly []>;
    readonly serverLegendsLeaderboard: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly player_tag: import("effect/Schema").String;
            readonly player_name: import("effect/Schema").String;
            readonly townhall_level: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clan_tag: import("effect/Schema").String;
            readonly clan_name: import("effect/Schema").String;
            readonly trophies: import("effect/Schema").Number;
        }>>;
        readonly total: import("effect/Schema").Number;
    }>, readonly []>;
    readonly serverLinks: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly offset: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        readonly query: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly account_filter: import("effect/Schema").optionalKey<import("effect/Schema").Literal<"none">>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly members: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly user_id: import("effect/Schema").String;
            readonly username: import("effect/Schema").String;
            readonly display_name: import("effect/Schema").String;
            readonly avatar_url: import("effect/Schema").String;
            readonly linked_accounts: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly player_tag: import("effect/Schema").String;
                readonly player_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                readonly town_hall: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
                readonly is_verified: import("effect/Schema").Boolean;
                readonly added_at: import("effect/Schema").String;
            }>>;
            readonly account_count: import("effect/Schema").Number;
        }>>;
        readonly roles: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly color: import("effect/Schema").Number;
            readonly position: import("effect/Schema").Number;
        }>>;
        readonly total_members: import("effect/Schema").Number;
        readonly filtered_members: import("effect/Schema").Number;
        readonly members_with_links: import("effect/Schema").Number;
        readonly total_linked_accounts: import("effect/Schema").Number;
        readonly verified_accounts: import("effect/Schema").Number;
    }>, readonly []>;
    readonly serverWarLeaderboard: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly server_id: import("effect/Schema").String;
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly rank: import("effect/Schema").Number;
            readonly player_tag: import("effect/Schema").String;
            readonly player_name: import("effect/Schema").String;
            readonly townhall_level: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clan_tag: import("effect/Schema").String;
            readonly clan_name: import("effect/Schema").String;
            readonly total_attacks: import("effect/Schema").Number;
            readonly total_stars: import("effect/Schema").Number;
            readonly average_stars: import("effect/Schema").Number;
            readonly average_destruction: import("effect/Schema").Number;
            readonly three_star_attacks: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly three_star_rate: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly destruction_percentage: import("effect/Schema").Number;
        }>>;
        readonly total: import("effect/Schema").Number;
    }>, readonly []>;
    readonly strikeSummary: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
        readonly tag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly player_tag: import("effect/Schema").String;
        readonly server_id: import("effect/Schema").String;
        readonly total_strikes: import("effect/Schema").Number;
        readonly total_weight: import("effect/Schema").Number;
        readonly strikes: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly strike_id: import("effect/Schema").String;
            readonly tag: import("effect/Schema").String;
            readonly server: import("effect/Schema").String;
            readonly reason: import("effect/Schema").String;
            readonly added_by: import("effect/Schema").String;
            readonly added_by_username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly added_by_avatar_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly strike_weight: import("effect/Schema").Number;
            readonly image: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly date_created: import("effect/Schema").String;
            readonly rollover_date: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly player_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly town_hall: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly clan_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly current_role: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly trophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        }>>;
    }>, readonly []>;
    readonly strikes: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{
        readonly player_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        readonly view_expired: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly strike_id: import("effect/Schema").String;
            readonly tag: import("effect/Schema").String;
            readonly server: import("effect/Schema").String;
            readonly reason: import("effect/Schema").String;
            readonly added_by: import("effect/Schema").String;
            readonly added_by_username: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly added_by_avatar_url: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly strike_weight: import("effect/Schema").Number;
            readonly image: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly date_created: import("effect/Schema").String;
            readonly rollover_date: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly player_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly town_hall: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly clan_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly current_role: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly trophies: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
        }>>;
        readonly count: import("effect/Schema").Number;
    }>, readonly []>;
    readonly tickets: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly serverId: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly id: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly server_id: import("effect/Schema").String;
            readonly embed_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly components: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").String;
                readonly custom_id: import("effect/Schema").String;
                readonly label: import("effect/Schema").String;
                readonly style: import("effect/Schema").Number;
                readonly emoji: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                    readonly id: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
                    readonly animated: import("effect/Schema").optionalKey<import("effect/Schema").Boolean>;
                }>>;
                readonly type: import("effect/Schema").Number;
            }>>;
            readonly button_settings: import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Struct<{
                readonly questions: import("effect/Schema").$Array<import("effect/Schema").String>;
                readonly mod_role: import("effect/Schema").$Array<import("effect/Schema").String>;
                readonly no_ping_mod_role: import("effect/Schema").$Array<import("effect/Schema").String>;
                readonly private_thread: import("effect/Schema").Boolean;
                readonly th_min: import("effect/Schema").Number;
                readonly num_apply: import("effect/Schema").Number;
                readonly naming: import("effect/Schema").String;
                readonly account_apply: import("effect/Schema").Boolean;
                readonly player_info: import("effect/Schema").Boolean;
                readonly apply_clans: import("effect/Schema").$Array<import("effect/Schema").String>;
                readonly roles_to_add: import("effect/Schema").$Array<import("effect/Schema").String>;
                readonly roles_to_remove: import("effect/Schema").$Array<import("effect/Schema").String>;
                readonly townhall_requirements: import("effect/Schema").$Record<import("effect/Schema").String, import("effect/Schema").Number>;
                readonly new_message: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            }>>;
            readonly open_category: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly sleep_category: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly closed_category: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly status_change_log: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly ticket_button_click_log: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly ticket_close_log: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly approve_messages: import("effect/Schema").$Array<import("effect/Schema").Struct<{
                readonly name: import("effect/Schema").String;
                readonly message: import("effect/Schema").String;
            }>>;
        }>>;
        readonly total: import("effect/Schema").Number;
        readonly available_embeds: import("effect/Schema").$Array<import("effect/Schema").String>;
        readonly townhall_requirement_fields: import("effect/Schema").$Array<import("effect/Schema").String>;
    }>, readonly []>;
    readonly townHallLeaderboard: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly townHallLevel: import("effect/Schema").Number;
    }>, import("effect/Schema").Struct<{
        readonly limit: import("effect/Schema").optionalKey<import("effect/Schema").Number>;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly league_tier_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        readonly townhall_level: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
        readonly items: import("effect/Schema").$Array<import("effect/Schema").Struct<{
            readonly rank: import("effect/Schema").Number;
            readonly tag: import("effect/Schema").String;
            readonly name: import("effect/Schema").String;
            readonly league_id: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").Number>>;
            readonly league: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly id: import("effect/Schema").Number;
                readonly name: import("effect/Schema").String;
                readonly badge: import("effect/Schema").String;
            }>>;
            readonly clan_tag: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
            readonly clan: import("effect/Schema").optionalKey<import("effect/Schema").Struct<{
                readonly tag: import("effect/Schema").String;
                readonly name: import("effect/Schema").optionalKey<import("effect/Schema").NullOr<import("effect/Schema").String>>;
                readonly badge: import("effect/Schema").String;
            }>>;
            readonly townhall_level: import("effect/Schema").Number;
            readonly trophies: import("effect/Schema").Number;
            readonly country_code: import("effect/Schema").optionalKey<import("effect/Schema").String>;
            readonly country_name: import("effect/Schema").optionalKey<import("effect/Schema").String>;
        }>>;
        readonly count: import("effect/Schema").Number;
        readonly generated_at: import("effect/Schema").optionalKey<import("effect/Schema").String>;
    }>, readonly []>;
    readonly unlinkAccount: import("./endpoint.js").Endpoint<import("effect/Schema").Struct<{
        readonly userId: import("effect/Schema").String;
        readonly tag: import("effect/Schema").String;
    }>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{}>, import("effect/Schema").Struct<{
        readonly message: import("effect/Schema").String;
    }>, readonly []>;
};
//# sourceMappingURL=bot.d.ts.map