import { createGame, type GameAction } from "./engine";
import { GODS } from "./gods";
import type {
  Color,
  GameState,
  GodId,
  Piece,
  PieceStatus,
  PieceType,
  PuzzleId,
  Square,
} from "./types";

export type PuzzleDifficulty = "easy" | "medium" | "hard";

export interface PuzzleDefinition {
  id: PuzzleId;
  title: string;
  difficulty: PuzzleDifficulty;
  objective: string;
  hint: string;
  solutionSummary: string;
  playerTurns: 1 | 2 | 3;
  solutionTurns: GameAction[][];
  createState: (playerName?: string) => GameState;
}

export interface PuzzleGodUsage {
  puzzleId: PuzzleId;
  title: string;
  playerGods: GodId[];
  opponentGods: GodId[];
  requiredGods: GodId[];
  solutionAbilities: Partial<Record<GodId, string[]>>;
}

export interface GodPuzzleIndexEntry {
  playerIn: PuzzleId[];
  opponentIn: PuzzleId[];
  requiredBy: PuzzleId[];
  solutionAbilitiesByPuzzle: Partial<Record<PuzzleId, string[]>>;
}

const piece = (
  id: string,
  type: PieceType,
  color: Color,
  status: PieceStatus = {},
): Piece => ({
  id,
  type,
  color,
  controller: color,
  hasMoved: true,
  status,
});

const preparePuzzle = (
  id: PuzzleId,
  title: string,
  objective: string,
  gods: [GodId, GodId, GodId],
  playerName?: string,
  playerTurns: 1 | 2 | 3 = 1,
) => {
  const state = createGame(1, {
    mode: "puzzle",
    aiDifficulty: 10,
    playerName: playerName?.trim() || "Puzzle Solver",
  });
  state.phase = "play";
  state.puzzleId = id;
  state.puzzlePlayerTurnsRemaining = playerTurns;
  state.puzzleFailed = false;
  state.activeColor = "white";
  state.aiDifficulty = 10;
  state.aiColor = "black";
  state.players.white.gods = gods;
  state.players.white.orbs = { white: 10, black: 10 };
  state.players.white.graveyard = [];
  state.players.white.upgrades = {};
  const activeOpponentGod: GodId = gods.includes("ares") ? "artemis" : "ares";
  const restingOpponentGods = ([
    "chiron",
    "anubis",
    "salem",
    "medusa",
    "teles",
    "midas",
    "death",
    "leonidas",
    "quetzacoatl",
    "kangus",
  ] as GodId[]).filter((godId) => godId !== activeOpponentGod && !gods.includes(godId)).slice(0, 2);
  state.players.black.gods = playerTurns > 1
    ? [activeOpponentGod, ...restingOpponentGods]
    : ["ares", "chiron", "anubis"];
  state.players.black.orbs = { white: 10, black: 10 };
  state.players.black.graveyard = [];
  state.players.black.upgrades = {};
  state.draft.pickIndex = state.draft.order.length;
  state.draft.available = [];
  state.rested = playerTurns === 2 ? restingOpponentGods : [];
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
  state.winner = undefined;
  state.history = [`Puzzle: ${title}`];
  state.lastAction = undefined;
  state.notice = objective;
  return state;
};

const board = (...entries: Array<[Square, Piece]>) =>
  Object.fromEntries(entries) as Record<Square, Piece>;

const denseTwoTurnBoard = (
  omitted: Square[],
  ...entries: Array<[Square, Piece]>
) => {
  const result = board(...entries);
  const fillers: Array<[Square, Piece]> = [
    ["b1", piece("white-king", "king", "white")],
    ["a2", piece("white-pawn-a", "pawn", "white")],
    ["b2", piece("white-pawn-b", "pawn", "white")],
    ["c2", piece("white-pawn-c", "pawn", "white")],
    ["f2", piece("white-pawn-f", "pawn", "white")],
    ["g2", piece("white-pawn-g", "pawn", "white")],
    ["h2", piece("white-pawn-h", "pawn", "white")],
    ["a3", piece("white-knight-a", "knight", "white")],
    ["f3", piece("white-knight-f", "knight", "white")],
    ["a7", piece("black-response-pawn", "pawn", "black")],
    ["b7", piece("black-pawn-b", "pawn", "black", { movedThisTurn: true })],
    ["c7", piece("black-bishop-c", "bishop", "black", { movedThisTurn: true })],
    ["d7", piece("black-pawn-d", "pawn", "black", { movedThisTurn: true })],
    ["f7", piece("black-pawn-f", "pawn", "black", { movedThisTurn: true })],
    ["g7", piece("black-pawn-g", "pawn", "black", { movedThisTurn: true })],
    ["h7", piece("black-pawn-h", "pawn", "black", { movedThisTurn: true })],
    ["b8", piece("black-knight-b", "knight", "black", { movedThisTurn: true })],
    ["c8", piece("black-rook-c", "rook", "black", { movedThisTurn: true })],
    ["d8", piece("black-queen-d", "queen", "black", { movedThisTurn: true })],
  ];
  for (const [square, filler] of fillers) {
    if (!result[square] && !omitted.includes(square)) result[square] = filler;
  }
  return result;
};

const enableBestDefense = (state: GameState) => {
  for (const piece of Object.values(state.board)) {
    if (piece.controller === "black") delete piece.status.movedThisTurn;
  }
};

const deriveHardPuzzle = (
  source: (playerName?: string) => GameState,
  id: PuzzleId,
  title: string,
  gods: [GodId, GodId, GodId],
  playerName?: string,
) => {
  const sourceState = source(playerName);
  const state = preparePuzzle(
    id,
    title,
    "Capture the black King in three divine turns.",
    gods,
    playerName,
    3,
  );
  state.board = structuredClone(sourceState.board);
  state.players.white.graveyard = structuredClone(sourceState.players.white.graveyard);
  state.players.black.graveyard = structuredClone(sourceState.players.black.graveyard);
  state.players.black.orbs = { white: 0, black: 0 };
  return state;
};

const relocatePiece = (state: GameState, from: Square, to: Square) => {
  const current = state.board[from];
  if (!current) throw new Error(`Cannot relocate missing puzzle piece from ${from}.`);
  state.board[to] = current;
  delete state.board[from];
};

const forceOpeningReply = (state: GameState, replySquare: Square) => {
  for (const [square, current] of Object.entries(state.board)) {
    if (current.controller !== "black") continue;
    if (square === replySquare) delete current.status.movedThisTurn;
    else current.status.movedThisTurn = true;
  }
};

const reserveOpeningSource = (state: GameState, sourceSquare: Square) => {
  for (const [square, current] of Object.entries(state.board)) {
    if (current.controller !== "white") continue;
    if (square === sourceSquare) delete current.status.movedThisTurn;
    else current.status.movedThisTurn = true;
  }
};

const centaursLance = (playerName?: string) => {
  const state = preparePuzzle(
    "centaurs-lance",
    "The Centaur's Lance",
    "Capture the black King in one divine turn.",
    ["chiron", "teles", "midas"],
    playerName,
  );
  state.board = board(
    ["b1", piece("white-king", "king", "white")],
    ["a1", piece("white-rook", "rook", "white")],
    ["c3", piece("white-queen", "queen", "white")],
    ["e2", piece("white-knight", "knight", "white")],
    ["g2", piece("white-bishop", "bishop", "white")],
    ["a2", piece("white-pawn-a", "pawn", "white")],
    ["b2", piece("white-pawn-b", "pawn", "white")],
    ["f2", piece("white-pawn-f", "pawn", "white")],
    ["g3", piece("white-pawn-g", "pawn", "white")],
    ["e8", piece("black-king", "king", "black")],
    ["c7", piece("black-queen", "queen", "black")],
    ["h8", piece("black-rook", "rook", "black")],
    ["b7", piece("black-bishop", "bishop", "black")],
    ["g6", piece("black-knight", "knight", "black")],
    ["a7", piece("black-pawn-a", "pawn", "black")],
    ["d6", piece("black-pawn-d", "pawn", "black")],
    ["f7", piece("black-pawn-f", "pawn", "black")],
    ["h7", piece("black-pawn-h", "pawn", "black")],
  );
  return state;
};

const circleOfRage = (playerName?: string) => {
  const state = preparePuzzle(
    "circle-of-rage",
    "Circle of Rage",
    "Capture the black King in one divine turn.",
    ["kangus", "teles", "death"],
    playerName,
  );
  state.board = board(
    ["b1", piece("white-king", "king", "white")],
    ["a1", piece("white-rook", "rook", "white")],
    ["c4", piece("white-queen", "queen", "white")],
    ["g2", piece("white-bishop", "bishop", "white")],
    ["e7", piece("white-knight", "knight", "white")],
    ["a2", piece("white-pawn-a", "pawn", "white")],
    ["b2", piece("white-pawn-b", "pawn", "white")],
    ["c2", piece("white-pawn-c", "pawn", "white")],
    ["f3", piece("white-pawn-f", "pawn", "white")],
    ["g3", piece("white-pawn-g", "pawn", "white")],
    ["e8", piece("black-king", "king", "black")],
    ["d8", piece("black-rook", "rook", "black")],
    ["b6", piece("black-queen", "queen", "black")],
    ["c8", piece("black-bishop", "bishop", "black")],
    ["g6", piece("black-knight", "knight", "black")],
    ["a7", piece("black-pawn-a", "pawn", "black")],
    ["c6", piece("black-pawn-c", "pawn", "black")],
    ["d7", piece("black-pawn-d", "pawn", "black")],
    ["f8", piece("black-pawn-f", "pawn", "black")],
    ["h7", piece("black-pawn-h", "pawn", "black")],
  );
  return state;
};

