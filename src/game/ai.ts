import { allSquares, coords, isInCheck, kingSquare, pieceValue, pseudoTargets } from "./chess";
import { enumerateCompleteTurnPlans } from "./completeTurnSearch";
import {
  availableClassicActions,
  classicPlanStateSignature,
  isCompleteClassicTurn,
  simulateClassicAction,
  type GameAction,
} from "./engine";
import { GOD_BY_ID } from "./gods";
import type { Color, GameState, GodId, Piece } from "./types";
import { opposite } from "./types";

interface SearchNode {
  state: GameState;
  actions: GameAction[];
}

export interface AiTurnPlan {
  state: GameState;
  actions: GameAction[];
}

export interface ClassicAiWorkerRequest {
  requestId: number;
  state: GameState;
}

export interface ClassicAiWorkerResponse {
  requestId: number;
  actions: GameAction[];
}

const MAX_DEPTH = 10;
const MAX_ACTIONS_PER_NODE = 64;
const MAX_PER_ABILITY = 18;
const MAX_FRONTIER = 150;
const MAX_COMPLETED = 420;

const godDraftValue: Record<GodId, number> = {
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

const beneficialStatusValue = (piece: Piece) =>
  (piece.status.hardened ? 1.7 : 0) +
  (piece.status.prepared ? 1.5 : 0) +
  (piece.status.ritual ? 1.1 : 0) +
  (piece.status.chargeUntil ? 1.2 : 0) +
  (piece.status.hired ? 0.8 : 0);

const harmfulStatusValue = (piece: Piece) =>
  (piece.status.frozen ? 1.8 : 0) +
  (piece.status.poisoned ? 0.8 : 0) +
  (piece.status.polymorphed ? 1.4 : 0) +
  (piece.status.luredBy ? 1 : 0) +
  (piece.status.hexedBy ? 0.7 : 0) +
  (piece.status.markedForDeath ? 2.3 : 0);

const centerValue = (square: string) => {
  const [file, rank] = coords(square);
  return (3.5 - Math.abs(3.5 - file) + 3.5 - Math.abs(3.5 - rank)) * 0.06;
};

const controlMap = (state: GameState, color: Color) => {
  const controlled = new Map<string, number[]>();
  for (const [square, piece] of Object.entries(state.board)) {
    if (piece.controller !== color) continue;
    for (const target of pseudoTargets(state.board, square, {
      attacksOnly: true,
      bananas: state.bananas,
      includeFriendlyTargets: true,
    })) {
      const values = controlled.get(target) ?? [];
      values.push(pieceValue(piece.type));
      controlled.set(target, values);
    }
  }
  return controlled;
};

const tacticalPositionValue = (state: GameState, color: Color) => {
  const friendlyControl = controlMap(state, color);
  const enemyControl = controlMap(state, opposite(color));
  let score = 0;

  for (const [square, piece] of Object.entries(state.board)) {
    if (piece.type === "king" || piece.status.hardened) continue;
    const friendly = piece.controller === color;
    const attackers = (friendly ? enemyControl : friendlyControl).get(square) ?? [];
    if (!attackers.length) continue;
    const defenders = (friendly ? friendlyControl : enemyControl).get(square) ?? [];
    const value = pieceValue(piece.type);
    const cheapestAttacker = Math.min(...attackers);
    if (friendly) {
      const hangingRisk = defenders.length ? 0 : value * 3 + 0.75;
      const badExchangeRisk = defenders.length ? Math.max(0, value - cheapestAttacker) * 1.4 : 0;
      const overloadedRisk = Math.max(0, attackers.length - defenders.length) * value * 0.4;
      score -= hangingRisk + badExchangeRisk + overloadedRisk;
    } else {
      const basicPressure = attackers.length * value * 0.12;
      const undefendedPressure = defenders.length ? 0 : value * 0.25;
      const coordinatedPressure = Math.max(0, attackers.length - 1) * value * 0.7;
      score += basicPressure + undefendedPressure + coordinatedPressure;
    }
  }

  return score;
};

export const evaluateGameState = (state: GameState, color: Color) => {
  if (state.phase === "gameover") {
    if (state.winner === color) return 1_000_000;
    if (state.winner === opposite(color)) return -1_000_000;
    return 0;
  }

  let score = 0;
  for (const [square, piece] of Object.entries(state.board)) {
    const side = piece.controller === color ? 1 : -1;
    const value = piece.type === "king" ? 100 : pieceValue(piece.type);
    score += side * (value * 4 + centerValue(square));
    score += side * beneficialStatusValue(piece);
    score -= side * harmfulStatusValue(piece);
  }

  const player = state.players[color];
  const enemy = state.players[opposite(color)];
  score += (player.orbs.white - enemy.orbs.white) * 0.7;
  score += (player.orbs.black - enemy.orbs.black) * 0.9;
  score += Object.values(player.upgrades).reduce((total, level) => total + level * 0.65, 0);
  score -= Object.values(enemy.upgrades).reduce((total, level) => total + level * 0.65, 0);
  score += player.gods.reduce((total, godId) => total + godDraftValue[godId], 0);
  score -= enemy.gods.reduce((total, godId) => total + godDraftValue[godId], 0);
  score += state.bananas.filter((banana) => banana.owner === color).length * 0.45;
  score -= state.bananas.filter((banana) => banana.owner !== color).length * 0.45;
  if (isInCheck(state.board, opposite(color), state.bananas)) score += 5;
  if (isInCheck(state.board, color, state.bananas)) score -= 8;
  score += tacticalPositionValue(state, color);
  return score;
};

const branchKey = (node: SearchNode) =>
  node.state.selectedAbility ??
  node.state.pending?.abilityId ??
  node.state.selectedGod ??
  node.actions[0]?.type ??
  "root";

const pruneFrontier = (nodes: SearchNode[], color: Color) => {
  const scores = new Map<GameState, number>();
  const scoreOf = (node: SearchNode) => {
    const cached = scores.get(node.state);
    if (cached !== undefined) return cached;
    const score = evaluateGameState(node.state, color);
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
  const diverse = [...groups.values()].flatMap((group) =>
    group
      .sort((a, b) => scoreOf(b) - scoreOf(a))
      .slice(0, MAX_PER_ABILITY),
  );
  return diverse
    .sort((a, b) => scoreOf(b) - scoreOf(a))
    .slice(0, MAX_FRONTIER);
};

export const enumerateTurnPlans = (state: GameState, color: Color = state.activeColor): AiTurnPlan[] => {
  let frontier: SearchNode[] = [{ state, actions: [] }];
  const completed: SearchNode[] = [];
  const seen = new Set<string>();

  for (let depth = 0; depth < MAX_DEPTH && frontier.length && completed.length < MAX_COMPLETED; depth += 1) {
    const expanded: SearchNode[] = [];
    for (const node of frontier) {
      const actions = availableClassicActions(node.state).slice(0, MAX_ACTIONS_PER_NODE);
      for (const action of actions) {
        const next = simulateClassicAction(node.state, action);
        const beforeSignature = classicPlanStateSignature(node.state);
        const signature = classicPlanStateSignature(next);
        if (signature === beforeSignature || seen.has(signature)) continue;
        seen.add(signature);
        const candidate = { state: next, actions: [...node.actions, action] };
        if (isCompleteClassicTurn(state, next)) completed.push(candidate);
        else expanded.push(candidate);
      }
    }
    frontier = pruneFrontier(expanded, color);
  }
  const scores = new Map<GameState, number>();
  return completed.sort((a, b) => {
    const scoreA = scores.get(a.state) ?? evaluateGameState(a.state, color);
    const scoreB = scores.get(b.state) ?? evaluateGameState(b.state, color);
    scores.set(a.state, scoreA);
    scores.set(b.state, scoreB);
    return scoreB - scoreA;
  });
};

const hypotheticalTurnFor = (state: GameState, color: Color) => {
  const next = structuredClone(state);
  next.activeColor = color;
  next.selectedGod = undefined;
  next.selectedAbility = undefined;
  next.selectedSquare = undefined;
  next.pending = undefined;
  next.legalTargets = [];
  return next;
};

const hasWinningTurn = (state: GameState, color: Color) => {
  const isWin = (candidate: GameState) =>
    candidate.phase === "gameover" &&
    candidate.winner === color &&
    Boolean(kingSquare(candidate.board, color)) &&
    !kingSquare(candidate.board, opposite(color));
  if (state.phase === "gameover") return isWin(state);
  const turn = state.activeColor === color ? state : hypotheticalTurnFor(state, color);
  return enumerateTurnPlans(turn, color).some(
    (plan) => isWin(plan.state),
  );
};

const hasWinningAirStrikeTurn = (state: GameState, color: Color) => {
  if (state.phase === "gameover") return false;
  const turn = state.activeColor === color ? state : hypotheticalTurnFor(state, color);
  const gods = turn.players[color].gods.filter((godId) =>
    !turn.rested.includes(godId) &&
    GOD_BY_ID[godId].abilities.some((ability) => ability.id === "air-strike")
  );

  return gods.some((godId) => {
    let selected = simulateClassicAction(turn, { type: "select-god", godId });
    selected = simulateClassicAction(selected, {
      type: "select-ability",
      abilityId: "air-strike",
    });
    if (selected.selectedAbility !== "air-strike") return false;
    return enumerateCompleteTurnPlans({
      state: selected,
      availableActions: availableClassicActions,
      reduce: simulateClassicAction,
      signature: classicPlanStateSignature,
      isComplete: isCompleteClassicTurn,
      acceptComplete: (_initial, next) =>
        next.phase === "gameover" &&
        next.winner === color &&
        Boolean(kingSquare(next.board, color)) &&
        !kingSquare(next.board, opposite(color)),
      limits: {
        maxDepth: 4,
        maxStates: 50_000,
        maxActionsPerState: 256,
        maxPlans: 1,
      },
    }).length > 0;
  });
};

const hasImmediateWinningTurn = (state: GameState, color: Color) =>
  hasWinningAirStrikeTurn(state, color) || hasWinningTurn(state, color);

const bestTacticalDefense = (
  state: GameState,
  color: Color,
  plans: AiTurnPlan[],
) => {
  const enemy = opposite(color);
  if (!hasImmediateWinningTurn(state, enemy)) return undefined;

  const initialKing = Object.entries(state.board).find(
    ([, piece]) => piece.controller === color && piece.type === "king",
  )?.[0];
  const initialEnemyIds = new Set(
    Object.values(state.board)
      .filter((piece) => piece.controller === enemy)
      .map((piece) => piece.id),
  );
  const candidateLimit = state.gameMode === "puzzle" ? 3 : 32;
  const candidates = plans
    .map((plan, index) => {
      const king = Object.entries(plan.state.board).find(
        ([, piece]) => piece.controller === color && piece.type === "king",
      )?.[0];
      const remainingEnemyIds = new Set(
        Object.values(plan.state.board)
          .filter((piece) => piece.controller === enemy)
          .map((piece) => piece.id),
      );
      const capturesEnemy = [...initialEnemyIds].some((id) => !remainingEnemyIds.has(id));
      return {
        plan,
        priority:
          (king !== initialKing ? 2 : 0) +
          (capturesEnemy ? 1 : 0),
        index,
      };
    })
    .sort((a, b) => b.priority - a.priority || a.index - b.index)
    .slice(0, candidateLimit);

  for (const { plan } of candidates) {
    if (!hasImmediateWinningTurn(plan.state, enemy)) return plan;
  }
  return undefined;
};

export const chooseAiPlan = (
  state: GameState,
  random: () => number = Math.random,
): GameAction[] => {
  const color = state.activeColor;
  const plans = enumerateTurnPlans(state, color);
  let actions: GameAction[];
  if (!plans.length) {
    actions = [];
  } else {
    const optimalChance = Math.max(0.1, Math.min(1, state.aiDifficulty / 10));
    if (random() < optimalChance || plans.length === 1) {
      actions = (
        state.aiDifficulty >= 8
          ? bestTacticalDefense(state, color, plans)
          : undefined
      )?.actions ?? plans[0].actions;
    } else {
      const alternative = plans[1 + Math.floor(random() * Math.max(1, plans.length - 1))];
      actions = (alternative ?? plans[0]).actions;
    }
  }
  if (state.phase !== "upgrade" || actions[0]?.type !== "upgrade") return actions;
  const abilityId = actions[0].abilityId;
  const godId = state.players[state.activeColor].gods.find((candidate) =>
    GOD_BY_ID[candidate].abilities.some((ability) => ability.id === abilityId),
  );
  return godId
    ? [{ type: "preview-upgrade", godId, abilityId }, ...actions]
    : actions;
};

export const isAiTurn = (state: GameState) =>
  (state.gameMode === "ai" || state.gameMode === "puzzle") &&
  state.aiColor === state.activeColor &&
  state.phase !== "gameover";
