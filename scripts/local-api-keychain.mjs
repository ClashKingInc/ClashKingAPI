import { execFileSync } from "node:child_process"
import { randomBytes } from "node:crypto"

const service = "ing.clashking.effect-rewrite.local-api"
const account = "local-signing-and-encryption-v1"
export const localSecretNames = ["DATA_ENCRYPTION_KEY", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "API_BOT_TOKEN", "AI_USAGE_SECRET", "STRIPE_WEBHOOK_SECRET"]
export function loadLocalApiSecrets() {
  if (process.platform !== "darwin") throw new Error("Persistent local API secrets require macOS Keychain")
  let value
  try {
    value = execFileSync("/usr/bin/security", ["find-generic-password", "-s", service, "-a", account, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
  } catch (error) {
    // Never regenerate on a locked/denied Keychain: that would orphan tokens.
    if (error.status !== 44) throw new Error("Cannot read local API Keychain item; unlock/allow Keychain access, do not rotate it")
    const generated = Object.fromEntries(localSecretNames.map((name) => [name, randomBytes(32).toString("base64url")]))
    value = JSON.stringify(generated)
    try {
      execFileSync("/usr/bin/security", ["add-generic-password", "-s", service, "-a", account, "-w", value], { stdio: "ignore" })
    } catch {
      throw new Error("Could not create local API Keychain item; no secrets were written to files")
    }
  }
  let secrets
  try { secrets = JSON.parse(value) }
  catch { throw new Error("Invalid local API Keychain item; refusing to replace it") }
  if (secrets === null || typeof secrets !== "object" || localSecretNames.some((name) => typeof secrets[name] !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(secrets[name]))) {
    throw new Error("Invalid local API Keychain item; refusing to replace it")
  }
  return Object.fromEntries(localSecretNames.map((name) => [name, secrets[name]]))
}
