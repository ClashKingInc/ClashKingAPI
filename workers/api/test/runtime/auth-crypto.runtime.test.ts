import { build } from "esbuild"
import { fileURLToPath } from "node:url"
import { Miniflare, convertV4MiniflareOptions } from "miniflare"
import { expect, it } from "vitest"

it("runs Go-compatible bcrypt, hashes and native/web JWT issuance inside workerd", async () => {
  const result = await build({ stdin: { contents: `
    import { Effect } from "effect";
    import { AuthCrypto } from "./workers/api/src/auth-crypto.ts";
    import { WorkerEnvironment } from "./workers/api/src/environment.ts";
    export default { async fetch() {
      const checks = await Effect.runPromise(Effect.gen(function* () {
        const auth = yield* AuthCrypto;
        const email = yield* auth.emailHash(" Reader@Example.test ");
        const codeHash = yield* auth.codeHash(email, "123456");
        const goHash = "$2a$10$4ki3HNn3zbKTEbQcXfa2julN2at/N6GYDAC/euGLXYV2Cp.X3sNzW";
        const correct = yield* auth.passwordMatches("FixturePassword1", goHash);
        const incorrect = yield* auth.passwordMatches("WrongPassword1", goHash);
        const freshHash = yield* auth.passwordHash("FixturePassword1");
        const freshMatches = yield* auth.passwordMatches("FixturePassword1", freshHash);
        const native = yield* auth.issue("fixture-user", "phone", "native");
        const web = yield* auth.issue("fixture-user", "browser", "web");
        const nativeClaims = yield* auth.verifyRefresh(native.refresh_token, "native");
        const webClaims = yield* auth.verifyRefresh(web.refresh_token, "web");
        const wrongAudience = yield* auth.verifyRefresh(web.refresh_token, "native").pipe(Effect.result);
        return { email, codeHash, correct, incorrect, freshMatches,
          nativeDevice: nativeClaims.deviceId, webDevice: webClaims.deviceId,
          wrongAudienceRejected: wrongAudience._tag === "Failure",
          randomCode: /^[1-9][0-9]{5}$/.test(yield* auth.verificationCode()) };
      }).pipe(Effect.provide(AuthCrypto.layer), Effect.provideService(WorkerEnvironment, {
        JWT_ACCESS_SECRET: "fixture-access-secret", JWT_REFRESH_SECRET: "fixture-refresh-secret",
        NATIVE_TOKEN_AUDIENCE: "fixture-native", WEB_TOKEN_AUDIENCE: "fixture-web"
      })));
      return Response.json(checks);
    }};
  `, resolveDir: fileURLToPath(new URL("../../../../", import.meta.url)) },
  bundle: true, write: false, format: "esm", platform: "browser", external: ["node:crypto"] })
  const script = result.outputFiles[0]?.text
  if (!script) throw new Error("Auth test bundle missing")
  const runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script,
    compatibilityDate: "2026-08-22", compatibilityFlags: ["nodejs_compat"],
  }))
  try {
    const response = await runtime.dispatchFetch("https://auth.test")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      email: "d51be5d1c65bdefbdb90610bf4e28b65a81a32cd95321ace83aae5c05f26edae",
      codeHash: "dfe421c3e281cc04c9f9994ea64a256fe911ac2237c56fb7bee3e0af78330742",
      correct: true, incorrect: false, freshMatches: true, nativeDevice: "phone", webDevice: "browser",
      wrongAudienceRejected: true, randomCode: true,
    })
  } finally { await runtime.dispose() }
}, 30_000)
