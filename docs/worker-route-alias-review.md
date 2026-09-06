# Original route aliases: source and consumer audit

Reviewed 2026-09-04. Recommendation: retire these 16 old route names under the user's no-backward-compatibility direction, while retaining their canonical operations. The saved Dashboard, Expo, and Admin runtime sources contain no remaining calls to these aliases. One original Dashboard caller was migrated. This is an implementation recommendation, not a claim that the user individually approved each removal, nor proof that the rewritten handlers reproduce all Go behavior. This audit does not edit the baseline manifest or restore aliases.

**Implementation decision:** this recommendation was subsequently adopted in
`worker-route-baseline.json`. The remaining advertised `/discord-channels`
alias was removed from the active shared contracts; canonical `/channels`
remains. A regression checks all sixteen original/canonical pairs and rejects
retired contracts. Saved consumer migration must still accompany API cutover;
no external-client or deployed-traffic audit is implied.

## Immutable sources

All file/line references below refer to these Git objects, read with `git show` / `git grep`; they do not refer to mutable working files or verified deployed versions.

| Label | Repository | Git object |
| --- | --- | --- |
| API-original | `clashking_api` | `90436aa042aa85ab1112ea12f3490787e2104b51` |
| API-saved | `clashking_api` | `3909883e555670f787c11db8d58e0a7c11425c07` |
| Dashboard-original | `ClashKingDashboard` | `11ce67643055a9afbedde24b63a4945f779ae691` |
| Dashboard-saved | `ClashKingDashboard` | `24039b5fc93ccbfa80bd07d59162a7987f9182dd` |
| Expo-original | `ClashKingApp` | `f9c531da597e0e0cb6f09a26916f19501972fcfb` |
| Expo-saved | `ClashKingApp` | `9d7fd109d8a23e9f0306a3f5c447cfc98eb656f1` |
| Admin-original | `ClashKingAdminPanel` | `a4c1481c12e63eb39ec05f4be9db422263ad6ffe` |
| Admin-saved | `ClashKingAdminPanel` | `6e6e41537b85e50227b682d52cb96ab97b0ee3f5` |

## Exact mappings

Every canonical route below already existed in API-original. Registration line numbers are in `internal/routes/register.go`, alias first, canonical second. “Same handler” compares the original paired registrations, not Go against the Worker. No outer wrapper means no extra registration-level authentication wrapper; it does not mean an authentication handler skips its own credential checks.

| Alias to retire | Canonical route to keep | Original handler / authorization comparison | Registration lines | Consumer evidence / disposition |
| --- | --- | --- | --- | --- |
| `GET /v2/guild-summary` | `GET /v2/activity/guild-summary` | Same `guildSummary`; no outer wrapper. | 65, 66 | No alias caller found; retain canonical metadata operation (M). |
| `POST /v2/verify-email-code` | `POST /v2/auth/verify-email-code` | Same `verifyEmailCode`; no outer wrapper. | 110, 111 | Expo already canonical; Dashboard uses the separate web variant (A). |
| `GET /v2/me` | `GET /v2/auth/me` | Same `wrap(currentUser)`; narrow unauthenticated CORS difference described below. | 112, 113 | Dashboard and Expo already canonical (A). |
| `GET /v2/privacy/export` | `GET /v2/auth/export` | Same `wrap(privacyExport)`. | 115, 114 | Expo already canonical (A). |
| `POST /v2/privacy/delete-request` | `DELETE /v2/auth/me` | Same `wrap(privacyDelete)`; HTTP method differs. Handler does not branch on method or consume a deletion request body. | 117, 116 | Expo already uses canonical **DELETE** (A); do not remove account deletion itself. |
| `POST /v2/discord` | `POST /v2/auth/discord` | Same `discordAuth`; no outer wrapper. | 132, 133 | Expo native already canonical; web consumers use the web variant (A). |
| `POST /v2/refresh` | `POST /v2/auth/refresh` | Same `refreshToken`; no outer wrapper. | 134, 135 | Expo native already canonical; web refresh remains separate (A). |
| `POST /v2/register` | `POST /v2/auth/register` | Same `register`; no outer wrapper. | 136, 137 | Dashboard and Expo already canonical (A). |
| `POST /v2/resend-verification` | `POST /v2/auth/resend-verification` | Same `resendVerification`; no outer wrapper. | 138, 139 | Dashboard and Expo already canonical (A). |
| `POST /v2/email` | `POST /v2/auth/email` | Same `emailLogin`; no outer wrapper. | 140, 141 | Expo native already canonical; web consumers use the web variant (A). |
| `POST /v2/forgot-password` | `POST /v2/auth/forgot-password` | Same `forgotPassword`; no outer wrapper. | 142, 143 | Dashboard and Expo already canonical (A). |
| `POST /v2/reset-password` | `POST /v2/auth/reset-password` | Same `resetPassword`; no outer wrapper. | 144, 145 | Expo native already canonical; web consumers use the web variant (A). |
| `GET /v2/public` | `GET /v2/config/public` | Same `publicConfig`; no outer wrapper. | 184, 185 | No alias caller found; retain canonical metadata operation (M). This is not `/v2/public-config` or public roster routes. |
| `GET /v2/link/server/:server_id/clan/list` | `GET /v2/server/:server_id/clans-basic` | Same `serverRead(GetServerClansBasic)`; both resolve to the `clans` permission section. | 223, 264 | No alias caller found; retain the basic-clan operation (S). |
| `GET /v2/server/:server_id/discord-channels` | `GET /v2/server/:server_id/channels` | Both reach `getServerChannels` with `serverRead`, but path-derived delegated permissions differ; see below. | 253, 265 | Dashboard already used canonical channels before the rewrite (S). Retain its shared-read policy. |
| `DELETE /v2/server/:server_id/clan/:clan_tag` | `DELETE /v2/server/:server_id/clans/:clan_tag` | Same `serverWrite(RemoveServerClan)`; both resolve to `clans` with a live write authorization check. | 280, 279 | Original Dashboard alias call has migrated to the canonical descriptor (D). Keep this action working. |

