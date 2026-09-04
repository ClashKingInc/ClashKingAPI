# `@clashking/api-client`

The shared Effect v4 client executes `@clashking/api-contracts` descriptors over
HTTP or a Cloudflare Service Binding. It owns URL interpolation, path/query/body
encoding, multipart boundaries, binary and empty responses, auth headers,
timeouts, credential modes, expected-status results, response validation, and
typed failures.

```ts
import { endpoints } from "@clashking/api-contracts"
import { createApiClient, serviceBindingTransport } from "@clashking/api-client"

const client = createApiClient({
  transport: serviceBindingTransport(env.CLASHKING_API),
  auth: { botToken: env.CLASHKING_API_TOKEN },
})

const program = client.execute(endpoints.statsArmies, {
  path: {},
  query: {},
  body: { start_date: "2026-08-01", end_date: "2026-09-01" },
})
```

`createBrowserApiClient` enables credentialed Dashboard/App cookie requests.
`createAdminApiClient` additionally sends Access's AJAX header.
`withUnauthorizedRefresh` single-flights refresh and performs exactly one replay
for non-auth 401s. Callers keep `Effect` values composable and use
`Effect.runPromise` only at UI, command, or Worker entry boundaries.
