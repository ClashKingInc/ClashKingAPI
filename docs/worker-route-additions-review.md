# Added routes: source, callers, and recommended disposition

## Current implementation update

The historical findings below are superseded in these specific places:

- Tenor is restored to the original Dashboard Worker GET and image caller. The
  proposed central POST is no longer mounted or exported. Source/tests remain
  as unmounted reference; no extra proxy or backend service was introduced.
- The two original uncommitted Admin release handlers are accepted as retained
  source under the existing-handler move and preserve-user-work instructions.
  This is an explicit implementation decision, not proof they were deployed or
  separately authorized for execution. On September 4 the original handler/page
  hashes below were rechecked unchanged. Their input, selection, ordering and
  error behavior are corrected against that source; admission remains Access.
  Rejected first-time selections roll back their provisional database key.
- The user's later explicit non-HTML/R2 instruction is implemented by new JSON
  storage/readers, with two approved method/path pairs. Old HTML URLs are
  unmounted/unexported. No existing R2 transcripts were assumed, and no archived
  journal/private-viewer design was used. See `json-ticket-transcripts.md`.
  The latest static check has zero unresolved additions across 323 required
  pairs; older unresolved transcript paragraphs below are historical only.
- Freshly fetched API main `cf7371e` differs from the accepted local Go source
  only by the local Capital Gold addition and related tests/docs (14 files).
  `current-origin-reconciliation.md` records the exact comparison and preserved
  original dirty update-manifest source hashes.

The original Admin source hashes identify inspected uncommitted bytes, not a
commit in the pinned baseline. The two mappings are individually recorded in
`worker-route-baseline.json`; no blanket dirty-route acceptance was added.
See the current implementation status and generated route report for counts.

Reviewed 2026-09-04, read-only except this document. This covers the 13 routes absent from the pinned baseline, excluding the temporary leftover `/discord-channels` contract. Recommendations are **2 keep (one pre-existing feature, one operational adaptation), 5 retire/defer from this API port, and 6 unresolved**. Historical evidence establishes that the API update manifest was pre-existing uncommitted work the user required preserving; the original Admin checkout also contains uncommitted release controls whose specific provenance is not yet established. Absence from the pinned commit does not establish rewrite invention. These are review findings, not manifest edits or permission to remove data, change the other applications, or deploy.

The immutable API, Dashboard, Expo, and Admin original/saved revisions are listed in `worker-route-alias-review.md`. References marked “original” or “saved” below use those exact Git objects. Current API references were read in this independent checkout; they are not proof of deployed behavior. The revised authority is `../../../CLASHKING_REWRITE_REPLACEMENT_PLAN.md`: preserve existing behavior, no new product flows hidden in a port, leave existing Dashboard endpoints where they are, defer speculative Bot features, and preserve UUID-link transcript access with R2 storage.

## All 13 routes

