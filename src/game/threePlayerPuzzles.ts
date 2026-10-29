import { createDefaultThreePlayerConfig } from "./threePlayerConfig";
import { createThreePlayerGame } from "./threePlayerEngine";
import type {
  ThreePlayerAction,
  ThreePlayerBoardVariant,
  ThreePlayerCell,
  ThreePlayerPiece,
  ThreePlayerPieceStatus,
  ThreePlayerSeat,
  ThreePlayerState,
} from "./threePlayerTypes";
import type {
  PieceType,
  PuzzleId,
  ThreePlayerPuzzleId,
} from "./types";

export interface ThreePlayerPuzzleDefinition {
  id: ThreePlayerPuzzleId;
  mode: "three-player";
  title: string;
  boardVariant: ThreePlayerBoardVariant;
  objective: string;
  hint: string;
  solutionSummary: string;
  playerTurns: 2;
  solutionTurns: ThreePlayerAction[][];
  cpuTurns: ThreePlayerAction[][];
  createState: (playerName?: string) => ThreePlayerState;
}

interface PuzzlePiecePlacement {
  cell: ThreePlayerCell;
  type: PieceType;
  owner: ThreePlayerSeat;
  id?: string;
  status?: ThreePlayerPieceStatus;
}

interface PuzzleSeed extends Omit<
  ThreePlayerPuzzleDefinition,
  "mode" | "objective" | "playerTurns" | "solutionTurns" | "cpuTurns" | "createState"
> {
  pieces: PuzzlePiecePlacement[];
  firstTurn: ThreePlayerAction[];
  secondTurn: ThreePlayerAction[];
  whiteUpgrades?: Record<string, 1 | 2 | 3>;
}

const piece = (
  id: string,
  type: PieceType,
  owner: ThreePlayerSeat,
  status: ThreePlayerPieceStatus = {},
): ThreePlayerPiece => ({
  id,
  type,
  owner,
  controller: owner,
  hasMoved: true,
  status,
});

const place = (
  cell: ThreePlayerCell,
  type: PieceType,
  owner: ThreePlayerSeat,
  id?: string,
): PuzzlePiecePlacement => ({ cell, type, owner, id });

const chargeTurn = (
  from: ThreePlayerCell,
  to: ThreePlayerCell,
  pathId?: string,
): ThreePlayerAction[] => [
  { type: "select-god", godId: "chiron" },
  { type: "select-ability", abilityId: "charge" },
  { type: "cell", cell: from },
  { type: "cell", cell: to },
  ...(pathId ? [{ type: "path", pathId } as ThreePlayerAction] : []),
];

const airLiftTurn = (
  from: ThreePlayerCell,
  to: ThreePlayerCell,
  followUps: ThreePlayerCell[] = [],
): ThreePlayerAction[] => [
  { type: "select-god", godId: "quetzacoatl" },
  { type: "select-ability", abilityId: "air-lift" },
  { type: "cell", cell: from },
  { type: "cell", cell: to },
  ...followUps.map((cell): ThreePlayerAction => ({ type: "cell", cell })),
];

const marchHomeTurn = (): ThreePlayerAction[] => [
  { type: "select-god", godId: "leonidas" },
  { type: "select-ability", abilityId: "march-home" },
  { type: "confirm-ability" },
];

const swapRivalOwners = (
  pieces: PuzzlePiecePlacement[],
): PuzzlePiecePlacement[] =>
  pieces.map((placement) => ({
    ...placement,
    owner: placement.owner === "red"
      ? "black"
      : placement.owner === "black"
      ? "red"
      : placement.owner,
  }));

const yaltaPieces = (
  chargeCell: ThreePlayerCell,
): PuzzlePiecePlacement[] => [
  place("three-player:24", "king", "red", "red-king"),
  place("three-player:31", "king", "black", "black-king"),
  place("three-player:16", "knight", "red"),
  place("three-player:25", "rook", "red"),
  place("three-player:23", "rook", "black"),
  place("three-player:1", "queen", "white"),
  place("three-player:6", "queen", "white"),
  place("three-player:8", "queen", "white"),
  place("three-player:15", "bishop", "white"),
  place("three-player:17", "rook", "white"),
  place("three-player:22", "rook", "white"),
  place(chargeCell, "knight", "white", "white-charge-knight"),
  place("three-player:26", "rook", "white", "white-discovery-rook"),
  place("three-player:28", "king", "white", "white-airlift-king"),
];

