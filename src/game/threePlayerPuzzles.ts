import { createDefaultThreePlayerConfig } from "./threePlayerConfig";
import { createThreePlayerGame } from "./threePlayerEngine";
import { GODS } from "./gods";
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
  GodId,
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
  playerTurns: 2 | 3;
  solutionTurns: ThreePlayerAction[][];
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
  "mode" | "objective" | "playerTurns" | "solutionTurns" | "createState"
> {
  pieces: PuzzlePiecePlacement[];
  whiteGods: [GodId, GodId, GodId];
  redGods?: [GodId, GodId, GodId];
  blackGods?: [GodId, GodId, GodId];
  solutionTurns: ThreePlayerAction[][];
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

const pickAFightTurn = (
  from: ThreePlayerCell,
  to: ThreePlayerCell,
): ThreePlayerAction[] => [
  { type: "select-god", godId: "ares" },
  { type: "select-ability", abilityId: "pick-a-fight" },
  { type: "cell", cell: from },
  { type: "cell", cell: to },
];

const mountTurn = (
  carrier: ThreePlayerCell,
  destination: ThreePlayerCell,
  rider: ThreePlayerCell,
  landing: ThreePlayerCell,
  pathId?: string,
): ThreePlayerAction[] => [
  { type: "select-god", godId: "chiron" },
  { type: "select-ability", abilityId: "mount" },
  { type: "cell", cell: carrier },
  { type: "cell", cell: destination },
  ...(pathId ? [{ type: "path", pathId } as ThreePlayerAction] : []),
  { type: "cell", cell: rider },
  { type: "cell", cell: landing },
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

const withoutCells = (
  pieces: PuzzlePiecePlacement[],
  cells: ThreePlayerCell[],
) => pieces.filter((placement) => !cells.includes(placement.cell));

const configurePlacements = (
  pieces: PuzzlePiecePlacement[],
  changes: Partial<
    Record<
      ThreePlayerCell,
      Partial<Omit<PuzzlePiecePlacement, "cell">>
    >
  >,
) => pieces.map((placement) => {
  const change = changes[placement.cell];
  return change ? { ...placement, ...change } : placement;
});

const turnCountLabel = (turns: number) => turns === 2 ? "two" : "three";

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
  state.players.white.gods = seed.whiteGods;
  const blackGods = seed.blackGods ?? ["death", "anubis", "midas"];
  const redGods = seed.redGods ?? GODS.map((god) => god.id)
    .filter((godId) =>
      !seed.whiteGods.includes(godId) &&
      !blackGods.includes(godId)
    )
    .slice(0, 3) as [GodId, GodId, GodId];
  state.players.red.gods = redGods;
  state.players.black.gods = blackGods;
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
  state.notice =
    `Checkmate both rival Kings within ${
      turnCountLabel(seed.solutionTurns.length)
    } divine turns.`;
  return state;
};

const seeds: PuzzleSeed[] = [
  {
    id: "three-frontier-fork",
    title: "Break the Frontier",
    boardVariant: "three-player",
    hint: "The mating knight cannot cross the frontier alone. Carry it through the long seam, then clear the far rook line.",
    solutionSummary: "Mount one knight on another across the frontier, then Air Lift the King to uncover the final rook line.",
    whiteGods: ["chiron", "quetzacoatl", "leonidas"],
    pieces: [
      ...withoutCells(
        yaltaPieces("three-player:11").filter((placement) =>
          placement.id !== "white-charge-knight"
        ),
        [
          "three-player:23",
          "three-player:1",
          "three-player:6",
          "three-player:8",
          "three-player:15",
        ],
      ),
      place("three-player:4", "knight", "white", "white-mount-carrier"),
      place("three-player:5", "knight", "white", "white-mount-rider"),
    ],
    solutionTurns: [
      mountTurn(
        "three-player:4",
        "three-player:10",
        "three-player:5",
        "three-player:9",
        "three-player:knight:three-player:4:long:0:0",
      ),
      airLiftTurn("three-player:28", "three-player:2"),
    ],
  },
  {
    id: "three-distant-rampart",
    title: "The Hidden Rampart",
    boardVariant: "three-player",
    hint: "Unmask the rook attack first. The surviving King can only be reached if the knight stops moving like a knight.",
    solutionSummary: "Air Lift the King to reveal the first mate, then Charge through the opposite rampart.",
    whiteGods: ["quetzacoatl", "chiron", "medusa"],
    redGods: ["leonidas", "salem", "death"],
    blackGods: ["teles", "artemis", "ares"],
    pieces: [
      ...configurePlacements(
        withoutCells(
          swapRivalOwners(yaltaPieces("three-player:12")),
          [
            "three-player:23",
            "three-player:1",
            "three-player:6",
            "three-player:8",
            "three-player:15",
            "three-player:16",
            "three-player:17",
          ],
        ),
        {
          "three-player:25": { owner: "white", type: "bishop" },
        },
      ),
      place(
        "three-player:0",
        "pawn",
        "black",
        "black-active-defender",
      ),
    ],
    solutionTurns: [
      airLiftTurn("three-player:28", "three-player:2"),
      chargeTurn("three-player:12", "three-player:9"),
    ],
  },
  {
    id: "hexagonal-crossfire",
    title: "Hexagonal Crossfire",
    boardVariant: "three-hexagonal",
    hint: "A distant knight can enter the hex only where it attacks two rivals. The second mate appears after the King leaves the rook's ray.",
    solutionSummary: "Pick a Fight to teleport the knight into the crossfire, then Air Lift the King and complete the circular follow-up.",
    whiteGods: ["ares", "quetzacoatl", "medusa"],
    pieces: withoutCells([
      place("three-hexagonal:16", "king", "red", "red-king"),
      place("three-hexagonal:8", "king", "black", "black-king"),
      ...["33", "32", "15", "31", "49"].map((cell) =>
        place(`three-hexagonal:${cell}`, "pawn", "red")
      ),
      place("three-hexagonal:28", "queen", "white"),
      place("three-hexagonal:43", "rook", "white"),
      place("three-hexagonal:26", "rook", "white"),
      place("three-hexagonal:9", "knight", "white", "white-pick-knight"),
      place("three-hexagonal:56", "rook", "white", "white-discovery-rook"),
      place("three-hexagonal:40", "king", "white", "white-airlift-king"),
    ], ["three-hexagonal:28", "three-hexagonal:26"]),
    whiteUpgrades: { "pick-a-fight": 2 },
    solutionTurns: [
      pickAFightTurn("three-hexagonal:9", "three-hexagonal:30"),
      airLiftTurn(
        "three-hexagonal:40",
        "three-hexagonal:9",
        ["three-hexagonal:10"],
      ),
    ],
  },
  {
    id: "hexagonal-last-gate",
    title: "The Last Hex Gate",
    boardVariant: "three-hexagonal",
    hint: "The King is masking a long rook ray. Recall it before turning the knight toward the last gate.",
    solutionSummary: "March Home to reveal the first mate, then Charge into the final hex gate.",
    whiteGods: ["leonidas", "chiron", "salem"],
    pieces: withoutCells(swapRivalOwners([
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
    ]), ["three-hexagonal:48", "three-hexagonal:28"]),
    solutionTurns: [
      marchHomeTurn(),
      chargeTurn("three-hexagonal:12", "three-hexagonal:29"),
    ],
  },
  {
    id: "triad-pincer",
    title: "Triad Pincer",
    boardVariant: "triad",
    hint: "The mating knight cannot reach the pincer alone. Carry it across the triad, then uncover the hidden rook attack.",
    solutionSummary: "Mount one knight on another to build the pincer, then Air Lift the King off the rook's line.",
    whiteGods: ["chiron", "quetzacoatl", "salem"],
    pieces: withoutCells([
      place("triad:111", "king", "red", "red-king"),
      place("triad:14", "king", "black", "black-king"),
      ...["112", "129", "128", "130", "146"].map((cell) =>
        place(`triad:${cell}`, "pawn", "red")
      ),
      place("triad:51", "queen", "white"),
      place("triad:99", "knight", "white", "white-mount-carrier"),
      place("triad:100", "knight", "white", "white-mount-rider"),
      place("triad:68", "rook", "white", "white-discovery-rook"),
      place("triad:50", "king", "white", "white-airlift-king"),
    ], ["triad:112", "triad:146"]),
    solutionTurns: [
      mountTurn("triad:99", "triad:132", "triad:100", "triad:131"),
      airLiftTurn("triad:50", "triad:48"),
    ],
  },
  {
    id: "triad-long-march",
    title: "The Long Triad",
    boardVariant: "triad",
    hint: "Reveal the short rook line first. The remaining King is vulnerable only to a straight-line knight assault.",
    solutionSummary: "Air Lift the King off the first file, then Charge down the long triad arm.",
    whiteGods: ["quetzacoatl", "chiron", "ares"],
    pieces: withoutCells(swapRivalOwners([
      place("triad:198", "king", "red", "red-king"),
      place("triad:14", "king", "black", "black-king"),
      ...["199", "216", "181", "217", "182", "163"].map((cell) =>
        place(`triad:${cell}`, "pawn", "red")
      ),
      place("triad:51", "queen", "white"),
      place("triad:112", "knight", "white", "white-charge-knight"),
      place("triad:68", "rook", "white", "white-discovery-rook"),
      place("triad:50", "king", "white", "white-airlift-king"),
    ]), ["triad:199", "triad:163"]),
    solutionTurns: [
      airLiftTurn("triad:50", "triad:48"),
      chargeTurn("triad:112", "triad:146"),
    ],
  },
  {
    id: "circular-convergence",
    title: "Circular Convergence",
    boardVariant: "three-circular",
    hint: "The inner-ring knight must teleport to a square where it attacks two enemies. The far King is hidden behind your own King.",
    solutionSummary: "Pick a Fight across the rings, then Air Lift the King to uncover the circular rook ray.",
    whiteGods: ["ares", "quetzacoatl", "medusa"],
    redGods: ["leonidas", "salem", "death"],
    blackGods: ["teles", "artemis", "chiron"],
    pieces: [
      ...configurePlacements(
        withoutCells([
          place("three-circular:6", "king", "red", "red-king"),
          ...["30", "7", "5", "31", "29"].map((cell) =>
            place(`three-circular:${cell}`, "pawn", "red")
          ),
          place("three-circular:16", "king", "black", "black-king"),
          ...["40", "15", "41", "39"].map((cell) =>
            place(`three-circular:${cell}`, "pawn", "black")
          ),
          place("three-circular:1", "knight", "white", "white-pick-knight"),
          place("three-circular:0", "rook", "white", "white-discovery-rook"),
          place("three-circular:23", "king", "white", "white-airlift-king"),
        ], ["three-circular:15"]),
        {
          "three-circular:39": { owner: "red" },
          "three-circular:40": { owner: "red" },
          "three-circular:41": { owner: "red" },
        },
      ),
      place(
        "three-circular:64",
        "queen",
        "white",
        "white-cage-queen",
      ),
      place(
        "three-circular:12",
        "pawn",
        "black",
        "black-active-defender",
      ),
    ],
    whiteUpgrades: { "pick-a-fight": 2 },
    solutionTurns: [
      pickAFightTurn("three-circular:1", "three-circular:28"),
      airLiftTurn("three-circular:23", "three-circular:1"),
    ],
  },
  {
    id: "circular-outer-ring",
    title: "Outer Ring",
    boardVariant: "three-circular",
    hint: "Open the circular file before attacking the outer cage. The knight must finish with a rook move.",
    solutionSummary: "Air Lift the King off the ring, then Charge outward to the final mating square.",
    whiteGods: ["quetzacoatl", "chiron", "teles"],
    pieces: withoutCells(swapRivalOwners([
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
    ]), ["three-circular:18"]),
    solutionTurns: [
      airLiftTurn("three-circular:23", "three-circular:1"),
      chargeTurn("three-circular:7", "three-circular:31"),
    ],
  },
  {
    id: "half-board-siege",
    title: "Half-Board Revelation",
    boardVariant: "three-half",
    hint: "Recall the King to expose the compact rook line. Then choose the correct straight route for the knight.",
    solutionSummary: "March Home to reveal the first mate, then Charge across the half-board.",
    whiteGods: ["leonidas", "chiron", "salem"],
    pieces: withoutCells(swapRivalOwners([
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
    ]), ["three-half:22"]),
    solutionTurns: [
      marchHomeTurn(),
      chargeTurn(
        "three-half:6",
        "three-half:14",
        "three-half:rook:three-half:6:white-red:3",
      ),
    ],
  },
  {
    id: "half-board-final-file",
    title: "The Final File",
    boardVariant: "three-half",
    hint: "One knight must carry another through the half-board seam. The final file opens only when the King teleports away.",
    solutionSummary: "Mount the attacking knight across the seam, then Air Lift the King clear of the last file.",
    whiteGods: ["chiron", "quetzacoatl", "salem"],
    pieces: withoutCells([
      place("three-half:28", "king", "red", "red-king"),
      place("three-half:24", "king", "black", "black-king"),
      ...["29", "27", "20", "21", "19"].map((cell) =>
        place(`three-half:${cell}`, "pawn", "red")
      ),
      place("three-half:1", "queen", "white"),
      place("three-half:17", "rook", "white"),
      place("three-half:6", "knight", "white", "white-mount-carrier"),
      place("three-half:38", "knight", "white", "white-mount-rider"),
      place("three-half:32", "rook", "white", "white-discovery-rook"),
      place("three-half:0", "king", "white", "white-airlift-king"),
    ], ["three-half:29", "three-half:17"]),
    solutionTurns: [
      mountTurn(
        "three-half:6",
        "three-half:23",
        "three-half:38",
        "three-half:22",
        "three-half:knight:three-half:6:white-red:3:0",
      ),
      airLiftTurn("three-half:0", "three-half:2"),
    ],
  },
];

export const THREE_PLAYER_PUZZLES: ThreePlayerPuzzleDefinition[] = seeds.map(
  (seed) => ({
    id: seed.id,
    mode: "three-player",
    title: seed.title,
    boardVariant: seed.boardVariant,
    objective:
      `Checkmate both rival Kings within ${
        turnCountLabel(seed.solutionTurns.length)
      } divine turns.`,
    hint: seed.hint,
    solutionSummary: seed.solutionSummary,
    playerTurns: seed.solutionTurns.length as 2 | 3,
    solutionTurns: seed.solutionTurns,
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
