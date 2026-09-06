import type {
  AnyEndpoint,
  EndpointRequest,
  EndpointResponse,
  EndpointStatusResult,
} from "@clashking/api-contracts"
import { Data, Effect, Schema } from "effect"

export interface ApiBinding {
  fetch(request: Request): Promise<Response>
}

export interface ApiTransport {
  execute(request: Request): Effect.Effect<Response, TransportError>
}

export interface ApiAuth {
  readonly bearerToken?: string
  readonly botToken?: string
  readonly deviceId?: string
}

export interface ApiRequestMetadata {
  readonly requestId?: string
  readonly traceparent?: string
  readonly tracestate?: string
}

export class TransportError extends Data.TaggedError("TransportError")<{
  readonly cause: unknown
  readonly message: string
}> {}

export class ApiResponseError extends Data.TaggedError("ApiResponseError")<{
  readonly body: unknown
  readonly requestId?: string
  readonly status: number
}> {}

export class ResponseDecodeError extends Data.TaggedError("ResponseDecodeError")<{
  readonly cause: unknown
  readonly operationId: string
}> {}

export class RequestBuildError extends Data.TaggedError("RequestBuildError")<{
  readonly cause: unknown
  readonly operationId: string
}> {}

export type ApiClientError =
  | ApiResponseError
  | RequestBuildError
  | ResponseDecodeError
  | TransportError

export type ApiStatusResult<E extends AnyEndpoint> = EndpointStatusResult<E>

export const MAX_RESPONSE_BYTES = 16 * 1024 * 1024

const fetchWithInterruption = async (
  fetcher: typeof fetch,
  request: Request,
  interruption: AbortSignal,
): Promise<Response> => {
  const controller = new AbortController()
  const signals = [...new Set([request.signal, interruption])]
  const abort = (event: Event) => {
    const signal = event.currentTarget as AbortSignal
    if (!controller.signal.aborted) controller.abort(signal.reason)
  }
  for (const signal of signals) signal.addEventListener("abort", abort, { once: true })
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason)
      break
    }
  }
  try {
    return await fetcher(new Request(request, { signal: controller.signal }))
  } finally {
    for (const signal of signals) signal.removeEventListener("abort", abort)
  }
}

export const httpTransport = (fetcher: typeof fetch = globalThis.fetch): ApiTransport => ({
  execute: (request) =>
    Effect.tryPromise({
      try: (interruption) => fetchWithInterruption(fetcher, request, interruption),
      catch: (cause) => new TransportError({ cause, message: "ClashKing API transport failed" }),
    }),
})

export const serviceBindingTransport = (binding: ApiBinding): ApiTransport => ({
  execute: (request) =>
    Effect.tryPromise({
      try: () => binding.fetch(request),
      catch: (cause) => new TransportError({ cause, message: "ClashKing API service binding failed" }),
    }),
})

export interface UnauthorizedRefreshOptions {
  readonly authorizeReplay?: (request: Request) => Promise<Request> | Request
  readonly refresh: () => Promise<void>
  readonly shouldRefresh?: (request: Request) => boolean
  readonly transport: ApiTransport
}

export const withUnauthorizedRefresh = (options: UnauthorizedRefreshOptions): ApiTransport => {
  let inFlight: Promise<void> | undefined
  return {
    execute: (request) =>
      Effect.gen(function* () {
        const shouldRefresh = options.shouldRefresh?.(request)
          ?? !new URL(request.url).pathname.startsWith("/v2/auth/")
        const replay = shouldRefresh ? request.clone() : undefined
        const response = yield* options.transport.execute(request)
        if (response.status !== 401 || !shouldRefresh) return response
        if (replay === undefined) return response
        yield* Effect.tryPromise({
          try: async () => { await response.body?.cancel() },
          catch: (cause) => new TransportError({ cause, message: "ClashKing unauthorized response cleanup failed" }),
        })
        if (inFlight === undefined) {
          const refresh = Promise.resolve().then(() => options.refresh()).finally(() => {
            if (inFlight === refresh) inFlight = undefined
          })
          inFlight = refresh
        }
        const refresh = inFlight
        yield* Effect.tryPromise({
          try: (interruption) => new Promise<void>((resolve, reject) => {
            const signals = [request.signal, interruption]
            let settled = false
            const finish = (succeeded: boolean, failure?: unknown) => {
              if (settled) return
              settled = true
              for (const signal of signals) signal.removeEventListener("abort", abort)
              if (succeeded) resolve()
              else reject(failure)
            }
            const abort = () => finish(false, signals.find((signal) => signal.aborted)?.reason ?? new Error("Request aborted"))
            for (const signal of signals) signal.addEventListener("abort", abort, { once: true })
            // Both handlers stay attached to the shared promise even if this
            // waiter aborts. Its lifetime and rejection handling are independent.
            refresh.then(() => finish(true), (cause) => finish(false, cause))
            if (signals.some((signal) => signal.aborted)) abort()
          }),
          catch: (cause) => new TransportError({ cause, message: "ClashKing session refresh failed" }),
        })
        const authorizedReplay = options.authorizeReplay === undefined
          ? replay
          : yield* Effect.tryPromise({
              try: () => Promise.resolve(options.authorizeReplay?.(replay) ?? replay),
              catch: (cause) => new TransportError({
                cause,
                message: "ClashKing session replay authorization failed",
              }),
            })
        return yield* options.transport.execute(authorizedReplay)
      }),
  }
}

