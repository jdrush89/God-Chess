import { createGame, type GameAction } from "./engine";
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
  state.board = denseTwoTurnBoard(
    ["a4", "b4", "c4", "d3", "e2", "f4", "h4"],
    ["a4", piece("white-monument-pawn-a", "pawn", "white")],
    ["b4", piece("white-passenger", "pawn", "white")],
    ["c4", piece("white-flight-blocker", "bishop", "white")],
    ["d3", piece("white-monument-pawn-d", "pawn", "white")],
    ["e2", piece("white-monument-pawn-e", "pawn", "white")],
    ["f4", piece("black-king", "king", "black", { movedThisTurn: true })],
  );
  state.players.white.upgrades = {
    "air-strike": 2,
    construction: 2,
    resonance: 2,
  };
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
  state.board = denseTwoTurnBoard(
    ["c3", "d4", "e4", "e8"],
    ["c3", piece("white-recruiter", "bishop", "white")],
    ["e4", piece("black-turncoat", "knight", "black", { movedThisTurn: true })],
    ["e8", piece("black-king", "king", "black", { movedThisTurn: true })],
  );
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
  state.board = denseTwoTurnBoard(
    ["a3", "a4", "b4", "c3", "c4", "e1", "f4", "h4"],
    ["a4", piece("white-carrier", "rook", "white")],
    ["b4", piece("black-passenger", "bishop", "black", { movedThisTurn: true })],
    ["c4", piece("white-flight-blocker", "bishop", "white")],
    ["e1", piece("white-recruiter", "bishop", "white")],
    ["f4", piece("black-king", "king", "black", { movedThisTurn: true })],
  );
  state.players.white.upgrades = {
    "air-strike": 3,
    barter: 3,
    construction: 2,
  };
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
  state.board = denseTwoTurnBoard(
    ["e2", "e4", "e8", "f5"],
    ["e2", piece("white-charge-knight", "knight", "white")],
    ["e4", piece("white-doomed-bishop", "bishop", "white")],
    ["e8", piece("black-king", "king", "black", { movedThisTurn: true })],
  );
  state.players.white.upgrades = {
    marked: 3,
    gallop: 2,
    resonance: 2,
  };
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
  state.board = denseTwoTurnBoard(
    ["b1", "f6", "g6", "g7", "h7"],
    ["b1", piece("white-king", "king", "white")],
    ["g6", piece("white-escort", "rook", "white")],
    ["h7", piece("black-king", "king", "black", { movedThisTurn: true })],
  );
  state.players.white.upgrades = {
    "air-lift": 3,
    "royal-step": 2,
    barter: 2,
  };
  return state;
};

const skywardCharge = (playerName?: string) => {
  const state = preparePuzzle(
    "skyward-charge",
    "Position Fourteen",
    "Capture the black King in two divine turns.",
    ["quetzacoatl", "chiron", "artemis"],
    playerName,
    2,
  );
  state.board = denseTwoTurnBoard(
    ["c4", "e5", "e8"],
    ["c4", piece("white-flying-knight", "knight", "white")],
    ["e8", piece("black-king", "king", "black", { movedThisTurn: true })],
  );
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
  state.board = denseTwoTurnBoard(
    ["c5", "g6", "g7", "g8", "h6"],
    ["c5", piece("white-provoked-knight", "knight", "white")],
    ["h6", piece("black-provoker", "rook", "black", { movedThisTurn: true })],
    ["g8", piece("black-king", "king", "black", { movedThisTurn: true })],
  );
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
    hint: "Three pawns can create the only carrier capable of delivering the nearby passenger through the blocked rank.",
    solutionSummary: "Raise a Monument rook on a4, then Air Strike to h4 and drop the pawn onto the King at f4.",
    playerTurns: 2,
    solutionTurns: [
      [
        { type: "select-god", godId: "anubis" },
        { type: "select-ability", abilityId: "monument" },
        { type: "square", square: "a4" },
        { type: "square", square: "d3" },
        { type: "square", square: "e2" },
        { type: "square", square: "a4" },
      ],
      [
        { type: "select-god", godId: "quetzacoatl" },
        { type: "select-ability", abilityId: "air-strike" },
        { type: "square", square: "a4" },
        { type: "square", square: "b4" },
        { type: "square", square: "h4" },
        { type: "square", square: "f4" },
      ],
    ],
    createState: risingMonument,
  },
  {
    id: "turncoat-charge",
    title: "Position Ten",
    difficulty: "medium",
    objective: "Capture the black King in two divine turns.",
    hint: "An enemy knight can change allegiance before charging up the open file.",
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
    hint: "The carrier cannot lift an enemy piece, but ownership can change before the second turn.",
    solutionSummary: "Hire the bishop on b4 with Leverage, then use level 3 Air Strike from a4 to h4 and drop it on the King at f4.",
    playerTurns: 2,
    solutionTurns: [
      [
        { type: "select-god", godId: "midas" },
        { type: "select-ability", abilityId: "leverage" },
        { type: "square", square: "e1" },
        { type: "square", square: "c3" },
        { type: "square", square: "b4" },
      ],
      [
        { type: "select-god", godId: "quetzacoatl" },
        { type: "select-ability", abilityId: "air-strike" },
        { type: "square", square: "a4" },
        { type: "square", square: "b4" },
        { type: "square", square: "h4" },
        { type: "square", square: "f4" },
      ],
    ],
    createState: fundedFlight,
  },
  {
    id: "cleared-lane",
    title: "Position Twelve",
    difficulty: "medium",
    objective: "Capture the black King in two divine turns.",
    hint: "The piece obstructing the knight can be moved and immediately claimed before the charge.",
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
    hint: "The King can arrive beside an escort before commanding that escort into the target.",
    solutionSummary: "Air Lift the white King to f6, then Escort the rook from g6 onto the King at h7.",
    playerTurns: 2,
    solutionTurns: [
      [
        { type: "select-god", godId: "quetzacoatl" },
        { type: "select-ability", abilityId: "air-lift" },
        { type: "square", square: "b1" },
        { type: "square", square: "f6" },
      ],
      [
        { type: "select-god", godId: "leonidas" },
        { type: "select-ability", abilityId: "escort" },
        { type: "square", square: "f6" },
        { type: "square", square: "g6" },
        { type: "square", square: "g7" },
      ],
    ],
    createState: royalLanding,
  },
  {
    id: "skyward-charge",
    title: "Position Fourteen",
    difficulty: "medium",
    objective: "Capture the black King in two divine turns.",
    hint: "First place the knight beneath the King, then abandon the knight's usual movement.",
    solutionSummary: "Use Flight from c4 to e5, then Charge the knight up the e-file to e8.",
    playerTurns: 2,
    solutionTurns: [
      [
        { type: "select-god", godId: "quetzacoatl" },
        { type: "select-ability", abilityId: "flight" },
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
    createState: skywardCharge,
  },
  {
    id: "provoked-fury",
    title: "Position Fifteen",
    difficulty: "medium",
    objective: "Capture the black King in two divine turns.",
    hint: "A square attacked by the enemy rook places the knight directly beneath the King.",
    solutionSummary: "Pick a Fight to teleport the knight from c5 to g6, then Charge it to the King on g8.",
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

export const createPuzzleGame = (puzzleId: PuzzleId, playerName?: string) =>
  PUZZLE_BY_ID[puzzleId].createState(playerName);
