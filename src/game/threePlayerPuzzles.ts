import { createDefaultThreePlayerConfig } from "./threePlayerConfig";
import {
  availableThreePlayerActions,
  createThreePlayerGame,
  isCompleteThreePlayerPlan,
  threePlayerReducer,
} from "./threePlayerEngine";
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

interface PuzzleLayout {
  redKing: ThreePlayerCell;
  blackKing: ThreePlayerCell;
  redKnight: ThreePlayerCell;
  redMate: ThreePlayerCell;
  redFollowUps?: ThreePlayerCell[];
  blackKnight: ThreePlayerCell;
  blackMate: ThreePlayerCell;
  blackFollowUps?: ThreePlayerCell[];
  redPawns: ThreePlayerCell[];
  rivalPieces?: Array<{
    cell: ThreePlayerCell;
    type: "pawn" | "knight" | "bishop" | "rook" | "queen";
    owner: "red" | "black";
  }>;
  supports: Array<{
    cell: ThreePlayerCell;
    type: "king" | "queen" | "rook" | "bishop";
  }>;
}

interface PuzzleSeed extends Omit<
  ThreePlayerPuzzleDefinition,
  "mode" | "objective" | "playerTurns" | "solutionTurns" | "cpuTurns" | "createState"
> {
  layout: PuzzleLayout;
  firstTurn?: ThreePlayerAction[];
  secondTurn?: ThreePlayerAction[];
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
  const { layout } = seed;
  state.phase = "play";
  state.activeSeat = "white";
  state.players.white.gods = ["chiron", "quetzacoatl", "leonidas"];
  state.players.red.gods = ["teles", "artemis", "kangus"];
  state.players.black.gods = ["death", "anubis", "midas"];
  state.players.white.orbs = { light: 10, dark: 10 };
  state.players.red.orbs = { light: 0, dark: 0 };
  state.players.black.orbs = { light: 0, dark: 0 };
  state.draft.available = [];
  state.draft.unused = [];
  state.draft.pickIndex = state.draft.order.length;
  state.rested = [];
  state.board = {
    [layout.redKing]: piece("red-king", "king", "red"),
    [layout.blackKing]: piece("black-king", "king", "black"),
    [layout.redKnight]: piece("white-red-mate-knight", "knight", "white"),
    [layout.blackKnight]: piece("white-black-mate-knight", "knight", "white"),
  };
  layout.redPawns.forEach((cell, index) => {
    state.board[cell] = piece(`red-pawn-${index + 1}`, "pawn", "red");
  });
  layout.rivalPieces?.forEach((rival, index) => {
    state.board[rival.cell] = piece(
      `${rival.owner}-support-${index + 1}`,
      rival.type,
      rival.owner,
    );
  });
  layout.supports.forEach((support, index) => {
    state.board[support.cell] = piece(
      `white-support-${index + 1}`,
      support.type,
      "white",
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

const completeMoveTurn = (
  state: ThreePlayerState,
  actions: ThreePlayerAction[],
  preferredCells: ThreePlayerCell[] = [],
) => {
  let staged = actions.reduce(threePlayerReducer, state);
  const completed = [...actions];
  let guard = 0;
  while (!isCompleteThreePlayerPlan(state, staged) && guard < 8) {
    guard += 1;
    const preferredCell = preferredCells.shift();
    const followUp = preferredCell
      ? availableThreePlayerActions(staged).find(
        (action) => action.type === "cell" && action.cell === preferredCell,
      )
      : availableThreePlayerActions(staged).find(
      (action) => action.type !== "cancel",
    );
    if (!followUp) break;
    const next = threePlayerReducer(staged, followUp);
    if (next === staged) break;
    completed.push(followUp);
    staged = next;
  }
  return completed;
};

const seeds: PuzzleSeed[] = [
  {
    id: "three-frontier-fork",
    title: "Frontier Fork",
    boardVariant: "three-player",
    hint: "The two knights already have separate targets. Start with the surrounded red King.",
    solutionSummary: "Use Chiron's Gallop to move the knight from cell 3 to 9, then Quetzacoatl's Slither from cell 4 to 14.",
    layout: {
      redKing: "three-player:24",
      blackKing: "three-player:31",
      redKnight: "three-player:3",
      redMate: "three-player:9",
      blackKnight: "three-player:4",
      blackMate: "three-player:14",
      redPawns: [],
      rivalPieces: [
        { cell: "three-player:16", type: "knight", owner: "red" },
        { cell: "three-player:25", type: "rook", owner: "red" },
        { cell: "three-player:23", type: "knight", owner: "black" },
        { cell: "three-player:30", type: "rook", owner: "black" },
      ],
      supports: [
        { cell: "three-player:8", type: "king" },
        { cell: "three-player:1", type: "queen" },
        { cell: "three-player:17", type: "rook" },
        { cell: "three-player:6", type: "queen" },
        { cell: "three-player:15", type: "bishop" },
        { cell: "three-player:22", type: "rook" },
      ],
    },
  },
  {
    id: "three-distant-rampart",
    title: "Distant Rampart",
    boardVariant: "three-player",
    hint: "One knight needs Chiron's rook-like Charge; save Leonidas for the other flank.",
    solutionSummary: "Use Chiron's Charge from cell 12 to 9, then Leonidas's Royal Step from cell 4 to 14.",
    layout: {
      redKing: "three-player:24",
      blackKing: "three-player:31",
      redKnight: "three-player:12",
      redMate: "three-player:9",
      blackKnight: "three-player:4",
      blackMate: "three-player:14",
      redPawns: [],
      rivalPieces: [
        { cell: "three-player:16", type: "knight", owner: "red" },
        { cell: "three-player:25", type: "rook", owner: "red" },
        { cell: "three-player:23", type: "knight", owner: "black" },
        { cell: "three-player:30", type: "rook", owner: "black" },
      ],
      supports: [
        { cell: "three-player:8", type: "king" },
        { cell: "three-player:1", type: "queen" },
        { cell: "three-player:17", type: "rook" },
        { cell: "three-player:6", type: "queen" },
        { cell: "three-player:15", type: "bishop" },
        { cell: "three-player:22", type: "rook" },
      ],
    },
    firstTurn: [
      { type: "select-god", godId: "chiron" },
      { type: "select-ability", abilityId: "charge" },
      { type: "cell", cell: "three-player:12" },
      { type: "cell", cell: "three-player:9" },
    ],
    secondTurn: [
      { type: "select-god", godId: "leonidas" },
      { type: "select-ability", abilityId: "royal-step" },
      { type: "cell", cell: "three-player:4" },
      { type: "cell", cell: "three-player:14" },
      {
        type: "path",
        pathId: "three-player:knight:three-player:4:long:1:0",
      },
    ],
  },
  {
    id: "hexagonal-crossfire",
    title: "Hexagonal Crossfire",
    boardVariant: "three-hexagonal",
    hint: "One knight closes the red hex; the other is waiting to strike through the white net.",
    solutionSummary: "Use Chiron's Gallop from cell 11 to 30, then Quetzacoatl's Slither from cell 13 to 27.",
    layout: {
      redKing: "three-hexagonal:16",
      blackKing: "three-hexagonal:8",
      redKnight: "three-hexagonal:11",
      redMate: "three-hexagonal:30",
      blackKnight: "three-hexagonal:13",
      blackMate: "three-hexagonal:27",
      redPawns: [
        "three-hexagonal:33",
        "three-hexagonal:32",
        "three-hexagonal:15",
        "three-hexagonal:31",
        "three-hexagonal:49",
      ],
      supports: [
        { cell: "three-hexagonal:10", type: "king" },
        { cell: "three-hexagonal:28", type: "queen" },
        { cell: "three-hexagonal:43", type: "rook" },
        { cell: "three-hexagonal:26", type: "rook" },
      ],
    },
  },
  {
    id: "hexagonal-last-gate",
    title: "The Last Gate",
    boardVariant: "three-hexagonal",
    hint: "The deeper knight jump seals every red exit without disturbing the black mating net.",
    solutionSummary: "Use Chiron's Gallop from cell 60 to 29, then Quetzacoatl's Slither from cell 13 to 27.",
    layout: {
      redKing: "three-hexagonal:15",
      blackKing: "three-hexagonal:8",
      redKnight: "three-hexagonal:60",
      redMate: "three-hexagonal:29",
      blackKnight: "three-hexagonal:13",
      blackMate: "three-hexagonal:27",
      redPawns: [
        "three-hexagonal:16",
        "three-hexagonal:32",
        "three-hexagonal:31",
        "three-hexagonal:14",
        "three-hexagonal:33",
        "three-hexagonal:30",
        "three-hexagonal:48",
      ],
      supports: [
        { cell: "three-hexagonal:10", type: "king" },
        { cell: "three-hexagonal:28", type: "queen" },
        { cell: "three-hexagonal:43", type: "rook" },
        { cell: "three-hexagonal:26", type: "rook" },
      ],
    },
  },
  {
    id: "triad-pincer",
    title: "Triad Pincer",
    boardVariant: "triad",
    hint: "Attack the crowded red corner before turning back toward the black edge.",
    solutionSummary: "Use Chiron's Gallop from cell 116 to 131, then Quetzacoatl's Slither from cell 49 to 34.",
    layout: {
      redKing: "triad:111",
      blackKing: "triad:14",
      redKnight: "triad:116",
      redMate: "triad:131",
      blackKnight: "triad:49",
      blackMate: "triad:34",
      redPawns: ["triad:112", "triad:129", "triad:128", "triad:130", "triad:146"],
      supports: [
        { cell: "triad:48", type: "king" },
        { cell: "triad:51", type: "queen" },
      ],
    },
  },
  {
    id: "triad-long-march",
    title: "The Long March",
    boardVariant: "triad",
    hint: "The first mate is far across the triad. The second is already prepared near your King.",
    solutionSummary: "Use Chiron's Gallop from cell 113 to 146, then Quetzacoatl's Slither from cell 49 to 34.",
    layout: {
      redKing: "triad:198",
      blackKing: "triad:14",
      redKnight: "triad:113",
      redMate: "triad:146",
      blackKnight: "triad:49",
      blackMate: "triad:34",
      redPawns: [
        "triad:199",
        "triad:216",
        "triad:181",
        "triad:217",
        "triad:182",
        "triad:163",
      ],
      supports: [
        { cell: "triad:48", type: "king" },
        { cell: "triad:51", type: "queen" },
      ],
    },
  },
  {
    id: "circular-convergence",
    title: "Circular Convergence",
    boardVariant: "three-circular",
    hint: "Follow the ring inward: the red cage falls first, then the black King.",
    solutionSummary: "Use Chiron's Gallop from cell 50 through cell 27, then Quetzacoatl's Slither from cell 4 to 26.",
    firstTurn: [
      { type: "select-god", godId: "chiron" },
      { type: "select-ability", abilityId: "gallop" },
      { type: "cell", cell: "three-circular:50" },
      { type: "cell", cell: "three-circular:27" },
      { type: "cell", cell: "three-circular:29" },
    ],
    secondTurn: [
      { type: "select-god", godId: "quetzacoatl" },
      { type: "select-ability", abilityId: "flight" },
      { type: "cell", cell: "three-circular:50" },
      { type: "cell", cell: "three-circular:4" },
      { type: "cell", cell: "three-circular:29" },
      { type: "cell", cell: "three-circular:25" },
    ],
    layout: {
      redKing: "three-circular:6",
      blackKing: "three-circular:0",
      redKnight: "three-circular:50",
      redMate: "three-circular:27",
      redFollowUps: ["three-circular:29"],
      blackKnight: "three-circular:4",
      blackMate: "three-circular:26",
      redPawns: [
        "three-circular:30",
        "three-circular:7",
        "three-circular:5",
        "three-circular:31",
        "three-circular:29",
      ],
      supports: [
        { cell: "three-circular:2", type: "king" },
        { cell: "three-circular:27", type: "queen" },
        { cell: "three-circular:47", type: "rook" },
      ],
    },
  },
  {
    id: "circular-outer-ring",
    title: "Outer Ring",
    boardVariant: "three-circular",
    hint: "The extra bishop changes the outer lanes, but the same two-stage knight attack remains.",
    solutionSummary: "Use Chiron's Gallop from cell 50 through cell 27, then Quetzacoatl's Slither through the inner ring.",
    firstTurn: [
      { type: "select-god", godId: "chiron" },
      { type: "select-ability", abilityId: "gallop" },
      { type: "cell", cell: "three-circular:50" },
      { type: "cell", cell: "three-circular:27" },
      { type: "cell", cell: "three-circular:29" },
    ],
    secondTurn: [
      { type: "select-god", godId: "quetzacoatl" },
      { type: "select-ability", abilityId: "flight" },
      { type: "cell", cell: "three-circular:50" },
      { type: "cell", cell: "three-circular:4" },
      { type: "cell", cell: "three-circular:29" },
      { type: "cell", cell: "three-circular:25" },
    ],
    layout: {
      redKing: "three-circular:6",
      blackKing: "three-circular:0",
      redKnight: "three-circular:50",
      redMate: "three-circular:27",
      redFollowUps: ["three-circular:29"],
      blackKnight: "three-circular:4",
      blackMate: "three-circular:26",
      redPawns: [
        "three-circular:30",
        "three-circular:7",
        "three-circular:5",
        "three-circular:31",
        "three-circular:29",
      ],
      supports: [
        { cell: "three-circular:2", type: "king" },
        { cell: "three-circular:27", type: "queen" },
        { cell: "three-circular:47", type: "rook" },
        { cell: "three-circular:1", type: "bishop" },
      ],
    },
  },
  {
    id: "half-board-siege",
    title: "Half-Board Siege",
    boardVariant: "three-half",
    hint: "The compact board makes both nets visible. Complete the red mate before the black one.",
    solutionSummary: "Use Chiron's Gallop from cell 4 to 14, then Quetzacoatl's Slither from cell 3 to 9.",
    layout: {
      redKing: "three-half:31",
      blackKing: "three-half:24",
      redKnight: "three-half:4",
      redMate: "three-half:14",
      blackKnight: "three-half:3",
      blackMate: "three-half:9",
      redPawns: ["three-half:30", "three-half:23", "three-half:22"],
      supports: [
        { cell: "three-half:8", type: "king" },
        { cell: "three-half:1", type: "queen" },
        { cell: "three-half:17", type: "rook" },
      ],
    },
  },
  {
    id: "half-board-final-file",
    title: "The Final File",
    boardVariant: "three-half",
    hint: "The red King has more pawns but no flight square. The black King is already contained.",
    solutionSummary: "Use Chiron's Gallop from cell 5 to 22, then Quetzacoatl's Slither from cell 3 to 9.",
    layout: {
      redKing: "three-half:28",
      blackKing: "three-half:24",
      redKnight: "three-half:5",
      redMate: "three-half:22",
      blackKnight: "three-half:3",
      blackMate: "three-half:9",
      redPawns: [
        "three-half:29",
        "three-half:27",
        "three-half:20",
        "three-half:21",
        "three-half:19",
      ],
      supports: [
        { cell: "three-half:8", type: "king" },
        { cell: "three-half:1", type: "queen" },
        { cell: "three-half:17", type: "rook" },
      ],
    },
  },
];

export const THREE_PLAYER_PUZZLES: ThreePlayerPuzzleDefinition[] = seeds.map(
  (seed) => {
    const createState = (playerName?: string) =>
      createPuzzleState(seed, playerName);
    const firstTurn = seed.firstTurn ?? completeMoveTurn(createState(), [
      { type: "select-god", godId: "chiron" },
      { type: "select-ability", abilityId: "gallop" },
      { type: "cell", cell: seed.layout.redKnight },
      { type: "cell", cell: seed.layout.redMate },
    ], [...(seed.layout.redFollowUps ?? [])]);
    const afterFirst = firstTurn.reduce(threePlayerReducer, createState());
    const cpuTurn: ThreePlayerAction[] = [
      { type: "select-god", godId: "death" },
      { type: "select-ability", abilityId: "marked" },
      { type: "pass" },
    ];
    const afterCpu = cpuTurn.reduce(threePlayerReducer, afterFirst);
    const secondTurn = seed.secondTurn ?? completeMoveTurn(afterCpu, [
      { type: "select-god", godId: "quetzacoatl" },
      { type: "select-ability", abilityId: "flight" },
      { type: "cell", cell: seed.layout.blackKnight },
      { type: "cell", cell: seed.layout.blackMate },
    ], [...(seed.layout.blackFollowUps ?? [])]);
    return {
      id: seed.id,
      mode: "three-player",
      title: seed.title,
      boardVariant: seed.boardVariant,
      objective: "Checkmate both rival Kings within two divine turns.",
      hint: seed.hint,
      solutionSummary: seed.solutionSummary,
      playerTurns: 2,
      solutionTurns: [firstTurn, secondTurn],
      cpuTurns: [cpuTurn],
      createState,
    };
  },
);

export const THREE_PLAYER_PUZZLE_BY_ID = Object.fromEntries(
  THREE_PLAYER_PUZZLES.map((puzzle) => [puzzle.id, puzzle]),
) as Record<ThreePlayerPuzzleId, ThreePlayerPuzzleDefinition>;

export const isThreePlayerPuzzleId = (
  puzzleId: PuzzleId,
): puzzleId is ThreePlayerPuzzleId => puzzleId in THREE_PLAYER_PUZZLE_BY_ID;
