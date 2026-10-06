import {
  adjacentSquares,
  allSquares,
  applyMove,
  coords,
  createInitialBoard,
  distance,
  flightPathSquares,
  isInCheck,
  isSquareAttacked,
  kingSquare,
  legalTargets,
  lineOfSight,
  ordinaryAttackedPieceSquares,
  pathSquares,
  pieceValue,
  pseudoTargets,
  squareAt,
  squareColor,
} from "./chess";
import { abilityLevel, GOD_BY_ID, GODS } from "./gods";
import { hasCompleteTurn } from "./completeTurnSearch";
import { qualifyingSnake } from "./slither";
import type {
  ClassicMoveFirstCandidate,
  ClassicMoveFirstMove,
  Color,
  GameMode,
  GameState,
  GodId,
  GravePiece,
  Move,
  Piece,
  PieceType,
  Square,
} from "./types";
import { opposite } from "./types";

export type GameAction =
  | { type: "draft"; godId: GodId }
  | { type: "auto-draft"; godId: GodId }
  | { type: "load-game"; state: GameState }
  | { type: "select-god"; godId: GodId }
  | { type: "clear-god" }
  | { type: "select-ability"; abilityId: string }
  | {
    type: "commit-move-first";
    godId: GodId;
    abilityId: string;
    move: ClassicMoveFirstMove;
    expectedActor: Color;
    expectedTurn: number;
  }
  | { type: "confirm-ability" }
  | { type: "square"; square: Square }
  | { type: "grave"; pieceId: string }
  | { type: "marked-execute" }
  | { type: "rage-resolve"; spareFriendly: boolean }
  | { type: "barter"; give?: Color }
  | { type: "orb"; orb: Color }
  | { type: "resurrect-more"; revive: boolean }
  | { type: "harden-choice"; keep: boolean }
  | { type: "siphon"; amount: 0 | 1 | 2 }
  | { type: "pass" }
  | { type: "cancel" }
  | { type: "preview-upgrade"; godId?: GodId; abilityId?: string }
  | { type: "upgrade"; abilityId: string }
  | {
    type: "adjudicate-no-turn";
    activeColor: Color;
    turn: number;
  }
  | { type: "new-game"; mode: GameMode; aiDifficulty: number }
  | { type: "restart" };

const log = (state: GameState, entry: string) => {
  state.history = [entry, ...state.history].slice(0, 30);
};

const setClassicWinner = (
  state: GameState,
  winner: Color,
  reason: "checkmate" | "king-death",
) => {
  state.phase = "gameover";
  state.winner = winner;
  state.result = { kind: "winner", winner, reason };
  if (state.gameMode === "puzzle" && winner !== state.aiColor) {
    state.puzzleFailed = false;
  }
};

const setClassicStalemate = (state: GameState) => {
  state.phase = "gameover";
  state.winner = undefined;
  state.result = { kind: "draw", reason: "stalemate" };
};

const colorName = (color: Color) => color[0].toUpperCase() + color.slice(1);
const pieceName = (piece: Piece) => piece.type[0].toUpperCase() + piece.type.slice(1);
const allowsPuzzleKingCapture = (state: GameState) =>
  state.gameMode === "puzzle";

const present = (
  state: GameState,
  event: Omit<NonNullable<GameState["presentation"]>, "id" | "color">,
) => {
  state.presentation = {
    ...event,
    id: state.nextPresentationId,
    color: state.activeColor,
  };
  state.nextPresentationId += 1;
};

const abilityDescription = (state: GameState, detail: string) => {
  const god = GOD_BY_ID[state.selectedGod!];
  const ability = god.abilities.find((candidate) => candidate.id === state.selectedAbility);
  return `${colorName(state.activeColor)} used ${ability?.name ?? state.selectedAbility} with ${god.name}${detail}.`;
};

const mountPrimaryDetail = (
  moving: Piece,
  from: Square,
  to: Square,
  captured?: Piece,
) =>
  `${pieceName(moving)} ${from} -> ${to}${
    captured ? `, capturing ${pieceName(captured)} on ${to}` : ""
  }`;

const mountDescription = (
  state: GameState,
  history: string[],
  riderCount: number,
) => abilityDescription(
  state,
  `: ${history.join("; ")}; ${riderCount} rider${riderCount === 1 ? "" : "s"}`,
);

const mountPrimaryIsValid = (state: GameState) => {
  if (
    state.pending?.abilityId !== "mount" ||
    !["mount-rider", "mount-place"].includes(state.pending.step) ||
    !state.pending.destination
  ) return false;
  const primary = state.board[state.pending.destination];
  return primary?.controller === state.activeColor && primary.type === "knight";
};

const pendingMountHistory = (state: GameState) => {
  if (state.pending?.mountHistory?.length) return state.pending.mountHistory;
  const primary = state.pending?.destination
    ? state.board[state.pending.destination]
    : undefined;
  return primary && state.pending?.source && state.pending.destination
    ? [mountPrimaryDetail(primary, state.pending.source, state.pending.destination)]
    : [];
};

export const createGame = (
  whitePlayer: 1 | 2 = Math.random() < 0.5 ? 1 : 2,
  options: {
    mode?: GameMode;
    aiDifficulty?: number;
    playerName?: string;
    hostName?: string;
    guestName?: string;
  } = {},
): GameState => {
  const gameMode = options.mode ?? "local";
  const aiDifficulty = Math.max(1, Math.min(10, Math.round(options.aiDifficulty ?? 5)));
  const aiColor = gameMode === "puzzle"
    ? "black"
    : gameMode === "ai"
      ? (whitePlayer === 2 ? "white" : "black")
      : undefined;
  const onlineHostColor = gameMode === "online" ? (whitePlayer === 1 ? "white" : "black") : undefined;
  const playerName = options.playerName?.trim() || "Player 1";
  const whiteName = gameMode === "puzzle"
    ? playerName
    : gameMode === "ai" && aiColor === "white"
    ? "Divine AI"
    : gameMode === "ai"
      ? playerName
      : gameMode === "online"
        ? (onlineHostColor === "white" ? options.hostName ?? "Host" : options.guestName ?? "Guest")
        : `Player ${whitePlayer}`;
  const blackName = gameMode === "puzzle"
    ? "Divine AI"
    : gameMode === "ai" && aiColor === "black"
    ? "Divine AI"
    : gameMode === "ai"
      ? playerName
      : gameMode === "online"
        ? (onlineHostColor === "black" ? options.hostName ?? "Host" : options.guestName ?? "Guest")
        : `Player ${whitePlayer === 1 ? 2 : 1}`;
  return {
  phase: "draft",
  gameMode,
  aiDifficulty,
  aiColor,
  onlineHostColor,
  board: createInitialBoard(),
  players: {
    white: {
      name: whiteName,
      color: "white",
      gods: [],
      orbs: { white: 0, black: 0 },
      graveyard: [],
      upgrades: {},
    },
    black: {
      name: blackName,
      color: "black",
      gods: [],
      orbs: { white: 0, black: 0 },
      graveyard: [],
      upgrades: {},
    },
  },
  activeColor: "white",
  whitePlayer,
  draft: {
    order: ["white", "black", "black", "white", "white", "black"],
    pickIndex: 0,
    available: GODS.map((god) => god.id),
  },
  rested: [],
  round: 1,
  turn: 1,
  upgradeQueue: [],
  legalTargets: [],
  bananas: [],
  stealth: { white: [], black: [] },
  orbAnimations: [],
  nextOrbAnimationId: 1,
  captureAnimations: [],
  nextCaptureAnimationId: 1,
  nextPresentationId: 1,
  history: [
    gameMode === "ai"
      ? `${whiteName} was chosen for White.`
      : gameMode === "online"
        ? `${whiteName} was chosen for White.`
      : `Player ${whitePlayer} was chosen for White.`,
  ],
  notice: "White drafts first. Choose a god.",
  };
};

const cloneState = (state: GameState): GameState => structuredClone(state);

const FIRST_ABILITY_IDS = new Set(
  GODS.map((god) => god.abilities[0].id),
);

const currentLevel = (state: GameState, abilityId: string) =>
  abilityLevel(state.players[state.activeColor].upgrades, abilityId);

const addOrbs = (state: GameState, color: Color, white = 0, black = 0) => {
  state.players[color].orbs.white = Math.max(0, state.players[color].orbs.white + white);
  state.players[color].orbs.black = Math.max(0, state.players[color].orbs.black + black);
};

const findSquareById = (board: Record<Square, Piece>, pieceId: string) =>
  Object.entries(board).find(([, piece]) => piece.id === pieceId)?.[0];

const bananaOnMovePath = (state: GameState, from: Square, requestedTo: Square, controller: Color) =>
  [...pathSquares(from, requestedTo), requestedTo].find((square) =>
    state.bananas.some((banana) => banana.square === square && banana.owner !== controller),
  );

const bananaPlacementTargets = (
  board: Record<Square, Piece>,
  center: Square,
  bananas: GameState["bananas"],
) => adjacentSquares(center, false).filter(
  (square) => !board[square] && !bananas.some((banana) => banana.square === square),
);

const safeBananaPlacementsAfterMove = (state: GameState, from: Square, requestedTo: Square) => {
  const moving = state.board[from];
  if (!moving) return { destination: requestedTo, placements: [] as Square[] };
  const peel = bananaOnMovePath(state, from, requestedTo, moving.controller);
  const destination = peel ?? requestedTo;
  const simulated = applyMove(state.board, { from, to: destination }, state.enPassant).board;
  const remainingBananas = peel
    ? state.bananas.filter((banana) => banana.square !== peel)
    : state.bananas;
  const placements = bananaPlacementTargets(simulated, destination, remainingBananas)
    .filter((placement) => !isInCheck(simulated, moving.controller, [
      ...remainingBananas,
      { square: placement, owner: moving.controller, expires: "god" },
    ]));
  return { destination, placements };
};

const sendCapturedPieceToGraveyard = (state: GameState, piece: Piece, source: Square) => {
  state.players[piece.color].graveyard.push({ piece, capturedOnTurn: state.turn });
  state.captureAnimations.push({
    id: state.nextCaptureAnimationId,
    player: piece.color,
    piece: structuredClone(piece),
    source,
    total: state.players[piece.color].graveyard.length,
  });
  state.nextCaptureAnimationId += 1;
  state.captureAnimations = state.captureAnimations.slice(-12);
};

const captureAt = (
  state: GameState,
  square: Square,
  captor: Color,
  allowKing = false,
) => {
  const piece = state.board[square];
  if (
    !piece ||
    (!allowKing && !allowsPuzzleKingCapture(state) && piece.type === "king") ||
    piece.status.hardened
  ) return undefined;
  delete state.board[square];
  sendCapturedPieceToGraveyard(state, piece, square);
  if (
    piece.status.ritual &&
    (piece.status.ritual.expires === "kangus" || state.turn <= piece.status.ritual.expires)
  ) {
    const reward = currentLevelForOwner(state, piece.status.ritual.owner, "ritual-sacrifice") >= 3 ? 4 : 3;
    addOrbs(state, piece.status.ritual.owner, reward, reward);
    log(state, `${colorName(piece.status.ritual.owner)}'s ritual returns ${reward} of each orb.`);
  }
  if (piece.type === "king") {
    setClassicWinner(state, captor, "king-death");
  }
  return piece;
};

const currentLevelForOwner = (state: GameState, color: Color, abilityId: string) =>
  abilityLevel(state.players[color].upgrades, abilityId);

const moveDirect = (state: GameState, from: Square, requestedTo: Square, teleport = false) => {
  const moving = state.board[from];
  if (
    !moving ||
    (state.board[requestedTo]?.type === "king" && !allowsPuzzleKingCapture(state))
  ) return undefined;
  const peel = teleport
    ? undefined
    : bananaOnMovePath(state, from, requestedTo, moving.controller);
  const to = peel ?? requestedTo;
  const result = applyMove(
    state.board,
    { from, to },
    state.enPassant,
    !teleport,
    allowsPuzzleKingCapture(state),
  );
  state.board = result.board;
  state.enPassant = result.enPassant;
  if (result.captured) {
    sendCapturedPieceToGraveyard(state, result.captured, result.capturedSquare ?? to);
    if (
      result.captured.status.ritual &&
      (result.captured.status.ritual.expires === "kangus" || state.turn <= result.captured.status.ritual.expires)
    ) {
      const reward = currentLevelForOwner(state, result.captured.status.ritual.owner, "ritual-sacrifice") >= 3 ? 4 : 3;
      addOrbs(state, result.captured.status.ritual.owner, reward, reward);
    }
    if (result.captured.type === "king") {
      setClassicWinner(state, moving.controller, "king-death");
    }
  }
  if (peel) {
    state.bananas = state.bananas.filter((banana) => banana.square !== peel);
    log(state, `${moving.type} slipped on a banana peel at ${peel}.`);
  }
  return { piece: state.board[to], from, to, captured: result.captured };
};

const expireStatuses = (state: GameState, colorWhoseTurnEnded: Color) => {
  for (const [square, piece] of Object.entries(state.board)) {
    const status = { ...piece.status };
    if (typeof status.hardened === "number" && piece.controller !== colorWhoseTurnEnded) {
      if (status.hardened <= 1) {
        if (currentLevelForOwner(state, piece.controller, "harden") >= 2) status.hardened = "choice";
        else delete status.hardened;
      } else {
        status.hardened -= 1;
      }
    }
    for (const key of ["frozen", "polymorphed"] as const) {
      const value = status[key];
      if (piece.controller === colorWhoseTurnEnded && typeof value === "number") {
        if (value <= 1) delete status[key];
        else status[key] = value - 1;
      }
    }
    if (piece.controller === colorWhoseTurnEnded && typeof status.chargeUntil === "number") {
      if (status.chargeUntil <= 1) delete status.chargeUntil;
      else status.chargeUntil -= 1;
    }
    if (piece.controller === colorWhoseTurnEnded) {
      delete status.luredBy;
      delete status.movedThisTurn;
    }
    if (status.ritual && typeof status.ritual.expires === "number" && state.turn >= status.ritual.expires) {
      delete status.ritual;
    }
    state.board[square] = { ...piece, status };
  }
  for (const [square, piece] of Object.entries(state.board)) {
    if (!piece.status.gazing) continue;
    const gazeStillActive = Object.values(state.board).some(
      (target) => target.status.frozen && target.status.frozenBy === piece.controller,
    );
    if (!gazeStillActive) {
      const status = { ...piece.status };
      delete status.gazing;
      state.board[square] = { ...piece, status };
    }
  }
  state.bananas = state.bananas.filter((banana) =>
    typeof banana.expires === "number" ? banana.expires > state.turn : true,
  );
};

const preparedDetails = (piece: Piece) => {
  if (!piece.status.prepared) return undefined;
  return typeof piece.status.prepared === "boolean"
    ? { owner: piece.controller, level: 1 as const }
    : piece.status.prepared;
};

