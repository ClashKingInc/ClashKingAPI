import { Schema } from "effect";
export * from "./ticket-transcript.js";
export declare const TicketTranscriptEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly capability: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly schemaVersion: Schema.Literal<1>;
    readonly collectedAt: Schema.String;
    readonly captureStartedAt: Schema.String;
    readonly ticket: Schema.Struct<{
        readonly guildId: Schema.String;
        readonly channelId: Schema.String;
        readonly openerId: Schema.String;
        readonly number: Schema.String;
        readonly panelName: Schema.String;
    }>;
    readonly channels: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly name: Schema.String;
        readonly type: Schema.Number;
        readonly topic: Schema.NullOr<Schema.String>;
        readonly historyComplete: Schema.Boolean;
        readonly messages: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly createdAt: Schema.String;
            readonly editedAt: Schema.NullOr<Schema.String>;
            readonly author: Schema.Struct<{
                readonly id: Schema.String;
                readonly name: Schema.String;
                readonly displayName: Schema.String;
                readonly avatarUrl: Schema.NullOr<Schema.String>;
                readonly bot: Schema.Boolean;
            }>;
            readonly content: Schema.String;
            readonly type: Schema.Number;
            readonly pinned: Schema.Boolean;
            readonly referencedMessageId: Schema.NullOr<Schema.String>;
            readonly embeds: Schema.$Array<Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>>;
            readonly components: Schema.$Array<Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>>;
            readonly attachmentIds: Schema.$Array<Schema.String>;
            readonly omittedAttachmentCount: Schema.Number;
            readonly reactions: Schema.$Array<Schema.Struct<{
                readonly emoji: Schema.String;
                readonly count: Schema.Number;
            }>>;
        }>>;
    }>>;
    readonly attachments: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly filename: Schema.String;
        readonly contentType: Schema.String;
        readonly size: Schema.Number;
        readonly sha256: Schema.String;
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
export declare const TicketTranscriptAttachmentEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly capability: Schema.String;
    readonly attachmentId: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Unknown, {
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
export declare const ticketTranscriptEndpoints: {
    readonly ticketTranscript: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly capability: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
        readonly schemaVersion: Schema.Literal<1>;
        readonly collectedAt: Schema.String;
        readonly captureStartedAt: Schema.String;
        readonly ticket: Schema.Struct<{
            readonly guildId: Schema.String;
            readonly channelId: Schema.String;
            readonly openerId: Schema.String;
            readonly number: Schema.String;
            readonly panelName: Schema.String;
        }>;
        readonly channels: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly name: Schema.String;
            readonly type: Schema.Number;
            readonly topic: Schema.NullOr<Schema.String>;
            readonly historyComplete: Schema.Boolean;
            readonly messages: Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly createdAt: Schema.String;
                readonly editedAt: Schema.NullOr<Schema.String>;
                readonly author: Schema.Struct<{
                    readonly id: Schema.String;
                    readonly name: Schema.String;
                    readonly displayName: Schema.String;
                    readonly avatarUrl: Schema.NullOr<Schema.String>;
                    readonly bot: Schema.Boolean;
                }>;
                readonly content: Schema.String;
                readonly type: Schema.Number;
                readonly pinned: Schema.Boolean;
                readonly referencedMessageId: Schema.NullOr<Schema.String>;
                readonly embeds: Schema.$Array<Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>>;
                readonly components: Schema.$Array<Schema.$Record<Schema.String, Schema.Codec<Schema.Json, Schema.Json, never, never>>>;
                readonly attachmentIds: Schema.$Array<Schema.String>;
                readonly omittedAttachmentCount: Schema.Number;
                readonly reactions: Schema.$Array<Schema.Struct<{
                    readonly emoji: Schema.String;
                    readonly count: Schema.Number;
                }>>;
            }>>;
        }>>;
        readonly attachments: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly filename: Schema.String;
            readonly contentType: Schema.String;
            readonly size: Schema.Number;
            readonly sha256: Schema.String;
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
    readonly ticketTranscriptAttachment: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly capability: Schema.String;
        readonly attachmentId: Schema.String;
    }>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Unknown, {
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
export declare const MediaFileEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly filename: Schema.String;
}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Unknown, {
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
//# sourceMappingURL=media.d.ts.map