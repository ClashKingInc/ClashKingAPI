# Local API development

Use the persistent launcher for interactive Dashboard/App development. The
disposable Timescale harness is for tests only: its database is intentionally
removed when the command finishes.

From this API repository, with Node 26, Docker Desktop, and Goose installed:

```sh
node scripts/local-api-database.mjs run
```

The launcher creates/reuses the owned `clashking-rewrite-api-dev` container and
`clashking-rewrite-api-dev-data` Docker volume. PostgreSQL is published only at
`127.0.0.1:54329`; the database is `clashking_dev`. The public local credentials
are `clashking_local` / `clashking_local`, never production credentials. The
container must match the pinned Timescale image and ownership label before it
can be reused. Remote Docker contexts and remote database addresses are refused.

Each startup applies the authoritative sibling `clashking_schemas` retained API
profile with Goose. Its current ceiling is migration 028. No schema is invented
in the API launcher, and applied migrations are not rerun.

`Ctrl-C` stops the API process but preserves the database and volume. Running the
same command again retains settings, account records, and other SQL data. To
stop the database separately, use `docker stop clashking-rewrite-api-dev`; the
next launcher invocation starts it again. Do not remove its named volume.

Local signing/encryption secrets are generated once in macOS Keychain, under
service `ing.clashking.effect-rewrite.local-api`, account
`local-signing-and-encryption-v1`. They are read into process memory, never a
plaintext secret file. A locked/denied/invalid Keychain item fails startup rather
than silently rotating keys and invalidating saved sessions. Keep this item with
the database. This launcher currently requires macOS.

Supply authorized local Discord provider credentials through the inherited
`CLASHKING_LOCAL_DISCORD_CLIENT_ID`, `CLASHKING_LOCAL_DISCORD_CLIENT_SECRET`, and
optionally `CLASHKING_LOCAL_DISCORD_BOT_TOKEN` environment variables. Do not put
secrets in this document or checked-in files. The existing local launcher may
also use `CLASHKING_LOCAL_CLASH_PROXY_ORIGIN=https://proxy.clashk.ing` when explicitly
enabled. Those are real upstream requests; SQL and Cloudflare storage stay local.
Set `CLASHKING_LOCAL_LAN_IP` to this computer's current LAN address for phone
access. The API listens on port 8787 by default; SQL remains loopback-only.

SQL persists in its Docker volume. Miniflare KV, R2, and Durable Object state
persists under `.local/worker-storage`. Do not delete either during interactive
development. No production bindings or deployment are used.

## Scoped development data

The September 5 import copies linked-player data for Discord users
`706149153431879760` and `506210109790093342`, configuration for servers
`923764211845312533` and `684667214347108386`, and history for clans
`#2VC0Q9LV`, `#2GYQ8YY2V`, and `#VY2J0LL`. Related CWL opponents are included
so round results can be read. This is a selected snapshot, not the entire database.

The scripts `import-scoped-source.mjs`, `complete-scoped-export.mjs`,
`copy-scoped-war-archives.mjs`, `validate-scoped-archives.mjs`, and
`merge-scoped-source.mjs merge` perform the export, archive download, validation,
and additive import. Exported data and the pre-import SQL backup stay in ignored
`.local/scoped-import`. Existing conflicting records are retained, including the
two existing server settings rows. Authentication sessions, billing credentials,
and production delivery tokens are not imported; reminder tokens are empty.

Only selected compressed war frames are downloaded from the public archive CDN.
Their offsets and pack statistics are recomputed for local packs. Startup seeds
`.local/imported-archives/packs` into local R2 and skips unchanged objects.
Archive-backed statistics therefore describe the imported subset only.

## One-time handoff from the currently running disposable database

Do not start `run` or `migrate` against the default persistent target before the
copy: the transfer deliberately refuses an existing `clashking_dev` database.
`up` and `status` are safe preparation commands.

1. Coordinate a short pause in interactive writes. Keep the old API/harness
   alive until copying is finished, since stopping its harness removes its
   source database. Verify the exact source container ID and its fixture label,
   pinned image, tmpfs storage, and loopback port. The transfer rechecks these.
2. Run `node scripts/local-api-database.mjs copy-from SOURCE_CONTAINER_ID` with
   that exact ID. It streams a consistent PostgreSQL dump directly into an empty
   staging database in the persistent container; it does not write a backup
   file or change the source. It performs the Timescale pre/post-restore steps,
   remaps restored job ownership, and applies Goose migrations before promoting
   the staging database to `clashking_dev`.
3. Check the successful `local_database_copied` result and verify the expected
   local settings/account records. Only then stop the old API/harness and start
   `node scripts/local-api-database.mjs run` with the same authorized provider
   environment. Sign in once again.

The old process's temporary signing/encryption keys cannot be recovered safely.
The copy keeps account and business records but clears copied Discord tokens,
refresh sessions, email verification/reset tokens, and disables copied mobile
push tokens while retaining device records. The source is unchanged. Existing
email-account hashes also depend on the old signing secret: a nonzero
`emailAccountsNeedingOriginalPepper` result requires recovery before assuming
those email accounts can sign in; Discord accounts can sign in normally.

A failed transfer retains `clashking_import_pending` for inspection and blocks
normal startup. It never overwrites an existing target or retries destructively.
The source remains available until its old harness is stopped. Investigate the
partial import before deciding how to recover; do not delete the source.

## Checks and test-only databases

```sh
node scripts/local-api-database.mjs status
bash ../clashking_schemas/scripts/with-test-timescale.sh --profile retained-api -- node scripts/local-api-database.integration.mjs
node --test ../clashking_schemas/scripts/with-test-timescale.test.mjs
```

The integration command owns a separate synthetic source and
`clashking-rewrite-api-persistence-validation` target on port 54330. It checks
that settings/account records survive copy and restart, only copied unusable
credentials are cleared, the source stays untouched, and repeated Goose startup
stays at version 028. It removes only its own test container and volume afterward.

For an empty, separately named verification container, `verify-restart` writes
a harmless UUID and proves it survives a container restart. It refuses a target
that already contains an interactive database or pending import. Never use a
destructive test harness to run the interactive API again.
