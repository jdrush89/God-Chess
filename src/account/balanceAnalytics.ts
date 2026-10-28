import { GODS } from "../game/gods";
import type { FourPlayerState } from "../game/fourPlayerTypes";
import type { ThreePlayerState } from "../game/threePlayerTypes";
import type { GameState } from "../game/types";
import { normalizeMatchStatisticsState } from "../matchStatistics";
import { supabase } from "./supabase";

export type BalanceGameMode =
  | "classic-local"
  | "classic-ai"
  | "classic-online"
  | "classic-ranked"
  | "three-local"
  | "three-online"
  | "four-ffa-local"
  | "four-ffa-online"
  | "four-teams-local"
  | "four-teams-online"
  | "four-ranked";

type MatchState = GameState | ThreePlayerState | FourPlayerState;

export interface BalanceMatchReport {
  version: 1;
  turns: number;
  outcome: "win" | "draw";
  winners: string[];
  seats: Array<{
    seat: string;
    won: boolean;
    godPicks: Array<{
      godId: string;
      actorType: "player" | "cpu";
      method: "manual" | "random" | "cpu";
    }>;
    abilityUses: Array<{
      godId: string;
      abilityId: string;
      actorType: "player" | "cpu";
      count: number;
    }>;
    abilityUpgrades: Array<{
      godId: string;
      abilityId: string;
      actorType: "player" | "cpu";
      level: 2 | 3;
      turn: number;
    }>;
  }>;
}

const ABILITY_GODS = new Map(
  GODS.flatMap((god) =>
    god.abilities.map((ability) => [ability.id, god.id] as const)
  ),
);

const winners = (state: MatchState): string[] => {
  if ("activeColor" in state) {
    return state.result?.kind === "winner" ? [state.result.winner] : [];
  }
  if (state.variant === "three-player") {
    return state.result?.kind === "winner" ? [state.result.seat] : [];
  }
  if (state.winner?.seat) return [state.winner.seat];
  if (!state.winner?.team) return [];
  return Object.entries(state.players)
    .filter(([, player]) => player.team === state.winner?.team)
    .map(([seat]) => seat);
};

export const balanceBoardForState = (state: MatchState) =>
  "activeColor" in state
    ? "classic"
    : state.variant === "three-player"
      ? state.config.boardVariant
      : state.config.mode === "teams"
        ? "four-player-teams"
        : "four-player-ffa";

export const createBalanceMatchReport = (
  state: MatchState,
): BalanceMatchReport => {
  const statistics = normalizeMatchStatisticsState(state.matchStats);
  const winningSeats = winners(state);
  return {
    version: 1,
    turns: Math.max(0, Math.floor(state.turn)),
    outcome: winningSeats.length ? "win" : "draw",
    winners: winningSeats,
    seats: Object.entries(statistics.currentGame.seats).map(
      ([seat, seatStatistics]) => ({
        seat,
        won: winningSeats.includes(seat),
        godPicks: seatStatistics.godPicks,
        abilityUses: Object.entries(seatStatistics.abilityUses).flatMap(
          ([abilityId, counts]) => {
            const godId = ABILITY_GODS.get(abilityId);
            if (!godId) return [];
            return (["player", "cpu"] as const).flatMap((actorType) =>
              counts[actorType] > 0
                ? [{
                  godId,
                  abilityId,
                  actorType,
                  count: counts[actorType],
                }]
                : []
            );
          },
        ),
        abilityUpgrades: seatStatistics.abilityUpgrades,
      }),
    ),
  };
};

const reportLevels = new Map<string, number>();
const reportQueues = new Map<string, Promise<void>>();

export const reportBalanceMatch = (
  matchId: string,
  mode: BalanceGameMode,
  state: MatchState,
) => {
  const client = supabase;
  if (!client || !matchId) return;
  const statistics = normalizeMatchStatisticsState(state.matchStats);
  const reportKey = `${matchId}:${statistics.gamesPlayed}`;
  const completed = state.phase === "gameover";
  const requestedLevel = completed ? 2 : 1;
  if ((reportLevels.get(reportKey) ?? 0) >= requestedLevel) return;
  reportLevels.set(reportKey, requestedLevel);

  const previous = reportQueues.get(reportKey) ?? Promise.resolve();
  const request = previous
    .then(async () => {
      const { error } = await client.rpc("report_balance_match", {
        p_match_key: reportKey,
        p_mode: mode,
        p_board: balanceBoardForState(state),
        p_status: completed ? "completed" : "started",
        p_report: completed ? createBalanceMatchReport(state) : {},
      });
      if (error) throw error;
    })
    .catch((error) => {
      if (reportLevels.get(reportKey) === requestedLevel) {
        reportLevels.delete(reportKey);
      }
      console.error("Unable to report anonymous balance analytics.", error);
    })
    .finally(() => {
      if (reportQueues.get(reportKey) === request) {
        reportQueues.delete(reportKey);
      }
    });
  reportQueues.set(reportKey, request);
};
