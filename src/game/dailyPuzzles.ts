import type {
  ClassicResult,
  Color,
  DailyPuzzleId,
  GameState,
  PuzzleId,
} from "./types";
import { opposite } from "./types";

export type DailyTargetResult =
  | Extract<ClassicResult, { kind: "winner" }>
  | {
    kind: "draw";
    reason: "stalemate";
    stalematedColor: Color;
  };

export interface DailyPuzzleSource {
  schema: 1;
  date: string;
  resultSummary: string;
  playerColor: Color;
  playerTurns: number;
  targetResult: DailyTargetResult;
  state: GameState;
}

export interface DailyPuzzleDefinition {
  id: DailyPuzzleId;
  date: string;
  title: string;
  difficulty: "daily";
  objective: string;
  hint: string;
  completionText: string;
  playerColor: Color;
  playerTurns: number;
  targetResult: DailyTargetResult;
  createState: (playerName?: string) => GameState;
}

const colorLabel = (color: Color) =>
  color === "white" ? "White" : "Black";

const possessiveColor = (color: Color) =>
  color === "white" ? "White's" : "Black's";

const formatDailyDate = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));

const objectiveFor = (source: DailyPuzzleSource) => {
  const turns = `${source.playerTurns} divine turn${
    source.playerTurns === 1 ? "" : "s"
  }`;
  if (source.targetResult.kind === "draw") {
    return `Play as ${colorLabel(source.playerColor)} and force ${colorLabel(
      source.targetResult.stalematedColor,
    )} into stalemate within ${turns}.`;
  }
  const opponent = opposite(source.targetResult.winner);
  return source.targetResult.reason === "checkmate"
    ? `Play as ${colorLabel(source.playerColor)} and checkmate ${colorLabel(opponent)} within ${turns}.`
    : `Play as ${colorLabel(source.playerColor)} and capture ${possessiveColor(opponent)} King within ${turns}.`;
};

const createDailyState = (
  source: DailyPuzzleSource,
  playerName?: string,
) => {
  const state = structuredClone(source.state);
  const aiColor = opposite(source.playerColor);
  state.gameMode = "puzzle";
  state.aiDifficulty = 10;
  state.aiColor = aiColor;
  state.onlineHostColor = undefined;
  state.puzzleId = `daily-${source.date}`;
  state.puzzlePlayerTurnsRemaining = source.playerTurns;
  state.puzzleFailed = false;
  state.challengeId = undefined;
  state.challengeGodUses = undefined;
  state.challengeUpgradeResumeColor = undefined;
  state.winner = undefined;
  state.result = undefined;
  state.selectedGod = undefined;
  state.selectedAbility = undefined;
  state.selectedSquare = undefined;
  state.legalTargets = [];
  state.pending = undefined;
  state.presentation = undefined;
  state.upgradePreview = undefined;
  state.orbAnimations = [];
  state.captureAnimations = [];
  state.players[source.playerColor].name =
    playerName?.trim() || `${colorLabel(source.playerColor)} Daily Solver`;
  state.players[aiColor].name = `${colorLabel(aiColor)} Level 10 CPU`;
  state.history = [
    `Daily puzzle: ${formatDailyDate(source.date)}`,
    ...state.history.slice(-29),
  ];
  state.notice = objectiveFor(source);
  return state;
};

const isDailyPuzzleSource = (value: unknown): value is DailyPuzzleSource => {
  if (!value || typeof value !== "object") return false;
  const source = value as Partial<DailyPuzzleSource>;
  return source.schema === 1 &&
    typeof source.date === "string" &&
    typeof source.resultSummary === "string" &&
    (source.playerColor === "white" || source.playerColor === "black") &&
    Number.isInteger(source.playerTurns) &&
    Number(source.playerTurns) > 0 &&
    Boolean(source.targetResult) &&
    Boolean(source.state);
};

const modules = import.meta.glob("./dailies/*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

export const DAILY_PUZZLES: DailyPuzzleDefinition[] = Object.values(modules)
  .filter(isDailyPuzzleSource)
  .sort((left, right) => left.date.localeCompare(right.date))
  .map((source) => ({
    id: `daily-${source.date}`,
    date: source.date,
    title: formatDailyDate(source.date),
    difficulty: "daily",
    objective: objectiveFor(source),
    hint: "Find the strongest continuation and complete the objective within the turn limit.",
    completionText: "Puzzle complete.",
    playerColor: source.playerColor,
    playerTurns: source.playerTurns,
    targetResult: source.targetResult,
    createState: (playerName?: string) =>
      createDailyState(source, playerName),
  }));

export const DAILY_PUZZLE_BY_ID = Object.fromEntries(
  DAILY_PUZZLES.map((puzzle) => [puzzle.id, puzzle]),
) as Partial<Record<DailyPuzzleId, DailyPuzzleDefinition>>;

export const isDailyPuzzleId = (
  puzzleId: PuzzleId,
): puzzleId is DailyPuzzleId =>
  puzzleId in DAILY_PUZZLE_BY_ID;

const localDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const currentDailyPuzzle = (date = new Date()) =>
  DAILY_PUZZLE_BY_ID[`daily-${localDateKey(date)}`] ??
  DAILY_PUZZLES.at(-1);

export const dailyPuzzleResultMatches = (
  puzzle: DailyPuzzleDefinition,
  state: GameState,
) => {
  if (state.phase !== "gameover" || !state.result) return false;
  if (puzzle.targetResult.kind === "draw") {
    return state.result.kind === "draw" &&
      state.result.reason === "stalemate" &&
      state.activeColor === puzzle.targetResult.stalematedColor;
  }
  return state.result.kind === "winner" &&
    state.result.winner === puzzle.targetResult.winner &&
    state.result.reason === puzzle.targetResult.reason;
};

export const createDailyPuzzleGame = (
  puzzleId: DailyPuzzleId,
  playerName?: string,
) => {
  const puzzle = DAILY_PUZZLE_BY_ID[puzzleId];
  if (!puzzle) throw new Error(`Unknown daily puzzle: ${puzzleId}`);
  return puzzle.createState(playerName);
};
