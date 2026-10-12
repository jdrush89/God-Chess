import {
  adjacentSquares,
  isInCheck,
  ordinaryAttackSquares,
} from "./game/chess";
import {
  fourPlayerAdjacentSquares,
  fourPlayerIsInCheck,
  fourPlayerOrdinaryAttackSquares,
  promotionSquares,
} from "./game/fourPlayerChess";
import type {
  FourPlayerAction,
  FourPlayerState,
  Seat,
} from "./game/fourPlayerTypes";
import { GODS } from "./game/gods";
import {
  threePlayerDiagonalCells,
  threePlayerOrthogonalCells,
} from "./game/threePlayerDivineGeometry";
import {
  threePlayerIsInCheck,
  threePlayerOrdinaryAttackCells,
} from "./game/threePlayerChess";
import { getThreePlayerTopology } from "./game/threePlayerTopology";
import type {
  ThreePlayerAction,
  ThreePlayerSeat,
  ThreePlayerState,
} from "./game/threePlayerTypes";
import type {
  Color,
  GameState,
  GodId,
  PieceType,
} from "./game/types";
import type { GameAction } from "./game/engine";
import { qualifyingSnake } from "./game/slither";

export const ACHIEVEMENTS = [
  ["it-begins", "It Begins", "Win a game."],
  ["count-to-four", "I can only count to 4", "Win a 4 player game."],
  ["one-two-punch", "1, 2 Punch", "Win a 3 player game by capturing two Kings on consecutive turns."],
  ["outsmarted", "Outsmarted", "Win a game against a level 10 CPU."],
  ["the-pantheon", "The Pantheon", "Win across multiple games while using each of the 12 original Gods."],
  ["cryptologist", "Cryptologist", "Complete 10 Easy, 10 Medium, and 10 Hard puzzles."],
  ["i-have-the-power", "I Have the Power", "Use every ability of every original God at least once."],
  ["ascend", "Ascend", "Max out every ability of every God in one match."],
  ["hoarder", "Hoarder", "Have 10 Light and 10 Dark orbs in a match."],
  ["widowmaker", "Widowmaker", "Use Cull the Weak to capture 5 Queens total."],
  ["bombs-away", "Bombs Away", "Use Air Strike to capture a King."],
  ["horsing-around", "Horsing Around", "Use Charge to capture a Rook."],
  ["industry", "Industry", "Have 5 Rooks under your control."],
  ["irresistible", "Irresistible", "Use Enchant to capture a Queen."],
  ["seduction", "Seduction", "Use Lure on a Queen and capture it the next turn."],
  ["ambush", "Ambush", "Use Stealth to capture a King."],
  ["multikill", "Multikill", "Use Prepared Shots from Snipe to capture 5 pieces in one game."],
  ["get-outta-there", "Get Outta There", "Air Lift the King out of check."],
  ["giddy-up", "Giddy Up", "Move three pawns with Mount."],
  ["turtle-turtle", "Turtle turtle", "Win while your King is hardened by Anubis."],
  ["king-of-the-jungle", "King of the Jungle", "Use a single Rage to capture 7 pieces."],
  ["oooo-banana", "OOOO BANANA", "Drop 5 banana peels in one game."],
  ["twins", "Twins", "Resurrect 2 Queens with one Resurrect."],
  ["lifesucker", "Lifesucker", "Use Siphon to gain 20 Light orbs in one game."],
  ["banana-junkie", "Banana Junkie", "Drop 100 banana peels total."],
  ["mega-drain", "Mega Drain", "Siphon 200 Light orbs total."],
  ["posse", "Posse", "Use Escort to move 9 pieces at once."],
  ["guess-whos-back", "Guess Who's Back", "Use March Home to capture a piece."],
  ["everybody-chill", "Everybody Chill", "Freeze 16 pieces with one Stone Gaze."],
  ["queen-cobra", "Queen Cobra", "Use Serpentine Step to promote a pawn into a Queen."],
  ["all-sheep", "We're All Sheep", "Use Polymorph on every piece type across any number of games."],
  ["choking-hazard", "Choking Hazard", "Poison 50 pieces total."],
  ["pawn-shop", "Pawn Shop", "Use Military Funding to move 8 pawns at once."],
  ["queen-for-hire", "Queen For Hire", "Use Leverage to take control of 5 Queens total."],
  ["take-you-all-on", "I'll Take You All On", "Use Pick a Fight to move a piece to a space attacked by 5 pieces."],
  ["bring-her-down", "Bring Her Down", "Use Cull the Weak to capture a Queen."],
  ["snakes", "It had to be snakes", "Use Slither to make a snake of 8 or more pieces."],
  ["yeehaw", "Yeehaw", "Gain 30 orbs from Gallop in one game."],
  ["anoobus", "Anoobus", "Gain 10 Light orbs from Construction in one game and win that game."],
  ["lullaby", "Lullaby", "Gain 10 orbs from one use of Sing."],
  ["get-down", "Get Down", "Gain 5 orbs from one use of Take Cover."],
  ["goadess", "Goadess", "Gain orbs from a Queen being captured after moving her with Goad."],
  ["bring-her-back", "Bring Her Back", "Use Marked to kill your Queen, then bring her back with Resurrect in one game."],
  ["king-in-the-castle", "King in the Castle", "Use Royal Step to move a King into an opponent's backmost row."],
  ["look-at-me", "Look at me", "Use Captivate to gain 9 orbs."],
  ["hex-mix", "Hex mix", "Use Hex to align with 3 hexed pieces."],
  ["charity", "Charity", "Use Barter to give an orb and gain none in return."],
  ["threatening-me", "Are you threatening me?", "Use Threaten to attack 4 pieces at once."],
  ["worbs", "Worbs", "Gain 200 Light orbs total."],
  ["borbs", "Borbs", "Gain 200 Dark orbs total."],
] as const;

