import { cloudflareTest } from "@cloudflare/vitest-pool-workers"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [cloudflareTest({
    main: "./workers/api/test/durable/entrypoint.ts",
    miniflare: {
      compatibilityDate: "2026-08-22",
      compatibilityFlags: ["nodejs_compat"],
      durableObjects: {
        SHARED_LINKS_LIMITER: { className: "SharedLinksRateLimiter", useSQLite: true },
        TICKET_RUNTIME: { className: "TicketRuntimeCoordinator", useSQLite: true },
        TICKET_RUNTIME_FIXTURE: { className: "TicketRuntimeFixture", useSQLite: true },
        RUNTIME_RECOVERY_FIXTURE: { className: "RuntimeRecoveryFixture", useSQLite: true },
      },
    },
  })],
  test: {
    include: ["workers/api/test/durable/**/*.test.ts"],
  },
})
