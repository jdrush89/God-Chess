// Headless driver for the "hidden level-10 CPU-versus-CPU simulation" feature.
//
// This replays the exact App.tsx simulation loop (secret 5x key-press trigger)
// without a browser: createGame(mode: "simulation", aiDifficulty: 10), then
// repeatedly asks the AI for a plan (classicSimulationPlanStrategy picks
// "random" for the draft and each side's first 3 turns, "optimal" after) and
// applies it with gameReducer, tracking undo history / action groups exactly
// like App.tsx's applyTrackedAction so rewindSimulationForExport can build a
// valid Daily checkpoint.
//
// Usage: vite-node scripts/run-cpu-simulation.ts [outputPath] [YYYY-MM-DD]
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  chooseAiPlan,
  chooseFallbackAiPlan,
  chooseRandomAiPlan,
  classicSimulationPlanStrategy,
  isAiTurn,
} from "../src/game/ai";
import { createGame, gameReducer, type GameAction } from "../src/game/engine";
import type { Color, GameState } from "../src/game/types";
import { rewindSimulationForExport } from "../src/App";
import { prepareSavedState } from "../src/saves";

const MAX_DIVINE_TURNS = 200;
const MAX_ACTIONS_PER_ATTEMPT = 20_000;
const MAX_ATTEMPTS = 500;
const RUN_TIMEOUT_MS = 10 * 60 * 1000;

interface SimTrack {
  state: GameState;
  undoHistory: GameState[];
  turnStart?: GameState;
  actionGroups: GameAction[][];
  currentActions: GameAction[];
  completedTurns: Record<Color, number>;
}

const startTrack = (): SimTrack => ({
  state: createGame(1, { mode: "simulation", aiDifficulty: 10 }),
  undoHistory: [],
  turnStart: undefined,
  actionGroups: [],
  currentActions: [],
  completedTurns: { white: 0, black: 0 },
});

// Mirrors App.tsx's applyTrackedAction, minus React-only diagnostics/achievements.
const applyTrackedAction = (track: SimTrack, action: GameAction): SimTrack => {
  const current = track.state;
  let currentActions = track.currentActions;
  if (current.phase === "play" || current.phase === "upgrade") {
    currentActions = [...currentActions, structuredClone(action)];
  }
  const next = gameReducer(current, action);
  const completedPlayTurn =
    current.phase === "play" &&
    (
      next.turn !== current.turn ||
      next.phase === "upgrade" ||
      next.phase === "gameover"
    );
  let completedTurns = track.completedTurns;
  if (completedPlayTurn && action.type !== "adjudicate-no-turn") {
    completedTurns = {
      ...completedTurns,
      [current.activeColor]: completedTurns[current.activeColor] + 1,
    };
  }
  const completedUpgrade =
    action.type === "upgrade" &&
    current.phase === "upgrade" &&
    (
      next.phase !== current.phase ||
      next.upgradeQueue.length !== current.upgradeQueue.length
    );

  let undoHistory = track.undoHistory;
  let actionGroups = track.actionGroups;
  let turnStart = track.turnStart;

  if (current.phase === "draft" && next.phase === "play") {
    actionGroups = [];
    currentActions = [];
    undoHistory = [];
    turnStart = prepareSavedState(next);
  } else if (
    current.phase === "play" &&
    (next.turn !== current.turn || next.phase === "upgrade" || next.phase === "gameover")
  ) {
    undoHistory = [...undoHistory, prepareSavedState(turnStart ?? current)];
    turnStart = next.phase === "play" ? prepareSavedState(next) : undefined;
  } else if (completedUpgrade) {
    undoHistory = [...undoHistory, prepareSavedState(current)];
    turnStart = next.phase === "play" ? prepareSavedState(next) : undefined;
  }

  if (completedPlayTurn || completedUpgrade) {
    actionGroups = [...actionGroups, currentActions];
    currentActions = [];
  }

  return { state: next, undoHistory, turnStart, actionGroups, currentActions, completedTurns };
};

const totalDivineTurns = (track: SimTrack) =>
  track.completedTurns.white + track.completedTurns.black;

type AttemptOutcome =
  | { accepted: true; track: SimTrack }
  | { accepted: false; reason: string };

