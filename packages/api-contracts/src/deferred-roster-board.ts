import { Schema } from "effect"
import { DashboardRoster, DashboardRosterMember } from "./dashboard-roster.js"
import { DecimalSnowflake } from "./discord.js"
import { RuntimeUUID } from "./persistent-runtime.js"
import { RosterCapacity, RosterMemberGroupSetting } from "./roster-configuration.js"

/** Preserved input for the deferred bot board reference, never an active API response. */
export const DeferredRosterBoardData = Schema.Struct({
  ...DashboardRoster.fields,
  capacity: RosterCapacity,
  roster_role_id: Schema.NullOr(DecimalSnowflake),
  member_groups: Schema.Array(RosterMemberGroupSetting),
  members: Schema.Array(Schema.Struct({
    ...DashboardRosterMember.fields,
    member_group_id: Schema.NullOr(RuntimeUUID),
    is_substitute: Schema.Boolean,
  })),
})
