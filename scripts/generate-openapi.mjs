import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { createHash } from "node:crypto"

import * as contracts from "@clashking/api-contracts"
import * as SchemaRepresentation from "effect/SchemaRepresentation"

const outputPath = resolve(process.argv[2] ?? "dist/openapi.json")
const schemaComponents = {}

const jsonSchema = (schema) => {
  const document = SchemaRepresentation.toJsonSchemaDocument(
    SchemaRepresentation.toRepresentation(schema.ast),
  )
  const prefix = createHash("sha256").update(JSON.stringify(document)).digest("hex").slice(0, 16)
  const names = new Map(Object.keys(document.definitions).map((name, index) => [name, `Schema_${prefix}_${index}`]))
  const rewrite = (value) => {
    if (Array.isArray(value)) return value.map(rewrite)
    if (value === null || typeof value !== "object") return value
    return Object.fromEntries(Object.entries(value).map(([key, child]) => {
      if (key === "$ref" && typeof child === "string" && child.startsWith("#/$defs/")) {
        const localName = child.slice("#/$defs/".length).replaceAll("~1", "/").replaceAll("~0", "~")
        const componentName = names.get(localName)
        if (componentName === undefined) throw new Error(`Unresolved schema definition ${child}`)
        return [key, `#/components/schemas/${componentName}`]
      }
      return [key, rewrite(child)]
    }))
  }
  for (const [name, value] of Object.entries(document.definitions)) schemaComponents[names.get(name)] = rewrite(value)
  return rewrite(document.schema)
}

const objectParameters = (schema, location) => {
  const compiled = jsonSchema(schema)
  const properties = compiled.properties ?? {}
  const required = new Set(compiled.required ?? [])
  return Object.entries(properties).map(([name, value]) => ({
    name,
    in: location,
    required: location === "path" || required.has(name),
    schema: value,
    ...(location === "query" && value.type === "array"
      ? { style: "form", explode: true }
      : {}),
  }))
}

const response = (description, schema, mode, contentType) => ({
  description,
  ...(mode === "none"
    ? {}
    : {
        content: {
          [contentType ?? (mode === "json" ? "application/json" : "application/octet-stream")]: {
            schema: mode === "json" ? jsonSchema(schema) : { type: "string", format: "binary" },
          },
        },
      }),
})

// Prefer the native/App contract when several consumers name the same wire operation.
// OpenAPI can expose only one operation per method/path, while the alias extension keeps
// every consumer-facing operation ID discoverable.
const endpointMaps = [
  contracts.expoEndpoints,
  contracts.dashboardEndpoints,
  contracts.botEndpoints,
  contracts.adminEndpoints,
  contracts.endpoints,
].filter((value) => value !== undefined)

const normalizedPath = (path) => path.replaceAll(/:([A-Za-z0-9_]+)/gu, "{}")

const endpoints = new Map()
for (const endpointMap of endpointMaps) {
  for (const endpoint of Object.values(endpointMap)) {
    // The proxy is an authenticated transport for first-party clients. Its wire
    // contract is documented by MockAPI, not as part of ClashKing's public API.
    if (endpoint.path.startsWith("/proxy/v1/")) continue
    if (endpoint.path.startsWith("/v2/runtime/")) {
      throw new Error(`Deferred bot runtime cannot be advertised in OpenAPI: ${endpoint.operationId}`)
    }
    if (/^\/v2\/server\/:[^/]+\/(?:roster-member-groups(?:\/:[^/]+)?|rosters\/:[^/]+\/member-groups)$/u.test(endpoint.path)) {
      throw new Error(`Deferred roster configuration cannot be advertised in OpenAPI: ${endpoint.operationId}`)
    }
    const key = `${endpoint.method} ${normalizedPath(endpoint.path)}`
    const existing = endpoints.get(key)
    if (existing !== undefined) {
      existing.aliases.add(endpoint.operationId)
      continue
    }
    endpoints.set(key, { endpoint, aliases: new Set([endpoint.operationId]) })
  }
}

