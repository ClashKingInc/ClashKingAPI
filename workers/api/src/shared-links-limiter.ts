import { Context, Effect, Layer } from "effect"

import { InvalidRequest, UpstreamUnavailable } from "./errors.js"
import { WorkerEnvironment } from "./environment.js"
import type { SharedLinksLimitResult } from "./shared-links-rate-limiter.js"

export class SharedLinksLimiter extends Context.Service<
  SharedLinksLimiter,
  {
    readonly consume: (applicationId: string) => Effect.Effect<SharedLinksLimitResult, InvalidRequest | UpstreamUnavailable>
  }
>()("clashking/SharedLinksLimiter") {
  static readonly layer = Layer.effect(SharedLinksLimiter, Effect.gen(function* () {
    const bindings = yield* WorkerEnvironment
    return {
      consume: (applicationId: string) => {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(applicationId)) {
          return Effect.fail(new InvalidRequest({ message: "Invalid developer application identity" }))
        }
        return Effect.tryPromise({
          try: () => bindings.SHARED_LINKS_LIMITER.getByName(applicationId.toLowerCase()).consume(),
          catch: (cause) => new UpstreamUnavailable({ cause, message: "Shared-link rate limit is unavailable" }),
        })
      },
    }
  }))
}
