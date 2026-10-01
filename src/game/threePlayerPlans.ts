import {
  availableThreePlayerActions,
  threePlayerReducer,
} from "./threePlayerEngine";
import type {
  ThreePlayerAction,
  ThreePlayerState,
} from "./threePlayerTypes";

export interface ThreePlayerPlan {
  actions: ThreePlayerAction[];
  state: ThreePlayerState;
}

export interface ThreePlayerPlanLimits {
  maxDepth?: number;
  maxStates?: number;
  maxActionsPerState?: number;
  maxPlans?: number;
}

export const threePlayerPlanStateSignature = (
  state: ThreePlayerState,
) => JSON.stringify({
  phase: state.phase,
  activeSeat: state.activeSeat,
  turn: state.turn,
  round: state.round,
  completedTurns: state.completedTurns,
  draftPick: state.draft.pickIndex,
  available: state.draft.available,
  upgradeQueue: state.upgradeQueue,
  selectedGod: state.selectedGod,
  selectedAbility: state.selectedAbility,
  selectedCell: state.selectedCell,
  selectedPath: state.selectedPath,
  legalCells: state.legalCells,
  legalSeats: state.legalSeats,
  legalPaths: state.legalPaths,
  pending: state.pending,
  board: state.board,
  players: state.players,
  rested: state.rested,
  bananas: state.bananas,
  stealth: state.stealth,
  bonusTurn: state.bonusTurn,
  result: state.result,
});

export const isCompleteThreePlayerPlan = (
  initial: ThreePlayerState,
  next: ThreePlayerState,
) => {
  if (next.phase === "gameover") return true;
  if (initial.phase === "draft") {
    return next.draft.pickIndex !== initial.draft.pickIndex;
  }
  if (initial.phase === "upgrade") {
    return next.phase !== "upgrade" ||
      next.activeSeat !== initial.activeSeat ||
      next.upgradeQueue?.length !== initial.upgradeQueue?.length;
  }
  return next.phase !== initial.phase ||
    next.activeSeat !== initial.activeSeat ||
    next.completedTurns[initial.activeSeat] !==
      initial.completedTurns[initial.activeSeat];
};

const evenlySample = <T,>(items: T[], limit: number) => {
  if (items.length <= limit) return items;
  if (limit <= 1) return items.slice(0, 1);
  const result: T[] = [];
  const used = new Set<number>();
  for (let index = 0; index < limit; index += 1) {
    const source = Math.round(index * (items.length - 1) / (limit - 1));
    if (!used.has(source)) {
      result.push(items[source]);
      used.add(source);
    }
  }
  return result;
};

export const enumerateCompleteThreePlayerPlans = (
  state: ThreePlayerState,
  limits: ThreePlayerPlanLimits = {},
): ThreePlayerPlan[] => {
  const maxDepth = limits.maxDepth ?? 14;
  const maxStates = limits.maxStates ?? 12_000;
  const maxActionsPerState = limits.maxActionsPerState ?? 256;
  const maxPlans = limits.maxPlans ?? 2_000;
  let frontier: ThreePlayerPlan[] = [{ actions: [], state }];
  const completed: ThreePlayerPlan[] = [];
  const seen = new Set([threePlayerPlanStateSignature(state)]);
  let visited = 1;

  for (
    let depth = 0;
    depth < maxDepth &&
    frontier.length &&
    visited < maxStates &&
    completed.length < maxPlans;
    depth += 1
  ) {
    const nextFrontier: ThreePlayerPlan[] = [];
    for (const node of frontier) {
      const actions = evenlySample(
        availableThreePlayerActions(node.state),
        maxActionsPerState,
      );
      for (const action of actions) {
        const next = threePlayerReducer(node.state, action);
        const signature = threePlayerPlanStateSignature(next);
        if (
          signature === threePlayerPlanStateSignature(node.state) ||
          seen.has(signature)
        ) continue;
        seen.add(signature);
        visited += 1;
        const candidate = {
          actions: [...node.actions, action],
          state: next,
        };
        if (isCompleteThreePlayerPlan(state, next)) completed.push(candidate);
        else nextFrontier.push(candidate);
        if (visited >= maxStates || completed.length >= maxPlans) break;
      }
      if (visited >= maxStates || completed.length >= maxPlans) break;
    }
    frontier = nextFrontier;
  }

  return completed;
};

