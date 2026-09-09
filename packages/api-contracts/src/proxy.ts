import {
  BattleLogResponse,
  CapitalRaidSeasonsResponse,
  Clan,
  ClanBuilderBaseRankingListResponse,
  ClanCapitalRankingListResponse,
  ClanRankingListResponse,
  ClanSearchResponse,
  ClanWar,
  ClanWarLeagueGroup,
  ClanWarLogResponse,
  ClientErrorResponse,
  LeagueGroup,
  LeagueHistoryResponse,
  LeagueTierListResponse,
  LocationListResponse,
  Player,
  PlayerBuilderBaseRankingListResponse,
  PlayerRankingListResponse,
} from "@clashking/clash-contract/effect"
import { Schema } from "effect"
import { defineEndpoint, NoBody, NoPathParams, NoQuery, type ContractSchema } from "./endpoint.js"
import { ErrorResponse } from "./errors.js"

export const ProxyPlayerResponse = Player
export const ProxyBattlelogResponse = BattleLogResponse
export const ProxyLeagueHistoryResponse = LeagueHistoryResponse
export const ProxyLeagueGroupResponse = LeagueGroup
export const ProxyLeagueTiersResponse = LeagueTierListResponse
export const ProxyClanResponse = Clan
export const ProxyClanSearchResponse = ClanSearchResponse
export const ProxyCapitalRaidSeasonsResponse = CapitalRaidSeasonsResponse
export const ProxyWarlogResponse = ClanWarLogResponse
export const ProxyWarResponse = ClanWar
export const ProxyCwlGroupResponse = ClanWarLeagueGroup
export const ProxyLocationsResponse = LocationListResponse
export const ProxyMaintenanceErrorResponse = Schema.Struct({
  reason: Schema.Literal("maintenance"),
  message: Schema.String,
})
export const ProxyUnavailableErrorResponse = Schema.Union([ProxyMaintenanceErrorResponse, ErrorResponse])
const ProxyErrors = [
  { status: 400, body: ClientErrorResponse }, { status: 403, body: ClientErrorResponse },
  { status: 404, body: ClientErrorResponse }, { status: 429, body: ClientErrorResponse },
  { status: 503, body: ProxyUnavailableErrorResponse },
] as const

const proxyGet = <
  Path extends `/proxy/v1/${string}`,
  PathParams extends ContractSchema,
  Response extends ContractSchema,
  Query extends ContractSchema = typeof NoQuery,
