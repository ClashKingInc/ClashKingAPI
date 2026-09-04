import { build } from "esbuild"
import { Miniflare, convertV4MiniflareOptions } from "miniflare"
import { expect, it } from "vitest"

it("round-trips R2 media in workerd without exposing private keys or active MIME types", async () => {
  const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `
    import { Effect } from "effect";
    import { uploadMediaFile } from "./workers/api/src/dashboard-upload.ts";
    import { dispatchMedia } from "./workers/api/src/media-runtime.ts";
    export default { async fetch(request, env) {
      const path = new URL(request.url).pathname;
      const program = Effect.gen(function* () {
        if (path === "/fixture/upload") {
          const name = new URL(request.url).searchParams.get("name");
          const content = yield* Effect.promise(() => request.text());
          return Response.json(yield* uploadMediaFile(env, name, new File([content], name, {type:"text/html"})));
        }
        if (path === "/fixture/private") {
          yield* Effect.promise(() => env.MEDIA.put("uploads/base_private.png", "secret", {customMetadata:{visibility:"private-ticket",filename:"base_private.png"}}));
          return new Response(null,{status:204});
        }
        return (yield* dispatchMedia(request, env)) ?? new Response(null,{status:404});
      }).pipe(Effect.catch(error => Effect.succeed(Response.json({code:error._tag},{status:error._tag === "NotFound" ? 404 : error.status ?? 503}))));
      return Effect.runPromise(program);
    }};
  ` }, bundle: true, write: false, format: "esm", platform: "browser" })
  const script = bundle.outputFiles[0]?.text
  if (!script) throw new Error("Missing runtime bundle")
  const runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script, r2Buckets: ["MEDIA"],
    compatibilityDate: "2026-08-22", compatibilityFlags: ["nodejs_compat"],
  }))
  try {
    const upload = await runtime.dispatchFetch("https://media.test/fixture/upload?name=base_test.png", { method:"POST",body:"pixel-bytes" })
    expect(upload.status).toBe(200)
    expect(await upload.json()).toEqual({ url:"https://api.clashk.ing/v2/media/base_test.png", filename:"base_test.png" })
    const image = await runtime.dispatchFetch("https://media.test/v2/media/base_test.png")
    expect(image.status).toBe(200)
    expect(image.headers.get("content-type")).toBe("image/png")
    expect(image.headers.get("x-content-type-options")).toBe("nosniff")
    expect(await image.text()).toBe("pixel-bytes")
    const unchanged = await runtime.dispatchFetch("https://media.test/v2/media/base_test.png", { headers:{"if-none-match":image.headers.get("etag")!} })
    expect(unchanged.status).toBe(304)
    expect(await unchanged.text()).toBe("")
    const svg = "embed_70000000-0000-4000-8000-000000000001.svg"
    expect((await runtime.dispatchFetch(`https://media.test/fixture/upload?name=${svg}`,{method:"POST",body:"<svg onload='alert(1)'/>"})).status).toBe(200)
    const active = await runtime.dispatchFetch(`https://media.test/v2/media/${svg}`)
    expect(active.headers.get("content-type")).toBe("application/octet-stream")
    expect(active.headers.get("content-disposition")).toContain("attachment;")
    expect(active.headers.get("content-security-policy")).toContain("sandbox;")
    await runtime.dispatchFetch("https://media.test/fixture/private")
    for (const path of ["base_private.png", "base_missing.png", "..%2fprivate", "ticket.html", "base_test.png/extra"]) {
      expect((await runtime.dispatchFetch(`https://media.test/v2/media/${path}`)).status).toBe(404)
    }
    expect((await runtime.dispatchFetch("https://media.test/fixture/upload?name=base_test.png",{method:"POST",body:"overwrite"})).status).toBe(503)
    expect(await (await runtime.dispatchFetch("https://media.test/v2/media/base_test.png")).text()).toBe("pixel-bytes")
  } finally { await runtime.dispose() }
}, 30_000)
