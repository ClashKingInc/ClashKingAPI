import { Schema } from "effect"

import { DecimalSnowflake } from "./discord.js"
import { defineEndpoint, NoBody, NoContent, NoPathParams, NoQuery } from "./endpoint.js"

const ServerPath = Schema.Struct({ serverId: DecimalSnowflake })
const LinkMutation = Schema.Struct({ message: Schema.String, player_tag: Schema.String, user_id: DecimalSnowflake })
export const BaseId = Schema.String.check(Schema.isPattern(/^[1-9][0-9]*$/u))
const BaseVoterPath = Schema.Struct({ baseId: BaseId, voterId: DecimalSnowflake })

export const SharedLinksLookupEndpoint = defineEndpoint({
  auth: "developer", body: Schema.Struct({
    discord_ids: Schema.optionalKey(Schema.Array(DecimalSnowflake)),
    player_tags: Schema.optionalKey(Schema.Array(Schema.String)),
  }), bodyMode: "json", method: "POST", operationId: "sharedLinksLookup",
  path: "/v2/links/shared", pathParams: NoPathParams, query: NoQuery,
  response: Schema.Struct({ items: Schema.Array(Schema.Struct({
    is_verified: Schema.Boolean, player_tag: Schema.String, user_id: DecimalSnowflake,
  })) }), responseMode: "json", successStatus: 200, summary: "Look up visible shared player links",
})

export const CreateServerLinkEndpoint = defineEndpoint({
  auth: "server-write", body: Schema.Struct({ playerTag: Schema.String, userID: DecimalSnowflake,
    api_token: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(128))) }),
  bodyMode: "json", method: "POST", operationId: "createServerLink",
  path: "/v2/links/server/:serverId", pathParams: ServerPath, query: NoQuery,
  response: LinkMutation, responseMode: "json", successStatus: 200,
  summary: "Link a server member account under the server token and canonical ownership policies",
})

export const DeleteServerLinkEndpoint = defineEndpoint({
  auth: "server-write", body: NoBody, bodyMode: "none", method: "DELETE", operationId: "deleteServerLink",
  path: "/v2/links/server/:serverId", pathParams: ServerPath,
  query: Schema.Struct({ playerTag: Schema.String }), response: LinkMutation,
  responseMode: "json", successStatus: 200, summary: "Delete a link only after Clash confirms the player is gone",
})

export const UpsertBaseVoteEndpoint = defineEndpoint({
  auth: "bot", body: Schema.Struct({ direction: Schema.Literals(["up", "down"]) }), bodyMode: "json",
  method: "PUT", operationId: "upsertBaseVote", path: "/v2/bases/:baseId/votes/:voterId",
  pathParams: BaseVoterPath, query: NoQuery,
  response: Schema.Struct({ baseId: BaseId, voterId: DecimalSnowflake, direction: Schema.Literals(["up", "down"]) }),
  responseMode: "json", successStatus: 200, summary: "Atomically record or change a trusted Bot base vote",
})

export const RemoveBaseVoteEndpoint = defineEndpoint({
  auth: "bot", body: NoBody, bodyMode: "none", method: "DELETE", operationId: "removeBaseVote",
  path: "/v2/bases/:baseId/votes/:voterId", pathParams: BaseVoterPath, query: NoQuery,
  response: NoContent, responseMode: "none", successStatus: 204, summary: "Idempotently remove a trusted Bot base vote",
})

export const RecordBaseDownloadEndpoint = defineEndpoint({
  auth: "bot", body: NoBody, bodyMode: "none", method: "POST", operationId: "recordBaseDownload",
  path: "/v2/bases/:baseId/downloaders/:userId", pathParams: Schema.Struct({ baseId: BaseId, userId: DecimalSnowflake }),
  query: NoQuery, response: Schema.Struct({ baseId: BaseId, userId: DecimalSnowflake, downloadCount: Schema.Number }),
  responseMode: "json", successStatus: 200, summary: "Record one unique trusted Bot base downloader",
})

export const LegacyBase = Schema.Struct({
  id: BaseId,
  messageId: DecimalSnowflake,
  serverId: Schema.NullOr(DecimalSnowflake),
  channelId: Schema.NullOr(DecimalSnowflake),
  baseLink: Schema.String,
  images: Schema.Array(Schema.String),
  description: Schema.String,
})
export const ResolveLegacyBaseEndpoint = defineEndpoint({
  auth: "bot", body: NoBody, bodyMode: "none", method: "GET", operationId: "resolveLegacyBase",
  path: "/v2/bases/legacy/:messageId", pathParams: Schema.Struct({ messageId: DecimalSnowflake }), query: NoQuery,
  response: LegacyBase, responseMode: "json", successStatus: 200, summary: "Resolve a legacy base by Discord message ID",
})
export const StageLegacyBaseImageEndpoint = defineEndpoint({
  auth: "bot", body: Schema.Struct({ sourceUrl: Schema.String }), bodyMode: "json", method: "POST", operationId: "stageLegacyBaseImage",
  path: "/v2/bases/:baseId/images/:position", pathParams: Schema.Struct({ baseId: BaseId, position: Schema.Int }), query: NoQuery,
  response: Schema.Struct({ baseId: BaseId, position: Schema.Int, imageUrl: Schema.String }), responseMode: "json", successStatus: 200,
  summary: "Copy and idempotently stage one Discord base attachment",
})
export const FinalizeLegacyBaseEndpoint = defineEndpoint({
  auth: "bot", body: Schema.Struct({ serverId: DecimalSnowflake, channelId: DecimalSnowflake,
    description: Schema.String.check(Schema.isMaxLength(1000)) }).annotate({ parseOptions: { onExcessProperty: "error" } }), bodyMode: "json", method: "POST",
  operationId: "finalizeLegacyBase", path: "/v2/bases/:baseId/finalize", pathParams: Schema.Struct({ baseId: BaseId }), query: NoQuery,
  response: Schema.Struct({ baseId: BaseId, serverId: DecimalSnowflake, channelId: DecimalSnowflake, description: Schema.String }), responseMode: "json", successStatus: 200,
  summary: "Finalize a converted legacy base after the Discord edit succeeds",
})

export const botAdjacentEndpoints = {
  sharedLinksLookup: SharedLinksLookupEndpoint,
  createServerLink: CreateServerLinkEndpoint,
  deleteServerLink: DeleteServerLinkEndpoint,
  upsertBaseVote: UpsertBaseVoteEndpoint,
  removeBaseVote: RemoveBaseVoteEndpoint,
  recordBaseDownload: RecordBaseDownloadEndpoint,
  resolveLegacyBase: ResolveLegacyBaseEndpoint,
  stageLegacyBaseImage: StageLegacyBaseImageEndpoint,
  finalizeLegacyBase: FinalizeLegacyBaseEndpoint,
} as const
