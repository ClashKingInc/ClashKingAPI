# Bot runtime slices

## Public metadata and guild activity

`public-metadata-runtime.ts` exports eight canonical GET routes through
`publicMetadataRuntimeRoutes` and `dispatchPublicMetadata(request, bindings)`.
`GuildActivityStore.layer` uses `SqlClient` and `WorkerEnvironment`; the other
seven routes need no storage. The optional `SENTRY_DSN_MOBILE` binding feeds
`sentry_dsn_mobile` at `/v2/config/public` and `sentry_dsn` at
`/v2/public-config`, preserving their distinct Go response shapes. Missing DSN
remains an empty string. The four enum lists retain all 45 IDs, descriptions,
scopes, and ordering from the Go catalog, with a source-parity test.

The activity store selects current server/clan membership and latest
`player_online_events`, using the Clash proxy binding for clan members. It
preserves the Go partial-result behavior on failed clan fetches and treats
missing login records as inactive. Discord guild IDs remain strings. The old
Go query's unused `server_clans.data` column was omitted because the
authoritative current Goose schema has no such column. This is a schema
correction, not a migration or business-data write.

Validation: nine contract/dispatcher/aggregation tests and one actual
Timescale integration test pass. The latter ran against disposable Goose
migrations 001–012 and covers missing/empty servers, the join, latest-login
selection, missing logins, totals, and failed-Clash omission. Focused lint and
diff checks pass. No production state was changed. The API owner owns router
and Layer integration; this task did not edit either entrypoint.

## Moderation and adjacent operations

`src/bot-runtime.ts` exports `BotModerationStore.layer`,
`dispatchBotRuntime`, and `botRuntimeRoutes` for seven ban/strike operations.
Its dispatcher remains Bot-only: changing it to the existing Go server-section
authorization model was explicitly blocked by the safety reviewer and awaits
direct user approval. Do not silently widen that boundary during integration.

`src/bot-adjacent-runtime.ts` exports `BotAdjacentStore.layer`,
`dispatchBotAdjacentRuntime`, `botAdjacentRuntimeRoutes`, and the independently
testable `refreshTrackingTargets` caller. The store Layer requires `SqlClient`,
`WorkerEnvironment`, `DiscordApi`, and the real `SharedLinksLimiter`. The
dispatcher requires the store, `AuthIdentity`, `ServerAuthorization`, and SQL.
Both dispatchers return `undefined` only for routes outside their slice.

## Canonical route decisions

| Method | Canonical path | Decision and ownership |
| --- | --- | --- |
| POST | `/v2/links/shared` | Port the unique developer-token lookup. Hidden links remain omitted; the application-wide 120/min limit uses the shared Durable Object limiter. |
| POST | `/v2/links/server/:serverId` | Port the active Dashboard mutation with `{playerTag,userID}` and delegated links-section write authorization. Verified links cannot be reassigned. |
| DELETE | `/v2/links/server/:serverId` | Port the active Dashboard mutation with `playerTag` query. Only a real Clash 404 permits deletion. |
| PATCH | `/v2/links/:userId/last-login` | Port the unique account capability. Users can update only their own subject; Bot credentials may select a subject. Auth subjects may be non-Discord IDs. |
| POST | `/v2/tracking/verified-players` | Port ownership validation and the authenticated private Tracking call. Do not count integrated parity until private transport is wired. |
| GET | `/v2/server/:serverId/clans-basic` | Keep the current Bot descriptor/caller and existing Dashboard canonical path. |
| PUT | `/v2/bases/:baseId/votes/:voterId` | Port the trusted Bot-only atomic vote operation. |
| DELETE | `/v2/bases/:baseId/votes/:voterId` | Port the trusted Bot-only idempotent vote removal. |
| POST | `/v2/bases/:baseId/downloaders/:userId` | Port the trusted Bot-only unique downloader operation. |

Drop `/v2/link/server/:server_id/clan/list`: it is a duplicate Go alias for the
same clan-list handler, and the current Worker calls `clans-basic`. No descriptor
or alias handler was added.

Eight new descriptors live in `packages/api-contracts/src/bot-adjacent.ts` and
are exported through `bot.ts`; `botEndpoints` now contains 67 descriptors.
Discord snowflakes use `DecimalSnowflake` throughout the Bot contracts and
remain strings through SQL parameters and response encoding.

## Validation and remaining integration

- Focused contract/moderation/adjacent tests pass: three files, 14 tests. The
  touched source and tests pass oxlint. Whole-Worker typecheck currently has
  unrelated concurrent Dashboard/limiter integration diagnostics, but none in
  these Bot files.
- The Tracking task verified the actual exported TypeScript caller against the
  Go endpoint and isolated Valkey: two tests pass for repeat/empty calls,
  seven-day expiry, exact tags, and wrong-token failure. The private deployment
  transport is still unresolved; a Worker Service Binding cannot directly
  target a Go process.
- The API owner must add the two store Layers and dispatchers to its owned
  entrypoint/router. This slice did not edit `router.ts`.
- Shared-link limiting now calls `SharedLinksLimiter.consume(applicationUuid)`
  and emits `Retry-After` on rejection; there is no isolate map or KV fallback.
- Local packages were repacked for consumer validation, not published. Registry
  publication and consumer lockfile regeneration remain release gates.

## Delegated authentication lifecycle (ready for API-owner integration)

