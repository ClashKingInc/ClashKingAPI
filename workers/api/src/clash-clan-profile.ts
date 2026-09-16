import { Schema } from "effect"

export const ClashClanProfile = Schema.Struct({
  tag: Schema.String, name: Schema.String, description: Schema.String, clanLevel: Schema.Number,
  location: Schema.optionalKey(Schema.Struct({ id: Schema.Number })), warLeague: Schema.optionalKey(Schema.Struct({ id: Schema.Number })),
  capitalLeague: Schema.optionalKey(Schema.Struct({ id: Schema.Number })), isWarLogPublic: Schema.Boolean,
  warWins: Schema.Number, warWinStreak: Schema.Number, clanPoints: Schema.Number, members: Schema.Number,
  badgeUrls: Schema.Struct({ large: Schema.optionalKey(Schema.String), medium: Schema.optionalKey(Schema.String), small: Schema.optionalKey(Schema.String) }),
  memberList: Schema.Array(Schema.Struct({ tag: Schema.String, name: Schema.String, donations: Schema.Number, donationsReceived: Schema.Number })),
})

export type ClashClanProfileValue = typeof ClashClanProfile.Type

export const normalizeClashClanProfile = (clan: ClashClanProfileValue) => ({
  tag: clan.tag,
  name: clan.name,
  description: clan.description,
  clanLevel: clan.clanLevel,
  locationId: clan.location?.id ?? null,
  warLeagueId: clan.warLeague?.id || 48_000_000,
  capitalLeagueId: clan.capitalLeague?.id ?? null,
  publicWarLog: clan.isWarLogPublic,
  warWins: clan.warWins,
  warWinStreak: clan.warWinStreak,
  clanPoints: clan.clanPoints,
  memberCount: clan.members,
  badgeToken: (clan.badgeUrls.large ?? clan.badgeUrls.medium ?? clan.badgeUrls.small ?? "").split("/").at(-1)?.replace(/\.png$/u, "") ?? "",
  donated: clan.memberList.reduce((sum, member) => sum + member.donations, 0),
  received: clan.memberList.reduce((sum, member) => sum + member.donationsReceived, 0),
  members: clan.memberList.filter((member) => member.tag !== "").map(({ tag, name }) => ({ tag, name })).sort((a, b) => a.tag.localeCompare(b.tag)),
})
