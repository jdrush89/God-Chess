import { allSquares, coords, isInCheck, pieceValue, pseudoTargets } from "./chess";
import { gameReducer, type GameAction } from "./engine";
import { GOD_BY_ID } from "./gods";
import type { Color, GameState, GodId, Piece } from "./types";
import { opposite } from "./types";

interface SearchNode {
  state: GameState;
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

const stateSignature = (state: GameState) => JSON.stringify({
  phase: state.phase,
  activeColor: state.activeColor,
  turn: state.turn,
  draftPick: state.draft.pickIndex,
  upgradeQueue: state.upgradeQueue,
  selectedGod: state.selectedGod,
  selectedAbility: state.selectedAbility,
  selectedSquare: state.selectedSquare,
  legalTargets: state.legalTargets,
  pending: state.pending,
  board: state.board,
  players: state.players,
  rested: state.rested,
  bananas: state.bananas,
  stealth: state.stealth,
  winner: state.winner,
});

const canPass = (state: GameState) =>
  state.selectedAbility === "construction" ||
  state.selectedAbility === "marked" ||
  state.pending?.step === "slither" ||
  state.pending?.step === "mount-rider" ||
  state.pending?.step === "funding" ||
  state.pending?.step === "march-companions" ||
  (state.pending?.step === "escort-companions" && Boolean(state.pending.selected?.length)) ||
  (state.pending?.step === "hex-target" && Boolean(state.pending.selected?.length)) ||
  state.pending?.abilityId === "snipe-shot";

const abilityActions = (state: GameState): GameAction[] => {
  if (!state.selectedGod) return [];
  return GOD_BY_ID[state.selectedGod].abilities
    .filter((ability) => {
      const white = ability.cost?.white ?? 0;
      const black = ability.cost?.black ?? 0;
      const orbs = state.players[state.activeColor].orbs;
      return orbs.white >= white && orbs.black >= black;
    })
    .map((ability) => ({ type: "select-ability", abilityId: ability.id }));
};

const availableActions = (state: GameState): GameAction[] => {
  if (state.phase === "draft") {
    return state.draft.available.map((godId) => ({ type: "draft", godId }));
  }
  if (state.phase === "upgrade") {
    return state.players[state.activeColor].gods.flatMap((godId) =>
      GOD_BY_ID[godId].abilities
        .filter((ability) => (state.players[state.activeColor].upgrades[ability.id] ?? 1) < 3)
        .map((ability) => ({ type: "upgrade", abilityId: ability.id } as GameAction)),
    );
  }
  if (state.phase !== "play") return [];

  if (state.pending?.abilityId === "harden-choice") {
    if (state.pending.step === "harden-choice") {
      return state.legalTargets.map((square) => ({ type: "square", square }));
    }
    return [
      { type: "harden-choice", keep: true },
      { type: "harden-choice", keep: false },
    ];
  }
  if (state.pending?.step === "grave") {
    return state.players[state.activeColor].graveyard
      .map(({ piece }) => ({ type: "grave", pieceId: piece.id }));
  }
  if (state.pending?.step === "marked-choice") {
    return [{ type: "marked-execute" }, { type: "pass" }];
  }
  if (state.pending?.step === "rage-choice") {
    return [
      { type: "rage-resolve", spareFriendly: false },
      { type: "rage-resolve", spareFriendly: true },
    ];
  }
  if (state.pending?.step === "barter-choice") {
    return [
      { type: "barter", give: "white" },
      { type: "barter", give: "black" },
      { type: "barter" },
    ];
  }
  if (state.pending?.step === "resurrect-more") {
    return [
      { type: "resurrect-more", revive: true },
      { type: "resurrect-more", revive: false },
    ];
  }
  if (state.pending?.step === "siphon-choice") {
    return [2, 1, 0].map((amount) => ({ type: "siphon", amount } as GameAction));
  }
  if (!state.selectedGod) {
    return state.players[state.activeColor].gods
      .filter((godId) => !state.rested.includes(godId))
      .map((godId) => ({ type: "select-god", godId }));
  }
  if (!state.selectedAbility) return abilityActions(state);

  const actions: GameAction[] = [];
  if (state.legalTargets.length) {
    actions.push(...state.legalTargets.map((square) => ({ type: "square", square } as GameAction)));
  } else if (state.pending?.step === "source") {
    const candidates = state.selectedAbility === "enchant"
      ? allSquares
      : Object.entries(state.board)
          .filter(([, piece]) => piece.controller === state.activeColor)
          .map(([square]) => square);
    actions.push(...candidates.map((square) => ({ type: "square", square } as GameAction)));
  }
  if (canPass(state)) actions.push({ type: "pass" });
  return actions;
};

const isTurnComplete = (initial: GameState, next: GameState) => {
  if (next.phase === "gameover") return true;
  if (initial.phase === "draft") return next.draft.pickIndex !== initial.draft.pickIndex;
  if (initial.phase === "upgrade") {
    return next.phase !== "upgrade" || next.upgradeQueue.length !== initial.upgradeQueue.length;
  }
  return next.turn !== initial.turn || next.activeColor !== initial.activeColor;
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

const searchPlans = (state: GameState, color: Color) => {
  let frontier: SearchNode[] = [{ state, actions: [] }];
  const completed: SearchNode[] = [];
  const seen = new Set<string>();

  for (let depth = 0; depth < MAX_DEPTH && frontier.length && completed.length < MAX_COMPLETED; depth += 1) {
    const expanded: SearchNode[] = [];
    for (const node of frontier) {
      const actions = availableActions(node.state).slice(0, MAX_ACTIONS_PER_NODE);
      for (const action of actions) {
        const next = gameReducer(node.state, action);
        const beforeSignature = stateSignature(node.state);
        const signature = stateSignature(next);
        if (signature === beforeSignature || seen.has(signature)) continue;
        seen.add(signature);
        const candidate = { state: next, actions: [...node.actions, action] };
        if (isTurnComplete(state, next)) completed.push(candidate);
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

export const chooseAiPlan = (
  state: GameState,
  random: () => number = Math.random,
): GameAction[] => {
  const color = state.activeColor;
  const plans = searchPlans(state, color);
  if (!plans.length) return availableActions(state).slice(0, 1);
  const optimalChance = Math.max(0.1, Math.min(1, state.aiDifficulty / 10));
  if (random() < optimalChance || plans.length === 1) return plans[0].actions;
  const alternative = plans[1 + Math.floor(random() * Math.max(1, plans.length - 1))];
  return (alternative ?? plans[0]).actions;
};

export const isAiTurn = (state: GameState) =>
  state.gameMode === "ai" &&
  state.aiColor === state.activeColor &&
  state.phase !== "gameover";
