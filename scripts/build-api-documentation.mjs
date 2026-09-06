import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { applyFeatureNavigation } from "./api-documentation-navigation.mjs"

// Deliberately supports only JSON values, which is the complete OpenAPI input.
// Quoted scalar keys/strings avoid YAML's implicit date/boolean/tag conversion.
export function jsonToYaml(value, indent = 0) {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  const entries = Array.isArray(value) ? value.map(item => [null, item]) : Object.entries(value)
  if (entries.length === 0) return Array.isArray(value) ? "[]" : "{}"
  return entries.map(([key, child]) => {
    const prefix = `${" ".repeat(indent)}${key === null ? "-" : `${JSON.stringify(key)}:`}`
    const nested = child !== null && typeof child === "object" && Object.keys(child).length > 0
    return nested ? `${prefix}\n${jsonToYaml(child, indent + 2)}` : `${prefix} ${jsonToYaml(child)}`
  }).join("\n")
}

// Admin's moved application routes were not in the Go public specification.
// Keep the full internal artifact for tooling, but publish only the original
// two service health reads and remove components used solely by private routes.
export function publicApiDocument(document) {
  const publicTracking = new Set(["/v2/admin/tracking/summary", "/v2/admin/tracking/timeseries"])
  const paths = Object.fromEntries(Object.entries(document.paths).flatMap(([path, methods]) => {
    if (!path.startsWith("/v2/admin/")) return [[path, methods]]
    return publicTracking.has(path) && methods.get ? [[path, { get: methods.get }]] : []
  }))
  const { components: original = {}, ...metadata } = document
  const result = { ...metadata, paths, components: {} }
  const seen = new Set()
  const retain = (group, name) => {
    const key = `${group}/${name}`
    if (seen.has(key)) return
    if (!Object.hasOwn(original, group) || !Object.hasOwn(original[group], name)) throw new Error(`Missing public OpenAPI component ${key}`)
    seen.add(key)
    result.components[group] ??= {}
    result.components[group][name] = original[group][name]
    visit(original[group][name])
  }
  const visit = (value) => {
    if (!value || typeof value !== "object") return
    if (typeof value.$ref === "string") {
      const match = /^#\/components\/([^/]+)\/([^/]+)$/u.exec(value.$ref)
      if (!match) throw new Error(`Unexpected public OpenAPI reference ${value.$ref}`)
      retain(...match.slice(1).map(part => part.replaceAll("~1", "/").replaceAll("~0", "~")))
    }
    if (Array.isArray(value.security)) {
      for (const requirement of value.security) for (const name of Object.keys(requirement)) retain("securitySchemes", name)
    }
    for (const child of Object.values(value)) visit(child)
  }
  visit({ ...metadata, paths })
  return result
}

export async function buildApiDocumentation(root, destination = resolve(root, "workers/api/documentation-assets"), source = resolve(root, "dist/openapi.json")) {
  const complete = JSON.parse(await readFile(source, "utf8"))
  if (complete.openapi !== "3.1.1" || !complete.paths?.["/v2/health"]) throw new Error("Generate the current API OpenAPI document first")
  const document = applyFeatureNavigation(publicApiDocument(complete))
  const json = `${JSON.stringify(document, null, 2)}\n`
  const names = ["openapi.json", "openapi.yaml", "scalar.html", "swagger.html"]
  await mkdir(destination, { recursive: true })
  for (const name of await readdir(destination)) {
    if (!names.includes(name)) throw new Error(`Unexpected documentation asset: ${name}; refusing to include unrelated files`)
  }
  await writeFile(resolve(destination, "openapi.json"), json)
  await writeFile(resolve(destination, "openapi.yaml"), `${jsonToYaml(document)}\n`)
  for (const name of ["scalar.html", "swagger.html"]) {
    const html = await readFile(resolve(root, "workers/api/documentation", name), "utf8")
    if (html.includes("{{") || /method:\s*["']QUERY["']/u.test(html)) throw new Error("Unresolved or retired documentation template code")
    await writeFile(resolve(destination, name), html)
  }
  return names
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const root = resolve(process.argv[2] ?? ".")
  const names = await buildApiDocumentation(root)
  console.log(`Prepared ${names.length} API documentation assets; no upload performed`)
}