export type AchievementId = (typeof ACHIEVEMENTS)[number][0];

export interface AchievementDefinition {
  id: AchievementId;
  title: string;
  description: string;
  goal?: number;
}

const GOALS: Partial<Record<AchievementId, number>> = {
  "the-pantheon": 12,
  cryptologist: 30,
  "i-have-the-power": 36,
  widowmaker: 5,
  multikill: 5,
  "oooo-banana": 5,
  "banana-junkie": 100,
  "mega-drain": 200,
  "all-sheep": 6,
  "choking-hazard": 50,
  "queen-for-hire": 5,
  worbs: 200,
  borbs: 200,
};

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] =
  ACHIEVEMENTS.map(([id, title, description]) => ({
    id,
    title,
    description,
    goal: GOALS[id],
  }));

export const ACHIEVEMENT_BY_ID = Object.fromEntries(
  ACHIEVEMENT_DEFINITIONS.map((achievement) => [
    achievement.id,
    achievement,
  ]),
) as Record<AchievementId, AchievementDefinition>;

export interface AchievementTotals {
  cullQueens: number;
  bananasDropped: number;
  siphonedLight: number;
  poisonedPieces: number;
  leveragedQueens: number;
  lightOrbsGained: number;
  darkOrbsGained: number;
}

export interface AchievementCollections {
  wonGods: GodId[];
  usedAbilities: string[];
  polymorphedPieceTypes: PieceType[];
}

interface LuredQueen {
  actor: string;
  localTurn: number;
}

export interface MatchAchievementProgress {
  localTurns: Record<string, number>;
  kingCaptureTurns: Record<string, number[]>;
  snipeCaptures: Record<string, number>;
  bananasDropped: Record<string, number>;
  siphonedLight: Record<string, number>;
  gallopOrbs: Record<string, number>;
  constructionLight: Record<string, number>;
  abilityMovedPieces: Record<string, string[]>;
  abilityCapturedPieces: Record<string, string[]>;
  resurrectedQueens: Record<string, string[]>;
  luredQueens: Record<string, LuredQueen>;
  markedQueens: Record<string, string[]>;
}

export interface AchievementProgress {
  version: 1;
  completed: Partial<Record<AchievementId, string>>;
  totals: AchievementTotals;
  collections: AchievementCollections;
  matches: Record<string, MatchAchievementProgress>;
}

export type AchievementTransition =
  | {
    variant: "classic";
    matchId: string;
    localActors: Color[];
    before: GameState;
    after: GameState;
    action?: GameAction;
  }
  | {
    variant: "three-player";
    matchId: string;
    localActors: ThreePlayerSeat[];
    before: ThreePlayerState;
    after: ThreePlayerState;
    action?: ThreePlayerAction;
  }
  | {
    variant: "four-player";
    matchId: string;
    localActors: Seat[];
    before: FourPlayerState;
    after: FourPlayerState;
    action?: FourPlayerAction;
  };

type AnyState = AchievementTransition["before"];
type AnyPiece = AnyState["board"][string];

const emptyMatch = (): MatchAchievementProgress => ({
  localTurns: {},
  kingCaptureTurns: {},
  snipeCaptures: {},
  bananasDropped: {},
  siphonedLight: {},
  gallopOrbs: {},
  constructionLight: {},
  abilityMovedPieces: {},
  abilityCapturedPieces: {},
  resurrectedQueens: {},
  luredQueens: {},
  markedQueens: {},
});

export const createAchievementProgress = (): AchievementProgress => ({
  version: 1,
  completed: {},
  totals: {
    cullQueens: 0,
    bananasDropped: 0,
    siphonedLight: 0,
    poisonedPieces: 0,
    leveragedQueens: 0,
    lightOrbsGained: 0,
    darkOrbsGained: 0,
  },
  collections: {
    wonGods: [],
    usedAbilities: [],
    polymorphedPieceTypes: [],
  },
  matches: {},
});

const unique = <T,>(values: T[]) => [...new Set(values)];

