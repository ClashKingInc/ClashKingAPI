# ClashKing Badges Worker

The Worker serves clan badges from `badges.clashk.ing` and uses Cloudflare's tiered Workers Cache for public responses. A successful badge response is cached for one day by its URL, so the public cache key is the clan tag, file format, and `size` query parameter.

## Requests

Requests must include either `.png` or `.avif`:

```text
https://badges.clashk.ing/P0Y.png?size=64
https://badges.clashk.ing/P0Y.avif?size=medium
```

Supported sizes are `small`, `medium`, `large`, `64`, `128`, `256`, and `512`. When `size` is omitted, the Worker uses `small`. No other query parameters are accepted.

The named sizes remain compatible with existing callers:

- `small` is 70 pixels.
- `medium` is 200 pixels.
- `large` is 512 pixels.

Numeric sizes use the nearest larger badge available from the Clash API and resize it to the requested size. The Worker never upscales beyond the upstream 512-pixel badge.

## Optional token hint

The App may send a badge token it already has in one optional header:

```text
X-ClashKing-Badge-Token: TOKEN
```

Tokens must contain only ASCII letters, digits, `_`, or `-`, be nonempty, be at most 512 characters, and must not be the placeholder token `null`. Invalid hints are ignored. No signature, shared secret, or additional API response contract is required.

A hint is used only when the Worker has no positive tag-to-token mapping. When the request reaches the Worker, it can replace a recent missing-tag result or cover a database null/error, and it is stored in KV for one day. It never replaces a known positive mapping and is never written to Postgres. The Dashboard does not use hints.

The token header does not change the public cache key and is not included in `Vary`, so cached responses are shared by tag, format, and size. Hints are caller-supplied and are not authenticated; a syntactically valid hint can seed a missing mapping even if it belongs to a different clan.

## Cache layers

Cloudflare's tiered Workers Cache serves warm public responses before Worker code runs. On a miss, the Worker uses KV for tag-to-token mappings and converted badge files. Positive mappings live for one day, missing mappings live for five minutes, and badge files are reused across clan tags when they share the same token.

Missing-tag placeholder responses are publicly cached for one hour, while missing token mappings remain in KV for five minutes. A cached placeholder can delay a valid token hint for up to one hour because the public cache answers before the Worker checks the token header. Database-error placeholders remain uncached.
