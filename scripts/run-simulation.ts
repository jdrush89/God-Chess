import fs from "node:fs";
import path from "node:path";
import {
  chooseAiPlan,
  chooseFallbackAiPlan,
  chooseRandomAiPlan,
  classicSimulationPlanStrategy,
} from "../src/game/ai";
import { createGame, gameReducer, type GameAction } from "../src/game/engine";
import { createSavedGame, prepareSavedState } from "../src/saves";
import type { Color, GameState } from "../src/game/types";
import { opposite } from "../src/game/types";

const MAX_DIVINE_TURNS = 200;
const MAX_ATTEMPTS = 2000;

const simulationSaveState = (state: GameState) => {
  const saved = prepareSavedState(state);
  saved.gameMode = "local";
  saved.aiColor = undefined;
  saved.onlineHostColor = undefined;
  return saved;
};

const simulationResultSummary = (terminal: GameState, completedTurns: number) => {
  const turns = `${completedTurns} turn${completedTurns === 1 ? "" : "s"}`;
  if (terminal.result?.kind === "winner") {
    const winner = terminal.result.winner === "white" ? "White" : "Black";
    return terminal.result.reason === "checkmate"
      ? `${winner} checkmated in ${turns}.`
      : `${winner} won by king capture in ${turns}.`;
  }
  const stalemated = terminal.activeColor === "white" ? "White" : "Black";
  return `${stalemated} was stalemated after ${turns}.`;
};

const rewindSimulationForExport = (
  terminal: GameState,
  undoHistory: GameState[],
  completedTurns: number,
  rewindRounds: number,
  completedActionGroups: GameAction[][],
) => {
  const requestedUndoActions = rewindRounds * 2 - 1;
  const remainingUndoHistory = undoHistory.map((snapshot) => prepareSavedState(snapshot));
  let state = prepareSavedState(terminal);
  let appliedUndoActions = 0;

  while (appliedUndoActions < requestedUndoActions && remainingUndoHistory.length) {
    state = prepareSavedState(remainingUndoHistory.pop()!);
    appliedUndoActions += 1;
  }

  const turnStart = state.phase === "play" ? prepareSavedState(state) : undefined;
  const save = createSavedGame(
    `simulation-${Date.now()}`,
    simulationSaveState(state),
    remainingUndoHistory.map(simulationSaveState),
    turnStart ? simulationSaveState(turnStart) : undefined,
  );

  return {
    state,
    exportData: {
      resultSummary: simulationResultSummary(terminal, completedTurns),
      completedTurns,
      rewindRounds,
      requestedUndoActions,
      appliedUndoActions,
      terminalResult: terminal.result ? structuredClone(terminal.result) : undefined,
      solutionActions: completedActionGroups
        .slice(-appliedUndoActions)
        .flatMap((actions) => structuredClone(actions)),
      save,
    },
  };
};

interface AttemptResult {
  outcome: "checkmate" | "other-result" | "turn-limit" | "stuck";
  completedTurns: number;
  terminal?: GameState;
  undoHistory: GameState[];
  actionGroups: GameAction[][];
  resultSummary?: string;
}

