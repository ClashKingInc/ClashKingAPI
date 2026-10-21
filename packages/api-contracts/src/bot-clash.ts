import { ProxyPlayerEndpoint, ProxyClanEndpoint, ProxyCurrentWarEndpoint, ProxyCurrentLeagueGroupEndpoint,
  ProxyCapitalRaidSeasonsEndpoint, ProxyCwlWarEndpoint, ProxyPlayerRankingsEndpoint, ProxyBuilderPlayerRankingsEndpoint, ProxyLeagueGroupEndpoint } from "./proxy.js"
import type { AnyEndpoint } from "./endpoint.js"

/** Explicit read-only Clash endpoints needed by bot commands. */
const forBot = <T extends AnyEndpoint>(endpoint: T) => ({ ...endpoint, auth: "bot" as const,
  operationId: endpoint.operationId.replace("ExpoProxy", "BotClash"),
  path: endpoint.path.replace("/proxy/v1/", "/v2/bot/clash/") as `/v2/bot/clash/${string}`,
})
export const botClashEndpoints: Readonly<Record<"botClashPlayer" | "botClashClan" | "botClashCurrentWar" | "botClashCurrentLeagueGroup" | "botClashCapitalRaids" | "botClashCwlWar" | "botClashPlayerRankings" | "botClashBuilderRankings" | "botClashLeagueGroup", AnyEndpoint>> = {
  botClashLeagueGroup: forBot(ProxyLeagueGroupEndpoint),
  botClashPlayer: forBot(ProxyPlayerEndpoint),
  botClashClan: forBot(ProxyClanEndpoint),
  botClashCurrentWar: forBot(ProxyCurrentWarEndpoint),
  botClashCurrentLeagueGroup: forBot(ProxyCurrentLeagueGroupEndpoint),
  botClashCapitalRaids: forBot(ProxyCapitalRaidSeasonsEndpoint),
  botClashCwlWar: forBot(ProxyCwlWarEndpoint),
  botClashPlayerRankings: forBot(ProxyPlayerRankingsEndpoint),
  botClashBuilderRankings: forBot(ProxyBuilderPlayerRankingsEndpoint),
} as const
