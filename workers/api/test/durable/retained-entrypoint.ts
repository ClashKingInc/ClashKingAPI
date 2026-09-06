export { SharedLinksRateLimiter } from "../../src/shared-links-rate-limiter.js"

export default {
  fetch: () => new Response("Retained API test fixture", { status: 404 }),
}
