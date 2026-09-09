import { Schema } from "effect"

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue }

export const JsonValue: Schema.Codec<JsonValue> = Schema.suspend(() =>
  Schema.Union([
    Schema.Null,
    Schema.Boolean,
    Schema.Number,
    Schema.String,
    Schema.Array(JsonValue),
    Schema.Record(Schema.String, JsonValue),
  ]),
)

export const JsonData = Schema.Record(Schema.String, JsonValue)
export const Timestamp = Schema.String
export const NullableString = Schema.NullOr(Schema.String)
export const NullableNumber = Schema.NullOr(Schema.Number)

export const MessageResponse = Schema.Struct({ message: Schema.String })
export const SuccessResponse = Schema.Struct({ success: Schema.Boolean })

export const BadgeUrls = Schema.Struct({
  small: Schema.optionalKey(Schema.String),
  medium: Schema.optionalKey(Schema.String),
  large: Schema.String,
})

export const IconUrls = Schema.Struct({
  small: Schema.optionalKey(Schema.String),
  medium: Schema.optionalKey(Schema.String),
  tiny: Schema.optionalKey(Schema.String),
  large: Schema.optionalKey(Schema.String),
})

export const LeagueReference = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  iconUrls: Schema.optionalKey(IconUrls),
})

export const LocationReference = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  isCountry: Schema.Boolean,
  countryCode: Schema.optionalKey(Schema.String),
  localizedName: Schema.optionalKey(Schema.String),
})

export const ClanReference = Schema.Struct({
  tag: Schema.String,
  name: Schema.String,
  clanLevel: Schema.optionalKey(Schema.Number),
  badge: Schema.optionalKey(Schema.String),
  badgeUrls: Schema.optionalKey(BadgeUrls),
})

export const TagPath = Schema.Struct({ tag: Schema.String })
export const ClanTagPath = Schema.Struct({ clanTag: Schema.String })
export const PlayerTagPath = Schema.Struct({ playerTag: Schema.String })
export const UserPath = Schema.Struct({ userId: Schema.String })

export const PaginationQuery = Schema.Struct({
  limit: Schema.optionalKey(Schema.Number),
  offset: Schema.optionalKey(Schema.Number),
})

export const HistoryQuery = Schema.Struct({
  type: Schema.optionalKey(Schema.String),
  limit: Schema.optionalKey(Schema.Number),
  "time[after]": Schema.optionalKey(Schema.String),
  "time[before]": Schema.optionalKey(Schema.String),
})

export const ProxyErrorResponse = Schema.Struct({
  reason: Schema.String,
  message: Schema.String,
})
