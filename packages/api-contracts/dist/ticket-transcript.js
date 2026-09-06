import { Schema } from "effect";
export const MAX_TRANSCRIPT_MESSAGES = 2_000;
export const MAX_TRANSCRIPT_ATTACHMENTS = 100;
export const MAX_TRANSCRIPT_ATTACHMENT_BYTES = 512 * 1024 * 1024;
/** New R2 transcripts are structured data, never executable HTML. */
export const TranscriptCapability = Schema.String.check(Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u));
const Id = Schema.String.check(Schema.isPattern(/^[0-9]{1,20}$/u));
const Text = Schema.String.check(Schema.isMaxLength(100_000));
const Timestamp = Schema.String.check(Schema.makeFilter(value => {
    const parts = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u.exec(value);
    if (!parts || !Number.isFinite(Date.parse(value)))
        return "Invalid timestamp";
    const year = Number(parts[1]), month = Number(parts[2]), day = Number(parts[3]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] ? undefined : "Invalid timestamp";
}));
const Size = Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 512 * 1024 * 1024 }));
export const TranscriptAttachment = Schema.Struct({
    id: TranscriptCapability,
    filename: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(255)),
    contentType: Schema.String.check(Schema.isMaxLength(200)),
    size: Size,
    sha256: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/u)),
});
export const TranscriptMessage = Schema.Struct({
    id: Id, createdAt: Timestamp, editedAt: Schema.NullOr(Timestamp),
    author: Schema.Struct({ id: Id, name: Text, displayName: Text, avatarUrl: Schema.NullOr(Text), bot: Schema.Boolean }),
    content: Text, type: Schema.Number.check(Schema.isInt()), pinned: Schema.Boolean,
    referencedMessageId: Schema.NullOr(Id),
    // Preserve Discord's structured payloads; a future viewer must render them
    // as data and never inject strings as markup or fetch arbitrary URLs server-side.
    embeds: Schema.Array(Schema.JsonObject).check(Schema.isMaxLength(10)),
    components: Schema.Array(Schema.JsonObject).check(Schema.isMaxLength(40)),
    attachmentIds: Schema.Array(TranscriptCapability).check(Schema.isMaxLength(100)),
    omittedAttachmentCount: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
    reactions: Schema.Array(Schema.Struct({ emoji: Text, count: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)) })).check(Schema.isMaxLength(100)),
});
export const TicketTranscriptDocument = Schema.Struct({
    schemaVersion: Schema.Literal(1), collectedAt: Timestamp,
    captureStartedAt: Timestamp,
    ticket: Schema.Struct({ guildId: Id, channelId: Id, openerId: Id, number: Schema.String, panelName: Text }),
    channels: Schema.Array(Schema.Struct({
        id: Id, name: Text, type: Schema.Number.check(Schema.isInt()), topic: Schema.NullOr(Text),
        // False means older history was intentionally excluded by the export cap;
        // a failed page fetch is never a successful limited capture.
        historyComplete: Schema.Boolean,
        messages: Schema.Array(TranscriptMessage).check(Schema.isMaxLength(MAX_TRANSCRIPT_MESSAGES)),
    })).check(Schema.isMinLength(1), Schema.isMaxLength(2)),
    attachments: Schema.Array(TranscriptAttachment).check(Schema.isMaxLength(MAX_TRANSCRIPT_ATTACHMENTS)),
}).check(Schema.makeFilter(document => {
    if (Date.parse(document.captureStartedAt) > Date.parse(document.collectedAt))
        return "Invalid capture interval";
    if (document.channels.reduce((sum, channel) => sum + channel.messages.length, 0) > MAX_TRANSCRIPT_MESSAGES)
        return "Transcript message limit exceeded";
    if (document.attachments.reduce((sum, attachment) => sum + attachment.size, 0) > MAX_TRANSCRIPT_ATTACHMENT_BYTES)
        return "Transcript attachment byte limit exceeded";
    const channels = new Set(document.channels.map(channel => channel.id));
    const attachments = new Set(document.attachments.map(attachment => attachment.id));
    if (channels.size !== document.channels.length || !channels.has(document.ticket.channelId))
        return "Invalid transcript channels";
    if (attachments.size !== document.attachments.length)
        return "Duplicate transcript attachment";
    const messageIds = new Set();
    const referencedAttachments = new Set();
    for (const channel of document.channels)
        for (const message of channel.messages) {
            if (messageIds.has(message.id))
                return "Duplicate transcript message";
            messageIds.add(message.id);
            if (message.attachmentIds.some(id => !attachments.has(id)))
                return "Missing transcript attachment reference";
            for (const id of message.attachmentIds)
                referencedAttachments.add(id);
        }
    if (referencedAttachments.size !== attachments.size)
        return "Unreferenced transcript attachment";
    return undefined;
}));