export interface ApiClientOptions {
  readonly auth?: ApiAuth
  readonly baseUrl?: string
  readonly credentials?: RequestCredentials
  readonly defaultTimeoutMs?: number
  readonly headers?: Readonly<Record<string, string>>
  readonly transport: ApiTransport
}

export interface ExecuteOptions {
  readonly auth?: ApiAuth
  readonly baseUrl?: string
  readonly headers?: Readonly<Record<string, string>>
  readonly metadata?: ApiRequestMetadata
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
}

export interface AdminApiClientOptions {
  readonly baseUrl?: string
  readonly defaultTimeoutMs?: number
  readonly fetcher?: typeof fetch
}

export type BrowserApiClientOptions = AdminApiClientOptions

const encodeContractPart = <A>(
  schema: Schema.Codec<A, unknown, never, never>,
  value: unknown,
  operationId: string,
): Effect.Effect<unknown, ResponseDecodeError> =>
  Schema.encodeUnknownEffect(schema)(value).pipe(
    Effect.mapError((cause) => new ResponseDecodeError({ cause, operationId })),
  )

const encodedObject = (value: unknown, part: string): Readonly<Record<string, unknown>> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`Encoded endpoint ${part} must be an object`)
  }
  return value as Readonly<Record<string, unknown>>
}

export const buildEndpointUrl = (
  baseUrl: string,
  pathTemplate: `/proxy/v1/${string}` | `/v2/${string}`,
  encodedPath: unknown,
  encodedQuery: unknown,
): URL => {
  const pathValues = encodedObject(encodedPath, "path parameters")
  const queryValues = encodedObject(encodedQuery, "query parameters")
  let path: string = pathTemplate
  for (const [key, value] of Object.entries(pathValues)) {
    if (typeof value !== "string" && typeof value !== "number") {
      throw new TypeError(`Path parameter ${key} must encode to a string or number`)
    }
    const marker = `:${key}`
    if (!path.includes(marker)) throw new TypeError(`Path parameter ${key} is not present in ${pathTemplate}`)
    path = path.replaceAll(marker, encodeURIComponent(String(value)))
  }
  if (/:([A-Za-z0-9_]+)/u.test(path)) throw new TypeError(`Missing path parameter for ${pathTemplate}`)

  const url = new URL(path, baseUrl)
  const append = (key: string, value: unknown): void => {
    if (value === null || value === undefined) return
    if (Array.isArray(value)) {
      for (const item of value) append(key, item)
      return
    }
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      throw new TypeError(`Query parameter ${key} must encode to a scalar or scalar array`)
    }
    url.searchParams.append(key, String(value))
  }
  for (const [key, value] of Object.entries(queryValues)) append(key, value)
  return url
}

const applyAuth = (headers: Headers, auth: ApiAuth | undefined): void => {
  const bearerToken = auth?.botToken ?? auth?.bearerToken
  if (bearerToken !== undefined) headers.set("authorization", `Bearer ${bearerToken}`)
  if (auth?.deviceId !== undefined) headers.set("x-device-id", auth.deviceId)
}

const applyHeaders = (
  headers: Headers,
  values: Readonly<Record<string, string>> | undefined,
): void => {
  if (values === undefined) return
  for (const [name, value] of Object.entries(values)) headers.set(name, value)
}

const applyMetadata = (headers: Headers, metadata: ApiRequestMetadata | undefined): void => {
  if (metadata?.requestId !== undefined) headers.set("x-request-id", metadata.requestId)
  if (metadata?.traceparent !== undefined) headers.set("traceparent", metadata.traceparent)
  if (metadata?.tracestate !== undefined) headers.set("tracestate", metadata.tracestate)
}

