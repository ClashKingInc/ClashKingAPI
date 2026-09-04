import { Schema } from "effect";
export declare const ErrorCode: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
export declare const FieldError: Schema.Struct<{
    readonly field: Schema.String;
    readonly message: Schema.String;
}>;
export declare const ErrorResponse: Schema.Struct<{
    readonly code: Schema.Literals<readonly ["invalid_request", "validation_failed", "unauthenticated", "forbidden", "not_found", "conflict", "rate_limited", "payload_too_large", "unprocessable_entity", "not_implemented", "upstream_unavailable", "internal_error"]>;
    readonly message: Schema.String;
    readonly request_id: Schema.optionalKey<Schema.String>;
    readonly details: Schema.optionalKey<Schema.$Array<Schema.Struct<{
        readonly field: Schema.String;
        readonly message: Schema.String;
    }>>>;
}>;
export type ErrorCode = typeof ErrorCode.Type;
export type ErrorResponse = typeof ErrorResponse.Type;
export type FieldError = typeof FieldError.Type;
//# sourceMappingURL=errors.d.ts.map