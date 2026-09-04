# Worker route release gates

## Current checkpoint — 2026-09-04, 07:44 CDT

The generated [route inventory](worker-route-parity.json) records 347 contracted,
342 declared and 340 integrated pairs, with seven missing: five persistent roster
interaction routes plus two explicit ticket approval/deletion readiness blockers.
The five account-group configuration routes are now mounted; three private-R2
transcript capability read routes enter through an isolated fetch boundary.
These are static counts, not behavioral acceptance.

The latest overnight instruction explicitly prohibits every deployment, registry
publication, production migration/data change, native/OTA release, DNS/traffic
change and new live infrastructure. Continue only local implementation, disposable
tests and release preparation; document reasonable product choices for review.
Permission-review rejections remain binding and must not be bypassed.

The environment reset interrupted the aggregate PostgreSQL run: its process
handle disappeared, no matching runner was found, and the configured local
Docker Unix socket was unavailable. No aggregate result or database cleanup
success is inferred from that missing handle. The prior focused PostgreSQL
results below remain historical validation, not a fresh full-suite pass.
The local Node26.8.1/npm12.0.0 toolchain has been restored in a temporary cache.
CI now reads the schema's actual `database/go.mod`, and its layout preflight
runs before Go setup without invoking Docker or reading migration payloads.
The API runner explicitly targets version 027, discovers recursive NUL-delimited
suite paths, fails on discovery errors before starting a database, and preserves
harness failure exit codes. Seven runner/workflow tests and nine release-script tests pass
on Node26 at 07:44, with real checkout layout, shell syntax and diff checks.
An isolated manifest/lockfile-only `npm ci --ignore-scripts --strict-peer-deps
--legacy-peer-deps=false` also passes under Node26.8.1/npm12.0.0 (132 packages).
That proves strict resolution of the current lockfile, not lifecycle scripts or
a clean-copy build. The three CI/package-release legacy-peer overrides have been
replaced with explicit strict peer checking. Existing dependencies were preserved;
no workflow was dispatched and no package was published.

Fresh Goose001–026 opening tests pass fourteen cases, including eight concurrent
copies of a proof yielding one immutable link preparation with no ticket/effects,
replay after linking and stale proof timestamps, preserved unverified admission,
linked-but-ineligible denial, and atomic direct preparation/submission. Viewer
and opening suites seed overlapping fixed ticket numbers, so run each in its own
disposable database as the aggregate SQL harness does. Opening now wraps its
preparation and direct submission in one transaction with a canonical panel row
lock; it has no PostgreSQL advisory-lock dependency.
Final acceptance also rechecks selected accounts under sorted tag, actor-subject
and link-row locks. A transfer or changed TH eligibility while a questionnaire is
open cannot admit a stale account, but accepted exact replay still returns before
freshness/provider/ownership work. Unverified eligible accounts remain accepted.
The two new race/control cases passed with all fourteen opening tests at 01:28:56.

Opening now snapshots the configured server-scoped welcome embeds (or retained
default), preserves the staff-only private-thread application copy and pins,
and never invites the applicant into the private staff thread. Unicode-safe,
single-pass naming retains all six legacy tokens. Embed packing respects the
4096-character description, ten-embed and 6000-character message limits without
discarding content; saved webhook mentions/components are not imported. Named
BigInt permissions restore the legacy view/send/thread/command rights that the
old numeric masks omitted. Everyone-as-staff is rejected at settings update,
preparation and execution. Category fallback uses same-guild provider reads
outside SQL transactions; known pre-POST lookup failures requeue, while a lost
actual create response still requires reconciliation. The actual prepare-to-
executor test covers fallback, permissions, intro, private isolation and replay.
Fresh opening/effects/staff runs passed 12/6/3 cases at 01:15. The coordinator's
independent fresh Goose001–027 run at 01:21:55 then passed the two new category
retry cases, all seven effect cases (including unsafe staff roles and lost actual
POST), and five held-provider link cases. The known preflight-retry finding is
closed; this is not a claim of full ticket runtime completion.

