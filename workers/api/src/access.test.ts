import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { AccessIdentity, makeAccessCertificateCache } from "./access.js"
import { dispatchAdmin } from "./admin.js"
import { WorkerEnvironment, type WorkerBindings } from "./environment.js"
import { failureResponse } from "./router.js"

const issuer = "https://admin-test.cloudflareaccess.com"
const audience = "admin-application-audience"
const subject = "18446744073709551615"
const expectedPrincipal = {
  id: subject, email: "owner@example.test", username: "owner@example.test",
  display_name: "Test Owner", role: "owner", active: true,
}
let keys: Awaited<ReturnType<typeof generateKeyPair>>
let publicKey: JWK
const fetchJwks = vi.fn<typeof fetch>()
let certificateCache = makeAccessCertificateCache()

beforeAll(async () => {
  keys = await generateKeyPair("RS256")
  publicKey = { ...await exportJWK(keys.publicKey), kid: "test-key", alg: "RS256", use: "sig" }
})
beforeEach(() => {
  certificateCache = makeAccessCertificateCache()
  fetchJwks.mockReset().mockImplementation(async (input) => {
    expect(String(input)).toBe(`${issuer}/cdn-cgi/access/certs`)
    return Response.json({ keys: [publicKey] })
  })
  // Every request is intercepted; these tests cannot call Cloudflare or any
  // other remote service. Signatures are still verified by the real jose code.
  vi.stubGlobal("fetch", fetchJwks)
})
afterEach(() => vi.unstubAllGlobals())

const bindings = (overrides: Partial<Pick<WorkerBindings, "ACCESS_TEAM_DOMAIN" | "ACCESS_AUDIENCE">> = {}) => ({
  ACCESS_TEAM_DOMAIN: "admin-test.cloudflareaccess.com", ACCESS_AUDIENCE: audience, ...overrides,
}) as WorkerBindings

const token = (claims: Readonly<Record<string, unknown>> = {}) => new SignJWT({
  iss: issuer, aud: [audience], sub: subject, email: "owner@example.test", name: "  Test Owner  ",
  exp: Math.floor(Date.now() / 1_000) + 300, ...claims,
}).setProtectedHeader({ alg: "RS256", kid: "test-key" }).sign(keys.privateKey)

const request = (assertion?: string, ajax = true) => new Request("https://api.clashk.ing/v2/admin/me", {
  headers: {
    ...(assertion === undefined ? {} : { "cf-access-jwt-assertion": assertion }),
    ...(ajax ? { "x-requested-with": "XMLHttpRequest" } : {}),
  },
})

const authenticate = (input: Request, env = bindings()) => Effect.gen(function* () {
  return yield* (yield* AccessIdentity).requireAdmin(input)
}).pipe(Effect.provide(AccessIdentity.layerWithCache(certificateCache)), Effect.provideService(WorkerEnvironment, env))

const response = (input: Request, env = bindings()) => Effect.runPromise(authenticate(input, env).pipe(
  Effect.match({ onSuccess: (principal) => Response.json(principal), onFailure: (failure) => failureResponse(failure, "auth-test") }),
))

