# Private transcript preparation

The September 4 overnight instruction allows implementation and disposable tests,
but prohibits deployments, package publication, production migrations, data writes,
DNS changes and new live infrastructure. Nothing in this document authorizes them.

The approved access policy is anyone with the link, without authentication. The
capability is a fresh random UUIDv4 for each transcript, not a ticket or channel ID.
Both channel and private-thread documents and copied attachments share that access
boundary. The bucket stays private and there is no listing route or arbitrary expiry.

Implemented read paths are `/v2/ticket-transcripts/:capability/channel.html`,
`thread.html`, and `attachments/:attachmentId`. They hash the capability into the
R2 prefix, require an explicit complete version-1 manifest and matching object
provenance, and stream bodies without SQL or public bucket access. The trusted
exporter must write the manifest last, only after all required bodies are durable.
That exporter and its deletion journal are **not implemented yet**; the existing
delete action remains gated. These routes currently have no production content.

Responses disable caching, indexing, referrers, framing and active content. Every
attachment is an octet-stream download regardless of its stored MIME type; filenames
are header-escaped, path/control characters sanitized, and Unicode truncated by
code point without splitting emoji. No supplied URL becomes an external hyperlink
or an automatically loaded resource in the draft HTML renderer.

The fetch entrypoint handles this namespace before service acquisition, CORS,
caller request-ID echoing and all application request/defect logging. Malformed
namespace paths follow the same quiet boundary. Invocation logging and automatic
tracing are explicitly disabled in the local Wrangler configuration because they
can record complete request URLs. Structured-log capture in actual Workerd proves
the local success, malformed-path and corrupt-manifest failure paths are quiet,
with an ordinary health request proving that capture observes application logs.
The Node entrypoint test also proves missing-storage failures bypass SQL and logs.

Cloudflare documents that [invocation logs contain request URLs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
and [automatic traces capture request and binding metadata](https://developers.cloudflare.com/workers/observability/traces/).
Before any later deployment, independently verify zone/WAF/Logpush/Tail and all
upstream request logging exclude these bearer URLs. Local configuration and tests
cannot establish external log policy, so this remains an explicit release gate.

The draft pull-based renderer preserves message text, author identity, time/edit
time, message type, textual embed fields/URLs, copied attachment references,
sticker names and reaction counts. It intentionally produces inert text-oriented
HTML rather than executable or externally loaded Discord styling. This is **not
yet full legacy export parity**: inventory and preserve embed authors/timestamps,
images/thumbnails/video references, replies/references, components and other
material message content before completing the exporter. Preserve that content
as escaped text or validated copied downloads; never expand into arbitrary URL
fetching. Unsupported content must not be silently dropped to fit this draft.

Still required: canonical channel/thread proof, stable snapshot cutoff, paginated
history, durable per-page/attachment checkpoints and fencing, safe Discord CDN
attachment copies, bounded rendering/upload recovery, protected durable capability
storage, final completion evidence, log-link publication and only then channel
deletion. All provider mutation tests must use fake Discord and disposable R2.
