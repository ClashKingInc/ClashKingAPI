# Retained Dashboard ticket settings

The local SQL run found that the saved rewrite required `ticket_panels.id` and
`archived_at`, introduced by migration 017 together with a deferred bot-runtime
foreign key. Existing Dashboard settings do not need that redesign.

The retained implementation now uses the original `(server_id, name)` identity
from schema 002 and original Go `internal/routes/server/tickets.go` at comparison
commit `90436aa042aa85ab1112ea12f3490787e2104b51`:

- List, create, update and delete settings without runtime tables or journals.
- Delete removes only the selected configuration row, as the original handler
  does. This is implemented and tested with disposable fixtures; no live row was
  deleted. Applied migration history remains unknown and must be reconciled
  before any production migration or deployment.
- Button IDs again have the original `panelName_milliseconds` form. A selected
  collision guard advances the suffix if the same panel already has that ID;
  the existing transaction lock serializes writers.
- Public panel/button schemas no longer require invented UUID fields.
- Approval settings again keep the first nonblank-named template, preserving its
  text, rather than adopting the deferred bot design's 25-template interface.
- Existing explicit prohibition on the everyone role as ticket staff remains.
  Provider actions and ticket command execution are not added here.

The schema-owned retained test profile deliberately excludes migration 017.
It is not rewritten or partially applied. Deferred source stays available for
the later bot specification, without governing active Dashboard behavior.

Focused unit tests cover original payloads and collision handling. The retained
SQL suite exercises all nine operations, preserved settings/Discord IDs,
normalization, physical deletion and recreation. See the root implementation
status for current combined test results.