const hiddenReserve = (playerName?: string) => {
  const state = preparePuzzle(
    "hidden-reserve",
    "Position Three",
    "Capture the black King in one divine turn.",
    ["death", "midas", "salem"],
    playerName,
  );
  state.board = board(
    ["b1", piece("white-king", "king", "white")],
    ["a1", piece("white-rook", "rook", "white")],
    ["d4", piece("white-bishop", "bishop", "white")],
    ["f3", piece("white-knight", "knight", "white")],
    ["a2", piece("white-pawn-a", "pawn", "white")],
    ["b2", piece("white-pawn-b", "pawn", "white")],
    ["c3", piece("white-pawn-c", "pawn", "white")],
    ["f2", piece("white-pawn-f", "pawn", "white")],
    ["g2", piece("white-pawn-g", "pawn", "white")],
    ["e4", piece("black-king", "king", "black")],
    ["c6", piece("black-queen", "queen", "black")],
    ["h8", piece("black-rook", "rook", "black")],
    ["g7", piece("black-bishop", "bishop", "black")],
    ["f6", piece("black-knight", "knight", "black")],
    ["a7", piece("black-pawn-a", "pawn", "black")],
    ["b6", piece("black-pawn-b", "pawn", "black")],
    ["d5", piece("black-pawn-d", "pawn", "black")],
    ["g6", piece("black-pawn-g", "pawn", "black")],
    ["h7", piece("black-pawn-h", "pawn", "black")],
  );
  state.players.white.upgrades = {
    resurrect: 3,
    barter: 2,
    "poison-cloud": 2,
  };
  state.players.white.graveyard = [{
    piece: piece("white-queen", "queen", "white"),
    capturedOnTurn: 0,
  }];
  return state;
};

const royalEscort = (playerName?: string) => {
  const state = preparePuzzle(
    "royal-escort",
    "The Royal Escort",
    "Capture the black King in one divine turn.",
    ["leonidas", "teles", "midas"],
    playerName,
  );
  state.board = board(
    ["c2", piece("white-king", "king", "white")],
    ["d2", piece("white-bishop", "bishop", "white")],
    ["a1", piece("white-rook", "rook", "white")],
    ["f4", piece("white-queen", "queen", "white")],
    ["b4", piece("white-knight", "knight", "white")],
    ["a2", piece("white-pawn-a", "pawn", "white")],
    ["b2", piece("white-pawn-b", "pawn", "white")],
    ["c3", piece("white-pawn-c", "pawn", "white")],
    ["g2", piece("white-pawn-g", "pawn", "white")],
    ["h2", piece("white-pawn-h", "pawn", "white")],
    ["e2", piece("black-king", "king", "black")],
    ["c6", piece("black-queen", "queen", "black")],
    ["h8", piece("black-rook", "rook", "black")],
    ["g7", piece("black-bishop", "bishop", "black")],
    ["f5", piece("black-knight", "knight", "black")],
    ["a7", piece("black-pawn-a", "pawn", "black")],
    ["b6", piece("black-pawn-b", "pawn", "black")],
    ["d5", piece("black-pawn-d", "pawn", "black")],
    ["g6", piece("black-pawn-g", "pawn", "black")],
    ["h7", piece("black-pawn-h", "pawn", "black")],
  );
  return state;
};

const serpentsDelivery = (playerName?: string) => {
  const state = preparePuzzle(
    "serpents-delivery",
    "The Serpent's Delivery",
    "Capture the black King in one divine turn.",
    ["quetzacoatl", "teles", "salem"],
    playerName,
  );
  state.board = board(
    ["h1", piece("white-king", "king", "white")],
    ["a1", piece("white-rook", "rook", "white")],
    ["b1", piece("white-pawn", "pawn", "white")],
    ["f3", piece("white-queen", "queen", "white")],
    ["g2", piece("white-bishop", "bishop", "white")],
    ["c3", piece("white-knight", "knight", "white")],
    ["a2", piece("white-pawn-a", "pawn", "white")],
    ["d2", piece("white-pawn-d", "pawn", "white")],
    ["e2", piece("white-pawn-e", "pawn", "white")],
    ["g3", piece("white-pawn-g", "pawn", "white")],
    ["h6", piece("black-pawn-h", "pawn", "black")],
    ["a5", piece("black-king", "king", "black")],
    ["e6", piece("black-queen", "queen", "black")],
    ["g8", piece("black-rook", "rook", "black")],
    ["c6", piece("black-bishop", "bishop", "black")],
    ["f6", piece("black-knight", "knight", "black")],
    ["b6", piece("black-pawn-b", "pawn", "black")],
    ["c5", piece("black-pawn-c", "pawn", "black")],
    ["d6", piece("black-pawn-d", "pawn", "black")],
    ["g7", piece("black-pawn-g", "pawn", "black")],
  );
  state.players.white.upgrades = {
    "air-strike": 2,
    resonance: 2,
    polymorph: 2,
  };
  return state;
};

const openedFile = (playerName?: string) => {
  const state = preparePuzzle(
    "opened-file",
    "Position Six",
    "Capture the black King in two divine turns.",
    ["teles", "chiron", "medusa"],
    playerName,
    2,
  );
  state.board = denseTwoTurnBoard(
    ["a1", "e2", "e6", "e8"],
    ["a1", piece("white-queen", "queen", "white")],
    ["e2", piece("white-charge-knight", "knight", "white")],
    ["e6", piece("black-lured-bishop", "bishop", "black")],
    ["e8", piece("black-king", "king", "black", { movedThisTurn: true })],
    ["a7", piece("black-response-pawn", "pawn", "black", { movedThisTurn: true })],
  );
  return state;
};

const borrowedBishop = (playerName?: string) => {
  const state = preparePuzzle(
    "borrowed-bishop",
    "Position Seven",
    "Capture the black King in two divine turns.",
    ["midas", "death", "salem"],
    playerName,
    2,
  );
  state.board = denseTwoTurnBoard(
    ["f6", "g6", "h7", "h8"],
    ["f6", piece("white-hiring-rook", "rook", "white")],
    ["h7", piece("black-bishop", "bishop", "black", { movedThisTurn: true })],
    ["h8", piece("black-king", "king", "black", { movedThisTurn: true })],
  );
  state.players.white.upgrades = {
    resurrect: 3,
    barter: 2,
    polymorph: 2,
  };
  state.players.white.graveyard = [{
    piece: piece("white-reserve-queen", "queen", "white"),
    capturedOnTurn: 0,
  }];
  return state;
};

const mountedFury = (playerName?: string) => {
  const state = preparePuzzle(
    "mounted-fury",
    "Position Eight",
    "Capture the black King in two divine turns.",
    ["chiron", "kangus", "midas"],
    playerName,
    2,
  );
  state.board = denseTwoTurnBoard(
    ["e7", "f7", "g7", "g8", "h7", "h8"],
    ["e7", piece("white-mount", "knight", "white")],
    ["f7", piece("white-rider", "rook", "white")],
    ["h8", piece("black-king", "king", "black", { movedThisTurn: true })],
  );
  return state;
};

const risingMonument = (playerName?: string) => {
  const state = preparePuzzle(
    "rising-monument",
    "Position Nine",
    "Capture the black King in two divine turns.",
    ["anubis", "quetzacoatl", "teles"],
    playerName,
    2,
  );
  state.board = board(
    ["b1", piece("white-king", "king", "white")],
    ["d1", piece("white-queen", "queen", "white")],
    ["a1", piece("white-rook-a", "rook", "white")],
    ["h1", piece("white-rook-h", "rook", "white")],
    ["c2", piece("white-bishop-c", "bishop", "white")],
    ["h3", piece("white-bishop-h", "bishop", "white")],
    ["a3", piece("white-knight", "knight", "white")],
    ["g6", piece("white-escape-guard", "knight", "white")],
    ["a2", piece("white-pawn-a", "pawn", "white")],
    ["b2", piece("white-pawn-b", "pawn", "white")],
    ["c3", piece("white-pawn-c", "pawn", "white")],
    ["d3", piece("white-monument-pawn-d", "pawn", "white")],
    ["e2", piece("white-monument-pawn-e", "pawn", "white")],
    ["f2", piece("white-monument-pawn-f", "pawn", "white")],
    ["f5", piece("white-air-strike-screen", "pawn", "white")],
    ["g2", piece("white-passenger", "pawn", "white")],
    ["h2", piece("white-pawn-h", "pawn", "white")],
    ["f7", piece("black-king", "king", "black")],
    ["b8", piece("black-queen", "queen", "black")],
    ["a8", piece("black-rook-a", "rook", "black")],
    ["g8", piece("black-pawn-g8", "pawn", "black")],
    ["c8", piece("black-bishop", "bishop", "black")],
    ["e8", piece("black-knight-e", "knight", "black")],
    ["b7", piece("black-pawn-b", "pawn", "black")],
    ["c7", piece("black-pawn-c", "pawn", "black")],
    ["d7", piece("black-pawn-d", "pawn", "black")],
    ["e7", piece("black-pawn-e", "pawn", "black")],
    ["g7", piece("black-pawn-g", "pawn", "black")],
  );
  state.players.white.upgrades = {
    "air-strike": 2,
    construction: 2,
    resonance: 2,
    harden: 2,
    lure: 2,
  };
  enableBestDefense(state);
  return state;
};