Private-thread account viewing now emits only the Accounts control on the first
staff application message, with no applicant invitation or ticket-management
controls. Viewer preparation, selection and replay require current ticket-staff
authorization and the exact succeeded thread message/channel evidence; sessions
cannot move between the public application channel and staff thread. Guild-owner
lookups occur before SQL transactions, followed by a locked panel/source revision
check. Fresh Goose001–026 passed ten viewer and eight executor tests at 01:44:26,
including revoked grants, a panel update during the provider lookup, replaced
threads and ambiguous-send recovery that refuses messages without the expected
Accounts control and never repeats the POST. The existing public-channel viewer
audience is unchanged. Six linking-form tests also passed at 01:45:04 on a fresh,
normally approved Goose001–027 harness; forms still make no Discord calls.
The coordinator independently reviewed the viewer, staff authorization and
emitted/reconciled controls and passed all eighteen tests on fresh Goose001–026
at 01:46:09, with no further findings in this scope. An actual signed Bot
private-thread boundary extension remains separate follow-through work.
The roster owner's temporary missing-module typecheck failure is superseded by
the 01:46:12 full TS7/lint and 801-unit-test pass across 96 files.

The 01:52:53 local aggregate passed 801 unit tests across 96 files and full TS7/lint.
The refreshed 01:46 runtime suite passed 16 Workerd tests across seven files, and
the 01:52:56 run passed seven Durable Object tests across two files. These include
the transcript complete-manifest gate, private R2 streaming, roster configuration
authentication, captured application-log exclusions and explicit provider-log
configuration assertions. OpenAPI generation/check passes 365 operations across
300 paths with 59 local schema references. Owner changes continue, so this is not
a final release freeze.
The ticket coordinator now rotates unfinished or throwing jobs behind the rest
of its durable queue instead of repeatedly selecting the same oldest 25 jobs.
Strict priority advancement also handles identical enqueue timestamps. Executor
setup is inside the per-job failure boundary, and accepted IDs are normalized
before deciding whether to invoke the ticket or publication executor. Two new
Workerd tests use the production queue/SQLite/alarm implementation with an
explicit test-only executor: all thirty waiting or failing jobs receive an
attempt by the second batch, work remains scheduled, and terminal results drain
the queue. These are scheduler proofs, not PostgreSQL-inside-Workerd execution.
That queue-fairness change added no namespace or Durable Object migration.
The coordinator independently reviewed this change and passed all seven tests
at 01:53:14. The scoped scheduler starvation finding is closed; this does not
claim PostgreSQL execution or production delivery inside the Workerd fixture.

