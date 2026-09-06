const headers = () => new Headers({
  "cache-control": "no-store, no-cache, must-revalidate, private", pragma: "no-cache", expires: "0",
  "x-content-type-options": "nosniff", "referrer-policy": "no-referrer",
})
export const isApiDocumentationRequest = (request: Request): boolean => {
  const path = new URL(request.url).pathname
  return ["/", "/docs", "/swagger", "/redoc", "/openapi.json", "/openapi.yaml", "/openapi.scalar.json"].includes(path)
    || path.startsWith("/docs/") || path.startsWith("/swagger/")
}

/** Same-Worker public docs; never construct database/auth/provider services. */
export async function serveApiDocumentation(request: Request, assets: Fetcher): Promise<Response> {
  const path = new URL(request.url).pathname
  const head = request.method === "HEAD"
  const responseHeaders = headers()
  if (request.method !== "GET" && !head) return new Response(null, { status: 404, headers: responseHeaders })
  if (path === "/swagger" || path === "/swagger/" || path === "/redoc") {
    responseHeaders.set("location", path === "/redoc" ? "/" : "/swagger/index.html")
    return new Response(null, { status: 307, headers: responseHeaders })
  }
  const file = path === "/" || path === "/docs" || path.startsWith("/docs/") ? "scalar.html"
    : path === "/swagger/index.html" ? "swagger.html"
    : path === "/openapi.yaml" ? "openapi.yaml"
    : path === "/openapi.json" || path === "/openapi.scalar.json" ? "openapi.json" : undefined
  if (!file) return new Response(null, { status: 404, headers: responseHeaders })
  try {
    // Do not forward cookies, Authorization, Range or caller-chosen paths.
    const response = await assets.fetch(new Request(`https://api-documentation.invalid/${file}`, { method: head ? "HEAD" : "GET" }))
    if (response.status !== 200) {
      await response.body?.cancel()
      return new Response(null, { status: 503, headers: responseHeaders })
    }
    responseHeaders.set("content-type", file.endsWith(".html") ? "text/html; charset=utf-8"
      : file.endsWith(".yaml") ? "application/yaml" : "application/json")
    return new Response(head ? null : response.body, { headers: responseHeaders })
  } catch { return new Response(null, { status: 503, headers: responseHeaders }) }
}