const turncoatCharge = (playerName?: string) => {
  const state = preparePuzzle(
    "turncoat-charge",
    "Position Ten",
    "Capture the black King in two divine turns.",
    ["midas", "chiron", "salem"],
    playerName,
    2,
  );
  state.board = board(
    ["b1", piece("white-king", "king", "white")],
    ["d1", piece("white-queen", "queen", "white")],
    ["a1", piece("white-rook-a", "rook", "white")],
    ["h1", piece("white-rook-h", "rook", "white")],
    ["c3", piece("white-recruiter", "bishop", "white")],
    ["b4", piece("white-guard-bishop", "bishop", "white")],
    ["a3", piece("white-knight", "knight", "white")],
    ["a2", piece("white-pawn-a", "pawn", "white")],
    ["b2", piece("white-pawn-b", "pawn", "white")],
    ["c2", piece("white-pawn-c", "pawn", "white")],
    ["d2", piece("white-pawn-d", "pawn", "white")],
    ["f2", piece("white-pawn-f", "pawn", "white")],
    ["g2", piece("white-pawn-g", "pawn", "white")],
    ["h2", piece("white-pawn-h", "pawn", "white")],
    ["e4", piece("black-turncoat", "knight", "black", { movedThisTurn: true })],
    ["e8", piece("black-king", "king", "black")],
    ["d8", piece("black-rook-d", "rook", "black")],
    ["f8", piece("black-rook-f", "rook", "black")],
    ["b8", piece("black-queen", "queen", "black")],
    ["a7", piece("black-pawn-a", "pawn", "black")],
    ["b7", piece("black-pawn-b", "pawn", "black")],
    ["c7", piece("black-pawn-c", "pawn", "black")],
    ["d7", piece("black-pawn-d", "pawn", "black")],
    ["f6", piece("black-pawn-f6", "pawn", "black")],
    ["f7", piece("black-pawn-f", "pawn", "black")],
    ["g7", piece("black-pawn-g", "pawn", "black")],
    ["h7", piece("black-pawn-h", "pawn", "black")],
  );
  state.players.white.upgrades = {
    leverage: 2,
    gallop: 2,
    polymorph: 2,
  };
  enableBestDefense(state);
  return state;
};

const fundedFlight = (playerName?: string) => {
  const state = preparePuzzle(
    "funded-flight",
    "Position Eleven",
    "Capture the black King in two divine turns.",
    ["midas", "quetzacoatl", "anubis"],
    playerName,
    2,
  );
  state.board = board(
    ["b1", piece("white-king", "king", "white")],
    ["a7", piece("white-carrier", "rook", "white")],
    ["f1", piece("white-rook-f", "rook", "white")],
    ["e4", piece("white-recruiter", "bishop", "white")],
    ["b4", piece("white-escape-guard", "bishop", "white")],
    ["a3", piece("white-knight", "knight", "white")],
    ["a2", piece("white-pawn-a", "pawn", "white")],
    ["b2", piece("white-pawn-b", "pawn", "white")],
    ["c2", piece("white-pawn-c", "pawn", "white")],
    ["d2", piece("white-pawn-d", "pawn", "white")],
    ["e2", piece("white-pawn-e", "pawn", "white")],
    ["f2", piece("white-pawn-f", "pawn", "white")],
    ["g2", piece("white-pawn-g", "pawn", "white")],
    ["h2", piece("white-pawn-h", "pawn", "white")],
    ["b7", piece("black-passenger", "bishop", "black")],
    ["f7", piece("black-king", "king", "black")],
    ["f8", piece("black-rook-f", "rook", "black")],
    ["g8", piece("black-rook-g", "rook", "black")],
    ["e6", piece("black-pawn-e", "pawn", "black")],
    ["f5", piece("black-pawn-f5", "pawn", "black")],
    ["f6", piece("black-pawn-f", "pawn", "black")],
    ["g6", piece("black-pawn-g6", "pawn", "black")],
    ["g7", piece("black-pawn-g7", "pawn", "black")],
    ["a6", piece("black-pawn-a", "pawn", "black")],
    ["b6", piece("black-pawn-b", "pawn", "black")],
    ["h6", piece("black-pawn-h", "pawn", "black")],
  );
  state.players.white.upgrades = {
    "air-strike": 3,
    barter: 3,
    construction: 2,
    leverage: 2,
    "poison-cloud": 2,
  };
  enableBestDefense(state);
  return state;
};

const clearedLane = (playerName?: string) => {
  const state = preparePuzzle(
    "cleared-lane",
    "Position Twelve",
    "Capture the black King in two divine turns.",
    ["death", "chiron", "teles"],
    playerName,
    2,
  );
  state.board = board(
    ["b1", piece("white-king", "king", "white")],
    ["d1", piece("white-queen", "queen", "white")],
    ["a1", piece("white-rook-a", "rook", "white")],
    ["h1", piece("white-rook-h", "rook", "white")],
    ["h4", piece("white-guard-bishop", "bishop", "white")],
    ["a3", piece("white-knight-a", "knight", "white")],
    ["e2", piece("white-charge-knight", "knight", "white")],
    ["e4", piece("white-doomed-bishop", "bishop", "white")],
    ["a2", piece("white-pawn-a", "pawn", "white")],
    ["b2", piece("white-pawn-b", "pawn", "white")],
    ["c2", piece("white-pawn-c", "pawn", "white")],
    ["d2", piece("white-pawn-d", "pawn", "white")],
    ["f2", piece("white-pawn-f", "pawn", "white")],
    ["g2", piece("white-pawn-g", "pawn", "white")],
    ["h2", piece("white-pawn-h", "pawn", "white")],
    ["e8", piece("black-king", "king", "black")],
    ["d8", piece("black-rook-d", "rook", "black")],
    ["f8", piece("black-rook-f", "rook", "black")],
    ["b8", piece("black-queen", "queen", "black")],
    ["a7", piece("black-pawn-a", "pawn", "black")],
    ["b7", piece("black-pawn-b", "pawn", "black")],
    ["c7", piece("black-pawn-c", "pawn", "black")],
    ["d7", piece("black-pawn-d", "pawn", "black")],
    ["f7", piece("black-pawn-f", "pawn", "black")],
    ["g7", piece("black-pawn-g", "pawn", "black")],
    ["h7", piece("black-pawn-h", "pawn", "black")],
  );
  state.players.white.upgrades = {
    marked: 3,
    gallop: 2,
    resonance: 2,
    lure: 2,
    "royal-step": 2,
  };
  state.players.white.orbs.black = 0;
  enableBestDefense(state);
  return state;
};

const royalLanding = (playerName?: string) => {
  const state = preparePuzzle(
    "royal-landing",
    "Position Thirteen",
    "Capture the black King in two divine turns.",
    ["quetzacoatl", "leonidas", "midas"],
    playerName,
    2,
  );
  state.board = board(
    ["b1", piece("white-king", "king", "white")],
    ["d1", piece("white-queen", "queen", "white")],
    ["a1", piece("white-rook-a", "rook", "white")],
    ["f6", piece("white-escort", "rook", "white")],
    ["c1", piece("white-bishop-c", "bishop", "white")],
    ["f1", piece("white-bishop-f", "bishop", "white")],
    ["a3", piece("white-knight-a", "knight", "white")],
    ["f3", piece("white-knight-f", "knight", "white")],
    ["a2", piece("white-pawn-a", "pawn", "white")],
    ["b2", piece("white-pawn-b", "pawn", "white")],
    ["c2", piece("white-pawn-c", "pawn", "white")],
    ["d2", piece("white-pawn-d", "pawn", "white")],
    ["e2", piece("white-pawn-e", "pawn", "white")],
    ["f2", piece("white-pawn-f", "pawn", "white")],
    ["g2", piece("white-pawn-g", "pawn", "white")],
    ["h2", piece("white-pawn-h", "pawn", "white")],
    ["g7", piece("black-king", "king", "black")],
    ["g8", piece("black-rook-g", "rook", "black")],
    ["h8", piece("black-bishop-h", "bishop", "black")],
    ["b8", piece("black-queen", "queen", "black")],
    ["f8", piece("black-bishop-f", "bishop", "black")],
    ["d7", piece("black-rook-d", "rook", "black")],
    ["a7", piece("black-pawn-a", "pawn", "black")],
    ["b7", piece("black-pawn-b", "pawn", "black")],
    ["c7", piece("black-pawn-c", "pawn", "black")],
    ["h7", piece("black-pawn-h", "pawn", "black")],
  );
  state.players.white.upgrades = {
    "air-lift": 3,
    "royal-step": 2,
    barter: 2,
    "march-home": 2,
    leverage: 2,
  };
  enableBestDefense(state);
  for (const square of ["b8", "d7", "f8"]) {
    state.board[square].status.movedThisTurn = true;
  }
  return state;
};

