import { connect as connectNet, type Socket } from "node:net"
import { connect as connectTls } from "node:tls"
import nodemailer from "nodemailer"
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js"
import { Effect, Layer } from "effect"
import catalog from "../../../locales/en.json"
import { AuthMailer, validateEmail, type AuthEmailMessage } from "./auth-email.js"
import { WorkerEnvironment, type WorkerBindings } from "./environment.js"
import { UpstreamUnavailable } from "./errors.js"

type MailBindings = Pick<WorkerBindings, "SMTP_HOST" | "SMTP_PORT" | "SMTP_STARTTLS" | "SMTP_SSL_TLS" |
  "SMTP_FROM_ADDRESS" | "SMTP_REPLY_TO_ADDRESS" | "SMTP_USERNAME" | "SMTP_PASSWORD">

export const authMailerLayer = Layer.effect(AuthMailer, Effect.gen(function* () {
  const env = yield* WorkerEnvironment
  return AuthMailer.of({ send: (message) => Effect.gen(function* () {
    const recipient = yield* validateEmail(message.recipient)
    const from = yield* validateEmail(env.SMTP_FROM_ADDRESS)
    const replyTo = yield* validateEmail(env.SMTP_REPLY_TO_ADDRESS)
    const options = yield* smtpOptions(env)
    const content = renderAuthEmail(message)
    yield* Effect.tryPromise({ try: (signal) => sendSmtp(options, {
      from: { name: from.name ?? "", address: from.address }, to: { name: recipient.name ?? "", address: recipient.address },
      replyTo: { name: replyTo.name ?? "", address: replyTo.address }, subject: content.subject, text: content.text, html: content.html,
      envelope: { from: from.address, to: [recipient.address] },
      disableFileAccess: true, disableUrlAccess: true,
    }, signal), catch: () => unavailable() }).pipe(Effect.timeout("20 seconds"))
  }).pipe(Effect.mapError(() => unavailable())) })
}))

