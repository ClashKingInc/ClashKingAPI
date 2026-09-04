import { Schema } from "effect";
export declare const TenorMediaRequest: Schema.Struct<{
    readonly url: Schema.String;
}>;
export declare const TenorMediaResponse: Schema.Struct<{
    readonly provider: Schema.Literal<"tenor">;
    readonly id: Schema.String;
    readonly media_url: Schema.String;
    readonly width: Schema.Number;
    readonly height: Schema.Number;
}>;
export declare const TenorMediaEndpoint: import("./endpoint.js").Endpoint<Schema.Struct<{}>, Schema.Struct<{}>, Schema.Struct<{
    readonly url: Schema.String;
}>, Schema.Struct<{
    readonly provider: Schema.Literal<"tenor">;
    readonly id: Schema.String;
    readonly media_url: Schema.String;
    readonly width: Schema.Number;
    readonly height: Schema.Number;
}>, readonly []>;
export type TenorMediaRequest = typeof TenorMediaRequest.Type;
export type TenorMediaResponse = typeof TenorMediaResponse.Type;
//# sourceMappingURL=tenor.d.ts.map