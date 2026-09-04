import { Data, Effect, Schema } from "effect";
export class TransportError extends Data.TaggedError("TransportError") {
}
export class ApiResponseError extends Data.TaggedError("ApiResponseError") {
}
export class ResponseDecodeError extends Data.TaggedError("ResponseDecodeError") {
}
export class RequestBuildError extends Data.TaggedError("RequestBuildError") {
}
export const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
export const httpTransport = (fetcher = globalThis.fetch) => ({
    execute: (request) => Effect.tryPromise({
        try: () => fetcher(request),
        catch: (cause) => new TransportError({ cause, message: "ClashKing API transport failed" }),
    }),
});
export const serviceBindingTransport = (binding) => ({
    execute: (request) => Effect.tryPromise({
        try: () => binding.fetch(request),
        catch: (cause) => new TransportError({ cause, message: "ClashKing API service binding failed" }),
    }),
});
export const withUnauthorizedRefresh = (options) => {
    let inFlight;
    return {
        execute: (request) => Effect.gen(function* () {
            const shouldRefresh = options.shouldRefresh?.(request)
                ?? !new URL(request.url).pathname.startsWith("/v2/auth/");
            const replay = shouldRefresh ? request.clone() : undefined;
            const response = yield* options.transport.execute(request);
            if (response.status !== 401 || !shouldRefresh)
                return response;
            if (replay === undefined)
                return response;
            yield* Effect.tryPromise({
                try: async () => { await response.body?.cancel(); },
                catch: (cause) => new TransportError({ cause, message: "ClashKing unauthorized response cleanup failed" }),
            });
            if (inFlight === undefined) {
                const refresh = Promise.resolve().then(() => options.refresh()).finally(() => {
                    if (inFlight === refresh)
                        inFlight = undefined;
                });
                inFlight = refresh;
            }
            const refresh = inFlight;
            yield* Effect.tryPromise({
                try: (interruption) => new Promise((resolve, reject) => {
                    const signals = [request.signal, interruption];
                    let settled = false;
                    const finish = (succeeded, failure) => {
                        if (settled)
                            return;
                        settled = true;
                        for (const signal of signals)
                            signal.removeEventListener("abort", abort);
                        if (succeeded)
                            resolve();
                        else
                            reject(failure);
                    };
                    const abort = () => finish(false, signals.find((signal) => signal.aborted)?.reason ?? new Error("Request aborted"));
                    for (const signal of signals)
                        signal.addEventListener("abort", abort, { once: true });
                    // Both handlers stay attached to the shared promise even if this
                    // waiter aborts. Its lifetime and rejection handling are independent.
                    refresh.then(() => finish(true), (cause) => finish(false, cause));
                    if (signals.some((signal) => signal.aborted))
                        abort();
                }),
                catch: (cause) => new TransportError({ cause, message: "ClashKing session refresh failed" }),
            });
            const authorizedReplay = options.authorizeReplay === undefined
                ? replay
                : yield* Effect.tryPromise({
                    try: () => Promise.resolve(options.authorizeReplay?.(replay) ?? replay),
                    catch: (cause) => new TransportError({
                        cause,
                        message: "ClashKing session replay authorization failed",
                    }),
                });
            return yield* options.transport.execute(authorizedReplay);
        }),
    };
};
const encodeContractPart = (schema, value, operationId) => Schema.encodeUnknownEffect(schema)(value).pipe(Effect.mapError((cause) => new ResponseDecodeError({ cause, operationId })));
const encodedObject = (value, part) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new TypeError(`Encoded endpoint ${part} must be an object`);
    }
    return value;
};
export const buildEndpointUrl = (baseUrl, pathTemplate, encodedPath, encodedQuery) => {
    const pathValues = encodedObject(encodedPath, "path parameters");
    const queryValues = encodedObject(encodedQuery, "query parameters");
    let path = pathTemplate;
    for (const [key, value] of Object.entries(pathValues)) {
        if (typeof value !== "string" && typeof value !== "number") {
            throw new TypeError(`Path parameter ${key} must encode to a string or number`);
        }
        const marker = `:${key}`;
        if (!path.includes(marker))
            throw new TypeError(`Path parameter ${key} is not present in ${pathTemplate}`);
        path = path.replaceAll(marker, encodeURIComponent(String(value)));
    }
    if (/:([A-Za-z0-9_]+)/u.test(path))
        throw new TypeError(`Missing path parameter for ${pathTemplate}`);
    const url = new URL(path, baseUrl);
    const append = (key, value) => {
        if (value === null || value === undefined)
            return;
        if (Array.isArray(value)) {
            for (const item of value)
                append(key, item);
            return;
        }
        if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
            throw new TypeError(`Query parameter ${key} must encode to a scalar or scalar array`);
        }
        url.searchParams.append(key, String(value));
    };
    for (const [key, value] of Object.entries(queryValues))
        append(key, value);
    return url;
};
const applyAuth = (headers, auth) => {
    const bearerToken = auth?.botToken ?? auth?.bearerToken;
    if (bearerToken !== undefined)
        headers.set("authorization", `Bearer ${bearerToken}`);
    if (auth?.deviceId !== undefined)
        headers.set("x-device-id", auth.deviceId);
};
const applyHeaders = (headers, values) => {
    if (values === undefined)
        return;
    for (const [name, value] of Object.entries(values))
        headers.set(name, value);
};
const applyMetadata = (headers, metadata) => {
    if (metadata?.requestId !== undefined)
        headers.set("x-request-id", metadata.requestId);
    if (metadata?.traceparent !== undefined)
        headers.set("traceparent", metadata.traceparent);
    if (metadata?.tracestate !== undefined)
        headers.set("tracestate", metadata.tracestate);
};
const requestSignal = (options) => {
    if (options.timeoutMs === undefined)
        return { signal: options.signal, dispose: () => undefined };
    if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 0 || options.timeoutMs > 2_147_483_647) {
        throw new RangeError("timeoutMs must be a non-negative finite timer duration");
    }
    const controller = new AbortController();
    const caller = options.signal;
    let timer;
    const forwardAbort = () => controller.abort(caller?.reason);
    if (caller?.aborted === true)
        forwardAbort();
    else {
        caller?.addEventListener("abort", forwardAbort, { once: true });
        timer = setTimeout(() => {
            const error = new Error("ClashKing API request timed out");
            error.name = "TimeoutError";
            controller.abort(error);
        }, options.timeoutMs);
    }
    return {
        signal: controller.signal,
        dispose: () => {
            if (timer !== undefined)
                clearTimeout(timer);
            caller?.removeEventListener("abort", forwardAbort);
        },
    };
};
const cancelBody = (body) => {
    void body?.cancel().catch(() => {
        // Preserve the response-size/decode failure that caused cancellation.
    });
};
const readBoundedBytes = async (response) => {
    const contentLength = response.headers.get("content-length");
    if (contentLength !== null && /^\d+$/u.test(contentLength) && Number(contentLength) > MAX_RESPONSE_BYTES) {
        cancelBody(response.body);
        throw new RangeError(`ClashKing API response exceeds ${MAX_RESPONSE_BYTES} bytes`);
    }
    if (response.body === null)
        return new Uint8Array();
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            length += value.byteLength;
            if (length > MAX_RESPONSE_BYTES) {
                void reader.cancel().catch(() => {
                    // Preserve the response-size failure rather than a cleanup failure.
                });
                throw new RangeError(`ClashKing API response exceeds ${MAX_RESPONSE_BYTES} bytes`);
            }
            chunks.push(value);
        }
    }
    finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
};
const decodeText = (bytes) => new TextDecoder("utf-8", { fatal: true }).decode(bytes);
const errorPayload = async (response) => {
    const text = decodeText(await readBoundedBytes(response));
    if (text.length === 0)
        return undefined;
    try {
        return JSON.parse(text);
    }
    catch {
        return text;
    }
};
const successPayload = async (endpoint, response) => {
    if (response.status === 204)
        return undefined;
    switch (endpoint.responseMode) {
        case "arrayBuffer": {
            const bytes = await readBoundedBytes(response);
            return bytes.buffer;
        }
        case "blob": {
            const bytes = await readBoundedBytes(response);
            return new Blob([bytes.buffer], { type: response.headers.get("content-type") ?? "" });
        }
        case "json":
            return JSON.parse(decodeText(await readBoundedBytes(response)));
        case "none":
            return undefined;
        case "response":
            return response;
    }
};
export const createApiClient = (options) => {
    if (options.defaultTimeoutMs !== undefined
        && (!Number.isFinite(options.defaultTimeoutMs)
            || options.defaultTimeoutMs <= 0
            || options.defaultTimeoutMs > 2_147_483_647)) {
        throw new RangeError("defaultTimeoutMs must be a positive finite timer duration");
    }
    const executeWithStatus = (endpoint, input, executeOptions = {}) => Effect.suspend(() => {
        let disposeSignal = () => { };
        return Effect.gen(function* () {
            const [encodedBody, encodedPath, encodedQuery] = yield* Effect.all([
                encodeContractPart(endpoint.body, input.body, endpoint.operationId),
                encodeContractPart(endpoint.pathParams, input.path, endpoint.operationId),
                encodeContractPart(endpoint.query, input.query, endpoint.operationId),
            ], { concurrency: "unbounded" });
            const headers = new Headers({ accept: "application/json" });
            applyHeaders(headers, options.headers);
            applyHeaders(headers, executeOptions.headers);
            applyMetadata(headers, executeOptions.metadata);
            applyAuth(headers, executeOptions.auth ?? options.auth);
            if (endpoint.bodyMode === "json")
                headers.set("content-type", "application/json");
            if (endpoint.bodyMode === "text" && !headers.has("content-type"))
                headers.set("content-type", "text/plain; charset=utf-8");
            if (endpoint.bodyMode === "multipart")
                headers.delete("content-type");
            const request = yield* Effect.try({
                try: () => {
                    const timeoutMs = executeOptions.timeoutMs ?? options.defaultTimeoutMs;
                    const signalResource = requestSignal(timeoutMs === undefined
                        ? executeOptions
                        : { ...executeOptions, timeoutMs });
                    disposeSignal = signalResource.dispose;
                    const signal = signalResource.signal;
                    const requestInit = {
                        method: endpoint.method,
                        headers,
                        ...(endpoint.bodyMode === "json" ? { body: JSON.stringify(encodedBody) } : {}),
                        ...(endpoint.bodyMode === "multipart" ? { body: encodedBody } : {}),
                        ...(endpoint.bodyMode === "text" ? { body: encodedBody } : {}),
                        ...(options.credentials === undefined ? {} : { credentials: options.credentials }),
                        ...(signal === undefined ? {} : { signal }),
                    };
                    return new Request(buildEndpointUrl(executeOptions.baseUrl ?? options.baseUrl ?? "https://api.clashk.ing", endpoint.path, encodedPath, encodedQuery), requestInit);
                },
                catch: (cause) => new RequestBuildError({ cause, operationId: endpoint.operationId }),
            });
            const response = yield* options.transport.execute(request);
            if (!response.ok) {
                const payload = yield* Effect.tryPromise({
                    try: () => errorPayload(response),
                    catch: (cause) => new ResponseDecodeError({ cause, operationId: endpoint.operationId }),
                });
                const requestId = response.headers.get("x-request-id");
                return yield* new ApiResponseError({
                    status: response.status,
                    body: payload,
                    ...(requestId === null ? {} : { requestId }),
                });
            }
            const payload = yield* Effect.tryPromise({
                try: () => successPayload(endpoint, response),
                catch: (cause) => new ResponseDecodeError({ cause, operationId: endpoint.operationId }),
            });
            const value = yield* Schema.decodeUnknownEffect(endpoint.response)(payload).pipe(Effect.mapError((cause) => new ResponseDecodeError({ cause, operationId: endpoint.operationId })));
            return { status: response.status, value };
        }).pipe(Effect.ensuring(Effect.sync(() => disposeSignal())));
    });
    const execute = (endpoint, input, executeOptions = {}) => executeWithStatus(endpoint, input, executeOptions).pipe(Effect.map(({ value }) => value));
    const executeStatus = (endpoint, input, executeOptions = {}) => {
        const decodeDeclaredError = (error) => {
            const errorSpec = endpoint.errors?.find(({ status }) => status === error.status);
            if (errorSpec === undefined)
                return Effect.fail(error);
            return Schema.decodeUnknownEffect(errorSpec.body)(error.body).pipe(Effect.map((body) => ({
                ok: false,
                status: error.status,
                body,
                ...(error.requestId === undefined ? {} : { requestId: error.requestId }),
            })), Effect.mapError((cause) => new ResponseDecodeError({
                cause,
                operationId: endpoint.operationId,
            })));
        };
        return executeWithStatus(endpoint, input, executeOptions).pipe(Effect.map(({ status, value }) => ({ ok: true, status, value })), Effect.catchTag("ApiResponseError", decodeDeclaredError));
    };
    return { execute, executeStatus };
};
export const createAdminApiClient = (options = {}) => createApiClient({
    transport: httpTransport(options.fetcher),
    ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
    ...(options.defaultTimeoutMs === undefined ? {} : { defaultTimeoutMs: options.defaultTimeoutMs }),
    credentials: "include",
    headers: { "x-requested-with": "XMLHttpRequest" },
});
export const createBrowserApiClient = (options = {}) => createApiClient({
    transport: httpTransport(options.fetcher),
    ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
    ...(options.defaultTimeoutMs === undefined ? {} : { defaultTimeoutMs: options.defaultTimeoutMs }),
    credentials: "include",
});