const preparedShotTargets = (state: GameState, square: Square) =>
  ordinaryAttackedPieceSquares(state.board, square, state.bananas)
    .filter((target) => {
      const piece = state.board[target];
      return piece?.controller === opposite(state.activeColor) &&
        piece.type !== "king";
    })
    .filter((target) => {
      const simulated = { ...state.board };
      delete simulated[target];
      return !isInCheck(simulated, state.activeColor, state.bananas);
    });

const queuePreparedShot = (state: GameState) => {
  const prepared = Object.entries(state.board).filter(([square, piece]) => {
    const details = preparedDetails(piece);
    if (!details || details.owner !== state.activeColor || piece.controller !== state.activeColor) return false;
    if (preparedShotTargets(state, square).length) return true;
    if (details.level === 1) delete piece.status.prepared;
    return false;
  });
  if (!prepared.length) return false;
  state.pending = { godId: "artemis", abilityId: "snipe-shot", step: "snipe-source" };
  state.legalTargets = prepared.map(([square]) => square);
  state.notice = "Prepared Shot: choose a highlighted prepared piece, then choose an enemy it attacks. You may also skip.";
  return true;
};

const queueHardenChoice = (state: GameState) => {
  const choices = Object.entries(state.board)
    .filter(([, piece]) => piece.controller === state.activeColor && piece.status.hardened === "choice")
    .map(([square]) => square);
  if (!choices.length) return false;
  state.pending = { godId: "anubis", abilityId: "harden-choice", step: "harden-choice" };
  state.legalTargets = choices;
  state.notice = "Harden: choose a piece whose initial duration ended.";
  return true;
};

const resolveStartOfTurn = (state: GameState) => {
  for (const piece of Object.values(state.board)) {
    if (piece.status.poisonedBy === state.activeColor) {
      delete piece.status.poisoned;
      delete piece.status.poisonedBy;
    }
  }
  const returns = state.stealth[state.activeColor].filter((move) => move.returnOnTurn <= state.turn);
  for (const returning of returns) {
    if (state.board[returning.destination] && !state.board[returning.destination].status.hardened) {
      captureAt(state, returning.destination, state.activeColor, true);
    }
    if (!state.board[returning.destination]) {
      state.board[returning.destination] = {
        ...returning.piece,
        status: { ...returning.piece.status, movedThisTurn: true },
      };
      log(state, `${colorName(state.activeColor)}'s ${returning.piece.type} emerged from stealth on ${returning.destination}.`);
    } else {
      sendCapturedPieceToGraveyard(state, returning.piece, returning.destination);
      log(state, `${colorName(state.activeColor)}'s stealthed piece could not return.`);
    }
  }
  state.stealth[state.activeColor] = state.stealth[state.activeColor].filter((move) => move.returnOnTurn > state.turn);
  if (!queueHardenChoice(state)) queuePreparedShot(state);
};

const resolveMarkedForDeath = (state: GameState) => {
  for (const [square, piece] of Object.entries(state.board)) {
    if (
      piece.status.markedForDeath?.owner !== state.activeColor ||
      piece.status.markedForDeath.round > state.round
    ) {
      continue;
    }
    if (piece.type === "king") {
      delete piece.status.markedForDeath;
      continue;
    }
    delete state.board[square];
    sendCapturedPieceToGraveyard(state, piece, square);
    addOrbs(state, state.activeColor, 0, 3);
    log(state, `Death claimed the marked ${piece.type} on ${square}.`);
  }
};

const finishTurn = (state: GameState, description: string) => {
  if (state.selectedGod === "death") resolveMarkedForDeath(state);
  const actingGod = state.selectedGod;
  if (state.selectedGod && !state.rested.includes(state.selectedGod)) state.rested.push(state.selectedGod);
  log(state, description);
  state.lastAction = description;
  state.selectedGod = undefined;
  state.selectedAbility = undefined;
  state.selectedSquare = undefined;
  state.pending = undefined;
  state.legalTargets = [];
  if (state.phase === "gameover") return;

  const endingColor = state.activeColor;
  const keepsTurn = state.bonusTurn === endingColor;
  if (
    state.gameMode === "puzzle" &&
    endingColor !== state.aiColor &&
    !keepsTurn &&
    state.puzzlePlayerTurnsRemaining !== undefined
  ) {
    state.puzzlePlayerTurnsRemaining = Math.max(0, state.puzzlePlayerTurnsRemaining - 1);
    if (state.puzzlePlayerTurnsRemaining === 0) state.puzzleFailed = true;
  }
  if (
    state.gameMode === "puzzle" &&
    state.aiColor &&
    endingColor !== state.aiColor &&
    isInCheck(state.board, state.aiColor, state.bananas)
  ) {
    for (const piece of Object.values(state.board)) {
      if (piece.controller === state.aiColor) delete piece.status.movedThisTurn;
    }
  }
  if (
    state.gameMode === "puzzle" &&
    endingColor === state.aiColor &&
    actingGod &&
    (state.puzzlePlayerTurnsRemaining ?? 0) > 0
  ) {
    state.rested = state.rested.filter((godId) => godId !== actingGod);
  }
  expireStatuses(state, endingColor);
  const drafted = [...state.players.white.gods, ...state.players.black.gods];
  if (drafted.length === 6 && drafted.every((god) => state.rested.includes(god))) {
    state.phase = "upgrade";
    state.upgradeQueue = ["white", "black"];
    state.activeColor = "white";
    state.notice = "The gods awaken. White upgrades one ability.";
    return;
  }

  state.turn += 1;
  state.activeColor = keepsTurn ? endingColor : opposite(endingColor);
  state.bonusTurn = undefined;
  resolveStartOfTurn(state);
  state.notice = `${colorName(state.activeColor)} to act. Choose an available god.`;
};

const abilityCost = (state: GameState, abilityId: string) => {
  const god = GOD_BY_ID[state.selectedGod!];
  const ability = god.abilities.find((candidate) => candidate.id === abilityId)!;
  return { white: ability.cost?.white ?? 0, black: ability.cost?.black ?? 0 };
};

const payCost = (state: GameState, abilityId: string) => {
  const cost = abilityCost(state, abilityId);
  const orbs = state.players[state.activeColor].orbs;
  if (orbs.white < cost.white || orbs.black < cost.black) return false;
  addOrbs(state, state.activeColor, -cost.white, -cost.black);
  return true;
};

const refundCost = (state: GameState) => {
  if (!state.selectedAbility) return;
  const cost = abilityCost(state, state.selectedAbility);
  addOrbs(state, state.activeColor, cost.white, cost.black);
};

const COMMITTED_PENDING_STEPS = new Set([
  "banana",
  "barter-choice",
  "cull-choice",
  "enchant-followup-move",
  "funding",
  "hire",
  "marked-choice",
  "mount-place",
  "mount-rider",
  "rage-choice",
  "resurrect-more",
  "siphon-choice",
  "slither",
  "slither-orb",
]);

export const hasCommittedClassicAction = (state: GameState) => {
  const pending = state.pending;
  if (!pending) return false;
  if (COMMITTED_PENDING_STEPS.has(pending.step)) return true;
  if (
    ["grave", "revive-place"].includes(pending.step) &&
    Boolean(pending.selected?.length)
  ) return true;
  return pending.abilityId === "hex" && Boolean(pending.selected?.length);
};

const allowedEnchantTypes = (level: number): PieceType[] =>
  level === 1
    ? ["pawn", "knight", "bishop"]
    : level === 2
      ? ["pawn", "knight", "bishop", "rook"]
      : ["pawn", "knight", "bishop", "rook", "queen"];

const compelledLuredSquares = (state: GameState) =>
  Object.entries(state.board)
    .filter(([source, candidate]) => {
      if (candidate.controller !== state.activeColor || !candidate.status.luredBy) return false;
      const queen = Object.entries(state.board).find(
        ([, target]) => target.controller === candidate.status.luredBy && target.type === "queen",
      )?.[0];
      if (!queen) return false;
      return legalTargets(state.board, source, { enPassant: state.enPassant, bananas: state.bananas })
        .some((target) => distance(target, queen) < distance(source, queen));
    })
    .map(([square]) => square);

const airStrikePassengerTypes = (level: number): PieceType[] =>
  level >= 3 ? ["pawn", "knight", "bishop"] : ["pawn"];

const airStrikePassengerSquares = (state: GameState, carrierSquare: Square) => {
  const allowedTypes = airStrikePassengerTypes(currentLevel(state, "air-strike"));
  return adjacentSquares(carrierSquare).filter((square) => {
    const passenger = state.board[square];
    return (
      passenger?.controller === state.activeColor &&
      allowedTypes.includes(passenger.type) &&
      !passenger.status.hardened &&
      !passenger.status.frozen &&
      !passenger.status.gazing &&
      !passenger.status.movedThisTurn
    );
  });
};

const airStrikeDropTargets = (
  state: GameState,
  carrierSquare: Square,
  carrierDestination: Square,
  passengerSquare: Square,
) => {
  const passenger = state.board[passengerSquare];
  if (!passenger) return [];
  const path = flightPathSquares(carrierSquare, carrierDestination);
  const board = structuredClone(state.board);
  delete board[passengerSquare];
  const afterCarrier = applyMove(
    board,
    { from: carrierSquare, to: carrierDestination },
    state.enPassant,
  ).board;
  const level = currentLevel(state, "air-strike");
  const firstEnemy = level >= 2
    ? path.find((dropSquare) => {
      const occupant = afterCarrier[dropSquare];
      return occupant && occupant.controller !== state.activeColor;
    })
    : undefined;

  return path.filter((dropSquare) => {
    const dropBoard = structuredClone(afterCarrier);
    const occupant = dropBoard[dropSquare];
    if (occupant) {
      if (
        dropSquare !== firstEnemy ||
        occupant.controller === state.activeColor ||
        (occupant.type === "king" && !allowsPuzzleKingCapture(state)) ||
        occupant.status.hardened
      ) return false;
    }
    delete dropBoard[dropSquare];
    dropBoard[dropSquare] = {
      ...passenger,
      hasMoved: true,
      status: { ...passenger.status, movedThisTurn: true },
    };
    return !isInCheck(dropBoard, state.activeColor, state.bananas);
  });
};

const airStrikeLandingTargets = (
  state: GameState,
  carrierSquare: Square,
  passengerSquare: Square,
) => {
  const carrier = state.board[carrierSquare];
  if (!carrier) return [];
  const board = structuredClone(state.board);
  delete board[passengerSquare];
  const targets = pseudoTargets(board, carrierSquare, {
    enPassant: state.enPassant,
    ignoreBlockers: true,
    noCapture: true,
    bananas: state.bananas,
  }).filter((target) => {
    if (board[target]) return false;
    if (carrier.type === "king" && distance(carrierSquare, target) > 1) return false;
    return airStrikeDropTargets(state, carrierSquare, target, passengerSquare).length > 0;
  });
  if (!carrier.status.luredBy) return targets;
  const queen = Object.entries(state.board).find(
    ([, target]) => target.controller === carrier.status.luredBy && target.type === "queen",
  )?.[0];
  if (!queen) return targets;
  const closer = targets.filter(
    (target) => distance(target, queen) < distance(carrierSquare, queen),
  );
  return closer.length ? closer : targets;
};

const sourceIsAllowed = (state: GameState, square: Square) => {
  const piece = state.board[square];
  if (!piece || piece.status.gazing || piece.status.frozen) return false;
  const abilityId = state.selectedAbility!;
  const color = state.activeColor;
  const level = currentLevel(state, abilityId);
  const fundingRepeat =
    abilityId === "military-funding" &&
    level >= 3 &&
    state.pending?.step === "funding" &&
    !state.pending.selected?.includes("__no-repeat");
  if (piece.status.movedThisTurn && !fundingRepeat) return false;
  const compelled = compelledLuredSquares(state);
  if (state.pending?.step === "enchant-followup-move") {
    return piece.controller === color && (!compelled.length || compelled.includes(square));
  }
  if (abilityId !== "enchant" && compelled.length && !compelled.includes(square)) return false;
  if (abilityId === "enchant") {
    return piece.controller !== color && allowedEnchantTypes(level).includes(piece.type);
  }
  if (abilityId === "air-lift" || abilityId === "march-home" || abilityId === "escort") {
    return piece.controller === color && piece.type === "king";
  }
  if (abilityId === "air-strike") {
    return (
      piece.controller === color &&
      airStrikePassengerSquares(state, square)
        .some((passenger) => airStrikeLandingTargets(state, square, passenger).length > 0)
    );
  }
  if (abilityId === "slither") return piece.controller === color && piece.type === "queen";
  if (abilityId === "military-funding") return piece.controller === color && piece.type === "pawn";
  if (abilityId === "charge") return piece.controller === color && piece.type === "knight";
  if (abilityId === "mount") return piece.controller === color && piece.type === "knight";
  return piece.controller === color;
};

interface EscortLanding {
  from: Square;
  to: Square;
  piece: Piece;
}

interface EscortPlan {
  kingDestination: Square;
  landings: EscortLanding[];
  slippedOn?: Square;
}

const ordinaryMoveTargets = (state: GameState, square: Square) => {
  const piece = state.board[square];
  if (
    !piece ||
    piece.controller !== state.activeColor ||
    piece.status.gazing ||
    piece.status.frozen ||
    piece.status.hardened ||
    piece.status.movedThisTurn
  ) return [];
  let targets = legalTargets(state.board, square, {
    enPassant: state.enPassant,
    bananas: state.bananas,
    allowKingCapture: allowsPuzzleKingCapture(state),
  });
  if (!piece.status.luredBy) return targets;
  const queen = Object.entries(state.board).find(
    ([, target]) => target.controller === piece.status.luredBy && target.type === "queen",
  )?.[0];
  if (!queen) return targets;
  const closer = targets.filter((target) => distance(target, queen) < distance(square, queen));
  return closer.length ? closer : targets;
};

const firstAbilityNormalMoveTargets = (
  state: GameState,
  square: Square,
) => {
  const compelled = compelledLuredSquares(state);
  if (compelled.length && !compelled.includes(square)) return [];
  return ordinaryMoveTargets(state, square);
};

const enchantFollowupSources = (state: GameState) =>
  Object.keys(state.board).filter((square) =>
    sourceIsAllowed(
      {
        ...state,
        pending: state.pending
          ? { ...state.pending, step: "enchant-followup-move" }
          : state.pending,
      },
      square,
    ) && ordinaryMoveTargets(state, square).length > 0
  );

const enchantDestinationHasFollowup = (
  state: GameState,
  source: Square,
  destination: Square,
) => {
  const simulated = cloneState(state);
  const moving = simulated.board[source];
  if (!moving) return false;
  const originalController = moving.controller;
  moving.controller = simulated.activeColor;
  const result = moveDirect(simulated, source, destination);
  if (!result || !simulated.board[result.to]) return false;
  simulated.board[result.to].controller = originalController;
  simulated.selectedSquare = undefined;
  simulated.pending = {
    ...simulated.pending!,
    step: "enchant-followup-move",
    source: result.from,
    destination: result.to,
    movedPieceId: moving.id,
  };
  return enchantFollowupSources(simulated).length > 0;
};

