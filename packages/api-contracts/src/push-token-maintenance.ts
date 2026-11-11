import { Schema } from "effect"
import { defineEndpoint, NoPathParams, NoQuery } from "./endpoint.js"

export const PushTokenRotationEndpoint = defineEndpoint({
  operationId: "rotatePushTokenEncryption", method: "POST", path: "/v2/internal/push-token-rotation", auth: "bot",
  summary: "Rotate stored push-token encryption using the separately enabled operator credential",
  pathParams: NoPathParams, query: NoQuery, bodyMode: "json",
  body: Schema.Struct({ action: Schema.optionalKey(Schema.Literals(["scan", "handoff"])), after: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(2048))), dryRun: Schema.Boolean }),
  responseMode: "json", successStatus: 200,
  response: Schema.Struct({ visited: Schema.Number, rotated: Schema.Number, current: Schema.Number,
    unreadable: Schema.Number, conflicts: Schema.Number, next: Schema.NullOr(Schema.String), wrappedCurrentKey: Schema.optionalKey(Schema.String) }),
})