Mounted ticket/panel recovery now uses a separate `RuntimeRecoveryCoordinator`:
the five-minute scheduled handler wakes its singleton, and bounded alarms scan
100-row keyset pages with exact PostgreSQL timestamp cursors and a fixed scan
watermark. Each page and its outgoing wake backlog commit atomically in DO
SQLite before the cursor advances. Failed destinations remain durably queued
and rotate behind other wakes, so one rejected destination cannot strand later
pages. Inventory lanes also rotate; failures retain a 30-second retry alarm,
while successful continuation uses one second. Cron wakes preserve active
cursors, and eviction preserves both cursors and failed wakes.
Fresh Goose001–026 passes both inventory tests at 02:22:39: more than 100 ticket
and panel jobs, microsecond ties, watermark exclusion, correct queue identities,
pending/expired/uncertain eligibility, and unchanged xmin/leases. The actual
scheduled-handler test passes with a throwing database-construction sentinel,
alongside all sixteen entrypoint tests at 02:21:52. Full Workerd runtime tests
pass 16/7 files at 02:22:41 and Durable Object tests pass 10/3 files at 02:22:45.
The three new DO tests fake only inventory/RPC; the SQL tests are independent.
The parent independently passed all ten DO tests at 02:20:32. A local-only
`v4-runtime-recovery` class migration/binding and generated Wrangler types are
prepared; no namespace was created or deployed. Roster recovery, including
repairs attached to terminal operations, is not yet connected to this executor.
The API owner's fresh 02:23:23 Goose001–026 run also passes all seven panel
publication regressions plus both late-role-write tests. The 02:23:25 aggregate
passes 814 unit tests across 97 files and full TS7 checking. The roster owner
subsequently replaced the control-character regex, and the API owner's fresh
lint and `git diff --check` rerun pass; the temporary lint warning is cleared.
The parent independently reran the actual scheduled-handler suite (16 cases,
02:24:24) and PostgreSQL inventory suite (two cases, fresh Goose001–026 at
02:24:31), closing the mounted ticket/panel recovery review at that checkpoint.
A subsequent held-I/O test reproduced two stalls at 02:27:40: neither an
unfinished inventory read nor an unfinished wake released the alarm. Recovery
now applies a ten-second I/O deadline capped by a shared thirty-second alarm
budget. SQL receives an AbortSignal; its driver cancellation is best-effort.
Timed-out RPCs can still have succeeded remotely, so their durable backlog
records remain retryable and target insertion stays idempotent. Unattempted
batches remain queued, and the thirty-second retry delay starts after the
attempt rather than reusing an overdue crash fallback. All thirteen DO tests
across three files pass at 02:30:04, including held-read/wake cleanup, cancellation
signaling, cumulative-budget exhaustion and eventual backlog drainage. These
tests use short fixture deadlines; they do not assert remote RPC rollback.
The final scoped rerun passes all thirteen DO tests at 02:31:38, including an
explicit unchanged-backlog assertion after a timed-out wake succeeds late.
The complete Workerd runtime suite passes 16 cases at 02:31:05; the unit aggregate
passes 822 cases across 97 files at 02:31:09. TS7, lint and diff checks pass.
Roster delivery remains active owner work, so this is still not a release freeze.
The inert renderer remains a foundation, not full transcript export parity;
[remaining export/deletion and logging gates](worker-ticket-transcripts.md) are explicit.
Normal permission review separately denied the transcript schema contract
handoff; consumer/schema integration is paused without accessing or rerouting
the rejected payload. Independent work remains possible.

Subsequent panel-publication review confirmed an observer of another runner's
live executing lease could send a second Discord POST. An explicit fresh-claim
flag now permits sends only for the invocation that acquired the claim; expired
claims reconcile only. Exact PostgreSQL timestamps replace JavaScript millisecond
comparison. Fresh Goose001–026 passes seven panel-publication tests at 00:49,
including a held first POST/strict second-runner sentinel and two revisions one
microsecond apart within the same millisecond. The coordinator independently
reviewed both guards and reran all seven tests against fresh Goose001–026 at
00:50:40; the duplicate-send and submillisecond-revision findings are closed.
This does not close the broader ticket runtime or release gates.

Independent review reproduced five cross-guild ticket effect mutations before
the correction. Explicit log/message, channel edit/delete and permission targets
now receive a same-guild/exact-ID provider preflight; category edits also require
type 4. Known preflight outages requeue before mutation. Existing notification
and staff-action suites pass 8/3 cases on fresh separate Goose001–026 databases at
01:32. The coordinator's independent 01:33:16 run and API-owner 01:34:11 rerun
both pass eight cases: five foreign-target negatives, one valid same-guild log
delivery and two safe category-retry controls. The executor scope finding is
closed. Configuration still accepts numeric foreign IDs and fails safely at
execution; early settings validation remains a possible refinement. Tracking
revalidated its real Gateway-to-Go-HTTP-to-authenticated-API-to-SQL/executor bridge
at 01:33 using Node26 and fresh Goose001–024: 1.716 seconds, one committed send
after a lost HTTP response, delayed deletion, effect-free replay and rejected
wrong bearer/changed author. Only its fake channel gained the real `type:0`
field. API effects SHA256 was
`7c9013b0fc6cf4cc044242f6b1ad8a89cb492ba23a59173e17daa45f72e0ec26`.
No real Discord action was performed.

All 43 existing roster operations, three refresh routes, two AI routes, seven
moderation routes, bonus replacement, personal link/privacy mutations,
announcements and billing are now mounted. Moderation uses its canonical section
view/manage policy. Read-only roster POST access is an exact five-operation
allowlist plus the shared server-read descriptor, not arbitrary future POSTs.
The renewed authorization covers implementation, not production mutations/deploy.

