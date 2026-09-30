import {
  createDefaultThreePlayerConfig,
  createThreePlayerDraftOrder,
  createThreePlayerTurnOrder,
  nextThreePlayerSeat,
  validateThreePlayerConfig,
} from "./threePlayerConfig";
import {
  createThreePlayerInitialBoard,
  createThreePlayerInitialCastlingRights,
  threePlayerApplyMove,
  threePlayerCheckingSeats,
  threePlayerIsInCheck,
  threePlayerKingCell,
  threePlayerLegalMoves,
} from "./threePlayerChess";
import { prepareThreePlayerState } from "./threePlayerPersistence";
import {
  THREE_PLAYER_SEATS,
  type ThreePlayerAction,
  type ThreePlayerConfig,
  type ThreePlayerPiece,
  type ThreePlayerSeat,
  type ThreePlayerState,
} from "./threePlayerTypes";
import { GODS } from "./gods";

const clone = <T>(value: T): T => structuredClone(value);

const emptyRecency = (): ThreePlayerState["kingAttackRecency"] => ({
  white: {},
  red: {},
  black: {},
});

const name = (state: ThreePlayerState, seat: ThreePlayerSeat) =>
  state.players[seat].name;

const livingSeats = (state: ThreePlayerState) =>
  THREE_PLAYER_SEATS.filter((seat) => !state.players[seat].eliminated);

const appendHistory = (state: ThreePlayerState, message: string) => {
  state.history.push(message);
  state.lastAction = message;
};

const clearEffectsOwnedBy = (
  piece: ThreePlayerPiece,
  eliminated: ThreePlayerSeat,
) => {
  if (piece.status.frozenBy === eliminated) {
    delete piece.status.frozen;
    delete piece.status.frozenBy;
  }
  if (piece.status.poisonedBy === eliminated) {
    delete piece.status.poisoned;
    delete piece.status.poisonedBy;
  }
  if (piece.status.luredBy === eliminated) delete piece.status.luredBy;
  if (piece.status.hexedBy === eliminated) delete piece.status.hexedBy;
  if (
    typeof piece.status.prepared === "object" &&
    piece.status.prepared.owner === eliminated
  ) delete piece.status.prepared;
  if (piece.status.ritual?.owner === eliminated) delete piece.status.ritual;
  if (piece.status.markedForDeath?.owner === eliminated) {
    delete piece.status.markedForDeath;
  }
};

const setResult = (
  state: ThreePlayerState,
  result: ThreePlayerState["result"],
) => {
  state.result = result;
  state.phase = "gameover";
  state.notice = result?.kind === "draw"
    ? result.reason === "stalemate"
      ? "The match is a draw by stalemate."
      : "The match is a draw: every surviving seat is stalemated."
    : `${name(state, result!.seat)} wins.`;
};

const evaluateLastSurvivor = (state: ThreePlayerState) => {
  if (state.result) return;
  const survivors = livingSeats(state);
  if (survivors.length === 1) {
    setResult(state, {
      kind: "winner",
      seat: survivors[0],
      reason: "last-survivor",
    });
  }
};

const clearPassCycle = (state: ThreePlayerState) => {
  state.passCycle = {
    positionRevision: state.positionRevision,
    passedSeats: [],
  };
};

const mutatePosition = (state: ThreePlayerState) => {
  state.positionRevision += 1;
  clearPassCycle(state);
};

const sendToGraveyard = (
  state: ThreePlayerState,
  piece: ThreePlayerPiece,
) => {
  state.players[piece.owner].graveyard.push({
    piece: clone(piece),
    capturedOnTurn: state.turn,
  });
};

const eliminateSeat = (
  state: ThreePlayerState,
  eliminated: ThreePlayerSeat,
  captor: ThreePlayerSeat,
) => {
  const player = state.players[eliminated];
  if (player.eliminated) return;
  player.eliminated = true;
  player.eliminatedBy = captor;
  const takeoverController =
    state.config.takeover && !state.players[captor].eliminated ? captor : null;
  const nextController = (piece: ThreePlayerPiece) =>
    piece.owner === eliminated || state.players[piece.owner].eliminated
      ? takeoverController
      : piece.owner;

  for (const piece of Object.values(state.board)) {
    clearEffectsOwnedBy(piece, eliminated);
    if (piece.owner === eliminated) {
      delete piece.status.hardened;
      delete piece.status.gazing;
      delete piece.status.chargeUntil;
      delete piece.status.prepared;
    }
    if (piece.owner !== eliminated && piece.controller !== eliminated) continue;
    delete piece.status.hired;
    piece.controller = nextController(piece);
  }
  appendHistory(
    state,
    `${name(state, eliminated)} was eliminated by ${name(state, captor)}.`,
  );
  mutatePosition(state);
  if (state.config.victoryMode === "first-checkmate") {
    setResult(state, {
      kind: "winner",
      seat: captor,
      reason: "first-checkmate",
    });
  } else {
    evaluateLastSurvivor(state);
  }
};