| Method and path | Original source / saved caller | Recommendation and reason |
| --- | --- | --- |
| `GET /v2/health` | No matching original Go registration found; current router returns a fixed status payload. | **Resolved: keep**, root-selected Worker liveness adaptation with a matching shared contract and response encoding. Not database readiness or business-feature parity; original Admin readiness remains separate. |
| `GET /v2/app/updates/manifest` | Historical work record establishes a pre-existing uncommitted Go endpoint on `feat/self-hosted-updates`, explicitly preserved when commit `90436aa` was created. Saved Expo can opt into this URL. | **Keep the existing feature**. Pin the supplemental uncommitted source and verify its port; the commit-only baseline is incomplete here. Do not treat this as a new rewrite proposal or claim its exact current behavior is fully verified. |
| `GET /v2/admin/app-releases` | Absent from pinned Admin commit, but present as `/api/app-releases` in its current dirty checkout with a local page/caller; saved Admin calls the central route. | **Unresolved source provenance**. Concrete existing source/caller evidence is present, but the uncommitted feature's authority is not established. |
| `PUT /v2/admin/app-releases/channels/:track/:platform/:runtimeVersion` | Absent from pinned Admin commit, but present under `/api/app-releases/channels/...` in its current dirty checkout and called by its local page. | **Unresolved source provenance**, with real original-checkout mutation behavior to preserve if accepted. Do not silently approve or remove only its API side. |
| `GET /v2/server/:serverId/roster-member-groups` | No matching baseline registration or audited Dashboard/Expo/Admin caller. | **Retire/defer** from this port; retain as reference for the later Bot/configuration design. |
| `POST /v2/server/:serverId/roster-member-groups` | Same absence of baseline/caller evidence. | **Retire/defer**; creates new group configuration, not a demonstrated existing Dashboard action. |
| `PATCH /v2/server/:serverId/roster-member-groups/:memberGroupId` | Same absence of baseline/caller evidence. | **Retire/defer**; newly added configuration mutation. |
| `DELETE /v2/server/:serverId/roster-member-groups/:memberGroupId` | Same absence of baseline/caller evidence. | **Retire/defer**; do not delete stored configuration or schema as part of route retirement. |
| `PUT /v2/server/:serverId/rosters/:rosterId/member-groups` | Same absence of baseline/caller evidence. | **Retire/defer**; new group-to-roster/signup/role configuration, not required by the approved own-entry-removal policy. |
| `POST /v2/media/tenor/resolve` | Original Dashboard already served `GET /api/tenor-media`; saved reminders UI now calls this central resolver. | **Unresolved destination/transport change**, proposed as a necessary server-side adaptation, not a new product feature. The central API and existing Dashboard Worker are concrete destination options; select and test one before removing either side of the saved dependency. |
| `GET /v2/ticket-transcripts/:capability/channel.html` | Not in the original API. UUID-link public reading is an explicit product decision; this exact contract is not baseline evidence. | **Unresolved implementation review**. Retain the approved narrowly scoped public-reading requirement; do not infer that this route's implementation is reviewed. |
| `GET /v2/ticket-transcripts/:capability/thread.html` | Same explicit access-policy decision; no matching original API route. | **Unresolved implementation review**, separate from deferred transcript collection/publication. |
| `GET /v2/ticket-transcripts/:capability/attachments/:attachmentId` | Same explicit access-policy decision; no matching original API route. | **Unresolved implementation review**, separate from deferred attachment copying. |

## Evidence and risks by family

### App update manifest and Admin release controls

**The API manifest is known pre-existing work, not a rewrite invention.** A focused historical lookup in `/Users/matthewanderson/.codex/memories/MEMORY.md:107–145` and `rollout_summaries/2026-09-03T04-04-14-uthK-preserve_ota_work_merge_capital_gold_pr_56.md` records that, before this rewrite, the original API was on `feat/self-hosted-updates` with an uncommitted Expo Updates v1 endpoint, R2 release-marker loading, signed multipart responses, stable cohorts, scheduled rollout selection, and adoption recording. The user explicitly required preserving that work (summary lines 15–26). The later local Capital Gold merge created the very `90436aa` commit selected for this audit while preserving the uncommitted OTA registration hunk (45–54). That explains why the commit-only baseline omits a legitimate existing API feature. This is historical provenance evidence, not current test/deployment evidence; exact supplemental source bytes and full behavior still need to be pinned and compared. The historical thread is `01a06570-4fb5-72e0-9319-f76a37eb5cc0`.

Expo-original `expo/app.config.ts:22–23` used the fingerprint runtime policy with `updates: { enabled: false }`. Expo-saved introduces `CK_ENABLE_UPDATES === 'true'`, release-track and certificate inputs, and a required certificate when enabled (`5–11`). Only when enabled does it configure the new manifest URL (`31–46`, default URL at 35). This is a concrete, currently opt-in saved caller, not evidence that the original app relied on that route. The separate remote feature-flag/minimum-version logic is not this manifest transport and must not be lumped into its disposition.

The **pinned Admin-original commit** has no app-release handler or page. Admin-saved has navigation to `/app-releases` (`src/components/Sidebar.tsx:9`) and a page that calls `adminEndpoints.listAppReleases` (`src/routes/app-releases.tsx:21`) and `updateAppReleaseChannel` (`88–91`). The mutation supplies active version, rollback target, rollout percentage, pause state, and optional schedule. Removing only the API routes would break that saved page.

