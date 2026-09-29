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

export interface PuzzleDefinition {
  id: PuzzleId;
  title: string;
  objective: string;
  hint: string;
  solutionSummary: string;
  solution: GameAction[];
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
) => {
  const state = createGame(1, {
    mode: "puzzle",
    aiDifficulty: 10,
    playerName: playerName?.trim() || "Puzzle Solver",
  });
  state.phase = "play";
  state.puzzleId = id;
  state.puzzlePlayerTurnsRemaining = 1;
  state.puzzleFailed = false;
  state.activeColor = "white";
  state.aiDifficulty = 10;
  state.aiColor = "black";
  state.players.white.gods = gods;
  state.players.white.orbs = { white: 10, black: 10 };
  state.players.white.graveyard = [];
  state.players.white.upgrades = {};
  state.players.black.gods = ["ares", "chiron", "anubis"];
  state.players.black.orbs = { white: 10, black: 10 };
  state.players.black.graveyard = [];
  state.players.black.upgrades = {};
  state.draft.pickIndex = state.draft.order.length;
  state.draft.available = [];
  state.rested = [];
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
  state.players.white.upgrades.resurrect = 3;
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
  state.players.white.upgrades["air-strike"] = 2;
  return state;
};

export const PUZZLES: PuzzleDefinition[] = [
  {
    id: "centaurs-lance",
    title: "Position One",
    objective: "Capture the black King in one divine turn.",
    hint: "A knight does not always have to move like a knight.",
    solutionSummary: "Use Chiron's Charge to send the knight from e2 to e8 like a rook.",
    solution: [
      { type: "select-god", godId: "chiron" },
      { type: "select-ability", abilityId: "charge" },
      { type: "square", square: "e2" },
      { type: "square", square: "e8" },
    ],
    createState: centaursLance,
  },
  {
    id: "circle-of-rage",
    title: "Position Two",
    objective: "Capture the black King in one divine turn.",
    hint: "The knight does not need to move to destroy everything surrounding it.",
    solutionSummary: "Use Kangus Kong's Rage on the knight at e7 to engulf the King at e8.",
    solution: [
      { type: "select-god", godId: "kangus" },
      { type: "select-ability", abilityId: "rage" },
      { type: "square", square: "e7" },
    ],
    createState: circleOfRage,
  },
  {
    id: "hidden-reserve",
    title: "Position Three",
    objective: "Capture the black King in one divine turn.",
    hint: "One of your strongest pieces is not currently on the board. A fully upgraded ability can return it to an occupied square.",
    solutionSummary: "Use Death's level 3 Resurrect to revive the Queen from the graveyard directly onto the King at e4.",
    solution: [
      { type: "select-god", godId: "death" },
      { type: "select-ability", abilityId: "resurrect" },
      { type: "grave", pieceId: "white-queen" },
      { type: "square", square: "e4" },
    ],
    createState: hiddenReserve,
  },
  {
    id: "royal-escort",
    title: "Position Four",
    objective: "Capture the black King in one divine turn.",
    hint: "Move the King so that his companion, not the King, lands on e2.",
    solutionSummary: "Escort the bishop beside the King, then move the King from c2 to d2 so the bishop lands on e2.",
    solution: [
      { type: "select-god", godId: "leonidas" },
      { type: "select-ability", abilityId: "escort" },
      { type: "square", square: "c2" },
      { type: "square", square: "d2" },
      { type: "square", square: "d2" },
    ],
    createState: royalEscort,
  },
  {
    id: "serpents-delivery",
    title: "Position Five",
    objective: "Capture the black King in one divine turn.",
    hint: "The rook can carry the pawn over the blocked a-file. At level 2, the passenger may land on the first enemy flown over.",
    solutionSummary: "Use level 2 Air Strike with the rook on a1, carry the pawn from b1, land on a8, and drop the pawn onto the first enemy flown over at a5.",
    solution: [
      { type: "select-god", godId: "quetzacoatl" },
      { type: "select-ability", abilityId: "air-strike" },
      { type: "square", square: "a1" },
      { type: "square", square: "b1" },
      { type: "square", square: "a8" },
      { type: "square", square: "a5" },
    ],
    createState: serpentsDelivery,
  },
];

export const PUZZLE_BY_ID = Object.fromEntries(
  PUZZLES.map((puzzle) => [puzzle.id, puzzle]),
) as Record<PuzzleId, PuzzleDefinition>;

export const createPuzzleGame = (puzzleId: PuzzleId, playerName?: string) =>
  PUZZLE_BY_ID[puzzleId].createState(playerName);