export const mergeAchievementProgress = (
  first: AchievementProgress,
  second: AchievementProgress,
): AchievementProgress => ({
  version: 1,
  completed: { ...first.completed, ...second.completed },
  totals: {
    cullQueens: Math.max(first.totals.cullQueens, second.totals.cullQueens),
    bananasDropped: Math.max(
      first.totals.bananasDropped,
      second.totals.bananasDropped,
    ),
    siphonedLight: Math.max(
      first.totals.siphonedLight,
      second.totals.siphonedLight,
    ),
    poisonedPieces: Math.max(
      first.totals.poisonedPieces,
      second.totals.poisonedPieces,
    ),
    leveragedQueens: Math.max(
      first.totals.leveragedQueens,
      second.totals.leveragedQueens,
    ),
    lightOrbsGained: Math.max(
      first.totals.lightOrbsGained,
      second.totals.lightOrbsGained,
    ),
    darkOrbsGained: Math.max(
      first.totals.darkOrbsGained,
      second.totals.darkOrbsGained,
    ),
  },
  collections: {
    wonGods: unique([
      ...first.collections.wonGods,
      ...second.collections.wonGods,
    ]),
    usedAbilities: unique([
      ...first.collections.usedAbilities,
      ...second.collections.usedAbilities,
    ]),
    polymorphedPieceTypes: unique([
      ...first.collections.polymorphedPieceTypes,
      ...second.collections.polymorphedPieceTypes,
    ]),
  },
  matches: { ...first.matches, ...second.matches },
});

const cloneProgress = (progress: AchievementProgress): AchievementProgress =>
  structuredClone(progress);

const complete = (
  progress: AchievementProgress,
  id: AchievementId,
  unlocked: AchievementId[],
) => {
  if (progress.completed[id]) return;
  progress.completed[id] = new Date().toISOString();
  unlocked.push(id);
};

const actor = (transition: AchievementTransition) =>
  transition.variant === "classic"
    ? transition.before.activeColor
    : transition.before.activeSeat;

const players = (state: AnyState) =>
  state.players as Record<string, {
    gods: GodId[];
    upgrades: Record<string, 1 | 2 | 3>;
    orbs: Record<string, number>;
    control?: { kind: string; local?: boolean; difficulty?: number };
    eliminated?: boolean;
  }>;

const controller = (piece: AnyPiece) =>
  "controller" in piece ? piece.controller : undefined;

const owner = (piece: AnyPiece) =>
  "owner" in piece ? piece.owner : piece.color;

const lightOrbs = (state: AnyState, seat: string) => {
  const orbs = players(state)[seat]?.orbs ?? {};
  return orbs.light ?? orbs.white ?? 0;
};

const darkOrbs = (state: AnyState, seat: string) => {
  const orbs = players(state)[seat]?.orbs ?? {};
  return orbs.dark ?? orbs.black ?? 0;
};

const pieceById = (state: AnyState, id: string) =>
  Object.values(state.board).find((piece) => piece.id === id);

const squareById = (state: AnyState, id: string) =>
  Object.entries(state.board).find(([, piece]) => piece.id === id)?.[0];

const removedPieces = (before: AnyState, after: AnyState) =>
  Object.values(before.board).filter(
    (piece) => !pieceById(after, piece.id),
  );

const addedPieces = (before: AnyState, after: AnyState) =>
  Object.values(after.board).filter(
    (piece) => !pieceById(before, piece.id),
  );

const movedPieces = (before: AnyState, after: AnyState) =>
  Object.values(after.board).filter((piece) => {
    const beforeSquare = squareById(before, piece.id);
    return beforeSquare && beforeSquare !== squareById(after, piece.id);
  });

const newlyStatused = (
  before: AnyState,
  after: AnyState,
  key: string,
) => Object.values(after.board).filter((piece) => {
  const prior = pieceById(before, piece.id);
  return Boolean(
    piece.status?.[key as keyof typeof piece.status] &&
    !prior?.status?.[key as keyof typeof prior.status],
  );
});

const abilityId = (transition: AchievementTransition) => {
  const action = transition.action as
    | { abilityId?: string; type?: string }
    | undefined;
  return transition.before.selectedAbility ??
    transition.before.pending?.abilityId ??
    action?.abilityId;
};

const turnCompleted = (transition: AchievementTransition) => {
  if (transition.variant === "classic") {
    return transition.after.turn !== transition.before.turn ||
      transition.after.phase !== transition.before.phase;
  }
  return transition.after.turn !== transition.before.turn ||
    transition.after.activeSeat !== transition.before.activeSeat ||
    transition.after.phase !== transition.before.phase;
};

const abilityCompleted = (
  transition: AchievementTransition,
  currentAbility: string | undefined,
) => Boolean(
  currentAbility &&
  (
    turnCompleted(transition) ||
    (
      transition.before.selectedAbility === currentAbility &&
      transition.after.selectedAbility !== currentAbility &&
      transition.action?.type !== "cancel"
    )
  ),
);

