import {
  adminEndpoints,
  BillingStripeWebhookEndpoint,
  defineEndpoint,
  NoContent,
  NoPathParams,
  type AdminUser,
  type Post,
} from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest"

import {
  buildEndpointUrl,
  createAdminApiClient,
  createBrowserApiClient,
  createApiClient,
  httpTransport,
  MAX_RESPONSE_BYTES,
  serviceBindingTransport,
  type ApiClientError,
  withUnauthorizedRefresh,
} from "./index.js"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("portable cancellation", () => {
  const input = { path: { id: "00000000-0000-4000-8000-000000000000" }, query: {}, body: {} }

  it("aborts the HTTP fetch when its Effect fiber is interrupted", async () => {
    let started!: () => void
    const fetchStarted = new Promise<void>((resolve) => { started = resolve })
    let fetchSignal: AbortSignal | undefined
    const client = createApiClient({
      transport: httpTransport((request) => {
        fetchSignal = request.signal
        started()
        return new Promise((_resolve, reject) => {
          request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true })
        })
      }),
    })
    const interruption = new AbortController()
    const pending = Effect.runPromise(
      client.execute(adminEndpoints.archivePost, input),
      { signal: interruption.signal },
    ).catch(() => undefined)

    await fetchStarted
    interruption.abort(new Error("Fiber interrupted"))
    await pending

    expect(fetchSignal?.aborted).toBe(true)
    expect(fetchSignal?.reason).toMatchObject({ name: "AbortError" })
  })

  it("aborts a service-binding fetch when its Effect fiber is interrupted", async () => {
    let started!: () => void
    const fetchStarted = new Promise<void>((resolve) => { started = resolve })
    let fetchSignal: AbortSignal | undefined
    const client = createApiClient({
      transport: serviceBindingTransport({
        fetch: (request) => {
          fetchSignal = request.signal
          started()
          return new Promise((_resolve, reject) => {
            request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true })
          })
        },
      }),
    })
    const interruption = new AbortController()
    const pending = Effect.runPromise(
      client.execute(adminEndpoints.archivePost, input),
      { signal: interruption.signal },
    ).catch(() => undefined)

    await fetchStarted
    interruption.abort(new Error("Fiber interrupted"))
    await pending

    expect(fetchSignal?.aborted).toBe(true)
    expect(fetchSignal?.reason).toMatchObject({ name: "AbortError" })
  })

  it("preserves explicit caller cancellation through the HTTP interruption bridge", async () => {
    const caller = new AbortController()
    let fetchStarted!: () => void
    const started = new Promise<void>((resolve) => { fetchStarted = resolve })
    let fetchSignal: AbortSignal | undefined
    const client = createApiClient({
      transport: httpTransport((request) => {
        fetchSignal = request.signal
        fetchStarted()
        return new Promise((_resolve, reject) => {
          request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true })
        })
      }),
    })
    const reason = new Error("Caller cancelled")
    const pending = Effect.runPromise(
      client.execute(adminEndpoints.archivePost, input, { signal: caller.signal }),
    ).catch(() => undefined)

    await started
    caller.abort(reason)
    await pending

    expect(fetchSignal?.aborted).toBe(true)
    expect(fetchSignal?.reason).toBe(reason)
  })

  it("works without AbortSignal static methods and cleans up timers and listeners", async () => {
    vi.useFakeTimers()
    const caller = new AbortController()
    const remove = vi.spyOn(caller.signal, "removeEventListener")
    vi.stubGlobal("AbortSignal", class {})
    const client = createApiClient({ transport: serviceBindingTransport({
      fetch: async () => new Response(null, { status: 204 }),
    }) })
    await Effect.runPromise(client.execute(adminEndpoints.archivePost, input, { signal: caller.signal, timeoutMs: 15_000 }))
    expect(vi.getTimerCount()).toBe(0)
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function))
  })

  it("aborts a timed-out request without AbortSignal.timeout", async () => {
    vi.useFakeTimers()
    vi.stubGlobal("AbortSignal", class {})
    const client = createApiClient({ transport: serviceBindingTransport({
      fetch: (request) => new Promise((_resolve, reject) => {
        request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true })
      }),
    }) })
    const pending = Effect.runPromise(client.execute(adminEndpoints.archivePost, input, { timeoutMs: 100 }))
    const assertion = expect(pending).rejects.toMatchObject({ _tag: "TransportError", cause: { name: "TimeoutError" } })
    await vi.advanceTimersByTimeAsync(100)
    await assertion
    expect(vi.getTimerCount()).toBe(0)
  })

  it("forwards caller cancellation and clears the remaining timeout", async () => {
    vi.useFakeTimers()
    const caller = new AbortController()
    const client = createApiClient({ transport: serviceBindingTransport({
      fetch: (request) => new Promise((_resolve, reject) => {
        request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true })
      }),
    }) })
    const pending = Effect.runPromise(client.execute(adminEndpoints.archivePost, input, { signal: caller.signal, timeoutMs: 15_000 }))
    const assertion = expect(pending).rejects.toMatchObject({ _tag: "TransportError" })
    await vi.advanceTimersByTimeAsync(0)
    caller.abort(new Error("Caller cancelled"))
    await assertion
    expect(vi.getTimerCount()).toBe(0)
  })

  it("applies and permits overriding a default timeout for service bindings", async () => {
    vi.useFakeTimers()
    const client = createApiClient({
      defaultTimeoutMs: 1_000,
      transport: serviceBindingTransport({
        fetch: (request) => new Promise((_resolve, reject) => {
          request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true })
        }),
      }),
    })
    const pending = Effect.runPromise(client.execute(adminEndpoints.archivePost, input, { timeoutMs: 25 }))
    const assertion = expect(pending).rejects.toMatchObject({ _tag: "TransportError", cause: { name: "TimeoutError" } })

    await vi.advanceTimersByTimeAsync(25)
    await assertion
    expect(vi.getTimerCount()).toBe(0)
  })

  it("applies a default timeout to the HTTP transport", async () => {
    vi.useFakeTimers()
    const client = createAdminApiClient({
      defaultTimeoutMs: 25,
      fetcher: (request) => new Promise((_resolve, reject) => {
        request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true })
      }),
    })
    const pending = Effect.runPromise(client.execute(adminEndpoints.archivePost, input))
    const assertion = expect(pending).rejects.toMatchObject({ _tag: "TransportError", cause: { name: "TimeoutError" } })

    await vi.advanceTimersByTimeAsync(25)
    await assertion
    expect(vi.getTimerCount()).toBe(0)
  })

  it("rejects an invalid default timeout when the client is configured", () => {
    expect(() => createApiClient({
      defaultTimeoutMs: 0,
      transport: serviceBindingTransport({ fetch: async () => new Response() }),
    })).toThrow("defaultTimeoutMs must be a positive finite timer duration")
  })
})

