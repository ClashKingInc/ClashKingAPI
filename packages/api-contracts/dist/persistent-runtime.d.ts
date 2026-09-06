/** @internal Deferred bot orchestration reference; never include in active API endpoint maps. */
import { Schema } from "effect";
/** The original signed UTF-8 body, never reserialized, logged, or persisted. */
export declare const RuntimeInteractionProof: Schema.Struct<{
    readonly interaction: Schema.Struct<{
        readonly rawBody: Schema.String;
        readonly signature: Schema.String;
        readonly timestamp: Schema.String;
    }>;
}>;
export declare const RuntimeGiveawayId: Schema.String;
export declare const RuntimeUUID: Schema.String;
export declare const GiveawayEnterResponse: Schema.Struct<{
    readonly giveawayId: Schema.String;
    readonly outcome: Schema.Literals<readonly ["entered", "already_entered"]>;
    readonly entryCount: Schema.Number;
}>;
export declare const GiveawayEntryRejection: Schema.Literals<readonly ["roles", "avatar", "linked_account", "not_member", "not_open", "invalid_configuration", "wrong_message"]>;
export declare const GiveawayEntryError: Schema.Struct<{
    readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
    readonly message: Schema.String;
    readonly request_id: Schema.optionalKey<Schema.String>;
    readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly field: Schema.String;
        readonly message: Schema.String;
    }>>>;
    readonly reason: Schema.Literals<readonly ["roles", "avatar", "linked_account", "not_member", "not_open", "invalid_configuration", "wrong_message"]>;
}>;
export declare const GiveawayEnterEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly giveawayId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly interaction: Schema.Struct<{
        readonly rawBody: Schema.String;
        readonly signature: Schema.String;
        readonly timestamp: Schema.String;
    }>;
}>, Schema.Struct<{
    readonly giveawayId: Schema.String;
    readonly outcome: Schema.Literals<readonly ["entered", "already_entered"]>;
    readonly entryCount: Schema.Number;
}>, readonly [{
    readonly status: 403;
    readonly body: Schema.Union<readonly [Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
        readonly reason: Schema.Literals<readonly ["roles", "avatar", "linked_account", "not_member", "not_open", "invalid_configuration", "wrong_message"]>;
    }>, Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>]>;
}, {
    readonly status: 409;
    readonly body: Schema.Union<readonly [Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
        readonly reason: Schema.Literals<readonly ["roles", "avatar", "linked_account", "not_member", "not_open", "invalid_configuration", "wrong_message"]>;
    }>, Schema.Struct<{
        readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
        readonly message: Schema.String;
        readonly request_id: Schema.optionalKey<Schema.String>;
        readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
            readonly field: Schema.String;
            readonly message: Schema.String;
        }>>>;
    }>]>;
}, ...{
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
}[]]>;
export declare const GiveawayPublicationKind: Schema.Literals<readonly ["start", "update", "end", "reroll"]>;
export declare const GiveawayPublicationPayload: Schema.Struct<{
    readonly version: Schema.Literal<1>;
    readonly occurred_at: Schema.String;
    readonly giveaway: Schema.Struct<{
        readonly id: Schema.String;
        readonly server_id: Schema.String;
        readonly channel_id: Schema.String;
        readonly message_id: Schema.NullOr<Schema.String>;
        readonly prize: Schema.String;
        readonly status: Schema.Literals<readonly ["scheduled", "ongoing", "ended"]>;
        readonly end_time: Schema.String;
        readonly winners: Schema.Number;
        readonly mentions: Schema.$Array<Schema.String>;
        readonly text_above_embed: Schema.String;
        readonly text_in_embed: Schema.String;
        readonly text_on_end: Schema.String;
        readonly image_url: Schema.NullOr<Schema.String>;
        readonly entry_count: Schema.Number;
    }>;
    readonly winner_ids: Schema.$Array<Schema.String>;
    readonly replaced_user_ids: Schema.$Array<Schema.String>;
    readonly reason: Schema.String;
    readonly actor_label: Schema.String;
}>;
export declare const GiveawayPublicationEffectId: Schema.String;
export declare const GiveawayPublicationPrepareEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly giveawayId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly kind: Schema.Literals<readonly ["start", "update", "end"]>;
}>, Schema.Union<readonly [Schema.Struct<{
    readonly outcome: Schema.Literal<"pending">;
}>, Schema.Struct<{
    readonly outcome: Schema.Literal<"ready">;
    readonly effectId: Schema.String;
}>]>, {
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
export declare const GiveawayPublicationClaimEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly giveawayId: Schema.String;
    readonly effectId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Union<readonly [Schema.Struct<{
    readonly outcome: Schema.Literals<readonly ["pending", "complete", "ambiguous", "failed"]>;
}>, Schema.Struct<{
    readonly outcome: Schema.Literal<"claimed">;
    readonly claimToken: Schema.String;
    readonly effect: Schema.Struct<{
        readonly effectId: Schema.String;
        readonly kind: Schema.Literals<readonly ["start", "update", "end", "reroll"]>;
        readonly sourceMessageId: Schema.NullOr<Schema.String>;
        readonly startTime: Schema.String;
        readonly payload: Schema.Struct<{
            readonly version: Schema.Literal<1>;
            readonly occurred_at: Schema.String;
            readonly giveaway: Schema.Struct<{
                readonly id: Schema.String;
                readonly server_id: Schema.String;
                readonly channel_id: Schema.String;
                readonly message_id: Schema.NullOr<Schema.String>;
                readonly prize: Schema.String;
                readonly status: Schema.Literals<readonly ["scheduled", "ongoing", "ended"]>;
                readonly end_time: Schema.String;
                readonly winners: Schema.Number;
                readonly mentions: Schema.$Array<Schema.String>;
                readonly text_above_embed: Schema.String;
                readonly text_in_embed: Schema.String;
                readonly text_on_end: Schema.String;
                readonly image_url: Schema.NullOr<Schema.String>;
                readonly entry_count: Schema.Number;
            }>;
            readonly winner_ids: Schema.$Array<Schema.String>;
            readonly replaced_user_ids: Schema.$Array<Schema.String>;
            readonly reason: Schema.String;
            readonly actor_label: Schema.String;
        }>;
    }>;
}>]>, {
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
export declare const GiveawayPublicationCompleteEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly giveawayId: Schema.String;
    readonly effectId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly claimToken: Schema.String;
    readonly outcome: Schema.Literals<readonly ["succeeded", "ambiguous", "failed", "retry"]>;
    readonly messageId: Schema.optionalKey<Schema.String>;
    readonly failureReason: Schema.optionalKey<Schema.Literals<readonly ["payload_validation", "http_rejected", "transport_uncertain", "source_update_uncertain", "rate_limited"]>>;
    readonly retryAfterSeconds: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{
    readonly outcome: Schema.Literals<readonly ["succeeded", "ambiguous", "failed", "pending"]>;
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
export declare const GiveawayPublicationPendingEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly limit: Schema.optionalKey<Schema.Number>;
}>, Schema.Struct<{
    readonly items: Schema.$Array<Schema.Struct<{
        readonly giveawayId: Schema.String;
        readonly effectId: Schema.String;
    }>>;
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
export declare const TicketRuntimeState: Schema.Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
export declare const TicketRuntimeAction: Schema.Literals<readonly ["open", "set_status", "assign", "approve", "add_member", "opt", "notify"]>;
export declare const TicketTextField: Schema.Struct<{
    readonly customId: Schema.String;
    readonly label: Schema.String;
    readonly required: Schema.Boolean;
    readonly style: Schema.Literals<readonly ["short", "paragraph"]>;
    readonly maxLength: Schema.Number;
}>;
export declare const TicketAccountSelectForm: Schema.Struct<{
    readonly kind: Schema.Literal<"account_select">;
    readonly customId: Schema.String;
    readonly content: Schema.String;
    readonly placeholder: Schema.String;
    readonly minValues: Schema.Number;
    readonly maxValues: Schema.Number;
    readonly options: Schema.$Array<Schema.Struct<{
        readonly value: Schema.String;
        readonly label: Schema.String;
    }>>;
}>;
export declare const TicketModalForm: Schema.Struct<{
    readonly kind: Schema.Literal<"modal">;
    readonly customId: Schema.String;
    readonly title: Schema.String;
    readonly fields: Schema.$Array<Schema.Struct<{
        readonly customId: Schema.String;
        readonly label: Schema.String;
        readonly required: Schema.Boolean;
        readonly style: Schema.Literals<readonly ["short", "paragraph"]>;
        readonly maxLength: Schema.Number;
    }>>;
}>;
export declare const TicketContinueForm: Schema.Struct<{
    readonly kind: Schema.Literal<"continue">;
    readonly customId: Schema.String;
    readonly content: Schema.String;
    readonly label: Schema.String;
}>;
export declare const TicketStringSelectForm: Schema.Struct<{
    readonly kind: Schema.Literal<"string_select">;
    readonly customId: Schema.String;
    readonly content: Schema.String;
    readonly placeholder: Schema.String;
    readonly minValues: Schema.Literal<1>;
    readonly maxValues: Schema.Literal<1>;
    readonly options: Schema.$Array<Schema.Struct<{
        readonly value: Schema.String;
        readonly label: Schema.String;
        readonly description: Schema.optionalKey<Schema.String>;
    }>>;
}>;
export declare const TicketApplicationForm: Schema.Union<readonly [Schema.Struct<{
    readonly kind: Schema.Literal<"account_select">;
    readonly customId: Schema.String;
    readonly content: Schema.String;
    readonly placeholder: Schema.String;
    readonly minValues: Schema.Number;
    readonly maxValues: Schema.Number;
    readonly options: Schema.$Array<Schema.Struct<{
        readonly value: Schema.String;
        readonly label: Schema.String;
    }>>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"string_select">;
    readonly customId: Schema.String;
    readonly content: Schema.String;
    readonly placeholder: Schema.String;
    readonly minValues: Schema.Literal<1>;
    readonly maxValues: Schema.Literal<1>;
    readonly options: Schema.$Array<Schema.Struct<{
        readonly value: Schema.String;
        readonly label: Schema.String;
        readonly description: Schema.optionalKey<Schema.String>;
    }>>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"modal">;
    readonly customId: Schema.String;
    readonly title: Schema.String;
    readonly fields: Schema.$Array<Schema.Struct<{
        readonly customId: Schema.String;
        readonly label: Schema.String;
        readonly required: Schema.Boolean;
        readonly style: Schema.Literals<readonly ["short", "paragraph"]>;
        readonly maxLength: Schema.Number;
    }>>;
}>, Schema.Struct<{
    readonly kind: Schema.Literal<"continue">;
    readonly customId: Schema.String;
    readonly content: Schema.String;
    readonly label: Schema.String;
}>]>;
/** A scoped preparation exists, but no ticket or opening operation exists yet. */
export declare const TicketLinkRequiredResponse: Schema.Struct<{
    readonly outcome: Schema.Literal<"link_required">;
    readonly preparationId: Schema.String;
    readonly expiresAt: Schema.String;
    readonly content: Schema.String;
    readonly link: Schema.Struct<{
        readonly customId: Schema.String;
        readonly label: Schema.String;
    }>;
}>;
export declare const TicketOpenPrepareEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly interaction: Schema.Struct<{
        readonly rawBody: Schema.String;
        readonly signature: Schema.String;
        readonly timestamp: Schema.String;
    }>;
}>, Schema.Union<readonly [Schema.Struct<{
    readonly outcome: Schema.Literal<"ready">;
    readonly operationId: Schema.String;
    readonly ticketId: Schema.String;
    readonly action: Schema.Literals<readonly ["open", "approve", "assign"]>;
    readonly expiresAt: Schema.String;
    readonly form: Schema.Union<readonly [Schema.Struct<{
        readonly kind: Schema.Literal<"account_select">;
        readonly customId: Schema.String;
        readonly content: Schema.String;
        readonly placeholder: Schema.String;
        readonly minValues: Schema.Number;
        readonly maxValues: Schema.Number;
        readonly options: Schema.$Array<Schema.Struct<{
            readonly value: Schema.String;
            readonly label: Schema.String;
        }>>;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"string_select">;
        readonly customId: Schema.String;
        readonly content: Schema.String;
        readonly placeholder: Schema.String;
        readonly minValues: Schema.Literal<1>;
        readonly maxValues: Schema.Literal<1>;
        readonly options: Schema.$Array<Schema.Struct<{
            readonly value: Schema.String;
            readonly label: Schema.String;
            readonly description: Schema.optionalKey<Schema.String>;
        }>>;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"modal">;
        readonly customId: Schema.String;
        readonly title: Schema.String;
        readonly fields: Schema.$Array<Schema.Struct<{
            readonly customId: Schema.String;
            readonly label: Schema.String;
            readonly required: Schema.Boolean;
            readonly style: Schema.Literals<readonly ["short", "paragraph"]>;
            readonly maxLength: Schema.Number;
        }>>;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"continue">;
        readonly customId: Schema.String;
        readonly content: Schema.String;
        readonly label: Schema.String;
    }>]>;
}>, Schema.Struct<{
    readonly outcome: Schema.Literals<readonly ["accepted", "complete"]>;
    readonly operationId: Schema.String;
    readonly ticketId: Schema.String;
    readonly state: Schema.Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
}>, Schema.Struct<{
    readonly outcome: Schema.Literal<"link_required">;
    readonly preparationId: Schema.String;
    readonly expiresAt: Schema.String;
    readonly content: Schema.String;
    readonly link: Schema.Struct<{
        readonly customId: Schema.String;
        readonly label: Schema.String;
    }>;
}>]>, {
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
export declare const TicketApprovePrepareEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly interaction: Schema.Struct<{
        readonly rawBody: Schema.String;
        readonly signature: Schema.String;
        readonly timestamp: Schema.String;
    }>;
}>, Schema.Union<readonly [Schema.Struct<{
    readonly outcome: Schema.Literal<"ready">;
    readonly operationId: Schema.String;
    readonly ticketId: Schema.String;
    readonly action: Schema.Literals<readonly ["open", "approve", "assign"]>;
    readonly expiresAt: Schema.String;
    readonly form: Schema.Union<readonly [Schema.Struct<{
        readonly kind: Schema.Literal<"account_select">;
        readonly customId: Schema.String;
        readonly content: Schema.String;
        readonly placeholder: Schema.String;
        readonly minValues: Schema.Number;
        readonly maxValues: Schema.Number;
        readonly options: Schema.$Array<Schema.Struct<{
            readonly value: Schema.String;
            readonly label: Schema.String;
        }>>;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"string_select">;
        readonly customId: Schema.String;
        readonly content: Schema.String;
        readonly placeholder: Schema.String;
        readonly minValues: Schema.Literal<1>;
        readonly maxValues: Schema.Literal<1>;
        readonly options: Schema.$Array<Schema.Struct<{
            readonly value: Schema.String;
            readonly label: Schema.String;
            readonly description: Schema.optionalKey<Schema.String>;
        }>>;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"modal">;
        readonly customId: Schema.String;
        readonly title: Schema.String;
        readonly fields: Schema.$Array<Schema.Struct<{
            readonly customId: Schema.String;
            readonly label: Schema.String;
            readonly required: Schema.Boolean;
            readonly style: Schema.Literals<readonly ["short", "paragraph"]>;
            readonly maxLength: Schema.Number;
        }>>;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"continue">;
        readonly customId: Schema.String;
        readonly content: Schema.String;
        readonly label: Schema.String;
    }>]>;
}>, Schema.Struct<{
    readonly outcome: Schema.Literals<readonly ["accepted", "complete"]>;
    readonly operationId: Schema.String;
    readonly ticketId: Schema.String;
    readonly state: Schema.Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
}>]>, {
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
export declare const TicketOperationAdvanceEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly operationId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly interaction: Schema.Struct<{
        readonly rawBody: Schema.String;
        readonly signature: Schema.String;
        readonly timestamp: Schema.String;
    }>;
}>, Schema.Union<readonly [Schema.Struct<{
    readonly outcome: Schema.Literal<"ready">;
    readonly operationId: Schema.String;
    readonly ticketId: Schema.String;
    readonly action: Schema.Literals<readonly ["open", "approve", "assign"]>;
    readonly expiresAt: Schema.String;
    readonly form: Schema.Union<readonly [Schema.Struct<{
        readonly kind: Schema.Literal<"account_select">;
        readonly customId: Schema.String;
        readonly content: Schema.String;
        readonly placeholder: Schema.String;
        readonly minValues: Schema.Number;
        readonly maxValues: Schema.Number;
        readonly options: Schema.$Array<Schema.Struct<{
            readonly value: Schema.String;
            readonly label: Schema.String;
        }>>;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"string_select">;
        readonly customId: Schema.String;
        readonly content: Schema.String;
        readonly placeholder: Schema.String;
        readonly minValues: Schema.Literal<1>;
        readonly maxValues: Schema.Literal<1>;
        readonly options: Schema.$Array<Schema.Struct<{
            readonly value: Schema.String;
            readonly label: Schema.String;
            readonly description: Schema.optionalKey<Schema.String>;
        }>>;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"modal">;
        readonly customId: Schema.String;
        readonly title: Schema.String;
        readonly fields: Schema.$Array<Schema.Struct<{
            readonly customId: Schema.String;
            readonly label: Schema.String;
            readonly required: Schema.Boolean;
            readonly style: Schema.Literals<readonly ["short", "paragraph"]>;
            readonly maxLength: Schema.Number;
        }>>;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"continue">;
        readonly customId: Schema.String;
        readonly content: Schema.String;
        readonly label: Schema.String;
    }>]>;
}>, Schema.Struct<{
    readonly outcome: Schema.Literals<readonly ["accepted", "complete"]>;
    readonly operationId: Schema.String;
    readonly ticketId: Schema.String;
    readonly state: Schema.Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
}>]>, {
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
export declare const TicketActionEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly interaction: Schema.Struct<{
        readonly rawBody: Schema.String;
        readonly signature: Schema.String;
        readonly timestamp: Schema.String;
    }>;
}>, Schema.Union<readonly [Schema.Struct<{
    readonly outcome: Schema.Literal<"ready">;
    readonly operationId: Schema.String;
    readonly ticketId: Schema.String;
    readonly action: Schema.Literals<readonly ["open", "approve", "assign"]>;
    readonly expiresAt: Schema.String;
    readonly form: Schema.Union<readonly [Schema.Struct<{
        readonly kind: Schema.Literal<"account_select">;
        readonly customId: Schema.String;
        readonly content: Schema.String;
        readonly placeholder: Schema.String;
        readonly minValues: Schema.Number;
        readonly maxValues: Schema.Number;
        readonly options: Schema.$Array<Schema.Struct<{
            readonly value: Schema.String;
            readonly label: Schema.String;
        }>>;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"string_select">;
        readonly customId: Schema.String;
        readonly content: Schema.String;
        readonly placeholder: Schema.String;
        readonly minValues: Schema.Literal<1>;
        readonly maxValues: Schema.Literal<1>;
        readonly options: Schema.$Array<Schema.Struct<{
            readonly value: Schema.String;
            readonly label: Schema.String;
            readonly description: Schema.optionalKey<Schema.String>;
        }>>;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"modal">;
        readonly customId: Schema.String;
        readonly title: Schema.String;
        readonly fields: Schema.$Array<Schema.Struct<{
            readonly customId: Schema.String;
            readonly label: Schema.String;
            readonly required: Schema.Boolean;
            readonly style: Schema.Literals<readonly ["short", "paragraph"]>;
            readonly maxLength: Schema.Number;
        }>>;
    }>, Schema.Struct<{
        readonly kind: Schema.Literal<"continue">;
        readonly customId: Schema.String;
        readonly content: Schema.String;
        readonly label: Schema.String;
    }>]>;
}>, Schema.Struct<{
    readonly outcome: Schema.Literals<readonly ["accepted", "complete"]>;
    readonly operationId: Schema.String;
    readonly ticketId: Schema.String;
    readonly state: Schema.Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
}>]>, {
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
export declare const TicketOperationStatusEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly operationId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly interaction: Schema.Struct<{
        readonly rawBody: Schema.String;
        readonly signature: Schema.String;
        readonly timestamp: Schema.String;
    }>;
}>, Schema.Struct<{
    readonly operationId: Schema.String;
    readonly ticketId: Schema.String;
    readonly state: Schema.Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
    readonly action: Schema.Literals<readonly ["open", "set_status", "assign", "approve", "add_member", "opt", "notify"]>;
    readonly channelId: Schema.optionalKey<Schema.String>;
    readonly threadId: Schema.optionalKey<Schema.String>;
    readonly failure: Schema.optionalKey<Schema.String>;
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
export declare const TicketPanelPublicationEffectId: Schema.String;
export declare const TicketPanelPublicationState: Schema.Literals<readonly ["pending", "executing", "uncertain", "succeeded", "failed"]>;
export declare const TicketPanelPublicationPrepareEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly interaction: Schema.Struct<{
        readonly rawBody: Schema.String;
        readonly signature: Schema.String;
        readonly timestamp: Schema.String;
    }>;
}>, Schema.Struct<{
    readonly effectId: Schema.String;
    readonly panelId: Schema.String;
    readonly state: Schema.Literals<readonly ["pending", "executing", "uncertain", "succeeded", "failed"]>;
    readonly statusCustomId: Schema.String;
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
export declare const TicketPanelPublicationStatusEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly effectId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{
    readonly interaction: Schema.Struct<{
        readonly rawBody: Schema.String;
        readonly signature: Schema.String;
        readonly timestamp: Schema.String;
    }>;
}>, Schema.Struct<{
    readonly effectId: Schema.String;
    readonly panelId: Schema.String;
    readonly state: Schema.Literals<readonly ["pending", "executing", "uncertain", "succeeded", "failed"]>;
    readonly statusCustomId: Schema.String;
    readonly messageId: Schema.optionalKey<Schema.String>;
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
export declare const TicketAccountInteractionEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly interaction: Schema.Struct<{
        readonly rawBody: Schema.String;
        readonly signature: Schema.String;
        readonly timestamp: Schema.String;
    }>;
}>, Schema.Union<readonly [Schema.Struct<{
    readonly outcome: Schema.Literal<"form">;
    readonly preparationId: Schema.String;
    readonly expiresAt: Schema.String;
    readonly form: Schema.Struct<{
        readonly kind: Schema.Literal<"modal">;
        readonly customId: Schema.String;
        readonly title: Schema.String;
        readonly fields: Schema.$Array<Schema.Struct<{
            readonly customId: Schema.String;
            readonly label: Schema.String;
            readonly required: Schema.Boolean;
            readonly style: Schema.Literals<readonly ["short", "paragraph"]>;
            readonly maxLength: Schema.Number;
        }>>;
    }>;
}>, Schema.Struct<{
    readonly outcome: Schema.Literal<"linked">;
    readonly preparationId: Schema.String;
    readonly accountTag: Schema.String;
    readonly content: Schema.String;
}>, Schema.Struct<{
    readonly outcome: Schema.Literal<"accounts">;
    readonly ticketId: Schema.String;
    readonly sessionId: Schema.String;
    readonly expiresAt: Schema.String;
    readonly content: Schema.String;
    readonly accounts: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly townHallLevel: Schema.Number;
    }>>;
    readonly select: Schema.Struct<{
        readonly customId: Schema.String;
        readonly placeholder: Schema.String;
        readonly options: Schema.$Array<Schema.Struct<{
            readonly label: Schema.String;
            readonly value: Schema.String;
        }>>;
        readonly minValues: Schema.Literal<1>;
        readonly maxValues: Schema.Literal<1>;
    }>;
}>, Schema.Struct<{
    readonly outcome: Schema.Literal<"account">;
    readonly ticketId: Schema.String;
    readonly sessionId: Schema.String;
    readonly content: Schema.String;
    readonly account: Schema.Struct<{
        readonly tag: Schema.String;
        readonly name: Schema.String;
        readonly townHallLevel: Schema.Number;
    }>;
}>]>, {
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
export declare const persistentRuntimeEndpoints: {
    readonly giveawayEnter: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly giveawayId: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{
        readonly interaction: Schema.Struct<{
            readonly rawBody: Schema.String;
            readonly signature: Schema.String;
            readonly timestamp: Schema.String;
        }>;
    }>, Schema.Struct<{
        readonly giveawayId: Schema.String;
        readonly outcome: Schema.Literals<readonly ["entered", "already_entered"]>;
        readonly entryCount: Schema.Number;
    }>, readonly [{
        readonly status: 403;
        readonly body: Schema.Union<readonly [Schema.Struct<{
            readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: Schema.String;
            readonly request_id: Schema.optionalKey<Schema.String>;
            readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly field: Schema.String;
                readonly message: Schema.String;
            }>>>;
            readonly reason: Schema.Literals<readonly ["roles", "avatar", "linked_account", "not_member", "not_open", "invalid_configuration", "wrong_message"]>;
        }>, Schema.Struct<{
            readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: Schema.String;
            readonly request_id: Schema.optionalKey<Schema.String>;
            readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly field: Schema.String;
                readonly message: Schema.String;
            }>>>;
        }>]>;
    }, {
        readonly status: 409;
        readonly body: Schema.Union<readonly [Schema.Struct<{
            readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: Schema.String;
            readonly request_id: Schema.optionalKey<Schema.String>;
            readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly field: Schema.String;
                readonly message: Schema.String;
            }>>>;
            readonly reason: Schema.Literals<readonly ["roles", "avatar", "linked_account", "not_member", "not_open", "invalid_configuration", "wrong_message"]>;
        }>, Schema.Struct<{
            readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
            readonly message: Schema.String;
            readonly request_id: Schema.optionalKey<Schema.String>;
            readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
                readonly field: Schema.String;
                readonly message: Schema.String;
            }>>>;
        }>]>;
    }, ...{
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
    }[]]>;
    readonly giveawayPublicationPrepare: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly giveawayId: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{
        readonly kind: Schema.Literals<readonly ["start", "update", "end"]>;
    }>, Schema.Union<readonly [Schema.Struct<{
        readonly outcome: Schema.Literal<"pending">;
    }>, Schema.Struct<{
        readonly outcome: Schema.Literal<"ready">;
        readonly effectId: Schema.String;
    }>]>, {
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
    readonly giveawayPublicationClaim: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly giveawayId: Schema.String;
        readonly effectId: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Union<readonly [Schema.Struct<{
        readonly outcome: Schema.Literals<readonly ["pending", "complete", "ambiguous", "failed"]>;
    }>, Schema.Struct<{
        readonly outcome: Schema.Literal<"claimed">;
        readonly claimToken: Schema.String;
        readonly effect: Schema.Struct<{
            readonly effectId: Schema.String;
            readonly kind: Schema.Literals<readonly ["start", "update", "end", "reroll"]>;
            readonly sourceMessageId: Schema.NullOr<Schema.String>;
            readonly startTime: Schema.String;
            readonly payload: Schema.Struct<{
                readonly version: Schema.Literal<1>;
                readonly occurred_at: Schema.String;
                readonly giveaway: Schema.Struct<{
                    readonly id: Schema.String;
                    readonly server_id: Schema.String;
                    readonly channel_id: Schema.String;
                    readonly message_id: Schema.NullOr<Schema.String>;
                    readonly prize: Schema.String;
                    readonly status: Schema.Literals<readonly ["scheduled", "ongoing", "ended"]>;
                    readonly end_time: Schema.String;
                    readonly winners: Schema.Number;
                    readonly mentions: Schema.$Array<Schema.String>;
                    readonly text_above_embed: Schema.String;
                    readonly text_in_embed: Schema.String;
                    readonly text_on_end: Schema.String;
                    readonly image_url: Schema.NullOr<Schema.String>;
                    readonly entry_count: Schema.Number;
                }>;
                readonly winner_ids: Schema.$Array<Schema.String>;
                readonly replaced_user_ids: Schema.$Array<Schema.String>;
                readonly reason: Schema.String;
                readonly actor_label: Schema.String;
            }>;
        }>;
    }>]>, {
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
    readonly giveawayPublicationComplete: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly giveawayId: Schema.String;
        readonly effectId: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{
        readonly claimToken: Schema.String;
        readonly outcome: Schema.Literals<readonly ["succeeded", "ambiguous", "failed", "retry"]>;
        readonly messageId: Schema.optionalKey<Schema.String>;
        readonly failureReason: Schema.optionalKey<Schema.Literals<readonly ["payload_validation", "http_rejected", "transport_uncertain", "source_update_uncertain", "rate_limited"]>>;
        readonly retryAfterSeconds: Schema.optionalKey<Schema.Number>;
    }>, Schema.Struct<{
        readonly outcome: Schema.Literals<readonly ["succeeded", "ambiguous", "failed", "pending"]>;
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
    readonly giveawayPublicationPending: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly limit: Schema.optionalKey<Schema.Number>;
    }>, Schema.Struct<{
        readonly items: Schema.$Array<Schema.Struct<{
            readonly giveawayId: Schema.String;
            readonly effectId: Schema.String;
        }>>;
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
    readonly ticketOpenPrepare: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly interaction: Schema.Struct<{
            readonly rawBody: Schema.String;
            readonly signature: Schema.String;
            readonly timestamp: Schema.String;
        }>;
    }>, Schema.Union<readonly [Schema.Struct<{
        readonly outcome: Schema.Literal<"ready">;
        readonly operationId: Schema.String;
        readonly ticketId: Schema.String;
        readonly action: Schema.Literals<readonly ["open", "approve", "assign"]>;
        readonly expiresAt: Schema.String;
        readonly form: Schema.Union<readonly [Schema.Struct<{
            readonly kind: Schema.Literal<"account_select">;
            readonly customId: Schema.String;
            readonly content: Schema.String;
            readonly placeholder: Schema.String;
            readonly minValues: Schema.Number;
            readonly maxValues: Schema.Number;
            readonly options: Schema.$Array<Schema.Struct<{
                readonly value: Schema.String;
                readonly label: Schema.String;
            }>>;
        }>, Schema.Struct<{
            readonly kind: Schema.Literal<"string_select">;
            readonly customId: Schema.String;
            readonly content: Schema.String;
            readonly placeholder: Schema.String;
            readonly minValues: Schema.Literal<1>;
            readonly maxValues: Schema.Literal<1>;
            readonly options: Schema.$Array<Schema.Struct<{
                readonly value: Schema.String;
                readonly label: Schema.String;
                readonly description: Schema.optionalKey<Schema.String>;
            }>>;
        }>, Schema.Struct<{
            readonly kind: Schema.Literal<"modal">;
            readonly customId: Schema.String;
            readonly title: Schema.String;
            readonly fields: Schema.$Array<Schema.Struct<{
                readonly customId: Schema.String;
                readonly label: Schema.String;
                readonly required: Schema.Boolean;
                readonly style: Schema.Literals<readonly ["short", "paragraph"]>;
                readonly maxLength: Schema.Number;
            }>>;
        }>, Schema.Struct<{
            readonly kind: Schema.Literal<"continue">;
            readonly customId: Schema.String;
            readonly content: Schema.String;
            readonly label: Schema.String;
        }>]>;
    }>, Schema.Struct<{
        readonly outcome: Schema.Literals<readonly ["accepted", "complete"]>;
        readonly operationId: Schema.String;
        readonly ticketId: Schema.String;
        readonly state: Schema.Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
    }>, Schema.Struct<{
        readonly outcome: Schema.Literal<"link_required">;
        readonly preparationId: Schema.String;
        readonly expiresAt: Schema.String;
        readonly content: Schema.String;
        readonly link: Schema.Struct<{
            readonly customId: Schema.String;
            readonly label: Schema.String;
        }>;
    }>]>, {
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
    readonly ticketApprovePrepare: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly interaction: Schema.Struct<{
            readonly rawBody: Schema.String;
            readonly signature: Schema.String;
            readonly timestamp: Schema.String;
        }>;
    }>, Schema.Union<readonly [Schema.Struct<{
        readonly outcome: Schema.Literal<"ready">;
        readonly operationId: Schema.String;
        readonly ticketId: Schema.String;
        readonly action: Schema.Literals<readonly ["open", "approve", "assign"]>;
        readonly expiresAt: Schema.String;
        readonly form: Schema.Union<readonly [Schema.Struct<{
            readonly kind: Schema.Literal<"account_select">;
            readonly customId: Schema.String;
            readonly content: Schema.String;
            readonly placeholder: Schema.String;
            readonly minValues: Schema.Number;
            readonly maxValues: Schema.Number;
            readonly options: Schema.$Array<Schema.Struct<{
                readonly value: Schema.String;
                readonly label: Schema.String;
            }>>;
        }>, Schema.Struct<{
            readonly kind: Schema.Literal<"string_select">;
            readonly customId: Schema.String;
            readonly content: Schema.String;
            readonly placeholder: Schema.String;
            readonly minValues: Schema.Literal<1>;
            readonly maxValues: Schema.Literal<1>;
            readonly options: Schema.$Array<Schema.Struct<{
                readonly value: Schema.String;
                readonly label: Schema.String;
                readonly description: Schema.optionalKey<Schema.String>;
            }>>;
        }>, Schema.Struct<{
            readonly kind: Schema.Literal<"modal">;
            readonly customId: Schema.String;
            readonly title: Schema.String;
            readonly fields: Schema.$Array<Schema.Struct<{
                readonly customId: Schema.String;
                readonly label: Schema.String;
                readonly required: Schema.Boolean;
                readonly style: Schema.Literals<readonly ["short", "paragraph"]>;
                readonly maxLength: Schema.Number;
            }>>;
        }>, Schema.Struct<{
            readonly kind: Schema.Literal<"continue">;
            readonly customId: Schema.String;
            readonly content: Schema.String;
            readonly label: Schema.String;
        }>]>;
    }>, Schema.Struct<{
        readonly outcome: Schema.Literals<readonly ["accepted", "complete"]>;
        readonly operationId: Schema.String;
        readonly ticketId: Schema.String;
        readonly state: Schema.Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
    }>]>, {
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
    readonly ticketOperationAdvance: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly operationId: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{
        readonly interaction: Schema.Struct<{
            readonly rawBody: Schema.String;
            readonly signature: Schema.String;
            readonly timestamp: Schema.String;
        }>;
    }>, Schema.Union<readonly [Schema.Struct<{
        readonly outcome: Schema.Literal<"ready">;
        readonly operationId: Schema.String;
        readonly ticketId: Schema.String;
        readonly action: Schema.Literals<readonly ["open", "approve", "assign"]>;
        readonly expiresAt: Schema.String;
        readonly form: Schema.Union<readonly [Schema.Struct<{
            readonly kind: Schema.Literal<"account_select">;
            readonly customId: Schema.String;
            readonly content: Schema.String;
            readonly placeholder: Schema.String;
            readonly minValues: Schema.Number;
            readonly maxValues: Schema.Number;
            readonly options: Schema.$Array<Schema.Struct<{
                readonly value: Schema.String;
                readonly label: Schema.String;
            }>>;
        }>, Schema.Struct<{
            readonly kind: Schema.Literal<"string_select">;
            readonly customId: Schema.String;
            readonly content: Schema.String;
            readonly placeholder: Schema.String;
            readonly minValues: Schema.Literal<1>;
            readonly maxValues: Schema.Literal<1>;
            readonly options: Schema.$Array<Schema.Struct<{
                readonly value: Schema.String;
                readonly label: Schema.String;
                readonly description: Schema.optionalKey<Schema.String>;
            }>>;
        }>, Schema.Struct<{
            readonly kind: Schema.Literal<"modal">;
            readonly customId: Schema.String;
            readonly title: Schema.String;
            readonly fields: Schema.$Array<Schema.Struct<{
                readonly customId: Schema.String;
                readonly label: Schema.String;
                readonly required: Schema.Boolean;
                readonly style: Schema.Literals<readonly ["short", "paragraph"]>;
                readonly maxLength: Schema.Number;
            }>>;
        }>, Schema.Struct<{
            readonly kind: Schema.Literal<"continue">;
            readonly customId: Schema.String;
            readonly content: Schema.String;
            readonly label: Schema.String;
        }>]>;
    }>, Schema.Struct<{
        readonly outcome: Schema.Literals<readonly ["accepted", "complete"]>;
        readonly operationId: Schema.String;
        readonly ticketId: Schema.String;
        readonly state: Schema.Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
    }>]>, {
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
    readonly ticketAction: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly interaction: Schema.Struct<{
            readonly rawBody: Schema.String;
            readonly signature: Schema.String;
            readonly timestamp: Schema.String;
        }>;
    }>, Schema.Union<readonly [Schema.Struct<{
        readonly outcome: Schema.Literal<"ready">;
        readonly operationId: Schema.String;
        readonly ticketId: Schema.String;
        readonly action: Schema.Literals<readonly ["open", "approve", "assign"]>;
        readonly expiresAt: Schema.String;
        readonly form: Schema.Union<readonly [Schema.Struct<{
            readonly kind: Schema.Literal<"account_select">;
            readonly customId: Schema.String;
            readonly content: Schema.String;
            readonly placeholder: Schema.String;
            readonly minValues: Schema.Number;
            readonly maxValues: Schema.Number;
            readonly options: Schema.$Array<Schema.Struct<{
                readonly value: Schema.String;
                readonly label: Schema.String;
            }>>;
        }>, Schema.Struct<{
            readonly kind: Schema.Literal<"string_select">;
            readonly customId: Schema.String;
            readonly content: Schema.String;
            readonly placeholder: Schema.String;
            readonly minValues: Schema.Literal<1>;
            readonly maxValues: Schema.Literal<1>;
            readonly options: Schema.$Array<Schema.Struct<{
                readonly value: Schema.String;
                readonly label: Schema.String;
                readonly description: Schema.optionalKey<Schema.String>;
            }>>;
        }>, Schema.Struct<{
            readonly kind: Schema.Literal<"modal">;
            readonly customId: Schema.String;
            readonly title: Schema.String;
            readonly fields: Schema.$Array<Schema.Struct<{
                readonly customId: Schema.String;
                readonly label: Schema.String;
                readonly required: Schema.Boolean;
                readonly style: Schema.Literals<readonly ["short", "paragraph"]>;
                readonly maxLength: Schema.Number;
            }>>;
        }>, Schema.Struct<{
            readonly kind: Schema.Literal<"continue">;
            readonly customId: Schema.String;
            readonly content: Schema.String;
            readonly label: Schema.String;
        }>]>;
    }>, Schema.Struct<{
        readonly outcome: Schema.Literals<readonly ["accepted", "complete"]>;
        readonly operationId: Schema.String;
        readonly ticketId: Schema.String;
        readonly state: Schema.Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
    }>]>, {
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
    readonly ticketAccountInteraction: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly interaction: Schema.Struct<{
            readonly rawBody: Schema.String;
            readonly signature: Schema.String;
            readonly timestamp: Schema.String;
        }>;
    }>, Schema.Union<readonly [Schema.Struct<{
        readonly outcome: Schema.Literal<"form">;
        readonly preparationId: Schema.String;
        readonly expiresAt: Schema.String;
        readonly form: Schema.Struct<{
            readonly kind: Schema.Literal<"modal">;
            readonly customId: Schema.String;
            readonly title: Schema.String;
            readonly fields: Schema.$Array<Schema.Struct<{
                readonly customId: Schema.String;
                readonly label: Schema.String;
                readonly required: Schema.Boolean;
                readonly style: Schema.Literals<readonly ["short", "paragraph"]>;
                readonly maxLength: Schema.Number;
            }>>;
        }>;
    }>, Schema.Struct<{
        readonly outcome: Schema.Literal<"linked">;
        readonly preparationId: Schema.String;
        readonly accountTag: Schema.String;
        readonly content: Schema.String;
    }>, Schema.Struct<{
        readonly outcome: Schema.Literal<"accounts">;
        readonly ticketId: Schema.String;
        readonly sessionId: Schema.String;
        readonly expiresAt: Schema.String;
        readonly content: Schema.String;
        readonly accounts: Schema.$Array<Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly townHallLevel: Schema.Number;
        }>>;
        readonly select: Schema.Struct<{
            readonly customId: Schema.String;
            readonly placeholder: Schema.String;
            readonly options: Schema.$Array<Schema.Struct<{
                readonly label: Schema.String;
                readonly value: Schema.String;
            }>>;
            readonly minValues: Schema.Literal<1>;
            readonly maxValues: Schema.Literal<1>;
        }>;
    }>, Schema.Struct<{
        readonly outcome: Schema.Literal<"account">;
        readonly ticketId: Schema.String;
        readonly sessionId: Schema.String;
        readonly content: Schema.String;
        readonly account: Schema.Struct<{
            readonly tag: Schema.String;
            readonly name: Schema.String;
            readonly townHallLevel: Schema.Number;
        }>;
    }>]>, {
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
    readonly ticketOperationStatus: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly operationId: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{
        readonly interaction: Schema.Struct<{
            readonly rawBody: Schema.String;
            readonly signature: Schema.String;
            readonly timestamp: Schema.String;
        }>;
    }>, Schema.Struct<{
        readonly operationId: Schema.String;
        readonly ticketId: Schema.String;
        readonly state: Schema.Literals<readonly ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]>;
        readonly action: Schema.Literals<readonly ["open", "set_status", "assign", "approve", "add_member", "opt", "notify"]>;
        readonly channelId: Schema.optionalKey<Schema.String>;
        readonly threadId: Schema.optionalKey<Schema.String>;
        readonly failure: Schema.optionalKey<Schema.String>;
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
    readonly ticketPanelPublicationPrepare: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly interaction: Schema.Struct<{
            readonly rawBody: Schema.String;
            readonly signature: Schema.String;
            readonly timestamp: Schema.String;
        }>;
    }>, Schema.Struct<{
        readonly effectId: Schema.String;
        readonly panelId: Schema.String;
        readonly state: Schema.Literals<readonly ["pending", "executing", "uncertain", "succeeded", "failed"]>;
        readonly statusCustomId: Schema.String;
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
    readonly ticketPanelPublicationStatus: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly effectId: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{
        readonly interaction: Schema.Struct<{
            readonly rawBody: Schema.String;
            readonly signature: Schema.String;
            readonly timestamp: Schema.String;
        }>;
    }>, Schema.Struct<{
        readonly effectId: Schema.String;
        readonly panelId: Schema.String;
        readonly state: Schema.Literals<readonly ["pending", "executing", "uncertain", "succeeded", "failed"]>;
        readonly statusCustomId: Schema.String;
        readonly messageId: Schema.optionalKey<Schema.String>;
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
};
export declare const persistentRuntimeReadinessBlockers: {
    readonly ticketApprovePrepare: "Approval template runtime and integrated staff proof remain incomplete";
    readonly ticketAction: "Ticket deletion transcript runtime and integrated staff proof remain incomplete";
};
//# sourceMappingURL=persistent-runtime.d.ts.map