import { Schema } from "effect"
import { ClanWarLeagueClan, ClanWarLeagueClanMember, ClanWarLeagueRound } from "@clashking/clash-contract/effect"
import { IconUrls } from "./expo-common.js"
import { ProxyCwlGroupResponse, ProxyWarResponse } from "./proxy.js"

const Count = Schema.Int
const Average = Schema.NullOr(Schema.Number)
const TownHallBuckets = Schema.Record(Schema.String, Count)
const ScoreFields = {
  stars: Count, "3_stars": TownHallBuckets, "2_stars": TownHallBuckets, "1_star": TownHallBuckets,
  "0_star": TownHallBuckets, total_destruction: Schema.Number,
}
export const CwlMemberEnrichment = Schema.Struct({
  avgMapPosition: Average, avgOpponentPosition: Average, avgAttackOrder: Average,
  avgTownHallLevel: Average, avgOpponentTownHallLevel: Average, avgAttackerPosition: Average,
  avgDefenseOrder: Average, avgAttackerTownHallLevel: Average,
  attackLowerTHLevel: Count, attackUpperTHLevel: Count, defenseLowerTHLevel: Count, defenseUpperTHLevel: Count,
  attacks: Schema.Struct({ ...ScoreFields, attack_count: Count, missed_attacks: Count }),
  defense: Schema.Struct({ ...ScoreFields, defense_count: Count, missed_defenses: Count }),
})
const League = Schema.Struct({ id: Schema.Number, name: Schema.String, iconUrls: Schema.optionalKey(IconUrls) })
const Clan = Schema.Struct({ ...ClanWarLeagueClan.fields, members: Schema.Array(ClanWarLeagueClanMember) })
const CwlRound = Schema.Struct({ ...ClanWarLeagueRound.fields, warTags: Schema.Array(Schema.String) })
export const CurrentCwlGroup = Schema.Struct({
  ...ProxyCwlGroupResponse.fields,
  war_league: Schema.optionalKey(Schema.String), iconUrls: Schema.optionalKey(IconUrls),
  clans: Schema.Array(Schema.Struct({ ...Clan.fields, warLeague: Schema.optionalKey(League) })),
  rounds: Schema.Array(CwlRound),
})
export const EnrichedCwlGroup = Schema.Struct({
  ...CurrentCwlGroup.fields,
  total_stars: Count, total_destruction: Schema.Number,
  clans: Schema.Array(Schema.Struct({
    ...CurrentCwlGroup.fields.clans.value.fields,
    total_stars: Count, attack_count: Count, missed_attacks: Count, total_destruction: Schema.Number,
    total_destruction_inflicted: Schema.Number, wars_played: Count, rank: Count, town_hall_levels: TownHallBuckets,
    members: Schema.Array(Schema.Struct({ ...ClanWarLeagueClanMember.fields, ...CwlMemberEnrichment.fields })),
  })),
})
export const CurrentLeagueWar = Schema.Struct({ ...ProxyWarResponse.fields, war_tag: Schema.String })
export const CurrentWarSummary = Schema.Struct({
  clan_tag: Schema.String, isInWar: Schema.Boolean, isInCwl: Schema.Boolean,
  war_info: Schema.Struct({ state: Schema.String, currentWarInfo: Schema.optionalKey(ProxyWarResponse), bypass: Schema.optionalKey(Schema.Boolean) }),
  league_info: Schema.NullOr(EnrichedCwlGroup), war_league_infos: Schema.Array(CurrentLeagueWar),
})
