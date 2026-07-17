# Privacy Compliance Notes

This branch is the Go + SQL API surface used by the mobile app, dashboard, bot, and tracking services. It stores authenticated user accounts, Discord identities, player links, search preferences, notification preferences, and push-device records.

## Controls added

- `GET /v2/auth/export` and `GET /v2/privacy/export` return the authenticated user's account profile and linked personal-data records without token ciphertext, token hashes, password hashes, or internal secrets.
- `DELETE /v2/auth/me` and `POST /v2/privacy/delete-request` remove the authenticated account and linked personal data from known SQL tables, including auth tokens, Discord tokens, player links, bookmarks, recent searches, search groups, notification preferences, push devices, war subscriptions, and live activities.
- Deletion is tolerant of partially deployed schemas so older environments do not fail when newer mobile-notification tables are not present yet.

## Operational requirements

- Treat Discord IDs, email addresses, player links, bookmarks, recent searches, device IDs, push tokens, and notification preferences as personal data.
- Do not include password hashes, OAuth tokens, refresh tokens, API token hashes, push-token ciphertext, or internal credentials in exports.
- Remove push tokens immediately on opt-out, logout, account deletion, or invalid-token feedback.
- Keep public Clash of Clans historical data only after account links are removed or where retention is necessary for product history, security, or legal obligations.
- Complete verified privacy requests within 30 days unless a stricter local requirement applies.