>(
  operationId: string,
  path: Path,
  pathParams: PathParams,
  response: Response,
  query: Query = NoQuery as unknown as Query,
) => defineEndpoint({ operationId, method: "GET", path, auth: "user", summary: operationId, body: NoBody, bodyMode: "none", pathParams, query, response, responseMode: "json", successStatus: 200, errors: ProxyErrors })
const PlayerPath = Schema.Struct({ playerTag: Schema.String }); const ClanPath = Schema.Struct({ clanTag: Schema.String }); const LocationPath = Schema.Struct({ locationId: Schema.String }); const LimitQuery = Schema.Struct({ limit: Schema.optionalKey(Schema.Number) })
export const ProxyPlayerEndpoint = proxyGet("getExpoProxyPlayer", "/proxy/v1/players/:playerTag", PlayerPath, ProxyPlayerResponse)
export const ProxyPlayerBattlelogEndpoint = proxyGet("getExpoProxyPlayerBattlelog", "/proxy/v1/players/:playerTag/battlelog", PlayerPath, ProxyBattlelogResponse)
export const ProxyPlayerLeagueHistoryEndpoint = proxyGet("getExpoProxyPlayerLeagueHistory", "/proxy/v1/players/:playerTag/leaguehistory", PlayerPath, ProxyLeagueHistoryResponse)
export const ProxyLeagueGroupEndpoint = proxyGet("getExpoProxyLeagueGroup", "/proxy/v1/leaguegroup/:leagueGroupTag/:seasonId", Schema.Struct({ leagueGroupTag: Schema.String, seasonId: Schema.Number }), ProxyLeagueGroupResponse, Schema.Struct({ playerTag: Schema.String }))
export const ProxyLeagueTiersEndpoint = proxyGet("getExpoProxyLeagueTiers", "/proxy/v1/leaguetiers", NoPathParams, ProxyLeagueTiersResponse)
export const ProxyClanEndpoint = proxyGet("getExpoProxyClan", "/proxy/v1/clans/:clanTag", ClanPath, ProxyClanResponse)
export const ProxyClanSearchEndpoint = proxyGet("searchExpoProxyClans", "/proxy/v1/clans", NoPathParams, ProxyClanSearchResponse, Schema.Struct({ name: Schema.String, warFrequency: Schema.optionalKey(Schema.String), locationId: Schema.optionalKey(Schema.Number), minMembers: Schema.optionalKey(Schema.Number), maxMembers: Schema.optionalKey(Schema.Number), minClanLevel: Schema.optionalKey(Schema.Number), limit: Schema.Number, memberList: Schema.Boolean }))
export const ProxyCapitalRaidSeasonsEndpoint = proxyGet("getExpoProxyCapitalRaidSeasons", "/proxy/v1/clans/:clanTag/capitalraidseasons", ClanPath, ProxyCapitalRaidSeasonsResponse, LimitQuery)
export const ProxyClanWarlogEndpoint = proxyGet("getExpoProxyClanWarlog", "/proxy/v1/clans/:clanTag/warlog", ClanPath, ProxyWarlogResponse, LimitQuery)
// Official notInWar responses can contain empty clan/opponent placeholders.
// Keep active-war decoding strict, and discard placeholders only in this state.
export const ProxyCurrentWarResponse = Schema.Union([Schema.Struct({ state: Schema.Literal("notInWar") }), ProxyWarResponse])
export const ProxyCurrentWarEndpoint = proxyGet("getExpoProxyCurrentWar", "/proxy/v1/clans/:clanTag/currentwar", ClanPath, ProxyCurrentWarResponse)
export const ProxyCurrentLeagueGroupEndpoint = proxyGet("getExpoProxyCurrentLeagueGroup", "/proxy/v1/clans/:clanTag/currentwar/leaguegroup", ClanPath, ProxyCwlGroupResponse)
export const ProxyCwlWarEndpoint = proxyGet("getExpoProxyCwlWar", "/proxy/v1/clanwarleagues/wars/:warTag", Schema.Struct({ warTag: Schema.String }), ProxyWarResponse)
export const ProxyLocationsEndpoint = proxyGet("getExpoProxyLocations", "/proxy/v1/locations", NoPathParams, ProxyLocationsResponse)
export const ProxyPlayerRankingsEndpoint = proxyGet("getExpoProxyPlayerRankings", "/proxy/v1/locations/:locationId/rankings/players", LocationPath, PlayerRankingListResponse, LimitQuery)
export const ProxyBuilderPlayerRankingsEndpoint = proxyGet("getExpoProxyBuilderPlayerRankings", "/proxy/v1/locations/:locationId/rankings/players-builder-base", LocationPath, PlayerBuilderBaseRankingListResponse, LimitQuery)
export const ProxyClanRankingsEndpoint = proxyGet("getExpoProxyClanRankings", "/proxy/v1/locations/:locationId/rankings/clans", LocationPath, ClanRankingListResponse, LimitQuery)
export const ProxyBuilderClanRankingsEndpoint = proxyGet("getExpoProxyBuilderClanRankings", "/proxy/v1/locations/:locationId/rankings/clans-builder-base", LocationPath, ClanBuilderBaseRankingListResponse, LimitQuery)
export const ProxyCapitalRankingsEndpoint = proxyGet("getExpoProxyCapitalRankings", "/proxy/v1/locations/:locationId/rankings/capitals", LocationPath, ClanCapitalRankingListResponse, LimitQuery)
