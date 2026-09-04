import { Schema } from "effect";
export declare const TranscriptCapability: Schema.String;
export declare const TicketTranscriptChannelEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly capability: Schema.String;
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
export declare const TicketTranscriptThreadEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{
    readonly capability: Schema.String;
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
    readonly ticketTranscriptChannel: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly capability: Schema.String;
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
    readonly ticketTranscriptThread: import("./endpoint.js").Endpoint<Schema.Struct<{
        readonly capability: Schema.String;
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
export declare const TicketMessageEventEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly id: Schema.String;
    readonly guild_id: Schema.String;
    readonly channel_id: Schema.String;
    readonly author_id: Schema.String;
    readonly application_id: Schema.String;
}>, Schema.Union<readonly [Schema.Struct<{
    readonly outcome: Schema.Literal<"ignored">;
}>, Schema.Struct<{
    readonly outcome: Schema.Literal<"accepted">;
    readonly operationId: Schema.String;
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
//# sourceMappingURL=media.d.ts.map