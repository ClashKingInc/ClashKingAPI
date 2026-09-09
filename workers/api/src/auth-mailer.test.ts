import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { renderAuthEmail, sendSmtp, smtpOptions } from "./auth-mailer.js"
import { smtpFixture } from "../test/runtime/smtp-fixture.js"

const env = { SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "587", SMTP_STARTTLS: "true", SMTP_SSL_TLS: "false",
  SMTP_USERNAME: "fixture-user", SMTP_PASSWORD: "fixture-password", SMTP_FROM_ADDRESS: "noreply@example.test", SMTP_REPLY_TO_ADDRESS: "noreply@example.test" }
const message = { from: "noreply@example.test", to: "reader@example.test", subject: "Fixture", text: "No real mail. Code 123456." }

describe("auth SMTP security and template parity", () => {
  it("requires TLS and valid configuration, with bounded socket timeouts and disabled file/URL content", async () => {
    const options = await Effect.runPromise(smtpOptions(env))
    expect(options).toMatchObject({ port: 587, secure: false, requireTLS: true, ignoreTLS: false,
      tls: { minVersion: "TLSv1.2", rejectUnauthorized: true }, connectionTimeout: 10_000, socketTimeout: 20_000,
      disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false })
    for (const invalid of [{ SMTP_PORT: "25" }, { SMTP_PORT: "NaN" }, { SMTP_USERNAME: "" }, { SMTP_STARTTLS: "false" }, { SMTP_SSL_TLS: "true" }]) {
      await expect(Effect.runPromise(smtpOptions({ ...env, ...invalid }))).rejects.toMatchObject({ _tag: "UpstreamUnavailable" })
    }
  })

  it("uses the shared catalog and escapes untrusted names", () => {
    for (const kind of ["verification", "password_reset"] as const) {
      const output = renderAuthEmail({ kind, recipient: "reader@example.test", username: '<script>alert("x")</script>', code: "123456", locale: "unsupported" })
      expect(output.html).toContain("&lt;script&gt;")
      expect(output.html).not.toContain("<script>")
      expect(output.html).toContain('<html lang="en">')
      expect(output.html).toContain('role="presentation"')
      expect(output.html).toContain("https://assets.clashk.ing/logos/crown-arrow-dark-bg/ClashKing-1.png")
      expect(output.text).toContain("Code: 123456")
    }
  })

  it("performs STARTTLS before AUTH and writes MIME only to a local test server", async () => {
    const fixture = await smtpFixture()
    try {
      const options = await Effect.runPromise(smtpOptions({ ...env, SMTP_HOST: "127.0.0.1", SMTP_PORT: String(fixture.port) }))
      await sendSmtp({ ...options, tls: { ...options.tls, servername: "localhost", ca: fixture.cert } }, message, new AbortController().signal)
      expect(fixture.commands.some((entry) => entry.verb === "STARTTLS" && !entry.secure)).toBe(true)
      expect(fixture.commands.filter((entry) => entry.verb === "AUTH")).toEqual([{ verb: "AUTH", secure: true }])
      expect(fixture.messages).toHaveLength(1)
      expect(fixture.messages[0]).toContain("Code 123456")
    } finally { await fixture.close() }
  })

  it("never transmits credentials if STARTTLS is rejected or the certificate is untrusted", async () => {
    for (const mode of ["reject-tls", "starttls"] as const) {
      const fixture = await smtpFixture(mode)
      try {
        const options = await Effect.runPromise(smtpOptions({ ...env, SMTP_HOST: "127.0.0.1", SMTP_PORT: String(fixture.port) }))
        await expect(sendSmtp({ ...options, tls: { ...options.tls, servername: "localhost" } }, message, new AbortController().signal)).rejects.toBeDefined()
        expect(fixture.commands.some((entry) => entry.verb === "AUTH")).toBe(false)
        expect(fixture.messages).toHaveLength(0)
      } finally { await fixture.close() }
    }
  })

  it("closes a stalled request-scoped socket on cancellation", async () => {
    const fixture = await smtpFixture("stall")
    try {
      const controller = new AbortController()
      const options = await Effect.runPromise(smtpOptions({ ...env, SMTP_HOST: "127.0.0.1", SMTP_PORT: String(fixture.port) }))
      const pending = sendSmtp(options, message, controller.signal)
      const rejected = expect(pending).rejects.toBeDefined()
      while (fixture.sockets.size === 0) await new Promise((resolve) => setTimeout(resolve, 5))
      controller.abort()
      await rejected
      expect(fixture.commands).toHaveLength(0)
    } finally { await fixture.close() }
  })
})