const capturePiece = (
  state: ThreePlayerState,
  piece: ThreePlayerPiece,
  captor: ThreePlayerSeat,
) => {
  sendToGraveyard(state, piece);
  appendHistory(
    state,
    `${name(state, piece.owner)}'s ${piece.type} was captured by ${name(state, captor)}.`,
  );
  if (piece.type === "king") eliminateSeat(state, piece.owner, captor);
};

const recordKingAttackChanges = (
  previous: ThreePlayerState | undefined,
  next: ThreePlayerState,
) => {
  for (const defender of THREE_PLAYER_SEATS) {
    if (next.players[defender].eliminated) continue;
    const before = new Set(
      previous && !previous.players[defender].eliminated
        ? threePlayerCheckingSeats(previous, defender)
        : [],
    );
    for (const attacker of threePlayerCheckingSeats(next, defender)) {
      if (before.has(attacker)) continue;
      next.attackSequence += 1;
      next.kingAttackRecency[defender][attacker] = next.attackSequence;
    }
  }
};

const mostRecentCheckingSeat = (
  state: ThreePlayerState,
  defender: ThreePlayerSeat,
) => threePlayerCheckingSeats(state, defender).sort((first, second) =>
  (state.kingAttackRecency[defender][second] ?? 0) -
    (state.kingAttackRecency[defender][first] ?? 0) ||
  THREE_PLAYER_SEATS.indexOf(second) - THREE_PLAYER_SEATS.indexOf(first)
)[0];

const resolveCheckmate = (
  state: ThreePlayerState,
  eliminated: ThreePlayerSeat,
) => {
  const captor = mostRecentCheckingSeat(state, eliminated);
  const kingCell = threePlayerKingCell(state, eliminated);
  const king = kingCell ? state.board[kingCell] : undefined;
  if (!captor || !kingCell || !king) return false;
  const beforeElimination = clone(state);
  delete state.board[kingCell];
  sendToGraveyard(state, king);
  appendHistory(
    state,
    `${name(state, eliminated)} was checkmated by ${name(state, captor)}.`,
  );
  eliminateSeat(state, eliminated, captor);
  if (!state.result) recordKingAttackChanges(beforeElimination, state);
  return true;
};

const recordStalematePass = (
  state: ThreePlayerState,
  seat: ThreePlayerSeat,
) => {
  if (state.config.victoryMode === "first-checkmate") {
    appendHistory(state, `${name(state, seat)} was stalemated.`);
    setResult(state, { kind: "draw", reason: "stalemate" });
    return;
  }
  if (state.passCycle.positionRevision !== state.positionRevision) {
    clearPassCycle(state);
  }
  if (!state.passCycle.passedSeats.includes(seat)) {
    state.passCycle.passedSeats.push(seat);
  }
  appendHistory(state, `${name(state, seat)} was stalemated and skipped.`);
  const survivors = livingSeats(state);
  if (survivors.every((survivor) =>
    state.passCycle.passedSeats.includes(survivor)
  )) {
    setResult(state, { kind: "draw", reason: "stalemate-cycle" });
  }
};

const resolveTurnStart = (state: ThreePlayerState) => {
  let guard = 0;
  while (state.phase === "play" && !state.result && guard < 12) {
    guard += 1;
    const seat = state.activeSeat;
    const legalMoves = threePlayerLegalMoves(state, seat);
    if (legalMoves.length) {
      state.notice = `${name(state, seat)} to move.`;
      return;
    }
    if (threePlayerIsInCheck(state, seat)) {
      if (!resolveCheckmate(state, seat) || state.result) return;
    } else {
      recordStalematePass(state, seat);
      if (state.result) return;
    }
    const survivors = livingSeats(state);
    if (!survivors.length) {
      setResult(state, { kind: "draw", reason: "stalemate-cycle" });
      return;
    }
    state.activeSeat = nextThreePlayerSeat(seat, survivors);
  }
};

