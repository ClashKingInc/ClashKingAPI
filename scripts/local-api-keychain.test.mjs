import assert from "node:assert/strict"
import test from "node:test"
import { loadLocalApiSecrets, loadLocalDiscordCredentials, localSecretNames } from "./local-api-keychain.mjs"

test("explicit complete stable local keys work without a platform keychain", () => {
  const environment = Object.fromEntries(localSecretNames.map(name => [`CLASHKING_LOCAL_${name}`, "a".repeat(43)]))
  const result = loadLocalApiSecrets({ environment, platform: "linux" })
  assert.deepEqual(result, Object.fromEntries(localSecretNames.map(name => [name, "a".repeat(43)])))
})

test("partial or invalid explicit local keys fail without rotating or falling back", () => {
  assert.throws(() => loadLocalApiSecrets({ environment: { CLASHKING_LOCAL_API_BOT_TOKEN: "a".repeat(43) }, platform: "linux" }), /complete valid/u)
  const environment = Object.fromEntries(localSecretNames.map(name => [`CLASHKING_LOCAL_${name}`, "invalid"]))
  assert.throws(() => loadLocalApiSecrets({ environment, platform: "linux" }), /complete valid/u)
})

test("non-Mac setup without explicit keys explains the required stable keyset", () => {
  assert.throws(() => loadLocalApiSecrets({ environment: {}, platform: "linux" }), /CLASHKING_LOCAL_/u)
})

test("explicit Discord OAuth credentials work without a platform keychain", () => {
  assert.deepEqual(loadLocalDiscordCredentials({ platform: "linux", environment: {
    CLASHKING_LOCAL_DISCORD_CLIENT_ID: "123456789",
    CLASHKING_LOCAL_DISCORD_CLIENT_SECRET: "secret",
  } }), { clientId: "123456789", clientSecret: "secret", botToken: "" })
  assert.throws(() => loadLocalDiscordCredentials({ platform: "linux", environment: {
    CLASHKING_LOCAL_DISCORD_CLIENT_ID: "123456789",
  } }), /both valid/u)
})