const runOneAttempt = (): AttemptOutcome => {
  let track = startTrack();
  for (let steps = 0; steps < MAX_ACTIONS_PER_ATTEMPT; steps += 1) {
    const state = track.state;
    if (state.phase === "gameover") break;
    if (!isAiTurn(state)) {
      return { accepted: false, reason: "Simulation reached a non-AI turn unexpectedly." };
    }
    if (totalDivineTurns(track) > MAX_DIVINE_TURNS) {
      return {
        accepted: false,
        reason: `Simulation exceeded ${MAX_DIVINE_TURNS} completed divine turns without a valid win.`,
      };
    }
    const strategy = classicSimulationPlanStrategy(state, track.completedTurns);
    let actions = strategy === "random" ? chooseRandomAiPlan(state) : chooseAiPlan(state);
    if (!actions.length) actions = chooseFallbackAiPlan(state, strategy);
    if (!actions.length) {
      if (state.phase === "play") {
        track = applyTrackedAction(track, {
          type: "adjudicate-no-turn",
          activeColor: state.activeColor,
          turn: state.turn,
        });
        continue;
      }
      return { accepted: false, reason: `No AI plan available in phase "${state.phase}".` };
    }
    for (const action of actions) track = applyTrackedAction(track, action);
  }

  const terminal = track.state;
  if (terminal.phase !== "gameover" || !terminal.result) {
    return { accepted: false, reason: "Simulation did not reach a result in time." };
  }
  const turns = totalDivineTurns(track);
  if (turns > MAX_DIVINE_TURNS) {
    return {
      accepted: false,
      reason: `Simulation exceeded ${MAX_DIVINE_TURNS} completed divine turns without a valid win.`,
    };
  }
  if (
    terminal.result.kind !== "winner" ||
    (terminal.result.reason !== "checkmate" && terminal.result.reason !== "king-death")
  ) {
    return {
      accepted: false,
      reason: `Simulation ended in ${terminal.result.kind}/${
        "reason" in terminal.result ? terminal.result.reason : "?"
      }, not checkmate or king-death.`,
    };
  }
  return { accepted: true, track };
};

const main = () => {
  const [, , outputArg, dateArg] = process.argv;
  const outputPath = path.resolve(
    outputArg ?? "scripts/.simulation-export.json",
  );
  const start = Date.now();
  let accepted: SimTrack | undefined;
  let attempts = 0;

  while (!accepted) {
    attempts += 1;
    if (attempts > MAX_ATTEMPTS) {
      throw new Error(`Gave up after ${MAX_ATTEMPTS} rejected simulation attempts.`);
    }
    if (Date.now() - start > RUN_TIMEOUT_MS) {
      throw new Error("Simulation search timed out before finding a valid winning result.");
    }
    const outcome = runOneAttempt();
    if (outcome.accepted) {
      const turns = totalDivineTurns(outcome.track);
      console.log(
        `Attempt ${attempts}: ${outcome.track.state.result?.reason} in ${turns} divine turns. Accepted.`,
      );
      accepted = outcome.track;
    } else {
      console.log(`Attempt ${attempts}: rejected — ${outcome.reason}`);
    }
  }

  const terminal = accepted.state;
  const rewound = rewindSimulationForExport(
    terminal,
    accepted.undoHistory,
    totalDivineTurns(accepted),
    Math.random,
    accepted.actionGroups,
  );

  if (
    !rewound.exportData.terminalResult ||
    rewound.exportData.terminalResult.kind !== "winner" ||
    (rewound.exportData.terminalResult.reason !== "checkmate" &&
      rewound.exportData.terminalResult.reason !== "king-death") ||
    terminal.result?.kind !== "winner" ||
    rewound.exportData.terminalResult.winner !== terminal.result.winner ||
    rewound.exportData.terminalResult.reason !== terminal.result.reason
  ) {
    throw new Error("Rewound export lost its original winning result; refusing to deploy.");
  }
  if (!rewound.exportData.solutionActions.length) {
    throw new Error("Rewound export has empty solutionActions; refusing to deploy.");
  }

  const exportPayload = {
    result: {
      summary: rewound.exportData.resultSummary,
      completedTurns: rewound.exportData.completedTurns,
      terminalResult: rewound.exportData.terminalResult,
    },
    rewind: {
      rounds: rewound.exportData.rewindRounds,
      requestedUndoActions: rewound.exportData.requestedUndoActions,
      appliedUndoActions: rewound.exportData.appliedUndoActions,
    },
    solutionActions: rewound.exportData.solutionActions,
    save: rewound.exportData.save,
  };

  if (dateArg) {
    exportPayload.save.savedAt = `${dateArg}T00:00:00.000Z`;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(exportPayload, null, 2)}\n`);
  console.log(`Wrote simulation export to ${path.relative(process.cwd(), outputPath)}`);
};

main();
