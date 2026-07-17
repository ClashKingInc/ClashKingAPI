# Privacy Compliance Notes

ClashKing API exposes public Clash of Clans statistics and authenticated management endpoints. Global mobile deployment means the service must support privacy rights consistently with the mobile app, dashboard, bot, and tracking services.

## Data handled here

- Public Clash of Clans player, clan, war, raid, ranking, and history data retrieved from official game APIs.
- Authenticated API user accounts, permissions, password hashes, and short-lived JWTs.
- Server, roster, ticketing, giveaway, and token records used by ClashKing services.
- Generated media and CDN URLs for user-configured bot/dashboard features.

## Controls added

- `POST /auth/export` and `GET /privacy/export` return authenticated API account data without password hashes or Mongo identifiers.
- `DELETE /auth/me` and `POST /privacy/delete-request` create a verified erasure request in `clashking.privacy_requests`.
- `GET /privacy/retention` publishes the retention contract for tokens, API accounts, privacy requests, and public game statistics.
- Privacy requests are recorded with `username`, `type`, `status`, `received_at`, and `source` so operators can action GDPR/CCPA/LGPD/PIPEDA/APPI/PIPL/PDPA access and erasure requests.

## Operational requirements

- Complete verified export/deletion requests within 30 days unless a stricter local rule applies.
- Do not include password hashes, raw API tokens, bot tokens, or internal credentials in exports.
- Delete or anonymize user-authored records unless retention is needed for fraud, security, audit, or legal obligations.
- Keep public game telemetry separate from user account data. If a player tag is linked to a Discord/user account, treat that link as personal data.
- Keep CORS and token-bearing endpoints behind HTTPS in production.
