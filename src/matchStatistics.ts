import type { FourPlayerState } from "./game/fourPlayerTypes";
import { GODS } from "./game/gods";
import type { ThreePlayerState } from "./game/threePlayerTypes";
import type { GameState } from "./game/types";

export type MatchActorType = "player" | "cpu";
export type MatchGodPickMethod = "manual" | "random" | "cpu";

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

export interface MatchGodPickStatistics {
  godId: string;
  actorType: MatchActorType;
  method: MatchGodPickMethod;
}

export interface MatchAbilityUseStatistics {
  player: number;
  cpu: number;
}

export interface MatchAbilityUpgradeStatistics {
  godId: string;
  abilityId: string;
  actorType: MatchActorType;
  level: 2 | 3;
  turn: number;
}

export interface MatchGameSeatStatistics {
  godPicks: MatchGodPickStatistics[];
  abilityUses: Record<string, MatchAbilityUseStatistics>;
  abilityUpgrades: MatchAbilityUpgradeStatistics[];
}

export interface MatchCurrentGameStatistics {
  seats: Record<string, MatchGameSeatStatistics>;
}

export interface MatchStatisticsState {
  version: 1;
  gamesPlayed: number;
  stalemates: number;
  wins: MatchWinEvent[];
  seats: Record<string, MatchSeatStatistics>;
  currentGame: MatchCurrentGameStatistics;
}

type MatchState = GameState | ThreePlayerState | FourPlayerState;
type MatchAction = {
  type?: string;
  abilityId?: string;
  selectionMethod?: "random";
} | undefined;

const ABILITY_GODS = new Map(
  GODS.flatMap((god) =>
    god.abilities.map((ability) => [ability.id, god.id] as const)
  ),
);

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

const isActorType = (value: unknown): value is MatchActorType =>
  value === "player" || value === "cpu";

const isPickMethod = (value: unknown): value is MatchGodPickMethod =>
  value === "manual" || value === "random" || value === "cpu";

const normalizeCurrentGame = (value: unknown): MatchCurrentGameStatistics => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { seats: {} };
  }
  const source = value as Partial<MatchCurrentGameStatistics>;
  if (!source.seats || typeof source.seats !== "object" || Array.isArray(source.seats)) {
    return { seats: {} };
  }
  return {
    seats: Object.fromEntries(
      Object.entries(source.seats).map(([seat, statistics]) => {
        const entry = statistics &&
            typeof statistics === "object" &&
            !Array.isArray(statistics)
          ? statistics as Partial<MatchGameSeatStatistics>
          : {};
        const godPicks = Array.isArray(entry.godPicks)
          ? entry.godPicks.flatMap((pick) =>
            pick &&
              typeof pick === "object" &&
              !Array.isArray(pick) &&
              typeof pick.godId === "string" &&
              isActorType(pick.actorType) &&
              isPickMethod(pick.method)
              ? [{
                godId: pick.godId,
                actorType: pick.actorType,
                method: pick.method,
              }]
              : []
          )
          : [];
        const abilityUses = entry.abilityUses &&
            typeof entry.abilityUses === "object" &&
            !Array.isArray(entry.abilityUses)
          ? Object.fromEntries(
            Object.entries(entry.abilityUses).flatMap(([abilityId, counts]) => {
              if (!counts || typeof counts !== "object" || Array.isArray(counts)) {
                return [];
              }
              const sourceCounts = counts as Partial<MatchAbilityUseStatistics>;
              const player = nonNegativeInteger(sourceCounts.player);
              const cpu = nonNegativeInteger(sourceCounts.cpu);
              return player || cpu ? [[abilityId, { player, cpu }]] : [];
            }),
          )
          : {};
        const abilityUpgrades = Array.isArray(entry.abilityUpgrades)
          ? entry.abilityUpgrades.flatMap((upgrade) =>
            upgrade &&
              typeof upgrade === "object" &&
              !Array.isArray(upgrade) &&
              typeof upgrade.godId === "string" &&
              typeof upgrade.abilityId === "string" &&
              isActorType(upgrade.actorType) &&
              (upgrade.level === 2 || upgrade.level === 3)
              ? [{
                godId: upgrade.godId,
                abilityId: upgrade.abilityId,
                actorType: upgrade.actorType,
                level: upgrade.level,
                turn: nonNegativeInteger(upgrade.turn),
              }]
              : []
          )
          : [];
        return [seat, { godPicks, abilityUses, abilityUpgrades }];
      }),
    ),
  };
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
  currentGame: { seats: {} },
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
    currentGame: normalizeCurrentGame(source.currentGame),
  };
};