## Caller evidence

**A — authentication and privacy.** Dashboard-original `lib/api/clients/auth-client.ts` calls canonical `/v2/auth/me` (34), registration (62), resend (72), and forgot-password (113). Its verification (23), Discord login (41), refresh (52), email login (82), and password reset (123) use `/v2/auth/web/...`, not these aliases. Those web endpoints have their own cookie/origin behavior and must not be merged into native auth merely because native aliases are retired. Dashboard-saved retains these choices through `AuthMeEndpoint`, `AuthRegisterEndpoint`, `AuthResendVerificationEndpoint`, `AuthForgotPasswordEndpoint`, and `AuthWeb*` imports/calls in the same file. The original roster-assistant authorization also used `/v2/auth/me` (`workers/roster-assistant/developer-authorization.ts:14`).

Expo-original `expo/src/features/auth/auth-service.ts` already chooses native `/auth/discord` or web `/auth/web/discord` (119–120), equivalent email choices (143–144), `/auth/register` (168), native/web verification (183), resend (190), forgot-password (197), native/web reset (206), export (223), and `DELETE` of `AUTH_ME_PATH = '/auth/me'` (8, 229–230). These are relative to the configured API `/v2` base, not root aliases. Expo-saved calls `AuthMeEndpoint` (105, 117), `AuthDiscordEndpoint` (160), `AuthEmailEndpoint` (181), `AuthRegisterEndpoint` (197), `AuthVerifyEmailEndpoint` (212), `AuthResendVerificationEndpoint` (219), `AuthForgotPasswordEndpoint` (223), `AuthResetPasswordEndpoint` (241), `AuthExportEndpoint` (247), and `AuthDeleteEndpoint` (251), retaining web-specific alternatives. Its token service still directly calls canonical `/auth/refresh` and `/auth/web/refresh` (`expo/src/services/auth/token-service.ts:142,178`); using a direct request here is not an alias failure. API-saved `packages/api-contracts/src/expo-auth.ts:94,140–146,152,168,184,199,229,245` supplies the corresponding canonical paths.

**S — server reads.** Dashboard-original `lib/api/clients/server-client.ts:158–159` already calls `/v2/server/${serverId}/channels`. Dashboard-saved `lib/api/clients/server-client.ts:298` executes `ServerChannelsEndpoint`; API-saved `packages/api-contracts/src/dashboard-server.ts:1182–1186` maps it to `/v2/server/:serverId/channels`. No source caller of the old basic-clan alias was found. The richer Dashboard clan-list call (`server-client.ts:89–90` in Dashboard-original) uses `/clans`, which is a different retained operation, not evidence that `/clans-basic` can be deleted. API-saved defines the basic-clan descriptor at `dashboard-server.ts:987–992`.

**D — the actual migrated alias caller.** Dashboard-original `app/dashboard/clans/page.tsx:288–289` sends `DELETE /v2/server/${guildId}/clan/${encodeURIComponent(clanTag)}`. Dashboard-saved keeps `handleDeleteClan` and executes `dashboardEndpoints.removeServerClan` with `{ serverId: guildId, clanTag }` at 275–283. API-saved `packages/api-contracts/src/dashboard.ts:97` points to `RemoveServerClanEndpoint`; `dashboard-server.ts:1001–1006` specifies `DELETE /v2/server/:serverId/clans/:clanTag`. The saved caller migrated; an unchanged original Dashboard build would still require migration before the API cutover. This alias review does not deploy or replace that build.

