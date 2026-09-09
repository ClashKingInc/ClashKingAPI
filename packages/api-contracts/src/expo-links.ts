import { Schema } from "effect"

import { defineEndpoint, NoBody, NoQuery } from "./endpoint.js"
import { ErrorResponse } from "./errors.js"
import {
  BadgeUrls,
  IconUrls,
  JsonData,
  MessageResponse,
  NullableString,
  UserPath,
} from "./expo-common.js"

export const LinkedPlayer = Schema.Struct({
  tag: Schema.String,
  name: Schema.String,
  townHallLevel: Schema.Number,
  is_verified: Schema.Boolean,
  hidden: Schema.Boolean,
})
export const LinkResponse = Schema.Struct({ message: Schema.String, account: LinkedPlayer })
export const AccountConflictErrorResponse = Schema.Struct({
  code: Schema.Literal("conflict"),
  message: Schema.String,
  request_id: Schema.optionalKey(Schema.String),
  account: LinkedPlayer,
})
export const LinkedAccount = Schema.Struct({
  user_id: Schema.String,
  player_tag: Schema.String,
  order_index: Schema.Number,
  is_verified: Schema.Boolean,
  hidden: Schema.Boolean,
  added_at: Schema.String,
  verified_at: Schema.optionalKey(Schema.String),
  last_login: NullableString,
})
export const LinksResponse = Schema.Struct({ items: Schema.Array(LinkedAccount) })

export const BookmarkType = Schema.Literals(["player", "clan"])
export const Bookmark = Schema.Struct({
  type: BookmarkType,
  tag: Schema.String,
  player_tag: Schema.optionalKey(Schema.String),
  clan_tag: Schema.optionalKey(Schema.String),
  order_index: Schema.Number,
  created_at: Schema.String,
})
export const BookmarksResponse = Schema.Struct({ items: Schema.Array(Bookmark) })

const RecentClan = Schema.Struct({
  tag: Schema.optionalKey(Schema.String),
  name: Schema.optionalKey(Schema.String),
  badgeUrls: Schema.optionalKey(BadgeUrls),
})
const RecentLeague = Schema.Struct({
  id: Schema.optionalKey(Schema.Number),
  name: Schema.optionalKey(Schema.String),
  iconUrls: Schema.optionalKey(IconUrls),
})
const RecentPlayer = Schema.Struct({
  name: Schema.optionalKey(Schema.String),
  tag: Schema.String,
  townHallLevel: Schema.optionalKey(Schema.Number),
  clan: Schema.optionalKey(RecentClan),
  league: Schema.optionalKey(RecentLeague),
  created_at: Schema.String,
})
const RecentClanItem = Schema.Struct({
  name: Schema.optionalKey(Schema.String),
  tag: Schema.String,
  badgeUrls: Schema.optionalKey(BadgeUrls),
  members: Schema.optionalKey(Schema.Number),
  created_at: Schema.String,
})
export const RecentSearchesResponse = Schema.Struct({
  players: Schema.Array(RecentPlayer),
  clans: Schema.Array(RecentClanItem),
})

export const UpgradesResponse = Schema.Struct({
  player_tag: Schema.String,
  data: JsonData,
  updated_at: Schema.NullOr(Schema.String),
})
export const UpgradePreferencesResponse = Schema.Struct({
  player_tag: Schema.String,
  preferences: JsonData,
  updated_at: Schema.NullOr(Schema.String),
})

const UserPlayerPath = Schema.Struct({ userId: Schema.String, playerTag: Schema.String })
const BookmarkPath = Schema.Struct({ userId: Schema.String, type: BookmarkType, tag: Schema.String })
const AddErrors = [
  { status: 403, body: ErrorResponse },
  { status: 404, body: ErrorResponse },
  { status: 409, body: AccountConflictErrorResponse },
] as const
const NotFound = [{ status: 404, body: ErrorResponse }] as const

export const LinksListEndpoint = defineEndpoint({
  operationId: "listExpoLinks",
  method: "GET",
  path: "/v2/links/:userId",
  auth: "user-or-bot",
  summary: "List a user's linked Clash accounts",
  body: NoBody,
  bodyMode: "none",
  pathParams: UserPath,
  query: NoQuery,
  response: LinksResponse,
  responseMode: "json",
  successStatus: 200,
})

export const LinksAddEndpoint = defineEndpoint({
  operationId: "addExpoLink",
  method: "POST",
  path: "/v2/links/:userId",
  auth: "user-or-bot",
  summary: "Link a Clash account to a user",
  body: Schema.Struct({ player_tag: Schema.String, api_token: Schema.optionalKey(Schema.String) }),
  bodyMode: "json",
  pathParams: UserPath,
  query: NoQuery,
  response: LinkResponse,
  responseMode: "json",
  successStatus: 200,
  errors: AddErrors,
})

export const LinksRemoveEndpoint = defineEndpoint({
  operationId: "removeExpoLink",
  method: "DELETE",
  path: "/v2/links/:userId/:playerTag",
  auth: "user-or-bot",
  summary: "Remove a linked Clash account",
  body: NoBody,
  bodyMode: "none",
  pathParams: UserPlayerPath,
  query: NoQuery,
  response: MessageResponse,
  responseMode: "json",
  successStatus: 200,
})

export const LinksVisibilityEndpoint = defineEndpoint({
  operationId: "updateExpoLinkVisibility",
  method: "PATCH",
  path: "/v2/links/:userId/:playerTag",
  auth: "user-or-bot",
  summary: "Update linked-account visibility",
  body: Schema.Struct({ hidden: Schema.Boolean }),
  bodyMode: "json",
  pathParams: UserPlayerPath,
  query: NoQuery,
  response: LinkedAccount,
  responseMode: "json",
  successStatus: 200,
})

