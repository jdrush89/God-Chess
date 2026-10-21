import { DAILY_PUZZLE_BY_ID } from "./game/dailyPuzzles";
import { GODS } from "./game/gods";
import type { FourPlayerState } from "./game/fourPlayerTypes";
import type {
  ThreePlayerBoardVariant,
  ThreePlayerState,
} from "./game/threePlayerTypes";
import type { GameState, GodId, PuzzleId } from "./game/types";
import {
  normalizeMatchStatisticsState,
  type MatchStatisticsState,
} from "./matchStatistics";

export const PLAYER_STATISTICS_KEY = "god-chess-player-statistics-v1";

export type StatisticsBoard =
  | "classic"
  | ThreePlayerBoardVariant
  | "four-player-ffa"
  | "four-player-teams";

export interface RecordedMatchStatistics {
  board: StatisticsBoard;
  localActors: string[];
  match: MatchStatisticsState;
  updatedAt: string;
}

export interface PlayerStatisticsProgress {
  version: 1;
  matches: Record<string, RecordedMatchStatistics>;
}

export interface PlayerStatisticsSnapshot {
  version: 1;
  gamesPlayed: number;
  gamesWon: number;
  stalemates: number;
  boardsPlayed: Record<StatisticsBoard, number>;
  lightOrbsGained: number;
  darkOrbsGained: number;
  piecesCaptured: number;
  piecesLost: number;
  abilitiesUsed: number;
  godsUsed: Record<GodId, number>;
  godPickDenominator: number;
  dailyPuzzlesCompleted: number;
  totalPuzzlesCompleted: number;
}

type MatchState = GameState | ThreePlayerState | FourPlayerState;

const BOARDS = new Set<StatisticsBoard>([
  "classic",
  "three-player",
  "three-hexagonal",
  "triad",
  "three-circular",
  "three-half",
  "four-player-ffa",
  "four-player-teams",
]);
const GOD_IDS = new Set(GODS.map((god) => god.id));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const boardForState = (state: MatchState): StatisticsBoard =>
  "activeColor" in state
    ? "classic"
    : state.variant === "three-player"
      ? state.config.boardVariant
      : state.config.mode === "teams"
        ? "four-player-teams"
        : "four-player-ffa";

export const createPlayerStatisticsProgress =
  (): PlayerStatisticsProgress => ({
    version: 1,
    matches: {},
  });

export const normalizePlayerStatisticsProgress = (
  value: unknown,
): PlayerStatisticsProgress => {
  if (!isRecord(value) || !isRecord(value.matches)) {
    return createPlayerStatisticsProgress();
  }
  const matches = Object.fromEntries(
    Object.entries(value.matches)
      .slice(-2000)
      .flatMap(([matchId, entry]) => {
        if (
          !matchId ||
          !isRecord(entry) ||
          !BOARDS.has(entry.board as StatisticsBoard) ||
          !Array.isArray(entry.localActors) ||
          typeof entry.updatedAt !== "string"
        ) return [];
        const localActors = [...new Set(entry.localActors.filter(
          (actor): actor is string => typeof actor === "string" && actor.length > 0,
        ))];
        return [[matchId, {
          board: entry.board as StatisticsBoard,
          localActors,
          match: normalizeMatchStatisticsState(entry.match),
          updatedAt: entry.updatedAt,
        } satisfies RecordedMatchStatistics]];
      }),
  );
  return { version: 1, matches };
};
export const loadLocalPlayerStatistics = (): PlayerStatisticsProgress => {
  try {
    const raw = window.localStorage.getItem(PLAYER_STATISTICS_KEY);
    return normalizePlayerStatisticsProgress(raw ? JSON.parse(raw) : undefined);
  } catch (error) {
    console.error("Unable to load local player statistics.", error);
    return createPlayerStatisticsProgress();
  }
};

export const persistLocalPlayerStatistics = (
  progress: PlayerStatisticsProgress,
) => {
  window.localStorage.setItem(
    PLAYER_STATISTICS_KEY,
    JSON.stringify(normalizePlayerStatisticsProgress(progress)),
  );
};