**Additional original-checkout evidence changes the provenance finding.** Read-only inspection of `/Users/matthewanderson/GolandProjects/ClashKingAdminPanel` found HEAD still at `a4c1481c12e63eb39ec05f4be9db422263ad6ffe`, with modified `src/server/adminApi.ts`, Sidebar/types/styles/route tree and an untracked `src/routes/app-releases.tsx`. The server file's uncommitted diff is +237/-1 lines and adds `GET /app-releases` and `PUT /app-releases/channels/(beta|production)/(ios|android)/...` (current lines 377–385), full listing/update handlers (981,1030), and the dedicated R2 client (1113). The original Admin `/api/$` adapter means these are `/api/app-releases...` externally. The current untracked page already calls those local endpoints (19,86–89), without shared rewrite descriptors. The feature therefore exists in the original checkout as well as the rewrite snapshot; it cannot be safely called rewrite-invented.

The latest committed change to that server file is the pinned `a4c1481` commit dated 2026-09-01; Git history cannot establish the author, date, purpose, or user authorization of its current uncommitted additions. The selected baseline may have excluded legitimate user work. For identifying the inspected bytes only, SHA-256 was `11f7a3c3b62482eba5b055e705502d896ebdd3dfad57d15eb72e6f3b60cce890` for `src/server/adminApi.ts` and `4b2692ae6f7c8f10330a3f3f79ac61eae5262f8c8f5f949e22d8f890ffe9731a` for `src/routes/app-releases.tsx`. These hashes are not immutable source backups or approval evidence. No original-checkout file was edited, and no environment values were read.

If that uncommitted source is accepted into the baseline, there is at least one concrete behavior comparison to resolve: its release mutation passes through the same `requireAdmin` gate as the other Admin routes (`adminApi.ts:351–352,377–385`), while the Worker classifies non-GET operations as owner-only (`workers/api/src/admin.ts:103–104`). No additional owner gate appears in the original current release-update handler. This review does not decide whether the stricter Worker policy is intended or change either side.

Subsequent implementation restored the original Access-only admission rule for
all central Admin operations; the additional database/owner split described
above is no longer active. See `admin-access-parity.md`. The release controls'
specific uncommitted-source provenance and non-auth behavior still need review.

Current API `workers/api/src/router.ts:192–193` dispatches the manifest handler. `app-updates.ts:130–168` reads channel state from `app_update_channels` and release/rollback markers from `APP_UPDATES`, then serves a selected signed manifest. `admin-operations.ts:959,983,1044,1060` lists/updates channels and records the update action. The routes are therefore more than harmless metadata exports: they add database, R2, certificate, rollout, and release-operation dependencies. No schema files, applied state, R2 objects, certificates, or live releases were read in this audit.

The historical preservation instruction establishes the API manifest's provenance; it does **not** automatically establish every current Admin control, Expo opt-in configuration change, or rollout-policy modification. Reconcile the original Admin checkout's concrete uncommitted release work and the related API/Expo changes with the accepted baseline before changing them. The two Admin routes remain unresolved specifically for this source/authority comparison, not because the update system is assumed unapproved. Add a narrowly pinned supplemental source baseline for the preserved Go manifest under root coordination, rather than allowing all dirty Go registrations to become requirements again. Do not use a commit-only baseline to erase unrelated user work or infer broad new release authority from permission to preserve a feature.

**Subsequent baseline-tool correction:** `worker-route-baseline.json` now recognizes exactly `GET /v2/app/updates/manifest` as a preserved uncommitted API feature. Its archived source is pinned at `3909883e555670f787c11db8d58e0a7c11425c07`: registration file SHA-256 `7aa0b6b1807c526e0d11599406b6e3b98b5000d8e7436e235f3165b895ecafb1`, implementation `internal/routes/app_updates.go` SHA-256 `77074b758a79f404227917eae8ddd1dc1b6e5656085855f13bf2d3f695f77621`, and tests `internal/routes/app_updates_test.go` SHA-256 `071b212215268b58753667e12373314a98cc1556591152a5bdbb741607af84f4`. The parent independently verified that the archived implementation/test bytes equal the current original API files. The checker verifies every pin and the exact `app.Get("/v2/app/updates/manifest", appUpdateManifest(a))` expression before recognizing that one requirement. The matching working registration remains visible as reviewed evidence; a changed expression or any other dirty addition remains a finding. The proxy wrapper difference and Admin release controls are not approved by this supplement, and behavior parity remains false.