describe("buildEndpointUrl", () => {
  it("encodes path parameters and repeated query values centrally", () => {
    const url = buildEndpointUrl(
      "https://api.clashk.ing",
      "/v2/admin/flags/:key",
      { key: "space/slash" },
      { platform: ["ios", "android"], enabled: true },
    )
    expect(url.toString()).toBe(
      "https://api.clashk.ing/v2/admin/flags/space%2Fslash?platform=ios&platform=android&enabled=true",
    )
  })

  it("rejects missing path parameters", () => {
    expect(() => buildEndpointUrl("https://api.clashk.ing", "/v2/admin/flags/:key", {}, {})).toThrow(
      "Missing path parameter",
    )
  })
})

describe("createApiClient", () => {
  const boundedJsonEndpoint = defineEndpoint({
    operationId: "boundedJson",
    method: "GET",
    path: "/v2/bounded-json",
    auth: "public",
    summary: "Exercise bounded response decoding",
    bodyMode: "none",
    pathParams: Schema.Struct({}),
    query: Schema.Struct({}),
    body: Schema.Struct({}),
    response: Schema.Struct({ ok: Schema.Boolean }),
    responseMode: "json",
    successStatus: 200,
  })

  it("cancels a chunked successful response once its streamed bytes exceed the ceiling", async () => {
    let canceled = false
    const oversized = new TextEncoder().encode("💥".repeat((MAX_RESPONSE_BYTES / 4) + 1))
    const source = new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(oversized)
      },
      cancel() {
        canceled = true
      },
    }), { status: 200, headers: { "content-length": "1" } })
    const cloned = source.clone()
    void source.body?.cancel()
    const client = createApiClient({
      transport: {
        execute: () => Effect.succeed(cloned),
      },
    })

    await expect(Effect.runPromise(client.execute(
      boundedJsonEndpoint,
      { path: {}, query: {}, body: {} },
    ))).rejects.toMatchObject({ _tag: "ResponseDecodeError", operationId: "boundedJson" })
    await vi.waitFor(() => { expect(canceled).toBe(true) })
  })

  it("fast-rejects and cancels an oversized error response from a service binding", async () => {
    let canceled = false
    const client = createApiClient({
      transport: serviceBindingTransport({
        fetch: async () => new Response(new ReadableStream<Uint8Array>({
          pull() {
            // A stream implementation may pre-pull before the response is read.
          },
          cancel() {
            canceled = true
          },
        }), {
          status: 502,
          headers: { "content-length": String(MAX_RESPONSE_BYTES + 1) },
        }),
      }),
    })

    await expect(Effect.runPromise(client.execute(
      boundedJsonEndpoint,
      { path: {}, query: {}, body: {} },
    ))).rejects.toMatchObject({ _tag: "ResponseDecodeError", operationId: "boundedJson" })
    expect(canceled).toBe(true)
  })

  it("preserves endpoint response inference across package boundaries", () => {
    const client = createApiClient({
      transport: serviceBindingTransport({ fetch: async () => Response.json({}) }),
    })

    expectTypeOf(client.execute(adminEndpoints.me, { path: {}, query: {}, body: {} }))
      .toEqualTypeOf<Effect.Effect<AdminUser, ApiClientError>>()
    expectTypeOf(client.execute(adminEndpoints.listPosts, { path: {}, query: {}, body: {} }))
      .toEqualTypeOf<Effect.Effect<ReadonlyArray<Post>, ApiClientError>>()
    expectTypeOf(client.execute(adminEndpoints.mediaUpload, {
      path: {}, query: {}, body: new FormData(),
    })).toEqualTypeOf<Effect.Effect<{ readonly url: string }, ApiClientError>>()
    expectTypeOf(client.execute(adminEndpoints.archivePost, {
      path: { id: "00000000-0000-4000-8000-000000000000" }, query: {}, body: {},
    })).toEqualTypeOf<Effect.Effect<void, ApiClientError>>()
  })
  it("honors explicit JSON bodies on DELETE endpoints", async () => {
    let captured: Request | undefined
    const endpoint = defineEndpoint({
      operationId: "deleteMany",
      method: "DELETE",
      path: "/v2/admin/resources/:id",
      auth: "admin",
      summary: "Delete resources",
      bodyMode: "json",
      pathParams: Schema.Struct({ id: Schema.String }),
      query: Schema.Struct({ hard: Schema.Boolean }),
      body: Schema.Struct({ reasons: Schema.Array(Schema.String) }),
      response: Schema.Struct({ deleted: Schema.Number }),
      responseMode: "json",
      successStatus: 200,
    })
    const client = createApiClient({
      transport: serviceBindingTransport({
        fetch: async (request) => {
          captured = request
          return Response.json({ deleted: 2 })
        },
      }),
    })

    const result = await Effect.runPromise(
      client.execute(endpoint, {
        path: { id: "abc/123" },
        query: { hard: true },
        body: { reasons: ["duplicate", "stale"] },
      }),
    )

    expect(result.deleted).toBe(2)
    expect(captured?.url).toBe("https://api.clashk.ing/v2/admin/resources/abc%2F123?hard=true")
    expect(captured?.method).toBe("DELETE")
    expect(captured?.headers.get("content-type")).toBe("application/json")
    expect(await captured?.json()).toEqual({ reasons: ["duplicate", "stale"] })
  })

  it("does not attach a body when the contract declares none", async () => {
    let captured: Request | undefined
    const endpoint = defineEndpoint({
      operationId: "listResources",
      method: "GET",
      path: "/v2/admin/resources",
      auth: "admin",
      summary: "List resources",
      bodyMode: "none",
      pathParams: NoPathParams,
      query: Schema.Struct({ limit: Schema.Number }),
      body: Schema.Struct({}),
      response: Schema.Struct({ items: Schema.Array(Schema.String) }),
      responseMode: "json",
      successStatus: 200,
    })
    const client = createApiClient({
      transport: serviceBindingTransport({
        fetch: async (request) => {
          captured = request
          return Response.json({ items: [] })
        },
      }),
    })

    await Effect.runPromise(client.execute(endpoint, { path: {}, query: { limit: 10 }, body: {} }))

    expect(captured?.headers.has("content-type")).toBe(false)
    expect(await captured?.text()).toBe("")
  })

  it("returns typed void for successful 204 responses without parsing JSON", async () => {
    const endpoint = defineEndpoint({
      operationId: "archiveResource",
      method: "DELETE",
      path: "/v2/admin/resources/:id",
      auth: "admin",
      summary: "Archive a resource",
      bodyMode: "none",
      pathParams: Schema.Struct({ id: Schema.String }),
      query: Schema.Struct({}),
      body: Schema.Struct({}),
      response: NoContent,
      responseMode: "none",
      successStatus: 204,
    })
    const client = createApiClient({
      transport: serviceBindingTransport({
        fetch: async () => new Response(null, { status: 204 }),
      }),
    })

    await expect(
      Effect.runPromise(client.execute(endpoint, { path: { id: "post-1" }, query: {}, body: {} })),
    ).resolves.toBeUndefined()
  })

  it("preserves the exact UTF-8 text body and caller content type for signed webhooks", async () => {
    let captured: Request | undefined
    const client = createApiClient({ transport: serviceBindingTransport({ fetch: async (request) => {
      captured = request
      return new Response(null, { status: 200 })
    } }) })
    const body = '\uFEFF{\r\n  "message": "hello 🌍", "number": 1.00\r\n}\n'
    await Effect.runPromise(client.execute(BillingStripeWebhookEndpoint, { path: {}, query: {}, body }, {
      headers: { "content-type": "application/json", "stripe-signature": "fixture-signature" },
    }))
    if (captured === undefined) throw new Error("Expected a captured webhook request")
    expect(new Uint8Array(await captured.arrayBuffer())).toEqual(new TextEncoder().encode(body))
    expect(captured.headers.get("content-type")).toBe("application/json")
    expect(captured.headers.get("stripe-signature")).toBe("fixture-signature")
  })

  it("sends schema-validated FormData without overriding its boundary header", async () => {
    let captured: Request | undefined
    const endpoint = defineEndpoint({
      operationId: "uploadMedia",
      method: "POST",
      path: "/v2/admin/media/upload",
      auth: "admin",
      summary: "Upload media",
      bodyMode: "multipart",
      pathParams: Schema.Struct({}),
      query: Schema.Struct({}),
      body: Schema.FormData,
      response: Schema.Struct({ url: Schema.String }),
      responseMode: "json",
      successStatus: 200,
    })
    const client = createApiClient({
      transport: serviceBindingTransport({
        fetch: async (request) => {
          captured = request
          return Response.json({ url: "https://cdn.clashk.ing/file.png" })
        },
      }),
    })
    const body = new FormData()
    body.set("post_id", "post-1")

    await Effect.runPromise(client.execute(endpoint, { path: {}, query: {}, body }))

    if (captured === undefined) throw new Error("Expected the transport to capture a request")
    expect(captured?.headers.get("content-type")).toContain("multipart/form-data; boundary=")
    expect((await captured.formData()).get("post_id")).toBe("post-1")
  })

  it("uses browser cookie auth and the Access AJAX header for Admin requests", async () => {
    let captured: Request | undefined
    const endpoint = defineEndpoint({
      operationId: "adminMe",
      method: "GET",
      path: "/v2/admin/me",
      auth: "admin",
      summary: "Get the current admin",
      bodyMode: "none",
      pathParams: Schema.Struct({}),
      query: Schema.Struct({}),
      body: Schema.Struct({}),
      response: Schema.Struct({ email: Schema.String }),
      responseMode: "json",
      successStatus: 200,
    })
    const client = createAdminApiClient({
      fetcher: async (request) => {
        captured = request
        return Response.json({ email: "admin@clashk.ing" })
      },
    })

    await Effect.runPromise(client.execute(endpoint, { path: {}, query: {}, body: {} }))

    expect(captured?.credentials).toBe("include")
    expect(captured?.headers.get("x-requested-with")).toBe("XMLHttpRequest")
  })

  it("returns a discriminated result for a contract-declared 404", async () => {
    const NotFoundBody = Schema.Struct({ code: Schema.Literal("not_found") })
    const endpoint = defineEndpoint({
      operationId: "getCurrentWar",
      method: "GET",
      path: "/v2/war/:tag/basic",
      auth: "user-or-bot",
      errors: [{ status: 404, body: NotFoundBody }],
      summary: "Get a current war when present",
      bodyMode: "none",
      pathParams: Schema.Struct({ tag: Schema.String }),
      query: Schema.Struct({}),
      body: Schema.Struct({}),
      response: Schema.Struct({ state: Schema.String }),
      responseMode: "json",
      successStatus: 200,
    })
    const client = createApiClient({
      transport: serviceBindingTransport({
        fetch: async () => Response.json({ code: "not_found" }, { status: 404 }),
      }),
    })

    const result = await Effect.runPromise(
      client.executeStatus(endpoint, { path: { tag: "#CLAN" }, query: {}, body: {} }),
    )

    expect(result).toEqual({ ok: false, status: 404, body: { code: "not_found" } })
  })

  it("preserves the actual successful status returned by the server", async () => {
    const endpoint = defineEndpoint({
      operationId: "createResource",
      method: "POST",
      path: "/v2/admin/resources",
      auth: "admin",
      summary: "Create a resource",
      bodyMode: "json",
      pathParams: Schema.Struct({}),
      query: Schema.Struct({}),
      body: Schema.Struct({ name: Schema.String }),
      response: Schema.Struct({ id: Schema.String }),
      responseMode: "json",
      successStatus: 200,
    })
    const client = createApiClient({
      transport: serviceBindingTransport({
        fetch: async () => Response.json({ id: "resource-1" }, { status: 201 }),
      }),
    })

    const result = await Effect.runPromise(
      client.executeStatus(endpoint, { path: {}, query: {}, body: { name: "Example" } }),
    )

    expect(result).toEqual({ ok: true, status: 201, value: { id: "resource-1" } })
  })

  it("still fails unexpected non-success statuses", async () => {
    const NotFoundBody = Schema.Struct({ code: Schema.Literal("not_found") })
    const endpoint = defineEndpoint({
      operationId: "getCurrentWar",
      method: "GET",
      path: "/v2/war/:tag/basic",
      auth: "user-or-bot",
      errors: [{ status: 404, body: NotFoundBody }],
      summary: "Get a current war when present",
      bodyMode: "none",
      pathParams: Schema.Struct({ tag: Schema.String }),
      query: Schema.Struct({}),
      body: Schema.Struct({}),
      response: Schema.Struct({ state: Schema.String }),
      responseMode: "json",
      successStatus: 200,
    })
    const client = createApiClient({
      transport: serviceBindingTransport({
        fetch: async () => Response.json({ code: "internal_error" }, { status: 500 }),
      }),
    })

    await expect(
      Effect.runPromise(
        client.executeStatus(endpoint, { path: { tag: "#CLAN" }, query: {}, body: {} }),
      ),
    ).rejects.toMatchObject({ _tag: "ApiResponseError", status: 500 })
  })

  it("fails when a declared alternate response body does not match its schema", async () => {
    const endpoint = defineEndpoint({
      operationId: "getCurrentWar",
      method: "GET",
      path: "/v2/war/:tag/basic",
      auth: "user-or-bot",
      errors: [{
        status: 404,
        body: Schema.Struct({ code: Schema.Literal("not_found"), clan_tag: Schema.String }),
      }],
      summary: "Get a current war when present",
      bodyMode: "none",
      pathParams: Schema.Struct({ tag: Schema.String }),
      query: Schema.Struct({}),
      body: Schema.Struct({}),
      response: Schema.Struct({ state: Schema.String }),
      responseMode: "json",
      successStatus: 200,
    })
    const client = createApiClient({
      transport: serviceBindingTransport({
        fetch: async () => Response.json({ code: "not_found" }, { status: 404 }),
      }),
    })

    await expect(
      Effect.runPromise(
        client.executeStatus(endpoint, { path: { tag: "#CLAN" }, query: {}, body: {} }),
      ),
    ).rejects.toMatchObject({ _tag: "ResponseDecodeError", operationId: "getCurrentWar" })
  })

  it("uses cookie credentials for non-Admin browser auth without the Access header", async () => {
    let captured: Request | undefined
    const endpoint = defineEndpoint({
      operationId: "webRefresh",
      method: "POST",
      path: "/v2/auth/web/refresh",
      auth: "public",
      summary: "Refresh a browser session",
      bodyMode: "none",
      pathParams: Schema.Struct({}),
      query: Schema.Struct({}),
      body: Schema.Struct({}),
      response: Schema.Struct({ access_token: Schema.String }),
      responseMode: "json",
      successStatus: 200,
    })
    const client = createBrowserApiClient({
      fetcher: async (request) => {
        captured = request
        return Response.json({ access_token: "new-token" })
      },
    })

    await Effect.runPromise(client.execute(endpoint, { path: {}, query: {}, body: {} }))

    expect(captured?.credentials).toBe("include")
    expect(captured?.headers.has("x-requested-with")).toBe(false)
  })

  it("reports URL construction failures in the typed error channel", async () => {
    const endpoint = defineEndpoint({
      operationId: "brokenPath",
      method: "GET",
      path: "/v2/war/:tag/basic",
      auth: "public",
      summary: "Exercise a malformed descriptor",
      bodyMode: "none",
      pathParams: Schema.Struct({ wrong: Schema.String }),
      query: Schema.Struct({}),
      body: Schema.Struct({}),
      response: Schema.Struct({}),
      responseMode: "json",
      successStatus: 200,
    })
    const client = createApiClient({
      transport: serviceBindingTransport({ fetch: async () => Response.json({}) }),
    })

    await expect(
      Effect.runPromise(client.execute(endpoint, { path: { wrong: "value" }, query: {}, body: {} })),
    ).rejects.toMatchObject({ _tag: "RequestBuildError", operationId: "brokenPath" })
  })

  it("reports request contract encoding failures as request build errors", async () => {
    const endpoint = defineEndpoint({
      operationId: "invalidRequestInput", method: "GET", path: "/v2/player/:tag", auth: "public",
      summary: "Exercise runtime-invalid request input", bodyMode: "none",
      pathParams: Schema.Struct({ tag: Schema.String }), query: Schema.Struct({}), body: Schema.Struct({}),
      response: Schema.Struct({}), responseMode: "json", successStatus: 200,
    })
    const client = createApiClient({ transport: serviceBindingTransport({ fetch: async () => Response.json({}) }) })

    await expect(Effect.runPromise(client.execute(endpoint, {
      path: { tag: 123 } as unknown as { tag: string }, query: {}, body: {},
    }))).rejects.toMatchObject({ _tag: "RequestBuildError", operationId: "invalidRequestInput" })
  })

  it("single-flights one browser refresh and replays each unauthorized request once", async () => {
    let attempts = 0
    let refreshes = 0
    const transport = withUnauthorizedRefresh({
      transport: serviceBindingTransport({
        fetch: async () => {
          attempts += 1
          return attempts <= 2
            ? Response.json({ code: "unauthenticated" }, { status: 401 })
            : Response.json({ ok: true })
        },
      }),
      refresh: async () => {
        refreshes += 1
        await Promise.resolve()
      },
    })

    const [first, second] = await Effect.runPromise(
      Effect.all([
        transport.execute(new Request("https://api.clashk.ing/v2/player/%23A")),
        transport.execute(new Request("https://api.clashk.ing/v2/player/%23B")),
      ], { concurrency: "unbounded" }),
    )

    expect([first.status, second.status]).toEqual([200, 200])
    expect(refreshes).toBe(1)
    expect(attempts).toBe(4)
  })

  it("re-authorizes a bearer request after refresh before its one replay", async () => {
    let token = "expired"
    const seenTokens: Array<string | null> = []
    const transport = withUnauthorizedRefresh({
      transport: serviceBindingTransport({
        fetch: async (request) => {
          seenTokens.push(request.headers.get("authorization"))
          return token === "expired"
            ? Response.json({ code: "unauthenticated" }, { status: 401 })
            : Response.json({ ok: true })
        },
      }),
      refresh: async () => { token = "fresh" },
      authorizeReplay: (request) => {
        const headers = new Headers(request.headers)
        headers.set("authorization", `Bearer ${token}`)
        return new Request(request, { headers })
      },
    })

    const response = await Effect.runPromise(transport.execute(new Request(
      "https://api.clashk.ing/v2/guilds",
      { headers: { authorization: "Bearer expired" } },
    )))

    expect(response.status).toBe(200)
    expect(seenTokens).toEqual(["Bearer expired", "Bearer fresh"])
  })

  it("maps a synchronous refresh callback throw to TransportError", async () => {
    const transport = withUnauthorizedRefresh({
      transport: serviceBindingTransport({ fetch: async () => new Response(null, { status: 401 }) }),
      refresh: () => { throw new Error("sync refresh failure") },
    })
    await expect(Effect.runPromise(transport.execute(new Request("https://api.test/v2/me"))))
      .rejects.toMatchObject({ _tag: "TransportError", message: "ClashKing session refresh failed" })
  })

  it("cancels the401 response before replaying", async () => {
    let canceled = false
    let calls = 0
    const transport = withUnauthorizedRefresh({
      transport: serviceBindingTransport({ fetch: async () => {
        calls += 1
        if (calls === 1) return new Response(new ReadableStream({ cancel() { canceled = true } }), { status: 401 })
        expect(canceled).toBe(true)
        return new Response(null, { status: 204 })
      } }),
      refresh: async () => { expect(canceled).toBe(true) },
    })
    expect((await Effect.runPromise(transport.execute(new Request("https://api.test/v2/me")))).status).toBe(204)
  })

  it("does not clear a pending shared refresh when one waiter is canceled", async () => {
    let release!: () => void
    let started!: () => void
    const refreshStarted = new Promise<void>((resolve) => { started = resolve })
    const refreshPending = new Promise<void>((resolve) => { release = resolve })
    let refreshes = 0
    let authorized = false
    const transport = withUnauthorizedRefresh({
      transport: serviceBindingTransport({ fetch: async () => new Response(null, { status: authorized ? 204 : 401 }) }),
      refresh: async () => { refreshes += 1; started(); await refreshPending; authorized = true },
    })
    const controller = new AbortController()
    const canceled = Effect.runPromise(transport.execute(new Request("https://api.test/v2/a")), { signal: controller.signal })
      .catch(() => undefined)
    await refreshStarted
    controller.abort()
    await canceled
    const second = Effect.runPromise(transport.execute(new Request("https://api.test/v2/b")))
    const third = Effect.runPromise(transport.execute(new Request("https://api.test/v2/c")))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(refreshes).toBe(1)
    release()
    expect((await Promise.all([second, third])).map((response) => response.status)).toEqual([204, 204])
    expect(refreshes).toBe(1)
  })

  it("does not clone or refresh exempt authentication requests", async () => {
    const request = new Request("https://api.test/v2/auth/web/refresh")
    const clone = vi.spyOn(request, "clone")
    const refresh = vi.fn(async () => undefined)
    const transport = withUnauthorizedRefresh({
      transport: serviceBindingTransport({ fetch: async () => new Response(null, { status: 401 }) }), refresh,
    })
    expect((await Effect.runPromise(transport.execute(request))).status).toBe(401)
    expect(clone).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it.each(["/v2/auth/me", "/v2/auth/export"])("refreshes the protected authentication endpoint %s", async (path) => {
    let authorized = false
    const refresh = vi.fn(async () => { authorized = true })
    const transport = withUnauthorizedRefresh({
      transport: serviceBindingTransport({ fetch: async () => new Response(null, { status: authorized ? 204 : 401 }) }),
      refresh,
    })
    expect((await Effect.runPromise(transport.execute(new Request(`https://api.test${path}`)))).status).toBe(204)
    expect(refresh).toHaveBeenCalledOnce()
  })
})