const skywardCharge = (playerName?: string) => {
  const state = preparePuzzle(
    "skyward-charge",
    "Position Fourteen",
    "Capture the black King in two divine turns.",
    ["quetzacoatl", "kangus", "medusa"],
    playerName,
    2,
  );
  state.board = board(
    ["b1", piece("white-king", "king", "white")],
    ["d1", piece("white-queen", "queen", "white")],
    ["g3", piece("white-slithering-rook", "rook", "white")],
    ["f1", piece("white-bishop-f", "bishop", "white")],
    ["f3", piece("white-knight-f", "knight", "white")],
    ["h6", piece("white-guard-pawn", "pawn", "white")],
    ["a2", piece("white-pawn-a", "pawn", "white")],
    ["b2", piece("white-pawn-b", "pawn", "white")],
    ["c2", piece("white-pawn-c", "pawn", "white")],
    ["d2", piece("white-pawn-d", "pawn", "white")],
    ["e2", piece("white-pawn-e", "pawn", "white")],
    ["f2", piece("white-pawn-f", "pawn", "white")],
    ["h2", piece("white-pawn-h", "pawn", "white")],
    ["h8", piece("black-king", "king", "black")],
    ["a8", piece("black-rook-a", "rook", "black")],
    ["d8", piece("black-rook-d", "rook", "black")],
    ["c8", piece("black-bishop", "bishop", "black")],
    ["c6", piece("black-pawn-c", "pawn", "black")],
  );
  state.players.white.upgrades = {
    flight: 2,
    rage: 2,
    captivate: 2,
    "stone-gaze": 2,
  };
  state.players.white.orbs.black = 1;
  enableBestDefense(state);
  return state;
};

const provokedFury = (playerName?: string) => {
  const state = preparePuzzle(
    "provoked-fury",
    "Position Fifteen",
    "Capture the black King in two divine turns.",
    ["ares", "chiron", "salem"],
    playerName,
    2,
  );
  state.board = board(
    ["b1", piece("white-king", "king", "white")],
    ["h3", piece("white-queen", "queen", "white")],
    ["a7", piece("white-rook-a", "rook", "white")],
    ["h1", piece("white-rook-h", "rook", "white")],
    ["e6", piece("white-pin-bishop", "bishop", "white")],
    ["c3", piece("white-guard-bishop", "bishop", "white")],
    ["e5", piece("white-provoked-knight", "knight", "white")],
    ["a2", piece("white-pawn-a", "pawn", "white")],
    ["b2", piece("white-pawn-b", "pawn", "white")],
    ["c2", piece("white-pawn-c", "pawn", "white")],
    ["d2", piece("white-pawn-d", "pawn", "white")],
    ["e2", piece("white-pawn-e", "pawn", "white")],
    ["f2", piece("white-pawn-f", "pawn", "white")],
    ["g2", piece("white-pawn-g", "pawn", "white")],
    ["h2", piece("white-pawn-h", "pawn", "white")],
    ["h4", piece("white-queen-screen", "pawn", "white")],
    ["f7", piece("black-provoker", "bishop", "black")],
    ["g8", piece("black-king", "king", "black")],
    ["h8", piece("black-rook", "rook", "black")],
    ["d8", piece("black-queen", "queen", "black")],
    ["c8", piece("black-bishop-c", "bishop", "black")],
    ["b8", piece("black-knight-b", "knight", "black")],
    ["a8", piece("black-rook-a", "rook", "black")],
    ["b7", piece("black-pawn-b", "pawn", "black")],
    ["c7", piece("black-pawn-c", "pawn", "black")],
    ["d7", piece("black-pawn-d", "pawn", "black")],
    ["e7", piece("black-pawn-e", "pawn", "black")],
    ["h7", piece("black-knight-h7", "knight", "black")],
  );
  state.players.white.upgrades = {
    "pick-a-fight": 2,
    gallop: 2,
    hex: 2,
    "poison-cloud": 2,
  };
  enableBestDefense(state);
  return state;
};

const queensCompass = (playerName?: string) => {
  const state = preparePuzzle(
    "queens-compass",
    "Position Sixteen",
    "Capture the black King in three divine turns.",
    ["medusa", "teles", "chiron"],
    playerName,
    3,
  );
  state.board = board(
    ["g1", piece("white-king", "king", "white")],
    ["e2", piece("white-charge-knight", "knight", "white")],
    ["c4", piece("white-enchant-blocker-knight", "knight", "white")],
    ["h2", piece("white-captivate-pawn", "pawn", "white")],
    ["c6", piece("white-cage-pawn-c6", "pawn", "white")],
    ["d6", piece("white-cage-pawn-d6", "pawn", "white")],
    ["g6", piece("white-cage-pawn-g6", "pawn", "white")],
    ["c7", piece("white-cage-pawn-c7", "pawn", "white")],
    ["g7", piece("white-cage-pawn-g7", "pawn", "white")],
    ["e8", piece("black-king", "king", "black")],
    ["e6", piece("black-enchanted-pawn", "pawn", "black")],
    ["a7", piece("black-response-pawn", "pawn", "black")],
  );
  state.players.black.gods = ["ares", "chiron", "midas"];
  state.players.black.orbs = { white: 0, black: 0 };
  state.players.white.orbs.black = 8;
  state.players.white.upgrades = {
    captivate: 3,
    slither: 2,
    "stone-gaze": 2,
    resonance: 2,
    lure: 2,
    enchant: 3,
    gallop: 2,
    mount: 2,
  };
  reserveOpeningSource(state, "h2");
  forceOpeningReply(state, "a7");
  return state;
};

const hexedReserve = (playerName?: string) => {
  const state = deriveHardPuzzle(
    borrowedBishop,
    "hexed-reserve",
    "Position Seventeen",
    ["salem", "midas", "death"],
    playerName,
  );
  state.board = board(
    ["c1", piece("white-king", "king", "white")],
    ["f6", piece("white-hiring-rook", "rook", "white")],
    ["e7", piece("white-recruiter-knight", "knight", "white")],
    ["f7", piece("white-cage-pawn-f7", "pawn", "white")],
    ["g6", piece("white-cage-pawn-g6", "pawn", "white")],
    ["b7", piece("black-response-pawn", "pawn", "black")],
    ["b8", piece("black-hex-pawn-b8", "pawn", "black")],
    ["d8", piece("black-hex-pawn-d8", "pawn", "black")],
    ["h7", piece("black-bishop", "bishop", "black")],
    ["h8", piece("black-king", "king", "black")],
  );
  state.players.white.graveyard = [{
    piece: piece("white-reserve-queen", "queen", "white"),
    capturedOnTurn: 0,
  }];
  forceOpeningReply(state, "b7");
  state.players.white.orbs.black = 1;
  state.players.white.upgrades = {
    hex: 3,
    "poison-cloud": 2,
    polymorph: 2,
    barter: 2,
    "military-funding": 2,
    leverage: 2,
    marked: 2,
    resurrect: 3,
    siphon: 2,
  };
  reserveOpeningSource(state, "f6");
  return state;
};

const goldenFuse = (playerName?: string) => {
  const state = deriveHardPuzzle(
    mountedFury,
    "golden-fuse",
    "Position Eighteen",
    ["midas", "chiron", "kangus"],
    playerName,
  );
  state.board = board(
    ["a1", piece("white-king", "king", "white")],
    ["g6", piece("white-cage-rook", "rook", "white")],
    ["e7", piece("white-mount", "knight", "white")],
    ["f5", piece("white-cage-bishop", "bishop", "white")],
    ["c8", piece("white-mount-blocker-bishop", "bishop", "white")],
    ["f7", piece("white-rider", "rook", "white")],
    ["c2", piece("white-barter-pawn", "pawn", "white")],
    ["a4", piece("black-response-pawn", "pawn", "black")],
    ["b4", piece("black-barter-pawn", "pawn", "black")],
    ["f8", piece("black-rider-blocker-rook", "rook", "black")],
    ["h8", piece("black-king", "king", "black")],
  );
  state.players.white.orbs.black = 0;
  state.players.white.upgrades = {
    barter: 3,
    "military-funding": 2,
    leverage: 2,
    gallop: 2,
    mount: 2,
    charge: 2,
    "ritual-sacrifice": 2,
    "banana-peel": 2,
    rage: 1,
  };
  state.players.black.orbs.black = 3;
  reserveOpeningSource(state, "c2");
  forceOpeningReply(state, "a4");
  return state;
};

const resonantFoundation = (playerName?: string) => {
  const state = deriveHardPuzzle(
    risingMonument,
    "resonant-foundation",
    "Position Nineteen",
    ["teles", "anubis", "quetzacoatl"],
    playerName,
  );
  state.board = board(
    ["e1", piece("white-king", "king", "white")],
    ["a2", piece("white-resonance-queen", "queen", "white")],
    ["a1", piece("white-queen-blocker-a1", "knight", "white")],
    ["b1", piece("white-queen-blocker-b1", "pawn", "white")],
    ["b2", piece("white-queen-blocker-b2", "pawn", "white")],
    ["b3", piece("white-queen-blocker-b3", "pawn", "white")],
    ["g1", piece("white-rook-blocker-g1", "pawn", "white")],
    ["h1", piece("white-cage-rook", "rook", "white")],
    ["h2", piece("white-rook-blocker-h2", "pawn", "white")],
    ["h8", piece("white-construction-knight", "knight", "white")],
    ["a8", piece("white-carrier", "rook", "white")],
    ["b8", piece("white-passenger", "bishop", "white")],
    ["e6", piece("white-cage-pawn-e6", "pawn", "white")],
    ["f6", piece("white-cage-pawn-f6", "pawn", "white")],
    ["f5", piece("white-cage-bishop", "bishop", "white")],
    ["e7", piece("white-cage-pawn-e7", "pawn", "white")],
    ["a4", piece("black-resonance-pawn-a", "pawn", "black")],
    ["b4", piece("black-resonance-pawn-b", "pawn", "black")],
    ["h4", piece("black-response-pawn", "pawn", "black")],
    ["g8", piece("black-king", "king", "black")],
  );
  state.players.white.orbs.black = 1;
  state.players.white.upgrades = {
    resonance: 3,
    lure: 2,
    enchant: 2,
    construction: 3,
    harden: 2,
    flight: 2,
    "air-lift": 2,
    "air-strike": 3,
  };
  reserveOpeningSource(state, "a2");
  forceOpeningReply(state, "h4");
  return state;
};

