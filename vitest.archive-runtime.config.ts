import { defineConfig } from "vitest/config"
export default defineConfig({
  test: { include: ["workers/api/test/runtime/**/*.test.ts"], fileParallelism: false },
})
