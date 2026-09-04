import { Schema } from "effect";
export type HttpMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
export type AuthMode = "admin" | "ai-metering" | "bot" | "developer" | "public" | "server-manager-read" | "server-manager-write" | "server-read" | "server-write" | "user" | "user-or-bot";
export type ContractSchema = Schema.Codec<unknown, unknown, never, never>;
export interface ErrorResponseSpec<Status extends number = number, Body extends ContractSchema = ContractSchema> {
    readonly body: Body;
    readonly status: Status;
}
export interface Endpoint<PathParams extends ContractSchema, Query extends ContractSchema, Body extends ContractSchema, Response extends ContractSchema, Errors extends ReadonlyArray<ErrorResponseSpec> = readonly []> {
    readonly auth: AuthMode;
    readonly body: Body;
    readonly bodyMode: "json" | "multipart" | "text" | "none";
    readonly errors?: Errors;
    readonly method: HttpMethod;
    readonly operationId: string;
    readonly path: `/proxy/v1/${string}` | `/v2/${string}`;
    readonly pathParams: PathParams;
    readonly query: Query;
    readonly response: Response;
    readonly responseMode: "arrayBuffer" | "blob" | "json" | "none" | "response";
    readonly responseContentType?: string;
    readonly successStatus: number;
    readonly summary: string;
}
export declare const defineEndpoint: <PathParams extends ContractSchema, Query extends ContractSchema, Body extends ContractSchema, Response extends ContractSchema, const Errors extends ReadonlyArray<ErrorResponseSpec> = readonly []>(endpoint: Endpoint<PathParams, Query, Body, Response, Errors>) => Endpoint<PathParams, Query, Body, Response, Errors>;
export type AnyEndpoint = Endpoint<ContractSchema, ContractSchema, ContractSchema, ContractSchema, ReadonlyArray<ErrorResponseSpec>>;
export interface EndpointRequest<E extends AnyEndpoint> {
    readonly body: E["body"]["Type"];
    readonly path: E["pathParams"]["Type"];
    readonly query: E["query"]["Type"];
}
export type EndpointResponse<E extends AnyEndpoint> = E["response"]["Type"];
type EndpointErrorSpec<E extends AnyEndpoint> = NonNullable<E["errors"]>[number];
export type EndpointErrorResult<E extends AnyEndpoint> = EndpointErrorSpec<E> extends infer Spec ? Spec extends ErrorResponseSpec<infer Status, infer Body> ? {
    readonly body: Body["Type"];
    readonly ok: false;
    readonly requestId?: string;
    readonly status: Status;
} : never : never;
export type EndpointStatusResult<E extends AnyEndpoint> = {
    readonly ok: true;
    readonly status: number;
    readonly value: EndpointResponse<E>;
} | EndpointErrorResult<E>;
export declare const NoBody: Schema.Struct<{}>;
export declare const NoContent: Schema.Void;
export declare const NoPathParams: Schema.Struct<{}>;
export declare const NoQuery: Schema.Struct<{}>;
export {};
//# sourceMappingURL=endpoint.d.ts.map