The coordinator assigned this task the missing auth lifecycle. The current
isolated slice exports `dispatchAuthLifecycle` and `authLifecycleRuntimeRoutes`
from `auth-lifecycle.ts`, covering native/web email login, native/web Discord
login, native/web refresh, web logout, and `GET /v2/auth/me`, plus registration,
verification/resend, forgot-password, and native/web password reset (15 routes).
All are ready for owner routing/Layer integration; this task has not edited the
root router or entrypoint. Account transfer/deletion and moderation authorization
remain outside this authorized slice.

Layers and dependencies:

- `AuthCrypto.layer`: `WorkerEnvironment`; Go-compatible email/code hashes,
  bcrypt cost 10, HS256 audience/device claims, native 24-hour access, web
  15-minute access, and unique 30-day refresh tokens. Rejects new passwords
  over 72 UTF-8 bytes rather than allowing bcryptjs truncation.
- `AuthSessions.layer`: `SqlClient` and `AuthCrypto`; hashed refresh storage,
  conditional-delete/insert rotation transaction, and user/device-scoped logout.
  Login, issue, refresh rotation, and reset share an `auth_users FOR UPDATE`
  lock, preventing an old-password login/refresh from escaping reset revocation.
- `AuthEmail.layer`: `SqlClient`, `AuthCrypto`, `AuthSessions`, and `AuthMailer`;
  hashed single-use verification/reset codes, atomic account/session creation,
  conditional registration/resend, and generic forgot-password responses.
  Reset locks the current account, matches code/email/current user, updates its
  password, revokes its refresh rows, and issues one successor in one transaction.
  Stale verification cannot overwrite an existing account's password.
- `authMailerLayer` from `auth-mailer.ts`: `WorkerEnvironment`; retains Gmail
  SMTP port 587 with required STARTTLS and verified TLS 1.2+, or configured
  implicit verified TLS. Uses the authoritative Go English catalog/template,
  Nodemailer MIME generation only, and a bounded native `node:net`/`node:tls`
  SMTP exchange with Go's AUTH PLAIN. No provider switch or delivery bypass.
  Required secrets are `SMTP_USERNAME`/`SMTP_PASSWORD`; generated SMTP settings
  are already present in owner bindings. It never logs reply/credential content.
- `AuthProfiles.layer`: `SqlClient`, `WorkerEnvironment`, `DiscordApi`,
  `DiscordCredentials`, `StoredTokenCipher`, and `AuthSessions`; atomic Discord
  account/credential/session persistence, provider profile identity checks, and
  the existing distinct-follower account summary. Discord provider credentials
  remain encrypted and keyed by both user and device. Email identity fields
  remain NULL for Discord accounts, as required by the authoritative schema.
- The dispatcher additionally uses existing `AuthIdentity` and `SqlClient` for
  `/auth/me`. It never changes `AuthIdentity` or server authorization. The API
  owner added generated `DISCORD_REDIRECT_URI` for native fallback; actual
  OAuth-provider redirect registration still needs verification before deploy.

Coordinator-approved decisions beyond a literal Go port:

- Every refresh rejection leaves the browser cookie unchanged. Clearing on
  a missing initial lookup or expired token can erase a successor cookie set
  by another tab. Successful login/refresh replaces the cookie; logout expires
  it. There is no replay grace period or old-token fallback.
- Web refresh cookies are host-only, scoped to `/v2/auth/web`, and always
  `Secure; HttpOnly; SameSite=None`, supporting exact-allowlisted cross-site
  previews. Every web auth operation rejects missing, `null`, or unlisted
  Origin before touching state. JSON auth bodies require `application/json`
  and are bounded to 16 KiB. Remote `ENVIRONMENT=development` does not disable
  Secure or expose codes; there is no local-only bypass.
- Refresh checks the old stored device as well as the signed user. Native
  clients retain Go's explicit device-ID update behavior after that check;
  web refresh never accepts a replacement device from the request body.

Validation on September 3: 25 crypto/HTTP/email/mailer unit tests, 22 actual
Timescale tests, one workerd crypto test, and ten workerd SMTP/MIME cases pass.
The disposable harness applied Goose migrations 001–013; all owned test
containers were removed afterward. Tests cover simultaneous and
delayed refresh losers, rollback when successor storage fails, user/device and
audience isolation, encrypted Discord credentials, provider identity mismatch,
distinct follower counts, exact origins, cross-site preview cookie attributes,
JSON/size boundaries, and absence of refresh tokens in browser JSON. One extra
actual-workerd smoke test verifies Go bcrypt fixtures, newly generated bcrypt,
email/code hashes, random codes, and native/web JWT issuance/verification.
Recovery races and SMTP were independently reviewed. Additional disposable
SQL probes covered refresh-after-reset and deleted/recreated accounts. Five
independent actual-workerd SMTP probes covered untrusted certificates, trusted
certificates with wrong hostnames, oversized decrypted lines/multiline replies,
and post-TLS cancellation, all rejecting before AUTH/delivery and closing sockets.
The independently accepted frozen `auth-mailer.ts` SHA-256 is
`af1b0dbff056a106b263d30299aa30c68328aee404c31faade465a848490f280`;
the reviewer reran all 20 SMTP unit/runtime/independent checks on those bytes.
SMTP reply limits are 8 KiB per line, 16 KiB per reply, 64 KiB per plaintext/TLS
phase, two queued replies, and a 20-second total deadline; MIME is capped at
128 KiB. The runtime harness uses a local-only native workerd network service
because Miniflare 5's default JS outbound proxy cannot perform this TLS upgrade.
Fixture certificates are trusted only in tests; production verification remains
enabled. No real email, Discord OAuth, production sessions, deployment, or visual
tests were performed. Actual provider delivery remains a release verification
gate, and root routing/live Layer assembly remain owned by the API task.
