import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import { AuthIdentity } from "./auth.js";
import {
  InvalidRequest,
  DatabaseFailure,
  Unauthenticated,
  PayloadTooLarge,
} from "./errors.js";
import { readBoundedJson } from "./request-body.js";
export const dispatchBotTaskProgress = (request: Request) =>
  Effect.gen(function* () {
    if (
      request.method !== "POST" ||
      new URL(request.url).pathname !== "/v2/bot/players/task-progress"
    )
      return undefined;
    yield* (yield* AuthIdentity).requireBot(request);
    const raw = yield* readBoundedJson(request, 8192),
      body =
        typeof raw === "object" && raw !== null
          ? (raw as Record<string, unknown>)
          : {};
    if (
      !Array.isArray(body.tags) ||
      body.tags.length < 1 ||
      body.tags.length > 100 ||
      body.tags.some(
        (tag) =>
          typeof tag !== "string" || !/^#[0289PYLQGRJCUV]{1,15}$/u.test(tag),
      )
    )
      return yield* new InvalidRequest({
        message: "Provide 1–100 valid player tags",
      });
    const tags = [...new Set(body.tags as string[])],
      now = new Date(),
      monthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      ),
      gamesStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 22, 8),
      ),
      gamesEnd = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 28, 8),
      ),
      sql = yield* SqlClient.SqlClient;
    // These are observed deltas, not a claim that an untracked player has zero
    // points. Clan Games and the Season Pass use calendar months, not trophy seasons.
    const rows = yield* sql<{
      tag: string;
      games: string | null;
      season: string | null;
      capital: string | null;
    }>`SELECT player_tag AS tag,
 sum(delta) FILTER(WHERE stat_type='clan_games' AND event_time>=${gamesStart} AND event_time<${gamesEnd})::text AS games,
 sum(delta) FILTER(WHERE stat_type='season_pass' AND event_time>=${monthStart})::text AS season,
 max(event_time) FILTER(WHERE stat_type='capital_gold_donated' AND delta>0)::text AS capital
 FROM player_stat_changes WHERE player_tag=ANY(${tags}::text[]) AND event_time<${now} AND event_time>=${new Date(now.getTime() - 90 * 86400000)}
 GROUP BY player_tag`;
    const byTag = new Map(rows.map((row) => [row.tag, row]));
    const points = (value: string | null | undefined) => {
      if (value == null) return null;
      const result = Number(value);
      if (!Number.isSafeInteger(result) || result < 0)
        throw new Error("Invalid recorded point count");
      return result;
    };
    return Response.json({
      month: monthStart.toISOString().slice(0, 7),
      clanGamesActive: now >= gamesStart && now < gamesEnd,
      clanGamesStart: gamesStart.toISOString(),
      clanGamesEnd: gamesEnd.toISOString(),
      items: tags.map((tag) => ({
        tag,
        clanGamesPoints: points(byTag.get(tag)?.games),
        seasonPoints: points(byTag.get(tag)?.season),
        lastCapitalDonation: byTag.get(tag)?.capital ?? null,
      })),
    });
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof InvalidRequest ||
      cause instanceof Unauthenticated ||
      cause instanceof PayloadTooLarge
        ? cause
        : new DatabaseFailure({ cause, message: "Task progress unavailable" }),
    ),
  );
