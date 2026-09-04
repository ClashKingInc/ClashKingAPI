# CDN uploads in the Worker

`POST /v2/cdn/upload` reuses the existing shared `dashboardCdnUpload` multipart descriptor. A valid user identity is required before consuming the request body. The `file` form field is required; the first file is used, matching the Go handler.

The existing 25 MiB file limit and extension allowlist are retained: png, jpg, jpeg, gif, webp, svg, mp4, mov, webm, mp3, ogg, wav, pdf, txt, and json. Extensions are lowercased, missing extensions are rejected as `.bin`, and original filenames never become storage keys. The generated name is `embed_<UUID>.<extension>`.

The shared multipart reader additionally caps the entire request at 26 MiB, including form fields and multipart overhead. It counts actual streamed bytes before parsing, cancels an oversized stream, and does not trust a missing or understated Content-Length. This bounded buffering rule is an explicit Worker resource constraint; exceeding either bound returns 413.

New uploads stream to the private `MEDIA` R2 binding (`clashking-media`) at `uploads/<filename>`, with conditional creation preventing overwrite and exact `public-media` visibility/filename metadata. Success returns `{url, filename}` with `https://api.clashk.ing/v2/media/<filename>` and an uncacheable upload response. Base and giveaway uploads retain their image-only filename restrictions. All server uploads authorize the caller before consuming multipart data.

The narrow public GET route accepts only generated media filenames and requires matching object metadata. It cannot list keys or read ticket objects. MIME types come from a server allowlist, never uploaded MIME metadata. SVG, PDF, text and JSON download as octet-stream attachments; responses include `nosniff` and sandbox CSP. Raster images/audio/video stream with explicit MIME types. Immutable objects support ETag revalidation and long-lived public caching.

`clashking-media` and separate `clashking-ticketing` were created empty through normal approval. Readback confirmed r2.dev disabled and no custom domains. Provider-default abort-incomplete-multipart after seven days does not expire completed objects; no object-retention rule was added. No production objects, historical copies, DNS or deployment were changed. The user approved anyone-with-an-unpredictable-link transcript access; the local private-R2 reader is implemented, while durable export/deletion and external logging-policy verification remain gated. See [transcript preparation](worker-ticket-transcripts.md).

Historical rollout prerequisite: inventory stored base/embed URLs and giveaway filename references, copy only specifically approved content to R2, and stamp verified provenance metadata before switching references. New code has no Bunny fallback. Existing Bunny objects and references have not been deleted or bulk rewritten; new-route implementation does not establish historical migration completion.

Provider failures use the central typed `UpstreamUnavailable` response (503). Provider details are never included in the public error. There is no blind retry or production upload in the tests.

`workers/api/src/cdn-upload.test.ts` covers all 15 extensions, authentication order, exact file bounds, missing/understated length with stream cancellation, unsupported files, safe generated paths, and mocked provider failure. `dashboard-upload.test.ts` covers the shared declared-body limit and conditional R2 writes. `workers/api/test/runtime/media.runtime.test.ts` exercises actual isolated workerd/R2 upload/read, private metadata denial, unsafe content disposition, traversal, missing objects, ETag304 and overwrite rejection. These are code/runtime tests, not visual tests.
