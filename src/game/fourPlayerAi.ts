import {
  fourPlayerCoords,
  fourPlayerIsInCheck,
  fourPlayerPieceValue,
  fourPlayerPseudoTargets,
} from "./fourPlayerChess";
import { seatsAreAllies, seatsAreHostile } from "./fourPlayerConfig";
import {
  availableFourPlayerActions,
  fourPlayerReducer,
} from "./fourPlayerEngine";
import {
  FOUR_PLAYER_SEATS,
  type FourPlayerAction,
  type FourPlayerPiece,
  type FourPlayerState,
  type Seat,
} from "./fourPlayerTypes";
import type { GodId } from "./types";

interface SearchNode {
  state: FourPlayerState;
  actions: FourPlayerAction[];
}

interface SearchBudget {
  maxDepth: number;
  maxActions: number;
  maxFrontier: number;
  maxCompleted: number;
  maxPerBranch: number;
}

const GOD_DRAFT_VALUE: Record<GodId, number> = {
  quetzacoatl: 9.3,
  chiron: 8.6,
  anubis: 8.4,
  teles: 8.8,
  artemis: 9.1,
  kangus: 8.2,
  death: 9,
  leonidas: 8.5,
  medusa: 8.9,
  salem: 8.7,
  midas: 8.3,
  ares: 9.2,
};

const beneficialStatusValue = (piece: FourPlayerPiece) =>
  (piece.status.hardened ? 1.7 : 0) +
  (piece.status.prepared ? 1.5 : 0) +
  (piece.status.ritual ? 1.1 : 0) +
  (piece.status.chargeUntil ? 1.2 : 0) +
  (piece.status.hired ? 0.8 : 0);

const harmfulStatusValue = (piece: FourPlayerPiece) =>
  (piece.status.frozen ? 1.8 : 0) +
  (piece.status.poisoned ? 0.8 : 0) +
  (piece.status.polymorphed ? 1.4 : 0) +
  (piece.status.luredBy ? 1 : 0) +
  (piece.status.hexedBy ? 0.7 : 0) +
  (piece.status.markedForDeath ? 2.3 : 0);

const centerValue = (square: string) => {
  const [file, rank] = fourPlayerCoords(square);
  return (6.5 - Math.abs(6.5 - file) + 6.5 - Math.abs(6.5 - rank)) * 0.035;
};

const perspectiveSeats = (state: FourPlayerState, seat: Seat) =>
  FOUR_PLAYER_SEATS.filter((candidate) => seatsAreAllies(state.config, seat, candidate));

const hostileSeats = (state: FourPlayerState, seat: Seat) =>
  FOUR_PLAYER_SEATS.filter((candidate) => seatsAreHostile(state.config, seat, candidate));

const controlledMobility = (state: FourPlayerState, seat: Seat) =>
  Object.entries(state.board)
    .filter(([, piece]) => piece.controller === seat)
    .reduce((total, [square]) =>
      total + Math.min(
        12,
        fourPlayerPseudoTargets(state.board, square, state.config, {
          attacksOnly: true,
          bananas: state.bananas,
          includeAlliedTargets: true,
        }).length,
      ), 0);

export const evaluateFourPlayerState = (
  state: FourPlayerState,
  perspectiveSeat: Seat,
) => {
  const allies = new Set(perspectiveSeats(state, perspectiveSeat));
  const enemies = new Set(hostileSeats(state, perspectiveSeat));

  if (state.phase === "gameover") {
    const won = state.config.mode === "ffa"
      ? state.winner?.seat === perspectiveSeat
      : state.winner?.team === state.players[perspectiveSeat].team;
    return won ? 1_000_000 : -1_000_000;
  }

  let score = 0;
  for (const seat of FOUR_PLAYER_SEATS) {
    const player = state.players[seat];
    const side = allies.has(seat) ? 1 : -1;
    if (player.eliminated) score -= side * 2_500;
    score += side * (player.orbs.light * 0.72 + player.orbs.dark * 0.88);
    score += side * Object.values(player.upgrades)
      .reduce((total, level) => total + level * 0.7, 0);
    score += side * player.gods
      .reduce((total, godId) => total + GOD_DRAFT_VALUE[godId], 0);
    score -= side * player.graveyard
      .reduce((total, entry) => total + fourPlayerPieceValue(entry.piece.type) * 0.32, 0);
    if (!player.eliminated) score += side * controlledMobility(state, seat) * 0.035;
    if (!player.eliminated && fourPlayerIsInCheck(
      state.board,
      seat,
      state.config,
      state.bananas,
    )) {
      score -= side * 8;
    }
  }

  for (const [square, piece] of Object.entries(state.board)) {
    const controller = piece.controller;
    if (!controller) {
      const ownerSide = allies.has(piece.owner) ? -1 : 1;
      score += ownerSide * fourPlayerPieceValue(piece.type) * 0.18;
      continue;
    }
    const side = allies.has(controller) ? 1 : enemies.has(controller) ? -1 : 0;
    if (!side) continue;
    const value = piece.type === "king" ? 120 : fourPlayerPieceValue(piece.type);
    score += side * (value * 4 + centerValue(square));
    score += side * beneficialStatusValue(piece);
    score -= side * harmfulStatusValue(piece);
    if (piece.owner !== controller) score += side * value * 0.45;
  }

  score += state.bananas.reduce(
    (total, banana) => total + (allies.has(banana.owner) ? 0.45 : -0.45),
    0,
  );
  if (allies.has(state.activeSeat)) score += 0.2;
  return score;
};

