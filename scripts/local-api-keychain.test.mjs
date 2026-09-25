import assert from "node:assert/strict"
import test from "node:test"
import { betaDiscordApplicationId, loadLocalApiSecrets, loadLocalBetaDiscordCredentials, loadLocalDiscordCredentials, localSecretNames } from "./local-api-keychain.mjs"

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

test("beta Discord credentials require the exact beta application and a complete isolated set", () => {
  const environment = {
    CLASHKING_LOCAL_BETA_DISCORD_CLIENT_ID: betaDiscordApplicationId,
    CLASHKING_LOCAL_BETA_DISCORD_CLIENT_SECRET: "beta-secret",
    CLASHKING_LOCAL_BETA_DISCORD_BOT_TOKEN: "beta-token",
  }
  assert.deepEqual(loadLocalBetaDiscordCredentials({ platform: "linux", environment }), {
    clientId: betaDiscordApplicationId, clientSecret: "beta-secret", botToken: "beta-token",
  })
  assert.throws(() => loadLocalBetaDiscordCredentials({ platform: "linux", environment: {
    ...environment, CLASHKING_LOCAL_BETA_DISCORD_CLIENT_ID: "824653933347209227",
  } }), /complete beta Discord credential set/u)
  assert.throws(() => loadLocalBetaDiscordCredentials({ platform: "linux", environment: {
    ...environment, CLASHKING_LOCAL_BETA_DISCORD_CLIENT_SECRET: "",
  } }), /complete beta Discord credential set/u)
  assert.throws(() => loadLocalBetaDiscordCredentials({ platform: "linux", environment: {} }), /complete beta Discord credential set/u)
})
