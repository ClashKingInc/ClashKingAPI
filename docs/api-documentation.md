# Public API documentation in the API Worker

The presentation was originally reconciled against API revision
`cf7371e4a32b4a37afd7c80ff83c72ef29b425e4`. The retired implementation and its
generated OpenAPI files are no longer kept in this repository. The current
templates retain the ClashKing presentation, Scalar 1.63.0 and Swagger UI
5.32.11. No frontend app or additional Worker is included here.

## Retained behavior

- GET/HEAD `/`, `/docs` and `/docs/*` serve Scalar.
- GET/HEAD `/swagger` and `/swagger/` redirect with 307 to `/swagger/index.html`.
  Only that exact index serves Swagger; other children remain 404.
- GET/HEAD `/redoc` redirects with 307 to `/`.
- GET/HEAD `/openapi.json`, `/openapi.scalar.json` and `/openapi.yaml` serve the
  current public schema. The first two return the same document: there is no
  longer a QUERY-specific schema or browser request-rewriting workaround.
- Responses preserve no-store/no-cache/private policy. The narrow handler
  runs before SQL/auth/provider service construction, forwards no caller
  headers to the asset binding, and does not accept arbitrary asset paths.

The generated ClashKing schema omits `/proxy/v1/*`; MockAPI owns and documents
the Clash wire contract used by those authenticated first-party routes. The
public projection also omits the Admin application's newly moved private
operations, as the original API reference did. The original two Tracking
summary/timeseries reads remain documented. Unreferenced schema/security
components are removed from this public projection as well. The generated
`dist/openapi.json` remains available locally for tooling; it is not served.
This is documentation scope, not a substitute for endpoint authorization.
Feature navigation preserves the original method/path tags and tag order from
the pinned public specification. A compact checked-in source map and explicit
new-path mappings drive that projection; unknown paths fail instead of silently
moving into an authentication-category bucket. Both viewers preserve the Links
operation order using the current path parameter names.

## Build and verification

`npm run docs:build` builds the current contract package, generates ClashKing
OpenAPI, creates the filtered public JSON/YAML, and copies the preserved viewer
templates into `workers/api/documentation-assets`. Only four explicitly named
files are allowed in that directory; an unexpected file fails the build.
Generated output is ignored by Git and must be rebuilt from source. Worker
build/dry-run and local runtime-test scripts run this step automatically.

The `API_DOCUMENTATION` asset binding serves those four files inside the same
Worker. `run_worker_first: true` keeps business requests and unknown paths in
the API router; no directory/SPA fallback bypasses it. Generation and local
deployment dry runs do not upload assets or deploy anything.

Tests cover generation, public/private filtering, component references, YAML
scalars, fixed path/credential handling, status codes and headers. The actual
Worker entrypoint test uses local Workerd with the real generated asset binding,
a strict database sentinel and forbidden external network access. It exercises
the documentation paths alongside the API and transcript boundaries. No visual
test or real CDN/browser request was performed; viewer dependency URLs remain
the existing pinned public URLs.

Release must build these assets before deployment, verify their served content,
and retain the no-deployment restriction until separately authorized.