const threatenedTurncoat = (playerName?: string) => {
  const state = deriveHardPuzzle(
    turncoatCharge,
    "threatened-turncoat",
    "Position Twenty",
    ["ares", "midas", "chiron"],
    playerName,
  );
  state.board = board(
    ["a1", piece("white-king", "king", "white")],
    ["c3", piece("white-recruiter", "bishop", "white")],
    ["h2", piece("white-threat-pawn", "pawn", "white")],
    ["c6", piece("white-cage-pawn-c6", "pawn", "white")],
    ["d6", piece("white-cage-pawn-d6", "pawn", "white")],
    ["f6", piece("white-cage-pawn-f6", "pawn", "white")],
    ["g6", piece("white-cage-pawn-g6", "pawn", "white")],
    ["c7", piece("white-cage-pawn-c7", "pawn", "white")],
    ["g7", piece("white-cage-pawn-g7", "pawn", "white")],
    ["e4", piece("black-turncoat", "knight", "black")],
    ["g4", piece("black-response-pawn", "pawn", "black")],
    ["e8", piece("black-king", "king", "black")],
  );
  state.players.white.orbs.black = 7;
  state.players.white.upgrades = {
    threaten: 3,
    "pick-a-fight": 2,
    "cull-the-weak": 2,
    barter: 2,
    "military-funding": 2,
    leverage: 2,
    gallop: 2,
    mount: 2,
    charge: 2,
  };
  reserveOpeningSource(state, "h2");
  forceOpeningReply(state, "g4");
  return state;
};

const architectsBargain = (playerName?: string) => {
  const state = deriveHardPuzzle(
    fundedFlight,
    "architects-bargain",
    "Position Twenty-One",
    ["anubis", "midas", "quetzacoatl"],
    playerName,
  );
  state.board = board(
    ["b1", piece("white-king", "king", "white")],
    ["f1", piece("white-construction-rook", "rook", "white")],
    ["h1", piece("white-cage-rook", "rook", "white")],
    ["d4", piece("white-recruiter", "knight", "white")],
    ["f6", piece("white-cage-bishop-f6", "bishop", "white")],
    ["f8", piece("white-pinned-blocker", "bishop", "white")],
    ["e1", piece("white-construction-blocker-e1", "pawn", "white")],
    ["f2", piece("white-construction-blocker-f2", "pawn", "white")],
    ["e6", piece("white-cage-pawn-e6", "pawn", "white")],
    ["g6", piece("white-cage-pawn", "pawn", "white")],
    ["b8", piece("white-carrier", "queen", "white")],
    ["c7", piece("black-passenger", "knight", "black")],
    ["a7", piece("black-response-pawn", "pawn", "black")],
    ["g8", piece("black-king", "king", "black")],
  );
  state.players.white.orbs.black = 5;
  state.players.white.upgrades = {
    construction: 3,
    harden: 2,
    monument: 2,
    barter: 2,
    "military-funding": 2,
    leverage: 2,
    flight: 2,
    "air-lift": 2,
    "air-strike": 3,
  };
  reserveOpeningSource(state, "f1");
  forceOpeningReply(state, "a7");
  return state;
};

const sungExecution = (playerName?: string) => {
  const state = deriveHardPuzzle(
    clearedLane,
    "sung-execution",
    "Position Twenty-Two",
    ["teles", "death", "chiron"],
    playerName,
  );
  state.board = board(
    ["a1", piece("white-king", "king", "white")],
    ["e2", piece("white-charge-knight", "knight", "white")],
    ["e4", piece("white-doomed-bishop", "bishop", "white")],
    ["c2", piece("white-resonance-pawn", "pawn", "white")],
    ["d3", piece("white-mark-blocker-rook", "rook", "white")],
    ["d5", piece("white-mark-blocker-queen", "queen", "white")],
    ["f3", piece("white-mark-blocker-pawn", "pawn", "white")],
    ["c6", piece("white-cage-pawn-c6", "pawn", "white")],
    ["d6", piece("white-cage-pawn-d6", "pawn", "white")],
    ["f6", piece("white-cage-pawn-f6", "pawn", "white")],
    ["g6", piece("white-cage-pawn-g6", "pawn", "white")],
    ["c7", piece("white-cage-pawn-c7", "pawn", "white")],
    ["g7", piece("white-cage-pawn-g7", "pawn", "white")],
    ["b3", piece("black-resonance-pawn-b3", "pawn", "black")],
    ["b4", piece("black-resonance-pawn-b4", "pawn", "black")],
    ["c4", piece("black-resonance-pawn-c4", "pawn", "black")],
    ["d4", piece("black-resonance-pawn-d4", "pawn", "black")],
    ["h7", piece("black-response-pawn", "pawn", "black")],
    ["e8", piece("black-king", "king", "black")],
  );
  state.players.white.orbs.black = 0;
  state.players.white.upgrades = {
    resonance: 3,
    lure: 2,
    enchant: 2,
    resurrect: 3,
    siphon: 2,
    gallop: 2,
    mount: 2,
    charge: 2,
  };
  reserveOpeningSource(state, "c2");
  forceOpeningReply(state, "h7");
  return state;
};

const openedThrone = (playerName?: string) => {
  const state = deriveHardPuzzle(
    royalLanding,
    "opened-throne",
    "Position Twenty-Three",
    ["anubis", "quetzacoatl", "leonidas"],
    playerName,
  );
  state.board = board(
    ["b1", piece("white-king", "king", "white")],
    ["e5", piece("white-construction-queen", "queen", "white")],
    ["f6", piece("white-escort", "rook", "white")],
    ["a8", piece("white-cage-rook", "rook", "white")],
    ["e7", piece("white-cage-knight-e7", "knight", "white")],
    ["d5", piece("white-rook-blocker-d5", "pawn", "white")],
    ["d4", piece("white-queen-blocker-d4", "pawn", "white")],
    ["d6", piece("white-queen-blocker-d6", "pawn", "white")],
    ["e4", piece("white-rook-blocker-e4", "pawn", "white")],
    ["f4", piece("white-cage-bishop-f4", "bishop", "white")],
    ["f5", piece("white-cage-bishop", "bishop", "white")],
    ["g6", piece("white-cage-pawn-g6", "pawn", "white")],
    ["a7", piece("black-response-pawn", "pawn", "black")],
    ["g7", piece("black-king", "king", "black")],
  );
  state.players.white.upgrades = {
    construction: 2,
    harden: 3,
    monument: 2,
    flight: 2,
    "air-lift": 3,
    "air-strike": 2,
    "royal-step": 2,
    "march-home": 2,
  };
  state.players.white.orbs.black = 0;
  reserveOpeningSource(state, "e5");
  forceOpeningReply(state, "a7");
  return state;
};

const pinnedSerpent = (playerName?: string) => {
  const state = deriveHardPuzzle(
    skywardCharge,
    "pinned-serpent",
    "Position Twenty-Four",
    ["medusa", "quetzacoatl", "kangus"],
    playerName,
  );
  state.board = board(
    ["h3", piece("white-king", "king", "white")],
    ["a5", piece("white-queen", "queen", "white")],
    ["g3", piece("white-slithering-rook", "rook", "white")],
    ["a4", piece("white-captivate-blocker-a4", "pawn", "white")],
    ["a6", piece("white-captivate-blocker-a6", "pawn", "white")],
    ["b4", piece("white-captivate-blocker-b4", "pawn", "white")],
    ["b5", piece("white-captivate-blocker-b5", "pawn", "white")],
    ["f5", piece("white-cage-bishop-f5", "bishop", "white")],
    ["f6", piece("white-cage-pawn-f6", "pawn", "white")],
    ["f7", piece("white-cage-pawn-f7", "pawn", "white")],
    ["b6", piece("black-captivate-rook", "rook", "black")],
    ["a7", piece("black-pawn-blocker-a7", "pawn", "black")],
    ["c8", piece("black-response-knight", "knight", "black")],
    ["d6", piece("black-queen", "queen", "black")],
    ["f8", piece("black-pawn-blocker-rook", "rook", "black")],
    ["h8", piece("black-king", "king", "black")],
  );
  state.players.white.orbs = { white: 0, black: 0 };
  state.players.white.upgrades = {
    captivate: 3,
    slither: 2,
    "stone-gaze": 2,
    flight: 1,
    "air-lift": 2,
    "air-strike": 2,
    "ritual-sacrifice": 2,
    "banana-peel": 2,
    rage: 1,
  };
  reserveOpeningSource(state, "a5");
  forceOpeningReply(state, "c8");
  return state;
};

