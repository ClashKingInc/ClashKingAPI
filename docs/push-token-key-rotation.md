# Align push tokens with the existing API encryption key

The API's existing `DATA_ENCRYPTION_KEY` remains authoritative. No third
persistent encryption key or new ciphertext format is introduced. Firebase
phone tokens and the app registration endpoint are unchanged.

The API temporarily accepts `MOBILE_PUSH_LEGACY_ENCRYPTION_KEY` to read older
records. Tracking uses `DATA_ENCRYPTION_KEY` first and may retain its former key
as `MOBILE_PUSH_PREVIOUS_ENCRYPTION_KEY` while the migration is in progress.

## Operator flow

1. Deploy this API code. Temporarily set the retained older key and an independent
   random `PUSH_TOKEN_MIGRATION_SECRET` operator credential.
2. Call `POST /v2/internal/push-token-rotation` with the internal bearer credential
   and `x-push-token-migration-key`. Body: `{"dryRun":true,"action":"handoff"}`.
   The response contains the current API key wrapped with AES-GCM using the
   temporary operator credential. It never returns a plaintext key or device token.
3. Unwrap only in the authorized operator process. Configure the notification
   worker's `DATA_ENCRYPTION_KEY` with that exact existing API key and retain its
   former key under `MOBILE_PUSH_PREVIOUS_ENCRYPTION_KEY`. Deploy the dual reader.
4. Scan with `{"dryRun":true}` and follow each returned `next` using `after`.
   This tests actual stored records against the current and retained keys.
5. Apply with `{"dryRun":false}`. Each request processes at most 100 rows. Rows
   already readable with the current API key are skipped. Older readable rows
   are re-encrypted with that same current key; unknown/corrupt rows are untouched.
6. Verify via another dry run, then remove `PUSH_TOKEN_MIGRATION_SECRET` to close
   the operator route (404). Remove temporary local key material.

Only `mobile_push_devices.token_ciphertext` is updated. Original token hashes
must match after decryption. Conditional writes protect a concurrent fresh
registration; settings, enabled state, timestamps and Firebase tokens remain
unchanged. No database schema change and no app rebuild is needed.

Normal delivery reads only the current API key. The old key is available only
to the temporary migration route, then removed after verification. Do not change
the API key or unrelated services as part of this operation.

## Verification

The real local workerd/Timescale test covers previous/current keys, encrypted
handoff, both operator credentials, dry runs, pagination, unreadable preservation,
idempotent reruns, original hashes/settings/timestamps, and new registrations.
The real local notification consumer tests multiple devices using only the
current API key through disposable stores and an isolated FCM HTTP provider.
