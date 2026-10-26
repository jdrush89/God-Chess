import { allSquares, isInCheck } from "../game/chess";
import { createGame } from "../game/engine";
import { GODS } from "../game/gods";
import type { AccountPortraitId } from "../account/portraits";
import {
  opposite,
  type Color,
  type GameState,
  type GodId,
  type Piece,
  type PieceType,
  type Square,
} from "../game/types";

export type CustomPuzzleObjective = "capture-king" | "escape-check";

export interface CustomPuzzlePlayer {
  gods: GodId[];
  orbs: {
    white: number;
    black: number;
  };
}

export interface CustomPuzzleContent {
  title: string;
  objective: CustomPuzzleObjective;
  playerColor: Color;
  turnLimit: number;
  restingGods: GodId[];
  board: Record<Square, Piece>;
  players: Record<Color, CustomPuzzlePlayer>;
}

export interface CustomPuzzleDraft extends CustomPuzzleContent {
  version: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  verifiedFingerprint?: string;
  verifiedTurnsUsed?: number;
  uploadedPuzzleId?: string;
}

export interface CustomPuzzleMarketplaceEntry {
  id: string;
  creatorPublicId: string;
  creatorDisplayName: string;
  creatorPortraitId: AccountPortraitId;
  puzzle: CustomPuzzleContent;
  createdAt: string;
  completedByMe: boolean;
  ownedByMe: boolean;
  friendCompletions: Array<{
    publicId: string;
    displayName: string;
    portraitId: AccountPortraitId;
    completedAt: string;
  }>;
}

export interface ActiveCustomPuzzle {
  puzzle: CustomPuzzleContent;
  localDraftId?: string;
  marketplacePuzzleId?: string;
}

