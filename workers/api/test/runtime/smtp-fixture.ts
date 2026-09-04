import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { createServer, type Socket } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createSecureContext, TLSSocket } from "node:tls"

/** Local-only fake SMTP server. It never forwards or delivers a message. */
export type SmtpFixtureMode = "starttls" | "bare" | "reject-tls" | "stall" | "stall-tls" | "oversized" | "oversized-tls" | "multiline-tls"
export async function smtpFixture(mode: SmtpFixtureMode = "starttls") {
  const directory = mkdtempSync(join(tmpdir(), "clashking-smtp-fixture-"))
  try {
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(directory, "key.pem"),
      "-out", join(directory, "cert.pem"), "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost"], { stdio: "ignore" })
    const key = readFileSync(join(directory, "key.pem")), cert = readFileSync(join(directory, "cert.pem"))
    const context = createSecureContext({ key, cert, minVersion: "TLSv1.2" })
    const commands: { verb: string; secure: boolean }[] = []
    const messages: string[] = []
    const sockets = new Set<Socket>()
    const attach = (socket: Socket, secure: boolean) => {
      sockets.add(socket)
      socket.on("close", () => sockets.delete(socket))
      socket.on("error", () => { /* expected on rejected or canceled TLS */ })
      let buffer = "", data = false, authStep = 0
      const receive = (chunk: Buffer) => {
        buffer += chunk.toString("utf8")
        if (buffer.length > 1024 * 1024) { socket.destroy(); return }
        while (true) {
          if (data) {
            const end = buffer.indexOf("\r\n.\r\n")
            if (end < 0) return
            messages.push(buffer.slice(0, end))
            buffer = buffer.slice(end + 5)
            data = false
            socket.write("250 accepted by test fixture\r\n")
            continue
          }
          const end = buffer.indexOf("\r\n")
          if (end < 0) return
          const line = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          if (authStep) {
            socket.write(authStep === 1 ? (mode === "bare" ? "334\r\n" : "334 UGFzc3dvcmQ6\r\n") : "235 authenticated\r\n")
            authStep = authStep === 1 ? 2 : 0
            continue
          }
          const verb = line.split(" ")[0]!.toUpperCase()
          // Never retain AUTH's credential payload, even in test diagnostics.
          commands.push({ verb, secure })
          if (verb === "EHLO") {
            if (secure && mode === "stall-tls") continue
            if (secure && mode === "oversized-tls") { socket.write("250-" + "x".repeat(20_000)); continue }
            if (secure && mode === "multiline-tls") { socket.write(("250-" + "x".repeat(500) + "\r\n").repeat(40)); continue }
            socket.write(secure ? "250-local.test\r\n250 AUTH PLAIN\r\n" : "250-local.test\r\n250-STARTTLS\r\n250 AUTH PLAIN\r\n")
          }
          else if (verb === "STARTTLS") {
            if (mode === "reject-tls") { socket.write("454 TLS unavailable\r\n"); continue }
            socket.write("220 Begin TLS\r\n")
            socket.removeListener("data", receive)
            attach(new TLSSocket(socket, { isServer: true, secureContext: context }), true)
            return
          } else if (verb === "AUTH") {
            if (line.startsWith("AUTH PLAIN ")) socket.write(secure ? "235 authenticated\r\n" : "535 TLS required\r\n")
            else { authStep = secure ? 1 : 0; socket.write(secure ? "334 VXNlcm5hbWU6\r\n" : "535 TLS required\r\n") }
          }
          else if (verb === "MAIL" || verb === "RCPT") socket.write(mode === "bare" ? "250\r\n" : "250 ok\r\n")
          else if (verb === "DATA") { data = true; socket.write("354 Send test message\r\n") }
          else if (verb === "QUIT") { socket.end("221 goodbye\r\n"); return }
          else socket.write("500 unknown command\r\n")
        }
      }
      socket.on("data", receive)
    }
    const server = createServer((socket) => {
      attach(socket, false)
      if (mode === "oversized") socket.write("220 " + "x".repeat(20_000))
      else if (mode !== "stall") socket.write("220 local.test fixture SMTP\r\n")
    })
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve) })
    const address = server.address()
    if (address === null || typeof address === "string") throw new Error("SMTP fixture did not bind a loopback port")
    return { port: address.port, cert: cert.toString(), commands, messages, sockets,
      close: async () => {
        for (const socket of sockets) socket.destroy()
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
        rmSync(directory, { recursive: true, force: true })
      },
    }
  } catch (error) { rmSync(directory, { recursive: true, force: true }); throw error }
}
