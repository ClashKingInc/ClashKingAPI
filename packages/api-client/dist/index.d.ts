import type { AnyEndpoint, EndpointRequest, EndpointResponse, EndpointStatusResult } from "@clashking/api-contracts";
import { Effect } from "effect";
export interface ApiBinding {
    fetch(request: Request): Promise<Response>;
}
export interface ApiTransport {
    execute(request: Request): Effect.Effect<Response, TransportError>;
}
export interface ApiAuth {
    readonly bearerToken?: string;
    readonly botToken?: string;
    readonly deviceId?: string;
}
export interface ApiRequestMetadata {
    readonly requestId?: string;
    readonly traceparent?: string;
    readonly tracestate?: string;
}
declare const TransportError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "TransportError";
} & Readonly<A>;
export declare class TransportError extends TransportError_base<{
    readonly cause: unknown;
    readonly message: string;
}> {
}
declare const ApiResponseError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "ApiResponseError";
} & Readonly<A>;
export declare class ApiResponseError extends ApiResponseError_base<{
    readonly body: unknown;
    readonly requestId?: string;
    readonly status: number;
}> {
}
declare const ResponseDecodeError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "ResponseDecodeError";
} & Readonly<A>;
export declare class ResponseDecodeError extends ResponseDecodeError_base<{
    readonly cause: unknown;
    readonly operationId: string;
}> {
}
declare const RequestBuildError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "RequestBuildError";
} & Readonly<A>;
export declare class RequestBuildError extends RequestBuildError_base<{
    readonly cause: unknown;
    readonly operationId: string;
}> {
}
export type ApiClientError = ApiResponseError | RequestBuildError | ResponseDecodeError | TransportError;
export type ApiStatusResult<E extends AnyEndpoint> = EndpointStatusResult<E>;
export declare const MAX_RESPONSE_BYTES: number;
export declare const httpTransport: (fetcher?: typeof fetch) => ApiTransport;
export declare const serviceBindingTransport: (binding: ApiBinding) => ApiTransport;
export interface UnauthorizedRefreshOptions {
    readonly authorizeReplay?: (request: Request) => Promise<Request> | Request;
    readonly refresh: () => Promise<void>;
    readonly shouldRefresh?: (request: Request) => boolean;
    readonly transport: ApiTransport;
}
export declare const withUnauthorizedRefresh: (options: UnauthorizedRefreshOptions) => ApiTransport;
export interface ApiClientOptions {
    readonly auth?: ApiAuth;
    readonly baseUrl?: string;
    readonly credentials?: RequestCredentials;
    readonly defaultTimeoutMs?: number;
    readonly headers?: Readonly<Record<string, string>>;
    readonly transport: ApiTransport;
}
export interface ExecuteOptions {
    readonly auth?: ApiAuth;
    readonly baseUrl?: string;
    readonly headers?: Readonly<Record<string, string>>;
    readonly metadata?: ApiRequestMetadata;
    readonly signal?: AbortSignal;
    readonly timeoutMs?: number;
}
export interface AdminApiClientOptions {
    readonly baseUrl?: string;
    readonly defaultTimeoutMs?: number;
    readonly fetcher?: typeof fetch;
}
export type BrowserApiClientOptions = AdminApiClientOptions;
export declare const buildEndpointUrl: (baseUrl: string, pathTemplate: `/proxy/v1/${string}` | `/v2/${string}`, encodedPath: unknown, encodedQuery: unknown) => URL;
export declare const createApiClient: (options: ApiClientOptions) => {
    execute: <E extends AnyEndpoint>(endpoint: E, input: EndpointRequest<E>, executeOptions?: ExecuteOptions) => Effect.Effect<EndpointResponse<E>, ApiClientError>;
    executeStatus: <E extends AnyEndpoint>(endpoint: E, input: EndpointRequest<E>, executeOptions?: ExecuteOptions) => Effect.Effect<ApiStatusResult<E>, ApiClientError>;
};
export declare const createAdminApiClient: (options?: AdminApiClientOptions) => {
    execute: <E extends AnyEndpoint>(endpoint: E, input: EndpointRequest<E>, executeOptions?: ExecuteOptions) => Effect.Effect<EndpointResponse<E>, ApiClientError>;
    executeStatus: <E extends AnyEndpoint>(endpoint: E, input: EndpointRequest<E>, executeOptions?: ExecuteOptions) => Effect.Effect<ApiStatusResult<E>, ApiClientError>;
};
export declare const createBrowserApiClient: (options?: BrowserApiClientOptions) => {
    execute: <E extends AnyEndpoint>(endpoint: E, input: EndpointRequest<E>, executeOptions?: ExecuteOptions) => Effect.Effect<EndpointResponse<E>, ApiClientError>;
    executeStatus: <E extends AnyEndpoint>(endpoint: E, input: EndpointRequest<E>, executeOptions?: ExecuteOptions) => Effect.Effect<ApiStatusResult<E>, ApiClientError>;
};
export {};
//# sourceMappingURL=index.d.ts.map