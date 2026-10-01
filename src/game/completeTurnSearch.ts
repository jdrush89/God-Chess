export interface CompleteTurnPlan<State, Action> {
  actions: Action[];
  state: State;
}

export interface CompleteTurnSearchLimits {
  maxDepth: number;
  maxStates: number;
  maxActionsPerState: number;
  maxPlans: number;
}

interface CompleteTurnSearchOptions<State, Action> {
  state: State;
  availableActions: (state: State) => Action[];
  reduce: (state: State, action: Action) => State;
  signature: (state: State) => string;
  isComplete: (initial: State, next: State) => boolean;
  acceptComplete?: (initial: State, next: State) => boolean;
  limits: CompleteTurnSearchLimits;
}

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

export const enumerateCompleteTurnPlans = <State, Action>({
  state,
  availableActions,
  reduce,
  signature,
  isComplete,
  acceptComplete = () => true,
  limits,
}: CompleteTurnSearchOptions<State, Action>): CompleteTurnPlan<State, Action>[] => {
  let frontier: CompleteTurnPlan<State, Action>[] = [{ actions: [], state }];
  const completed: CompleteTurnPlan<State, Action>[] = [];
  const seen = new Set([signature(state)]);
  let visited = 1;

  for (
    let depth = 0;
    depth < limits.maxDepth &&
    frontier.length &&
    visited < limits.maxStates &&
    completed.length < limits.maxPlans;
    depth += 1
  ) {
    const nextFrontier: CompleteTurnPlan<State, Action>[] = [];
    for (const node of frontier) {
      const before = signature(node.state);
      const actions = evenlySample(
        availableActions(node.state),
        limits.maxActionsPerState,
      );
      for (const action of actions) {
        const next = reduce(node.state, action);
        const nextSignature = signature(next);
        if (nextSignature === before || seen.has(nextSignature)) continue;
        seen.add(nextSignature);
        visited += 1;
        const candidate = {
          actions: [...node.actions, action],
          state: next,
        };
        if (isComplete(state, next)) {
          if (acceptComplete(state, next)) completed.push(candidate);
        } else {
          nextFrontier.push(candidate);
        }
        if (visited >= limits.maxStates || completed.length >= limits.maxPlans) {
          break;
        }
      }
      if (visited >= limits.maxStates || completed.length >= limits.maxPlans) {
        break;
      }
    }
    frontier = nextFrontier;
  }

  return completed;
};

export const hasCompleteTurn = <State, Action>(
  options: Omit<CompleteTurnSearchOptions<State, Action>, "limits"> & {
    limits: Omit<CompleteTurnSearchLimits, "maxPlans">;
  },
) => enumerateCompleteTurnPlans({
  ...options,
  limits: { ...options.limits, maxPlans: 1 },
}).length > 0;