const createPuzzleState = (
  seed: PuzzleSeed,
  playerName?: string,
): ThreePlayerState => {
  const config = createDefaultThreePlayerConfig();
  config.boardVariant = seed.boardVariant;
  config.victoryMode = "last-survivor";
  config.takeover = false;
  config.seats.white.name = playerName?.trim() || "Puzzle Solver";
  config.seats.white.control = { kind: "human", local: true };
  config.seats.red.name = "Crimson Rival";
  config.seats.red.control = { kind: "ai", difficulty: 10 };
  config.seats.black.name = "Onyx Rival";
  config.seats.black.control = { kind: "ai", difficulty: 10 };

  const state = createThreePlayerGame(config);
  state.phase = "play";
  state.activeSeat = "white";
  state.players.white.gods = ["chiron", "quetzacoatl", "leonidas"];
  state.players.red.gods = ["teles", "artemis", "kangus"];
  state.players.black.gods = ["death", "anubis", "midas"];
  state.players.white.orbs = { light: 10, dark: 10 };
  state.players.red.orbs = { light: 0, dark: 0 };
  state.players.black.orbs = { light: 0, dark: 0 };
  state.players.white.upgrades = {
    ...state.players.white.upgrades,
    ...seed.whiteUpgrades,
  };
  state.draft.available = [];
  state.draft.unused = [];
  state.draft.pickIndex = state.draft.order.length;
  state.rested = [];
  state.board = {};
  seed.pieces.forEach((placement, index) => {
    state.board[placement.cell] = piece(
      placement.id ??
        `${placement.owner}-${placement.type}-${index + 1}`,
      placement.type,
      placement.owner,
      placement.status,
    );
  });
  state.castlingRights = {
    white: { king: false, queen: false },
    red: { king: false, queen: false },
    black: { king: false, queen: false },
  };
  state.history = [`Puzzle: ${seed.title}`];
  state.notice = "Checkmate both rival Kings within two divine turns.";
  return state;
};