const actor = (state: MatchState) =>
  "activeColor" in state ? state.activeColor : state.activeSeat;

const players = (state: MatchState) =>
  state.players as Record<string, {
    gods: string[];
    orbs: Record<string, number>;
    graveyard: unknown[];
    upgrades: Record<string, 1 | 2 | 3>;
    team?: string;
    control?: { kind?: string };
  }>;

const seatStatistics = (
  statistics: MatchStatisticsState,
  seat: string,
) => {
  statistics.seats[seat] ??= createMatchSeatStatistics();
  return statistics.seats[seat];
};

const currentGameSeatStatistics = (
  statistics: MatchStatisticsState,
  seat: string,
) => {
  statistics.currentGame.seats[seat] ??= {
    godPicks: [],
    abilityUses: {},
    abilityUpgrades: [],
  };
  return statistics.currentGame.seats[seat];
};

const actorType = (
  state: MatchState,
  seat: string,
): MatchActorType => {
  if ("activeColor" in state) {
    if (state.gameMode === "simulation") return "cpu";
    return state.gameMode === "ai" && state.aiColor === seat
      ? "cpu"
      : "player";
  }
  return players(state)[seat]?.control?.kind === "ai" ? "cpu" : "player";
};

const pickMethod = (
  state: MatchState,
  seat: string,
  action: MatchAction,
): MatchGodPickMethod => {
  if (actorType(state, seat) === "cpu") return "cpu";
  return action?.type === "auto-draft" || action?.selectionMethod === "random"
    ? "random"
    : "manual";
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
    statistics.currentGame = { seats: {} };
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
        currentGameSeatStatistics(statistics, seat).godPicks.push({
          godId,
          actorType: actorType(before, seat),
          method: pickMethod(before, seat, action),
        });
      }
    }
  }

  if (abilityCompleted(before, after, action)) {
    const activeActor = actor(before);
    const completedAbility = abilityId(before, action)!;
    const type = actorType(before, activeActor);
    seatStatistics(statistics, activeActor).abilitiesUsed += 1;
    const uses = currentGameSeatStatistics(statistics, activeActor).abilityUses;
    uses[completedAbility] ??= { player: 0, cpu: 0 };
    uses[completedAbility][type] += 1;
  }
  if (action?.type === "upgrade" && action.abilityId) {
    const activeActor = actor(before);
    const beforeLevel = beforePlayers[activeActor]?.upgrades[action.abilityId] ?? 1;
    const afterLevel = afterPlayers[activeActor]?.upgrades[action.abilityId] ?? 1;
    const godId = ABILITY_GODS.get(action.abilityId);
    if (
      godId &&
      afterLevel > beforeLevel &&
      (afterLevel === 2 || afterLevel === 3)
    ) {
      currentGameSeatStatistics(statistics, activeActor).abilityUpgrades.push({
        godId,
        abilityId: action.abilityId,
        actorType: actorType(before, activeActor),
        level: afterLevel,
        turn: nonNegativeInteger(before.turn),
      });
    }
  }
  if (before.phase !== "gameover" && after.phase === "gameover") {
    const winningSeats = winners(after);
    if (winningSeats.length) statistics.wins.push({ winners: winningSeats });
    else if (isStalemate(after)) statistics.stalemates += 1;
  }
  return { ...after, matchStats: statistics };
};