const enchantSourceSquares = (state: GameState) =>
  Object.keys(state.board).filter((square) =>
    sourceIsAllowed(state, square) && sourceTargets(state, square).length > 0
  );

const escortPlan = (state: GameState, kingSquare: Square, requestedDestination: Square): EscortPlan | undefined => {
  const king = state.board[kingSquare];
  if (!king || king.type !== "king") return undefined;
  const selectedIds = new Set(state.pending?.selected ?? []);
  const companions = adjacentSquares(kingSquare)
    .map((square) => ({ from: square, piece: state.board[square] }))
    .filter((entry): entry is { from: Square; piece: Piece } =>
      Boolean(entry.piece && selectedIds.has(entry.piece.id)),
    );
  if (!companions.length) return undefined;

  const slippedOn = bananaOnMovePath(state, kingSquare, requestedDestination, king.controller);
  const kingDestination = slippedOn ?? requestedDestination;
  const [fromFile, fromRank] = coords(kingSquare);
  const [toFile, toRank] = coords(kingDestination);
  const dx = toFile - fromFile;
  const dy = toRank - fromRank;
  const distanceMoved = Math.max(Math.abs(dx), Math.abs(dy));
  const level = currentLevel(state, "escort");
  if (
    distanceMoved < 1 ||
    distanceMoved > (level >= 3 ? 2 : 1) ||
    (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy))
  ) {
    return undefined;
  }

  const landings: EscortLanding[] = [
    { from: kingSquare, to: kingDestination, piece: king },
  ];
  for (const companion of companions) {
    const [file, rank] = coords(companion.from);
    const destination = squareAt(file + dx, rank + dy);
    if (!destination) return undefined;
    landings.push({ ...companion, to: destination });
  }
  if (new Set(landings.map((landing) => landing.to)).size !== landings.length) {
    return undefined;
  }

  const simulated = structuredClone(state.board);
  for (const landing of landings) delete simulated[landing.from];
  for (const landing of landings) {
    const occupant = simulated[landing.to];
    if (
      (occupant?.type === "king" && !allowsPuzzleKingCapture(state)) ||
      occupant?.status.hardened ||
      occupant?.controller === king.controller
    ) {
      return undefined;
    }
    delete simulated[landing.to];
    simulated[landing.to] = {
      ...landing.piece,
      hasMoved: true,
      status: { ...landing.piece.status, movedThisTurn: true },
    };
  }
  const remainingBananas = slippedOn
    ? state.bananas.filter((banana) => banana.square !== slippedOn)
    : state.bananas;
  if (isInCheck(simulated, king.controller, remainingBananas)) return undefined;
  return { kingDestination, landings, slippedOn };
};

const sourceTargets = (state: GameState, square: Square) => {
  const abilityId = state.selectedAbility!;
  const level = currentLevel(state, abilityId);
  const piece = state.board[square];
  if (!piece) return [];
  const constrainLure = (targets: Square[]) => {
    if (!piece.status.luredBy) return targets;
    const queen = Object.entries(state.board).find(
      ([, target]) => target.controller === piece.status.luredBy && target.type === "queen",
    )?.[0];
    if (!queen) return targets;
    const closer = targets.filter((target) => distance(target, queen) < distance(square, queen));
    return closer.length ? closer : targets;
  };
  if (state.pending?.step === "enchant-followup-move") {
    return ordinaryMoveTargets(state, square);
  }
  if (FIRST_ABILITY_IDS.has(abilityId)) {
    return ordinaryMoveTargets(state, square);
  }
  if (piece.status.hardened && currentLevelForOwner(state, piece.controller, "harden") >= 3) {
    const board = structuredClone(state.board);
    delete board[square].status.hardened;
    return constrainLure(
      legalTargets(board, square, { enPassant: state.enPassant, bananas: state.bananas })
        .filter((target) => !board[target]),
    );
  }
  if (abilityId === "air-lift") {
    return constrainLure(allSquares.filter((target) => !state.board[target] && distance(square, target) <= level + 2));
  }
  if (abilityId === "charge") {
    return constrainLure(legalTargets(state.board, square, {
      forceType: "rook",
      bananas: state.bananas,
      allowKingCapture: allowsPuzzleKingCapture(state),
    }));
  }
  if (abilityId === "mount") {
    if (piece.type !== "knight") return [];
    const riders = adjacentSquares(square, false)
      .filter((target) => state.board[target]?.controller === state.activeColor);
    if (!riders.length) return [];
    return constrainLure(
      legalTargets(state.board, square, { enPassant: state.enPassant, bananas: state.bananas }).filter((target) => {
        const simulated = applyMove(state.board, { from: square, to: target }, state.enPassant).board;
        return adjacentSquares(target, false).some((landing) => !simulated[landing]);
      }),
    );
  }
  if (abilityId === "stealth") {
    return constrainLure(legalTargets(state.board, square, { enPassant: state.enPassant, bananas: state.bananas }));
  }
  if (abilityId === "siphon") {
    return constrainLure(legalTargets(state.board, square, { enPassant: state.enPassant, bananas: state.bananas }).filter((target) =>
      adjacentSquares(target).some((adjacent) => state.board[adjacent]?.controller === opposite(state.activeColor)),
    ));
  }
  if (abilityId === "march-home") {
    return [piece.color === "white" ? "e1" : "e8"];
  }
  if (abilityId === "escort") {
    const board = structuredClone(state.board);
    for (const selectedId of state.pending?.selected ?? []) {
      const selectedSquare = findSquareById(board, selectedId);
      if (selectedSquare) delete board[selectedSquare];
    }
    return constrainLure(
      pseudoTargets(board, square, {
        forceType: level >= 3 ? "queen" : "king",
        maxDistance: level >= 3 ? 2 : 1,
        bananas: state.bananas,
      }).filter((target) => Boolean(escortPlan(state, square, target))),
    );
  }
  if (abilityId === "slither") {
    return constrainLure(pseudoTargets(state.board, square, { forceType: "bishop", noCapture: true, ignoreCheck: true, bananas: state.bananas }));
  }
  if (abilityId === "pick-a-fight") {
    const eligible = level >= 3 || piece.type === "knight" || piece.type === "bishop";
    if (!eligible) return [];
    const ordinaryTargets = legalTargets(state.board, square, {
      enPassant: state.enPassant,
      bananas: state.bananas,
    }).filter((target) => !state.board[target]);
    return constrainLure(ordinaryTargets.filter((target) => {
      const simulated = { ...state.board, [target]: piece };
      delete simulated[square];
      const attacked = isSquareAttacked(
        simulated,
        target,
        opposite(state.activeColor),
        state.bananas,
      );
      const attacksTwo = ordinaryAttackedPieceSquares(
        simulated,
        target,
        state.bananas,
      ).length >= 2;
      return attacked || (level >= 2 && attacksTwo);
    }));
  }
  if (abilityId === "enchant") {
    const board = structuredClone(state.board);
    board[square].controller = state.activeColor;
    return legalTargets(board, square, {
      enPassant: state.enPassant,
      bananas: state.bananas,
    }).filter((target) =>
      state.board[target]?.type !== "king" &&
      enchantDestinationHasFollowup(state, square, target)
    );
  }
  if (abilityId === "banana-peel") {
    const candidates = pseudoTargets(state.board, square, {
      enPassant: state.enPassant,
      bananas: state.bananas,
    });
    return constrainLure(candidates.filter((target) =>
      safeBananaPlacementsAfterMove(state, square, target).placements.length > 0,
    ));
  }
  if (abilityId === "leverage") {
    return constrainLure(
      legalTargets(state.board, square, { enPassant: state.enPassant, bananas: state.bananas }).filter((target) => {
        const simulated = applyMove(state.board, { from: square, to: target }, state.enPassant).board;
        return adjacentSquares(target).some((adjacent) => {
          const hire = simulated[adjacent];
          if (!hire || hire.controller === state.activeColor || hire.type === "king") return false;
          if (!allowedEnchantTypes(level).includes(hire.type)) return false;
          const extraCost = hire.type === "rook" ? 1 : hire.type === "queen" ? 2 : 0;
          return state.players[state.activeColor].orbs.black >= extraCost;
        });
      }),
    );
  }
  if (abilityId === "cull-the-weak") {
    return constrainLure(
      legalTargets(state.board, square, { enPassant: state.enPassant, bananas: state.bananas }).filter((target) => {
        const simulated = applyMove(state.board, { from: square, to: target }, state.enPassant).board;
        return ordinaryAttackedPieceSquares(simulated, target, state.bananas).length >= 2;
      }),
    );
  }
  const charged = piece.type === "knight" && piece.status.chargeUntil
    ? legalTargets(state.board, square, {
      forceType: "rook",
      bananas: state.bananas,
      allowKingCapture: allowsPuzzleKingCapture(state),
    })
    : [];
  return constrainLure([...new Set([
    ...legalTargets(state.board, square, {
      enPassant: state.enPassant,
      bananas: state.bananas,
      allowKingCapture: allowsPuzzleKingCapture(state),
    }),
    ...charged,
  ])]);
};

const startTargetAbility = (state: GameState, abilityId: string) => {
  const level = currentLevel(state, abilityId);
  const enemy = opposite(state.activeColor);
  if (abilityId === "lure") {
    const allowed = allowedEnchantTypes(level);
    state.legalTargets = Object.entries(state.board)
      .filter(([, piece]) => piece.controller === enemy && allowed.includes(piece.type))
      .map(([square]) => square);
  } else if (abilityId === "rage") {
    state.legalTargets = Object.entries(state.board)
      .filter(([, piece]) => level < 3 || piece.controller === state.activeColor)
      .map(([square]) => square);
    state.pending = {
      godId: state.selectedGod!,
      abilityId,
      step: level >= 3 ? "rage-source" : "target",
    };
    state.notice = level >= 3
      ? "Rage: choose one of your pieces to move up to 1 legal space before capturing."
      : "Choose the piece at the center of Rage.";
    return;
  } else if (abilityId === "poison-cloud" && level >= 2) {
    state.legalTargets = allSquares;
  } else {
    state.legalTargets = Object.entries(state.board)
      .filter(([, piece]) => piece.controller === enemy && piece.type !== "king")
      .map(([square]) => square);
  }
  state.pending = { godId: state.selectedGod!, abilityId, step: "target" };
  state.notice = `Choose a target for ${GOD_BY_ID[state.selectedGod!].abilities.find((a) => a.id === abilityId)!.name}.`;
};

const stoneGazeTargets = (state: GameState) => {
  const queens = Object.entries(state.board)
    .filter(([, piece]) => piece.controller === state.activeColor && piece.type === "queen");
  const queenIds = new Set(queens.map(([, queen]) => queen.id));
  const targets = Object.entries(state.board).filter(
    ([square, piece]) =>
      !queenIds.has(piece.id) &&
      queens.some(([queenSquare]) => lineOfSight(state.board, queenSquare, square)),
  );
  return { queens, targets };
};

const resolveStoneGaze = (state: GameState) => {
  const level = currentLevel(state, "stone-gaze");
  const { queens, targets } = stoneGazeTargets(state);
  for (const [, piece] of targets) {
    piece.status.frozen = level >= 3
      ? "god"
      : level + 1 + (piece.controller === state.activeColor ? 1 : 0);
    piece.status.frozenBy = state.activeColor;
  }
  if (targets.length) {
    for (const [, queen] of queens) queen.status.gazing = true;
  }
  finishTurn(
    state,
    abilityDescription(
      state,
      `: petrified ${targets.length} piece${targets.length === 1 ? "" : "s"} in the Queen’s line of sight`,
    ),
  );
};

const activateAbility = (state: GameState, abilityId: string) => {
  if (!state.selectedGod) return;
  const god = GOD_BY_ID[state.selectedGod];
  const ability = god.abilities.find((candidate) => candidate.id === abilityId);
  if (!ability) return;
  if (
    (abilityId === "lure" || abilityId === "stone-gaze") &&
    !Object.values(state.board).some((piece) => piece.controller === state.activeColor && piece.type === "queen")
  ) {
    state.notice = `${ability.name} requires you to control a Queen.`;
    return;
  }
  if (
    compelledLuredSquares(state).length &&
    (
      ability.kind === "target" ||
      ability.kind === "revive" ||
      ability.kind === "sacrifice" ||
      abilityId === "enchant" ||
      abilityId === "march-home"
    )
  ) {
    state.notice = "A Lured piece must move closer to the opposing Queen this turn if possible.";
    return;
  }
  if (!payCost(state, abilityId)) {
    state.notice = "You do not have enough orbs for that ability.";
    return;
  }
  state.selectedAbility = abilityId;
  state.selectedSquare = undefined;
  state.legalTargets = [];
  state.pending = { godId: god.id, abilityId, step: "source" };

  if (abilityId === "enchant") {
    state.pending.step = "enchant-enemy-move";
    state.legalTargets = enchantSourceSquares(state);
    if (!state.legalTargets.length) {
      refundCost(state);
      state.selectedAbility = undefined;
      state.pending = undefined;
      state.notice = "Enchant has no hostile piece that can move and leave a legal follow-up move.";
      return;
    }
    state.notice = "Enchant: choose a highlighted hostile piece to move.";
    return;
  }

  if (abilityId === "stone-gaze") {
    const { targets } = stoneGazeTargets(state);
    state.pending.step = "confirm-stone-gaze";
    state.legalTargets = targets.map(([square]) => square);
    state.notice = `Stone Gaze will affect ${targets.length} piece${targets.length === 1 ? "" : "s"}. Confirm to petrify them.`;
    return;
  }
  if (ability.kind === "target") {
    startTargetAbility(state, abilityId);
    return;
  }
  if (ability.kind === "revive") {
    const hasBishop = Object.values(state.board)
      .some((piece) => piece.controller === state.activeColor && piece.type === "bishop");
    if (!hasBishop) {
      refundCost(state);
      state.selectedAbility = undefined;
      state.pending = undefined;
      state.notice = "Resurrect requires a living Bishop.";
      return;
    }
    if (!state.players[state.activeColor].graveyard.length) {
      refundCost(state);
      state.selectedAbility = undefined;
      state.pending = undefined;
      state.notice = "Your graveyard is empty.";
      return;
    }
    state.pending.step = "grave";
    state.notice = "Choose a piece from your graveyard.";
    return;
  }
  if (abilityId === "monument") {
    const needed = 4 - currentLevel(state, abilityId);
    const pawns = Object.entries(state.board).filter(([, piece]) => piece.controller === state.activeColor && piece.type === "pawn");
    if (pawns.length < needed) {
      refundCost(state);
      state.selectedAbility = undefined;
      state.pending = undefined;
      state.notice = `Monument requires ${needed} pawns.`;
      return;
    }
    state.legalTargets = pawns.map(([square]) => square);
    state.pending = { ...state.pending, step: "monument-sacrifice", selected: [] };
    state.notice = `Choose ${needed} pawn${needed === 1 ? "" : "s"} to sacrifice.`;
    return;
  }
  if (abilityId === "hex") {
    const capacity = currentLevel(state, abilityId);
    const activeHexes = Object.values(state.board).filter((piece) => piece.status.hexedBy === state.activeColor).length;
    if (activeHexes === 0) {
      state.pending.step = "hex-target";
      state.pending.selected = [];
      state.legalTargets = Object.entries(state.board)
        .filter(([, piece]) =>
          piece.controller !== state.activeColor &&
          !piece.status.hexedBy
        )
        .map(([square]) => square);
      state.notice = `Choose up to ${capacity} enem${capacity === 1 ? "y piece" : "y pieces"} to hex before moving.`;
      return;
    }
  }
  if (abilityId === "march-home") {
    const king = Object.entries(state.board).find(([, piece]) => piece.controller === state.activeColor && piece.type === "king");
    if (!king) return;
    const level = currentLevel(state, abilityId);
    if (level === 1) {
      const destination = king[1].color === "white" ? "e1" : "e8";
      state.pending = {
        godId: state.selectedGod!,
        abilityId,
        step: "confirm-march-home",
        source: king[0],
        destination,
      };
      state.selectedSquare = king[0];
      state.legalTargets = [destination];
      state.notice = `March Home will teleport the King to ${destination}. Confirm to continue.`;
    } else if (level === 2) {
      const destination = king[1].color === "white" ? "e1" : "e8";
      const [fromFile, fromRank] = coords(king[0]);
      const [toFile, toRank] = coords(destination);
      state.pending = { godId: state.selectedGod!, abilityId, step: "march-companion", source: king[0] };
      state.legalTargets = [
        king[0],
        ...adjacentSquares(king[0]).filter((square) => {
          const companion = state.board[square];
          if (!companion || companion.controller !== state.activeColor) return false;
          const [file, rank] = coords(square);
          return Boolean(squareAt(file + toFile - fromFile, rank + toRank - fromRank));
        }),
      ];
      state.notice = "March Home: choose one adjacent piece to bring, or choose the King to bring none.";
    } else {
      state.pending = {
        godId: state.selectedGod!,
        abilityId,
        step: "march-companions",
        source: king[0],
        selected: [],
      };
      const destination = king[1].color === "white" ? "e1" : "e8";
      const [fromFile, fromRank] = coords(king[0]);
      const [toFile, toRank] = coords(destination);
      state.legalTargets = adjacentSquares(king[0]).filter((square) => {
        const companion = state.board[square];
        if (!companion || companion.controller !== state.activeColor) return false;
        const [file, rank] = coords(square);
        return Boolean(squareAt(file + toFile - fromFile, rank + toRank - fromRank));
      });
      state.notice = "March Home: choose any adjacent pieces to bring, then pass to teleport.";
    }
    return;
  }
  state.notice = `Choose a piece for ${ability.name}.`;
};

