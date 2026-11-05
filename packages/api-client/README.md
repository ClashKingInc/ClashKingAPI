# `@clashking/api-client`

Requires exactly Effect `4.0.0`. The API package versions remain independent
release candidates; stable Effect does not change their release channel.

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

const program = client.execute(endpoints.armySetups, {
  path: {},
  query: { "time[after]": "2026-08-01", "time[before]": "2026-08-31" },
  body: {},
})
```

`createBrowserApiClient` enables credentialed Dashboard/App cookie requests.
`createAdminApiClient` additionally sends Access's AJAX header.
`withUnauthorizedRefresh` single-flights refresh and performs exactly one replay
for non-auth 401s. Callers keep `Effect` values composable and use
`Effect.runPromise` only at UI, command, or Worker entry boundaries.