const paths = {}
const security = (endpoint) => {
  if (endpoint.path === "/v2/auth/web/refresh") return [{ WebRefreshCookie: [] }]
  if (endpoint.path === "/v2/auth/web/logout") return [{ WebRefreshCookie: [] }, {}]
  switch (endpoint.auth) {
    case "public": return []
    case "admin": return [{ CloudflareAccess: [] }]
    case "admin-or-bot": return [{ CloudflareAccess: [] }, { BotToken: [] }]
    case "ai-metering": return [{ AiMetering: [] }]
    case "bot": return [{ BotToken: [] }]
    case "developer": return [{ DeveloperToken: [] }]
    case "user": return [{ UserToken: [] }]
    default: return [{ UserToken: [] }, { BotToken: [] }]
  }
}
for (const entry of [...endpoints.values()].sort((left, right) =>
  `${left.endpoint.path}:${left.endpoint.method}`.localeCompare(`${right.endpoint.path}:${right.endpoint.method}`),
)) {
  const endpoint = entry.endpoint
  const path = endpoint.path.replaceAll(/:([A-Za-z0-9_]+)/gu, "{$1}")
  const method = endpoint.method.toLowerCase()
  const operation = {
    operationId: endpoint.operationId,
    summary: endpoint.summary,
    tags: [endpoint.auth],
    security: security(endpoint),
    parameters: [
      ...objectParameters(endpoint.pathParams, "path"),
      ...objectParameters(endpoint.query, "query"),
      ...(endpoint.path.startsWith("/v2/auth/web/") ? [{ name: "Origin", in: "header", required: true, schema: { type: "string", format: "uri" }, description: "Must exactly match a configured web origin." }] : []),
      ...(endpoint.auth === "admin" ? [{ name: "X-Requested-With", in: "header", required: true, schema: { type: "string", const: "XMLHttpRequest" } }] : []),
      ...(endpoint.auth === "admin-or-bot" ? [{ name: "X-Requested-With", in: "header", required: false, schema: { type: "string", const: "XMLHttpRequest" }, description: "Required with Cloudflare Access; not required for a valid bot bearer token." }] : []),
    ],
    ...(endpoint.bodyMode === "none"
      ? {}
      : {
          requestBody: {
            required: true,
            content: {
              [endpoint.bodyMode === "json" ? "application/json" : endpoint.bodyMode === "text" ? "text/plain" : "multipart/form-data"]: {
                schema: jsonSchema(endpoint.body),
              },
            },
          },
        }),
    responses: {
      ...(endpoint.successStatus === null ? {} : {
        [endpoint.successStatus]: response("Success", endpoint.response, endpoint.responseMode, endpoint.responseContentType),
      }),
      ...Object.fromEntries((endpoint.errors ?? []).map((error) => [
        error.status,
        response("Expected error", error.body, "json"),
      ])),
    },
    "x-clashking-auth": endpoint.auth,
    ...(entry.aliases.size === 1 ? {} : { "x-clashking-operation-aliases": [...entry.aliases].sort() }),
  }
  if (operation.parameters.length === 0) delete operation.parameters
  paths[path] ??= {}
  if (paths[path][method] !== undefined) throw new Error(`Duplicate OpenAPI operation ${method} ${path}`)
  paths[path][method] = operation
}

const document = {
  openapi: "3.1.1",
  info: {
    title: "ClashKing API",
    version: "0.1.0-rc.0",
    description: `### Clash of Clans Based API 👑

- No Auth Required, Free to Use
- Please credit if using these stats in your project, Creator Code: ClashKing
- Not perfect, stats are collected by polling the Official API
- [ClashKing Discord](https://discord.gg/mCQkUBpUta) | [API Developers](https://discord.gg/clashapi)

This content is not affiliated with, endorsed, sponsored, or specifically approved by Supercell and Supercell is not responsible for it. For more information see [Supercell's Fan Content Policy](https://supercell.com/fan-content-policy)`,
  },
  servers: [{ url: "https://api.clashk.ing" }],
  paths,
  components: {
    schemas: schemaComponents,
    securitySchemes: {
      UserToken: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      BotToken: { type: "http", scheme: "bearer", description: "Configured API bot token." },
      DeveloperToken: { type: "http", scheme: "bearer", description: "Active developer application API key." },
      CloudflareAccess: { type: "apiKey", in: "header", name: "Cf-Access-Jwt-Assertion", description: "Verified Cloudflare Access identity admitted by the configured Access application." },
      AiMetering: { type: "apiKey", in: "header", name: "X-ClashKing-AI-Metering" },
      WebRefreshCookie: { type: "apiKey", in: "cookie", name: "ck_web_refresh" },
    },
  },
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`)
console.log(`Generated ${Object.keys(paths).length} paths from ${endpoints.size} operations at ${outputPath}`)