const recordMoveCapture = (state: GameState, captured: Piece | undefined) => {
  if (!captured) return;
  if (captured.type === "king") {
    setClassicWinner(state, state.activeColor, "king-death");
  }
};

const resolveMoveEffect = (
  state: GameState,
  abilityId: string,
  from: Square,
  to: Square,
  moving: Piece,
  captured?: Piece,
  boardBefore?: Record<Square, Piece>,
) => {
  const color = state.activeColor;
  const enemy = opposite(color);
  const level = currentLevel(state, abilityId);
  const [fromFile, fromRank] = coords(from);
  const [toFile, toRank] = coords(to);
  const forward = color === "white" ? 1 : -1;

  if (abilityId === "flight") {
    const snake = qualifyingSnake(
      to,
      (square) => Boolean(state.board[square]),
      (square) => {
        const orthogonal = new Set(adjacentSquares(square, false));
        return adjacentSquares(square).filter((neighbor) => !orthogonal.has(neighbor));
      },
      (square) => adjacentSquares(square, false),
    );
    if (snake.length) {
      const white = snake.filter((square) => state.board[square].color === "white").length;
      const black = snake.filter((square) => state.board[square].color === "black").length;
      addOrbs(
        state,
        color,
        level >= 3 ? white : Number(white > 0),
        level >= 3 ? black : Number(black > 0),
      );
      if (level >= 2 && snake.length >= 2) {
        state.pending = {
          godId: state.selectedGod!,
          abilityId,
          step: "slither-orb",
          destination: to,
          movedPieceId: moving.id,
        };
        state.selectedSquare = undefined;
        state.legalTargets = [];
        state.notice = "Slither: choose one extra white or black orb.";
        return "pending";
      }
    }
  } else if (abilityId === "gallop") {
    const bonus = level;
    if (moving.type === "knight") addOrbs(state, color, bonus, 0);
    if (captured) addOrbs(state, color, 0, level + 1);
  } else if (abilityId === "mount") {
    if (moving.type !== "knight") return undefined;
    const riders = adjacentSquares(from, false)
      .filter((square) => state.board[square]?.controller === color);
    const destinations = adjacentSquares(to, false).filter((square) => !state.board[square]);
    if (riders.length && destinations.length) {
      state.pending = {
        godId: state.selectedGod!,
        abilityId,
        step: "mount-rider",
        source: from,
        destination: to,
        selected: [],
        mountHistory: [mountPrimaryDetail(moving, from, to, captured)],
      };
      state.legalTargets = riders;
      state.notice = `Mount: choose up to ${level} adjacent rider${level === 1 ? "" : "s"}, or pass to finish.`;
      return "pending";
    }
  } else if (abilityId === "charge") {
    if (level >= 2) {
      for (const piece of Object.values(state.board)) {
        if (piece.controller === color && piece.type === "knight") {
          piece.status.chargeUntil = level >= 3 ? "god" : 2;
        }
      }
    }
  } else if (abilityId === "construction") {
    if (distance(from, to) === 1) addOrbs(state, color, 0, 1);
    if (level >= 2 && moving.type === "pawn") addOrbs(state, color, 0, 1);
    if (level >= 3 && moving.type === "rook") addOrbs(state, color, 0, 1);
  } else if (abilityId === "harden") {
    state.board[to].status.hardened = 2;
  } else if (abilityId === "resonance") {
    const neighbors = adjacentSquares(to)
      .map((square) => ({ square, piece: state.board[square] }))
      .filter((entry): entry is { square: Square; piece: Piece } => Boolean(entry.piece));
    const orthogonal = neighbors.filter(({ square }) => {
      const [file, rank] = coords(square);
      return file === toFile || rank === toRank;
    });
    const countColor = (pieces: typeof neighbors, orbColor: Color) =>
      pieces.filter(({ piece }) => piece.color === orbColor).length;
    const reward = (orbColor: Color) => {
      const orthogonalCount = countColor(orthogonal, orbColor);
      if (level === 1) return Math.floor(orthogonalCount / 2);
      const adjacentCount = countColor(neighbors, orbColor);
      return adjacentCount + (level >= 3 ? Math.floor(orthogonalCount / 2) : 0);
    };
    addOrbs(state, color, reward("white"), reward("black"));
  } else if (abilityId === "take-cover") {
    const coverSquares = [
      squareAt(toFile, toRank + forward),
      ...(level >= 2 ? [squareAt(toFile - 1, toRank + forward), squareAt(toFile + 1, toRank + forward)] : []),
    ].filter((square): square is Square => Boolean(square));
    const cover = coverSquares.filter((square) => state.board[square]?.controller === color).length;
    if (cover) addOrbs(state, color, level >= 3 ? cover : 1, 0);
    if (captured) addOrbs(state, color, 0, 2);
  } else if (abilityId === "snipe") {
    state.board[to].status.prepared = { owner: color, level: level as 1 | 2 | 3 };
  } else if (abilityId === "ritual-sacrifice") {
    state.board[to].status.ritual = { owner: color, expires: level >= 2 ? "kangus" : state.turn + 1 };
  } else if (abilityId === "banana-peel") {
    state.pending = { godId: state.selectedGod!, abilityId, step: "banana", movedPieceId: moving.id };
    state.legalTargets = bananaPlacementTargets(state.board, to, state.bananas)
      .filter((placement) => !isInCheck(state.board, color, [
        ...state.bananas,
        { square: placement, owner: color, expires: "god" },
      ]));
    state.notice = "Place the banana peel on an adjacent empty square.";
    return "pending";
  } else if (abilityId === "marked") {
    state.board[to].status.markedForDeath = { owner: color, round: state.round + 1 };
    if (level >= 3) {
      state.pending = {
        godId: state.selectedGod!,
        abilityId,
        step: "marked-choice",
        movedPieceId: state.board[to].id,
      };
      state.legalTargets = [];
      state.notice = "Marked: execute the moved piece now for 5 black orbs, or let it die when Death next acts.";
      return "pending";
    }
  } else if (abilityId === "siphon") {
    if (state.players[enemy].orbs.white > 0) {
      state.pending = {
        godId: state.selectedGod!,
        abilityId,
        step: "siphon-choice",
        destination: to,
      };
      state.legalTargets = [];
      state.notice = "Siphon: choose how many white orbs to steal, up to 2.";
      return "pending";
    }
  } else if (abilityId === "royal-step") {
    if (moving.type === "king" || (level >= 2 && moving.type === "pawn")) addOrbs(state, color, 0, 1);
    const backward = (toRank - fromRank) * forward < 0;
    const sideways = toRank === fromRank;
    if (backward || (level >= 3 && sideways)) addOrbs(state, color, 1, 0);
  } else if (abilityId === "captivate") {
    const originalBoard = boardBefore ?? state.board;
    const beforeQueens = Object.entries(originalBoard).filter(
      ([square, piece]) => piece.type === "queen" && lineOfSight(originalBoard, from, square),
    );
    const afterQueens = Object.entries(state.board).filter(
      ([square, piece]) => piece.type === "queen" && lineOfSight(state.board, to, square),
    );
    for (const [, queen] of afterQueens) {
      const entered = !beforeQueens.some(([, before]) => before.id === queen.id);
      const amount = entered && level >= 2 ? level : 1;
      addOrbs(state, color, queen.color === "white" ? amount : 0, queen.color === "black" ? amount : 0);
    }
  } else if (abilityId === "hex") {
    const hexed = Object.entries(state.board).filter(([, piece]) => piece.status.hexedBy === color).slice(0, level);
    const aligned = hexed.filter(([square]) => {
      const [file, rank] = coords(square);
      return file === toFile || rank === toRank;
    }).length;
    if (aligned) {
      const amount = aligned + 1;
      addOrbs(state, color, squareColor(to) === "white" ? amount : 0, squareColor(to) === "black" ? amount : 0);
    }
  } else if (abilityId === "barter") {
    if (adjacentSquares(to).some((square) => state.board[square]?.controller === enemy)) {
      if (state.players[color].orbs.white > 0 || state.players[color].orbs.black > 0) {
        state.pending = {
          godId: state.selectedGod!,
          abilityId,
          step: "barter-choice",
          destination: to,
        };
        state.legalTargets = [];
        state.notice = "Barter: choose which orb to give, or decline the trade.";
        return "pending";
      }
    }
  } else if (abilityId === "leverage") {
    state.pending = { godId: state.selectedGod!, abilityId, step: "hire", movedPieceId: moving.id };
    state.legalTargets = adjacentSquares(to).filter((square) => {
      const target = state.board[square];
      if (!target || target.controller === color || target.type === "king") return false;
      return allowedEnchantTypes(level).includes(target.type);
    });
    if (state.legalTargets.length) {
      state.notice = "Choose an adjacent enemy piece to hire.";
      return "pending";
    }
  } else if (abilityId === "threaten") {
    const attacked = ordinaryAttackedPieceSquares(state.board, to).length;
    if (attacked) addOrbs(state, color, 0, level >= 3 ? attacked : 1);
    const ranks = Object.entries(state.board)
      .filter(([, piece]) => piece.controller === color)
      .map(([square]) => coords(square)[1] * forward);
    const advancement = toRank * forward;
    const tied = ranks.filter((rank) => rank === Math.max(...ranks)).length;
    if (advancement === Math.max(...ranks) && (level >= 2 || tied === 1)) addOrbs(state, color, tied === 1 && level >= 2 ? 2 : 1, 0);
  } else if (abilityId === "cull-the-weak") {
    const attacked = ordinaryAttackedPieceSquares(state.board, to);
    if (attacked.length >= 2) {
      const lowestValue = Math.min(...attacked.map((square) => pieceValue(state.board[square].type)));
      const allowedChoices = attacked.filter((square) => {
        const target = state.board[square];
        return pieceValue(target.type) === lowestValue ||
          (level >= 2 && (target.type === "knight" || target.type === "bishop")) ||
          (level >= 3 && target.type === "rook");
      });
      if (level === 1 || allowedChoices.length === 1) {
        captureAt(state, allowedChoices[0], color);
      } else {
        state.pending = {
          godId: state.selectedGod!,
          abilityId,
          step: "cull-choice",
          movedPieceId: state.board[to].id,
        };
        state.legalTargets = allowedChoices;
        state.notice = "Cull the Weak: choose which eligible attacked piece to capture.";
        return "pending";
      }
    }
  }
  return undefined;
};

const executeEscort = (state: GameState, from: Square, requestedTo: Square) => {
  const plan = escortPlan(state, from, requestedTo);
  if (!plan) return;
  const king = state.board[from];
  for (const landing of plan.landings) delete state.board[landing.from];
  for (const landing of plan.landings) {
    if (state.board[landing.to]) captureAt(state, landing.to, state.activeColor);
    state.board[landing.to] = {
      ...landing.piece,
      hasMoved: true,
      status: { ...landing.piece.status, movedThisTurn: true },
    };
  }
  if (plan.slippedOn) {
    state.bananas = state.bananas.filter((banana) => banana.square !== plan.slippedOn);
    log(state, `${king.type} slipped on a banana peel at ${plan.slippedOn}.`);
  }
  present(state, {
    kind: "move",
    godId: state.selectedGod!,
    abilityId: "escort",
    piece: king,
    from,
    to: plan.kingDestination,
  });
  finishTurn(
    state,
    abilityDescription(state, `: ${pieceName(king)} at ${from} -> ${plan.kingDestination}`),
  );
};