export function smtpOptions(env: MailBindings) {
  return Effect.try({
    try: (): SMTPTransport.Options => {
      const port = Number(env.SMTP_PORT)
      const secure = env.SMTP_SSL_TLS === "true"
      const startTls = env.SMTP_STARTTLS === "true"
      if (!env.SMTP_HOST.trim() || /[\s/@:#]/u.test(env.SMTP_HOST) || !Number.isInteger(port) || port < 1 || port > 65535 || port === 25
        || secure === startTls || !["true", "false"].includes(env.SMTP_SSL_TLS) || !["true", "false"].includes(env.SMTP_STARTTLS)
        || !env.SMTP_USERNAME.trim() || !env.SMTP_PASSWORD) throw new Error("Invalid SMTP configuration")
      return { host: env.SMTP_HOST, port, secure, requireTLS: startTls, ignoreTLS: false,
        auth: { user: env.SMTP_USERNAME, pass: env.SMTP_PASSWORD },
        tls: { servername: env.SMTP_HOST, minVersion: "TLSv1.2", rejectUnauthorized: true },
        connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
        disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
      }
    }, catch: () => unavailable(),
  })
}

// Nodemailer only generates MIME: its SMTP parser has unbounded multiline
// buffers. Own the small, sequential SMTP exchange and bound decrypted replies.
export async function sendSmtp(options: SMTPTransport.Options, message: nodemailer.SendMailOptions, signal: AbortSignal): Promise<void> {
  const sockets = new Set<Socket>()
  let canceled = false
  const abort = () => { canceled = true; for (const socket of sockets) socket.destroy(new Error("SMTP request canceled")) }
  signal.addEventListener("abort", abort, { once: true })
  const deadline = setTimeout(abort, 20_000)
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "windows", disableFileAccess: true, disableUrlAccess: true })
  let reader: SmtpReplies | undefined
  try {
    signal.throwIfAborted()
    if ((!options.secure && !options.requireTLS) || options.ignoreTLS || options.tls?.rejectUnauthorized === false) throw new Error("SMTP requires verified TLS")
    const auth = options.auth
    if (!auth?.user || !("pass" in auth) || typeof auth.pass !== "string") throw new Error("SMTP credentials required")
    const mime = await transport.sendMail({ ...message, disableFileAccess: true, disableUrlAccess: true })
    if (!Buffer.isBuffer(mime.message) || mime.message.byteLength > 128 * 1024) throw new Error("SMTP message too large")
    const recipients = mime.envelope.to
    const addresses = [mime.envelope.from, ...recipients]
    if (recipients.length !== 1 || addresses.some((address) => typeof address !== "string" || /[\r\n<>\0]/u.test(address))) throw new Error("Invalid SMTP envelope")
    signal.throwIfAborted()
    if (canceled) throw new Error("SMTP request canceled")
    const target = { host: options.host!, port: options.port! }
    let socket: Socket = options.secure ? connectTls({ ...target, ...options.tls, rejectUnauthorized: true }) : connectNet(target)
    const own = (connection: Socket) => {
      sockets.add(connection)
      connection.on("error", () => { /* consumed by bounded reader / connection wait */ })
      connection.setTimeout(options.socketTimeout || 20_000, abort)
      if (signal.aborted || canceled) abort()
    }
    own(socket)
    reader = new SmtpReplies(socket)
    await connected(socket, options.secure ? "secureConnect" : "connect", options.connectionTimeout || 10_000)
    await reader.expect(220)
    const command = async (line: string, code: number) => { socket.write(`${line}\r\n`); return reader!.expect(code) }
    let extensions = await command("EHLO clashk.ing", 250)
    const supports = (extension: string) => extensions.some((line) => line.toUpperCase().split(" ")[0] === extension)
    if (!options.secure) {
      if (!supports("STARTTLS")) throw new Error("SMTP STARTTLS unavailable")
      let ready: Promise<void> | undefined
      socket.write("STARTTLS\r\n")
      await reader.expect(220, () => {
        // Upgrade synchronously in the data callback before workerd starts its
        // next plaintext read; an awaited continuation leaves that read locked.
        reader!.detach()
        socket = connectTls({ socket, ...options.tls, rejectUnauthorized: true })
        own(socket)
        reader = new SmtpReplies(socket)
        ready = connected(socket, "secureConnect", options.connectionTimeout || 10_000)
      })
      await ready
      extensions = await command("EHLO clashk.ing", 250)
    }
    // Use SMTP AUTH PLAIN exclusively over verified TLS.
    await command(`AUTH PLAIN ${Buffer.from(`\0${auth.user}\0${auth.pass}`).toString("base64")}`, 235)
    if (addresses.some((address) => [...String(address)].some((character) => character.charCodeAt(0) > 127)) && !supports("SMTPUTF8")) throw new Error("SMTPUTF8 unavailable")
    await command(`MAIL FROM:<${mime.envelope.from}>${supports("8BITMIME") ? " BODY=8BITMIME" : ""}${supports("SMTPUTF8") ? " SMTPUTF8" : ""}`, 250)
    await command(`RCPT TO:<${recipients[0]}>`, 250)
    await command("DATA", 354)
    const body = mime.message.toString("utf8").replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..")
    socket.write(`${body}${body.endsWith("\r\n") ? "" : "\r\n"}.\r\n`)
    await reader.expect(250)
  } finally {
    clearTimeout(deadline)
    signal.removeEventListener("abort", abort)
    transport.close()
    reader?.detach()
    for (const socket of sockets) socket.destroy()
  }
}

function connected(socket: Socket, event: "connect" | "secureConnect", timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => socket.destroy(new Error("SMTP connection deadline exceeded")), timeout)
    const cleanup = () => { clearTimeout(timer); socket.removeListener(event, ready); socket.removeListener("error", failed); socket.removeListener("close", closed) }
    const ready = () => { cleanup(); resolve() }
    const failed = (error: Error) => { cleanup(); reject(error) }
    const closed = () => failed(new Error("SMTP connection closed"))
    socket.once(event, ready); socket.once("error", failed); socket.once("close", closed)
  })
}