const hexedProvocation = (playerName?: string) => {
  const state = deriveHardPuzzle(
    provokedFury,
    "hexed-provocation",
    "Position Twenty-Five",
    ["salem", "ares", "chiron"],
    playerName,
  );
  state.board = board(
    ["h1", piece("white-king", "king", "white")],
    ["b7", piece("white-rook-a", "rook", "white")],
    ["e5", piece("white-pin-bishop", "bishop", "white")],
    ["f5", piece("white-provoked-knight", "knight", "white")],
    ["f7", piece("white-cage-pawn-f7", "pawn", "white")],
    ["g6", piece("white-cage-pawn-g6", "pawn", "white")],
    ["a7", piece("black-response-pawn", "pawn", "black")],
    ["b8", piece("black-hex-knight", "knight", "black")],
    ["d8", piece("black-queen", "queen", "black")],
    ["f8", piece("black-rook", "rook", "black")],
    ["g7", piece("black-provoker", "bishop", "black")],
    ["h8", piece("black-king", "king", "black")],
  );
  state.players.white.orbs = { white: 2, black: 0 };
  state.players.white.upgrades = {
    hex: 3,
    "poison-cloud": 2,
    polymorph: 2,
    threaten: 3,
    "pick-a-fight": 2,
    "cull-the-weak": 2,
    gallop: 2,
    mount: 2,
    charge: 2,
  };
  reserveOpeningSource(state, "b7");
  forceOpeningReply(state, "a7");
  return state;
};

