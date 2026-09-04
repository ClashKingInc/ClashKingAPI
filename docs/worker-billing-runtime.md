# Billing and managed announcement mutation handoff

The central Worker implementations are `workers/api/src/billing-runtime.ts` and `workers/api/src/announcement-mutations.ts`. The API owner mounts their dispatchers and includes their literal route inventories in parity checks. The Admin static Worker has no Stripe SDK, storage binding, or billing secret.

## Provider version provenance

The inherited `go.mod` pins `github.com/stripe/stripe-go/v85 v85.2.0`. That module's `api_version.go` pins outgoing requests to **2026-05-27.dahlia**. The Worker now pins **stripe 22.6.1**, verified against npm on September 3, 2026, with outgoing API version **2026-08-26.dahlia**, matching the installed SDK's generated version. This is an explicit provider-contract change, not a claim that the production webhook endpoint was updated.

No source configuration establishes the deployed webhook endpoint's selected payload version. `STRIPE_WEBHOOK_SECRET` configures signature verification only. No production webhook configuration was inspected or changed. A deployment review must obtain the existing endpoint version and a suitably redacted representative event before claiming exact production-payload validation.

The signed PostgreSQL regression uses the inherited Go subscription model's top-level `current_period_end` and `items.data[].price.id`, labeled with the inherited SDK version. It goes through the real SDK signature verifier and dispatcher, then fetches current subscription state through a fake adapter. It proves compatibility with the source model, not with a captured production payload. There is no legacy period-field fallback: the event supplies its customer identity; the current API supplies current subscription items and periods. The old Go signature-only fixture lacks required real-event identity/mode fields and is not treated as a valid subscription projection fixture.

## Persistence and failure boundaries

- Schema migration **022** owns durable `billing_customer_operations` and `billing_subscriptions.initial_assignment_applied`. No app-owned migration or production apply is introduced.
- Customer creation commits a random operation identity before contacting Stripe. Account-row and subject-row locks serialize requests. Retries before 23 hours reuse the same Stripe idempotency key and parameters. Older unresolved attempts use read-only exact-operation metadata reconciliation; zero/multiple matches fail closed for manual reconciliation and never trigger another create.
- Webhooks read at most 1 MiB without stripping a BOM or accepting malformed UTF-8. The SDK verifies the exact body with its five-minute signature tolerance, and test/live mode must match the restricted key. Event IDs are deduplicated in the same transaction as entitlement projection.
- Stripe does not guarantee event delivery order, and event creation timestamps do not totally order events. Under account/subject/customer locks, the adapter exhausts current customer subscriptions with a bounded ten-page read and rejects incomplete item collections. Active/trialing subscriptions with the configured price take precedence. An old deletion cannot revoke a different current active subscription.
- Server assignments require user authentication and current Dashboard server access. Only active subscriptions can assign a server. The first active projection can seed the Checkout server once; later webhooks preserve explicit moves and clears. Migration 022 marks pre-existing subscriptions initialized so their preferences win. Entitlement and assignment writes share migration 023's permanent accounting mutex with AI authorization and settlement. Billing acquires its auth-user/subject locks first, then the global accounting mutex, then entitlement/assignment rows; it never takes the global mutex before an auth-user lock. Stripe reads finish before taking the global mutex.
- Provider failures roll back projection and event recording. A retry can process the same event later. Raw event and subscription snapshots remain available in their existing audit columns. Verified notification accounts are not changed by the historical bookmarked-account entitlement update; the authoritative schema currently permits only verified notification accounts.

## Validation and release gates

Focused unit tests: `workers/api/src/billing-runtime.test.ts` and `workers/api/src/announcement-mutations.test.ts`. PostgreSQL tests: `workers/api/test/postgres/billing-runtime.test.ts` and `workers/api/test/postgres/announcement-mutations.test.ts`, run through the schema-owned disposable Goose harness. These cover raw signatures, tolerance, mode separation, bounded bodies, customer ownership/idempotency, lost responses, concurrent retries, duplicate/out-of-order events, assignment races, failed-provider rollback, and announcement lifecycle/authorization/contracts. Two real-dispatcher lock tests prove assignment/webhook writers wait for the shared accounting mutex, roll back on PostgreSQL `55P03`, and succeed after release. A mixed real AI-settlement/billing-dispatcher test races three $2.50 settlements, duplicate settlement and webhook retries, a failed provider read, and an assignment change: total cost remains $7.50 while only $5.00 is allocated, even after replay. All provider mutations in tests use fake HTTP or fake adapters; no real Stripe mutations are permitted.

The API owner still owns final Node 26/npm 12 whole-repository validation, entrypoint review, route parity, and deployment gates. Production keys, webhook payload version, restricted-key permissions, and public return URLs remain deployment configuration. Use separate restricted keys and signing secrets per environment, stored in Cloudflare secrets rather than the frontend or source.

## Non-outlined decisions

The Worker upgrades the outgoing Stripe API version with the latest verified SDK, uses durable customer-create operation identities, reconciles current provider state instead of trusting delivery order, and preserves explicit assignment changes. The announcement contract rejects unknown fields and impossible calendar dates. These changes are local implementation decisions; no production endpoint, subscription, object, DNS record, or traffic routing was changed.

Stripe Tax is **not enabled** by this migration. Before enabling automatic tax, review the account's registrations and the intended tax treatment; a billing rewrite is not authorization to change collection behavior.

References: [Stripe webhook signatures and ordering](https://docs.stripe.com/webhooks), [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests), [Tax for recurring payments](https://docs.stripe.com/billing/taxes/collect-taxes).