Signed roster confirmation now passes eleven independent Goose001–025 tests at
01:58:53: own-entry removal and exact replay, signup/group and main-group
substitution, total/per-user capacity rollback, second-account TH rollback,
live clan and guild checks, and transfer/archive/configuration changes during
provider reads. This is membership/receipt/effect-enqueue evidence, not delivered
Discord roles or boards. The roster owner is implementing delivery separately.
The shared Clash player reader now best-effort cancels unread HTTP error bodies
while preserving missing-player versus upstream-failure classification. API-owner
review and nineteen focused roster/Discord tests pass at 02:03:43.

The new read-only roster status resolver independently verifies fresh signed
actor/guild/channel/control/path scope and exposes only recorded publication
message evidence, a fixed safe failure and internal authorized wake metadata.
Seven Goose001–026 tests pass at 02:03:43, with response privacy and unchanged
row/effect/receipt evidence. Recovery inventory is now keyset-paged in batches of
100 with exact PostgreSQL timestamps, UUID tie-breaking and a fixed scan
watermark. It reaches job 101 while the first hundred remain pending; retries
updated beyond the watermark cannot extend that scan forever. The eventual
scheduler must persist/pass the cursor across bounded batches and reset after
exhaustion. These status/recovery functions are not yet mounted behind HTTP or
the roster coordinator, so the five-route parity gap remains open.
The coordinator independently reran the revised keyset suite at 02:04:24 with all
seven passing, including permanently pending rows, scan watermark behavior and
microsecond ties. Query-level starvation is closed, not mounted recovery.
Full TS7/lint and 806 unit tests pass at 02:04:43; seven Durable Object tests pass
at 02:04:45. These supersede the temporary missing delivery-module typecheck.

An independent delayed-provider PostgreSQL test found a P1 roster role delivery
race at 02:06:26. An old PUT is held past its claim expiry; a replacement claim
deletes the now-unwanted role, verifies it and settles successfully. Releasing
the old PUT restores the wrong role, but its stale retry settlement is rejected,
leaving no pending repair. The isolated
`roster-stale-role-delivery.test.ts` initially failed on
`incorrectRole: true, repairQueued: false`. The delivery owner added durable
canonical role repair after stale external writes, with a bounded inline repair
attempt and a separate recovery feed for terminal operations. The parent
independently passed both late-write regressions and effect claims (four cases)
at 02:11:49 on fresh Goose001–026. Its complementary test disables inline repair,
verifies the terminal operation remains immutable and finds the repair through
the recovery feed before converging the role. The reproduced race is closed at
this delivery layer; mounting the terminal-operation repair feed remains open.

Fresh Goose001–024 owner tests pass for roster (11 SQL tests), viewer (six), and
billing/announcements (ten), including actual billing/AI mixed settlement races,
exact credits, webhook replay and retained assignment changes. AI admission is
non-reserving: concurrent admitted requests may settle above the free threshold;
later admission is rejected. The accounting mutex does not make it a hard cap.

Signed Bot→API tests pass for giveaway replay, two-page opening, seven staff
actions/status receipts, and viewing accounts from the actual published button.
Gateway→Go→authenticated API→SQL/executor tests pass with a lost HTTP response,
one ping and delayed deletion. Node bridges exclude the full Worker router and
DO alarm scheduler. The September 4 00:20 unit aggregate passed 667 tests across
87 files. Separate 00:18 runs passed 16 actual workerd tests and five Durable
Object tests. Later panel-source extraction and continuing owner changes need
the final aggregate rerun; these counts are not a frozen release snapshot.

Independent notification review found a pre-Discord dependency-read failure
could terminally fail cleanup; the executor now separates that read and requeues
it. Expanded fault/fence tests and independent PostgreSQL/Tracking reruns closed
the notification review at 23:33 on September 3.
Notification eligibility/recipients are frozen at durable acceptance: subsequent
opt-out/status changes do not cancel an already accepted ping.

