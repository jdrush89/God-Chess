import {
  availableThreePlayerActions,
  isCompleteThreePlayerPlan,
  threePlayerPlanStateSignature,
  threePlayerReducer,
} from "./threePlayerEngine";
import { enumerateCompleteTurnPlans } from "./completeTurnSearch";
import type {
  ThreePlayerAction,
  ThreePlayerState,
} from "./threePlayerTypes";

export {
  isCompleteThreePlayerPlan,
  threePlayerPlanStateSignature,
} from "./threePlayerEngine";

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

export const enumerateCompleteThreePlayerPlans = (
  state: ThreePlayerState,
  limits: ThreePlayerPlanLimits = {},
): ThreePlayerPlan[] => enumerateCompleteTurnPlans({
  state,
  availableActions: availableThreePlayerActions,
  reduce: threePlayerReducer,
  signature: threePlayerPlanStateSignature,
  isComplete: isCompleteThreePlayerPlan,
  limits: {
    maxDepth: limits.maxDepth ?? 14,
    maxStates: limits.maxStates ?? 12_000,
    maxActionsPerState: limits.maxActionsPerState ?? 256,
    maxPlans: limits.maxPlans ?? 2_000,
  },
});