const isPlanComplete = (initial: FourPlayerState, next: FourPlayerState) => {
  if (next.phase === "gameover") return true;
  if (initial.phase === "draft") return next.draft.pickIndex !== initial.draft.pickIndex;
  if (initial.phase === "upgrade") {
    return next.phase !== "upgrade" ||
      next.upgradeQueue.length !== initial.upgradeQueue.length ||
      next.activeSeat !== initial.activeSeat;
  }
  return next.turn !== initial.turn ||
    next.activeSeat !== initial.activeSeat ||
    next.phase !== initial.phase;
};

const stateSignature = (state: FourPlayerState) => JSON.stringify({
  phase: state.phase,
  activeSeat: state.activeSeat,
  turn: state.turn,
  round: state.round,
  draftPick: state.draft.pickIndex,
  available: state.draft.available,
  upgradeQueue: state.upgradeQueue,
  selectedGod: state.selectedGod,
  selectedAbility: state.selectedAbility,
  selectedSquare: state.selectedSquare,
  legalTargets: state.legalTargets,
  legalSeats: state.legalSeats,
  pending: state.pending,
  board: state.board,
  players: state.players,
  rested: state.rested,
  bananas: state.bananas,
  stealth: state.stealth,
  winner: state.winner,
});

const budgetForDifficulty = (difficulty: number): SearchBudget => {
  const level = Math.max(1, Math.min(10, Math.round(difficulty)));
  return {
    maxDepth: 7 + Math.ceil(level / 2),
    maxActions: 20 + level * 9,
    maxFrontier: 10 + level * 12,
    maxCompleted: 35 + level * 38,
    maxPerBranch: 2 + level * 2,
  };
};

const evenlySample = <T,>(items: T[], limit: number) => {
  if (items.length <= limit) return items;
  if (limit <= 1) return items.slice(0, 1);
  const sampled: T[] = [];
  const used = new Set<number>();
  for (let index = 0; index < limit; index += 1) {
    const sourceIndex = Math.round(index * (items.length - 1) / (limit - 1));
    if (!used.has(sourceIndex)) {
      sampled.push(items[sourceIndex]);
      used.add(sourceIndex);
    }
  }
  return sampled;
};

const branchKey = (node: SearchNode) =>
  node.state.selectedAbility ??
  node.state.pending?.abilityId ??
  node.state.selectedGod ??
  node.actions[0]?.type ??
  "root";

const pruneFrontier = (
  nodes: SearchNode[],
  perspectiveSeat: Seat,
  budget: SearchBudget,
) => {
  const scores = new Map<FourPlayerState, number>();
  const scoreOf = (node: SearchNode) => {
    const cached = scores.get(node.state);
    if (cached !== undefined) return cached;
    const score = evaluateFourPlayerState(node.state, perspectiveSeat);
    scores.set(node.state, score);
    return score;
  };
  const groups = new Map<string, SearchNode[]>();
  for (const node of nodes) {
    const key = branchKey(node);
    const group = groups.get(key) ?? [];
    group.push(node);
    groups.set(key, group);
  }
  return [...groups.values()]
    .flatMap((group) =>
      group.sort((first, second) => scoreOf(second) - scoreOf(first))
        .slice(0, budget.maxPerBranch)
    )
    .sort((first, second) => scoreOf(second) - scoreOf(first))
    .slice(0, budget.maxFrontier);
};

const searchPlans = (
  state: FourPlayerState,
  perspectiveSeat: Seat,
  budget: SearchBudget,
) => {
  let frontier: SearchNode[] = [{ state, actions: [] }];
  const completed: SearchNode[] = [];
  const seen = new Set<string>([stateSignature(state)]);

  for (
    let depth = 0;
    depth < budget.maxDepth && frontier.length && completed.length < budget.maxCompleted;
    depth += 1
  ) {
    const expanded: SearchNode[] = [];
    for (const node of frontier) {
      const actions = evenlySample(
        availableFourPlayerActions(node.state),
        budget.maxActions,
      );
      for (const action of actions) {
        const next = fourPlayerReducer(node.state, action);
        const signature = stateSignature(next);
        if (signature === stateSignature(node.state) || seen.has(signature)) continue;
        seen.add(signature);
        const candidate = { state: next, actions: [...node.actions, action] };
        if (isPlanComplete(state, next)) completed.push(candidate);
        else expanded.push(candidate);
      }
    }
    frontier = pruneFrontier(expanded, perspectiveSeat, budget);
  }

  return completed.sort(
    (first, second) =>
      evaluateFourPlayerState(second.state, perspectiveSeat) -
      evaluateFourPlayerState(first.state, perspectiveSeat),
  );
};

export const chooseFourPlayerAiPlan = (
  state: FourPlayerState,
  random: () => number = Math.random,
): FourPlayerAction[] => {
  const control = state.players[state.activeSeat].control;
  const difficulty = control.kind === "ai" ? control.difficulty ?? 5 : 5;
  const plans = searchPlans(
    state,
    state.activeSeat,
    budgetForDifficulty(difficulty),
  );
  if (!plans.length) return [];
  if (difficulty >= 10 || plans.length === 1) return plans[0].actions;
  const window = Math.min(plans.length, 1 + (10 - difficulty) * 2);
  const bias = Math.pow(random(), 1 + difficulty * 0.35);
  const index = Math.min(window - 1, Math.floor((1 - bias) * window));
  return plans[index]?.actions ?? plans[0].actions;
};

export const isFourPlayerAiTurn = (state: FourPlayerState) =>
  state.phase !== "gameover" &&
  state.players[state.activeSeat].control.kind === "ai";
