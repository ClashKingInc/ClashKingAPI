import { execFileSync } from "node:child_process"
import { randomBytes } from "node:crypto"

const service = "ing.clashking.effect-rewrite.local-api"
const account = "local-signing-and-encryption-v1"
const discordAccount = "discord-oauth-v1"
const betaDiscordAccount = "discord-beta-oauth-v1"
export const betaDiscordApplicationId = "808566437199216691"
export const localSecretNames = ["DATA_ENCRYPTION_KEY", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "API_BOT_TOKEN", "AI_USAGE_SECRET", "STRIPE_WEBHOOK_SECRET"]
export function loadLocalApiSecrets({ environment = process.env, platform = process.platform } = {}) {
  const explicit = Object.fromEntries(localSecretNames.map(name => [name, environment[`CLASHKING_LOCAL_${name}`]]))
  if (localSecretNames.some(name => explicit[name] !== undefined)) {
    if (localSecretNames.some(name => typeof explicit[name] !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(explicit[name]))) {
      throw new Error("Provide a complete valid CLASHKING_LOCAL_ stable keyset; refusing partial keys or automatic rotation")
    }
    return explicit
  }
  if (platform !== "darwin") throw new Error("Provide the complete stable CLASHKING_LOCAL_ keyset on this platform; never regenerate keys for an existing database")
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

export function loadLocalDiscordCredentials({ environment = process.env, platform = process.platform } = {}) {
  const explicit = {
    clientId: environment.CLASHKING_LOCAL_DISCORD_CLIENT_ID,
    clientSecret: environment.CLASHKING_LOCAL_DISCORD_CLIENT_SECRET,
    botToken: environment.CLASHKING_LOCAL_DISCORD_BOT_TOKEN ?? "",
  }
  if (explicit.clientId !== undefined || explicit.clientSecret !== undefined) {
    if (!/^\d+$/u.test(explicit.clientId ?? "") || (explicit.clientSecret ?? "").length === 0) {
      throw new Error("Provide both valid CLASHKING_LOCAL_DISCORD client credentials")
    }
    return explicit
  }
  if (platform !== "darwin") throw new Error("Provide the local Discord client credentials on this platform")
  let value
  try {
    value = execFileSync("/usr/bin/security", ["find-generic-password", "-s", service, "-a", discordAccount, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
  } catch {
    throw new Error("Local Discord credentials are missing from Keychain")
  }
  let credentials
  try { credentials = JSON.parse(value) }
  catch { throw new Error("Invalid local Discord Keychain item") }
  if (!/^\d+$/u.test(credentials?.clientId ?? "") || typeof credentials?.clientSecret !== "string" || credentials.clientSecret.length === 0 ||
      typeof (credentials.botToken ?? "") !== "string") throw new Error("Invalid local Discord Keychain item")
  return { clientId: credentials.clientId, clientSecret: credentials.clientSecret, botToken: credentials.botToken ?? "" }
}

export function loadLocalBetaDiscordCredentials({ environment = process.env, platform = process.platform } = {}) {
  const explicit = {
    clientId: environment.CLASHKING_LOCAL_BETA_DISCORD_CLIENT_ID,
    clientSecret: environment.CLASHKING_LOCAL_BETA_DISCORD_CLIENT_SECRET,
    botToken: environment.CLASHKING_LOCAL_BETA_DISCORD_BOT_TOKEN,
  }
  if (Object.values(explicit).some((value) => value !== undefined)) {
    if (explicit.clientId !== betaDiscordApplicationId || !(explicit.clientSecret ?? "").trim() || !(explicit.botToken ?? "").trim()) {
      throw new Error(`Provide the complete beta Discord credential set for application ${betaDiscordApplicationId}`)
    }
    return explicit
  }
  if (platform !== "darwin") throw new Error("Provide the complete beta Discord credential set on this platform")
  let value
  try {
    value = execFileSync("/usr/bin/security", ["find-generic-password", "-s", service, "-a", betaDiscordAccount, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
  } catch {
    throw new Error(`Beta Discord credentials are missing from Keychain account ${betaDiscordAccount}; production credentials will not be used`)
  }
  let credentials
  try { credentials = JSON.parse(value) }
  catch { throw new Error("Invalid beta Discord Keychain item") }
  if (credentials?.clientId !== betaDiscordApplicationId || typeof credentials?.clientSecret !== "string" || !credentials.clientSecret.trim() ||
      typeof credentials?.botToken !== "string" || !credentials.botToken.trim()) throw new Error("Invalid beta Discord Keychain item")
  return { clientId: credentials.clientId, clientSecret: credentials.clientSecret, botToken: credentials.botToken }
}