const runOneSimulation = (): AttemptResult => {
  let state = createGame(1, { mode: "simulation", aiDifficulty: 10 });
  const completedTurns: Record<Color, number> = { white: 0, black: 0 };
  const undoHistory: GameState[] = [];
  const actionGroups: GameAction[][] = [];
  let currentActions: GameAction[] = [];
  let turnStart: GameState | undefined;

  const totalTurns = () => completedTurns.white + completedTurns.black;

  const applyTrackedAction = (current: GameState, action: GameAction): GameState => {
    if (current.phase === "play" || current.phase === "upgrade") {
      currentActions = [...currentActions, structuredClone(action)];
    }
    const next = gameReducer(current, action);
    const completedPlayTurn =
      current.phase === "play" &&
      (next.turn !== current.turn || next.phase === "upgrade" || next.phase === "gameover");
    if (completedPlayTurn && action.type !== "adjudicate-no-turn") {
      completedTurns[current.activeColor] += 1;
    }
    const completedUpgrade =
      action.type === "upgrade" &&
      current.phase === "upgrade" &&
      (next.phase !== current.phase || next.upgradeQueue.length !== current.upgradeQueue.length);
    if (current.phase === "draft" && next.phase === "play") {
      actionGroups.length = 0;
      currentActions = [];
      turnStart = next.phase === "play" ? prepareSavedState(next) : undefined;
    } else if (
      current.phase === "play" &&
      (next.turn !== current.turn || next.phase === "upgrade" || next.phase === "gameover")
    ) {
      undoHistory.push(prepareSavedState(turnStart ?? current));
      turnStart = next.phase === "play" ? prepareSavedState(next) : undefined;
    } else if (completedUpgrade) {
      undoHistory.push(prepareSavedState(current));
      turnStart = next.phase === "play" ? prepareSavedState(next) : undefined;
    }
    if (completedPlayTurn || completedUpgrade) {
      actionGroups.push(currentActions);
      currentActions = [];
    }
    return next;
  };

  let guard = 0;
  let lastSignature = "";
  let stableStreak = 0;
  while (state.phase !== "gameover") {
    guard += 1;
    if (guard > 20000) {
      return { outcome: "stuck", completedTurns: totalTurns(), undoHistory, actionGroups };
    }
    if (totalTurns() > MAX_DIVINE_TURNS) {
      return { outcome: "turn-limit", completedTurns: totalTurns(), undoHistory, actionGroups };
    }
    const strategy = classicSimulationPlanStrategy(state, completedTurns);
    let plan = strategy === "random" ? chooseRandomAiPlan(state) : chooseAiPlan(state);
    if (!plan.length) {
      plan = chooseFallbackAiPlan(state, strategy);
    }
    if (!plan.length) {
      if (state.phase === "play") {
        state = applyTrackedAction(state, {
          type: "adjudicate-no-turn",
          activeColor: state.activeColor,
          turn: state.turn,
        });
        continue;
      }
      return { outcome: "stuck", completedTurns: totalTurns(), undoHistory, actionGroups };
    }
    for (const action of plan) {
      state = applyTrackedAction(state, action);
      if (state.phase === "gameover") break;
    }
    // The AI planner is a pure function of state: if a deterministic plan
    // leaves the tracked state identical (e.g. an upgrade action that gets
    // rejected because the acting color is left in check), it will keep
    // producing the exact same no-op plan forever. Detect that quickly
    // instead of spinning until the guard cap.
    const signature = JSON.stringify({
      phase: state.phase,
      activeColor: state.activeColor,
      turn: state.turn,
      upgradeQueue: state.upgradeQueue,
      upgrades: state.players[state.activeColor]?.upgrades,
    });
    if (signature === lastSignature) {
      stableStreak += 1;
      if (stableStreak >= 3) {
        return { outcome: "stuck", completedTurns: totalTurns(), undoHistory, actionGroups };
      }
    } else {
      stableStreak = 0;
      lastSignature = signature;
    }
  }

  const completed = totalTurns();
  if (completed > MAX_DIVINE_TURNS) {
    return { outcome: "turn-limit", completedTurns: completed, undoHistory, actionGroups, terminal: state };
  }
  if (state.result?.kind === "winner" && state.result.reason === "checkmate") {
    return {
      outcome: "checkmate",
      completedTurns: completed,
      undoHistory,
      actionGroups,
      terminal: state,
      resultSummary: simulationResultSummary(state, completed),
    };
  }
  return {
    outcome: "other-result",
    completedTurns: completed,
    undoHistory,
    actionGroups,
    terminal: state,
    resultSummary: simulationResultSummary(state, completed),
  };
};

