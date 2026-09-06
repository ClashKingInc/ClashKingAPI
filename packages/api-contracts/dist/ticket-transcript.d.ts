import { Schema } from "effect";
export declare const MAX_TRANSCRIPT_MESSAGES = 2000;
export declare const MAX_TRANSCRIPT_ATTACHMENTS = 100;
export declare const MAX_TRANSCRIPT_ATTACHMENT_BYTES: number;
/** New R2 transcripts are structured data, never executable HTML. */
export declare const TranscriptCapability: Schema.String;
export declare const TranscriptAttachment: Schema.Struct<{
    readonly id: Schema.String;
    readonly filename: Schema.String;
    readonly contentType: Schema.String;
    readonly size: Schema.Number;
    readonly sha256: Schema.String;
}>;
export declare const TranscriptMessage: Schema.Struct<{
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
}>;
export declare const TicketTranscriptDocument: Schema.Struct<{
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
}>;
export type TicketTranscriptDocument = typeof TicketTranscriptDocument.Type;
export type TranscriptAttachment = typeof TranscriptAttachment.Type;
//# sourceMappingURL=ticket-transcript.d.ts.map