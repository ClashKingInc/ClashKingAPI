# Deferred roster-member-group configuration

The five new configuration operations listed in
`docs/worker-route-additions-review.md` are not part of this API port. That audit
found no matching registration in the pinned original Go API, and no caller in
the audited original/saved Dashboard, Expo, or Admin sources. They are also not
required by the approved own-entry-removal behavior.

The active router no longer mounts `dashboard-roster-configuration.ts`. The
five descriptors are absent from the root/Dashboard endpoint maps, shared
client surface, and generated OpenAPI:

- `GET /v2/server/:serverId/roster-member-groups`
- `POST /v2/server/:serverId/roster-member-groups`
- `PATCH /v2/server/:serverId/roster-member-groups/:memberGroupId`
- `DELETE /v2/server/:serverId/roster-member-groups/:memberGroupId`
- `PUT /v2/server/:serverId/rosters/:rosterId/member-groups`

Their source and isolated tests remain reference-only for a later
Bot/configuration plan. Imports of the five descriptors, their map, and two
configuration-only schemas now require the existing explicit
`@clashking/api-contracts/deferred-runtime` entry. This adds eight reference
exports, bringing that entry to 53 exports. Its 19 orchestration descriptors
remain separate from these five configuration descriptors.

`RosterCapacity`, `RosterMemberGroupSetting`, and
`RosterBuilderMemberGroupSetting` remain active shared value schemas because
retained roster payloads depend on them. No roster response shape, existing
configuration data, SQL schema, or stored group assignment was changed.

The original `/v2/roster-group` create/read/update/delete/list operations and
`POST /v2/roster/account-groups/query` remain mounted and exported. Boundary
tests check their existing authentication and verify that all five deferred
configuration methods return 404 without SQL or outbound provider calls, both
without credentials and with a valid fixture Bot credential. Contract and
OpenAPI tests prevent the reference descriptors from leaking back into active
client documentation.
