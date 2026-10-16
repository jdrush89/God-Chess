import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chooseAiPlan } from "../src/game/ai";
import { gameReducer } from "../src/game/engine";
import type {
  ClassicResult,
  Color,
  GameState,
} from "../src/game/types";
import type { GameAction } from "../src/game/engine";

const [, , inputPath, dateOverride] = process.argv;
const MIN_DAILY_TURNS = 3;
const MAX_DAILY_TURNS = 5;

if (!inputPath) {
  console.error("Usage: npm run generate:daily -- <simulation-export.json> [YYYY-MM-DD]");
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8"));
const reportedTurns = payload?.rewind?.rounds;
const terminalResult = payload?.result?.terminalResult as
  | ClassicResult
  | undefined;
const resultSummary = payload?.result?.summary;
const savedAt = payload?.save?.savedAt;
let state = payload?.save?.state as GameState | undefined;
let solutionActions = payload?.solutionActions as GameAction[] | undefined;
const date = dateOverride ?? savedAt?.slice(0, 10);

if (!Number.isInteger(reportedTurns) || reportedTurns <= 0) {
  throw new Error("The simulation export must include a positive rewind.rounds value.");
}
if (!terminalResult || typeof resultSummary !== "string") {
  throw new Error("The simulation export must include its terminal result and summary.");
}
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  throw new Error("Provide a YYYY-MM-DD date or use an export with save.savedAt.");
}
if (!state || state.phase !== "play") {
  throw new Error("The simulation export must contain a stable rewound play state.");
}
if (
  state.selectedGod ||
  state.selectedAbility ||
  state.selectedSquare ||
  state.pending ||
  state.upgradeQueue?.length
) {
  throw new Error("The rewound state must be at a stable turn boundary.");
}

if (
  terminalResult.kind !== "winner" ||
  terminalResult.reason !== "checkmate"
) {
  throw new Error("Daily puzzles can only be generated from checkmate simulations.");
}
const playerColor: Color = terminalResult.winner;
const targetResult = terminalResult;

if (state.activeColor !== playerColor) {
  throw new Error("The checkpoint must begin on the checkmating player's turn.");
}

const targetMatches = (candidate: GameState) => {
  if (candidate.phase !== "gameover" || !candidate.result) return false;
  return candidate.result.kind === "winner" &&
    candidate.result.winner === targetResult.winner &&
    candidate.result.reason === targetResult.reason;
};

const replaySolution = (
  initialState: GameState,
  actions: GameAction[],
) => {
  let candidate = structuredClone(initialState);
  let playerTurns = 0;
  for (const action of actions) {
    const before = candidate;
    candidate = gameReducer(candidate, action);
    const completedPlayTurn =
      before.phase === "play" &&
      (
        candidate.turn !== before.turn ||
        candidate.phase === "upgrade" ||
        candidate.phase === "gameover"
      );
    if (
      completedPlayTurn &&
      action.type !== "adjudicate-no-turn" &&
      before.activeColor === playerColor
    ) {
      playerTurns += 1;
    }
  }
  return { state: candidate, playerTurns };
};

const deriveOptimalSolution = (initialState: GameState) => {
  const actions: GameAction[] = [];
  let candidate = structuredClone(initialState);
  for (
    let plans = 0;
    plans < MAX_DAILY_TURNS * 2 + 6 && !targetMatches(candidate);
    plans += 1
  ) {
    const plan = chooseAiPlan(candidate, () => 0);
    if (!plan.length) break;
    actions.push(...plan);
    for (const action of plan) candidate = gameReducer(candidate, action);
  }
  if (!targetMatches(candidate)) {
    throw new Error("Unable to derive a Daily solution matching the simulation result.");
  }
  return actions;
};

if (!Array.isArray(solutionActions) || !solutionActions.length) {
  throw new Error("The simulation export must include its exact solutionActions.");
}

const replayed = replaySolution(state, solutionActions);
if (!targetMatches(replayed.state)) {
  throw new Error("The exported solution actions do not reproduce the simulation result.");
}
if (
  replayed.playerTurns < MIN_DAILY_TURNS ||
  replayed.playerTurns > MAX_DAILY_TURNS
) {
  throw new Error(
    `The exported solution takes ${replayed.playerTurns} player turns; Daily puzzles must take ${MIN_DAILY_TURNS}-${MAX_DAILY_TURNS}.`,
  );
}
if (reportedTurns !== replayed.playerTurns) {
  throw new Error(
    `The export reports ${reportedTurns} player turns, but its exact solution takes ${replayed.playerTurns}.`,
  );
}

const optimalActions = deriveOptimalSolution(state);
const optimalReplay = replaySolution(state, optimalActions);
if (!targetMatches(optimalReplay.state)) {
  throw new Error("The level 10 CPU no longer finds the exported checkmate.");
}
if (optimalReplay.playerTurns < MIN_DAILY_TURNS) {
  throw new Error(
    `The level 10 CPU finds checkmate in ${optimalReplay.playerTurns} player turns; choose an earlier checkpoint.`,
  );
}

const output = {
  schema: 1,
  date,
  resultSummary,
  playerColor,
  playerTurns: replayed.playerTurns,
  targetResult,
  solutionActions,
  state,
};
const outputDirectory = path.resolve("src/game/dailies");
const outputPath = path.join(outputDirectory, `${date}.json`);
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Generated ${path.relative(process.cwd(), outputPath)}`);
