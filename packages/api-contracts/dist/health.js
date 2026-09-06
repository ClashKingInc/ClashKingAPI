import { Schema } from "effect";
import { defineEndpoint, NoBody, NoPathParams, NoQuery } from "./endpoint.js";
/** Liveness only: no database, provider, or deployment-readiness claim. */
export const HealthResponse = Schema.Struct({
    status: Schema.Literal("ok"),
    runtime: Schema.Literal("cloudflare-worker"),
    version: Schema.Literal("0.1.0-rc.0"),
});
export const HealthEndpoint = defineEndpoint({
    operationId: "workerHealth",
    method: "GET",
    path: "/v2/health",
    auth: "public",
    summary: "Worker liveness only; does not check database or provider readiness",
    body: NoBody,
    bodyMode: "none",
    pathParams: NoPathParams,
    query: NoQuery,
    response: HealthResponse,
    responseMode: "json",
    successStatus: 200,
});
