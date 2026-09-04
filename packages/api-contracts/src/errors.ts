import { Schema } from "effect"

export const ErrorCode = Schema.Literals([
  "invalid_request",
  "validation_failed",
  "unauthenticated",
  "forbidden",
  "not_found",
  "conflict",
  "rate_limited",
  "payload_too_large",
  "unprocessable_entity",
  "not_implemented",
  "upstream_unavailable",
  "internal_error",
])

export const FieldError = Schema.Struct({
  field: Schema.String,
  message: Schema.String,
})

export const ErrorResponse = Schema.Struct({
  code: ErrorCode,
  message: Schema.String,
  request_id: Schema.optionalKey(Schema.String),
  details: Schema.optionalKey(Schema.Array(FieldError)),
})

export type ErrorCode = typeof ErrorCode.Type
export type ErrorResponse = typeof ErrorResponse.Type
export type FieldError = typeof FieldError.Type