const executeMovement = (state: GameState, from: Square, to: Square) => {
  const abilityId = state.selectedAbility!;
  const moving = state.board[from];
  if (!moving) return;
  if (
    abilityId === "mount" &&
    (
      moving.type !== "knight" ||
      !sourceTargets(state, from).includes(to)
    )
  ) return;

  if (state.pending?.step === "enchant-followup-move") {
    const result = moveDirect(state, from, to);
    if (!result) return;
    const movedPiece = state.board[result.to];
    if (!movedPiece) return;
    delete movedPiece.status.luredBy;
    recordMoveCapture(state, result.captured);
    present(state, {
      kind: "move",
      godId: state.selectedGod!,
      abilityId,
      piece: moving,
      from,
      to: result.to,
    });
    finishTurn(
      state,
      abilityDescription(state, `: enchanted an enemy piece, then moved ${pieceName(moving)} at ${from} -> ${result.to}`),
    );
    return;
  }

  if (abilityId === "escort") {
    executeEscort(state, from, to);
    return;
  }

  if (abilityId === "stealth") {
    delete state.board[from];
    state.stealth[state.activeColor].push({ piece: moving, destination: to, returnOnTurn: state.turn + 2 });
    present(state, {
      kind: "move",
      godId: state.selectedGod!,
      abilityId,
      piece: moving,
      from,
      to,
    });
    finishTurn(state, abilityDescription(state, `: ${pieceName(moving)} at ${from} -> ${to}`));
    return;
  }

  if (
    abilityId === "military-funding" &&
    currentLevel(state, abilityId) >= 2 &&
    (state.pending?.selected?.filter((id) => id !== "__no-repeat").length ?? 0) >= 1
  ) {
    if (state.players[state.activeColor].orbs.white < 1) {
      state.notice = "Military Funding requires 1 white orb for each pawn move after the first.";
      return;
    }
    addOrbs(state, state.activeColor, -1, 0);
  }

  const enchantingEnemy = state.pending?.step === "enchant-enemy-move";
  const originalController = moving.controller;
  if (enchantingEnemy) moving.controller = state.activeColor;
  const boardBefore = structuredClone(state.board);
  const teleports = ["air-lift"];
  const result = moveDirect(state, from, to, teleports.includes(abilityId));
  if (!result) {
    if (enchantingEnemy) moving.controller = originalController;
    return;
  }
  const movedPiece = state.board[result.to];
  if (!movedPiece) throw new Error(`Moved piece is missing from ${result.to}.`);
  if (enchantingEnemy) movedPiece.controller = originalController;
  if (moving.status.hardened && !result.captured) delete movedPiece.status.hardened;
  delete movedPiece.status.luredBy;
  recordMoveCapture(state, result.captured);
  present(state, {
    kind: "move",
    godId: state.selectedGod!,
    abilityId,
    piece: moving,
    from,
    to: result.to,
  });

  if (enchantingEnemy) {
    state.pending = {
      godId: state.selectedGod!,
      abilityId,
      step: "enchant-followup-move",
      source: result.from,
      destination: result.to,
      movedPieceId: moving.id,
    };

    state.selectedSquare = undefined;
    state.legalTargets = enchantFollowupSources(state);
    if (!state.legalTargets.length) {
      finishTurn(state, abilityDescription(state, ": completed Enchant without an available follow-up move"));
      return;
    }
    state.notice = "Enchant: choose one of your highlighted pieces, then make one ordinary legal move.";
    return;
  }

  if (abilityId === "slither") {
    const unlimited = currentLevel(state, abilityId) >= 3;
    const remaining = unlimited ? -1 : (state.pending?.movesRemaining ?? currentLevel(state, abilityId) + 1) - 1;
    if (unlimited || remaining > 0) {
      state.pending = { godId: state.selectedGod!, abilityId, step: "slither", source: result.to, movedPieceId: moving.id, movesRemaining: remaining };
      state.selectedSquare = result.to;
      state.legalTargets = pseudoTargets(state.board, result.to, { forceType: "bishop", noCapture: true, ignoreCheck: true });
      state.notice = unlimited
        ? "Serpentine Step may continue any number of times. Pass to stop."
        : `Serpentine Step may continue (${remaining} move${remaining === 1 ? "" : "s"} remaining). Pass to stop.`;
      return;
    }
  }
  if (abilityId === "military-funding") {
    const level = currentLevel(state, abilityId);
    const selected = [
      ...(state.pending?.selected ?? []),
      moving.id,
      ...(result.captured || state.board[result.to].type !== "pawn" ? ["__no-repeat"] : []),
    ];
    const moveCount = selected.filter((id) => id !== "__no-repeat").length;
    const canContinue = level === 1
      ? moveCount < 2
      : state.players[state.activeColor].orbs.white > 0;
    if (canContinue) {
      state.pending = { godId: state.selectedGod!, abilityId, step: "funding", selected };
      state.selectedSquare = undefined;
      state.legalTargets = [];
      state.notice = level === 1
        ? "Military Funding: move a second pawn."
        : "Military Funding: move another pawn for 1 white orb, or pass to finish.";
      return;
    }
  }

  const pending = resolveMoveEffect(state, abilityId, result.from, result.to, moving, result.captured, boardBefore);
  if (pending === "pending") return;
  if (abilityId === "mount") {
    finishTurn(
      state,
      mountDescription(
        state,
        [mountPrimaryDetail(moving, result.from, result.to, result.captured)],
        0,
      ),
    );
    return;
  }
  finishTurn(state, abilityDescription(state, `: ${pieceName(moving)} at ${from} -> ${result.to}`));
};

const queuedMoveIsStillLegal = (state: GameState) => {
  const queued = state.pending?.queuedMove;
  if (
    !queued ||
    queued.actor !== state.activeColor ||
    queued.turn !== state.turn ||
    state.board[queued.from]?.id !== queued.pieceId
  ) return false;
  return firstAbilityNormalMoveTargets(state, queued.from).includes(queued.to);
};

const executeQueuedMove = (state: GameState) => {
  const queued = state.pending?.queuedMove;
  if (!queued) return false;
  if (!queuedMoveIsStillLegal(state)) {
    state.pending = {
      ...state.pending!,
      step: "source",
      queuedMove: undefined,
    };
    state.selectedSquare = undefined;
    state.legalTargets = [];
    state.notice = "The queued move is no longer legal. Choose a legal piece and destination.";
    return false;
  }
  state.pending = {
    ...state.pending!,
    step: "source",
    source: queued.from,
    queuedMove: undefined,
  };
  state.selectedSquare = queued.from;
  state.legalTargets = firstAbilityNormalMoveTargets(state, queued.from);
  executeMovement(state, queued.from, queued.to);
  return true;
};

const executeMarchHome = (state: GameState, kingSquare: Square, companionSquares: Square[]) => {
  const king = state.board[kingSquare];
  if (!king) return;
  const destination = king.color === "white" ? "e1" : "e8";
  const [fromFile, fromRank] = coords(kingSquare);
  const [toFile, toRank] = coords(destination);
  const companions = companionSquares
    .map((square) => ({ square, piece: state.board[square] }))
    .filter((entry): entry is { square: Square; piece: Piece } => Boolean(entry.piece));
  const companionLandings = companions.map(({ square, piece }) => {
    const [file, rank] = coords(square);
    return {
      square,
      piece,
      target: squareAt(file + toFile - fromFile, rank + toRank - fromRank),
    };
  });
  if (companionLandings.some(({ target }) =>
    !target ||
    state.board[target]?.type === "king" ||
    state.board[target]?.status.hardened
  )) return;

  const result = moveDirect(state, kingSquare, destination, true);
  if (!result) return;
  present(state, {
    kind: "move",
    godId: state.selectedGod!,
    abilityId: state.selectedAbility,
    piece: king,
    from: kingSquare,
    to: destination,
  });
  for (const { square, piece, target } of companionLandings) {
    if (!target) continue;
    if (state.board[target]) captureAt(state, target, state.activeColor);
    delete state.board[square];
    state.board[target] = { ...piece, hasMoved: true };
  }
  finishTurn(state, abilityDescription(state, `: ${pieceName(king)} at ${kingSquare} -> ${destination}`));
};

const abilityName = (state: GameState, abilityId: string) =>
  GOD_BY_ID[state.selectedGod!].abilities.find((ability) => ability.id === abilityId)?.name ?? abilityId;

const resolveRage = (state: GameState, square: Square, spareFriendly: boolean) => {
  for (const adjacent of adjacentSquares(square)) {
    const victim = state.board[adjacent];
    if (!victim || (spareFriendly && victim.controller === state.activeColor)) continue;
    captureAt(state, adjacent, state.activeColor);
  }
};

const chooseTarget = (state: GameState, square: Square) => {
  const abilityId = state.selectedAbility!;
  const level = currentLevel(state, abilityId);
  const piece = state.board[square];
  if (abilityId === "lure" && piece) {
    piece.status.luredBy = state.activeColor;
  } else if (abilityId === "poison-cloud") {
    if (level === 1 && piece) {
      piece.status.poisoned = "god";
      piece.status.poisonedBy = state.activeColor;
    } else {
      const [file, rank] = coords(square);
      const offsets = level === 2
        ? [[1, 0], [-1, 0], [0, 1], [0, -1]]
        : [[1, 1], [1, -1], [-1, 1], [-1, -1]];
      state.pending = {
        godId: state.selectedGod!,
        abilityId,
        step: "poison-area",
        source: square,
      };
      state.legalTargets = offsets
        .map(([dx, dy]) => squareAt(file + dx, rank + dy))
        .filter((target): target is Square => Boolean(target));
      state.notice = level === 2
        ? "Poison Cloud: choose the adjacent square that completes the 1×2 or 2×1 area."
        : "Poison Cloud: choose the diagonal corner that completes the 2×2 area.";
      return;
    }
  } else if (abilityId === "polymorph" && piece) {
    piece.status.polymorphed = level >= 3 ? "god" : level + 1;
  } else if (abilityId === "rage" && piece) {
    if (level >= 2) {
      state.pending = {
        godId: state.selectedGod!,
        abilityId,
        step: "rage-choice",
        destination: square,
      };
      state.legalTargets = [];
      state.notice = "Rage: choose whether friendly adjacent pieces are captured.";
      return;
    }
    resolveRage(state, square, false);
  }
  finishTurn(
    state,
    abilityDescription(state, piece ? ` on ${pieceName(piece)} at ${square}` : ` on ${square}`),
  );
};

const chooseGravePiece = (state: GameState, pieceId: string) => {
  const grave = state.players[state.activeColor].graveyard.find((entry) => entry.piece.id === pieceId);
  if (!grave) return;
  const level = currentLevel(state, "resurrect");
  const bishopSquares = Object.entries(state.board)
    .filter(([, piece]) => piece.controller === state.activeColor && piece.type === "bishop")
    .map(([square]) => square);
  if (!bishopSquares.length) {
    state.notice = "Resurrect requires a living bishop.";
    return;
  }
  state.pending = { ...state.pending!, step: "revive-place", movedPieceId: pieceId };
  state.legalTargets = [...new Set(bishopSquares.flatMap((square) => adjacentSquares(square)))]
    .filter((square) => level >= 3
      ? state.board[square]?.controller !== state.activeColor &&
        (
          state.board[square]?.type !== "king" ||
          allowsPuzzleKingCapture(state)
        )
      : !state.board[square]);
  state.notice = "Choose a space adjacent to one of your bishops.";
};

const completeSpecialTarget = (state: GameState, square: Square) => {
  const pending = state.pending!;
  const abilityId = pending.abilityId;
  if (pending.step === "banana") {
    state.bananas.push({
      square,
      owner: state.activeColor,
      expires: currentLevel(state, abilityId) >= 3
        ? "god"
        : currentLevel(state, abilityId) === 2
          ? "kangus"
          : state.turn + 1,
    });
    finishTurn(state, abilityDescription(state, `: placed a banana peel on ${square}`));
  } else if (pending.step === "hire") {
    const piece = state.board[square];
    if (piece) {
      const extra = piece.type === "rook" ? 1 : piece.type === "queen" ? 2 : 0;
      if (state.players[state.activeColor].orbs.black < extra) {
        state.notice = `Hiring that piece requires ${extra} more black orb${extra === 1 ? "" : "s"}.`;
        return;
      }
      addOrbs(state, state.activeColor, 0, -extra);
      addOrbs(state, opposite(state.activeColor), 0, 4 + extra);
      piece.controller = state.activeColor;
      piece.status.hired = true;
    }
    finishTurn(
      state,
      abilityDescription(state, piece ? `: hired ${pieceName(piece)} at ${square}` : ` on ${square}`),
    );
  } else if (pending.step === "revive-place" && pending.movedPieceId) {
    const graveyard = state.players[state.activeColor].graveyard;
    const index = graveyard.findIndex((entry) => entry.piece.id === pending.movedPieceId);
    if (index < 0) return;
    if (state.board[square]) captureAt(state, square, state.activeColor);
    const [grave] = graveyard.splice(index, 1);
    state.board[square] = { ...grave.piece, controller: state.activeColor, status: {}, hasMoved: true };
    if (currentLevel(state, abilityId) >= 2 && !pending.selected?.length && graveyard.length) {
      state.pending = {
        ...pending,
        step: "resurrect-more",
        movedPieceId: undefined,
        selected: [grave.piece.id],
      };
      state.legalTargets = [];
      state.notice = "Resurrect: spend 2 additional white orbs to revive a second piece, or finish.";
      return;
    }
    finishTurn(state, abilityDescription(state, `: revived ${pieceName(grave.piece)} on ${square}`));
  } else if (pending.step === "monument-base") {
    const selected = pending.selected ?? [];
    if (!selected.includes(square)) return;
    const needed = selected.length;
    for (const pawnSquare of selected) {
      const pawn = state.board[pawnSquare];
      if (!pawn) continue;
      delete state.board[pawnSquare];
      state.players[pawn.color].graveyard.push({ piece: pawn, capturedOnTurn: state.turn });
    }
    state.board[square] = {
      id: `${state.activeColor}-monument-${state.turn}`,
      type: "rook",
      color: state.activeColor,
      controller: state.activeColor,
      hasMoved: true,
      status: {},
    };
    finishTurn(
      state,
      abilityDescription(state, `: sacrificed ${needed} pawn${needed === 1 ? "" : "s"} and raised a rook on ${square}`),
    );
  } else if (pending.step === "monument-sacrifice") {
    const needed = 4 - currentLevel(state, abilityId);
    const selected = [...(pending.selected ?? []), square];
    if (selected.length < needed) {
      state.pending = { ...pending, selected };
      state.legalTargets = state.legalTargets.filter((candidate) => candidate !== square);
      state.notice = `Choose ${needed - selected.length} more pawn${needed - selected.length === 1 ? "" : "s"} to sacrifice.`;
      return;
    }
    state.pending = { ...pending, step: "monument-base", selected };
    state.legalTargets = selected;
    state.notice = "Choose which sacrificed pawn’s space will hold the new rook.";
  }
};