export const createThreePlayerGame = (
  configuration: ThreePlayerConfig = createDefaultThreePlayerConfig(),
): ThreePlayerState => {
  const config = clone(validateThreePlayerConfig(configuration));
  const turnOrder = createThreePlayerTurnOrder();
  const createSeatState = (
    seat: ThreePlayerSeat,
  ): ThreePlayerState["players"][ThreePlayerSeat] => ({
    seat,
    name: config.seats[seat].name,
    displayColor: config.seats[seat].displayColor,
    control: clone(config.seats[seat].control),
    eliminated: false,
    gods: [],
    orbs: { light: 0, dark: 0 },
    graveyard: [],
    upgrades: {},
  });
  return {
    variant: "three-player",
    schemaVersion: 1,
    phase: "draft",
    config,
    board: createThreePlayerInitialBoard(config.boardVariant),
    players: {
      white: createSeatState("white"),
      red: createSeatState("red"),
      black: createSeatState("black"),
    },
    activeSeat: "white",
    turnOrder,
    draft: {
      order: createThreePlayerDraftOrder(),
      pickIndex: 0,
      available: GODS.map((god) => god.id),
      unused: [],
    },
    rested: [],
    round: 1,
    turn: 1,
    completedTurns: { white: 0, red: 0, black: 0 },
    castlingRights: createThreePlayerInitialCastlingRights(
      config.boardVariant,
    ),
    attackSequence: 0,
    kingAttackRecency: emptyRecency(),
    revision: 0,
    positionRevision: 0,
    passCycle: { positionRevision: 0, passedSeats: [] },
    history: [],
    notice: `${config.seats.white.name} drafts first. Choose a God.`,
  };
};

const reduceDraft = (
  state: ThreePlayerState,
  godId: Extract<ThreePlayerAction, { type: "draft" }>["godId"],
) => {
  if (!state.draft.available.includes(godId)) return false;
  const seat = state.draft.order[state.draft.pickIndex];
  if (seat !== state.activeSeat) return false;
  state.players[seat].gods.push(godId);
  state.draft.available = state.draft.available.filter(
    (available) => available !== godId,
  );
  state.draft.pickIndex += 1;
  appendHistory(state, `${name(state, seat)} drafted ${godId}.`);
  if (state.draft.pickIndex === state.draft.order.length) {
    state.draft.unused = state.draft.available;
    state.draft.available = [];
    state.phase = "play";
    state.activeSeat = "white";
    recordKingAttackChanges(undefined, state);
    resolveTurnStart(state);
  } else {
    state.activeSeat = state.draft.order[state.draft.pickIndex];
    state.notice = `${name(state, state.activeSeat)} drafts next.`;
  }
  return true;
};

const movesEqual = (
  first: { from: string; to: string; promotion?: string },
  second: { from: string; to: string; promotion?: string },
) => first.from === second.from &&
  first.to === second.to &&
  first.promotion === second.promotion;

const reduceMove = (
  state: ThreePlayerState,
  action: Extract<ThreePlayerAction, { type: "move" }>,
) => {
  const move = {
    from: action.from,
    to: action.to,
    ...(action.promotion ? { promotion: action.promotion } : {}),
  };
  if (!threePlayerLegalMoves(state, state.activeSeat).some((legal) =>
    movesEqual(legal, move)
  )) return false;

  const previous = clone(state);
  const actor = state.activeSeat;
  const applied = threePlayerApplyMove(state, move);
  state.board = applied.board;
  state.castlingRights = applied.castlingRights;
  state.enPassant = applied.enPassant;
  mutatePosition(state);
  if (applied.captured) capturePiece(state, applied.captured, actor);
  state.completedTurns[actor] += 1;
  state.turn += 1;
  if (actor === "black") state.round += 1;
  appendHistory(
    state,
    `${name(state, actor)} moved ${action.from} to ${action.to}.`,
  );
  recordKingAttackChanges(previous, state);
  if (state.result) return true;
  state.activeSeat = nextThreePlayerSeat(actor, livingSeats(state));
  resolveTurnStart(state);
  return true;
};

export const availableThreePlayerActions = (
  state: ThreePlayerState,
): ThreePlayerAction[] => {
  if (state.phase === "draft") {
    return state.draft.available.map((godId) => ({ type: "draft", godId }));
  }
  if (state.phase !== "play") return [];
  return threePlayerLegalMoves(state, state.activeSeat).map((move) => ({
    type: "move",
    ...move,
  }));
};

export const threePlayerReducer = (
  state: ThreePlayerState,
  action: ThreePlayerAction,
): ThreePlayerState => {
  if (action.type === "load") {
    const loaded = prepareThreePlayerState(action.state);
    resolveTurnStart(loaded);
    return loaded;
  }
  if (action.type === "restart") {
    const restarted = createThreePlayerGame(state.config);
    restarted.revision = state.revision + 1;
    return restarted;
  }
  if (state.phase === "gameover") return state;
  const next = clone(state);
  const changed = action.type === "draft"
    ? next.phase === "draft" && reduceDraft(next, action.godId)
    : action.type === "move" && next.phase === "play" && reduceMove(next, action);
  if (!changed) return state;
  next.revision = state.revision + 1;
  return next;
};