class SmtpReplies {
  private buffer = ""
  private bytes = 0
  private replyBytes = 0
  private lines: string[] = []
  private code: number | undefined
  private replies: { code: number; lines: string[] }[] = []
  private failure: Error | undefined
  private detached = false
  private waiter: { resolve: (reply: { code: number; lines: string[] }) => void; reject: (error: Error) => void } | undefined
  constructor(private readonly socket: Socket) {
    socket.on("data", this.data); socket.on("error", this.fail); socket.on("close", this.closed)
  }
  private fail = (_error: Error) => {
    this.failure = new Error("SMTP reply rejected or connection closed")
    this.waiter?.reject(this.failure); this.waiter = undefined
    this.socket.destroy()
  }
  private closed = () => this.fail(new Error("SMTP connection closed"))
  private data = (chunk: Buffer) => {
    this.bytes += chunk.byteLength
    if (this.bytes > 64 * 1024) { this.fail(new Error("SMTP session reply limit")); return }
    this.buffer += chunk.toString("latin1")
    while (this.buffer.length) {
      const end = this.buffer.indexOf("\r\n")
      if (end < 0) { if (this.buffer.length > 8192) this.fail(new Error("SMTP line limit")); return }
      if (end > 8192) { this.fail(new Error("SMTP line limit")); return }
      const line = this.buffer.slice(0, end)
      this.buffer = this.buffer.slice(end + 2)
      this.replyBytes += end + 2
      const match = /^(\d{3})([ -]|$)/u.exec(line)
      if (!match || this.replyBytes > 16 * 1024 || (this.code !== undefined && Number(match[1]) !== this.code)) { this.fail(new Error("SMTP reply limit or syntax")); return }
      this.code = Number(match[1])
      this.lines.push(line.slice(4))
      if (match[2] !== "-") {
        const reply = { code: this.code, lines: this.lines }
        this.code = undefined; this.replyBytes = 0; this.lines = []
        if (this.waiter) { this.waiter.resolve(reply); this.waiter = undefined }
        else if (this.replies.length < 2) this.replies.push(reply)
        else { this.fail(new Error("SMTP unsolicited replies")); return }
        if (this.detached) return
      }
    }
  }
  expect(expected: number, accepted?: () => void): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const received = (reply: { code: number; lines: string[] }) => {
        if (reply.code !== expected) { reject(new Error("SMTP command rejected")); return }
        try { accepted?.(); resolve(reply.lines) } catch (error) { reject(error) }
      }
      if (this.failure) { reject(this.failure); return }
      const queued = this.replies.shift()
      if (queued !== undefined) received(queued)
      else this.waiter = { resolve: received, reject }
    })
  }
  detach() {
    this.detached = true
    this.socket.removeListener("data", this.data); this.socket.removeListener("error", this.fail); this.socket.removeListener("close", this.closed)
  }
}

function unavailable() { return new UpstreamUnavailable({ cause: "SMTP delivery failed", message: "Authentication email could not be sent. Please try again." }) }

export function renderAuthEmail(message: AuthEmailMessage) {
  // en.json is the authoritative authentication-email catalog. Unsupported
  // locales currently fall back to English.
  const prefix = `email.${message.kind}.` as const
  const text = (key: keyof typeof catalog) => catalog[key]
  const title = text(`${prefix}heading`)
  const greeting = message.username.trim() ? text("email.common.greeting_named").replaceAll("{{name}}", message.username.trim()) : text("email.common.greeting")
  const preheader = text(`${prefix}preheader`), body = text(`${prefix}body`), expiry = text(`${prefix}expiry`), security = text(`${prefix}security`)
  const footer = text("email.common.footer")
  const plain = `${title}\n\n${greeting}\n\n${text(`${prefix}plain_action`)}\n\n${text("email.common.code_label")}: ${message.code}\n\n${expiry}\n\n${security}\n\n${footer}\n`
  const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&#34;").replaceAll("'", "&#39;")
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;color:#171719;font-family:Roboto,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f4f4;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #dedee2;border-radius:12px;overflow:hidden;">
<tr><td style="background:#0b0b0c;padding:22px 28px;border-bottom:4px solid #d90709;"><img src="https://assets.clashk.ing/logos/crown-arrow-dark-bg/ClashKing-1.png" width="174" alt="ClashKing" style="display:block;width:174px;max-width:100%;height:auto;border:0;"></td></tr>
<tr><td style="padding:32px 28px 12px;"><h1 style="margin:0;font-size:28px;line-height:1.2;font-weight:800;letter-spacing:0;color:#171719;">${escape(title)}</h1></td></tr>
<tr><td style="padding:8px 28px 0;font-size:16px;line-height:1.6;color:#333338;"><p style="margin:0 0 12px;">${escape(greeting)}</p><p style="margin:0;">${escape(body)}</p></td></tr>
<tr><td align="center" style="padding:28px;"><div style="display:inline-block;padding:18px 24px;border:2px solid #bf0000;border-radius:12px;background:#fff6f6;color:#a90000;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:34px;line-height:1;font-weight:800;letter-spacing:8px;">${escape(message.code)}</div></td></tr>
<tr><td style="padding:0 28px 16px;font-size:14px;line-height:1.5;color:#55555c;"><p style="margin:0;font-weight:700;">${escape(expiry)}</p></td></tr>
<tr><td style="padding:0 28px 32px;font-size:14px;line-height:1.55;color:#55555c;"><div style="padding:14px 16px;background:#f2f7fb;border-left:4px solid #026cc2;border-radius:8px;">${escape(security)}</div></td></tr>
<tr><td style="padding:20px 28px;background:#f7f7f8;border-top:1px solid #e5e5e8;font-size:12px;line-height:1.5;color:#6a6a72;">${escape(footer)}</td></tr>
</table>
</td></tr></table>
</body></html>`
  return { subject: text(`${prefix}subject`), text: plain, html }
}
