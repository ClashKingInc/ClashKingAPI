import { Schema } from "effect";
import { defineEndpoint, NoBody, NoPathParams, NoQuery } from "./endpoint.js";
import { ErrorResponse } from "./errors.js";
import { DecimalSnowflake } from "./discord.js";
import { RuntimeUUID } from "./persistent-runtime.js";
export const TranscriptCapability = Schema.String.check(Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u));
const transcriptRead = {
    auth: "public", method: "GET", query: NoQuery, body: NoBody, bodyMode: "none", response: Schema.Unknown,
    responseMode: "response", successStatus: 200, errors: [404, 503].map(status => ({ status, body: ErrorResponse })),
};
export const TicketTranscriptChannelEndpoint = defineEndpoint({ ...transcriptRead,
    operationId: "ticketTranscriptChannel", path: "/v2/ticket-transcripts/:capability/channel.html",
    pathParams: Schema.Struct({ capability: TranscriptCapability }), responseContentType: "text/html",
    summary: "Read a complete private ticket channel transcript using its bearer capability",
});
export const TicketTranscriptThreadEndpoint = defineEndpoint({ ...transcriptRead,
    operationId: "ticketTranscriptThread", path: "/v2/ticket-transcripts/:capability/thread.html",
    pathParams: Schema.Struct({ capability: TranscriptCapability }), responseContentType: "text/html",
    summary: "Read the private thread under the same complete transcript capability",
});
export const TicketTranscriptAttachmentEndpoint = defineEndpoint({ ...transcriptRead,
    operationId: "ticketTranscriptAttachment", path: "/v2/ticket-transcripts/:capability/attachments/:attachmentId",
    pathParams: Schema.Struct({ capability: TranscriptCapability, attachmentId: TranscriptCapability }), responseContentType: "application/octet-stream",
    summary: "Download a copied attachment under its complete transcript capability",
});
export const ticketTranscriptEndpoints = { ticketTranscriptChannel: TicketTranscriptChannelEndpoint,
    ticketTranscriptThread: TicketTranscriptThreadEndpoint, ticketTranscriptAttachment: TicketTranscriptAttachmentEndpoint };
export const MediaFileEndpoint = defineEndpoint({
    operationId: "mediaFile", method: "GET", path: "/v2/media/:filename", auth: "public",
    pathParams: Schema.Struct({ filename: Schema.String.check(Schema.isPattern(/^(?:base|giveaway|embed)_[a-z0-9_-]+[.][a-z0-9]+$/u)) }),
    query: NoQuery, body: NoBody, bodyMode: "none", response: Schema.Unknown, responseMode: "response", successStatus: 200,
    summary: "Stream an explicitly public R2 media object", errors: [404, 503].map((status) => ({ status, body: ErrorResponse })),
});
export const TicketMessageEventEndpoint = defineEndpoint({
    operationId: "ticketMessageEvent", method: "POST", path: "/v2/runtime/tickets/message-events", auth: "bot",
    pathParams: NoPathParams, query: NoQuery, body: Schema.Struct({
        id: DecimalSnowflake, guild_id: DecimalSnowflake, channel_id: DecimalSnowflake, author_id: DecimalSnowflake, application_id: DecimalSnowflake,
    }), bodyMode: "json", response: Schema.Union([
        Schema.Struct({ outcome: Schema.Literal("ignored") }),
        Schema.Struct({ outcome: Schema.Literal("accepted"), operationId: RuntimeUUID }),
    ]), responseMode: "json", successStatus: 200,
    summary: "Validate an ID-only gateway ticket message event and journal staff notification effects",
    errors: [400, 401, 403, 409, 413, 415, 429, 503].map((status) => ({ status, body: ErrorResponse })),
});
