# `@clashking/api-contracts`

Browser- and Worker-safe Effect v4 schemas plus endpoint descriptors for the
canonical ClashKing `/v2` surface and the actively consumed `/proxy/v1` surface.
The package contains no environment access, credentials, database code, or
Node-only runtime imports.

Official Clash wire schemas used by `/proxy/v1` come from the exact
`@clashking/clash-contract` version generated in MockAPI. This package owns only
the ClashKing path, authentication, query, and response-transport definitions
around those imported schemas.

Every endpoint owns its method, path template, authentication mode,
path/query/body schemas, explicit JSON/multipart/no-body semantics, response
schema/mode, success status, and any expected business-error statuses. The six
former `QUERY` operations are exported only as `POST`.

```ts
import { endpoints, type EndpointResponse } from "@clashking/api-contracts"

type Response = EndpointResponse<typeof endpoints.statsArmies>
```

Release candidates use exact `0.1.0-rc.N` versions and npm's `rc` dist-tag.
Consumers pin an exact RC; stable releases follow semver and use `latest`.
