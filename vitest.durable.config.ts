import { cloudflareTest } from "@cloudflare/vitest-pool-workers"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [cloudflareTest({
    main: "./workers/api/test/durable/retained-entrypoint.ts",
    miniflare: {
      compatibilityDate: "2026-08-22",
      compatibilityFlags: ["nodejs_compat"],
      durableObjects: {
        SHARED_LINKS_LIMITER: { className: "SharedLinksRateLimiter", useSQLite: true },
      },
    },
  })],
  test: {
    include: ["workers/api/test/durable/shared-links-rate-limiter.test.ts"],
  },
})
