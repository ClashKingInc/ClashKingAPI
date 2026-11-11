# Clan rosters in Links

`GET /v2/links/server/:serverId/clans` reads configured clan tags and categories
from SQL, then gets their current profiles from the live Tracking snapshots.
It joins player links and current Discord membership after choosing the roster.

The cache key is `trackedclans:snapshot:clan:<tag>`. Tracking writes the full
Clash clan response as a Snappy block. The API reads the keys directly through
the `CLAN_CACHE_NETWORK` VPC Network binding on the existing private tunnel.
It never changes the snapshots, their expiry, or Tracking's polling routes.

An absent, corrupt, or incomplete snapshot falls back to the existing Clash API
proxy. An empty `memberList` is a valid snapshot and does not trigger fallback.
Cache reads are batched in groups of 25, with three concurrent connections,
a 1.5-second cache deadline, a 2 MiB decompressed clan limit, and an 8 MiB reply
limit per batch. The upstream API fallback also has bounded concurrency.

The member list, names, tags, Town Hall levels, and displayed clan identity
come from the chosen profile. `basic_clan.members` and `basic_player` are not
fallback roster sources. `last_active` does not describe this live snapshot,
so the compatible `observedAt` field is null.

Creating a roster link uses the same cache/API profile to check membership.
The recipient must still be a current Discord member. SQL locks recheck that
the clan remains configured and protect existing account ownership.

## Configuration and release

- `CLAN_CACHE_NETWORK`: existing tunnel VPC Network binding.
- `CLAN_CACHE_HOST`, `CLAN_CACHE_PORT`: fixed private Valkey destination.
- `CLAN_CACHE_PREFIX`: Tracking's configured snapshot prefix.
- `CLAN_CACHE_PASSWORD`: secret copied from the existing canonical Valkey
  credential; do not store it in Wrangler variables or logs.

Deploy the merged API before the Dashboard release. No database migration,
new public route, proxy deployment, or Tracking deployment is required.
The old Worker remains compatible for rollback; the reader creates no cache
or schema state to reverse.

## Local verification

The local runner maps the same TCP reader to a real loopback Valkey instance.
It accepts `CLASHKING_LOCAL_VALKEY_URL`; the disposable integration harness
supplies its own `TEST_VALKEY_URL` instead.

Run the focused HTTP/SQL/Valkey suite through the canonical schema harness:

```sh
bash "$SCHEMA_ROOT/scripts/with-test-integration.sh" --profile retained-api -- node scripts/e2e/run-clan-links.mjs
```

The suite checks cached and empty rosters, stale SQL data, API fallback for
missing/corrupt cache, hidden links, scoped permissions, and link creation.
