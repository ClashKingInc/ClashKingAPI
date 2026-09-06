import { Schema } from "effect";
/** Liveness only: no database, provider, or deployment-readiness claim. */
export declare const HealthResponse: Schema.Struct<{
    readonly status: Schema.Literal<"ok">;
    readonly runtime: Schema.Literal<"cloudflare-worker">;
    readonly version: Schema.Literal<"0.1.0-rc.0">;
}>;
export declare const HealthEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly status: Schema.Literal<"ok">;
    readonly runtime: Schema.Literal<"cloudflare-worker">;
    readonly version: Schema.Literal<"0.1.0-rc.0">;
}>, readonly []>;
export type HealthResponse = typeof HealthResponse.Type;
//# sourceMappingURL=health.d.ts.map