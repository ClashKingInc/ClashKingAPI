import { defineConfig } from "vitest/config"
export default defineConfig({
  test: {
    include: ["workers/api/test/runtime/**/*.test.ts"],
    // Deferred Bot queue work is not an active API/runtime acceptance lane.
    exclude: ["workers/api/test/runtime/ticket-queue.runtime.test.ts"],
    fileParallelism: false,
  },
})