### Five roster member-group configuration routes

The pinned Go `internal/routes/register.go` contains none of these five routes. A bounded search of the original roster route/model files found no matching member-group configuration feature. Searches of original and saved Dashboard `app/lib/components/workers`, saved Expo `expo`, and saved Admin `src` found no caller of these paths or the `Dashboard*RosterMemberGroup*` descriptors. That does not make an exhaustive claim about the deferred Bot or external clients.

Current `workers/api/src/dashboard-roster-configuration.ts:15–19` lists all five routes; it imports their descriptors and dispatches them independently (`1–3,12–13,48` onward). It reads/writes group definitions and roster group settings, imposes group-count/name rules, checks role references with Discord, and configures signup/role assignments. These are new configuration choices, not necessary consequences of preserving the original roster-group endpoints or allowing users to remove their own roster entries.

A narrow next correction is to stop mounting/exporting these five new operations in the API port and move their tests/source inventory into the deferred-design record. First trace shared symbols so retained roster paths keep any legitimate common helper they use. **Do not remove** the baseline `/v2/roster-group` CRUD/list routes or `/v2/roster/account-groups/query`; similar names do not establish equivalent behavior. Do not change schema, stored rows, or the baseline roster behavior during this correction. Passing tests written for the new configuration routes would establish implementation consistency, not baseline necessity.

The parent subsequently accepted this narrow deferral for implementation. It
does not authorize deleting group records, schema or preserved reference code.
The manifest now marks these five as category `roster-configuration`, counted
separately from the nineteen deferred `/v2/runtime/...` routes. Any surviving
active mount or exported contract remains a finding until its removal is
verified; absence does not become an API feature gap.

### Tenor: a real existing feature, but a changed endpoint owner

Dashboard-original `app/dashboard/reminders/page.tsx:1126` renders an image using `/api/tenor-media?url=...`. The old Next handler (`app/api/tenor-media/route.ts:4–5`) and its Dashboard edge Worker implementation (`workers/dashboard-edge/index.ts:142–143`) both delegate to `lib/tenor-media.ts`. That handler accepts GET, validates a Tenor URL, fetches metadata, then returns a 307 redirect to a GIF with public cache headers (`lib/tenor-media.ts:22–47`). The original implementation is therefore source-backed and server-side; moving URL fetching into the browser would not preserve it.

Dashboard-saved replaces the image source with `TenorMedia` in the reminders page (`1102`), whose query executes `endpoints.tenorMedia` with JSON `{ url }` (`components/tenor-media.tsx:16–20`) and renders the returned `media_url` (`28`). The saved tree removes the original Next route and resolver. Current API `router.ts:254–260` handles authenticated POST and returns JSON metadata through `TenorResolver`, rather than an anonymous GET redirect. This changes location, method, authentication, response format, and caching behavior. The current resolver also bounds/validates upstream work; preserving those safety properties need not dictate its location.

The latest user direction favors leaving existing Dashboard endpoints where they are, while the Vite port and replacement plan require an explicit destination for essential server-only behavior. A central API move is a proposed necessary runtime adaptation, **not a new product feature**, but its particular method/auth/response changes still need selection and testing. The existing Dashboard frontend Worker is another concrete destination and does not introduce a new proxy service. If choosing that original handler/caller during the Dashboard port, coordinate it before dropping the saved central route dependency. This audit does not make that frontend change or approve a central move. Do not silently remove Tenor rendering to reduce the route count.

### Transcript readers: approved access policy, restricted implementation review

The user explicitly accepts public links containing unpredictable UUIDs and requires R2 for new uploads. The replacement plan preserves private storage plus narrowly scoped serving, with no listing or invented expiry rule, while deferring Discord-history collection, attachment copying, and transcript-message publication to the Bot design. Those decisions support a public-reading capability; they do not independently prove these exact three proposed API routes or their storage/authorization design.

This audit used **only** the transcript route method/path metadata already present in `worker-route-parity.json` and the approved policy in the replacement plan. It did not inspect or reconstruct restricted transcript journal, private-viewer, schema, or review payloads, and it did not infer private implementation details from other files. Transcript reader and bot-published-link consumers were not traced through the restricted material; no complete caller proof is claimed.