export const PUZZLES: PuzzleDefinition[] = [
  {
    id: "centaurs-lance",
    title: "Position One",
    difficulty: "easy",
    objective: "Capture the black King in one divine turn.",
    hint: "A knight does not always have to move like a knight.",
    solutionSummary: "Use Chiron's Charge to send the knight from e2 to e8 like a rook.",
    playerTurns: 1,
    solutionTurns: [[
        { type: "select-god", godId: "chiron" },
        { type: "select-ability", abilityId: "charge" },
        { type: "square", square: "e2" },
        { type: "square", square: "e8" },
    ]],
    createState: centaursLance,
  },
  {
    id: "circle-of-rage",
    title: "Position Two",
    difficulty: "easy",
    objective: "Capture the black King in one divine turn.",
    hint: "The knight does not need to move to destroy everything surrounding it.",
    solutionSummary: "Use Kangus Kong's Rage on the knight at e7 to engulf the King at e8.",
    playerTurns: 1,
    solutionTurns: [[
      { type: "select-god", godId: "kangus" },
      { type: "select-ability", abilityId: "rage" },
      { type: "square", square: "e7" },
    ]],
    createState: circleOfRage,
  },
  {
    id: "hidden-reserve",
    title: "Position Three",
    difficulty: "easy",
    objective: "Capture the black King in one divine turn.",
    hint: "One of your strongest pieces is not currently on the board. A fully upgraded ability can return it to an occupied square.",
    solutionSummary: "Use Death's level 3 Resurrect to revive the Queen from the graveyard directly onto the King at e4.",
    playerTurns: 1,
    solutionTurns: [[
      { type: "select-god", godId: "death" },
      { type: "select-ability", abilityId: "resurrect" },
      { type: "grave", pieceId: "white-queen" },
      { type: "square", square: "e4" },
    ]],
    createState: hiddenReserve,
  },
  {
    id: "royal-escort",
    title: "Position Four",
    difficulty: "easy",
    objective: "Capture the black King in one divine turn.",
    hint: "Move the King so that his companion, not the King, lands on e2.",
    solutionSummary: "Escort the bishop beside the King, then move the King from c2 to d2 so the bishop lands on e2.",
    playerTurns: 1,
    solutionTurns: [[
      { type: "select-god", godId: "leonidas" },
      { type: "select-ability", abilityId: "escort" },
      { type: "square", square: "c2" },
      { type: "square", square: "d2" },
      { type: "square", square: "d2" },
    ]],
    createState: royalEscort,
  },
  {
    id: "serpents-delivery",
    title: "Position Five",
    difficulty: "easy",
    objective: "Capture the black King in one divine turn.",
    hint: "The rook can carry the pawn over the blocked a-file. At level 2, the passenger may land on the first enemy flown over.",
    solutionSummary: "Use level 2 Air Strike with the rook on a1, carry the pawn from b1, land on a8, and drop the pawn onto the first enemy flown over at a5.",
    playerTurns: 1,
    solutionTurns: [[
      { type: "select-god", godId: "quetzacoatl" },
      { type: "select-ability", abilityId: "air-strike" },
      { type: "square", square: "a1" },
      { type: "square", square: "b1" },
      { type: "square", square: "a8" },
      { type: "square", square: "a5" },
    ]],
    createState: serpentsDelivery,
  },
  {
    id: "opened-file",
    title: "Position Six",
    difficulty: "medium",
    objective: "Capture the black King in two divine turns.",
    hint: "The piece blocking the e-file can be compelled to move before the knight charges.",
    solutionSummary: "Lure the bishop on e6 toward the white Queen, then use Chiron's Charge from e2 to e8.",
    playerTurns: 2,
    solutionTurns: [
      [
        { type: "select-god", godId: "teles" },
        { type: "select-ability", abilityId: "lure" },
        { type: "square", square: "e6" },
      ],
      [
        { type: "select-god", godId: "chiron" },
        { type: "select-ability", abilityId: "charge" },
        { type: "square", square: "e2" },
        { type: "square", square: "e8" },
      ],
    ],
    createState: openedFile,
  },
  {
    id: "borrowed-bishop",
    title: "Position Seven",
    difficulty: "medium",
    objective: "Capture the black King in two divine turns.",
    hint: "A Bishop does not have to begin the puzzle under your control to anchor a resurrection.",
    solutionSummary: "Hire the bishop on h7 with Leverage, then use level 3 Resurrect to return the Queen onto h8.",
    playerTurns: 2,
    solutionTurns: [
      [
        { type: "select-god", godId: "midas" },
        { type: "select-ability", abilityId: "leverage" },
        { type: "square", square: "f6" },
        { type: "square", square: "g6" },
        { type: "square", square: "h7" },
      ],
      [
        { type: "select-god", godId: "death" },
        { type: "select-ability", abilityId: "resurrect" },
        { type: "grave", pieceId: "white-reserve-queen" },
        { type: "square", square: "h8" },
      ],
    ],
    createState: borrowedBishop,
  },
  {
    id: "mounted-fury",
    title: "Position Eight",
    difficulty: "medium",
    objective: "Capture the black King in two divine turns.",
    hint: "The knight can carry another piece into a square where destruction reaches the King.",
    solutionSummary: "Mount the rook from f7, dismount it on g7, then use Rage to engulf the King on h8.",
    playerTurns: 2,
    solutionTurns: [
      [
        { type: "select-god", godId: "chiron" },
        { type: "select-ability", abilityId: "mount" },
        { type: "square", square: "e7" },
        { type: "square", square: "g8" },
        { type: "square", square: "f7" },
        { type: "square", square: "g7" },
      ],
      [
        { type: "select-god", godId: "kangus" },
        { type: "select-ability", abilityId: "rage" },
        { type: "square", square: "g7" },
      ],
    ],
    createState: mountedFury,
  },
  {
    id: "rising-monument",
    title: "Position Nine",
    difficulty: "medium",
    objective: "Capture the black King in two divine turns.",
    hint: "A new carrier can open a vertical delivery route through the defended King.",
    solutionSummary: "Raise a Monument rook on f2, then Air Strike to f8 and drop the pawn onto the King at f7.",
    playerTurns: 2,
    solutionTurns: [
      [
        { type: "select-god", godId: "anubis" },
        { type: "select-ability", abilityId: "monument" },
        { type: "square", square: "f2" },
        { type: "square", square: "d3" },
        { type: "square", square: "e2" },
        { type: "square", square: "f2" },
      ],
      [
        { type: "select-god", godId: "quetzacoatl" },
        { type: "select-ability", abilityId: "air-strike" },
        { type: "square", square: "f2" },
        { type: "square", square: "g2" },
        { type: "square", square: "f8" },
        { type: "square", square: "f7" },
      ],
    ],
    createState: risingMonument,
  },
  {
    id: "turncoat-charge",
    title: "Position Ten",
    difficulty: "medium",
    objective: "Capture the black King in two divine turns.",
    hint: "The needed attacker begins on the other side, but its allegiance is negotiable.",
    solutionSummary: "Use Leverage to hire the knight on e4, then Charge it from e4 to e8.",
    playerTurns: 2,
    solutionTurns: [
      [
        { type: "select-god", godId: "midas" },
        { type: "select-ability", abilityId: "leverage" },
        { type: "square", square: "c3" },
        { type: "square", square: "d4" },
        { type: "square", square: "e4" },
      ],
      [
        { type: "select-god", godId: "chiron" },
        { type: "select-ability", abilityId: "charge" },
        { type: "square", square: "e4" },
        { type: "square", square: "e8" },
      ],
    ],
    createState: turncoatCharge,
  },
  {
    id: "funded-flight",
    title: "Position Eleven",
    difficulty: "medium",
    objective: "Capture the black King in two divine turns.",
    hint: "The carrier needs a passenger that does not begin under your control.",
    solutionSummary: "Hire the bishop on b7 with Leverage, then use level 3 Air Strike from a7 to h7 and drop it on the King at f7.",
    playerTurns: 2,
    solutionTurns: [
      [
        { type: "select-god", godId: "midas" },
        { type: "select-ability", abilityId: "leverage" },
        { type: "square", square: "e4" },
        { type: "square", square: "c6" },
        { type: "square", square: "b7" },
      ],
      [
        { type: "select-god", godId: "quetzacoatl" },
        { type: "select-ability", abilityId: "air-strike" },
        { type: "square", square: "a7" },
        { type: "square", square: "b7" },
        { type: "square", square: "h7" },
        { type: "square", square: "f7" },
      ],
    ],
    createState: fundedFlight,
  },
  {
    id: "cleared-lane",
    title: "Position Twelve",
    difficulty: "medium",
    objective: "Capture the black King in two divine turns.",
    hint: "Clearing the file can also fund the attack that follows.",
    solutionSummary: "Mark the bishop from e4 to f5 and execute it, then Charge the knight from e2 to e8.",
    playerTurns: 2,
    solutionTurns: [
      [
        { type: "select-god", godId: "death" },
        { type: "select-ability", abilityId: "marked" },
        { type: "square", square: "e4" },
        { type: "square", square: "f5" },
        { type: "marked-execute" },
      ],
      [
        { type: "select-god", godId: "chiron" },
        { type: "select-ability", abilityId: "charge" },
        { type: "square", square: "e2" },
        { type: "square", square: "e8" },
      ],
    ],
    createState: clearedLane,
  },
  {
    id: "royal-landing",
    title: "Position Thirteen",
    difficulty: "medium",
    objective: "Capture the black King in two divine turns.",
    hint: "Bring your King beside the formation; the crowded back rank and pawn wall leave the opposing King nowhere to go.",
    solutionSummary: "Air Lift the white King to e5, then Escort onto the rook at f6 so it lands on the King at g7.",
    playerTurns: 2,
    solutionTurns: [
      [
        { type: "select-god", godId: "quetzacoatl" },
        { type: "select-ability", abilityId: "air-lift" },
        { type: "square", square: "b1" },
        { type: "square", square: "e5" },
      ],
      [
        { type: "select-god", godId: "leonidas" },
        { type: "select-ability", abilityId: "escort" },
        { type: "square", square: "e5" },
        { type: "square", square: "f6" },
        { type: "square", square: "f6" },
      ],
    ],
    createState: royalLanding,
  },
  {
    id: "skyward-charge",
    title: "Position Fourteen",
    difficulty: "medium",
    objective: "Capture the black King in two divine turns.",
    hint: "Complete a mixed-color snake beside the boxed-in King, then turn the landing square into the center of destruction.",
    solutionSummary: "Use Slither to move the rook from g3 to g7, choose the extra orb, then use Rage to engulf the boxed-in King.",
    playerTurns: 2,
    solutionTurns: [
      [
        { type: "select-god", godId: "quetzacoatl" },
        { type: "select-ability", abilityId: "flight" },
        { type: "square", square: "g3" },
        { type: "square", square: "g7" },
        { type: "orb", orb: "black" },
      ],
      [
        { type: "select-god", godId: "kangus" },
        { type: "select-ability", abilityId: "rage" },
        { type: "square", square: "g7" },
        { type: "rage-resolve", spareFriendly: false },
      ],
    ],
    createState: skywardCharge,
  },
  {
    id: "provoked-fury",
    title: "Position Fifteen",
    difficulty: "medium",
    objective: "Capture the black King in two divine turns.",
    hint: "A pinned defender still attacks a square, even when it cannot safely capture there.",
    solutionSummary: "Use Pick a Fight to move the knight from e5 to g6, where the pinned bishop cannot take it, then Charge to g8.",
    playerTurns: 2,
    solutionTurns: [
      [
        { type: "select-god", godId: "ares" },
        { type: "select-ability", abilityId: "pick-a-fight" },
        { type: "square", square: "e5" },
        { type: "square", square: "g6" },
      ],
      [
        { type: "select-god", godId: "chiron" },
        { type: "select-ability", abilityId: "charge" },
        { type: "square", square: "g6" },
        { type: "square", square: "g8" },
      ],
    ],
    createState: provokedFury,
  },
  {
    id: "queens-compass",
    title: "Position Sixteen",
    difficulty: "hard",
    objective: "Capture the black King in three divine turns.",
    hint: "The opening pawn step commits Medusa before Enchant places a target on the charging knight's square.",
    solutionSummary: "Use Captivate to move the pawn from h2 to h3, Enchant the pawn from e6 to e5 and capture it with the knight from c4, then Charge that knight to e8.",
    playerTurns: 3,
    solutionTurns: [
      [
        { type: "select-god", godId: "medusa" },
        { type: "select-ability", abilityId: "captivate" },
        { type: "square", square: "h2" },
        { type: "square", square: "h3" },
      ],
      [
        { type: "select-god", godId: "teles" },
        { type: "select-ability", abilityId: "enchant" },
        { type: "square", square: "e6" },
        { type: "square", square: "e5" },
        { type: "square", square: "c4" },
        { type: "square", square: "e5" },
      ],
      [
        { type: "select-god", godId: "chiron" },
        { type: "select-ability", abilityId: "charge" },
        { type: "square", square: "e5" },
        { type: "square", square: "e8" },
      ],
    ],
    createState: queensCompass,
  },
  {
    id: "hexed-reserve",
    title: "Position Seventeen",
    difficulty: "hard",
    objective: "Capture the black King in three divine turns.",
    hint: "Three aligned curses can finance the hire that gives your reserve Queen a landing anchor.",
    solutionSummary: "Hex b7, b8, and d8, move the rook from f6 to b6, move the knight from e7 to g8 to hire the bishop on h7, then Resurrect the Queen onto h8.",
    playerTurns: 3,
    solutionTurns: [
      [
        { type: "select-god", godId: "salem" },
        { type: "select-ability", abilityId: "hex" },
        { type: "square", square: "b7" },
        { type: "square", square: "b8" },
        { type: "square", square: "d8" },
        { type: "square", square: "f6" },
        { type: "square", square: "b6" },
      ],
      [
        { type: "select-god", godId: "midas" },
        { type: "select-ability", abilityId: "leverage" },
        { type: "square", square: "e7" },
        { type: "square", square: "g8" },
        { type: "square", square: "h7" },
      ],
      [
        { type: "select-god", godId: "death" },
        { type: "select-ability", abilityId: "resurrect" },
        { type: "grave", pieceId: "white-reserve-queen" },
        { type: "square", square: "h8" },
      ],
    ],
    createState: hexedReserve,
  },
  {
    id: "golden-fuse",
    title: "Position Eighteen",
    difficulty: "hard",
    objective: "Capture the black King in three divine turns.",
    hint: "A trade beside the advanced pawn can fund the final explosion before the knight carries its rider to the only useful dismount square.",
    solutionSummary: "Barter after moving c2 to c3 and take 3 black orbs, use Mount to carry the rook from f7 to g7 with the knight from e7, then use Rage on the mounted knight.",
    playerTurns: 3,
    solutionTurns: [
      [
        { type: "select-god", godId: "midas" },
        { type: "select-ability", abilityId: "barter" },
        { type: "square", square: "c2" },
        { type: "square", square: "c3" },
        { type: "barter", give: "white" },
      ],
      [
        { type: "select-god", godId: "chiron" },
        { type: "select-ability", abilityId: "mount" },
        { type: "square", square: "e7" },
        { type: "square", square: "g8" },
        { type: "square", square: "f7" },
        { type: "square", square: "g7" },
      ],
      [
        { type: "select-god", godId: "kangus" },
        { type: "select-ability", abilityId: "rage" },
        { type: "square", square: "g8" },
      ],
    ],
    createState: goldenFuse,
  },
  {
    id: "resonant-foundation",
    title: "Position Nineteen",
    difficulty: "hard",
    objective: "Capture the black King in three divine turns.",
    hint: "A Queen can resonate beside the clustered dark pieces before Construction clears the carrier's landing square.",
    solutionSummary: "Use Resonance to move the Queen from a2 to a3, use Construction to move the knight from h8 to f7, then Air Strike from a8 to h8 and drop the bishop onto g8.",
    playerTurns: 3,
    solutionTurns: [
      [
        { type: "select-god", godId: "teles" },
        { type: "select-ability", abilityId: "resonance" },
        { type: "square", square: "a2" },
        { type: "square", square: "a3" },
      ],
      [
        { type: "select-god", godId: "anubis" },
        { type: "select-ability", abilityId: "construction" },
        { type: "square", square: "h8" },
        { type: "square", square: "f7" },
      ],
      [
        { type: "select-god", godId: "quetzacoatl" },
        { type: "select-ability", abilityId: "air-strike" },
        { type: "square", square: "a8" },
        { type: "square", square: "b8" },
        { type: "square", square: "h8" },
        { type: "square", square: "g8" },
      ],
    ],
    createState: resonantFoundation,
  },
  {
    id: "threatened-turncoat",
    title: "Position Twenty",
    difficulty: "hard",
    objective: "Capture the black King in three divine turns.",
    hint: "A modest pawn threat supplies the final orb needed to buy and launch the enemy knight.",
    solutionSummary: "Threaten with h2 to h3, use Leverage to hire the knight on e4, then Charge it to e8.",
    playerTurns: 3,
    solutionTurns: [
      [
        { type: "select-god", godId: "ares" },
        { type: "select-ability", abilityId: "threaten" },
        { type: "square", square: "h2" },
        { type: "square", square: "h3" },
      ],
      [
        { type: "select-god", godId: "midas" },
        { type: "select-ability", abilityId: "leverage" },
        { type: "square", square: "c3" },
        { type: "square", square: "d4" },
        { type: "square", square: "e4" },
      ],
      [
        { type: "select-god", godId: "chiron" },
        { type: "select-ability", abilityId: "charge" },
        { type: "square", square: "e4" },
        { type: "square", square: "e8" },
      ],
    ],
    createState: threatenedTurncoat,
  },
  {
    id: "architects-bargain",
    title: "Position Twenty-One",
    difficulty: "hard",
    objective: "Capture the black King in three divine turns.",
    hint: "One careful rook step completes the treasury needed to hire a passenger and launch it.",
    solutionSummary: "Use level 3 Construction to move the rook from f1 to g1, hire the knight on c7 with Leverage, then Air Strike from b8 to h8 and drop it onto g8.",
    playerTurns: 3,
    solutionTurns: [
      [
        { type: "select-god", godId: "anubis" },
        { type: "select-ability", abilityId: "construction" },
        { type: "square", square: "f1" },
        { type: "square", square: "g1" },
      ],
      [
        { type: "select-god", godId: "midas" },
        { type: "select-ability", abilityId: "leverage" },
        { type: "square", square: "d4" },
        { type: "square", square: "c6" },
        { type: "square", square: "c7" },
      ],
      [
        { type: "select-god", godId: "quetzacoatl" },
        { type: "select-ability", abilityId: "air-strike" },
        { type: "square", square: "b8" },
        { type: "square", square: "c7" },
        { type: "square", square: "h8" },
        { type: "square", square: "g8" },
      ],
    ],
    createState: architectsBargain,
  },
  {
    id: "sung-execution",
    title: "Position Twenty-Two",
    difficulty: "hard",
    objective: "Capture the black King in three divine turns.",
    hint: "First sing inside the pawn cluster; then the marked bishop only needs to vacate the file.",
    solutionSummary: "Sing by moving c2 to c3 for 4 black orbs, Mark the bishop from e4 to f5, then Charge the knight from e2 to e8.",
    playerTurns: 3,
    solutionTurns: [
      [
        { type: "select-god", godId: "teles" },
        { type: "select-ability", abilityId: "resonance" },
        { type: "square", square: "c2" },
        { type: "square", square: "c3" },
      ],
      [
        { type: "select-god", godId: "death" },
        { type: "select-ability", abilityId: "marked" },
        { type: "square", square: "e4" },
        { type: "square", square: "f5" },
      ],
      [
        { type: "select-god", godId: "chiron" },
        { type: "select-ability", abilityId: "charge" },
        { type: "square", square: "e2" },
        { type: "square", square: "e8" },
      ],
    ],
    createState: sungExecution,
  },
  {
    id: "opened-throne",
    title: "Position Twenty-Three",
    difficulty: "hard",
    objective: "Capture the black King in three divine turns.",
    hint: "The royal landing square is occupied by your Queen; Construction can clear it by stepping directly ahead.",
    solutionSummary: "Use Construction to move the Queen from e5 to e6, Air Lift the King to e5, then Escort through the rook on f6 to capture on g7.",
    playerTurns: 3,
    solutionTurns: [
      [
        { type: "select-god", godId: "anubis" },
        { type: "select-ability", abilityId: "construction" },
        { type: "square", square: "e5" },
        { type: "square", square: "e6" },
      ],
      [
        { type: "select-god", godId: "quetzacoatl" },
        { type: "select-ability", abilityId: "air-lift" },
        { type: "square", square: "b1" },
        { type: "square", square: "e5" },
      ],
      [
        { type: "select-god", godId: "leonidas" },
        { type: "select-ability", abilityId: "escort" },
        { type: "square", square: "e5" },
        { type: "square", square: "f6" },
        { type: "square", square: "f6" },
      ],
    ],
    createState: openedThrone,
  },
  {
    id: "pinned-serpent",
    title: "Position Twenty-Four",
    difficulty: "hard",
    objective: "Capture the black King in three divine turns.",
    hint: "Captivate the exposed rook before sending the g-file rook into the blast radius.",
    solutionSummary: "Captivate the Queen from a5 to b6, Slither the rook from g3 to g7, then use Rage.",
    playerTurns: 3,
    solutionTurns: [
      [
        { type: "select-god", godId: "medusa" },
        { type: "select-ability", abilityId: "captivate" },
        { type: "square", square: "a5" },
        { type: "square", square: "b6" },
      ],
      [
        { type: "select-god", godId: "quetzacoatl" },
        { type: "select-ability", abilityId: "flight" },
        { type: "square", square: "g3" },
        { type: "square", square: "g7" },
      ],
      [
        { type: "select-god", godId: "kangus" },
        { type: "select-ability", abilityId: "rage" },
        { type: "square", square: "g7" },
      ],
    ],
    createState: pinnedSerpent,
  },
  {
    id: "hexed-provocation",
    title: "Position Twenty-Five",
    difficulty: "hard",
    objective: "Capture the black King in three divine turns.",
    hint: "The rook can enter the enemy back rank while aligning with three curses, funding a provocation against the pinned bishop.",
    solutionSummary: "Hex d8, f8, and h8, capture b8 with the rook for 4 black orbs, use Pick a Fight to move f5 to h6, then Charge to h8.",
    playerTurns: 3,
    solutionTurns: [
      [
        { type: "select-god", godId: "salem" },
        { type: "select-ability", abilityId: "hex" },
        { type: "square", square: "d8" },
        { type: "square", square: "f8" },
        { type: "square", square: "h8" },
        { type: "square", square: "b7" },
        { type: "square", square: "b8" },
      ],
      [
        { type: "select-god", godId: "ares" },
        { type: "select-ability", abilityId: "pick-a-fight" },
        { type: "square", square: "f5" },
        { type: "square", square: "h6" },
      ],
      [
        { type: "select-god", godId: "chiron" },
        { type: "select-ability", abilityId: "charge" },
        { type: "square", square: "h6" },
        { type: "square", square: "h8" },
      ],
    ],
    createState: hexedProvocation,
  },
];