const localWin = (transition: AchievementTransition) => {
  if (transition.variant === "classic") {
    if (
      transition.after.gameMode === "puzzle" ||
      transition.before.phase === "gameover" ||
      transition.after.phase !== "gameover"
    ) return [] as string[];
    return transition.after.winner &&
        transition.localActors.includes(transition.after.winner)
      ? [transition.after.winner]
      : [];
  }
  if (
    transition.before.phase === "gameover" ||
    transition.after.phase !== "gameover"
  ) return [] as string[];
  if (transition.variant === "three-player") {
    const winner = transition.after.result?.kind === "winner"
      ? transition.after.result.seat
      : undefined;
    return winner && transition.localActors.includes(winner) ? [winner] : [];
  }
  const winner = transition.after.winner;
  if (!winner) return [];
  if (winner.seat && transition.localActors.includes(winner.seat)) {
    return [winner.seat];
  }
  if (winner.team) {
    return transition.localActors.filter(
      (seat) => transition.after.players[seat].team === winner.team,
    );
  }
  return [];
};

const hasLevelTenOpponent = (
  transition: AchievementTransition,
  winners: string[],
) => {
  if (transition.variant === "classic") {
    return transition.after.gameMode === "ai" &&
      transition.after.aiDifficulty === 10;
  }
  return Object.entries(players(transition.after)).some(([seat, player]) =>
    !winners.includes(seat) &&
    player.control?.kind === "ai" &&
    player.control.difficulty === 10
  );
};

const isInCheckFor = (
  transition: AchievementTransition,
  seat: string,
  before = true,
) => {
  if (transition.variant === "classic") {
    const state = before ? transition.before : transition.after;
    return isInCheck(
      state.board,
      seat as Color,
      state.bananas,
    );
  }
  if (transition.variant === "three-player") {
    const state = before ? transition.before : transition.after;
    return threePlayerIsInCheck(state, seat as ThreePlayerSeat);
  }
  const state = before ? transition.before : transition.after;
  return fourPlayerIsInCheck(
    state.board,
    seat as Seat,
    state.config,
    state.bananas,
  );
};

const countAttackers = (
  transition: AchievementTransition,
  square: string,
  targetController: string,
) => {
  if (transition.variant === "classic") {
    const state = transition.after;
    return Object.entries(state.board).filter(([from, piece]) => {
      if (controller(piece) === targetController || controller(piece) === null) {
        return false;
      }
      return ordinaryAttackSquares(state.board, from, state.bananas)
        .includes(square);
    }).length;
  }
  if (transition.variant === "three-player") {
    const state = transition.after;
    return Object.entries(state.board).filter(([from, piece]) => {
      if (controller(piece) === targetController || controller(piece) === null) {
        return false;
      }
      return threePlayerOrdinaryAttackCells(state, from).includes(square);
    }).length;
  }
  const state = transition.after;
  return Object.entries(state.board).filter(([from, piece]) => {
    if (controller(piece) === targetController || controller(piece) === null) {
      return false;
    }
    return fourPlayerOrdinaryAttackSquares(
      state.board,
      from,
      state.config,
      state.bananas,
    ).includes(square);
  }).length;
};

const snakeSizeAt = (
  transition: AchievementTransition,
  square: string,
) => {
  if (transition.variant === "classic") {
    const board = transition.after.board;
    return qualifyingSnake(
      square,
      (cell) => Boolean(board[cell]),
      (cell) => {
        const orthogonal = new Set(adjacentSquares(cell, false));
        return adjacentSquares(cell).filter((neighbor) =>
          !orthogonal.has(neighbor)
        );
      },
      (cell) => adjacentSquares(cell, false),
    ).length;
  }
  if (transition.variant === "three-player") {
    const state = transition.after;
    return qualifyingSnake(
      square,
      (cell) => Boolean(state.board[cell]),
      (cell) => threePlayerDiagonalCells(state, cell),
      (cell) => threePlayerOrthogonalCells(state, cell),
    ).length;
  }
  const board = transition.after.board;
  return qualifyingSnake(
    square,
    (cell) => Boolean(board[cell]),
    (cell) => {
      const orthogonal = new Set(fourPlayerAdjacentSquares(cell, false));
      return fourPlayerAdjacentSquares(cell).filter((neighbor) =>
        !orthogonal.has(neighbor)
      );
    },
    (cell) => fourPlayerAdjacentSquares(cell, false),
  ).length;
};

const kingReachedEnemyBack = (
  transition: AchievementTransition,
  actorSeat: string,
) => {
  const movedKing = movedPieces(transition.before, transition.after)
    .find((piece) =>
      piece.type === "king" && controller(piece) === actorSeat
    );
  if (!movedKing) return false;
  const destination = squareById(transition.after, movedKing.id);
  if (!destination) return false;
  if (transition.variant === "classic") {
    return destination.endsWith(actorSeat === "white" ? "8" : "1");
  }
  if (transition.variant === "three-player") {
    return getThreePlayerTopology(transition.after.config.boardVariant)
      .promotionFrontier(actorSeat as ThreePlayerSeat)
      .includes(destination);
  }
  return promotionSquares(actorSeat as Seat).has(destination);
};

