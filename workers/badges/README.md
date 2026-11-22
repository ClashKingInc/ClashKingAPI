# ClashKing Badges Worker

The Worker serves clan badges from `badges.clashk.ing` and uses Cloudflare's tiered Workers Cache for public responses. Public responses are cached for **6 days** (`518400s`) with **1 day** of background refresh (`stale-while-revalidate=86400`) and **30 days** of error resilience (`stale-if-error=2592000`), keyed by the clan tag, file format, and `size` query parameter.

## Requests

Requests must include either `.png` or `.avif`:

```text
https://badges.clashk.ing/P0Y.png?size=medium
https://badges.clashk.ing/P0Y.avif?size=small
```

Canonical sizes are `small`, `medium`, and `large`. When `size` is omitted, the Worker uses `small`. No other query parameters are accepted.

- `small` is 70 pixels.
- `medium` is 200 pixels.
- `large` is 512 pixels.

Legacy numeric sizes remain accepted during migration (`64` → `small`, `128` / `256` → `medium`, `512` → `large`), and all callers should use `small`, `medium`, or `large`.

PNG responses are **never transformed** — they serve Supercell's native `70`, `200`, or `512` pixel PNG directly. AVIF responses encode those exact three native sizes at quality `45` with no resize step.

## Optional token header

Callers that already have a clan's badge token may send it in one optional header:

```text
X-ClashKing-Badge-Token: TOKEN
```

Tokens must contain only ASCII letters, digits, `_`, or `-`, be nonempty, be at most 512 characters, and must not be the placeholder token `null`. Invalid headers are ignored.

When a request misses Cloudflare's Tiered Cache and carries a valid `X-ClashKing-Badge-Token`, the Worker skips the Postgres lookup and loads the badge asset directly. The header does not change the public cache key and is not included in `Vary`.

## Cache layers

1. **Cloudflare Tiered Workers Cache (6d fresh + 1d SWR):** Serves warm public responses across regions before Worker code runs — including missing-clan default shields returned when Postgres has no token for a tag.
2. **KV `BADGE_CACHE` (permanent storage + 30-day PoP `cacheTtl`):** Stores only badge image files (`asset:v1:png:<pixels>:<token>` and `asset:v1:avif:q45:<pixels>:<token>`), shared across all clans using the same token. No tag-to-token mappings are read from or written to KV.

Database errors and upstream Supercell fallback errors are returned with `Cache-Control: no-store`.