const seeds: PuzzleSeed[] = [
  {
    id: "three-frontier-fork",
    title: "Break the Frontier",
    boardVariant: "three-player",
    hint: "The knight cannot reach the red mating square normally. Afterward, move the King without moving the rook behind it.",
    solutionSummary: "Charge through the left frontier, then Air Lift the King to uncover the final rook line.",
    pieces: yaltaPieces("three-player:11"),
    firstTurn: chargeTurn("three-player:11", "three-player:9"),
    secondTurn: airLiftTurn("three-player:28", "three-player:2"),
  },
  {
    id: "three-distant-rampart",
    title: "The Hidden Rampart",
    boardVariant: "three-player",
    hint: "Unmask the rook attack first. The surviving King can only be reached if the knight stops moving like a knight.",
    solutionSummary: "Air Lift the King to reveal the first mate, then Charge through the opposite rampart.",
    pieces: swapRivalOwners(yaltaPieces("three-player:12")),
    firstTurn: airLiftTurn("three-player:28", "three-player:2"),
    secondTurn: chargeTurn("three-player:12", "three-player:9"),
  },
  {
    id: "hexagonal-crossfire",
    title: "Hexagonal Crossfire",
    boardVariant: "three-hexagonal",
    hint: "The first knight needs a straight-line assault. The second mate appears only after the King leaves the rook's ray.",
    solutionSummary: "Charge across the hex, then Air Lift the King and complete the circular follow-up.",
    pieces: [
      place("three-hexagonal:16", "king", "red", "red-king"),
      place("three-hexagonal:8", "king", "black", "black-king"),
      ...["33", "32", "15", "31", "49"].map((cell) =>
        place(`three-hexagonal:${cell}`, "pawn", "red")
      ),
      place("three-hexagonal:28", "queen", "white"),
      place("three-hexagonal:43", "rook", "white"),
      place("three-hexagonal:26", "rook", "white"),
      place("three-hexagonal:14", "knight", "white", "white-charge-knight"),
      place("three-hexagonal:56", "rook", "white", "white-discovery-rook"),
      place("three-hexagonal:40", "king", "white", "white-airlift-king"),
    ],
    firstTurn: chargeTurn("three-hexagonal:14", "three-hexagonal:30"),
    secondTurn: airLiftTurn(
      "three-hexagonal:40",
      "three-hexagonal:9",
      ["three-hexagonal:10"],
    ),
  },
  {
    id: "hexagonal-last-gate",
    title: "The Last Hex Gate",
    boardVariant: "three-hexagonal",
    hint: "The King is masking a long rook ray. Recall it before turning the knight toward the last gate.",
    solutionSummary: "March Home to reveal the first mate, then Charge into the final hex gate.",
    pieces: swapRivalOwners([
      place("three-hexagonal:15", "king", "red", "red-king"),
      place("three-hexagonal:8", "king", "black", "black-king"),
      ...["16", "32", "31", "14", "33", "30", "48"].map((cell) =>
        place(`three-hexagonal:${cell}`, "pawn", "red")
      ),
      place("three-hexagonal:28", "queen", "white"),
      place("three-hexagonal:43", "rook", "white"),
      place("three-hexagonal:26", "rook", "white"),
      place("three-hexagonal:12", "knight", "white", "white-charge-knight"),
      place("three-hexagonal:56", "rook", "white", "white-discovery-rook"),
      place("three-hexagonal:40", "king", "white", "white-airlift-king"),
    ]),
    firstTurn: marchHomeTurn(),
    secondTurn: chargeTurn("three-hexagonal:12", "three-hexagonal:29"),
  },
  {
    id: "triad-pincer",
    title: "Triad Pincer",
    boardVariant: "triad",
    hint: "The first mating square is aligned with the knight, not jumped to. The second attack is hidden behind your King.",
    solutionSummary: "Charge into the pincer, then Air Lift the King off the rook's line.",
    pieces: [
      place("triad:111", "king", "red", "red-king"),
      place("triad:14", "king", "black", "black-king"),
      ...["112", "129", "128", "130", "146"].map((cell) =>
        place(`triad:${cell}`, "pawn", "red")
      ),
      place("triad:51", "queen", "white"),
      place("triad:113", "knight", "white", "white-charge-knight"),
      place("triad:68", "rook", "white", "white-discovery-rook"),
      place("triad:50", "king", "white", "white-airlift-king"),
    ],
    firstTurn: chargeTurn("triad:113", "triad:131"),
    secondTurn: airLiftTurn("triad:50", "triad:48"),
  },
  {
    id: "triad-long-march",
    title: "The Long Triad",
    boardVariant: "triad",
    hint: "Reveal the short rook line first. The remaining King is vulnerable only to a straight-line knight assault.",
    solutionSummary: "Air Lift the King off the first file, then Charge down the long triad arm.",
    pieces: swapRivalOwners([
      place("triad:198", "king", "red", "red-king"),
      place("triad:14", "king", "black", "black-king"),
      ...["199", "216", "181", "217", "182", "163"].map((cell) =>
        place(`triad:${cell}`, "pawn", "red")
      ),
      place("triad:51", "queen", "white"),
      place("triad:112", "knight", "white", "white-charge-knight"),
      place("triad:68", "rook", "white", "white-discovery-rook"),
      place("triad:50", "king", "white", "white-airlift-king"),
    ]),
    firstTurn: airLiftTurn("triad:50", "triad:48"),
    secondTurn: chargeTurn("triad:112", "triad:146"),
  },
  {
    id: "circular-convergence",
    title: "Circular Convergence",
    boardVariant: "three-circular",
    hint: "The knight's target is one ring away but not a knight jump. The far King is hidden behind your own King.",
    solutionSummary: "Charge between rings, then Air Lift the King to uncover the circular rook ray.",
    pieces: [
      place("three-circular:6", "king", "red", "red-king"),
      ...["30", "7", "5", "31", "29"].map((cell) =>
        place(`three-circular:${cell}`, "pawn", "red")
      ),
      place("three-circular:16", "king", "black", "black-king"),
      ...["40", "15", "41", "39"].map((cell) =>
        place(`three-circular:${cell}`, "pawn", "black")
      ),
      place("three-circular:4", "knight", "white", "white-charge-knight"),
      place("three-circular:0", "rook", "white", "white-discovery-rook"),
      place("three-circular:23", "king", "white", "white-airlift-king"),
    ],
    firstTurn: chargeTurn("three-circular:4", "three-circular:28"),
    secondTurn: airLiftTurn("three-circular:23", "three-circular:1"),
  },
  {
    id: "circular-outer-ring",
    title: "Outer Ring",
    boardVariant: "three-circular",
    hint: "Open the circular file before attacking the outer cage. The knight must finish with a rook move.",
    solutionSummary: "Air Lift the King off the ring, then Charge outward to the final mating square.",
    pieces: swapRivalOwners([
      place("three-circular:9", "king", "red", "red-king"),
      ...["33", "10", "8", "34", "32"].map((cell) =>
        place(`three-circular:${cell}`, "pawn", "red")
      ),
      place("three-circular:19", "king", "black", "black-king"),
      ...["43", "18", "44", "42"].map((cell) =>
        place(`three-circular:${cell}`, "pawn", "black")
      ),
      place("three-circular:7", "knight", "white", "white-charge-knight"),
      place("three-circular:0", "rook", "white", "white-discovery-rook"),
      place("three-circular:23", "king", "white", "white-airlift-king"),
    ]),
    firstTurn: airLiftTurn("three-circular:23", "three-circular:1"),
    secondTurn: chargeTurn("three-circular:7", "three-circular:31"),
  },
  {
    id: "half-board-siege",
    title: "Half-Board Revelation",
    boardVariant: "three-half",
    hint: "Recall the King to expose the compact rook line. Then choose the correct straight route for the knight.",
    solutionSummary: "March Home to reveal the first mate, then Charge across the half-board.",
    pieces: swapRivalOwners([
      place("three-half:31", "king", "red", "red-king"),
      place("three-half:24", "king", "black", "black-king"),
      ...["30", "23", "22"].map((cell) =>
        place(`three-half:${cell}`, "pawn", "red")
      ),
      place("three-half:1", "queen", "white"),
      place("three-half:17", "rook", "white"),
      place("three-half:6", "knight", "white", "white-charge-knight"),
      place("three-half:27", "rook", "white", "white-discovery-rook"),
      place("three-half:26", "king", "white", "white-airlift-king"),
    ]),
    firstTurn: marchHomeTurn(),
    secondTurn: chargeTurn(
      "three-half:6",
      "three-half:14",
      "three-half:rook:three-half:6:white-red:3",
    ),
  },
  {
    id: "half-board-final-file",
    title: "The Final File",
    boardVariant: "three-half",
    hint: "The knight's straight-line route has two choices. The final file opens only when the King teleports away.",
    solutionSummary: "Charge along the white-red route, then Air Lift the King clear of the last file.",
    pieces: [
      place("three-half:28", "king", "red", "red-king"),
      place("three-half:24", "king", "black", "black-king"),
      ...["29", "27", "20", "21", "19"].map((cell) =>
        place(`three-half:${cell}`, "pawn", "red")
      ),
      place("three-half:1", "queen", "white"),
      place("three-half:17", "rook", "white"),
      place("three-half:6", "knight", "white", "white-charge-knight"),
      place("three-half:32", "rook", "white", "white-discovery-rook"),
      place("three-half:0", "king", "white", "white-airlift-king"),
    ],
    firstTurn: chargeTurn(
      "three-half:6",
      "three-half:22",
      "three-half:rook:three-half:6:white-red:3",
    ),
    secondTurn: airLiftTurn("three-half:0", "three-half:2"),
  },
];