const allAbilities = GODS.flatMap((god) =>
  god.abilities.map((ability) => ability.id)
);

const allAbilitiesMaxed = (state: AnyState) => {
  const godOwners = GODS.map((god) =>
    Object.values(players(state)).find((player) =>
      player.gods.includes(god.id)
    )
  );
  return godOwners.every((player) => Boolean(player)) &&
    GODS.every((god, index) =>
      god.abilities.every(
        (ability) => godOwners[index]?.upgrades[ability.id] === 3,
      )
    );
};

const recordAbilityMoves = (
  match: MatchAchievementProgress,
  actorSeat: string,
  currentAbility: string | undefined,
  moved: AnyPiece[],
) => {
  if (!currentAbility || !moved.length) return;
  const key = `${actorSeat}:${currentAbility}`;
  match.abilityMovedPieces[key] = unique([
    ...(match.abilityMovedPieces[key] ?? []),
    ...moved.map((piece) => piece.id),
  ]);
};

const finishAbilityMoves = (
  match: MatchAchievementProgress,
  actorSeat: string,
  currentAbility: string,
) => {
  const key = `${actorSeat}:${currentAbility}`;
  const ids = match.abilityMovedPieces[key] ?? [];
  delete match.abilityMovedPieces[key];
  return ids;
};

export interface AchievementUpdate {
  progress: AchievementProgress;
  unlocked: AchievementId[];
}