export const mergePlayerStatisticsProgress = (
  first: unknown,
  second: unknown,
) => {
  const left = normalizePlayerStatisticsProgress(first);
  const right = normalizePlayerStatisticsProgress(second);
  const matches = { ...left.matches };
  for (const [matchId, candidate] of Object.entries(right.matches)) {
    const current = matches[matchId];
    if (!current || candidate.updatedAt > current.updatedAt) {
      matches[matchId] = candidate;
    }
  }
  return { version: 1, matches } satisfies PlayerStatisticsProgress;
};

export const updatePlayerMatchStatistics = (
  progress: PlayerStatisticsProgress,
  matchId: string,
  state: MatchState,
  localActors: string[],
  now = new Date().toISOString(),
): PlayerStatisticsProgress => {
  if (!matchId || localActors.length === 0) return progress;
  const normalized = normalizePlayerStatisticsProgress(progress);
  const nextMatch: RecordedMatchStatistics = {
    board: boardForState(state),
    localActors: [...new Set(localActors)],
    match: normalizeMatchStatisticsState(state.matchStats),
    updatedAt: now,
  };
  const current = normalized.matches[matchId];
  if (
    current &&
    current.board === nextMatch.board &&
    JSON.stringify(current.localActors) === JSON.stringify(nextMatch.localActors) &&
    JSON.stringify(current.match) === JSON.stringify(nextMatch.match)
  ) return progress;
  return {
    version: 1,
    matches: {
      ...normalized.matches,
      [matchId]: nextMatch,
    },
  };
};

export const createPlayerStatisticsSnapshot = (
  progress: PlayerStatisticsProgress,
  completedPuzzleIds: PuzzleId[] = [],
): PlayerStatisticsSnapshot => {
  const snapshot: PlayerStatisticsSnapshot = {
    version: 1,
    gamesPlayed: 0,
    gamesWon: 0,
    stalemates: 0,
    boardsPlayed: {
      classic: 0,
      "three-player": 0,
      "three-hexagonal": 0,
      triad: 0,
      "three-circular": 0,
      "three-half": 0,
      "four-player-ffa": 0,
      "four-player-teams": 0,
    },
    lightOrbsGained: 0,
    darkOrbsGained: 0,
    piecesCaptured: 0,
    piecesLost: 0,
    abilitiesUsed: 0,
    godsUsed: Object.fromEntries(
      GODS.map((god) => [god.id, 0]),
    ) as Record<GodId, number>,
    godPickDenominator: 0,
    dailyPuzzlesCompleted: completedPuzzleIds.filter(
      (puzzleId) => puzzleId in DAILY_PUZZLE_BY_ID,
    ).length,
    totalPuzzlesCompleted: new Set(completedPuzzleIds).size,
  };
  for (const recorded of Object.values(
    normalizePlayerStatisticsProgress(progress).matches,
  )) {
    const localActors = new Set(recorded.localActors);
    snapshot.gamesPlayed += recorded.match.gamesPlayed;
    snapshot.boardsPlayed[recorded.board] += recorded.match.gamesPlayed;
    snapshot.stalemates += recorded.match.stalemates;
    snapshot.gamesWon += recorded.match.wins.filter((event) =>
      event.winners.some((winner) => localActors.has(winner))
    ).length;
    for (const actor of localActors) {
      const seat = recorded.match.seats[actor];
      if (!seat) continue;
      snapshot.lightOrbsGained += seat.lightOrbsGained;
      snapshot.darkOrbsGained += seat.darkOrbsGained;
      snapshot.piecesCaptured += seat.piecesCaptured;
      snapshot.piecesLost += seat.piecesLost;
      snapshot.abilitiesUsed += seat.abilitiesUsed;
      for (const [godId, count] of Object.entries(seat.godsUsed)) {
        if (!GOD_IDS.has(godId as GodId)) continue;
        snapshot.godsUsed[godId as GodId] += count;
        snapshot.godPickDenominator += count;
      }
    }
  }
  return snapshot;
};