const handleSquare = (state: GameState, square: Square) => {
  if (
    state.pending?.step === "confirm-stone-gaze" ||
    state.pending?.step === "confirm-march-home"
  ) return;
  if (state.pending?.abilityId === "harden-choice") {
    if (state.pending.step === "harden-choice" && state.legalTargets.includes(square)) {
      state.pending = { ...state.pending, step: "harden-decision", source: square };
      state.legalTargets = [];
      state.notice = "Harden: remove the marker now, or keep it until Anubis’ next turn.";
    }
    return;
  }
  if (state.pending?.abilityId === "snipe-shot") {
    if (state.pending.step === "snipe-source" && state.legalTargets.includes(square)) {
      state.selectedSquare = square;
      state.pending.step = "snipe-target";
      state.legalTargets = preparedShotTargets(state, square);
      state.notice = "Snipe: choose an attacked piece to capture without moving.";
    } else if (
      state.pending.step === "snipe-target" &&
      state.selectedSquare &&
      state.legalTargets.includes(square)
    ) {
      const preparedPiece = state.board[state.selectedSquare];
      if (!captureAt(state, square, state.activeColor)) return;
      if (preparedPiece) delete preparedPiece.status.prepared;
      state.pending = undefined;
      state.selectedSquare = undefined;
      state.legalTargets = [];
      if (state.phase !== "gameover" && !queuePreparedShot(state)) {
        state.notice = `${colorName(state.activeColor)} to act. Choose an available god.`;
      }
    }
    return;
  }
  if (state.pending?.abilityId === "air-strike") {
    if (state.pending.step === "source") {
      if (!sourceIsAllowed(state, square)) return;
      const passengers = airStrikePassengerSquares(state, square)
        .filter((passenger) => airStrikeLandingTargets(state, square, passenger).length > 0);
      state.pending = { ...state.pending, step: "air-strike-passenger", source: square };
      state.selectedSquare = square;
      state.legalTargets = passengers;
      state.notice = "Air Strike: choose an adjacent friendly piece to pick up.";
    } else if (
      state.pending.step === "air-strike-passenger" &&
      state.pending.source &&
      state.legalTargets.includes(square)
    ) {
      const destinations = airStrikeLandingTargets(state, state.pending.source, square);
      if (!destinations.length) {
        state.notice = "That passenger leaves no valid flight and drop route. Choose another adjacent piece.";
        return;
      }
      state.pending = {
        ...state.pending,
        step: "air-strike-destination",
        selected: [square],
        movedPieceId: state.board[square]?.id,
      };
      state.legalTargets = destinations;
      state.notice = "Air Strike: choose an empty landing space for the carrier.";
    } else if (
      state.pending.step === "air-strike-destination" &&
      state.pending.source &&
      state.pending.selected?.[0] &&
      state.legalTargets.includes(square)
    ) {
      const carrierSquare = state.pending.source;
      const passengerSquare = state.pending.selected[0];
      state.pending = { ...state.pending, step: "air-strike-drop", destination: square };
      state.selectedSquare = square;
      state.legalTargets = airStrikeDropTargets(
        state,
        carrierSquare,
        square,
        passengerSquare,
      );
      state.notice = currentLevel(state, "air-strike") >= 2
        ? "Air Strike: drop on an empty crossed space or the first enemy flown over."
        : "Air Strike: choose an empty crossed space to drop the passenger.";
    } else if (
      state.pending.step === "air-strike-drop" &&
      state.pending.source &&
      state.pending.destination &&
      state.pending.selected?.[0] &&
      state.legalTargets.includes(square)
    ) {
      const carrierSquare = state.pending.source;
      const carrierDestination = state.pending.destination;
      const passengerSquare = state.pending.selected[0];
      const passenger = state.board[passengerSquare];
      if (!passenger) return;
      delete state.board[passengerSquare];
      const result = moveDirect(state, carrierSquare, carrierDestination);
      if (!result) return;
      delete state.board[result.to].status.luredBy;
      if (state.board[square]) captureAt(state, square, state.activeColor);
      const passengerStatus = { ...passenger.status, movedThisTurn: true };
      delete passengerStatus.luredBy;
      state.board[square] = {
        ...passenger,
        hasMoved: true,
        status: passengerStatus,
      };
      finishTurn(
        state,
        abilityDescription(
          state,
          `: ${pieceName(state.board[result.to])} landed on ${result.to} and dropped ${pieceName(passenger)} on ${square}`,
        ),
      );
    }
    return;
  }
  if (state.pending?.step === "march-companion" && state.pending.source) {
    if (!state.legalTargets.includes(square)) return;
    const companions = square === state.pending.source ? [] : [square];
    executeMarchHome(state, state.pending.source, companions);
    return;
  }
  if (state.pending?.step === "march-companions") {
    if (!state.legalTargets.includes(square)) return;
    const selected = [...(state.pending.selected ?? []), square];
    state.pending = {
      ...state.pending,
      selected,
    };
    state.legalTargets = state.legalTargets.filter((target) => target !== square);
    state.notice = `March Home: ${selected.length} companion${selected.length === 1 ? "" : "s"} selected. Choose more or pass to teleport.`;
    return;
  }
  if (state.pending?.step === "rage-source") {
    if (!state.legalTargets.includes(square) || !state.board[square]) return;
    state.selectedSquare = square;
    state.pending = { ...state.pending, step: "rage-destination", source: square };
    state.legalTargets = [
      square,
      ...legalTargets(state.board, square, { enPassant: state.enPassant, bananas: state.bananas })
        .filter((target) => distance(square, target) === 1),
    ];
    state.notice = "Rage: move up to 1 legal space, or choose the piece’s current space.";
    return;
  }
  if (state.pending?.step === "rage-destination" && state.pending.source) {
    if (!state.legalTargets.includes(square)) return;
    let center = state.pending.source;
    if (square !== state.pending.source) center = moveDirect(state, state.pending.source, square)?.to ?? center;
    state.selectedSquare = undefined;
    state.pending = { ...state.pending, step: "rage-choice", destination: center };
    state.legalTargets = [];
    state.notice = "Rage: choose whether friendly adjacent pieces are captured.";
    return;
  }
  if (state.pending?.step === "poison-area" && state.pending.source) {
    if (!state.legalTargets.includes(square)) return;
    const [firstFile, firstRank] = coords(state.pending.source);
    const [secondFile, secondRank] = coords(square);
    for (let file = Math.min(firstFile, secondFile); file <= Math.max(firstFile, secondFile); file += 1) {
      for (let rank = Math.min(firstRank, secondRank); rank <= Math.max(firstRank, secondRank); rank += 1) {
        const target = squareAt(file, rank);
        const piece = target ? state.board[target] : undefined;
        if (piece?.controller === opposite(state.activeColor)) {
          piece.status.poisoned = "god";
          piece.status.poisonedBy = state.activeColor;
        }
      }
    }
    finishTurn(state, abilityDescription(state, " across the selected area"));
    return;
  }
  if (state.pending?.step === "cull-choice" && state.pending.movedPieceId) {
    if (!state.legalTargets.includes(square) || !state.board[square]) return;
    const attackerSquare = findSquareById(state.board, state.pending.movedPieceId);
    if (!attackerSquare) return;
    const attacked = ordinaryAttackedPieceSquares(state.board, attackerSquare);
    const lowestValue = Math.min(...attacked.map((target) => pieceValue(state.board[target].type)));
    if (pieceValue(state.board[square].type) === lowestValue) {
      captureAt(state, square, state.activeColor);
    } else {
      moveDirect(state, attackerSquare, square);
    }
    finishTurn(state, abilityDescription(state, ` on ${square}`));
    return;
  }
  if (state.pending?.step === "mount-rider" && state.pending.destination) {
    if (!mountPrimaryIsValid(state)) return;
    if (!state.legalTargets.includes(square) || !state.board[square]) return;
    const knightDestination = state.pending.destination;
    state.pending = { ...state.pending, step: "mount-place", movedPieceId: state.board[square].id };
    state.legalTargets = adjacentSquares(knightDestination, false)
      .filter((target) => !state.board[target]);
    state.notice = "Mount: choose an empty orthogonally adjacent dismount space.";
    return;
  }
  if (state.pending?.step === "escort-companions" && state.pending.source) {
    if (!state.legalTargets.includes(square) || !state.board[square]) return;
    const kingSquare = state.pending.source;
    const selected = [...(state.pending.selected ?? []), state.board[square].id];
    const level = currentLevel(state, "escort");
    if (level === 1) {
      state.pending = {
        ...state.pending,
        step: "escort-move",
        selected,
      };
      state.selectedSquare = kingSquare;
      state.legalTargets = sourceTargets(state, kingSquare);
      state.notice = "Escort: choose the King’s destination.";
      return;
    }
    state.pending = {
      ...state.pending,
      selected,
    };
    state.legalTargets = state.legalTargets.filter((target) => target !== square);
    state.notice = `Escort: ${selected.length} companion${selected.length === 1 ? "" : "s"} selected. Choose more or pass to move.`;
    return;
  }
  if (state.pending?.step === "mount-place" && state.pending.destination && state.pending.movedPieceId) {
    if (!mountPrimaryIsValid(state)) return;
    if (!state.legalTargets.includes(square)) return;
    const riderSquare = findSquareById(state.board, state.pending.movedPieceId);
    if (!riderSquare) return;
    const rider = state.board[riderSquare];
    const mountHistory = [
      ...pendingMountHistory(state),
      `${pieceName(rider)} ${riderSquare} -> ${square}`,
    ];
    delete state.board[riderSquare];
    state.board[square] = { ...rider, hasMoved: true };
    const movedRiders = [...(state.pending.selected ?? []), rider.id];
    const level = currentLevel(state, "mount");
    const remainingRiders = adjacentSquares(state.pending.source!, false)
      .filter((candidate) => {
        const piece = state.board[candidate];
        return piece?.controller === state.activeColor && !movedRiders.includes(piece.id);
      });
    const destinations = adjacentSquares(state.pending.destination, false).filter((target) => !state.board[target]);
    if (movedRiders.length >= level || !remainingRiders.length || !destinations.length) {
      finishTurn(state, mountDescription(state, mountHistory, movedRiders.length));
    } else {
      state.pending = {
        ...state.pending,
        step: "mount-rider",
        movedPieceId: undefined,
        selected: movedRiders,
        mountHistory,
      };
      state.legalTargets = remainingRiders;
      state.notice = `Mount: choose another rider, or pass to finish (${movedRiders.length}/${level}).`;
    }
    return;
  }
  if (!state.selectedAbility || !state.pending) return;
  if (state.pending.step === "hex-target") {
    if (!state.legalTargets.includes(square) || !state.board[square]) return;
    state.board[square].status.hexedBy = state.activeColor;
    const selected = [...(state.pending.selected ?? []), state.board[square].id];
    const capacity = currentLevel(state, "hex");
    if (selected.length >= capacity) {
      const hadQueuedMove = Boolean(state.pending.queuedMove);
      state.pending = { ...state.pending, step: "source", selected };
      state.selectedSquare = undefined;
      state.legalTargets = [];
      if (hadQueuedMove) executeQueuedMove(state);
      else state.notice = "The hexes are set. Choose a piece to move.";
    } else {
      state.pending = { ...state.pending, selected };
      state.legalTargets = state.legalTargets.filter((target) => target !== square);
      state.notice = `Choose another piece to hex, or pass to continue (${selected.length}/${capacity}).`;
    }
    return;
  }
  if (["target"].includes(state.pending.step)) {
    if (state.legalTargets.includes(square)) chooseTarget(state, square);
    return;
  }
  if (["banana", "hire", "revive-place", "monument-base", "monument-sacrifice"].includes(state.pending.step)) {
    if (state.legalTargets.includes(square)) completeSpecialTarget(state, square);
    return;
  }
  if (state.selectedSquare) {
    if (state.legalTargets.includes(square)) {
      if (state.selectedAbility === "banana-peel") {
        if (!safeBananaPlacementsAfterMove(state, state.selectedSquare, square).placements.length) {
          state.notice = "That destination has no valid adjacent space for a banana peel that leaves your King safe. Choose another destination.";
          return;
        }
      }
      executeMovement(state, state.selectedSquare, square);
    }
    else if (!["slither", "escort-move"].includes(state.pending.step) && sourceIsAllowed(state, square)) {
      const targets = sourceTargets(state, square);
      if (!targets.length) {
        state.selectedSquare = undefined;
        state.legalTargets = [];
        state.notice = `That ${state.board[square].type} has no legal destination for this ability. Choose another piece.`;
        return;
      }
      state.selectedSquare = square;
      state.legalTargets = targets;
      state.notice = `Choose a destination for the ${state.board[square].type}.`;
    }
    return;
  }
  if (sourceIsAllowed(state, square)) {
    if (state.selectedAbility === "escort" && state.pending.step === "source") {
      const companions = adjacentSquares(square)
        .filter((target) => state.board[target]?.controller === state.activeColor);
      if (!companions.length) {
        state.notice = "Escort requires an adjacent friendly piece to move with the King.";
        return;
      }
      state.pending = { ...state.pending, step: "escort-companions", source: square, selected: [] };
      state.legalTargets = companions;
      state.notice = currentLevel(state, "escort") === 1
        ? "Escort: choose one adjacent friendly piece to accompany the King."
        : "Escort: choose one or more adjacent friendly pieces, then pass to move the King.";
      return;
    }
    const targets = sourceTargets(state, square);
    if (!targets.length) {
      state.notice = `That ${state.board[square].type} has no legal destination for this ability. Choose another piece.`;
      return;
    }
    state.selectedSquare = square;
    state.legalTargets = targets;
    state.pending.source = square;
    state.notice = `Choose a destination for the ${state.board[square].type}.`;
  }
};

const selectGod = (state: GameState, godId: GodId) => {
  if (state.pending?.abilityId === "snipe-shot" || state.pending?.abilityId === "harden-choice") return;
  if (state.pending?.step === "enchant-followup-move") return;
  if (!state.players[state.activeColor].gods.includes(godId) || state.rested.includes(godId)) return;
  if (state.selectedAbility) refundCost(state);
  state.selectedGod = godId;
  state.selectedAbility = undefined;
  state.pending = undefined;
  state.legalTargets = [];

  if (godId === "artemis") {
    for (const piece of Object.values(state.board)) {
      const prepared = preparedDetails(piece);
      if (prepared?.owner === state.activeColor && prepared.level === 2) delete piece.status.prepared;
    }
  }
  for (const [square, piece] of Object.entries(state.board)) {
    const status = { ...piece.status };
    if (godId === "anubis" && status.hardened === "god") delete status.hardened;
    if (godId === "medusa" && status.frozen === "god") delete status.frozen;
    if (godId === "medusa" && status.gazing) delete status.gazing;
    if (godId === "salem") {
      if (status.poisoned === "god") delete status.poisoned;
      if (status.polymorphed === "god") delete status.polymorphed;
    }
    if (godId === "chiron" && status.chargeUntil === "god") delete status.chargeUntil;
    if (godId === "kangus" && status.ritual?.expires === "kangus") delete status.ritual;
    state.board[square] = { ...piece, status };
  }
  if (godId === "kangus") {
    state.bananas = state.bananas.filter(
      (banana) => !(banana.owner === state.activeColor && banana.expires === "kangus"),
    );
  }
  state.notice = `${GOD_BY_ID[godId].name} answers. Choose an ability.`;
};

const draftGod = (state: GameState, godId: GodId) => {
  if (!state.draft.available.includes(godId)) return;
  const color = state.draft.order[state.draft.pickIndex];
  state.players[color].gods.push(godId);
  state.draft.available = state.draft.available.filter((id) => id !== godId);
  log(state, `${colorName(color)} drafted ${GOD_BY_ID[godId].name}.`);
  state.draft.pickIndex += 1;
  if (state.draft.pickIndex >= state.draft.order.length) {
    state.phase = "play";
    state.activeColor = "white";
    state.notice = "The pantheons are chosen. White takes the first divine turn.";
  } else {
    state.activeColor = state.draft.order[state.draft.pickIndex];
    state.notice = `${colorName(state.activeColor)} chooses the next god.`;
  }
};