Approval preparation/submission now has a durable journal, all 25 named templates,
opaque index selection, actor/guild/channel/canonical-message scope, panel ID and
microsecond revision checks, paginated custom fields, exact hash replay and
atomic submission/effect enqueue. Fresh Goose001–026 passes six approval SQL
tests, including 600 Unicode fields across 120 pages and panel swaps before and
during provider reads. Three staff regressions also passed before the panel-ID
fix. Migration026 expands only approval progress/receipt limits, and runtime
preflight uses PostgreSQL's actual JSONB text byte count. Independent verification
closed the panel-ID finding after repeating all six SQL cases; the broader
approval release gate remains open. A pure 22-token value renderer and pinned equipment-owner
projection exist; the live read-only resolver has four passing provider tests.
Its authoritative Gateway count dependency is not implemented, and that cache
handoff is paused pending an explicit approval-review resolution. No approximate
REST count or partial cached-member count is substituted. Fresh Goose001–026
passes three live SQL leader-resolution tests at 01:25:12: current leader/current
owner after transfer, no fallback for an unlinked leader, and fail-closed handling
of an incomplete clan snapshot. These reads do not mutate links or verification;
leader mentions are distinct from privileged role eligibility. Exact count
integration and Bot→API boundary validation remain open.
The approval route remains explicitly gated.

Ticket approval delivery, transcript-backed deletion, button-click logging,
plus linking with durable post-link effects,
remain functional gates. Transcript access is now explicitly anyone-with-link,
using a high-entropy per-transcript capability while keeping R2 private; attachments
must share that access boundary. Automatic clan greetings remain removed.
The user's server-scoped linking setting requires a valid supplied token on each
new link attempt when enabled, even for an already verified account. It does not
gate account selection or ticket/roster admission. Verified evidence is separately
required for leader/co-leader roles, with other ranks unchanged. The setting's
default is now explicitly OFF, including existing rows. Settings GET/PATCH now
expose a required response boolean and optional strict update boolean; null is
rejected and omission preserves the value. The exact existing disposable
Goose001–027 test command received normal execution approval; all six settings
tests passed at 01:10:54. This local-test permission does not clear separately
rejected schema-proposal handoffs or authorize their retrieval through files.
The separate click-log audit confirmed existing journals cannot preserve a log
before both empty-account and ineligible admission exits without fabricating a
ticket operation. Its new standalone schema-contract handoff was attempted and
explicitly rejected by normal review; schema and consumer work stopped without
reserving a migration or editing files. Trusted user approval is needed, and no
placeholder coordinator/HTTP hook or alternate payload route is used.

Dashboard server linking now requires canonical token/transfer checks with no
staff or same-owner bypass. Provider proof is produced outside SQL transactions,
bound to its subject/player with an opaque in-process marker, frozen, and never
contains the raw token. The short commit transaction rechecks the current locked
policy and ownership, preserves canonical private-data cleanup, and returns both
transfer subjects for the future journal. Global linking uses the same stages
without a server policy. Fresh Goose001–027 passes 25 global/scoped/Dashboard SQL
tests at 01:21:26, including rejecting a wire-cloned proof and identifying both
transfer owners. Five independently authored concurrency tests pass while each
provider is held: server policy writes remain possible, OFF-to-ON rejects a
tokenless commit, and valid proof verifies once. These do not prove receipt/outbox
atomicity, which remains unimplemented.
The distinct post-link role-journal handoff was first attempted during this turn
and explicitly rejected by normal permission review. The schema owner stopped
without reserving or writing a migration. This dependency now requires trusted
user approval; no denied payload is retrieved, recreated or relayed through an
alternate route. Existing independently approved local tests remain allowed.

