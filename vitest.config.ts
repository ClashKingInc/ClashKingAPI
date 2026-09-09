import { defineConfig } from "vitest/config"
import { archiveAssetsPlugin } from "./workers/api/test/archive-assets-plugin.js"

export default defineConfig({
  plugins: [archiveAssetsPlugin()],
  test: {
    include: ["packages/**/*.test.ts", "workers/api/**/*.test.ts"],
    exclude: ["**/node_modules/**", "workers/api/test/durable/**", "workers/api/test/postgres/**", "workers/api/test/runtime/**"],
  },
})