// Mirrors the acceptance check in src/game/dailyPuzzles.test.ts
// ("reproduces the target checkmate within the generated turn limit"):
// replaying the rewound position with deterministic-optimal AI on both
// sides must reach the recorded target result with at least one player
// turn of margin remaining.
const validateDailyCandidate = (
  rewoundState: GameState,
  playerColor: Color,
  targetResult: { kind: "winner"; winner: Color; reason: "checkmate" | "king-death" },
  playerTurns: number,
): boolean => {
  let state = structuredClone(rewoundState);
  state.gameMode = "puzzle";
  state.aiDifficulty = 10;
  state.aiColor = opposite(playerColor);
  state.puzzleId = "daily-validation-candidate";
  state.puzzlePlayerTurnsRemaining = playerTurns;
  state.puzzleFailed = false;
  state.winner = undefined;
  state.result = undefined;
  state.selectedGod = undefined;
  state.selectedAbility = undefined;
  state.selectedSquare = undefined;
  state.legalTargets = [];
  state.pending = undefined;
  state.presentation = undefined;
  state.upgradePreview = undefined;

  for (let plans = 0; plans < 12 && state.phase !== "gameover"; plans += 1) {
    const actions = chooseAiPlan(state, () => 0);
    if (!actions.length) return false;
    for (const action of actions) state = gameReducer(state, action);
  }

  const matches = state.phase === "gameover" &&
    state.result?.kind === "winner" &&
    state.result.winner === targetResult.winner &&
    state.result.reason === targetResult.reason;
  return matches && (state.puzzlePlayerTurnsRemaining ?? 0) >= 1;
};

const main = () => {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const result = runOneSimulation();
    console.log(
      `Attempt ${attempt}: outcome=${result.outcome} completedTurns=${result.completedTurns}` +
        (result.resultSummary ? ` summary="${result.resultSummary}"` : ""),
    );
    if (result.outcome !== "checkmate" || !result.terminal) {
      continue;
    }

    const playerColor = result.terminal.result!.winner as Color;
    const targetResult = result.terminal.result as {
      kind: "winner";
      winner: Color;
      reason: "checkmate" | "king-death";
    };

    // Try each rewind depth in [3, 5] (in random order) before discarding
    // this match entirely and starting a brand new simulation.
    const xCandidates = [3, 4, 5].sort(() => Math.random() - 0.5);
    let accepted:
      | { x: number; rewound: ReturnType<typeof rewindSimulationForExport> }
      | undefined;
    for (const x of xCandidates) {
      const rewound = rewindSimulationForExport(
        result.terminal,
        result.undoHistory,
        result.completedTurns,
        x,
        result.actionGroups,
      );
      if (!rewound.exportData.solutionActions.length) continue;
      // generate-daily-puzzle.ts requires the rewound state to land on a
      // stable "play" turn boundary (no mid-upgrade/selection state).
      const s = rewound.state;
      if (
        s.phase !== "play" ||
        s.selectedGod ||
        s.selectedAbility ||
        s.selectedSquare ||
        s.pending ||
        s.upgradeQueue?.length
      ) continue;
      if (
        !validateDailyCandidate(rewound.state, playerColor, targetResult, x)
      ) continue;
      accepted = { x, rewound };
      break;
    }

    if (!accepted) {
      console.log("No rewind depth (X=3..5) validated for this match; discarding and retrying.");
      continue;
    }

    const { x, rewound } = accepted;
    const payload = {
      rewind: { rounds: rewound.exportData.rewindRounds },
      result: {
        terminalResult: rewound.exportData.terminalResult,
        summary: rewound.exportData.resultSummary,
      },
      solutionActions: rewound.exportData.solutionActions,
      save: rewound.exportData.save,
    };

    const outputPath = path.resolve("scripts/.simulation-checkpoint.json");
    fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`Accepted checkmate after ${result.completedTurns} divine turns (X=${x}).`);
    console.log(`Wrote checkpoint to ${outputPath}`);
    process.exit(0);
  }

  console.error(`Failed to find a checkmate result within ${MAX_ATTEMPTS} attempts.`);
  process.exit(1);
};

main();