const GOD_IDS = new Set<GodId>(GODS.map((god) => god.id));
const SQUARES = new Set(allSquares);
const COLORS = new Set<Color>(["white", "black"]);
const PIECE_TYPES = new Set<PieceType>([
  "king",
  "queen",
  "rook",
  "bishop",
  "knight",
  "pawn",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const createEditorPiece = (
  square: Square,
  type: PieceType,
  color: Color,
): Piece => ({
  id: `custom-${color}-${type}-${square}`,
  type,
  color,
  controller: color,
  hasMoved: true,
  status: {},
});

export const createBlankCustomPuzzle = (): CustomPuzzleDraft => {
  const now = new Date().toISOString();
  return {
    version: 1,
    id: crypto.randomUUID(),
    title: "Untitled puzzle",
    objective: "capture-king",
    playerColor: "white",
    turnLimit: 2,
    restingGods: [],
    board: {
      d1: createEditorPiece("d1", "king", "white"),
      e8: createEditorPiece("e8", "king", "black"),
    },
    players: {
      white: {
        gods: ["ares", "artemis", "chiron"],
        orbs: { white: 4, black: 4 },
      },
      black: {
        gods: ["anubis", "medusa", "teles"],
        orbs: { white: 4, black: 4 },
      },
    },
    createdAt: now,
    updatedAt: now,
  };
};

const normalizeGods = (value: unknown): GodId[] | undefined => {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every((godId) => typeof godId === "string" && GOD_IDS.has(godId as GodId)) ||
    new Set(value).size !== 3
  ) return undefined;
  return value as GodId[];
};

const normalizeRestingGods = (value: unknown): GodId[] | undefined => {
  if (
    !Array.isArray(value) ||
    !value.every((godId) =>
      typeof godId === "string" && GOD_IDS.has(godId as GodId)
    ) ||
    new Set(value).size !== value.length
  ) return undefined;
  return value as GodId[];
};

const normalizeOrbCount = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 20
    ? value
    : undefined;

const normalizePiece = (
  value: unknown,
  square: Square,
): Piece | undefined => {
  if (
    !isRecord(value) ||
    !PIECE_TYPES.has(value.type as PieceType) ||
    !COLORS.has(value.color as Color)
  ) return undefined;
  const color = value.color as Color;
  const type = value.type as PieceType;
  return {
    id: typeof value.id === "string" && value.id.trim()
      ? value.id.slice(0, 80)
      : `custom-${color}-${type}-${square}`,
    type,
    color,
    controller: color,
    hasMoved: value.hasMoved !== false,
    status: {},
  };
};

export const normalizeCustomPuzzleContent = (
  value: unknown,
): CustomPuzzleContent | undefined => {
  if (!isRecord(value) || !isRecord(value.board) || !isRecord(value.players)) {
    return undefined;
  }
  const objective = value.objective;
  const playerColor = value.playerColor;
  const turnLimit = value.turnLimit;
  const restingGods = value.restingGods === undefined
    ? []
    : normalizeRestingGods(value.restingGods);
  if (
    (objective !== "capture-king" && objective !== "escape-check") ||
    !COLORS.has(playerColor as Color) ||
    typeof turnLimit !== "number" ||
    !Number.isInteger(turnLimit) ||
    turnLimit < 1 ||
    turnLimit > 10 ||
    !restingGods
  ) return undefined;
  const players = {} as Record<Color, CustomPuzzlePlayer>;
  for (const color of ["white", "black"] as const) {
    const player = value.players[color];
    if (!isRecord(player) || !isRecord(player.orbs)) return undefined;
    const gods = normalizeGods(player.gods);
    const white = normalizeOrbCount(player.orbs.white);
    const black = normalizeOrbCount(player.orbs.black);
    if (!gods || white === undefined || black === undefined) return undefined;
    players[color] = { gods, orbs: { white, black } };
  }
  const board: Record<Square, Piece> = {};
  for (const [square, pieceValue] of Object.entries(value.board)) {
    if (!SQUARES.has(square)) continue;
    const piece = normalizePiece(pieceValue, square);
    if (piece) board[square] = piece;
  }
  return {
    title: typeof value.title === "string"
      ? value.title.trim().slice(0, 60)
      : "",
    objective,
    playerColor: playerColor as Color,
    turnLimit,
    restingGods,
    board,
    players,
  };
};

export const normalizeCustomPuzzleDraft = (
  value: unknown,
): CustomPuzzleDraft | undefined => {
  if (!isRecord(value) || value.version !== 1 || typeof value.id !== "string") {
    return undefined;
  }
  const content = normalizeCustomPuzzleContent(value);
  if (!content) return undefined;
  return {
    version: 1,
    id: value.id,
    ...content,
    createdAt: typeof value.createdAt === "string"
      ? value.createdAt
      : new Date().toISOString(),
    updatedAt: typeof value.updatedAt === "string"
      ? value.updatedAt
      : new Date().toISOString(),
    verifiedFingerprint: typeof value.verifiedFingerprint === "string"
      ? value.verifiedFingerprint
      : undefined,
    verifiedTurnsUsed:
      typeof value.verifiedTurnsUsed === "number" &&
      Number.isInteger(value.verifiedTurnsUsed) &&
      value.verifiedTurnsUsed >= 1 &&
      value.verifiedTurnsUsed <= content.turnLimit
        ? value.verifiedTurnsUsed
        : undefined,
    uploadedPuzzleId: typeof value.uploadedPuzzleId === "string"
      ? value.uploadedPuzzleId
      : undefined,
  };
};

export const customPuzzleFingerprint = (
  puzzle: CustomPuzzleContent,
) => JSON.stringify({
  title: puzzle.title.trim(),
  objective: puzzle.objective,
  playerColor: puzzle.playerColor,
  turnLimit: puzzle.turnLimit,
  restingGods: [...puzzle.restingGods].sort(),
  board: Object.entries(puzzle.board)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([square, piece]) => [
      square,
      piece.type,
      piece.color,
      piece.hasMoved,
    ]),
  players: puzzle.players,
});

export const customPuzzleIsVerified = (puzzle: CustomPuzzleDraft) =>
  puzzle.verifiedFingerprint === customPuzzleFingerprint(puzzle) &&
  typeof puzzle.verifiedTurnsUsed === "number";

