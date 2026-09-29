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
  godId: GodId;
  abilityId: string;
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
    ["a1", piece("white-king", "king", "white")],
    ["e2", piece("white-knight", "knight", "white")],
    ["e8", piece("black-king", "king", "black")],
    ["h7", piece("black-pawn", "pawn", "black")],
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
    ["a1", piece("white-king", "king", "white")],
    ["e7", piece("white-knight", "knight", "white")],
    ["e8", piece("black-king", "king", "black")],
    ["d8", piece("black-rook", "rook", "black")],
    ["f8", piece("black-pawn", "pawn", "black")],
  );
  return state;
};

const preparedFate = (playerName?: string) => {
  const state = preparePuzzle(
    "prepared-fate",
    "Prepared Fate",
    "Use the prepared shot to capture the black King.",
    ["artemis", "teles", "death"],
    playerName,
  );
  state.board = board(
    ["a1", piece("white-king", "king", "white")],
    ["b1", piece("white-bishop", "bishop", "white", {
      prepared: { owner: "white", level: 1 },
      movedThisTurn: true,
    })],
    ["d5", piece("white-knight", "knight", "white", {
      prepared: { owner: "white", level: 1 },
      movedThisTurn: true,
    })],
    ["g6", piece("black-king", "king", "black")],
    ["f6", piece("black-pawn", "pawn", "black")],
    ["h8", piece("black-rook", "rook", "black")],
  );
  state.pending = {
    godId: "artemis",
    abilityId: "snipe-shot",
    step: "snipe-source",
  };
  state.legalTargets = ["b1", "d5"];
  state.notice = "Prepared Shot: choose the prepared piece that can end the game.";
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
    ["e2", piece("black-king", "king", "black")],
    ["h7", piece("black-pawn", "pawn", "black")],
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
    ["a3", piece("black-pawn", "pawn", "black")],
    ["a5", piece("black-king", "king", "black")],
    ["h8", piece("black-knight", "knight", "black")],
  );
  return state;
};

export const PUZZLES: PuzzleDefinition[] = [
  {
    id: "centaurs-lance",
    title: "The Centaur's Lance",
    godId: "chiron",
    abilityId: "charge",
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
    title: "Circle of Rage",
    godId: "kangus",
    abilityId: "rage",
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
    id: "prepared-fate",
    title: "Prepared Fate",
    godId: "artemis",
    abilityId: "snipe",
    objective: "Use the prepared shot to capture the black King.",
    hint: "Only one highlighted piece has an uninterrupted line to the King.",
    solutionSummary: "Choose the prepared bishop on b1, then Snipe the King on g6.",
    solution: [
      { type: "square", square: "b1" },
      { type: "square", square: "g6" },
    ],
    createState: preparedFate,
  },
  {
    id: "royal-escort",
    title: "The Royal Escort",
    godId: "leonidas",
    abilityId: "escort",
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
    title: "The Serpent's Delivery",
    godId: "quetzacoatl",
    abilityId: "air-strike",
    objective: "Capture the black King in one divine turn.",
    hint: "The rook can carry the pawn over the blocked a-file and drop it before landing.",
    solutionSummary: "Air Strike with the rook on a1, carry the pawn from b1, land on a8, and drop the pawn on a5.",
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
