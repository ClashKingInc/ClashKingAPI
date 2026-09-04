import { Schema } from "effect"
import { TranscriptCapability } from "@clashking/api-contracts"

// Public credentials are random UUIDv4 values, never ticket/channel identifiers.
export { TranscriptCapability }
const Snowflake = Schema.String.check(Schema.isPattern(/^[0-9]{1,20}$/u))
const bounded = (maximum: number) => Schema.String.check(Schema.isMaxLength(maximum))
export const TranscriptMessage = Schema.Struct({
  id: Snowflake,
  author: Schema.Struct({ id: Snowflake, name: bounded(100), bot: Schema.Boolean }),
  timestamp: bounded(64), editedTimestamp: Schema.NullOr(bounded(64)),
  type: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  content: bounded(4000),
  embeds: Schema.Array(Schema.Struct({ title: bounded(256), description: bounded(4096),
    fields: Schema.Array(Schema.Struct({ name: bounded(256), value: bounded(1024) })).check(Schema.isMaxLength(25)),
    footer: bounded(2048), url: bounded(4096),
  })).check(Schema.isMaxLength(10)),
  attachments: Schema.Array(Schema.Struct({ id: TranscriptCapability, filename: bounded(1024),
    size: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  })).check(Schema.isMaxLength(10)),
  stickers: Schema.Array(bounded(100)).check(Schema.isMaxLength(3)),
  reactions: Schema.Array(Schema.Struct({ name: bounded(100), count: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)) })).check(Schema.isMaxLength(100)),
})
export type TranscriptMessage = typeof TranscriptMessage.Type
export type TranscriptDocument = "channel" | "thread"
export const TranscriptManifest = Schema.Struct({ version: Schema.Literal(1), complete: Schema.Literal(true),
  channel: Schema.Literal(true), thread: Schema.Boolean })

/** The capability itself never becomes an R2 key or a binding-trace attribute. */
export const transcriptStoragePrefix = async (capability: string): Promise<string> => {
  if (!Schema.is(TranscriptCapability)(capability)) throw new Error("Invalid transcript capability")
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(capability))
  return `transcripts/${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("")}`
}

export const transcriptSecurityHeaders = () => new Headers({
  "cache-control": "private, no-store, max-age=0",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex, nofollow, noarchive",
  "content-security-policy": "sandbox allow-downloads; default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "cross-origin-resource-policy": "same-origin",
})

const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;")
const pre = (value: string) => `<pre>${escape(value)}</pre>`

/** No Markdown/HTML interpretation, external images, scripts, or external links. */
export const renderTranscriptMessage = (input: TranscriptMessage): string => {
  const message = Schema.decodeUnknownSync(TranscriptMessage)(input)
  return `<article id="message-${message.id}"><h2>${escape(message.author.name)}${message.author.bot ? " (bot)" : ""}</h2>`
    + `<p>User ${message.author.id} · Message ${message.id} · Type ${message.type} · ${escape(message.timestamp)}`
    + `${message.editedTimestamp === null ? "" : ` · Edited ${escape(message.editedTimestamp)}`}</p>`
    + pre(message.content)
    + message.embeds.map(embed => `<blockquote><h3>${escape(embed.title)}</h3>${pre(embed.description)}`
      + embed.fields.map(field => `<h4>${escape(field.name)}</h4>${pre(field.value)}`).join("")
      + pre(embed.footer) + pre(embed.url) + "</blockquote>").join("")
    + message.attachments.map(attachment => `<p><a href="attachments/${attachment.id}" download rel="noreferrer">${escape(attachment.filename)}</a> (${attachment.size} bytes)</p>`).join("")
    + message.stickers.map(name => `<p>Sticker: ${escape(name)}</p>`).join("")
    + message.reactions.map(reaction => `<p>Reaction: ${escape(reaction.name)} (${reaction.count})</p>`).join("") + "</article>\n"
}

/** Pull-based output: the exporter supplies ordered, durably frozen messages. */
export const transcriptHtmlStream = (options: { title: string; document: TranscriptDocument; hasThread: boolean;
  messages: AsyncIterable<TranscriptMessage> }): ReadableStream<Uint8Array> => {
  const iterator = options.messages[Symbol.asyncIterator]()
  const encoder = new TextEncoder()
  let started = false
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!started) {
          started = true
          const title = Schema.decodeUnknownSync(bounded(256))(options.title)
          controller.enqueue(encoder.encode(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title></head><body><h1>${escape(title)}</h1>`
            + `<p>This link grants access to this transcript and its attachments. Share it only with intended readers.</p>`
            + (options.hasThread ? `<nav><a href="${options.document === "channel" ? "thread" : "channel"}.html" rel="noreferrer">${options.document === "channel" ? "Private thread" : "Ticket channel"}</a></nav>` : "")
            + "<main>\n"))
          return
        }
        const next = await iterator.next()
        if (next.done) {
          controller.enqueue(encoder.encode("</main></body></html>"))
          controller.close()
        } else controller.enqueue(encoder.encode(renderTranscriptMessage(next.value)))
      } catch {
        await iterator.return?.().catch(() => undefined)
        controller.error(new Error("Transcript rendering failed"))
      }
    },
    async cancel() { await iterator.return?.() },
  }, { highWaterMark: 0 })
}
