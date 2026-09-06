import { Schema } from "effect"
import { defineEndpoint, NoBody, NoQuery } from "./endpoint.js"
import { ErrorResponse } from "./errors.js"
import { TicketTranscriptDocument, TranscriptCapability } from "./ticket-transcript.js"
export * from "./ticket-transcript.js"

const transcriptRead = {
  auth:"public", method:"GET", query:NoQuery, body:NoBody, bodyMode:"none", response:Schema.Unknown,
  responseMode:"response", successStatus:200, errors:[404,503].map(status=>({status,body:ErrorResponse})),
} as const
export const TicketTranscriptEndpoint = defineEndpoint({ ...transcriptRead,
  operationId:"ticketTranscript",path:"/v2/ticket-transcripts/:capability",
  pathParams:Schema.Struct({capability:TranscriptCapability}),response:TicketTranscriptDocument,
  responseMode:"json",responseContentType:"application/json",
  summary:"Read a structured ticket transcript and optional thread using its UUID link",
})
export const TicketTranscriptAttachmentEndpoint = defineEndpoint({ ...transcriptRead,
  operationId:"ticketTranscriptAttachment",path:"/v2/ticket-transcripts/:capability/attachments/:attachmentId",
  pathParams:Schema.Struct({capability:TranscriptCapability,attachmentId:TranscriptCapability}),responseContentType:"application/octet-stream",
  summary:"Download a copied attachment under its complete transcript capability",
})
export const ticketTranscriptEndpoints = {ticketTranscript:TicketTranscriptEndpoint,
  ticketTranscriptAttachment:TicketTranscriptAttachmentEndpoint} as const

export const MediaFileEndpoint = defineEndpoint({
  operationId: "mediaFile", method: "GET", path: "/v2/media/:filename", auth: "public",
  pathParams: Schema.Struct({ filename: Schema.String.check(Schema.isPattern(/^(?:base|giveaway|embed)_[a-z0-9_-]+[.][a-z0-9]+$/u)) }),
  query: NoQuery, body: NoBody, bodyMode: "none", response: Schema.Unknown, responseMode: "response", successStatus: 200,
  summary: "Stream an explicitly public R2 media object", errors: [404, 503].map((status) => ({ status, body: ErrorResponse })),
})