export const applyAchievementTransition = (
  source: AchievementProgress,
  transition: AchievementTransition,
): AchievementUpdate => {
  const progress = cloneProgress(source);
  const unlocked: AchievementId[] = [];
  const match = progress.matches[transition.matchId] ?? emptyMatch();
  progress.matches[transition.matchId] = match;
  const actorSeat = String(actor(transition));
  const localAction = transition.localActors.includes(
    actorSeat as never,
  );
  const currentAbility = abilityId(transition);
  const completedAbility = abilityCompleted(transition, currentAbility);
  const removed = removedPieces(transition.before, transition.after);
  const added = addedPieces(transition.before, transition.after);
  const moved = movedPieces(transition.before, transition.after);
  const actorRemoved = localAction ? removed : [];
  const actorLightGain = localAction
    ? Math.max(
      0,
      lightOrbs(transition.after, actorSeat) -
      lightOrbs(transition.before, actorSeat),
    )
    : 0;
  const actorDarkGain = localAction
    ? Math.max(
      0,
      darkOrbs(transition.after, actorSeat) -
      darkOrbs(transition.before, actorSeat),
    )
    : 0;
  const totalOrbGain = actorLightGain + actorDarkGain;

  if (localAction) {
    progress.totals.lightOrbsGained += actorLightGain;
    progress.totals.darkOrbsGained += actorDarkGain;
    recordAbilityMoves(match, actorSeat, currentAbility, moved);
    if (currentAbility && actorRemoved.length) {
      const key = `${actorSeat}:${currentAbility}`;
      match.abilityCapturedPieces[key] = unique([
        ...(match.abilityCapturedPieces[key] ?? []),
        ...actorRemoved.map((piece) => piece.id),
      ]);
    }
  }

  if (completedAbility && localAction && currentAbility !== "snipe-shot" &&
      currentAbility !== "stealth-return") {
    progress.collections.usedAbilities = unique([
      ...progress.collections.usedAbilities,
      currentAbility!,
    ]);
  }

  if (progress.collections.usedAbilities.length >= allAbilities.length) {
    complete(progress, "i-have-the-power", unlocked);
  }
  if (progress.totals.lightOrbsGained >= 200) {
    complete(progress, "worbs", unlocked);
  }
  if (progress.totals.darkOrbsGained >= 200) {
    complete(progress, "borbs", unlocked);
  }

  if (localAction && turnCompleted(transition)) {
    match.localTurns[actorSeat] = (match.localTurns[actorSeat] ?? 0) + 1;
  }

  for (const localActor of transition.localActors.map(String)) {
    if (
      lightOrbs(transition.after, localActor) >= 10 &&
      darkOrbs(transition.after, localActor) >= 10
    ) complete(progress, "hoarder", unlocked);
    const rooks = Object.values(transition.after.board).filter((piece) =>
      controller(piece) === localActor && piece.type === "rook"
    ).length;
    if (rooks >= 5) complete(progress, "industry", unlocked);
  }

  if (allAbilitiesMaxed(transition.after)) {
    complete(progress, "ascend", unlocked);
  }

  const newBananas = Math.max(
    0,
    transition.after.bananas.length - transition.before.bananas.length,
  );
  if (localAction && newBananas) {
    progress.totals.bananasDropped += newBananas;
    match.bananasDropped[actorSeat] =
      (match.bananasDropped[actorSeat] ?? 0) + newBananas;
    if (match.bananasDropped[actorSeat] >= 5) {
      complete(progress, "oooo-banana", unlocked);
    }
    if (progress.totals.bananasDropped >= 100) {
      complete(progress, "banana-junkie", unlocked);
    }
  }

  const newPoison = newlyStatused(
    transition.before,
    transition.after,
    "poisoned",
  ).filter((piece) =>
    String(piece.status.poisonedBy) === actorSeat
  ).length;
  if (localAction && newPoison) {
    progress.totals.poisonedPieces += newPoison;
    if (progress.totals.poisonedPieces >= 50) {
      complete(progress, "choking-hazard", unlocked);
    }
  }

  const newPolymorphs = newlyStatused(
    transition.before,
    transition.after,
    "polymorphed",
  );
  if (localAction && newPolymorphs.length) {
    progress.collections.polymorphedPieceTypes = unique([
      ...progress.collections.polymorphedPieceTypes,
      ...newPolymorphs.map((piece) => piece.type),
    ]);
    if (progress.collections.polymorphedPieceTypes.length >= 6) {
      complete(progress, "all-sheep", unlocked);
    }
  }

  const newlyLured = newlyStatused(
    transition.before,
    transition.after,
    "luredBy",
  ).filter((piece) =>
    piece.type === "queen" && String(piece.status.luredBy) === actorSeat
  );
  for (const queen of newlyLured) {
    match.luredQueens[queen.id] = {
      actor: actorSeat,
      localTurn: match.localTurns[actorSeat] ?? 0,
    };
  }

  if (localAction) {
    for (const captured of actorRemoved) {
      const lure = match.luredQueens[captured.id];
      if (
        captured.type === "queen" &&
        lure?.actor === actorSeat &&
        (match.localTurns[actorSeat] ?? 0) <= lure.localTurn + 1
      ) complete(progress, "seduction", unlocked);
      delete match.luredQueens[captured.id];
    }
  }

  if (localAction && currentAbility === "cull-the-weak") {
    const queens = actorRemoved.filter((piece) => piece.type === "queen").length;
    if (queens) {
      progress.totals.cullQueens += queens;
      complete(progress, "bring-her-down", unlocked);
      if (progress.totals.cullQueens >= 5) {
        complete(progress, "widowmaker", unlocked);
      }
    }
  }

  if (
    localAction &&
    currentAbility === "air-strike" &&
    actorRemoved.some((piece) => piece.type === "king")
  ) complete(progress, "bombs-away", unlocked);

  if (
    localAction &&
    currentAbility === "charge" &&
    actorRemoved.some((piece) => piece.type === "rook")
  ) complete(progress, "horsing-around", unlocked);

  if (
    localAction &&
    currentAbility === "enchant" &&
    actorRemoved.some((piece) => piece.type === "queen")
  ) complete(progress, "irresistible", unlocked);

  if (
    localAction &&
    currentAbility === "stealth-return" &&
    actorRemoved.some((piece) => piece.type === "king")
  ) complete(progress, "ambush", unlocked);

  if (
    localAction &&
    currentAbility === "snipe-shot" &&
    actorRemoved.length
  ) {
    match.snipeCaptures[actorSeat] =
      (match.snipeCaptures[actorSeat] ?? 0) + actorRemoved.length;
    if (match.snipeCaptures[actorSeat] >= 5) {
      complete(progress, "multikill", unlocked);
    }
  }

  if (
    localAction &&
    currentAbility === "air-lift" &&
    isInCheckFor(transition, actorSeat) &&
    !isInCheckFor(transition, actorSeat, false)
  ) complete(progress, "get-outta-there", unlocked);

  if (
    localAction &&
    currentAbility === "escort" &&
    moved.length >= 9
  ) complete(progress, "posse", unlocked);

  if (
    localAction &&
    currentAbility === "march-home" &&
    actorRemoved.length
  ) complete(progress, "guess-whos-back", unlocked);

  const newlyFrozen = newlyStatused(
    transition.before,
    transition.after,
    "frozen",
  ).filter((piece) => String(piece.status.frozenBy) === actorSeat).length;
  if (
    localAction &&
    currentAbility === "stone-gaze" &&
    newlyFrozen >= 16
  ) complete(progress, "everybody-chill", unlocked);

  if (localAction && currentAbility === "slither") {
    const promoted = Object.values(transition.after.board).some((piece) => {
      const prior = pieceById(transition.before, piece.id);
      return prior?.type === "pawn" && piece.type === "queen";
    });
    if (promoted) complete(progress, "queen-cobra", unlocked);
  }

  if (localAction && currentAbility === "leverage") {
    const queens = Object.values(transition.after.board).filter((piece) => {
      const prior = pieceById(transition.before, piece.id);
      return piece.type === "queen" &&
        Boolean(prior) &&
        controller(piece) === actorSeat &&
        controller(prior!) !== actorSeat;
    }).length;
    if (queens) {
      progress.totals.leveragedQueens += queens;
      if (progress.totals.leveragedQueens >= 5) {
        complete(progress, "queen-for-hire", unlocked);
      }
    }
  }

  if (
    localAction &&
    currentAbility === "pick-a-fight" &&
    moved.some((piece) => {
      const square = squareById(transition.after, piece.id);
      return square &&
        controller(piece) === actorSeat &&
        countAttackers(transition, square, actorSeat) >= 5;
    })
  ) complete(progress, "take-you-all-on", unlocked);

  if (
    localAction &&
    currentAbility === "flight" &&
    moved.some((piece) => {
      const square = squareById(transition.after, piece.id);
      return square && snakeSizeAt(transition, square) >= 8;
    })
  ) {
    complete(progress, "snakes", unlocked);
  }

  if (localAction && currentAbility === "gallop") {
    match.gallopOrbs[actorSeat] =
      (match.gallopOrbs[actorSeat] ?? 0) + totalOrbGain;
    if (match.gallopOrbs[actorSeat] >= 30) {
      complete(progress, "yeehaw", unlocked);
    }
  }

  if (localAction && currentAbility === "construction") {
    match.constructionLight[actorSeat] =
      (match.constructionLight[actorSeat] ?? 0) + actorLightGain;
  }

  if (localAction && currentAbility === "resonance" && totalOrbGain >= 10) {
    complete(progress, "lullaby", unlocked);
  }
  if (localAction && currentAbility === "take-cover" && totalOrbGain >= 5) {
    complete(progress, "get-down", unlocked);
  }

  for (const localActor of transition.localActors.map(String)) {
    const ritualQueenTaken = removed.some((piece) =>
      piece.type === "queen" &&
      String(piece.status.ritual?.owner) === localActor
    );
    const orbGain = Math.max(
      0,
      lightOrbs(transition.after, localActor) -
        lightOrbs(transition.before, localActor),
    ) + Math.max(
      0,
      darkOrbs(transition.after, localActor) -
        darkOrbs(transition.before, localActor),
    );
    if (ritualQueenTaken && orbGain > 0) {
      complete(progress, "goadess", unlocked);
    }
  }

  if (localAction) {
    for (const captured of actorRemoved) {
      if (
        captured.type === "queen" &&
        String(captured.status.markedForDeath?.owner) === actorSeat
      ) {
        match.markedQueens[actorSeat] = unique([
          ...(match.markedQueens[actorSeat] ?? []),
          captured.id,
        ]);
      }
    }
    if (
      currentAbility === "resurrect" &&
      added.some((piece) =>
        piece.type === "queen" &&
        (match.markedQueens[actorSeat] ?? []).includes(piece.id)
      )
    ) complete(progress, "bring-her-back", unlocked);
  }

  if (
    localAction &&
    currentAbility === "royal-step" &&
    kingReachedEnemyBack(transition, actorSeat)
  ) complete(progress, "king-in-the-castle", unlocked);

  if (localAction && currentAbility === "captivate" && totalOrbGain >= 9) {
    complete(progress, "look-at-me", unlocked);
  }
  if (localAction && currentAbility === "hex" && totalOrbGain >= 3) {
    complete(progress, "hex-mix", unlocked);
  }
  if (
    localAction &&
    currentAbility === "barter" &&
    transition.action?.type === "barter" &&
    transition.action.give &&
    (() => {
      const take = transition.action.give === "white" ? "black" : "white";
      const beforeTake = take === "white"
        ? lightOrbs(transition.before, actorSeat)
        : darkOrbs(transition.before, actorSeat);
      const afterTake = take === "white"
        ? lightOrbs(transition.after, actorSeat)
        : darkOrbs(transition.after, actorSeat);
      return afterTake <= beforeTake;
    })()
  ) complete(progress, "charity", unlocked);
  if (localAction && currentAbility === "threaten" && actorDarkGain >= 4) {
    complete(progress, "threatening-me", unlocked);
  }

  if (localAction && currentAbility === "siphon" && actorLightGain) {
    match.siphonedLight[actorSeat] =
      (match.siphonedLight[actorSeat] ?? 0) + actorLightGain;
    progress.totals.siphonedLight += actorLightGain;
    if (match.siphonedLight[actorSeat] >= 20) {
      complete(progress, "lifesucker", unlocked);
    }
    if (progress.totals.siphonedLight >= 200) {
      complete(progress, "mega-drain", unlocked);
    }
  }

  if (localAction && currentAbility === "resurrect") {
    const revivedQueens = added.filter((piece) => piece.type === "queen");
    if (revivedQueens.length) {
      const key = `${actorSeat}:resurrect`;
      match.resurrectedQueens[key] = unique([
        ...(match.resurrectedQueens[key] ?? []),
        ...revivedQueens.map((piece) => piece.id),
      ]);
    }
  }

  if (completedAbility && localAction && currentAbility) {
    const movedIds = finishAbilityMoves(match, actorSeat, currentAbility);
    const captureKey = `${actorSeat}:${currentAbility}`;
    const capturedIds = match.abilityCapturedPieces[captureKey] ?? [];
    delete match.abilityCapturedPieces[captureKey];
    if (currentAbility === "mount") {
      const pawns = movedIds.filter((id) =>
        pieceById(transition.after, id)?.type === "pawn" ||
        pieceById(transition.before, id)?.type === "pawn"
      ).length;
      if (pawns >= 3) complete(progress, "giddy-up", unlocked);
    }
    if (currentAbility === "military-funding" && movedIds.length >= 8) {
      complete(progress, "pawn-shop", unlocked);
    }
    if (currentAbility === "resurrect") {
      const key = `${actorSeat}:resurrect`;
      const queens = match.resurrectedQueens[key] ?? [];
      if (queens.length >= 2) complete(progress, "twins", unlocked);
      delete match.resurrectedQueens[key];
    }
    if (currentAbility === "rage" && capturedIds.length >= 7) {
      complete(progress, "king-of-the-jungle", unlocked);
    }
  }

  const newlyEliminated = transition.variant === "classic"
    ? actorRemoved.filter((piece) => piece.type === "king").length
    : Object.entries(players(transition.after)).filter(([seat, player]) =>
      seat !== actorSeat &&
      player.eliminated &&
      !players(transition.before)[seat]?.eliminated
    ).length;
  if (localAction && newlyEliminated) {
    const turn = match.localTurns[actorSeat] ?? 0;
    match.kingCaptureTurns[actorSeat] = [
      ...(match.kingCaptureTurns[actorSeat] ?? []),
      ...Array.from({ length: newlyEliminated }, () => turn),
    ];
  }

  const winners = localWin(transition);
  if (winners.length) {
    complete(progress, "it-begins", unlocked);
    if (transition.variant === "four-player") {
      complete(progress, "count-to-four", unlocked);
    }
    if (hasLevelTenOpponent(transition, winners)) {
      complete(progress, "outsmarted", unlocked);
    }
    const wonGods = winners.flatMap(
      (winner) => players(transition.after)[winner]?.gods ?? [],
    );
    progress.collections.wonGods = unique([
      ...progress.collections.wonGods,
      ...wonGods,
    ]);
    if (progress.collections.wonGods.length >= GODS.length) {
      complete(progress, "the-pantheon", unlocked);
    }
    if (
      winners.some((winner) =>
        Object.values(transition.after.board).some((piece) =>
          piece.type === "king" &&
          controller(piece) === winner &&
          Boolean(piece.status.hardened)
        )
      )
    ) complete(progress, "turtle-turtle", unlocked);
    if (
      winners.some((winner) =>
        (match.constructionLight[winner] ?? 0) >= 10
      )
    ) complete(progress, "anoobus", unlocked);
    if (transition.variant === "three-player") {
      const achieved = winners.some((winner) => {
        const turns = match.kingCaptureTurns[winner] ?? [];
        return turns.some((turn, index) =>
          index > 0 && turn === turns[index - 1] + 1
        );
      });
      if (achieved) complete(progress, "one-two-punch", unlocked);
    }
  }

  if (
    transition.before.phase !== "gameover" &&
    transition.after.phase === "gameover"
  ) {
    delete progress.matches[transition.matchId];
  }
  return { progress, unlocked };
};

