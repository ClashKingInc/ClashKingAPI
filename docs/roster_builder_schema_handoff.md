# Roster builder schema handoff

The API roster builder targets the authoritative DevKit two-file baseline. Its application and roster schema now lives in `database/timescale/002_initial_settings.sql`; no application-local migrations are required or included.

The roster contract originally landed as `004_roster_architecture.sql` at DevKit commit `77be112`, after the V2 cleanup in `003_v2_schema_cleanup.sql`. Those names remain useful historical references, but both migrations were later squashed into `001_initial_stats.sql` and `002_initial_settings.sql`, so a fresh database ends at Goose version 2 and does not replay 003 or 004.

The API uses the migration's exact contracts for:

- bounded `rosters.signup_questions`, display-column and sort configuration, public share/view linkage, refresh state, and `roster_role_id`
- canonical roster-member snapshots and `signup_answers`
- versioned `roster_views` sandbox source programs and compact share IDs
- `roster_ai_usage` token and cost accounting
- roster AI usage credits and sponsor assignment
- roster-independent `cwl_bonus_recipients`

Wire-only camelCase is transformed where the persisted JSON contract differs. In particular, questionnaire `aiDescription` is stored as `ai_description`; generated view output and runtime roster selection are not persisted.

Public roster responses require `public_enabled`, `public_share_id`, and `public_view_id`. The public wire response remains the restricted roster/member projection and does not expose saved source programs, Discord identity, answers, or private statistics.

AI membership proposals remain in the browser session and carry expected roster revisions. The API locks and revalidates those revisions before applying an approved add/remove/move set atomically; no durable draft or approval token is stored.