const requestSignal = (options: ExecuteOptions): { readonly signal: AbortSignal | undefined; readonly dispose: () => void } => {
  if (options.timeoutMs === undefined) return { signal: options.signal, dispose: () => undefined }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 0 || options.timeoutMs > 2_147_483_647) {
    throw new RangeError("timeoutMs must be a non-negative finite timer duration")
  }
  const controller = new AbortController()
  const caller = options.signal
  let timer: ReturnType<typeof setTimeout> | undefined
  const forwardAbort = () => controller.abort(caller?.reason)
  if (caller?.aborted === true) forwardAbort()
  else {
    caller?.addEventListener("abort", forwardAbort, { once: true })
    timer = setTimeout(() => {
      const error = new Error("ClashKing API request timed out")
      error.name = "TimeoutError"
      controller.abort(error)
    }, options.timeoutMs)
  }
  return {
    signal: controller.signal,
    dispose: () => {
      if (timer !== undefined) clearTimeout(timer)
      caller?.removeEventListener("abort", forwardAbort)
    },
  }
}

const cancelBody = (body: ReadableStream<Uint8Array> | null): void => {
  void body?.cancel().catch(() => {
    // Preserve the response-size/decode failure that caused cancellation.
  })
}

const readBoundedBytes = async (response: Response): Promise<Uint8Array> => {
  const contentLength = response.headers.get("content-length")
  if (contentLength !== null && /^\d+$/u.test(contentLength) && Number(contentLength) > MAX_RESPONSE_BYTES) {
    cancelBody(response.body)
    throw new RangeError(`ClashKing API response exceeds ${MAX_RESPONSE_BYTES} bytes`)
  }
  if (response.body === null) return new Uint8Array()

  const reader = response.body.getReader()
  const chunks: Array<Uint8Array> = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_RESPONSE_BYTES) {
        void reader.cancel().catch(() => {
          // Preserve the response-size failure rather than a cleanup failure.
        })
        throw new RangeError(`ClashKing API response exceeds ${MAX_RESPONSE_BYTES} bytes`)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

const decodeText = (bytes: Uint8Array): string => new TextDecoder("utf-8", { fatal: true }).decode(bytes)

const errorPayload = async (response: Response): Promise<unknown> => {
  const text = decodeText(await readBoundedBytes(response))
  if (text.length === 0) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

const successPayload = async (endpoint: AnyEndpoint, response: Response): Promise<unknown> => {
  if (response.status === 204) return undefined
  switch (endpoint.responseMode) {
    case "arrayBuffer": {
      const bytes = await readBoundedBytes(response)
      return bytes.buffer
    }
    case "blob": {
      const bytes = await readBoundedBytes(response)
      return new Blob([bytes.buffer as ArrayBuffer], { type: response.headers.get("content-type") ?? "" })
    }
    case "json":
      return JSON.parse(decodeText(await readBoundedBytes(response))) as unknown
    case "none":
      return undefined
    case "response":
      return response
  }
}

export const createApiClient = (options: ApiClientOptions) => {
  if (
    options.defaultTimeoutMs !== undefined
    && (!Number.isFinite(options.defaultTimeoutMs)
      || options.defaultTimeoutMs <= 0
      || options.defaultTimeoutMs > 2_147_483_647)
  ) {
    throw new RangeError("defaultTimeoutMs must be a positive finite timer duration")
  }

  const executeWithStatus = <E extends AnyEndpoint>(
    endpoint: E,
    input: EndpointRequest<E>,
    executeOptions: ExecuteOptions = {},
  ): Effect.Effect<
    { readonly status: number; readonly value: EndpointResponse<E> },
    ApiClientError
  > => Effect.suspend(() => {
    let disposeSignal = () => {}
    return Effect.gen(function* () {
      const [encodedBody, encodedPath, encodedQuery] = yield* Effect.all(
        [
          encodeContractPart(endpoint.body, input.body, endpoint.operationId),
          encodeContractPart(endpoint.pathParams, input.path, endpoint.operationId),
          encodeContractPart(endpoint.query, input.query, endpoint.operationId),
        ],
        { concurrency: "unbounded" },
      )
      const headers = new Headers({ accept: "application/json" })
      applyHeaders(headers, options.headers)
      applyHeaders(headers, executeOptions.headers)
      applyMetadata(headers, executeOptions.metadata)
      applyAuth(headers, executeOptions.auth ?? options.auth)
      if (endpoint.bodyMode === "json") headers.set("content-type", "application/json")
      if (endpoint.bodyMode === "text" && !headers.has("content-type")) headers.set("content-type", "text/plain; charset=utf-8")
      if (endpoint.bodyMode === "multipart") headers.delete("content-type")
      const request = yield* Effect.try({
        try: () => {
          const timeoutMs = executeOptions.timeoutMs ?? options.defaultTimeoutMs
          const signalResource = requestSignal(timeoutMs === undefined
            ? executeOptions
            : { ...executeOptions, timeoutMs })
          disposeSignal = signalResource.dispose
          const signal = signalResource.signal
          const requestInit: RequestInit = {
            method: endpoint.method,
            headers,
            ...(endpoint.bodyMode === "json" ? { body: JSON.stringify(encodedBody) } : {}),
            ...(endpoint.bodyMode === "multipart" ? { body: encodedBody as FormData } : {}),
            ...(endpoint.bodyMode === "text" ? { body: encodedBody as string } : {}),
            ...(options.credentials === undefined ? {} : { credentials: options.credentials }),
            ...(signal === undefined ? {} : { signal }),
          }
          return new Request(
            buildEndpointUrl(
              executeOptions.baseUrl ?? options.baseUrl ?? "https://api.clashk.ing",
              endpoint.path,
              encodedPath,
              encodedQuery,
            ),
            requestInit,
          )
        },
        catch: (cause) => new RequestBuildError({ cause, operationId: endpoint.operationId }),
      })
      const response = yield* options.transport.execute(request)
      if (!response.ok) {
        const payload = yield* Effect.tryPromise({
          try: () => errorPayload(response),
          catch: (cause) => new ResponseDecodeError({ cause, operationId: endpoint.operationId }),
        })
        const requestId = response.headers.get("x-request-id")
        return yield* new ApiResponseError({
          status: response.status,
          body: payload,
          ...(requestId === null ? {} : { requestId }),
        })
      }
      const payload = yield* Effect.tryPromise({
        try: () => successPayload(endpoint, response),
        catch: (cause) => new ResponseDecodeError({ cause, operationId: endpoint.operationId }),
      })
      const value = yield* Schema.decodeUnknownEffect(endpoint.response)(payload).pipe(
        Effect.mapError(
          (cause) => new ResponseDecodeError({ cause, operationId: endpoint.operationId }),
        ),
      )
      return { status: response.status, value }
    }).pipe(Effect.ensuring(Effect.sync(() => disposeSignal())))
  })

  const execute = <E extends AnyEndpoint>(
    endpoint: E,
    input: EndpointRequest<E>,
    executeOptions: ExecuteOptions = {},
  ): Effect.Effect<EndpointResponse<E>, ApiClientError> =>
    executeWithStatus(endpoint, input, executeOptions).pipe(Effect.map(({ value }) => value))

  const executeStatus = <E extends AnyEndpoint>(
    endpoint: E,
    input: EndpointRequest<E>,
    executeOptions: ExecuteOptions = {},
  ): Effect.Effect<ApiStatusResult<E>, ApiClientError> => {
    const decodeDeclaredError = (
      error: ApiResponseError,
    ): Effect.Effect<ApiStatusResult<E>, ApiClientError> => {
      const errorSpec = endpoint.errors?.find(({ status }) => status === error.status)
      if (errorSpec === undefined) return Effect.fail(error)
      return Schema.decodeUnknownEffect(errorSpec.body)(error.body).pipe(
        Effect.map((body) => ({
          ok: false as const,
          status: error.status,
          body,
          ...(error.requestId === undefined ? {} : { requestId: error.requestId }),
        }) as ApiStatusResult<E>),
        Effect.mapError((cause): ApiClientError => new ResponseDecodeError({
          cause,
          operationId: endpoint.operationId,
        })),
      )
    }

    return executeWithStatus(endpoint, input, executeOptions).pipe(
      Effect.map(({ status, value }) => ({ ok: true as const, status, value }) as ApiStatusResult<E>),
      Effect.catchTag("ApiResponseError", decodeDeclaredError),
    )
  }

  return { execute, executeStatus }
}

export const createAdminApiClient = (options: AdminApiClientOptions = {}) =>
  createApiClient({
    transport: httpTransport(options.fetcher),
    ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
    ...(options.defaultTimeoutMs === undefined ? {} : { defaultTimeoutMs: options.defaultTimeoutMs }),
    credentials: "include",
    headers: { "x-requested-with": "XMLHttpRequest" },
  })

export const createBrowserApiClient = (options: BrowserApiClientOptions = {}) =>
  createApiClient({
    transport: httpTransport(options.fetcher),
    ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
    ...(options.defaultTimeoutMs === undefined ? {} : { defaultTimeoutMs: options.defaultTimeoutMs }),
    credentials: "include",
  })