export const achievementProgressValue = (
  progress: AchievementProgress,
  id: AchievementId,
  completedPuzzles?: {
    easy: number;
    medium: number;
    hard: number;
  },
) => {
  if (progress.completed[id]) return ACHIEVEMENT_BY_ID[id].goal ?? 1;
  switch (id) {
    case "the-pantheon":
      return progress.collections.wonGods.length;
    case "cryptologist":
      return completedPuzzles
        ? Math.min(10, completedPuzzles.easy) +
          Math.min(10, completedPuzzles.medium) +
          Math.min(10, completedPuzzles.hard)
        : 0;
    case "i-have-the-power":
      return progress.collections.usedAbilities.length;
    case "widowmaker":
      return progress.totals.cullQueens;
    case "multikill":
      return Math.max(
        0,
        ...Object.values(progress.matches).flatMap((match) =>
          Object.values(match.snipeCaptures)
        ),
      );
    case "oooo-banana":
      return Math.max(
        0,
        ...Object.values(progress.matches).flatMap((match) =>
          Object.values(match.bananasDropped)
        ),
      );
    case "banana-junkie":
      return progress.totals.bananasDropped;
    case "mega-drain":
      return progress.totals.siphonedLight;
    case "all-sheep":
      return progress.collections.polymorphedPieceTypes.length;
    case "choking-hazard":
      return progress.totals.poisonedPieces;
    case "queen-for-hire":
      return progress.totals.leveragedQueens;
    case "worbs":
      return progress.totals.lightOrbsGained;
    case "borbs":
      return progress.totals.darkOrbsGained;
    default:
      return 0;
  }
};

export const completeCryptologistIfEligible = (
  source: AchievementProgress,
  counts: { easy: number; medium: number; hard: number },
) => {
  if (
    counts.easy < 10 ||
    counts.medium < 10 ||
    counts.hard < 10 ||
    source.completed.cryptologist
  ) return source;
  const progress = cloneProgress(source);
  progress.completed.cryptologist = new Date().toISOString();
  return progress;
};
