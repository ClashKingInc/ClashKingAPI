import { readFile } from "node:fs/promises"

const document = JSON.parse(await readFile(process.argv[2] ?? "dist/openapi.json", "utf8"))
let references = 0, operations = 0
const operationIds = new Set()
const visit = (value) => {
  if (value === null || typeof value !== "object") return
  if (typeof value.$ref === "string") {
    if (!value.$ref.startsWith("#/")) throw new Error(`Unexpected external reference ${value.$ref}`)
    const path = value.$ref.slice(2).split("/").map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    if (path.reduce((target, part) => target?.[part], document) === undefined) throw new Error(`Unresolved reference ${value.$ref}`)
    references++
  }
  for (const child of Object.values(value)) visit(child)
}
visit(document)
for (const [path, methods] of Object.entries(document.paths)) for (const [method, operation] of Object.entries(methods)) {
  if (!["get", "post", "put", "patch", "delete"].includes(method)) throw new Error(`Unexpected HTTP method ${method}`)
  if (operationIds.has(operation.operationId)) throw new Error(`Duplicate operation ID ${operation.operationId}`)
  operationIds.add(operation.operationId)
  const requiredNames = [...path.matchAll(/\{([^}]+)\}/gu)].map((match) => match[1]).sort()
  const actualNames = (operation.parameters ?? []).filter((parameter) => parameter.in === "path" && parameter.required).map((parameter) => parameter.name).sort()
  if (JSON.stringify(requiredNames) !== JSON.stringify(actualNames)) throw new Error(`Path parameter mismatch ${path}`)
  if (!Array.isArray(operation.security)) throw new Error(`Missing explicit security ${path}`)
  for (const requirement of operation.security) for (const name of Object.keys(requirement)) {
    if (!document.components.securitySchemes[name]) throw new Error(`Unknown security scheme ${name}`)
  }
  operations++
}
for (const path of ["/v2/stats/armies", "/v2/stats/items", "/v2/stats/ranked", "/v2/stats/war", "/v2/stats/cwl", "/v2/home/activity"]) {
  if (!document.paths[path]?.post) throw new Error(`Missing canonical POST ${path}`)
}
const exportContent = document.paths["/v2/exports/war/cwl-summary"]?.get.responses["200"].content
if (!exportContent?.["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]) throw new Error("Missing XLSX media type")
console.log(`Validated ${operations} OpenAPI operations and ${references} local schema references`)
