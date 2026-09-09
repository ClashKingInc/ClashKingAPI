import { defineConfig } from "vitest/config"
import { archiveAssetsPlugin } from "./workers/api/test/archive-assets-plugin.js"

export default defineConfig({ plugins: [archiveAssetsPlugin()], test: { include: ["workers/api/test/postgres/**/*.test.ts"] } })
