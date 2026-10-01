import {
  threePlayerIsInCheck,
  threePlayerPieceValue,
  threePlayerPseudoTargets,
} from "./threePlayerChess";
import { availableThreePlayerActions } from "./threePlayerEngine";
import { getThreePlayerTopology } from "./threePlayerTopology";
import {
  enumerateCompleteThreePlayerPlans,
  type ThreePlayerPlan,
} from "./threePlayerPlans";
import {
  THREE_PLAYER_SEATS,
  type ThreePlayerAction,
  type ThreePlayerPiece,
  type ThreePlayerSeat,
  type ThreePlayerState,
} from "./threePlayerTypes";
import type { GodId } from "./types";

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

const beneficialStatusValue = (piece: ThreePlayerPiece) =>
  (piece.status.hardened ? 1.7 : 0) +
  (piece.status.prepared ? 1.5 : 0) +
  (piece.status.ritual ? 1.1 : 0) +
  (piece.status.chargeUntil ? 1.2 : 0) +
  (piece.status.hired ? 0.8 : 0);

const harmfulStatusValue = (piece: ThreePlayerPiece) =>
  (piece.status.frozen ? 1.8 : 0) +
  (piece.status.poisoned ? 0.8 : 0) +
  (piece.status.polymorphed ? 1.4 : 0) +
  (piece.status.luredBy ? 1 : 0) +
  (piece.status.hexedBy ? 0.7 : 0) +
  (piece.status.markedForDeath ? 2.3 : 0);

const centerValue = (state: ThreePlayerState, cell: string) => {
  const topology = getThreePlayerTopology(state.config.boardVariant);
  const descriptor = topology.cellById.get(cell);
  if (!descriptor) return 0;
  const { minX, maxX, minY, maxY } = topology.renderBounds;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const distance = Math.hypot(
    descriptor.render.x - centerX,
    descriptor.render.y - centerY,
  );
  return Math.max(0, 1 - distance / span) * 0.3;
};

const controlledMobility = (
  state: ThreePlayerState,
  seat: ThreePlayerSeat,
) => Object.entries(state.board)
  .filter(([, piece]) => piece.controller === seat)
  .reduce((total, [cell]) =>
    total + Math.min(
      12,
      threePlayerPseudoTargets(state, cell, {
        attacksOnly: true,
        includeAlliedTargets: true,
      }).length,
    ), 0);

export const evaluateThreePlayerState = (
  state: ThreePlayerState,
  perspectiveSeat: ThreePlayerSeat,
) => {
  if (state.phase === "gameover") {
    return state.result?.kind === "winner" &&
        state.result.seat === perspectiveSeat
      ? 1_000_000
      : -1_000_000;
  }
  let score = 0;
  for (const seat of THREE_PLAYER_SEATS) {
    const player = state.players[seat];
    const side = seat === perspectiveSeat ? 1 : -0.5;
    if (player.eliminated) score -= side * 2_500;
    score += side * (player.orbs.light * 0.72 + player.orbs.dark * 0.88);
    score += side * Object.values(player.upgrades)
      .reduce((total, level) => total + level * 0.7, 0);
    score += side * player.gods
      .reduce((total, godId) => total + GOD_DRAFT_VALUE[godId], 0);
    score -= side * player.graveyard
      .reduce(
        (total, entry) =>
          total + threePlayerPieceValue(entry.piece.type) * 0.32,
        0,
      );
    if (!player.eliminated) {
      score += side * controlledMobility(state, seat) * 0.035;
      if (threePlayerIsInCheck(state, seat)) score -= side * 8;
    }
  }
  for (const [cell, piece] of Object.entries(state.board)) {
    if (!piece.controller) {
      const side = piece.owner === perspectiveSeat ? -1 : 0.5;
      score += side * threePlayerPieceValue(piece.type) * 0.18;
      continue;
    }
    const side = piece.controller === perspectiveSeat ? 1 : -0.5;
    const value = piece.type === "king"
      ? 120
      : threePlayerPieceValue(piece.type);
    score += side * (value * 4 + centerValue(state, cell));
    score += side * beneficialStatusValue(piece);
    score -= side * harmfulStatusValue(piece);
    if (piece.owner !== piece.controller) score += side * value * 0.45;
  }
  score += (state.bananas ?? []).reduce(
    (total, banana) =>
      total + (banana.owner === perspectiveSeat ? 0.45 : -0.225),
    0,
  );
  if (state.activeSeat === perspectiveSeat) score += 0.2;
  return score;
};

const randomFromSeed = (seed: number) => {
  let value = seed >>> 0 || 0x9e3779b9;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 0x1_0000_0000;
  };
};

const stablePlanKey = (plan: ThreePlayerPlan) =>
  JSON.stringify(plan.actions);

export const chooseThreePlayerAiPlan = (
  state: ThreePlayerState,
  randomOrSeed: (() => number) | number = Math.random,
): ThreePlayerAction[] => {
  const control = state.players[state.activeSeat].control;
  const difficulty = control.kind === "ai"
    ? Math.max(1, Math.min(10, Math.round(control.difficulty ?? 5)))
    : 5;
  const plans = enumerateCompleteThreePlayerPlans(state, {
    maxDepth: 7 + Math.ceil(difficulty / 2),
    maxStates: 500 + difficulty * 900,
    maxActionsPerState: 20 + difficulty * 12,
    maxPlans: 40 + difficulty * 50,
  }).sort((first, second) =>
    evaluateThreePlayerState(second.state, state.activeSeat) -
      evaluateThreePlayerState(first.state, state.activeSeat) ||
    stablePlanKey(first).localeCompare(stablePlanKey(second))
  );
  if (!plans.length) return [];
  if (difficulty >= 10 || plans.length === 1) return plans[0].actions;
  const random = typeof randomOrSeed === "number"
    ? randomFromSeed(randomOrSeed)
    : randomOrSeed;
  const window = Math.min(plans.length, 1 + (10 - difficulty) * 2);
  const bias = Math.pow(random(), 1 + difficulty * 0.35);
  const index = Math.min(window - 1, Math.floor((1 - bias) * window));
  return plans[index]?.actions ?? plans[0].actions;
};

export const isThreePlayerAiTurn = (state: ThreePlayerState) =>
  state.phase !== "gameover" &&
  state.players[state.activeSeat].control.kind === "ai";