export const validateCustomPuzzle = (
  puzzle: CustomPuzzleContent,
): string[] => {
  const errors: string[] = [];
  if (!puzzle.title.trim()) errors.push("Give the puzzle a title.");
  for (const color of ["white", "black"] as const) {
    const kings = Object.values(puzzle.board).filter(
      (piece) => piece.type === "king" && piece.color === color,
    );
    if (kings.length !== 1) {
      errors.push(`Place exactly one ${color} King.`);
    }
    if (new Set(puzzle.players[color].gods).size !== 3) {
      errors.push(`Choose three unique gods for ${color}.`);
    }
    if (
      puzzle.players[color].gods.every((godId) =>
        puzzle.restingGods.includes(godId)
      )
    ) {
      errors.push(`Leave at least one ${color} god ready to act.`);
    }
  }
  const selectedGods = new Set(
    Object.values(puzzle.players).flatMap((player) => player.gods),
  );
  if (
    new Set(puzzle.restingGods).size !== puzzle.restingGods.length ||
    puzzle.restingGods.some((godId) => !GOD_IDS.has(godId)) ||
    puzzle.restingGods.some((godId) => !selectedGods.has(godId))
  ) {
    errors.push("Only selected gods can start resting.");
  }
  const pieceIds = Object.values(puzzle.board).map((piece) => piece.id);
  if (
    pieceIds.some((pieceId) => !pieceId.trim()) ||
    new Set(pieceIds).size !== pieceIds.length
  ) {
    errors.push("Every placed piece must have a unique ID.");
  }
  if (
    puzzle.objective === "escape-check" &&
    !isInCheck(puzzle.board, puzzle.playerColor, [])
  ) {
    errors.push("The solver's King must begin in check.");
  }
  return errors;
};

export const createCustomPuzzleGame = (
  puzzle: CustomPuzzleContent,
  playerName?: string,
): GameState => {
  const solver = puzzle.playerColor;
  const opponent = opposite(solver);
  const state = createGame(solver === "white" ? 1 : 2, {
    mode: "puzzle",
    aiDifficulty: 10,
    playerName: playerName?.trim() || "Puzzle Solver",
  });
  state.phase = "play";
  state.board = structuredClone(puzzle.board);
  state.activeColor = solver;
  state.aiColor = opponent;
  state.puzzlePlayerTurnsRemaining = puzzle.objective === "escape-check"
    ? 1
    : puzzle.turnLimit;
  state.puzzleFailed = false;
  state.puzzleEscapeAny = puzzle.objective === "escape-check";
  state.puzzleSolved = puzzle.objective === "escape-check" ? false : undefined;
  state.players[solver].name = playerName?.trim() || "Puzzle Solver";
  state.players[opponent].name = "Divine AI";
  for (const color of ["white", "black"] as const) {
    state.players[color].gods = [...puzzle.players[color].gods];
    state.players[color].orbs = { ...puzzle.players[color].orbs };
    state.players[color].graveyard = [];
    state.players[color].upgrades = {};
  }
  state.draft.pickIndex = state.draft.order.length;
  state.draft.available = [];
  state.rested = [...puzzle.restingGods];
  state.round = 1;
  state.turn = 1;
  state.upgradeQueue = [];
  state.selectedGod = undefined;
  state.selectedAbility = undefined;
  state.selectedSquare = undefined;
  state.legalTargets = [];
  state.pending = undefined;
  state.enPassant = undefined;
  state.bananas = [];
  state.stealth = { white: [], black: [] };
  state.orbAnimations = [];
  state.captureAnimations = [];
  state.winner = undefined;
  state.result = undefined;
  state.history = [`Custom puzzle: ${puzzle.title}`];
  state.lastAction = undefined;
  state.notice = puzzle.objective === "capture-king"
    ? `Capture the ${opponent} King within ${puzzle.turnLimit} player turn${puzzle.turnLimit === 1 ? "" : "s"}.`
    : "Escape check by completing one legal divine turn.";
  return state;
};

export const customPuzzleSolved = (
  state: GameState,
  puzzle: CustomPuzzleContent,
) => puzzle.objective === "escape-check"
  ? Boolean(state.puzzleSolved)
  : state.phase === "gameover" &&
    state.winner === puzzle.playerColor;

export const customPuzzleTurnsUsed = (
  state: GameState,
  puzzle: CustomPuzzleContent,
) => {
  if (puzzle.objective === "escape-check") return 1;
  const remaining = state.puzzlePlayerTurnsRemaining ?? 0;
  return Math.min(
    puzzle.turnLimit,
    Math.max(1, puzzle.turnLimit - remaining + 1),
  );
};

export const customPuzzleObjectiveText = (
  puzzle: CustomPuzzleContent,
) => puzzle.objective === "capture-king"
  ? `Capture the ${opposite(puzzle.playerColor)} King within ${puzzle.turnLimit} player turn${puzzle.turnLimit === 1 ? "" : "s"}.`
  : "Escape check by completing one legal divine turn.";
