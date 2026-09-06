import { expectTypeOf, it } from "vitest"

import type { DeferredRuntimeBindings, WorkerBindings, WorkerEnvironment } from "./environment.js"
import type worker from "./index.js"

it("keeps deferred coordinator namespaces out of active API binding types", () => {
  expectTypeOf<Extract<keyof WorkerBindings, "TICKET_RUNTIME" | "RUNTIME_RECOVERY">>().toEqualTypeOf<never>()
  expectTypeOf<Extract<keyof Cloudflare.Env, "TICKET_RUNTIME" | "RUNTIME_RECOVERY">>().toEqualTypeOf<never>()
  expectTypeOf<Parameters<typeof WorkerEnvironment.layer>[0]>().toEqualTypeOf<WorkerBindings>()
  expectTypeOf<Parameters<typeof worker.fetch>[1]>().toEqualTypeOf<WorkerBindings>()
  expectTypeOf<"TICKET_RUNTIME" extends keyof DeferredRuntimeBindings ? true : false>().toEqualTypeOf<true>()
  expectTypeOf<WorkerBindings extends DeferredRuntimeBindings ? true : false>().toEqualTypeOf<false>()
})
