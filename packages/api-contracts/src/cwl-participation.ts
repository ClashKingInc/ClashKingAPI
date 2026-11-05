import { Schema } from "effect"

export const CwlParticipationQuery = Schema.Struct({ season: Schema.optionalKey(Schema.String) })
export const CwlParticipationResponse = Schema.Struct({
  season: Schema.NullOr(Schema.String),
  availableSeasons: Schema.optionalKey(Schema.Array(Schema.String)),
  history: Schema.optionalKey(Schema.Array(Schema.Struct({
    season: Schema.String, clanCount: Schema.Int, registeredPlayerCount: Schema.Int, groupCount: Schema.Int,
  }))),
  clanCount: Schema.Int, registeredPlayerCount: Schema.Int, groupCount: Schema.Int,
  items: Schema.Array(Schema.Struct({
    leagueId: Schema.Int, warSize: Schema.Int, groupCount: Schema.Int,
    clanCount: Schema.Int, registeredPlayerCount: Schema.Int,
    townHallDistribution: Schema.Array(Schema.Struct({ level: Schema.Int, count: Schema.Int })),
    sameTownHallHitRates: Schema.NullOr(Schema.Array(Schema.Struct({
      level: Schema.Int, attacks: Schema.Int, threeStarAttacks: Schema.Int,
      threeStarRate: Schema.NullOr(Schema.Number),
    }))),
    finalizedWars: Schema.Int, archivedWars: Schema.Int, calculatedAt: Schema.String,
  })),
})
