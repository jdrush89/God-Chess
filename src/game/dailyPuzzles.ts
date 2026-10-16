import type {
  ClassicResult,
  Color,
  DailyPuzzleId,
  GameState,
  PieceType,
  PuzzleId,
} from "./types";
import { gameReducer, type GameAction } from "./engine";
import { GODS } from "./gods";
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
  solutionActions: GameAction[];
  state: GameState;
}

export interface DailyPuzzleDefinition {
  id: DailyPuzzleId;
  date: string;
  title: string;
  difficulty: "daily";
  objective: string;
  hint: string;
  abilityHint: string;
  completionText: string;
  playerColor: Color;
  playerTurns: number;
  targetResult: DailyTargetResult;
  solutionActions: GameAction[];
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
  const turns = `${source.playerTurns} of your divine turn${
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

const pieceLocations = (state: GameState) => {
  const locations = new Map<
    string,
    { location: string; type: PieceType; controller: Color }
  >();
  for (const [square, piece] of Object.entries(state.board)) {
    locations.set(piece.id, {
      location: square,
      type: piece.type,
      controller: piece.controller,
    });
  }
  for (const color of ["white", "black"] as const) {
    for (const move of state.stealth[color]) {
      locations.set(move.piece.id, {
        location: `stealth:${move.destination}`,
        type: move.piece.type,
        controller: move.piece.controller,
      });
    }
  }
  return locations;
};

const firstSolutionPieceType = (source: DailyPuzzleSource) => {
  let state = structuredClone(source.state);
  for (const action of source.solutionActions) {
    const before = pieceLocations(state);
    const next = gameReducer(state, action);
    const after = pieceLocations(next);
    for (const [pieceId, piece] of before) {
      if (
        piece.controller === source.playerColor &&
        after.has(pieceId) &&
        after.get(pieceId)?.location !== piece.location
      ) {
        return piece.type;
      }
    }
    state = next;
  }
  return undefined;
};

const hintFor = (source: DailyPuzzleSource) => {
  const pieceType = firstSolutionPieceType(source);
  return pieceType
    ? `Start by moving a ${pieceType}. Find the strongest continuation from there.`
    : "Find the strongest continuation and complete the objective within the turn limit.";
};

const abilityNameById = new Map(
  GODS.flatMap((god) =>
    god.abilities.map((ability) => [ability.id, ability.name] as const)
  ),
);

const formatList = (items: string[]) => {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
};

const abilityHintFor = (source: DailyPuzzleSource) => {
  let state = structuredClone(source.state);
  const abilityNames: string[] = [];
  for (const action of source.solutionActions) {
    if (state.activeColor === source.playerColor) {
      const abilityId = action.type === "select-ability"
        ? action.abilityId
        : action.type === "commit-move-first"
          ? action.abilityId
          : undefined;
      const abilityName = abilityId
        ? abilityNameById.get(abilityId)
        : undefined;
      if (abilityName && !abilityNames.includes(abilityName)) {
        abilityNames.push(abilityName);
      }
    }
    state = gameReducer(state, action);
  }
  return abilityNames.length
    ? `The winning CPU line used ${formatList(abilityNames)}.`
    : "The winning CPU line did not require a named God ability.";
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
    ...state.history
      .filter((entry) => !/simulation/i.test(entry))
      .slice(0, 29),
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
    Array.isArray(source.solutionActions) &&
    source.solutionActions.length > 0 &&
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
    hint: hintFor(source),
    abilityHint: abilityHintFor(source),
    completionText: "Puzzle complete.",
    playerColor: source.playerColor,
    playerTurns: source.playerTurns,
    targetResult: source.targetResult,
    solutionActions: structuredClone(source.solutionActions),
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