**M — metadata.** API-saved `packages/api-contracts/src/public-metadata.ts:323,330–331` retains `/v2/config/public` and `/v2/activity/guild-summary`. No alias caller was found in the audited Dashboard, Expo, or Admin runtime trees. Absence of a frontend caller is not permission to delete these underlying API operations.

**Frontend adapters checked.** Dashboard-original `lib/api/fetch.ts:4–7` removes an optional `/api/` prefix and prepends the API base URL; it does not canonicalize route aliases. `BaseApiClient` likewise combines base URL and endpoint (`lib/api/core/base-client.ts:96,111`). The selected original tree contains only `app/api/tenor-media/route.ts` and its test under `app/api` / `pages/api`; there is no general Next API proxy in that baseline to conceal additional alias rewrites. This is a statement about the selected baseline, not every historical Dashboard revision.

Admin-original's `src/routes/api.$.ts:5–11` removes `/api/` and calls its own `handleAdminApiRequest`; it is not a forwarding map for these main-API aliases. Thus `src/lib/auth.tsx:19` calling `/auth/me` refers to the local Admin handler (`src/server/adminApi.ts:337`), not `/v2/me`. Admin-saved uses `adminEndpoints.me` (`src/lib/auth.tsx:21`), a central-API client (`src/lib/adminApi.ts:24–27`), and the dedicated `/v2/admin/me` descriptor (API-saved `packages/api-contracts/src/admin.ts:387`). No alias caller was found in either audited Admin source tree.

## Differences that must not be hidden by “same handler”

1. **Channel delegated access differs in the original Go API.** `GetDiscordChannels` and `ServerChannels` are separate exported names (`internal/routes/server/exports.go:72,151`), but `getServerDiscordChannels` immediately returns `getServerChannels` (`internal/routes/server/discord.go:222–223`). The shared wrapper uses the actual request path (`internal/routes/authz.go:124–131`). `/discord-channels` falls through to the `settings` section, while `/channels` matches the shared empty section (`379–411`). For a non-manager delegated user, `dashboardEntryAllows` requires settings view/manage for the former, but any delegated section for the latter (`196–207`). Bot and server-manager handling is shared. Retiring the alias and keeping canonical shared reads matches the Dashboard's existing canonical caller; it is not proof that both original URLs had identical authorization.

2. **Unauthenticated CORS differs for `/v2/me`.** The Go public-CORS classifier excludes `/v2/auth/` and `/v2/privacy/`, but not root `/v2/me` (`internal/utils/cors.go:83–88`). A GET without an Authorization header from an otherwise unrecognized origin can therefore receive wildcard CORS headers on the root alias's error response; the canonical auth path does not get that public classification. Both routes still require the same authentication wrapper. Requests with Authorization and allowed frontend origins do not gain an alias-specific bypass. No compatibility behavior is recommended for that error-response difference.

3. **Privacy deletion changes the selected HTTP method.** Both Go routes execute `privacyDelete` (`internal/routes/privacy.go:55` onward), so POST-to-DELETE canonicalization is supported by an existing original route, not a new implementation invention. It is separate from the six approved QUERY-to-POST changes. Expo already uses DELETE; account deletion must remain implemented and tested independently.

## Disposition and limits

The parent may record these 16 as implementation-selected alias retirements consistent with the user's explicit no-backward-compatibility instruction, citing this audit and retaining all canonical operations. The channel access distinction and original Dashboard clan-removal caller must remain visible in that decision. No concrete remaining alias-call breakage was found in the saved consumer snapshots; the original Dashboard clan-removal build would break if cut over without its saved caller change.

Searches covered Dashboard `app`, `lib`, and `workers`; Expo `expo` (excluding its lockfile/docs); and Admin `src`, then traced matching route builders and shared descriptors. Generated API reference material can still mention old paths and is not an executable caller. External clients, the deferred Bot rewrite, production traffic, and all historical revisions were not audited. Static searches cannot prove the absence of every dynamically constructed external call. No frontend checkout was restored or edited, and no live API, database, deployment, or UI testing was performed.

This alias audit does not resolve the separate Builder Hall route finding, unapproved additions, schema decisions, or general handler-behavior gaps. Those must not disappear merely because duplicate route names are retired. Validation for this documentation-only change: immutable-source inspection and `git diff --check`; no new runtime tests claimed.
