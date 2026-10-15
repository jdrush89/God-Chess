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

if (!inputPath) {
  console.error("Usage: npm run generate:daily -- <simulation-export.json> [YYYY-MM-DD]");
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8"));
const turns = payload?.rewind?.rounds;
const terminalResult = payload?.result?.terminalResult as
  | ClassicResult
  | undefined;
const resultSummary = payload?.result?.summary;
const savedAt = payload?.save?.savedAt;
let state = payload?.save?.state as GameState | undefined;
let solutionActions = payload?.solutionActions as GameAction[] | undefined;
const date = dateOverride ?? savedAt?.slice(0, 10);

if (!Number.isInteger(turns) || turns <= 0) {
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

let playerColor: Color;
let targetResult;
if (terminalResult.kind === "winner") {
  playerColor = terminalResult.winner;
  targetResult = terminalResult;
} else if (terminalResult.kind === "draw" && terminalResult.reason === "stalemate") {
  const match = /^(White|Black) was stalemated\b/i.exec(resultSummary);
  if (!match) {
    throw new Error("A stalemate summary must identify the stalemated color.");
  }
  const stalematedColor = match[1].toLowerCase() as Color;
  playerColor = stalematedColor === "white" ? "black" : "white";
  targetResult = {
    kind: "draw" as const,
    reason: "stalemate" as const,
    stalematedColor,
  };
} else {
  throw new Error("Unsupported simulation result.");
}

if (state.activeColor !== playerColor) {
  const opponentPlan = chooseAiPlan(state, () => 0);
  if (!opponentPlan.length) {
    throw new Error("Unable to advance the legacy checkpoint to the player's turn.");
  }
  for (const action of opponentPlan) state = gameReducer(state, action);
  if (state.phase === "gameover" || state.activeColor !== playerColor) {
    throw new Error("The legacy checkpoint did not advance to a stable player turn.");
  }
}

const targetMatches = (candidate: GameState) => {
  if (candidate.phase !== "gameover" || !candidate.result) return false;
  if (targetResult.kind === "draw") {
    return candidate.result.kind === "draw" &&
      candidate.result.reason === "stalemate" &&
      candidate.activeColor === targetResult.stalematedColor;
  }
  return candidate.result.kind === "winner" &&
    candidate.result.winner === targetResult.winner &&
    candidate.result.reason === targetResult.reason;
};

const deriveSolutionActions = (initialState: GameState) => {
  const actions: GameAction[] = [];
  let candidate = structuredClone(initialState);
  for (let plans = 0; plans < turns * 2 + 4 && !targetMatches(candidate); plans += 1) {
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
  solutionActions = deriveSolutionActions(state);
}

let replayed = structuredClone(state);
for (const action of solutionActions) replayed = gameReducer(replayed, action);
if (!targetMatches(replayed)) {
  throw new Error("The exported solution actions do not reproduce the simulation result.");
}

const output = {
  schema: 1,
  date,
  resultSummary,
  playerColor,
  playerTurns: turns,
  targetResult,
  solutionActions,
  state,
};
const outputDirectory = path.resolve("src/game/dailies");
const outputPath = path.join(outputDirectory, `${date}.json`);
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Generated ${path.relative(process.cwd(), outputPath)}`);