Read-only ticket linking forms and source-bound opening preparations are
implemented; submission still waits for the atomic post-link journal. The signed
guild slash-link endpoint, full role snapshot/delivery/reconciliation and retained
nickname evaluation remain unfinished. Pure normalized role evaluation exists
with per-account verification for leader/co-leader; achievement/status and legacy
personal-best/only-family/ignored-role dispositions are not silently treated as
completed or removed. Automatic greetings alone remain intentionally removed.
Persistent roster publication is authorized through rosters:manage; self-removal
despite TH ineligibility is now explicitly allowed with existing ownership/staff
proof, and viewers must highlight currently TH-ineligible entries. Persistent roster publication and signed signup/removal/sub
sessions are also retained capabilities beyond the generic routes; their new
contracts now enter the denominator; their implementation remains incomplete.
Schema025 has passed fresh/upgrade/concurrency checks; runtime preparation is
under active implementation. Retained capacity, member groups/substitute/role
configuration and Dashboard controls remain required, including common locking
and mixed-writer capacity/per-user validation across every membership writer.

New media writes use R2 only. Private clashking-media and clashking-ticketing
buckets exist without r2.dev/custom-domain exposure; no historical content was
copied, uploaded or deleted. Transcript contents/serving remain unshipped.
The original RC0 and roster-link-preview-v6 pairs are superseded for Dashboard
preview work. The latest immutable local preparation is `clashking-api-release-QLH0F8`,
interim, not final: contracts SHA256
`fe3fb4d14d3afc632a31fe3ed6e111ae6326f17d7cc31c1b340e6eb6d372f116`, client SHA256
`d5aca882b3a34cd9895271f9bae5bd9cd659d9adbb63ebd28692c4f50e0fe9ed`.
This pair includes the settings flag, server-link token transport and three
transcript-read descriptors. Dashboard reports 694 tests plus type/lint/build
and all 30 locales passing on this pair. Expo and Admin remain on previous snapshots pending a
genuine final freeze. Admin is restricted to its own application; remaining
Dashboard roster configuration work stays with the Dashboard owner.
Acceptance requires coherent source/package hashes, consumer reruns and registry
install provenance for a future separately authorized publication. Current work
ends at validated local artifacts, not a registry mutation. Hyperdrive secret transfer, VPC origins, missing app-update
bucket, provider settings, schema release, backfill and rollback remain open.
No production deployment or traffic switch has occurred.

## Historical checkpoint — superseded by the current checkpoint above

The earlier 2026-09-03 static parity report recorded 250/319 routes
integrated, including the 15 authentication lifecycle routes. The remaining
69 routes are listed below. Static
integration does not establish authorization correctness or deployment readiness.

The 43 implemented roster operations remain unmounted: their dispatcher and
contracts still have approval-blocked strictness work. Narrow fixes for two
independently reproduced authorization defects passed independent review and
fresh-database tests; those do not resolve the broader gate. The other five roster operations (AI context/usage,
refresh-batch, refresh-data, and server-scoped roster refresh) remain blocked.
Other families below have no accepted integrated implementation. Rejected edits
must not be retried through a different writer or substituted implementation.
The seven moderation handlers exist with Bot-only authorization, but remain
unmounted because restoring the canonical server-section authorization was
approval-blocked. Their existence is not evidence of route parity.

## Validated integration snapshot

After authentication mounting, the 2026-09-03 14:29 CDT run passed 549 unit tests
across 67 files, three Durable Object tests, and 14 actual workerd runtime tests
across five files. TypeScript, lint, OpenAPI validation (333 operations and 59
resolved local references), the dry-run bundle, and `git diff --check` passed.
The bundle was 4324.32 KiB raw / 871.64 KiB gzip. The preceding complete database
run passed 79 tests across 23 independently Goose-migrated Timescale fixtures,
including the authentication SQL/race tests. No production database was used.

The SMTP review accepted frozen `auth-mailer.ts` SHA256
`af1b0dbff056a106b263d30299aa30c68328aee404c31faade465a848490f280`.
Real-provider delivery remains unverified; local runtime tests sent only to
isolated fixtures. These checks validate the implemented subset, not completion
of the 319-route objective or permission to deploy.

## Roster operations (48)

