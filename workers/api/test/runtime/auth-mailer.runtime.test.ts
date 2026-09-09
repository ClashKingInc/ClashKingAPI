import { build } from "esbuild"
import { fileURLToPath } from "node:url"
import { Miniflare, Runtime, convertV4MiniflareOptions, serializeConfig } from "miniflare"
import { expect, it } from "vitest"
import { smtpFixture, type SmtpFixtureMode } from "./smtp-fixture.js"

it("builds a multipart auth email with Nodemailer inside workerd without sending it", async () => {
  const result = await build({ stdin: { contents: `
    import nodemailer from "nodemailer";
    export default { async fetch() {
      const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "windows" });
      const message = await transport.sendMail({ from: "noreply@example.test", to: "reader@example.test",
        subject: "ClashKing fixture", text: "Test code: 123456", html: "<p>Test code: 123456</p>" });
      transport.close();
      return new Response(message.message.toString());
    }};
  `, resolveDir: fileURLToPath(new URL("../../../../", import.meta.url)) },
  bundle: true, write: false, format: "esm", platform: "node",
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire("/auth-runtime/index.js");' } })
  const script = result.outputFiles[0]?.text
  if (!script) throw new Error("Auth mailer test bundle missing")
  const runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script,
    compatibilityDate: "2026-08-22", compatibilityFlags: ["nodejs_compat"],
  }))
  try {
    const response = await runtime.dispatchFetch("https://auth-mailer.test")
    expect(response.status).toBe(200)
    const mime = await response.text()
    expect(mime).toContain("multipart/alternative")
    expect(mime).toContain("text/plain")
    expect(mime).toContain("text/html")
    expect(mime).toContain("123456")
  } finally { await runtime.dispose() }
}, 30_000)

it.each([
  { mode: "starttls", trusted: true }, { mode: "starttls", trusted: false }, { mode: "bare", trusted: true },
  { mode: "reject-tls", trusted: true }, { mode: "oversized", trusted: true },
  { mode: "oversized-tls", trusted: true }, { mode: "multiline-tls", trusted: true },
  { mode: "stall", trusted: true }, { mode: "stall-tls", trusted: true },
] satisfies { mode: SmtpFixtureMode; trusted: boolean }[])("bounds actual workerd SMTP: $mode, trusted=$trusted", async ({ mode, trusted }) => {
  const fixture = await smtpFixture(mode)
  const runtime = new Runtime()
  try {
    const result = await build({ stdin: { contents: `
      import { sendSmtp } from "./workers/api/src/auth-mailer.ts";
      export default { async fetch() {
        try {
          await sendSmtp({ host: "127.0.0.1", port: ${fixture.port}, secure: false, requireTLS: true,
            ignoreTLS: false, auth: { user: "fixture-user", pass: "fixture-password" },
            tls: { servername: "localhost", minVersion: "TLSv1.2", rejectUnauthorized: true },
            connectionTimeout: 3000, greetingTimeout: 3000, socketTimeout: 3000,
            disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false
          }, { from: "noreply@example.test", to: "reader@example.test", subject: "Fixture", text: "Local-only 123456" }, AbortSignal.timeout(${mode.startsWith("stall") ? 200 : 5000}));
          return new Response("accepted");
        } catch (error) { return new Response(String(error), {status: 503}); }
      }};
    `, resolveDir: fileURLToPath(new URL("../../../../", import.meta.url)) }, bundle: true, write: false, format: "esm", platform: "node",
    banner: { js: 'import { createRequire } from "node:module"; const require = createRequire("/auth-runtime/index.js");' } })
    // Miniflare5's default JS outbound proxy cannot upgrade TLS. Exercise
    // workerd directly with its native network service and a test-only CA.
    const ports = await runtime.updateConfig(serializeConfig({ services: [
      { name: "auth", worker: { modules: [{ name: "index.js", esModule: result.outputFiles[0]!.text }],
        compatibilityDate: "2026-08-22", globalOutbound: { name: "test-network" } } },
      { name: "test-network", network: { allow: ["local"], tlsOptions: { trustedCertificates: trusted ? [fixture.cert] : [], trustBrowserCas: false } } },
      { name: "loopback", external: { address: "127.0.0.1:9", http: {} } },
    ], sockets: [{ name: "entry", address: "127.0.0.1:0", http: {}, service: { name: "auth" } }] }),
    { entryAddress: "127.0.0.1:0", loopbackAddress: "127.0.0.1:9", requiredSockets: ["entry"] }, ["auth"], new AbortController().signal)
    const port = ports?.get("entry")
    if (!port) throw new Error("workerd auth fixture did not start")
    const response = await fetch(`http://127.0.0.1:${port}`)
    const body = await response.text()
    if (["starttls", "bare"].includes(mode) && trusted) {
      expect(body).toBe("accepted")
      expect(response.status).toBe(200)
      expect(fixture.commands.filter((entry) => entry.verb === "AUTH")).toEqual([{ verb: "AUTH", secure: true }])
      expect(fixture.messages).toHaveLength(1)
    } else {
      expect(response.status).toBe(503)
      expect(body).not.toContain("fixture-password")
      expect(fixture.commands.some((entry) => entry.verb === "AUTH")).toBe(false)
      expect(fixture.messages).toHaveLength(0)
    }
    if (["oversized-tls", "multiline-tls", "stall-tls"].includes(mode)) expect(fixture.commands.some((entry) => entry.verb === "EHLO" && entry.secure)).toBe(true)
    for (let attempt = 0; fixture.sockets.size && attempt < 100; attempt++) await new Promise((resolve) => setTimeout(resolve, 5))
    expect(fixture.sockets.size).toBe(0)
  } finally { await runtime.dispose(); await fixture.close() }
}, 30_000)
