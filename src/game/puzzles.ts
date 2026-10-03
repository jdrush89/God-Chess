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

export type PuzzleDifficulty = "easy" | "medium";

export interface PuzzleDefinition {
  id: PuzzleId;
  title: string;
  difficulty: PuzzleDifficulty;
  objective: string;
  hint: string;
  solutionSummary: string;
  playerTurns: 1 | 2;
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
  playerTurns: 1 | 2 = 1,
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
  state.players.black.gods = playerTurns === 2
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
    ["g8", piece("black-rook-g", "rook", "black", { frozen: 2, frozenBy: "white" })],
    ["c8", piece("black-bishop", "bishop", "black", { frozen: 2, frozenBy: "white" })],
    ["e8", piece("black-knight-e", "knight", "black", { frozen: 2, frozenBy: "white" })],
    ["b7", piece("black-pawn-b", "pawn", "black")],
    ["c7", piece("black-pawn-c", "pawn", "black")],
    ["d7", piece("black-pawn-d", "pawn", "black")],
    ["e7", piece("black-pawn-e", "pawn", "black")],
    ["g7", piece("black-pawn-g", "pawn", "black")],
    ["h7", piece("black-pawn-h", "pawn", "black")],
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
    ["h4", piece("white-guard-bishop", "bishop", "white")],
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
    ["c8", piece("black-bishop-c", "bishop", "black", { frozen: 2, frozenBy: "white" })],
    ["g8", piece("black-bishop-g", "bishop", "black", { frozen: 2, frozenBy: "white" })],
    ["a7", piece("black-pawn-a", "pawn", "black")],
    ["b7", piece("black-pawn-b", "pawn", "black")],
    ["c7", piece("black-pawn-c", "pawn", "black")],
    ["d7", piece("black-pawn-d", "pawn", "black")],
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
    ["d1", piece("white-queen", "queen", "white")],
    ["a7", piece("white-carrier", "rook", "white")],
    ["f1", piece("white-rook-f", "rook", "white")],
    ["e4", piece("white-recruiter", "bishop", "white")],
    ["h4", piece("white-guard-bishop", "bishop", "white")],
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
    ["e8", piece("black-knight", "knight", "black", { frozen: 2, frozenBy: "white" })],
    ["g8", piece("black-rook", "rook", "black", { frozen: 2, frozenBy: "white" })],
    ["e6", piece("black-pawn-e", "pawn", "black")],
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
    ["c8", piece("black-bishop-c", "bishop", "black", { frozen: 2, frozenBy: "white" })],
    ["g8", piece("black-bishop-g", "bishop", "black", { frozen: 2, frozenBy: "white" })],
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
    ["g8", piece("black-knight-g", "knight", "black", { frozen: 2, frozenBy: "white" })],
    ["h8", piece("black-rook-h", "rook", "black")],
    ["b8", piece("black-queen", "queen", "black")],
    ["a8", piece("black-rook-a", "rook", "black")],
    ["c8", piece("black-bishop-c", "bishop", "black", { frozen: 2, frozenBy: "white" })],
    ["f8", piece("black-bishop-f", "bishop", "black", { frozen: 2, frozenBy: "white" })],
    ["d7", piece("black-knight-d", "knight", "black", { frozen: 2, frozenBy: "white" })],
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
    ["a7", piece("white-guard-rook", "rook", "white")],
    ["g3", piece("white-slithering-rook", "rook", "white")],
    ["f1", piece("white-bishop-f", "bishop", "white")],
    ["a3", piece("white-knight-a", "knight", "white")],
    ["f3", piece("white-knight-f", "knight", "white")],
    ["a2", piece("white-pawn-a", "pawn", "white")],
    ["c2", piece("white-pawn-c", "pawn", "white")],
    ["d2", piece("white-pawn-d", "pawn", "white")],
    ["e2", piece("white-pawn-e", "pawn", "white")],
    ["f2", piece("white-pawn-f", "pawn", "white")],
    ["h2", piece("white-pawn-h", "pawn", "white")],
    ["h8", piece("black-king", "king", "black")],
    ["a8", piece("black-rook-a", "rook", "black")],
    ["d8", piece("black-queen", "queen", "black")],
    ["c8", piece("black-bishop", "bishop", "black", { frozen: 2, frozenBy: "white" })],
    ["e7", piece("black-pawn-e", "pawn", "black")],
    ["c6", piece("black-pawn-c", "pawn", "black")],
    ["d7", piece("black-pawn-d", "pawn", "black")],
  );
  state.players.white.upgrades = {
    flight: 2,
    rage: 2,
    captivate: 2,
    "stone-gaze": 2,
  };
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
    ["c5", piece("white-provoked-knight", "knight", "white")],
    ["a2", piece("white-pawn-a", "pawn", "white")],
    ["b2", piece("white-pawn-b", "pawn", "white")],
    ["c2", piece("white-pawn-c", "pawn", "white")],
    ["d2", piece("white-pawn-d", "pawn", "white")],
    ["e2", piece("white-pawn-e", "pawn", "white")],
    ["f2", piece("white-pawn-f", "pawn", "white")],
    ["g2", piece("white-pawn-g", "pawn", "white")],
    ["h2", piece("white-pawn-h", "pawn", "white")],
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
    solutionSummary: "Air Lift the white King to e6, then Escort the rook from f6 onto the King at g7.",
    playerTurns: 2,
    solutionTurns: [
      [
        { type: "select-god", godId: "quetzacoatl" },
        { type: "select-ability", abilityId: "air-lift" },
        { type: "square", square: "b1" },
        { type: "square", square: "e6" },
      ],
      [
        { type: "select-god", godId: "leonidas" },
        { type: "select-ability", abilityId: "escort" },
        { type: "square", square: "e6" },
        { type: "square", square: "f6" },
        { type: "square", square: "f7" },
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
        { type: "orb", orb: "white" },
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
    solutionSummary: "Pick a Fight to teleport the knight from c5 to g6, where the pinned bishop cannot take it, then Charge to g8.",
    playerTurns: 2,
    solutionTurns: [
      [
        { type: "select-god", godId: "ares" },
        { type: "select-ability", abilityId: "pick-a-fight" },
        { type: "square", square: "c5" },
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
