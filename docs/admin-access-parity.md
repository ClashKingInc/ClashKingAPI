# Admin Access authentication parity

The authentication baseline is `ClashKingAdminPanel` commit
`a4c1481c12e63eb39ec05f4be9db422263ad6ffe`, specifically
`src/server/adminApi.ts:260` (`requireAdmin`), `:292`
(`cloudflareTeamDomain`) and `:298` (`mapAccessUser`). The saved
`src/types/admin.ts:8` makes profile timestamps optional, and
`src/lib/auth.tsx` reads this profile from `/auth/me` without requiring them.

`workers/api/src/access.ts` now preserves that recorded original source authorization rule:
the configured Cloudflare Access application decides who is admitted. The
Worker independently verifies the assertion's RS256 signature against the
configured team's rotating signing keys, its exact issuer and application
audience, and the JWT time claims. The identity must include a nonempty subject
and string email. It does not trust a plain email header or an unsigned token.
This follows [Cloudflare's Worker JWT verification guidance](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

Every identity admitted by those checks receives the existing Admin profile:
`id` is the subject, `email` and `username` are the email claim, `display_name`
is the trimmed name claim or email prefix, `role` is `owner`, and `active` is
`true`. There is no second database admission check or read-versus-write role
split. Authentication does not acquire SQL, update login timestamps, or invent
account creation/update dates. Optional profile fields in the shared contract
remain optional, matching the saved Admin type. Business operations still use
their existing database and audit behavior; this change does not alter those
operations or remove any tables.

The Access application's policy must therefore admit only people who should
have full Admin access. Merely being part of the same Cloudflare team is not
enough: a token for a different application audience is rejected. The configured
team and audience are deployment inputs, not values supplied by the request.
Missing configuration returns 503, a missing assertion returns 401, and an
invalid or incomplete assertion returns 403, matching the recorded original source baseline.
There is no development or localhost authentication bypass in this Worker.

The current `X-Requested-With: XMLHttpRequest` requirement and API CORS
protections remain in place for the separate Admin frontend. They supplement
signed Access verification and cannot replace it. A request missing the AJAX
header remains forbidden before authentication for browser Admin calls, even if configuration or its
assertion is also missing. No deployment policy, live account, or infrastructure
has been changed by this restoration.

The two retained Go Tracking reads, `/v2/admin/tracking/summary` and
`/v2/admin/tracking/timeseries`, additionally accept the exact configured API Bot
bearer token, preserving their original service-to-service callers. This narrow
path does not invent an Admin identity, grant other Admin endpoints, or require
the browser AJAX header. Browser callers still go through the Access checks
above. Invalid or missing service tokens receive the original 401 response;
the separate admission tests cover both caller paths and reject Bot access to
all other 37 Admin routes.

`workers/api/src/access.test.ts` verifies real locally generated signatures
against intercepted JWKS responses, with no external network or SQL. It covers
the profile, `/v2/admin/me` encoding, missing configuration/assertions/AJAX,
expired and future tokens, wrong/missing issuer or audience, incomplete
identities, wrong signatures, forbidden algorithms, and failed key retrieval.
`workers/api/src/admin.test.ts` also checks that all 39 Admin routes use the same
Access admission check for browser callers without an invented role parameter.
`workers/api/src/tracking-admission.test.ts` covers the two explicit service
exceptions and normalized query validation after authentication.
