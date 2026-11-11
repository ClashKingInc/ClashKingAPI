# Push-token encryption rotation

Push tokens are encrypted at rest. This does not rotate Firebase device tokens,
log users out, or change notification preferences.

- `MOBILE_PUSH_TOKEN_ENCRYPTION_KEY` is the dedicated shared write/read key.
  With it set, API registration writes `v2.` ciphertext.
- `DATA_ENCRYPTION_KEY` remains unchanged for unrelated credentials. The API
  also uses it to read the previous generation of `v1.` push tokens.
- `MOBILE_PUSH_LEGACY_ENCRYPTION_KEY` is an optional API-only older key, used to
  read `v1.` tokens written before the existing API key changed.
- Tracking reads `v2.` with the dedicated key and retains its old
  `DATA_ENCRYPTION_KEY` as a `v1.` fallback during rollout.

## Rollout

1. Store a new random shared push key in the existing secret stores.
2. Configure and deploy the notification worker with that key first.
3. Configure and deploy the API with the same key and any retained legacy key.
4. Temporarily set `PUSH_TOKEN_MIGRATION_SECRET` to a separate random secret.
5. Call `POST /v2/internal/push-token-rotation` with the normal internal bearer
   credential plus `x-push-token-migration-key`. Begin with `{"dryRun":true}`;
   follow each returned `next` using `after`. Inspect unreadable counts first.
6. Repeat with `{"dryRun":false}`. Each request processes at most 100 records.
7. Repeat the dry run and verify all readable records are current.
8. Remove `PUSH_TOKEN_MIGRATION_SECRET`. Without it the route returns 404.

The operation verifies plaintext against the stored token hash before writing.
It changes only ciphertext and compares the old ciphertext/hash in the update,
so it cannot overwrite a concurrent fresh registration. Unreadable records are
left untouched. The response contains counts and an opaque pagination cursor,
never plaintext tokens or encryption keys. No notification is sent by rotation.

## Rollback

After any v2 record is written, retain v2-capable API/Tracking code and the
shared push key. Reverting to v1-only readers would break those records. The old
keys remain usable for unreadable/unfinished rows; do not overwrite the shared
`DATA_ENCRYPTION_KEY` as part of this migration.

## Verification

`scripts/e2e/push-token-rotation.mjs` exercises real local API HTTP and disposable
Timescale for two legacy keys, current v2 rows, corrupt/unknown rows, both
credentials, dry runs, pagination, idempotent reruns, and preservation of hashes,
settings and timestamps. Tracking's real manual/mobile-routing service check
covers v1 and v2 deliveries through local FCM HTTP and canonical disposable stores.
