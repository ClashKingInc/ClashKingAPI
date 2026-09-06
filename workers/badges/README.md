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

## Optional signed token hint

A trusted API can include a badge token when the Worker's tag-to-token cache and database do not have one:

```text
X-ClashKing-Badge-Token: TOKEN
X-ClashKing-Badge-Signature: BASE64URL_SIGNATURE
```

The signature is an HMAC-SHA256 of these UTF-8 bytes, encoded as unpadded base64url:

```text
v1\nTAG_WITHOUT_HASH\nTOKEN
```

The tag is uppercase. Both services must use the same `BADGE_HINT_SECRET`, which must be at least 32 characters. Set it as a Worker secret before deploying:

```sh
npx wrangler secret put BADGE_HINT_SECRET
```

A valid hint is used only when the Worker has no positive tag-to-token mapping. When the request reaches the Worker, it can replace a recent missing-tag result or cover a database failure, and it is stored in KV for one day. It is never written to Postgres. Invalid hints are ignored.

The hint headers do not change the public cache key and are not included in `Vary`, so cached responses are still shared by tag, format, and size.

## Cache layers

Cloudflare's tiered Workers Cache serves warm public responses before Worker code runs. On a miss, the Worker uses KV for tag-to-token mappings and converted badge files. Positive mappings live for one day, missing mappings live for five minutes, and badge files are reused across clan tags when they share the same token.

Missing-tag placeholder responses are publicly cached for one hour, while missing token mappings remain in KV for five minutes. A cached placeholder can delay a valid signed hint for up to one hour because the public cache answers before the Worker checks hint headers. Database-error placeholders remain uncached.
