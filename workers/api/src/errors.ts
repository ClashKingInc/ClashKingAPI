import { Data } from "effect"

export class InvalidRequest extends Data.TaggedError("InvalidRequest")<{
  readonly details?: ReadonlyArray<{ readonly field: string; readonly message: string }>
  readonly message: string
  readonly status?: 400 | 415
}> {}

export class Unauthenticated extends Data.TaggedError("Unauthenticated")<{
  readonly message: string
}> {}

export class Forbidden extends Data.TaggedError("Forbidden")<{
  readonly message: string
  readonly reason?: "roles" | "avatar" | "linked_account" | "not_member" | "wrong_message"
}> {}

export class NotFound extends Data.TaggedError("NotFound")<{
  readonly message: string
}> {}

export class NotImplemented extends Data.TaggedError("NotImplemented")<{
  readonly message: string
}> {}

export class RateLimited extends Data.TaggedError("RateLimited")<{
  readonly message: string
  readonly retryAfterSeconds: number
}> {}

export class Conflict extends Data.TaggedError("Conflict")<{
  readonly message: string
  readonly reason?: "not_open" | "invalid_configuration"
}> {}

export class PayloadTooLarge extends Data.TaggedError("PayloadTooLarge")<{
  readonly message: string
}> {}

export class UnprocessableEntity extends Data.TaggedError("UnprocessableEntity")<{
  readonly message: string
}> {}

export class UpstreamUnavailable extends Data.TaggedError("UpstreamUnavailable")<{
  readonly cause: unknown
  readonly message: string
}> {}

export class DatabaseFailure extends Data.TaggedError("DatabaseFailure")<{
  readonly cause: unknown
  readonly message: string
}> {}

export type ApiFailure =
  | Conflict
  | DatabaseFailure
  | Forbidden
  | InvalidRequest
  | NotFound
  | NotImplemented
  | RateLimited
  | PayloadTooLarge
  | UnprocessableEntity
  | Unauthenticated
  | UpstreamUnavailable