export const LinksOrderEndpoint = defineEndpoint({
  operationId: "orderExpoLinks",
  method: "PUT",
  path: "/v2/links/:userId/order",
  auth: "user-or-bot",
  summary: "Reorder linked Clash accounts",
  body: Schema.Struct({ ordered_tags: Schema.Array(Schema.String) }),
  bodyMode: "json",
  pathParams: UserPath,
  query: NoQuery,
  response: MessageResponse,
  responseMode: "json",
  successStatus: 200,
})

export const LinksActivityEndpoint = defineEndpoint({
  operationId: "updateExpoLinkActivity",
  method: "PATCH",
  path: "/v2/links/:userId/last-login",
  auth: "user-or-bot",
  summary: "Record app activity for a user's verified Clash accounts",
  body: NoBody,
  bodyMode: "none",
  pathParams: UserPath,
  query: NoQuery,
  response: Schema.Struct({ timestamp: Schema.String, updated_count: Schema.Number }),
  responseMode: "json",
  successStatus: 200,
})

export const BookmarksListEndpoint = defineEndpoint({
  operationId: "listExpoBookmarks",
  method: "GET",
  path: "/v2/links/:userId/bookmarks",
  auth: "user-or-bot",
  summary: "List a user's bookmarks",
  body: NoBody,
  bodyMode: "none",
  pathParams: UserPath,
  query: Schema.Struct({ type: BookmarkType }),
  response: BookmarksResponse,
  responseMode: "json",
  successStatus: 200,
  errors: NotFound,
})

export const BookmarksAddEndpoint = defineEndpoint({
  operationId: "addExpoBookmark",
  method: "POST",
  path: "/v2/links/:userId/bookmarks",
  auth: "user-or-bot",
  summary: "Create a bookmark",
  body: Schema.Struct({ type: BookmarkType, tag: Schema.String }),
  bodyMode: "json",
  pathParams: UserPath,
  query: NoQuery,
  response: Bookmark,
  responseMode: "json",
  successStatus: 200,
})

export const BookmarksDeleteEndpoint = defineEndpoint({
  operationId: "deleteExpoBookmark",
  method: "DELETE",
  path: "/v2/links/:userId/bookmarks/:type/:tag",
  auth: "user-or-bot",
  summary: "Delete a bookmark",
  body: NoBody,
  bodyMode: "none",
  pathParams: BookmarkPath,
  query: NoQuery,
  response: MessageResponse,
  responseMode: "json",
  successStatus: 200,
  errors: NotFound,
})

export const BookmarksOrderEndpoint = defineEndpoint({
  operationId: "orderExpoBookmarks",
  method: "PUT",
  path: "/v2/links/:userId/bookmarks/order",
  auth: "user-or-bot",
  summary: "Reorder bookmarks",
  body: Schema.Struct({ type: BookmarkType, ordered_tags: Schema.Array(Schema.String) }),
  bodyMode: "json",
  pathParams: UserPath,
  query: NoQuery,
  response: MessageResponse,
  responseMode: "json",
  successStatus: 200,
})

export const RecentSearchesEndpoint = defineEndpoint({
  operationId: "listExpoRecentSearches",
  method: "GET",
  path: "/v2/links/:userId/searches",
  auth: "user-or-bot",
  summary: "List recent searches",
  body: NoBody,
  bodyMode: "none",
  pathParams: UserPath,
  query: NoQuery,
  response: RecentSearchesResponse,
  responseMode: "json",
  successStatus: 200,
})

export const UpgradesGetEndpoint = defineEndpoint({
  operationId: "getExpoUpgrades",
  method: "GET",
  path: "/v2/links/:userId/:playerTag/upgrades",
  auth: "user-or-bot",
  summary: "Get saved upgrade state",
  body: NoBody,
  bodyMode: "none",
  pathParams: UserPlayerPath,
  query: NoQuery,
  response: UpgradesResponse,
  responseMode: "json",
  successStatus: 200,
})

export const UpgradesPutEndpoint = defineEndpoint({
  operationId: "putExpoUpgrades",
  method: "PUT",
  path: "/v2/links/:userId/:playerTag/upgrades",
  auth: "user-or-bot",
  summary: "Replace saved upgrade state",
  body: Schema.Struct({ data: JsonData }),
  bodyMode: "json",
  pathParams: UserPlayerPath,
  query: NoQuery,
  response: UpgradesResponse,
  responseMode: "json",
  successStatus: 200,
})

export const UpgradePreferencesGetEndpoint = defineEndpoint({
  operationId: "getExpoUpgradePreferences",
  method: "GET",
  path: "/v2/links/:userId/:playerTag/upgrade-preferences",
  auth: "user-or-bot",
  summary: "Get saved upgrade preferences",
  body: NoBody,
  bodyMode: "none",
  pathParams: UserPlayerPath,
  query: NoQuery,
  response: UpgradePreferencesResponse,
  responseMode: "json",
  successStatus: 200,
})

export const UpgradePreferencesPatchEndpoint = defineEndpoint({
  operationId: "patchExpoUpgradePreferences",
  method: "PATCH",
  path: "/v2/links/:userId/:playerTag/upgrade-preferences",
  auth: "user-or-bot",
  summary: "Update saved upgrade preferences",
  body: Schema.Struct({ preferences: JsonData }),
  bodyMode: "json",
  pathParams: UserPlayerPath,
  query: NoQuery,
  response: UpgradePreferencesResponse,
  responseMode: "json",
  successStatus: 200,
})