- `POST /v2/roster/ai/context`
- `POST /v2/roster/ai/usage`
- `POST /v2/roster/members/query`
- `POST /v2/roster/account-groups/query`
- `POST /v2/roster/refresh-batch`
- `POST /v2/server/:server_id/rosters/:roster_id/discord-identity/refresh`
- `POST /v2/roster/views/preview`
- `POST /v2/roster/membership-changes/validate`
- `POST /v2/roster/membership-changes`
- `GET /v2/roster/metrics`
- `POST /v2/roster/metrics/query`
- `GET /v2/roster/views`
- `POST /v2/roster/views`
- `GET /v2/roster/views/shared/:viewId`
- `GET /v2/roster/views/:viewId`
- `PATCH /v2/roster/views/:viewId`
- `DELETE /v2/roster/views/:viewId`
- `PUT /v2/roster/questionnaire`
- `POST /v2/roster/refresh-data`
- `POST /v2/server/:server_id/rosters/:roster_id/refresh`
- `GET /v2/server/:server_id/rosters`
- `GET /v2/server/:server_id/rosters/:roster_id`
- `GET /v2/server/:server_id/rosters/:roster_id/signup-form`
- `POST /v2/server/:server_id/rosters/:roster_id/submissions`
- `GET /v2/server/:server_id/rosters/:roster_id/missing-members`
- `GET /v2/public/rosters/:publicShareId`
- `POST /v2/roster`
- `GET /v2/roster/missing-members`
- `PATCH /v2/roster/:roster_id`
- `GET /v2/roster/:roster_id`
- `DELETE /v2/roster/:roster_id`
- `DELETE /v2/roster/:roster_id/members/:player_tag`
- `POST /v2/roster/refresh`
- `POST /v2/roster/:roster_id/clone`
- `GET /v2/roster/:server_id/list`
- `POST /v2/roster-group`
- `GET /v2/roster-group/list`
- `GET /v2/roster-group/:group_id`
- `PATCH /v2/roster-group/:group_id`
- `DELETE /v2/roster-group/:group_id`
- `POST /v2/roster/:roster_id/members`
- `PATCH /v2/roster/:roster_id/members/:member_tag`
- `POST /v2/roster/:roster_id/members/:member_tag/refresh`
- `POST /v2/roster-automation`
- `GET /v2/roster-automation/list`
- `PATCH /v2/roster-automation/:automation_id`
- `DELETE /v2/roster-automation/:automation_id`
- `GET /v2/roster/server/:server_id/members`

## Moderation (7)

- `GET /v2/server/:server_id/strikes`
- `POST /v2/server/:server_id/strikes/:player_tag`
- `DELETE /v2/server/:server_id/strikes/:strike_id`
- `GET /v2/server/:server_id/strikes/player/:player_tag/summary`
- `GET /v2/server/:server_id/bans`
- `POST /v2/server/:server_id/bans/:player_tag`
- `DELETE /v2/server/:server_id/bans/:player_tag`

## Personal link mutations (4)

- `POST /v2/links/:id`
- `DELETE /v2/links/:id/:playerTag`
- `PATCH /v2/links/:id/:playerTag`
- `PUT /v2/links/:id/order`

## Billing (4)

- `PUT /v2/billing/subscription/assignment`
- `POST /v2/billing/stripe/checkout`
- `POST /v2/billing/stripe/portal`
- `POST /v2/billing/stripe/webhook`

## Privacy export and deletion (2)

- `GET /v2/auth/export`
- `DELETE /v2/auth/me`

## Announcement mutations (3)

- `POST /v2/app/announcements`
- `PUT /v2/app/announcements/:id`
- `DELETE /v2/app/announcements/:id`

## CWL bonus recipient replacement (1)

- `PUT /v2/server/:server_id/cwl/:clan_tag/bonus-recipients`

## Separate release prerequisites

Hyperdrive creation remains paused pending direct approval to transfer the
production database credential. Private HTTP VPC origins, the app-updates R2
binding, provider configuration, npm publication access, schema publication and
production data backfill remain prerequisites described in
[the deployment gate](cloudflare-worker-deployment.md). The dedicated API-only KV
namespace is provisioned; it does not unblock those other prerequisites.

This inventory is a status artifact, not authorization to deploy or switch traffic.
