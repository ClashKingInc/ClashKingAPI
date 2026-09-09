import type { TicketTranscriptDocument } from "@clashking/api-contracts"

export const jsonTranscriptFixture: TicketTranscriptDocument = {
  schemaVersion: 1, collectedAt: "2026-09-04T12:00:00.000Z", captureStartedAt: "2026-09-04T11:59:00.000Z",
  ticket: { guildId: "123456789012345678", channelId: "223456789012345678", openerId: "323456789012345678", number: "42", panelName: "Support" },
  channels: [{ id: "223456789012345678", name: "ticket-42", type: 0, topic: null, historyComplete: true,
    messages: [{ id: "423456789012345678", createdAt: "2026-09-04T11:00:00.000Z", editedAt: null,
      author: { id: "323456789012345678", name: "Fixture", displayName: "Fixture", avatarUrl: null, bot: false },
      content: "<script>Never execute message text</script>", type: 0, pinned: false, referencedMessageId: null,
      embeds: [{ description: "Structured embed", color: 12345 }], components: [], attachmentIds: [], omittedAttachmentCount: 0, reactions: [],
    }],
  }], attachments: [],
}
