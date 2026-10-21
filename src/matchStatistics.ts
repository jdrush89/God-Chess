import type { FourPlayerState } from "./game/fourPlayerTypes";
import type { ThreePlayerState } from "./game/threePlayerTypes";
import type { GameState } from "./game/types";

export interface MatchSeatStatistics {
  lightOrbsGained: number;
  darkOrbsGained: number;
  piecesCaptured: number;
  piecesLost: number;
  abilitiesUsed: number;
  godsUsed: Record<string, number>;
}

export interface MatchWinEvent {
  winners: string[];
}

export interface MatchStatisticsState {
  version: 1;
  gamesPlayed: number;
  stalemates: number;
  wins: MatchWinEvent[];
  seats: Record<string, MatchSeatStatistics>;
}

type MatchState = GameState | ThreePlayerState | FourPlayerState;
type MatchAction = { type?: string; abilityId?: string } | undefined;

const nonNegativeInteger = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;

const numberRecord = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) => {
      const count = nonNegativeInteger(entry);
      return count > 0 ? [[key, count]] : [];
    }),
  );
};

export const createMatchSeatStatistics = (): MatchSeatStatistics => ({
  lightOrbsGained: 0,
  darkOrbsGained: 0,
  piecesCaptured: 0,
  piecesLost: 0,
  abilitiesUsed: 0,
  godsUsed: {},
});

export const createMatchStatisticsState = (): MatchStatisticsState => ({
  version: 1,
  gamesPlayed: 1,
  stalemates: 0,
  wins: [],
  seats: {},
});

export const normalizeMatchStatisticsState = (
  value: unknown,
): MatchStatisticsState => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createMatchStatisticsState();
  }
  const source = value as Partial<MatchStatisticsState>;
  const seats = source.seats &&
      typeof source.seats === "object" &&
      !Array.isArray(source.seats)
    ? Object.fromEntries(
      Object.entries(source.seats).map(([seat, statistics]) => {
        const entry = statistics &&
            typeof statistics === "object" &&
            !Array.isArray(statistics)
          ? statistics as Partial<MatchSeatStatistics>
          : {};
        return [seat, {
          lightOrbsGained: nonNegativeInteger(entry.lightOrbsGained),
          darkOrbsGained: nonNegativeInteger(entry.darkOrbsGained),
          piecesCaptured: nonNegativeInteger(entry.piecesCaptured),
          piecesLost: nonNegativeInteger(entry.piecesLost),
          abilitiesUsed: nonNegativeInteger(entry.abilitiesUsed),
          godsUsed: numberRecord(entry.godsUsed),
        }];
      }),
    )
    : {};
  const wins = Array.isArray(source.wins)
    ? source.wins.flatMap((entry) =>
      entry &&
        typeof entry === "object" &&
        Array.isArray(entry.winners)
        ? [{
          winners: [...new Set(
            entry.winners.filter(
              (winner): winner is string => typeof winner === "string",
            ),
          )],
        }]
        : []
    )
    : [];
  return {
    version: 1,
    gamesPlayed: Math.max(1, nonNegativeInteger(source.gamesPlayed)),
    stalemates: nonNegativeInteger(source.stalemates),
    wins,
    seats,
  };
};

const actor = (state: MatchState) =>
  "activeColor" in state ? state.activeColor : state.activeSeat;

const players = (state: MatchState) =>
  state.players as Record<string, {
    gods: string[];
    orbs: Record<string, number>;
    graveyard: unknown[];
    team?: string;
  }>;

const seatStatistics = (
  statistics: MatchStatisticsState,
  seat: string,
) => {
  statistics.seats[seat] ??= createMatchSeatStatistics();
  return statistics.seats[seat];
};

const lightOrbs = (state: MatchState, seat: string) => {
  const orbs = players(state)[seat]?.orbs ?? {};
  return nonNegativeInteger(orbs.light ?? orbs.white);
};

const darkOrbs = (state: MatchState, seat: string) => {
  const orbs = players(state)[seat]?.orbs ?? {};
  return nonNegativeInteger(orbs.dark ?? orbs.black);
};

const abilityId = (state: MatchState, action: MatchAction) =>
  state.selectedAbility ?? state.pending?.abilityId ?? action?.abilityId;

const turnCompleted = (before: MatchState, after: MatchState) =>
  after.turn !== before.turn ||
  actor(after) !== actor(before) ||
  after.phase !== before.phase;

const abilityCompleted = (
  before: MatchState,
  after: MatchState,
  action: MatchAction,
) => {
  const currentAbility = abilityId(before, action);
  return Boolean(
    currentAbility &&
    (
      turnCompleted(before, after) ||
      (
        before.selectedAbility === currentAbility &&
        after.selectedAbility !== currentAbility &&
        action?.type !== "cancel"
      )
    ),
  );
};

const winners = (state: MatchState): string[] => {
  if ("activeColor" in state) {
    return state.result?.kind === "winner" ? [state.result.winner] : [];
  }
  if (state.variant === "three-player") {
    return state.result?.kind === "winner" ? [state.result.seat] : [];
  }
  if (state.winner?.seat) return [state.winner.seat];
  if (!state.winner?.team) return [];
  return Object.entries(players(state))
    .filter(([, player]) => player.team === state.winner?.team)
    .map(([seat]) => seat);
};

const isStalemate = (state: MatchState) =>
  "activeColor" in state
    ? state.result?.kind === "draw" && state.result.reason === "stalemate"
    : state.variant === "three-player"
      ? state.result?.kind === "draw"
      : state.drawReason === "stalemate-cycle";

export const applyMatchStatisticsTransition = <T extends MatchState>(
  before: T,
  after: T,
  action?: MatchAction,
): T => {
  const statistics = normalizeMatchStatisticsState(before.matchStats);
  if (action?.type === "restart") {
    statistics.gamesPlayed += 1;
    return { ...after, matchStats: statistics };
  }

  const beforePlayers = players(before);
  const afterPlayers = players(after);
  for (const seat of Object.keys(afterPlayers)) {
    const seatStats = seatStatistics(statistics, seat);
    seatStats.lightOrbsGained += Math.max(
      0,
      lightOrbs(after, seat) - lightOrbs(before, seat),
    );
    seatStats.darkOrbsGained += Math.max(
      0,
      darkOrbs(after, seat) - darkOrbs(before, seat),
    );
    const lost = Math.max(
      0,
      afterPlayers[seat].graveyard.length -
        (beforePlayers[seat]?.graveyard.length ?? 0),
    );
    seatStats.piecesLost += lost;
    if (lost > 0) {
      seatStatistics(statistics, actor(before)).piecesCaptured += lost;
    }
    for (const godId of afterPlayers[seat].gods) {
      if (!beforePlayers[seat]?.gods.includes(godId)) {
        seatStats.godsUsed[godId] = (seatStats.godsUsed[godId] ?? 0) + 1;
      }
    }
  }

  if (abilityCompleted(before, after, action)) {
    seatStatistics(statistics, actor(before)).abilitiesUsed += 1;
  }
  if (before.phase !== "gameover" && after.phase === "gameover") {
    const winningSeats = winners(after);
    if (winningSeats.length) statistics.wins.push({ winners: winningSeats });
    else if (isStalemate(after)) statistics.stalemates += 1;
  }
  return { ...after, matchStats: statistics };
};