const upgradeAbility = (state: GameState, abilityId: string) => {
  const player = state.players[state.activeColor];
  const godId = player.gods.find((candidate) =>
    GOD_BY_ID[candidate].abilities.some((ability) => ability.id === abilityId),
  );
  const ownsAbility = Boolean(godId);
  const current = player.upgrades[abilityId] ?? 1;
  if (!ownsAbility || !godId || current >= 3) return;
  const ability = GOD_BY_ID[godId].abilities.find((candidate) => candidate.id === abilityId)!;
  player.upgrades[abilityId] = (current + 1) as 2 | 3;
  const description = `${colorName(state.activeColor)} upgraded ${ability.name} with ${GOD_BY_ID[godId].name} to level ${current + 1}.`;
  log(state, description);
  state.lastAction = description;
  present(state, { kind: "upgrade", godId, abilityId });
  state.upgradePreview = undefined;
  state.upgradeQueue.shift();
  if (state.upgradeQueue.length) {
    state.activeColor = state.upgradeQueue[0];
    state.notice = `${colorName(state.activeColor)} upgrades one ability.`;
  } else {
    state.phase = "play";
    state.round += 1;
    state.rested = [];
    state.activeColor = "white";
    state.turn += 1;
    state.notice = `Round ${state.round}. White to act.`;
    resolveStartOfTurn(state);
  }
};

const canPassAction = (state: GameState) =>
  state.selectedAbility === "construction" ||
  state.selectedAbility === "marked" ||
  state.pending?.step === "slither" ||
  (state.pending?.step === "mount-rider" && mountPrimaryIsValid(state)) ||
  state.pending?.step === "funding" ||
  state.pending?.step === "march-companions" ||
  (state.pending?.step === "escort-companions" &&
    Boolean(state.pending.selected?.length)) ||
  (state.pending?.step === "hex-target" &&
    Boolean(state.pending.selected?.length)) ||
  state.pending?.abilityId === "snipe-shot";

const availableAbilityActions = (state: GameState): GameAction[] => {
  if (!state.selectedGod) return [];
  return GOD_BY_ID[state.selectedGod].abilities
    .filter((ability) => {
      const white = ability.cost?.white ?? 0;
      const black = ability.cost?.black ?? 0;
      const orbs = state.players[state.activeColor].orbs;
      return orbs.white >= white && orbs.black >= black;
    })
    .map((ability) => ({
      type: "select-ability",
      abilityId: ability.id,
    }));
};

export const availableClassicActions = (state: GameState): GameAction[] => {
  if (state.phase === "draft") {
    return state.draft.available.map((godId) => ({ type: "draft", godId }));
  }
  if (state.phase === "upgrade") {
    return state.players[state.activeColor].gods.flatMap((godId) =>
      GOD_BY_ID[godId].abilities
        .filter((ability) =>
          (state.players[state.activeColor].upgrades[ability.id] ?? 1) < 3
        )
        .map((ability) => ({
          type: "upgrade",
          abilityId: ability.id,
        } as GameAction)),
    );
  }
  if (state.phase !== "play") return [];

  if (state.pending?.abilityId === "harden-choice") {
    return state.pending.step === "harden-choice"
      ? state.legalTargets.map((square) => ({ type: "square", square }))
      : [
        { type: "harden-choice", keep: true },
        { type: "harden-choice", keep: false },
      ];
  }
  if (state.pending?.abilityId === "snipe-shot") {
    return [
      ...state.legalTargets.map((square) => ({
        type: "square",
        square,
      } as GameAction)),
      { type: "pass" },
    ];
  }
  if (state.pending?.step === "grave") {
    return state.players[state.activeColor].graveyard
      .map(({ piece }) => ({ type: "grave", pieceId: piece.id }));
  }
  if (state.pending?.step === "marked-choice") {
    return [{ type: "marked-execute" }, { type: "pass" }];
  }
  if (state.pending?.step === "rage-choice") {
    return [
      { type: "rage-resolve", spareFriendly: false },
      { type: "rage-resolve", spareFriendly: true },
    ];
  }
  if (state.pending?.step === "barter-choice") {
    return [
      { type: "barter", give: "white" },
      { type: "barter", give: "black" },
      { type: "barter" },
    ];
  }
  if (state.pending?.step === "slither-orb") {
    return [
      { type: "orb", orb: "white" },
      { type: "orb", orb: "black" },
    ];
  }
  if (state.pending?.step === "resurrect-more") {
    return [
      { type: "resurrect-more", revive: true },
      { type: "resurrect-more", revive: false },
    ];
  }
  if (state.pending?.step === "siphon-choice") {
    return [2, 1, 0].map((amount) => ({
      type: "siphon",
      amount,
    } as GameAction));
  }
  if (
    state.pending?.step === "confirm-stone-gaze" ||
    state.pending?.step === "confirm-march-home"
  ) {
    return [{ type: "confirm-ability" }];
  }
  if (!state.selectedGod) {
    return state.players[state.activeColor].gods
      .filter((godId) => !state.rested.includes(godId))
      .map((godId) => ({ type: "select-god", godId }));
  }
  if (!state.selectedAbility) {
    return [...availableAbilityActions(state), { type: "clear-god" }];
  }

  const actions: GameAction[] = [];
  if (state.legalTargets.length) {
    actions.push(...state.legalTargets.map((square) => ({
      type: "square",
      square,
    } as GameAction)));
  } else if (state.pending?.step === "source") {
    const candidates = state.selectedAbility === "enchant"
      ? allSquares
      : Object.entries(state.board)
          .filter(([, piece]) => piece.controller === state.activeColor)
          .map(([square]) => square);
    actions.push(...candidates.map((square) => ({
      type: "square",
      square,
    } as GameAction)));
  }
  if (canPassAction(state)) actions.push({ type: "pass" });
  if (!hasCommittedClassicAction(state)) actions.push({ type: "cancel" });
  return actions;
};

export const canStartClassicMoveFirst = (state: GameState) =>
  state.phase === "play" &&
  !state.result &&
  !state.selectedGod &&
  !state.selectedAbility &&
  !state.selectedSquare &&
  !state.pending &&
  state.legalTargets.length === 0;

export const classicMoveFirstTargets = (
  state: GameState,
  source: Square,
) => canStartClassicMoveFirst(state)
  ? firstAbilityNormalMoveTargets(state, source)
  : [];

export const classicMoveFirstSources = (state: GameState) =>
  canStartClassicMoveFirst(state)
    ? Object.keys(state.board).filter(
      (square) => firstAbilityNormalMoveTargets(state, square).length > 0,
    )
    : [];

const moveFirstConditionalOutcome = (
  abilityId: string,
  level: number,
  requiresPreMoveChoice: boolean,
  followUpStep?: string,
) => {
  if (abilityId === "ritual-sacrifice") {
    return level >= 3
      ? "This Goad grants 0 now. If this piece is captured before Kangus next acts, gain 4 light and 4 dark orbs."
      : level >= 2
        ? "This Goad grants 0 now. If this piece is captured before Kangus next acts, gain 3 light and 3 dark orbs."
        : "This Goad grants 0 now. If this piece is captured on the opponent's next turn, gain 3 light and 3 dark orbs.";
  }
  if (abilityId === "marked") {
    return level >= 3
      ? "The moved piece grants 0 now. It is Marked; later gain 3 dark when Death claims it, or execute it now for 5 dark."
      : "The moved piece grants 0 now. It is Marked; gain 3 dark orbs when Death claims it.";
  }
  if (abilityId === "barter") {
    if (followUpStep !== "barter-choice") return undefined;
    return level >= 3
      ? "If adjacent to an enemy, you may trade 1 orb to take up to 3 of the opposite color."
      : level >= 2
        ? "If adjacent to an enemy, you may trade 1 orb to take up to 2 of the opposite color and gain 1 matching the landing square."
        : "If adjacent to an enemy, you may trade 1 orb to take up to 2 of the opposite color.";
  }
  if (abilityId === "hex" && requiresPreMoveChoice) {
    return "Choose Hex target(s) first; the queued move will execute only if it remains legal.";
  }
  return undefined;
};

const moveFirstFollowUpLabel = (step: string) => {
  if (step === "slither-orb") return "Choose one extra orb.";
  if (step === "barter-choice") return "Choose whether to trade.";
  if (step === "marked-choice") return "Choose whether to execute the Marked piece.";
  if (step === "hex-target") return "Choose Hex target(s), then the move executes automatically.";
  return "Complete the ability's canonical follow-up.";
};

const applyMoveFirstCommit = (
  state: GameState,
  action: Extract<GameAction, { type: "commit-move-first" }>,
) => {
  if (
    !canStartClassicMoveFirst(state) ||
    state.activeColor !== action.expectedActor ||
    state.turn !== action.expectedTurn
  ) return false;
  const god = GOD_BY_ID[action.godId];
  if (
    !god ||
    god.abilities[0].id !== action.abilityId ||
    !state.players[state.activeColor].gods.includes(action.godId) ||
    state.rested.includes(action.godId) ||
    !firstAbilityNormalMoveTargets(state, action.move.from).includes(action.move.to)
  ) return false;
  const pieceId = state.board[action.move.from]?.id;
  if (!pieceId) return false;

  selectGod(state, action.godId);
  if (state.selectedGod === action.godId) {
    present(state, { kind: "god", godId: action.godId });
  }
  activateAbility(state, action.abilityId);
  if (
    state.selectedGod !== action.godId ||
    state.selectedAbility !== action.abilityId ||
    !state.pending
  ) return false;
  present(state, {
    kind: "ability",
    godId: action.godId,
    abilityId: action.abilityId,
  });
  if (state.pending.step === "hex-target") {
    state.pending.queuedMove = {
      ...action.move,
      actor: action.expectedActor,
      turn: action.expectedTurn,
      pieceId,
    };
    state.notice = `${state.notice} Your ${action.move.from} -> ${action.move.to} move is queued and not committed yet.`;
    return true;
  }
  if (
    state.pending.step !== "source" ||
    state.board[action.move.from]?.id !== pieceId ||
    !sourceIsAllowed(state, action.move.from) ||
    !sourceTargets(state, action.move.from).includes(action.move.to)
  ) return false;
  state.pending.source = action.move.from;
  state.selectedSquare = action.move.from;
  state.legalTargets = sourceTargets(state, action.move.from);
  executeMovement(state, action.move.from, action.move.to);
  return true;
};

export const classicMoveFirstCandidates = (
  state: GameState,
  move: ClassicMoveFirstMove,
): ClassicMoveFirstCandidate[] => {
  if (!classicMoveFirstTargets(state, move.from).includes(move.to)) return [];
  const before = state.players[state.activeColor].orbs;
  return GODS
    .filter((god) =>
      state.players[state.activeColor].gods.includes(god.id) &&
      !state.rested.includes(god.id)
    )
    .map((god) => {
      const ability = god.abilities[0];
      const action: Extract<GameAction, { type: "commit-move-first" }> = {
        type: "commit-move-first",
        godId: god.id,
        abilityId: ability.id,
        move,
        expectedActor: state.activeColor,
        expectedTurn: state.turn,
      };
      const next = withoutClassicTurnResolution(() => gameReducer(state, action));
      const valid = next !== state;
      const pending = valid &&
          next.activeColor === state.activeColor &&
          next.turn === state.turn &&
          next.pending?.abilityId === ability.id
        ? next.pending
        : undefined;
      const requiresPreMoveChoice = pending?.step === "hex-target" &&
        Boolean(pending.queuedMove);
      const after = next.players[state.activeColor].orbs;
      const level = currentLevelForOwner(state, state.activeColor, ability.id);
      return {
        godId: god.id,
        abilityId: ability.id,
        move,
        immediateOrbDelta: {
          white: valid ? after.white - before.white : 0,
          black: valid ? after.black - before.black : 0,
        },
        conditionalOutcome: moveFirstConditionalOutcome(
          ability.id,
          level,
          requiresPreMoveChoice,
          pending?.step,
        ),
        valid,
        requiresPreMoveChoice,
        followUp: pending && pending.step !== "source"
          ? {
            step: pending.step,
            label: moveFirstFollowUpLabel(pending.step),
          }
          : undefined,
        error: valid ? undefined : "This move is no longer valid for that ability.",
      };
    });
};

export const classicPlanStateSignature = (state: GameState) => JSON.stringify({
  phase: state.phase,
  activeColor: state.activeColor,
  turn: state.turn,
  round: state.round,
  draftPick: state.draft.pickIndex,
  upgradeQueue: state.upgradeQueue,
  selectedGod: state.selectedGod,
  selectedAbility: state.selectedAbility,
  selectedSquare: state.selectedSquare,
  legalTargets: state.legalTargets,
  pending: state.pending,
  board: state.board,
  players: state.players,
  rested: state.rested,
  bananas: state.bananas,
  stealth: state.stealth,
  bonusTurn: state.bonusTurn,
  winner: state.winner,
  result: state.result,
});

export const isCompleteClassicTurn = (
  initial: GameState,
  next: GameState,
) => {
  if (next.phase === "gameover") return true;
  if (initial.phase === "draft") {
    return next.draft.pickIndex !== initial.draft.pickIndex;
  }
  if (initial.phase === "upgrade") {
    return next.phase !== "upgrade" ||
      next.upgradeQueue.length !== initial.upgradeQueue.length ||
      next.activeColor !== initial.activeColor;
  }
  return next.phase !== initial.phase ||
    next.turn !== initial.turn ||
    next.activeColor !== initial.activeColor;
};

let completeTurnSearchDepth = 0;
let classicTurnResolutionSuppressed = 0;

const withoutClassicTurnResolution = <T,>(run: () => T) => {
  classicTurnResolutionSuppressed += 1;
  try {
    return run();
  } finally {
    classicTurnResolutionSuppressed -= 1;
  }
};

export const hasCompleteClassicTurn = (state: GameState) => {
  if (completeTurnSearchDepth > 0) return true;
  const color = state.activeColor;
  completeTurnSearchDepth += 1;
  try {
    return hasCompleteTurn({
      state,
      availableActions: availableClassicActions,
      reduce: (candidate, action) =>
        withoutClassicTurnResolution(() => gameReducer(candidate, action)),
      signature: classicPlanStateSignature,
      isComplete: isCompleteClassicTurn,
      acceptComplete: (_initial, next) =>
        Boolean(kingSquare(next.board, color)) &&
        !isInCheck(next.board, color, next.bananas),
      limits: {
        maxDepth: 18,
        maxStates: 20_000,
        maxActionsPerState: 256,
      },
    });
  } finally {
    completeTurnSearchDepth -= 1;
  }
};

const clearTurnSelection = (state: GameState) => {
  state.selectedGod = undefined;
  state.selectedAbility = undefined;
  state.selectedSquare = undefined;
  state.pending = undefined;
  state.legalTargets = [];
};