describe("Admin Cloudflare Access baseline", () => {
  it("authenticates a signed identity with no SQL service and no invented profile fields", async () => {
    // This runs without providing SqlClient, so even acquiring that service
    // would fail the test before any SQL could be issued.
    expect(await Effect.runPromise(authenticate(request(await token())))).toEqual(expectedPrincipal)
    expect(fetchJwks).toHaveBeenCalledOnce()
  })

  it("encodes the real /me response without touching SQL or adding account dates", async () => {
    const sql = new Proxy(() => { throw new Error("Admin identity must not query SQL") }, {
      get() { throw new Error("Admin identity must not acquire SQL capabilities") },
    }) as unknown as SqlClient.SqlClient
    const result = await Effect.runPromise(dispatchAdmin(request(await token()), bindings()).pipe(
      Effect.provide(AccessIdentity.layerWithCache(certificateCache)), Effect.provideService(WorkerEnvironment, bindings()),
      Effect.provideService(SqlClient.SqlClient, sql),
    ))
    expect(result?.status).toBe(200)
    expect(result?.headers.get("cache-control")).toBe("no-store")
    expect(await result?.json()).toEqual(expectedPrincipal)
  })

  it.each([undefined, "", "   ", 123])("falls back to the email prefix for name %s", async (name) => {
    expect(await Effect.runPromise(authenticate(request(await token({ name }))))).toEqual({
      ...expectedPrincipal, display_name: "owner",
    })
  })

  it("does not derive a second role or an active-account gate from arbitrary identity claims", async () => {
    expect(await Effect.runPromise(authenticate(request(await token({ role: "admin", active: false }))))).toEqual(expectedPrincipal)
  })

  it.each(["admin-test.cloudflareaccess.com", `${issuer}/`, `  ${issuer}///  `])("normalizes the configured team domain %s", async (domain) => {
    expect((await response(request(await token()), bindings({ ACCESS_TEAM_DOMAIN: domain, ACCESS_AUDIENCE: ` ${audience} ` }))).status).toBe(200)
  })

  it.each([
    { ACCESS_TEAM_DOMAIN: "" }, { ACCESS_TEAM_DOMAIN: "   " },
    { ACCESS_AUDIENCE: "" }, { ACCESS_AUDIENCE: "   " },
  ])("fails closed with 503 for missing Access configuration %j", async (config) => {
    const result = await response(request(), bindings(config))
    expect(result.status).toBe(503)
    expect(await result.json()).toMatchObject({ message: "Cloudflare Access verification is not configured" })
    expect(fetchJwks).not.toHaveBeenCalled()
  })

  it.each([undefined, "", "   "])("returns 401 for missing assertion %s", async (assertion) => {
    expect((await response(request(assertion))).status).toBe(401)
    expect(fetchJwks).not.toHaveBeenCalled()
  })

  it("requires the AJAX header even when the signed assertion is valid", async () => {
    const result = await response(request(await token(), false))
    expect(result.status).toBe(403)
    expect(await result.json()).toMatchObject({ message: "Admin requests require the AJAX request header" })
    expect(fetchJwks).not.toHaveBeenCalled()
  })

  it.each([
    ["expired", { exp: 1 }],
    ["not yet valid", { nbf: Math.floor(Date.now() / 1_000) + 3_600 }],
    ["wrong issuer", { iss: "https://another-team.cloudflareaccess.com" }],
    ["wrong audience", { aud: "another-application" }],
    ["missing issuer", { iss: undefined }],
    ["missing audience", { aud: undefined }],
  ] satisfies ReadonlyArray<readonly [string, Readonly<Record<string, unknown>>]>)("rejects a signed token with %s", async (_label, claims) => {
    const result = await response(request(await token(claims)))
    expect(result.status).toBe(403)
    expect(await result.json()).toMatchObject({ message: "Cloudflare Access assertion is invalid" })
  })

  it.each([
    ["missing subject", { sub: undefined }], ["empty subject", { sub: "" }],
    ["missing email", { email: undefined }], ["empty email", { email: "" }],
    ["non-string email", { email: 123 }],
  ] satisfies ReadonlyArray<readonly [string, Readonly<Record<string, unknown>>]>)("rejects an incomplete identity with %s", async (_label, claims) => {
    const result = await response(request(await token(claims)))
    expect(result.status).toBe(403)
    expect(await result.json()).toMatchObject({ message: "Cloudflare Access identity is incomplete" })
  })

  it("rejects a token signed by an untrusted key", async () => {
    const otherKeys = await generateKeyPair("RS256")
    const assertion = await new SignJWT({ iss: issuer, aud: audience, sub: subject, email: "owner@example.test" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" }).sign(otherKeys.privateKey)
    expect((await response(request(assertion))).status).toBe(403)
  })

  it("rejects a valid ES256 signature even when its key is in JWKS", async () => {
    const ecKeys = await generateKeyPair("ES256")
    fetchJwks.mockResolvedValue(Response.json({ keys: [{ ...await exportJWK(ecKeys.publicKey), kid: "ec-key", alg: "ES256" }] }))
    const assertion = await new SignJWT({ iss: issuer, aud: audience, sub: subject, email: "owner@example.test" })
      .setProtectedHeader({ alg: "ES256", kid: "ec-key" }).sign(ecKeys.privateKey)
    expect((await response(request(assertion))).status).toBe(403)
    expect(fetchJwks).not.toHaveBeenCalled()
  })

  it.each(["not-a-jwt", "eyJhbGciOiJub25lIn0.e30."])("rejects malformed or unsigned assertion %s", async (assertion) => {
    expect((await response(request(assertion))).status).toBe(403)
    expect(fetchJwks).not.toHaveBeenCalled()
  })

  it("fails closed if signing keys cannot be retrieved", async () => {
    fetchJwks.mockRejectedValue(new Error("JWKS is unavailable"))
    expect((await response(request(await token()))).status).toBe(503)
  })

  it("reuses public certificates across separately built request layers", async () => {
    expect((await response(request(await token()))).status).toBe(200)
    expect((await response(request(await token()))).status).toBe(200)
    expect(fetchJwks).toHaveBeenCalledOnce()
  })
})