const cpuTurn: ThreePlayerAction[] = [
  { type: "select-god", godId: "death" },
  { type: "select-ability", abilityId: "marked" },
  { type: "pass" },
];

export const THREE_PLAYER_PUZZLES: ThreePlayerPuzzleDefinition[] = seeds.map(
  (seed) => ({
    id: seed.id,
    mode: "three-player",
    title: seed.title,
    boardVariant: seed.boardVariant,
    objective: "Checkmate both rival Kings within two divine turns.",
    hint: seed.hint,
    solutionSummary: seed.solutionSummary,
    playerTurns: 2,
    solutionTurns: [seed.firstTurn, seed.secondTurn],
    cpuTurns: [cpuTurn],
    createState: (playerName?: string) =>
      createPuzzleState(seed, playerName),
  }),
);

export const THREE_PLAYER_PUZZLE_BY_ID = Object.fromEntries(
  THREE_PLAYER_PUZZLES.map((puzzle) => [puzzle.id, puzzle]),
) as Record<ThreePlayerPuzzleId, ThreePlayerPuzzleDefinition>;

export const isThreePlayerPuzzleId = (
  puzzleId: PuzzleId,
): puzzleId is ThreePlayerPuzzleId => puzzleId in THREE_PLAYER_PUZZLE_BY_ID;