export const PUZZLE_BY_ID = Object.fromEntries(
  PUZZLES.map((puzzle) => [puzzle.id, puzzle]),
) as Record<PuzzleId, PuzzleDefinition>;

const puzzleGodUsage = (puzzle: PuzzleDefinition): PuzzleGodUsage => {
  const state = puzzle.createState();
  const requiredGods: GodId[] = [];
  const solutionAbilities: Partial<Record<GodId, string[]>> = {};
  let selectedGod: GodId | undefined;

  for (const turn of puzzle.solutionTurns) {
    for (const action of turn) {
      if (action.type === "select-god") {
        selectedGod = action.godId;
        if (!requiredGods.includes(action.godId)) requiredGods.push(action.godId);
      } else if (action.type === "select-ability" && selectedGod) {
        const abilities = solutionAbilities[selectedGod] ?? [];
        if (!abilities.includes(action.abilityId)) abilities.push(action.abilityId);
        solutionAbilities[selectedGod] = abilities;
      }
    }
  }

  return {
    puzzleId: puzzle.id,
    title: puzzle.title,
    playerGods: [...state.players.white.gods],
    opponentGods: [...state.players.black.gods],
    requiredGods,
    solutionAbilities,
  };
};

export const PUZZLE_GOD_USAGE = PUZZLES.map(puzzleGodUsage);

export const PUZZLE_GOD_USAGE_BY_ID = Object.fromEntries(
  PUZZLE_GOD_USAGE.map((usage) => [usage.puzzleId, usage]),
) as Record<PuzzleId, PuzzleGodUsage>;

export const PUZZLE_GOD_INDEX = Object.fromEntries(
  GODS.map((god) => {
    const playerIn = PUZZLE_GOD_USAGE
      .filter((usage) => usage.playerGods.includes(god.id))
      .map((usage) => usage.puzzleId);
    const opponentIn = PUZZLE_GOD_USAGE
      .filter((usage) => usage.opponentGods.includes(god.id))
      .map((usage) => usage.puzzleId);
    const requiredBy = PUZZLE_GOD_USAGE
      .filter((usage) => usage.requiredGods.includes(god.id))
      .map((usage) => usage.puzzleId);
    const solutionAbilitiesByPuzzle = Object.fromEntries(
      PUZZLE_GOD_USAGE.flatMap((usage) => {
        const abilities = usage.solutionAbilities[god.id];
        return abilities ? [[usage.puzzleId, abilities]] : [];
      }),
    ) as Partial<Record<PuzzleId, string[]>>;
    return [god.id, {
      playerIn,
      opponentIn,
      requiredBy,
      solutionAbilitiesByPuzzle,
    }];
  }),
) as Record<GodId, GodPuzzleIndexEntry>;

export const createPuzzleGame = (puzzleId: PuzzleId, playerName?: string) =>
  PUZZLE_BY_ID[puzzleId].createState(playerName);