Keep the implementation finding explicit until the permitted reader contract/implementation can be reviewed through normal authorization. Do not classify a restricted/unreviewed result as a failed policy decision, silently restore Bunny writes, or manufacture a replacement design to bypass the restriction. The independently approved general R2 media reader is a separate inventory entry and is not proof for these three routes.

### Worker health

Current `router.ts:186–187` returns `{ status: "ok", runtime: "cloudflare-worker", version: "0.1.0-rc.0" }`. This is a useful process/request-path liveness response and a reasonable hosting adaptation. It does not itself test PostgreSQL, R2, Discord, scheduled work, or release readiness, and its fixed version is not verified deployment provenance.

No equivalent health route was found in the pinned Go route/source search. Admin-original separately exposed `/api/healthz` and `/api/readyz` (`src/server/adminApi.ts:330–331`). A new fixed API health response must not silently stand in for that old readiness check. Keep the operational addition explicitly labeled, ensure focused route-response testing when accepting its exact behavior, and decide how old operational probes change during an authorized cutover rather than restoring compatibility routes automatically. No production probe configuration was inspected.

**Resolved by the parent:** keep exactly the existing public GET and fixed 200 JSON as a minimal Worker liveness adaptation. `packages/api-contracts/src/health.ts` now defines its literal status/runtime/version schema and `HealthEndpoint`; the existing router branch encodes through that schema. The manifest records `worker-liveness-adaptation`, not an original business feature or a readiness guarantee. Contract and OpenAPI tests describe only those three fields, and an actual entrypoint unit fixture checks the exact response with missing, invalid, and bot authorization while SQL/provider sentinels forbid I/O. No database/readiness probes, bindings, resources, version changes, Admin health/logout changes, or extra endpoint were introduced.

Focused health validation passed: six contract/entrypoint tests, one generated-OpenAPI test, all 26 inventory-checker regressions, scoped lint, and whitespace checks. Shared package builds and OpenAPI generation were coordinated with the other implementation subagent; final combined runtime/full-suite validation remains the parent's integration step.

## Safe next corrections and audit limits

1. **Retire the five unused new roster configuration routes coherently** after the parent accepts their disposition. Preserve the source/tests as deferred reference and keep baseline roster routes/data intact. This is the clearest implementation-sized follow-up from this review.
2. **Health is accepted and implemented only as liveness**, with the shared contract, schema encoding, and focused tests above. Admin readiness and deployment provenance remain separate findings; this does not make the release ready.
3. **Resolve Tenor's owner before changing its caller or route.** The source-backed original Dashboard Worker endpoint supplies a concrete behavior-preserving option. Do not approve the current central POST solely because its saved caller was rewritten to match it.
4. **Retain the pre-existing API manifest and pin its supplemental source baseline** under root coordination, then compare the Worker implementation against that preserved behavior. Keep the two Admin release routes unresolved until their specific original-checkout work is reconciled; preserve all existing source meanwhile. Keep the three transcript-reader routes unresolved for permitted implementation review, while preserving the approved UUID-link access policy.

The initial audit was documentation-only. The baseline-tool follow-up changed only baseline/checker/tests/disposition documentation: the preserved manifest supplement, the five configuration deferrals, and the obsolete Builder Hall drop disposition to the retained public 501 route (`docs/builder-hall-counts-boundary.md`). It did not change runtime handlers/shared packages. The separately accepted health follow-up adds the contract, existing-branch response encoding, tests, and its explicit adaptation entry as documented above. Neither follow-up changed original checkouts, schema, production state, or deployment; the generated parity report is left for the parent to regenerate after integration.

Validation: six new checker regressions failed before implementation; all 26 checker tests subsequently passed. The complete script test run passed 43 tests, and `git diff --check` reported no whitespace errors. These checks cover exact source pins/expressions, rejected missing or changed hashes, no blanket dirty-source approval, route/disposition recognition, preserved-feature absence, and contradictory policy rejection. They are not current Go feature tests or Worker behavior proof. Historical OTA passes remain historical evidence. Source searches remain bounded to the named revisions/trees, explicitly inspected original Admin files, and focused historical record, not every external client, Bot producer, or deployed release.