const adjudicateClassicNoTurn = (state: GameState) => {
  const color = state.activeColor;
  const king = kingSquare(state.board, color);
  if (!king) return;
  clearTurnSelection(state);
  if (isInCheck(state.board, color, state.bananas)) {
    const winner = opposite(color);
    const piece = state.board[king];
    delete state.board[king];
    sendCapturedPieceToGraveyard(state, piece, king);
    setClassicWinner(state, winner, "checkmate");
    const message = `${colorName(color)} was checkmated by ${colorName(winner)}.`;
    log(state, message);
    state.lastAction = message;
    state.notice = message;
  } else {
    setClassicStalemate(state);
    const message = `${colorName(color)} was stalemated. The match is a draw.`;
    log(state, message);
    state.lastAction = message;
    state.notice = message;
  }
};

const resolveClassicTurnStart = (state: GameState) => {
  if (
    completeTurnSearchDepth > 0 ||
    classicTurnResolutionSuppressed > 0 ||
    (
      state.gameMode === "puzzle" &&
      !isInCheck(state.board, state.activeColor, state.bananas)
    ) ||
    state.phase !== "play" ||
    state.result ||
    state.selectedGod ||
    state.selectedAbility
  ) return;
  if (hasCompleteClassicTurn(state)) return;
  adjudicateClassicNoTurn(state);
};

const beganClassicPlayTurn = (previous: GameState, next: GameState) =>
  next.phase === "play" &&
  (
    previous.phase !== "play" ||
    previous.turn !== next.turn ||
    previous.activeColor !== next.activeColor
  );

export const gameReducer = (state: GameState, action: GameAction): GameState => {
  if (action.type === "new-game") {
    return createGame(undefined, { mode: action.mode, aiDifficulty: action.aiDifficulty });
  }
  if (action.type === "restart") {
    const hostName = state.onlineHostColor
      ? state.players[state.onlineHostColor].name
      : undefined;
    const guestName = state.onlineHostColor
      ? state.players[opposite(state.onlineHostColor)].name
      : undefined;
    return createGame(undefined, {
      mode: state.gameMode,
      aiDifficulty: state.aiDifficulty,
      hostName,
      guestName,
    });
  }
  if (action.type === "load-game") {
    const loaded = structuredClone(action.state);
    if (
      loaded.phase === "gameover" &&
      loaded.winner &&
      !loaded.result
    ) {
      loaded.result = {
        kind: "winner",
        winner: loaded.winner,
        reason: "king-death",
      };
    }
    resolveClassicTurnStart(loaded);
    return loaded;
  }
  if (action.type === "adjudicate-no-turn") {
    if (
      state.phase !== "play" ||
      (state.gameMode !== "ai" && state.gameMode !== "puzzle") ||
      state.aiColor !== state.activeColor ||
      state.activeColor !== action.activeColor ||
      state.turn !== action.turn ||
      state.selectedGod ||
      state.selectedAbility ||
      state.selectedSquare ||
      state.pending ||
      state.legalTargets.length
    ) return state;
    const next = cloneState(state);
    adjudicateClassicNoTurn(next);
    return next;
  }
  if (
    state.phase === "play" &&
    hasCommittedClassicAction(state) &&
    ["cancel", "clear-god", "select-god", "select-ability"].includes(action.type)
  ) return state;
  if (
    state.phase === "play" &&
    state.pending?.abilityId === "mount" &&
    ["mount-rider", "mount-place"].includes(state.pending.step) &&
    !mountPrimaryIsValid(state)
  ) return state;
  if (
    state.phase === "play" &&
    action.type === "pass" &&
    hasCommittedClassicAction(state) &&
    !canPassAction(state)
  ) return state;
  const previousOrbs = {
    white: { ...state.players.white.orbs },
    black: { ...state.players.black.orbs },
  };
  const animationSource =
    action.type === "square"
      ? action.square
      : action.type === "commit-move-first"
        ? action.move.to
      : action.type === "barter" || action.type === "siphon" || action.type === "orb"
        ? state.pending?.destination
        : action.type === "marked-execute" && state.pending?.movedPieceId
          ? findSquareById(state.board, state.pending.movedPieceId)
          : undefined;
  const next = cloneState(state);
  next.orbAnimations ??= [];
  next.nextOrbAnimationId ??= 1;
  next.captureAnimations ??= [];
  next.nextCaptureAnimationId ??= 1;
  next.nextPresentationId ??= 1;
  if (action.type === "draft" && next.phase === "draft") draftGod(next, action.godId);
  else if (action.type === "auto-draft" && next.phase === "draft") draftGod(next, action.godId);
  else if (action.type === "commit-move-first" && next.phase === "play") {
    if (!applyMoveFirstCommit(next, action)) return state;
  }
  else if (action.type === "select-god" && next.phase === "play") {
    if (hasCommittedClassicAction(next)) return state;
    selectGod(next, action.godId);
    if (next.selectedGod === action.godId) {
      present(next, { kind: "god", godId: action.godId });
    }
  }
  else if (action.type === "clear-god" && next.phase === "play" && next.selectedGod) {
    if (
      next.pending?.step === "enchant-followup-move" ||
      hasCommittedClassicAction(next)
    ) return state;
    if (next.selectedAbility) refundCost(next);
    next.selectedGod = undefined;
    next.selectedAbility = undefined;
    next.selectedSquare = undefined;
    next.pending = undefined;
    next.legalTargets = [];
    next.notice = `${colorName(next.activeColor)} to act. Choose an available god.`;
  }
  else if (action.type === "select-ability" && next.phase === "play") {
    if (
      next.pending?.step === "enchant-followup-move" ||
      hasCommittedClassicAction(next)
    ) return state;
    if (next.selectedAbility) refundCost(next);
    activateAbility(next, action.abilityId);
    if (next.selectedGod && next.selectedAbility === action.abilityId) {
      present(next, {
        kind: "ability",
        godId: next.selectedGod,
        abilityId: action.abilityId,
      });
    }
  } else if (action.type === "confirm-ability" && next.phase === "play") {
    if (next.pending?.step === "confirm-stone-gaze") {
      resolveStoneGaze(next);
    } else if (next.pending?.step === "confirm-march-home" && next.pending.source) {
      executeMarchHome(next, next.pending.source, []);
    }
  } else if (action.type === "square" && next.phase === "play") handleSquare(next, action.square);
  else if (action.type === "grave" && next.pending?.step === "grave") chooseGravePiece(next, action.pieceId);
  else if (action.type === "marked-execute" && next.pending?.step === "marked-choice" && next.pending.movedPieceId) {
    const square = findSquareById(next.board, next.pending.movedPieceId);
    if (square) {
      const doomed = next.board[square];
      if (doomed.type !== "king") {
        delete next.board[square];
        sendCapturedPieceToGraveyard(next, doomed, square);
        addOrbs(next, next.activeColor, 0, 5);
      }
    }
    finishTurn(next, abilityDescription(next, ": executed the marked piece and gained 5 black orbs"));
  }
  else if (action.type === "rage-resolve" && next.pending?.step === "rage-choice" && next.pending.destination) {
    resolveRage(next, next.pending.destination, action.spareFriendly);
    finishTurn(
      next,
      abilityDescription(
        next,
        `: ${action.spareFriendly ? "spared friendly pieces" : "captured every adjacent piece"}`,
      ),
    );
  }
  else if (action.type === "barter" && next.pending?.step === "barter-choice") {
    if (action.give && next.players[next.activeColor].orbs[action.give] > 0) {
      const enemy = opposite(next.activeColor);
      const take = opposite(action.give);
      next.players[next.activeColor].orbs[action.give] -= 1;
      next.players[enemy].orbs[action.give] += 1;
      const amount = currentLevel(next, "barter") >= 3 ? 3 : 2;
      const available = Math.min(amount, next.players[enemy].orbs[take]);
      next.players[enemy].orbs[take] -= available;
      next.players[next.activeColor].orbs[take] += available;
      if (currentLevel(next, "barter") >= 2 && next.pending.destination) {
        const landedOn = squareColor(next.pending.destination);
        addOrbs(next, next.activeColor, landedOn === "white" ? 1 : 0, landedOn === "black" ? 1 : 0);
      }
      finishTurn(next, abilityDescription(next, `: gave a ${action.give} orb to complete the trade`));
    } else {
      finishTurn(next, abilityDescription(next, ": declined the trade"));
    }
  }
  else if (action.type === "orb" && next.pending?.step === "slither-orb") {
    addOrbs(
      next,
      next.activeColor,
      action.orb === "white" ? 1 : 0,
      action.orb === "black" ? 1 : 0,
    );
    finishTurn(next, abilityDescription(next, `: chose 1 extra ${action.orb} orb`));
  }
  else if (action.type === "resurrect-more" && next.pending?.step === "resurrect-more") {
    if (action.revive) {
      if (next.players[next.activeColor].orbs.white < 2) {
        next.notice = "You need 2 additional white orbs to revive a second piece.";
      } else {
        addOrbs(next, next.activeColor, -2, 0);
        next.pending.step = "grave";
        next.notice = "Choose the second piece from your graveyard.";
      }
    } else {
      finishTurn(next, abilityDescription(next, ": completed with one revived piece"));
    }
  }
  else if (action.type === "harden-choice" && next.pending?.step === "harden-decision" && next.pending.source) {
    const piece = next.board[next.pending.source];
    if (piece) {
      if (action.keep) piece.status.hardened = "god";
      else delete piece.status.hardened;
    }
    next.pending = undefined;
    next.legalTargets = [];
    if (!queueHardenChoice(next) && !queuePreparedShot(next)) {
      next.notice = `${colorName(next.activeColor)} to act. Choose an available god.`;
    }
  }
  else if (action.type === "siphon" && next.pending?.step === "siphon-choice") {
    const enemy = opposite(next.activeColor);
    const stolen = Math.min(action.amount, next.players[enemy].orbs.white);
    addOrbs(next, enemy, -stolen, 0);
    addOrbs(next, next.activeColor, stolen, 0);
    finishTurn(
      next,
      abilityDescription(next, `: stole ${stolen} white orb${stolen === 1 ? "" : "s"}`),
    );
  }
  else if (action.type === "preview-upgrade" && next.phase === "upgrade") {
    if (!action.godId) {
      next.upgradePreview = undefined;
    } else if (next.players[next.activeColor].gods.includes(action.godId)) {
      const validAbility = action.abilityId
        ? GOD_BY_ID[action.godId].abilities.some((ability) => ability.id === action.abilityId)
        : true;
      if (validAbility) {
        next.upgradePreview = {
          color: next.activeColor,
          godId: action.godId,
          abilityId: action.abilityId,
        };
        present(next, {
          kind: "upgrade-preview",
          godId: action.godId,
          abilityId: action.abilityId,
        });
      }
    }
  }
  else if (action.type === "upgrade" && next.phase === "upgrade") upgradeAbility(next, action.abilityId);
  else if (action.type === "cancel" && next.phase === "play") {
    if (hasCommittedClassicAction(next)) return state;
    refundCost(next);
    next.selectedAbility = undefined;
    next.selectedSquare = undefined;
    next.pending = undefined;
    next.legalTargets = [];
    next.notice = next.selectedGod ? "Choose an ability." : "Choose an available god.";
  } else if (action.type === "pass" && next.phase === "play" && next.selectedGod) {
    if (
      compelledLuredSquares(next).length &&
      (next.selectedAbility === "construction" || next.selectedAbility === "marked") &&
      next.pending?.step === "source"
    ) {
      next.notice = "A Lured piece must move closer to the opposing Queen this turn if possible.";
    } else if (next.selectedAbility === "construction") {
      addOrbs(next, next.activeColor, 2, 0);
      finishTurn(next, abilityDescription(next, ": held position and gained 2 white orbs"));
    } else if (next.selectedAbility === "marked") {
      if (next.pending?.step === "marked-choice") {
        finishTurn(next, abilityDescription(next, ": left the moved piece marked for Death"));
      } else {
        const reward = currentLevel(next, "marked") >= 2 ? 1 : 0;
        if (reward) addOrbs(next, next.activeColor, 1, 0);
        finishTurn(next, abilityDescription(next, `: waited${reward ? " and gained 1 white orb" : ""}`));
      }
    } else if (next.pending?.step === "slither") {
      finishTurn(next, abilityDescription(next, ": completed the movement"));
    } else if (next.pending?.step === "mount-rider") {
      finishTurn(
        next,
        mountDescription(
          next,
          pendingMountHistory(next),
          next.pending.selected?.length ?? 0,
        ),
      );
    } else if (next.pending?.step === "funding") {
      finishTurn(next, abilityDescription(next, ": completed the pawn movement"));
    } else if (next.pending?.step === "hex-target" && next.pending.selected?.length) {
      const hadQueuedMove = Boolean(next.pending.queuedMove);
      next.pending.step = "source";
      next.legalTargets = [];
      if (hadQueuedMove) executeQueuedMove(next);
      else next.notice = "The hexes are set. Choose a piece to move.";
    } else if (next.pending?.step === "march-companions" && next.pending.source) {
      executeMarchHome(next, next.pending.source, next.pending.selected ?? []);
    } else if (
      next.pending?.step === "escort-companions" &&
      next.pending.source &&
      next.pending.selected?.length
    ) {
      const kingSquare = next.pending.source;
      next.pending.step = "escort-move";
      next.selectedSquare = kingSquare;
      next.legalTargets = sourceTargets(next, kingSquare);
      next.notice = "Escort: choose the King’s destination.";
    }
  } else if (action.type === "pass" && next.phase === "play" && next.pending?.abilityId === "snipe-shot") {
    for (const piece of Object.values(next.board)) {
      const prepared = preparedDetails(piece);
      if (prepared?.owner === next.activeColor && prepared.level === 1) delete piece.status.prepared;
    }
    next.pending = undefined;
    next.selectedSquare = undefined;
    next.legalTargets = [];
    next.notice = `${colorName(next.activeColor)} skipped the prepared shot. Choose an available god.`;
  }

  if (animationSource) {
    for (const player of ["white", "black"] as const) {
      for (const orb of ["white", "black"] as const) {
        const amount = next.players[player].orbs[orb] - previousOrbs[player][orb];
        if (amount <= 0) continue;
        next.orbAnimations.push({
          id: next.nextOrbAnimationId,
          player,
          orb,
          amount,
          total: next.players[player].orbs[orb],
          source: animationSource,
        });
        next.nextOrbAnimationId += 1;
      }
    }
    next.orbAnimations = next.orbAnimations.slice(-8);
  }
  const actor = state.activeColor;
  if (
    isCompleteClassicTurn(state, next) &&
    Boolean(kingSquare(next.board, actor)) &&
    isInCheck(next.board, actor, next.bananas)
  ) {
    return state;
  }
  if (beganClassicPlayTurn(state, next)) resolveClassicTurnStart(next);
  return next;
};

export const simulateClassicAction = (
  state: GameState,
  action: GameAction,
) => withoutClassicTurnResolution(() => gameReducer(state, action));
