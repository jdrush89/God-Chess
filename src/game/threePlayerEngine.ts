import {
  createDefaultThreePlayerConfig,
  createThreePlayerDraftOrder,
  createThreePlayerTurnOrder,
  nextThreePlayerSeat,
  threePlayerPieceAffinity,
  threePlayerSeatsAreHostile,
  validateThreePlayerConfig,
} from "./threePlayerConfig";
import {
  createThreePlayerInitialBoard,
  createThreePlayerInitialCastlingRights,
  threePlayerApplyMove,
  threePlayerCanOrdinarilyCapture,
  threePlayerCheckingSeats,
  threePlayerIsInCheck,
  threePlayerKingCell,
  threePlayerLegalTargets,
  threePlayerLegalMoves,
  threePlayerLineOfSight,
  threePlayerPieceValue,
  threePlayerPseudoTargets,
} from "./threePlayerChess";
import {
  threePlayerAdjacentCells,
  threePlayerAdvanceClass,
  threePlayerAdvancement,
  threePlayerAreas,
  threePlayerCellAffinity,
  threePlayerCrossedCells,
  threePlayerDiagonalCells,
  threePlayerDistance,
  threePlayerFormationDestination,
  threePlayerFrontCells,
  threePlayerHomeCell,
  threePlayerOrthogonalCells,
  threePlayerSharesTrace,
  threePlayerTravelPaths,
} from "./threePlayerDivineGeometry";
import { prepareThreePlayerState } from "./threePlayerPersistence";
import { getThreePlayerTopology } from "./threePlayerTopology";
import {
  THREE_PLAYER_SEATS,
  type ThreePlayerAction,
  type ThreePlayerConfig,
  type ThreePlayerPiece,
  type ThreePlayerOrbAffinity,
  type ThreePlayerSeat,
  type ThreePlayerState,
} from "./threePlayerTypes";
import { abilityLevel, GOD_BY_ID, GODS } from "./gods";
import type { GodId, PieceType } from "./types";

const clone = <T>(value: T): T => structuredClone(value);

const ensureLayer2 = (state: ThreePlayerState) => {
  state.schemaVersion = 2;
  state.seatTurns ??= clone(state.completedTurns);
  state.hostileTurns ??= { white: 0, red: 0, black: 0 };
  state.godTurns ??= { white: {}, red: {}, black: {} };
  state.upgradeQueue ??= [];
  state.legalCells ??= [];
  state.legalSeats ??= [];
  state.legalPaths ??= [];
  state.bananas ??= [];
  state.stealth ??= { white: [], red: [], black: [] };
  state.orbEvents ??= [];
  state.nextOrbEventId ??= 1;
  state.presentationEvents ??= [];
  state.nextPresentationEventId ??= 1;
  return state;
};

const activePlayer = (state: ThreePlayerState) => state.players[state.activeSeat];
const currentLevel = (state: ThreePlayerState, abilityId: string) =>
  abilityLevel(activePlayer(state).upgrades, abilityId);
const levelFor = (
  state: ThreePlayerState,
  seat: ThreePlayerSeat,
  abilityId: string,
) => abilityLevel(state.players[seat].upgrades, abilityId);

const alliedPiece = (
  state: ThreePlayerState,
  piece: ThreePlayerPiece | undefined,
) => Boolean(piece?.controller === state.activeSeat);

const hostilePiece = (
  state: ThreePlayerState,
  piece: ThreePlayerPiece | undefined,
) => Boolean(
  piece && (
    piece.controller === null ||
    threePlayerSeatsAreHostile(state.activeSeat, piece.controller)
  ),
);

const emitPresentation = (
  state: ThreePlayerState,
  event: Omit<
    NonNullable<ThreePlayerState["presentationEvents"]>[number],
    "id"
  >,
) => {
  ensureLayer2(state);
  state.presentationEvents!.push({
    id: state.nextPresentationEventId!++,
    ...event,
  });
};

const addOrbs = (
  state: ThreePlayerState,
  seat: ThreePlayerSeat,
  light = 0,
  dark = 0,
  source?: string,
) => {
  const player = state.players[seat];
  const changes: Array<[ThreePlayerOrbAffinity, number]> = [
    ["light", light],
    ["dark", dark],
  ];
  for (const [orb, amount] of changes) {
    if (!amount) continue;
    player.orbs[orb] = Math.max(0, player.orbs[orb] + amount);
    if (amount > 0 && source) {
      state.orbEvents!.push({
        id: state.nextOrbEventId!++,
        player: seat,
        orb,
        amount,
        total: player.orbs[orb],
        source,
      });
    }
  }
};

const addAffinityOrb = (
  state: ThreePlayerState,
  seat: ThreePlayerSeat,
  affinity: ThreePlayerOrbAffinity,
  amount: number,
  source?: string,
) => addOrbs(
  state,
  seat,
  affinity === "light" ? amount : 0,
  affinity === "dark" ? amount : 0,
  source,
);

const abilityCost = (state: ThreePlayerState, abilityId: string) => {
  const ability = GOD_BY_ID[state.selectedGod!].abilities.find(
    (candidate) => candidate.id === abilityId,
  )!;
  return {
    light: ability.cost?.white ?? 0,
    dark: ability.cost?.black ?? 0,
  };
};

const payCost = (state: ThreePlayerState, abilityId: string) => {
  const cost = abilityCost(state, abilityId);
  const orbs = activePlayer(state).orbs;
  if (orbs.light < cost.light || orbs.dark < cost.dark) return false;
  addOrbs(state, state.activeSeat, -cost.light, -cost.dark);
  return true;
};

const refundCost = (state: ThreePlayerState) => {
  if (!state.selectedAbility || !state.selectedGod) return;
  const cost = abilityCost(state, state.selectedAbility);
  addOrbs(state, state.activeSeat, cost.light, cost.dark);
};

const abilityDescription = (state: ThreePlayerState, detail = "") => {
  const god = GOD_BY_ID[state.selectedGod!];
  const ability = god.abilities.find(
    (candidate) => candidate.id === state.selectedAbility,
  );
  return `${name(state, state.activeSeat)} used ${
    ability?.name ?? state.selectedAbility
  } with ${god.name}${detail}.`;
};

const pieceName = (piece: ThreePlayerPiece) =>
  piece.type[0].toUpperCase() + piece.type.slice(1);

const COMMITTED_PENDING_STEPS = new Set([
  "air-strike-drop",
  "banana",
  "barter-orb",
  "barter-seat",
  "cull-choice",
  "funding",
  "hire",
  "marked-choice",
  "mount-place",
  "mount-rider",
  "rage-choice",
  "resurrect-more",
  "siphon-amount",
  "siphon-seat",
  "slither",
]);

export const hasCommittedThreePlayerAction = (state: ThreePlayerState) => {
  if (!state.pending) return false;
  if (COMMITTED_PENDING_STEPS.has(state.pending.step)) return true;
  if (
    ["grave", "revive-place"].includes(state.pending.step) &&
    Boolean(state.pending.selected?.length)
  ) return true;
  return state.pending.abilityId === "hex" &&
    Boolean(state.pending.selected?.length);
};

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
  ensureLayer2(state);
  const displaced = THREE_PLAYER_SEATS.flatMap((seat) =>
    state.stealth![seat].filter((entry) =>
      entry.piece.owner === eliminated ||
      entry.piece.controller === eliminated
    )
  );
  for (const seat of THREE_PLAYER_SEATS) {
    state.stealth![seat] = state.stealth![seat].filter((entry) =>
      entry.piece.owner !== eliminated &&
      entry.piece.controller !== eliminated
    );
  }
  for (const entry of displaced) {
    entry.piece.controller = nextController(entry.piece);
    delete entry.piece.status.hired;
    if (entry.piece.controller) {
      state.stealth![entry.piece.controller].push({
        ...entry,
        returnOnTurn: state.seatTurns![entry.piece.controller] + 1,
      });
    } else if (!state.board[entry.destination]) {
      state.board[entry.destination] = entry.piece;
    } else {
      sendToGraveyard(state, entry.piece);
    }
  }
  state.bananas = state.bananas!.filter(
    (banana) => banana.owner !== eliminated,
  );
  state.upgradeQueue = state.upgradeQueue!.filter(
    (seat) => seat !== eliminated,
  );
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
  if (
    piece.status.ritual &&
    (
      piece.status.ritual.expires === "kangus" ||
      state.hostileTurns![piece.status.ritual.owner] <
        piece.status.ritual.expires
    )
  ) {
    const reward = levelFor(
      state,
      piece.status.ritual.owner,
      "ritual-sacrifice",
    ) >= 3 ? 4 : 3;
    addOrbs(
      state,
      piece.status.ritual.owner,
      reward,
      reward,
    );
  }
  appendHistory(
    state,
    `${name(state, piece.owner)}'s ${piece.type} was captured by ${name(state, captor)}.`,
  );
  if (piece.type === "king") eliminateSeat(state, piece.owner, captor);
};

const captureAt = (
  state: ThreePlayerState,
  cell: string,
  explicitFriendly = false,
) => {
  const piece = state.board[cell];
  if (!piece || piece.status.hardened) return undefined;
  if (
    !explicitFriendly &&
    piece.controller === state.activeSeat
  ) return undefined;
  delete state.board[cell];
  capturePiece(state, piece, state.activeSeat);
  emitPresentation(state, {
    kind: "capture",
    seat: state.activeSeat,
    source: cell,
    pieceId: piece.id,
  });
  return piece;
};

const bananaOnPath = (
  state: ThreePlayerState,
  from: string,
  requestedTo: string,
  pathId?: string,
) => [
  ...threePlayerCrossedCells(state, from, requestedTo, pathId),
  requestedTo,
].find((cell) =>
  state.bananas!.some((banana) =>
    banana.cell === cell && banana.owner !== state.activeSeat
  )
);

const moveDirect = (
  state: ThreePlayerState,
  from: string,
  requestedTo: string,
  teleport = false,
  pathId?: string,
) => {
  const moving = state.board[from];
  if (!moving?.controller) return undefined;
  const peel = teleport
    ? undefined
    : bananaOnPath(state, from, requestedTo, pathId);
  const to = peel ?? requestedTo;
  const result = threePlayerApplyMove(state, { from, to });
  state.board = result.board;
  state.castlingRights = result.castlingRights;
  state.enPassant = result.enPassant;
  if (result.captured) capturePiece(state, result.captured, state.activeSeat);
  if (peel) {
    state.bananas = state.bananas!.filter(
      (banana) => banana.cell !== peel,
    );
  }
  mutatePosition(state);
  emitPresentation(state, {
    kind: "move",
    seat: state.activeSeat,
    source: from,
    destination: to,
    pieceId: moving.id,
  });
  return { piece: state.board[to], from, to, captured: result.captured };
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

let mateEscapeSearchDepth = 0;

const hasDivineCheckEscape = (state: ThreePlayerState) => {
  if (mateEscapeSearchDepth > 0) return false;
  const king = threePlayerKingCell(state, state.activeSeat);
  if (
    !king ||
    !getThreePlayerTopology(state.config.boardVariant).cellSet.has(king)
  ) return false;
  mateEscapeSearchDepth += 1;
  try {
    const seat = state.activeSeat;
    const initialTurns = state.completedTurns[seat];
    const seen = new Set<string>();
    let frontier = [clone(state)];
    for (let depth = 0; depth < 12 && frontier.length; depth += 1) {
      const expanded: ThreePlayerState[] = [];
      for (const node of frontier) {
        const signature = JSON.stringify({
          activeSeat: node.activeSeat,
          completedTurns: node.completedTurns,
          selectedGod: node.selectedGod,
          selectedAbility: node.selectedAbility,
          selectedCell: node.selectedCell,
          selectedPath: node.selectedPath,
          pending: node.pending,
          board: node.board,
          players: node.players,
          rested: node.rested,
        });
        if (seen.has(signature)) continue;
        seen.add(signature);
        for (const action of availableThreePlayerActions(node).slice(0, 256)) {
          const next = threePlayerReducer(node, action);
          if (next === node) continue;
          if (
            next.completedTurns[seat] > initialTurns &&
            !next.players[seat].eliminated &&
            !threePlayerIsInCheck(next, seat)
          ) return true;
          if (
            next.activeSeat === seat &&
            next.completedTurns[seat] === initialTurns
          ) expanded.push(next);
        }
      }
      frontier = expanded.slice(0, 2_000);
    }
    return false;
  } finally {
    mateEscapeSearchDepth -= 1;
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
      if (hasDivineCheckEscape(state)) {
        state.notice = `${name(state, seat)} is in check and must use a legal escape.`;
        return;
      }
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
    schemaVersion: 2,
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
    seatTurns: { white: 0, red: 0, black: 0 },
    hostileTurns: { white: 0, red: 0, black: 0 },
    godTurns: { white: {}, red: {}, black: {} },
    upgradeQueue: [],
    legalCells: [],
    legalSeats: [],
    legalPaths: [],
    castlingRights: createThreePlayerInitialCastlingRights(
      config.boardVariant,
    ),
    attackSequence: 0,
    kingAttackRecency: emptyRecency(),
    revision: 0,
    positionRevision: 0,
    passCycle: { positionRevision: 0, passedSeats: [] },
    bananas: [],
    stealth: { white: [], red: [], black: [] },
    orbEvents: [],
    nextOrbEventId: 1,
    presentationEvents: [],
    nextPresentationEventId: 1,
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
    if (!state.result) resolveStartOfDivineTurn(state);
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

const findCellById = (state: ThreePlayerState, pieceId: string) =>
  Object.entries(state.board).find(([, piece]) => piece.id === pieceId)?.[0];

const survivingGods = (state: ThreePlayerState) =>
  livingSeats(state).flatMap((seat) => state.players[seat].gods);

const hasUpgradeableAbility = (
  state: ThreePlayerState,
  seat: ThreePlayerSeat,
) => state.players[seat].gods.some((godId) =>
  GOD_BY_ID[godId].abilities.some((ability) =>
    abilityLevel(state.players[seat].upgrades, ability.id) < 3
  )
);

const normalizeUpgradeQueue = (state: ThreePlayerState) => {
  state.upgradeQueue = state.upgradeQueue!.filter((seat) =>
    !state.players[seat].eliminated && hasUpgradeableAbility(state, seat)
  );
};

const expireStatuses = (
  state: ThreePlayerState,
  endingSeat: ThreePlayerSeat,
) => {
  for (const piece of Object.values(state.board)) {
    const controller = piece.controller;
    const status = { ...piece.status };
    if (
      controller &&
      typeof status.hardened === "number" &&
      controller !== endingSeat
    ) {
      if (status.hardened <= 1) {
        if (levelFor(state, controller, "harden") >= 2) {
          status.hardened = "choice";
        } else {
          delete status.hardened;
        }
      } else {
        status.hardened -= 1;
      }
    }
    if (controller === endingSeat) {
      for (const key of ["frozen", "polymorphed"] as const) {
        const value = status[key];
        if (typeof value === "number") {
          if (value <= 1) delete status[key];
          else status[key] = value - 1;
        }
      }
      if (typeof status.chargeUntil === "number") {
        if (status.chargeUntil <= 1) delete status.chargeUntil;
        else status.chargeUntil -= 1;
      }
      delete status.luredBy;
      delete status.movedThisTurn;
    }
    if (
      status.ritual &&
      typeof status.ritual.expires === "number" &&
      state.hostileTurns![status.ritual.owner] >= status.ritual.expires
    ) delete status.ritual;
    piece.status = status;
  }
  for (const piece of Object.values(state.board)) {
    if (!piece.status.gazing || !piece.controller) continue;
    if (!Object.values(state.board).some((target) =>
      target.status.frozen && target.status.frozenBy === piece.controller
    )) delete piece.status.gazing;
  }
  state.bananas = state.bananas!.filter((banana) =>
    typeof banana.expires === "number"
      ? state.hostileTurns![banana.owner] < banana.expires
      : true
  );
};

const preparedDetails = (piece: ThreePlayerPiece) =>
  !piece.status.prepared
    ? undefined
    : typeof piece.status.prepared === "boolean"
      ? { owner: piece.controller!, level: 1 as const }
      : piece.status.prepared;

const preparedShotTargets = (
  state: ThreePlayerState,
  source: string,
) => threePlayerPseudoTargets(state, source, {
  attacksOnly: true,
}).filter((target) => {
  const victim = state.board[target];
  if (!hostilePiece(state, victim)) return false;
  const simulated = clone(state);
  delete simulated.board[target];
  return !threePlayerIsInCheck(simulated, state.activeSeat);
});

const queuePreparedShot = (state: ThreePlayerState) => {
  const prepared = Object.entries(state.board).filter(([cell, piece]) => {
    const details = preparedDetails(piece);
    if (
      !details ||
      details.owner !== state.activeSeat ||
      piece.controller !== state.activeSeat
    ) return false;
    if (preparedShotTargets(state, cell).length) return true;
    if (details.level === 1) delete piece.status.prepared;
    return false;
  });
  if (!prepared.length) return false;
  state.pending = {
    godId: "artemis",
    abilityId: "snipe-shot",
    step: "snipe-source",
  };
  state.legalCells = prepared.map(([cell]) => cell);
  state.notice = "Prepared Shot: choose a prepared piece or pass.";
  return true;
};

const queueHardenChoice = (state: ThreePlayerState) => {
  const cells = Object.entries(state.board)
    .filter(([, piece]) =>
      piece.controller === state.activeSeat &&
      piece.status.hardened === "choice"
    )
    .map(([cell]) => cell);
  if (!cells.length) return false;
  state.pending = {
    godId: "anubis",
    abilityId: "harden-choice",
    step: "harden-choice",
  };
  state.legalCells = cells;
  state.notice = "Harden: choose a piece whose duration ended.";
  return true;
};

const resolveStartOfDivineTurn = (state: ThreePlayerState) => {
  ensureLayer2(state);
  for (const piece of Object.values(state.board)) {
    if (piece.status.poisonedBy === state.activeSeat) {
      delete piece.status.poisoned;
      delete piece.status.poisonedBy;
    }
  }
  const returns = state.stealth![state.activeSeat].filter(
    (entry) => entry.returnOnTurn <= state.seatTurns![state.activeSeat],
  );
  for (const returning of returns) {
    const occupant = state.board[returning.destination];
    if (occupant && !occupant.status.hardened) {
      captureAt(state, returning.destination, true);
    }
    if (!state.board[returning.destination]) {
      state.board[returning.destination] = {
        ...returning.piece,
        status: { ...returning.piece.status, movedThisTurn: true },
      };
    } else {
      sendToGraveyard(state, returning.piece);
    }
  }
  state.stealth![state.activeSeat] = state.stealth![state.activeSeat].filter(
    (entry) => entry.returnOnTurn > state.seatTurns![state.activeSeat],
  );
  if (!queueHardenChoice(state)) queuePreparedShot(state);
};

const resolveMarkedForDeath = (state: ThreePlayerState) => {
  for (const [cell, piece] of Object.entries(state.board)) {
    if (
      piece.status.markedForDeath?.owner !== state.activeSeat ||
      piece.status.markedForDeath.round > state.round
    ) continue;
    delete state.board[cell];
    capturePiece(state, piece, state.activeSeat);
    addOrbs(state, state.activeSeat, 0, 3, cell);
  }
};

const startNextRound = (state: ThreePlayerState) => {
  const survivors = livingSeats(state);
  if (!survivors.length) return;
  state.phase = "play";
  state.round += 1;
  state.rested = [];
  state.upgradeQueue = [];
  state.activeSeat = survivors[0];
  state.turn += 1;
  resolveStartOfDivineTurn(state);
  state.notice = `Round ${state.round}. ${name(state, state.activeSeat)} to act.`;
};

const finishDivineTurn = (
  state: ThreePlayerState,
  description: string,
) => {
  if (state.selectedGod === "death") resolveMarkedForDeath(state);
  if (state.selectedGod && !state.rested.includes(state.selectedGod)) {
    state.rested.push(state.selectedGod);
  }
  appendHistory(state, description);
  state.selectedGod = undefined;
  state.selectedAbility = undefined;
  state.selectedCell = undefined;
  state.selectedPath = undefined;
  state.pending = undefined;
  state.legalCells = [];
  state.legalSeats = [];
  state.legalPaths = [];
  if (state.phase === "gameover") return;
  const endingSeat = state.activeSeat;
  state.completedTurns[endingSeat] += 1;
  state.seatTurns![endingSeat] += 1;
  for (const seat of THREE_PLAYER_SEATS) {
    if (seat !== endingSeat) state.hostileTurns![seat] += 1;
  }
  expireStatuses(state, endingSeat);
  const gods = survivingGods(state);
  if (gods.length && gods.every((godId) => state.rested.includes(godId))) {
    state.upgradeQueue = livingSeats(state);
    normalizeUpgradeQueue(state);
    if (!state.upgradeQueue.length) {
      startNextRound(state);
      return;
    }
    state.phase = "upgrade";
    state.activeSeat = state.upgradeQueue[0];
    state.notice = `${name(state, state.activeSeat)} upgrades one ability.`;
    return;
  }
  state.turn += 1;
  const keepsTurn = state.bonusTurn === endingSeat &&
    !state.players[endingSeat].eliminated;
  state.activeSeat = keepsTurn
    ? endingSeat
    : nextThreePlayerSeat(endingSeat, livingSeats(state));
  state.bonusTurn = undefined;
  if (state.enPassant && state.enPassant.expiresOnTurn < state.turn) {
    state.enPassant = undefined;
  }
  resolveStartOfDivineTurn(state);
  resolveTurnStart(state);
  if (!state.result && !state.pending) {
    state.notice = `${name(state, state.activeSeat)} to act. Choose a God.`;
  }
};

const allowedEnchantTypes = (level: number): PieceType[] =>
  level === 1
    ? ["pawn", "knight", "bishop"]
    : level === 2
      ? ["pawn", "knight", "bishop", "rook"]
      : ["pawn", "knight", "bishop", "rook", "queen"];

const queensControlledBy = (
  state: ThreePlayerState,
  seat: ThreePlayerSeat,
) => Object.entries(state.board)
  .filter(([, piece]) => piece.controller === seat && piece.type === "queen")
  .map(([cell]) => cell);

const compelledLuredSources = (state: ThreePlayerState) =>
  Object.entries(state.board)
    .filter(([source, piece]) => {
      if (
        piece.controller !== state.activeSeat ||
        !piece.status.luredBy
      ) return false;
      const queens = queensControlledBy(state, piece.status.luredBy);
      if (!queens.length) return false;
      const current = Math.min(
        ...queens.map((queen) => threePlayerDistance(state, source, queen)),
      );
      return threePlayerLegalTargets(state, source).some((target) =>
        Math.min(
          ...queens.map((queen) =>
            threePlayerDistance(state, target, queen)
          ),
        ) < current
      );
    })
    .map(([cell]) => cell);

const constrainLure = (
  state: ThreePlayerState,
  source: string,
  targets: string[],
) => {
  const lurer = state.board[source]?.status.luredBy;
  if (!lurer) return targets;
  const queens = queensControlledBy(state, lurer);
  if (!queens.length) return targets;
  const current = Math.min(
    ...queens.map((queen) => threePlayerDistance(state, source, queen)),
  );
  const closer = targets.filter((target) =>
    Math.min(
      ...queens.map((queen) => threePlayerDistance(state, target, queen)),
    ) < current
  );
  return closer.length ? closer : targets;
};

const sourceIsAllowed = (state: ThreePlayerState, cell: string) => {
  const piece = state.board[cell];
  if (!piece || piece.status.gazing || !state.selectedAbility) return false;
  const abilityId = state.selectedAbility;
  const level = currentLevel(state, abilityId);
  const fundingRepeat = abilityId === "military-funding" &&
    level >= 3 &&
    state.pending?.step === "funding" &&
    !state.pending.selected?.includes("__no-repeat");
  if (piece.status.movedThisTurn && !fundingRepeat) return false;
  const compelled = compelledLuredSources(state);
  if (
    abilityId !== "enchant" &&
    compelled.length &&
    !compelled.includes(cell)
  ) return false;
  if (abilityId === "enchant") {
    return hostilePiece(state, piece) &&
      allowedEnchantTypes(level).includes(piece.type);
  }
  if (["air-lift", "march-home", "escort"].includes(abilityId)) {
    return piece.controller === state.activeSeat && piece.type === "king";
  }
  if (abilityId === "air-strike") {
    return piece.controller === state.activeSeat &&
      threePlayerAdjacentCells(state, cell).some((adjacent) => {
        const passenger = state.board[adjacent];
        return alliedPiece(state, passenger) &&
          (level >= 3
            ? ["pawn", "knight", "bishop"].includes(passenger.type)
            : passenger.type === "pawn");
      });
  }
  if (abilityId === "slither") {
    return piece.controller === state.activeSeat && piece.type === "queen";
  }
  if (abilityId === "military-funding") {
    return piece.controller === state.activeSeat && piece.type === "pawn";
  }
  if (abilityId === "charge") {
    return piece.controller === state.activeSeat && piece.type === "knight";
  }
  return piece.controller === state.activeSeat;
};

const safeTeleportTargets = (
  state: ThreePlayerState,
  source: string,
  targets: string[],
) => targets.filter((target) => {
  if (state.board[target]?.type === "king") return false;
  const simulated = clone(state);
  const piece = simulated.board[source];
  const captured = simulated.board[target];
  delete simulated.board[source];
  delete simulated.board[target];
  simulated.board[target] = {
    ...piece,
    hasMoved: true,
    status: { ...piece.status, movedThisTurn: true },
  };
  if (captured?.status.hardened) return false;
  return !threePlayerIsInCheck(simulated, state.activeSeat);
});

const sourceTargets = (state: ThreePlayerState, cell: string): string[] => {
  const abilityId = state.selectedAbility!;
  const level = currentLevel(state, abilityId);
  const piece = state.board[cell];
  if (!piece) return [];
  if (
    piece.status.hardened &&
    piece.controller &&
    levelFor(state, piece.controller, "harden") >= 3
  ) {
    const simulated = clone(state);
    delete simulated.board[cell].status.hardened;
    return constrainLure(
      state,
      cell,
      threePlayerLegalTargets(simulated, cell)
        .filter((target) => !simulated.board[target]),
    );
  }
  if (abilityId === "flight") {
    const ordinary = threePlayerLegalTargets(state, cell);
    const flying = threePlayerLegalTargets(state, cell, {
      ignoreBlockers: true,
      noCapture: true,
    });
    return constrainLure(state, cell, [...new Set([...ordinary, ...flying])]);
  }
  if (abilityId === "air-lift") {
    const targets = getTopologyCells(state).filter((target) =>
      !state.board[target] &&
      threePlayerDistance(state, cell, target) <= level + 2
    );
    return constrainLure(state, cell, safeTeleportTargets(state, cell, targets));
  }
  if (abilityId === "charge") {
    return constrainLure(
      state,
      cell,
      threePlayerLegalTargets(state, cell, { forceType: "rook" }),
    );
  }
  if (abilityId === "slither") {
    return constrainLure(
      state,
      cell,
      threePlayerLegalTargets(state, cell, {
        forceType: "bishop",
        noCapture: true,
      }),
    );
  }
  if (abilityId === "march-home") {
    const home = threePlayerHomeCell(state, piece.owner);
    return home ? safeTeleportTargets(state, cell, [home]) : [];
  }
  if (abilityId === "escort") {
    const maxDistance = level >= 3 ? 2 : 1;
    return constrainLure(
      state,
      cell,
      threePlayerPseudoTargets(state, cell, {
        forceType: level >= 3 ? "queen" : "king",
        maxDistance,
      }).filter((target) =>
        threePlayerDistance(state, cell, target) <= maxDistance
      ),
    );
  }
  if (abilityId === "pick-a-fight") {
    if (level < 3 && !["knight", "bishop"].includes(piece.type)) return [];
    return constrainLure(
      state,
      cell,
      safeTeleportTargets(
        state,
        cell,
        getTopologyCells(state).filter((target) => {
          if (state.board[target]) return false;
          const simulated = clone(state);
          delete simulated.board[cell];
          simulated.board[target] = piece;
          const attacked = THREE_PLAYER_SEATS.some((attacker) =>
            attacker !== state.activeSeat &&
            Object.entries(simulated.board).some(([enemyCell, enemy]) =>
              enemy.controller === attacker &&
              threePlayerPseudoTargets(simulated, enemyCell, {
                attacksOnly: true,
                includeAlliedTargets: true,
              }).includes(target)
            )
          );
          const attacksTwo = threePlayerPseudoTargets(simulated, target, {
            attacksOnly: true,
          }).filter((candidate) =>
            hostilePiece(state, simulated.board[candidate])
          ).length >= 2;
          return attacked || (level >= 2 && attacksTwo);
        }),
      ),
    );
  }
  if (abilityId === "enchant") {
    const simulated = clone(state);
    simulated.board[cell].controller = state.activeSeat;
    return threePlayerLegalTargets(simulated, cell)
      .filter((target) => state.board[target]?.type !== "king");
  }
  const options = piece.type === "knight" && piece.status.chargeUntil
    ? [
      ...threePlayerLegalTargets(state, cell),
      ...threePlayerLegalTargets(state, cell, { forceType: "rook" }),
    ]
    : threePlayerLegalTargets(state, cell);
  let targets = [...new Set(options)];
  if (abilityId === "siphon") {
    targets = targets.filter((target) =>
      threePlayerAdjacentCells(state, target).some((adjacent) =>
        hostilePiece(state, state.board[adjacent])
      )
    );
  }
  if (abilityId === "leverage") {
    targets = targets.filter((target) =>
      threePlayerAdjacentCells(state, target).some((adjacent) => {
        const hire = state.board[adjacent];
        const extra = hire?.type === "rook"
          ? 1
          : hire?.type === "queen" ? 2 : 0;
        return hostilePiece(state, hire) &&
          hire.type !== "king" &&
          allowedEnchantTypes(level).includes(hire.type) &&
          activePlayer(state).orbs.dark >= extra;
      })
    );
  }
  if (abilityId === "cull-the-weak") {
    targets = targets.filter((target) => {
      const simulated = clone(state);
      const applied = threePlayerApplyMove(simulated, { from: cell, to: target });
      simulated.board = applied.board;
      return threePlayerPseudoTargets(simulated, target, {
        attacksOnly: true,
      }).filter((attacked) =>
        hostilePiece(state, simulated.board[attacked])
      ).length >= 2;
    });
  }
  return constrainLure(state, cell, targets);
};

const getTopologyCells = (state: ThreePlayerState) =>
  getThreePlayerTopology(state.config.boardVariant).cells;

const stoneGazeTargets = (state: ThreePlayerState) => {
  const queens = Object.entries(state.board).filter(([, piece]) =>
    piece.controller === state.activeSeat && piece.type === "queen"
  );
  const queenIds = new Set(queens.map(([, piece]) => piece.id));
  const targets = Object.entries(state.board).filter(([cell, piece]) =>
    !queenIds.has(piece.id) &&
    queens.some(([queen]) =>
      threePlayerLineOfSight(state, queen, cell)
    )
  );
  return { queens, targets };
};

const resolveStoneGaze = (state: ThreePlayerState) => {
  const level = currentLevel(state, "stone-gaze");
  const { queens, targets } = stoneGazeTargets(state);
  for (const [, piece] of targets) {
    piece.status.frozen = level >= 3
      ? "god"
      : level + 1 + (piece.controller === state.activeSeat ? 1 : 0);
    piece.status.frozenBy = state.activeSeat;
  }
  for (const [, queen] of queens) {
    if (targets.length) queen.status.gazing = true;
  }
  finishDivineTurn(
    state,
    abilityDescription(
      state,
      `: petrified ${targets.length} piece${targets.length === 1 ? "" : "s"}`,
    ),
  );
};

const startTargetAbility = (
  state: ThreePlayerState,
  abilityId: string,
) => {
  const level = currentLevel(state, abilityId);
  if (abilityId === "lure") {
    state.legalCells = Object.entries(state.board)
      .filter(([, piece]) =>
        hostilePiece(state, piece) &&
        allowedEnchantTypes(level).includes(piece.type)
      )
      .map(([cell]) => cell);
  } else if (abilityId === "rage") {
    state.pending = {
      godId: state.selectedGod!,
      abilityId,
      step: level >= 3 ? "rage-source" : "target",
    };
    state.legalCells = level >= 3
      ? Object.entries(state.board)
        .filter(([, piece]) => piece.controller === state.activeSeat)
        .map(([cell]) => cell)
      : Object.keys(state.board);
    state.notice = level >= 3
      ? "Rage: choose a controlled piece to move up to one space."
      : "Choose the center of Rage.";
    return;
  } else if (abilityId === "poison-cloud" && level >= 2) {
    state.legalCells = getTopologyCells(state).flatMap((cell) =>
      threePlayerAreas(state, cell, level as 2 | 3).length ? [cell] : []
    );
  } else {
    state.legalCells = Object.entries(state.board)
      .filter(([, piece]) =>
        hostilePiece(state, piece) && piece.type !== "king"
      )
      .map(([cell]) => cell);
  }
  state.pending = {
    godId: state.selectedGod!,
    abilityId,
    step: "target",
  };
  state.notice = `Choose a target for ${abilityId}.`;
};

const activateAbility = (
  state: ThreePlayerState,
  abilityId: string,
) => {
  if (!state.selectedGod) return;
  const god = GOD_BY_ID[state.selectedGod];
  const ability = god.abilities.find((candidate) => candidate.id === abilityId);
  if (!ability) return;
  if (
    ["lure", "stone-gaze"].includes(abilityId) &&
    !queensControlledBy(state, state.activeSeat).length
  ) {
    state.notice = `${ability.name} requires a controlled Queen.`;
    return;
  }
  if (
    compelledLuredSources(state).length &&
    (
      ["target", "revive", "sacrifice"].includes(ability.kind) ||
      ["enchant", "march-home"].includes(abilityId)
    )
  ) {
    state.notice = "A Lured piece must move closer to its luring Queen.";
    return;
  }
  if (!payCost(state, abilityId)) {
    state.notice = "You do not have enough orbs for that ability.";
    return;
  }
  state.selectedAbility = abilityId;
  state.selectedCell = undefined;
  state.selectedPath = undefined;
  state.legalCells = [];
  state.legalPaths = [];
  state.pending = { godId: god.id, abilityId, step: "source" };
  emitPresentation(state, {
    kind: "ability",
    seat: state.activeSeat,
    godId: god.id,
    abilityId,
  });
  if (abilityId === "stone-gaze") {
    state.pending.step = "confirm-stone-gaze";
    state.notice = `Stone Gaze will affect ${stoneGazeTargets(state).targets.length} pieces.`;
    return;
  }
  if (ability.kind === "target") {
    startTargetAbility(state, abilityId);
    return;
  }
  if (abilityId === "resurrect") {
    const bishops = Object.entries(state.board)
      .filter(([, piece]) =>
        piece.controller === state.activeSeat && piece.type === "bishop"
      );
    if (!bishops.length || !activePlayer(state).graveyard.length) {
      refundCost(state);
      state.selectedAbility = undefined;
      state.pending = undefined;
      state.notice = "Resurrect requires a Bishop and a graveyard piece.";
      return;
    }
    state.pending.step = "grave";
    state.notice = "Choose a graveyard piece to resurrect.";
    return;
  }
  if (abilityId === "monument") {
    const required = 4 - currentLevel(state, abilityId);
    const pawns = Object.entries(state.board)
      .filter(([, piece]) =>
        piece.controller === state.activeSeat &&
        piece.type === "pawn" &&
        !piece.status.hardened
      )
      .map(([cell]) => cell);
    if (pawns.length < required) {
      refundCost(state);
      state.selectedAbility = undefined;
      state.pending = undefined;
      state.notice = `Monument requires ${required} pawns.`;
      return;
    }
    state.pending = {
      ...state.pending,
      step: "monument-sacrifice",
      selected: [],
    };
    state.legalCells = pawns;
    state.notice = `Choose ${required} pawns to sacrifice.`;
    return;
  }
  if (abilityId === "hex") {
    const currentlyHexed = Object.values(state.board).some((piece) =>
      piece.status.hexedBy === state.activeSeat
    );
    if (!currentlyHexed) {
      state.pending = { ...state.pending, step: "hex-target", selected: [] };
      state.legalCells = Object.entries(state.board)
        .filter(([, piece]) =>
          hostilePiece(state, piece) && piece.type !== "king"
        )
        .map(([cell]) => cell);
      state.notice = "Choose a piece to Hex, or pass after the first.";
      return;
    }
  }
  if (abilityId === "march-home") {
    const king = Object.entries(state.board).find(([, piece]) =>
      piece.controller === state.activeSeat && piece.type === "king"
    );
    if (!king) return;
    state.pending.source = king[0];
    const companions = threePlayerAdjacentCells(state, king[0])
      .filter((cell) => alliedPiece(state, state.board[cell]));
    if (currentLevel(state, abilityId) === 1 || !companions.length) {
      state.pending.step = "confirm-march-home";
      state.notice = "Confirm March Home.";
    } else {
      state.pending.step = "march-companions";
      state.pending.selected = [];
      state.legalCells = companions;
      state.notice = "Choose companions, or pass.";
    }
    return;
  }
  state.notice = `Choose a piece for ${ability.name}.`;
};

const selectGod = (state: ThreePlayerState, godId: GodId) => {
  if (
    ["snipe-shot", "harden-choice"].includes(
      state.pending?.abilityId ?? "",
    )
  ) return;
  if (
    !activePlayer(state).gods.includes(godId) ||
    state.rested.includes(godId)
  ) return;
  if (state.selectedAbility) refundCost(state);
  state.selectedGod = godId;
  state.selectedAbility = undefined;
  state.selectedCell = undefined;
  state.selectedPath = undefined;
  state.pending = undefined;
  state.legalCells = [];
  state.legalSeats = [];
  state.legalPaths = [];
  for (const piece of Object.values(state.board)) {
    const prepared = preparedDetails(piece);
    if (
      godId === "artemis" &&
      prepared?.owner === state.activeSeat &&
      prepared.level === 2
    ) delete piece.status.prepared;
    if (godId === "anubis" && piece.status.hardened === "god") {
      delete piece.status.hardened;
    }
    if (godId === "medusa") {
      if (piece.status.frozen === "god") delete piece.status.frozen;
      delete piece.status.gazing;
    }
    if (godId === "salem") {
      if (piece.status.poisoned === "god") delete piece.status.poisoned;
      if (piece.status.polymorphed === "god") {
        delete piece.status.polymorphed;
      }
    }
    if (godId === "chiron" && piece.status.chargeUntil === "god") {
      delete piece.status.chargeUntil;
    }
    if (
      godId === "kangus" &&
      piece.status.ritual?.expires === "kangus"
    ) delete piece.status.ritual;
  }
  if (godId === "kangus") {
    state.bananas = state.bananas!.filter((banana) =>
      !(banana.owner === state.activeSeat && banana.expires === "kangus")
    );
  }
  state.godTurns![state.activeSeat][godId] =
    (state.godTurns![state.activeSeat][godId] ?? 0) + 1;
  emitPresentation(state, {
    kind: "god",
    seat: state.activeSeat,
    godId,
  });
  state.notice = `${GOD_BY_ID[godId].name} answers. Choose an ability.`;
};

const hostileControllersAdjacentTo = (
  state: ThreePlayerState,
  cell: string,
) => [...new Set(
  threePlayerAdjacentCells(state, cell)
    .map((adjacent) => state.board[adjacent]?.controller)
    .filter((seat): seat is ThreePlayerSeat =>
      Boolean(seat && seat !== state.activeSeat)
    ),
)];

const resolveMoveEffect = (
  state: ThreePlayerState,
  abilityId: string,
  from: string,
  to: string,
  moving: ThreePlayerPiece,
  captured?: ThreePlayerPiece,
  boardBefore?: ThreePlayerState["board"],
) => {
  const level = currentLevel(state, abilityId);
  if (abilityId === "flight") {
    const crossed = threePlayerCrossedCells(
      state,
      from,
      to,
      state.selectedPath,
    )
      .map((cell) => boardBefore?.[cell])
      .filter((piece): piece is ThreePlayerPiece => Boolean(piece));
    for (const affinity of ["light", "dark"] as const) {
      const matching = crossed.filter((piece) =>
        threePlayerPieceAffinity(state, piece) === affinity
      );
      let reward = matching.length ? 1 : 0;
      if (level >= 2) {
        reward += matching.filter((piece) =>
          piece.controller !== state.activeSeat
        ).length;
      }
      if (
        level >= 3 &&
        threePlayerAdvanceClass(state, moving.owner, from, to) !== "sideways"
      ) {
        reward += matching.filter((piece) =>
          piece.controller === state.activeSeat
        ).length;
      }
      addAffinityOrb(state, state.activeSeat, affinity, reward, to);
    }
  } else if (abilityId === "gallop") {
    if (moving.type === "knight") {
      addOrbs(state, state.activeSeat, level, 0, to);
    }
    if (captured) addOrbs(state, state.activeSeat, 0, level + 1, to);
  } else if (abilityId === "mount") {
    const riders = threePlayerOrthogonalCells(state, from)
      .filter((cell) => alliedPiece(state, boardBefore?.[cell]));
    const destinations = threePlayerOrthogonalCells(state, to)
      .filter((cell) => !state.board[cell]);
    if (riders.length && destinations.length) {
      state.pending = {
        godId: state.selectedGod!,
        abilityId,
        step: "mount-rider",
        source: from,
        destination: to,
        selected: [],
      };
      state.legalCells = riders;
      state.notice = `Mount: choose up to ${level} riders, or pass.`;
      return "pending";
    }
  } else if (abilityId === "charge") {
    if (level >= 2) {
      for (const piece of Object.values(state.board)) {
        if (
          piece.controller === state.activeSeat &&
          piece.type === "knight"
        ) piece.status.chargeUntil = level >= 3 ? "god" : 2;
      }
    }
  } else if (abilityId === "construction") {
    if (threePlayerDistance(state, from, to) === 1) {
      addOrbs(state, state.activeSeat, 0, 1, to);
    }
    if (level >= 2 && moving.type === "pawn") {
      addOrbs(state, state.activeSeat, 0, 1, to);
    }
    if (level >= 3 && moving.type === "rook") {
      addOrbs(state, state.activeSeat, 0, 1, to);
    }
  } else if (abilityId === "harden") {
    state.board[to].status.hardened = 2;
  } else if (abilityId === "resonance") {
    const adjacent = threePlayerAdjacentCells(state, to)
      .map((cell) => ({ cell, piece: state.board[cell] }))
      .filter((entry): entry is { cell: string; piece: ThreePlayerPiece } =>
        Boolean(entry.piece)
      );
    const orthogonal = adjacent.filter(({ cell }) =>
      threePlayerOrthogonalCells(state, to).includes(cell)
    );
    for (const affinity of ["light", "dark"] as const) {
      const orthogonalCount = orthogonal.filter(({ piece }) =>
        threePlayerPieceAffinity(state, piece) === affinity
      ).length;
      const reward = level === 1
        ? Math.floor(orthogonalCount / 2)
        : adjacent.filter(({ piece }) =>
          threePlayerPieceAffinity(state, piece) === affinity
        ).length + (level >= 3 ? Math.floor(orthogonalCount / 2) : 0);
      addAffinityOrb(state, state.activeSeat, affinity, reward, to);
    }
  } else if (abilityId === "enchant") {
    state.bonusTurn = state.activeSeat;
  } else if (abilityId === "take-cover") {
    const fronts = threePlayerFrontCells(state, moving.owner, to);
    const cover = fronts.filter((cell) =>
      alliedPiece(state, state.board[cell]) &&
      (
        level >= 2 ||
        threePlayerOrthogonalCells(state, to).includes(cell)
      )
    ).length;
    if (cover) {
      addOrbs(state, state.activeSeat, level >= 3 ? cover : 1, 0, to);
    }
    if (captured) addOrbs(state, state.activeSeat, 0, 2, to);
  } else if (abilityId === "snipe") {
    state.board[to].status.prepared = {
      owner: state.activeSeat,
      level: level as 1 | 2 | 3,
    };
  } else if (abilityId === "ritual-sacrifice") {
    state.board[to].status.ritual = {
      owner: state.activeSeat,
      expires: level >= 2
        ? "kangus"
        : state.hostileTurns![state.activeSeat] + 1,
    };
  } else if (abilityId === "banana-peel") {
    state.pending = {
      godId: state.selectedGod!,
      abilityId,
      step: "banana",
      movedPieceId: moving.id,
    };
    state.legalCells = threePlayerOrthogonalCells(state, to)
      .filter((cell) =>
        !state.board[cell] &&
        !state.bananas!.some((banana) => banana.cell === cell)
      );
    if (state.legalCells.length) {
      state.notice = "Place the banana on an adjacent empty cell.";
      return "pending";
    }
  } else if (abilityId === "marked") {
    state.board[to].status.markedForDeath = {
      owner: state.activeSeat,
      round: state.round + 1,
    };
    if (level >= 3) {
      state.pending = {
        godId: state.selectedGod!,
        abilityId,
        step: "marked-choice",
        movedPieceId: state.board[to].id,
      };
      state.notice = "Execute the marked piece now, or pass.";
      return "pending";
    }
  } else if (abilityId === "siphon") {
    const seats = hostileControllersAdjacentTo(state, to)
      .filter((seat) => state.players[seat].orbs.light > 0);
    if (seats.length) {
      state.pending = {
        godId: state.selectedGod!,
        abilityId,
        step: "siphon-seat",
        destination: to,
      };
      state.legalSeats = seats;
      state.notice = "Choose a hostile player to siphon.";
      return "pending";
    }
  } else if (abilityId === "royal-step") {
    if (moving.type === "king" || (level >= 2 && moving.type === "pawn")) {
      addOrbs(state, state.activeSeat, 0, 1, to);
    }
    const classification = threePlayerAdvanceClass(
      state,
      moving.owner,
      from,
      to,
    );
    if (
      classification === "backward" ||
      (level >= 3 && classification === "sideways")
    ) addOrbs(state, state.activeSeat, 1, 0, to);
  } else if (abilityId === "captivate") {
    const before = boardBefore ?? state.board;
    const beforeQueens = Object.entries(before).filter(([cell, piece]) =>
      piece.type === "queen" &&
      threePlayerLineOfSight({ ...state, board: before }, from, cell)
    );
    const afterQueens = Object.entries(state.board).filter(([cell, piece]) =>
      piece.type === "queen" &&
      threePlayerLineOfSight(state, to, cell)
    );
    for (const [cell, queen] of afterQueens) {
      const entered = !beforeQueens.some(([, old]) => old.id === queen.id);
      addAffinityOrb(
        state,
        state.activeSeat,
        threePlayerPieceAffinity(state, queen),
        entered && level >= 2 ? level : 1,
        cell,
      );
    }
  } else if (abilityId === "hex") {
    const hexed = Object.entries(state.board)
      .filter(([, piece]) => piece.status.hexedBy === state.activeSeat)
      .slice(0, level);
    const aligned = hexed.filter(([cell]) =>
      threePlayerSharesTrace(state, cell, to, "rook")
    ).length;
    if (aligned) {
      addAffinityOrb(
        state,
        state.activeSeat,
        threePlayerCellAffinity(state, to),
        aligned + 1,
        to,
      );
    }
  } else if (abilityId === "barter") {
    const seats = hostileControllersAdjacentTo(state, to);
    if (
      seats.length &&
      (activePlayer(state).orbs.light > 0 ||
        activePlayer(state).orbs.dark > 0)
    ) {
      state.pending = {
        godId: state.selectedGod!,
        abilityId,
        step: "barter-seat",
        destination: to,
      };
      state.legalSeats = seats;
      state.notice = "Choose a hostile player for Barter.";
      return "pending";
    }
  } else if (abilityId === "leverage") {
    state.pending = {
      godId: state.selectedGod!,
      abilityId,
      step: "hire",
      movedPieceId: moving.id,
    };
    state.legalCells = threePlayerAdjacentCells(state, to).filter((cell) => {
      const target = state.board[cell];
      const extra = target?.type === "rook"
        ? 1
        : target?.type === "queen" ? 2 : 0;
      return hostilePiece(state, target) &&
        target.type !== "king" &&
        allowedEnchantTypes(level).includes(target.type) &&
        activePlayer(state).orbs.dark >= extra;
    });
    if (state.legalCells.length) {
      state.notice = "Choose an adjacent hostile piece to hire.";
      return "pending";
    }
  } else if (abilityId === "threaten") {
    const attacked = threePlayerPseudoTargets(state, to, {
      attacksOnly: true,
    }).filter((cell) =>
      hostilePiece(state, state.board[cell]) &&
      Boolean(state.board[cell])
    ).length;
    if (attacked) {
      addOrbs(state, state.activeSeat, 0, level >= 3 ? attacked : 1, to);
    }
    const values = Object.entries(state.board)
      .filter(([, piece]) => piece.controller === state.activeSeat)
      .map(([cell, piece]) =>
        threePlayerAdvancement(state, piece.owner, cell)
      );
    const lead = Math.max(...values);
    const tied = values.filter((value) => value === lead).length;
    if (
      threePlayerAdvancement(state, state.board[to].owner, to) === lead &&
      (level >= 2 || tied === 1)
    ) {
      addOrbs(
        state,
        state.activeSeat,
        level >= 2 && tied === 1 ? 2 : 1,
        0,
        to,
      );
    }
  } else if (abilityId === "cull-the-weak") {
    const attacked = threePlayerPseudoTargets(state, to, {
      attacksOnly: true,
    }).filter((cell) => hostilePiece(state, state.board[cell]));
    if (attacked.length >= 2) {
      const lowest = Math.min(
        ...attacked.map((cell) =>
          threePlayerPieceValue(state.board[cell].type)
        ),
      );
      const choices = attacked.filter((cell) => {
        const type = state.board[cell].type;
        return threePlayerPieceValue(type) === lowest ||
          (level >= 2 && ["knight", "bishop"].includes(type)) ||
          (level >= 3 && type === "rook");
      });
      if (level === 1 || choices.length === 1) captureAt(state, choices[0]);
      else {
        state.pending = {
          godId: state.selectedGod!,
          abilityId,
          step: "cull-choice",
          movedPieceId: state.board[to].id,
        };
        state.legalCells = choices;
        state.notice = "Choose the Cull target.";
        return "pending";
      }
    }
  }
  return undefined;
};

const executeEscort = (
  state: ThreePlayerState,
  from: string,
  to: string,
) => {
  const selected = new Set(state.pending?.selected ?? []);
  const companions = threePlayerAdjacentCells(state, from)
    .map((cell) => ({ cell, piece: state.board[cell] }))
    .filter((entry): entry is { cell: string; piece: ThreePlayerPiece } =>
      Boolean(entry.piece && selected.has(entry.piece.id))
    );
  if (!companions.length) return;
  const landings = [
    { from, to, piece: state.board[from] },
    ...companions.flatMap(({ cell, piece }) => {
      const destination = threePlayerFormationDestination(
        state,
        from,
        to,
        cell,
      );
      return destination ? [{ from: cell, to: destination, piece }] : [];
    }),
  ];
  if (landings.length !== companions.length + 1) return;
  const simulated = clone(state);
  for (const landing of landings) delete simulated.board[landing.from];
  for (const landing of landings) {
    const occupying = simulated.board[landing.to];
    if (
      occupying?.status.hardened ||
      occupying?.controller === state.activeSeat
    ) return;
    delete simulated.board[landing.to];
    simulated.board[landing.to] = landing.piece;
  }
  if (threePlayerIsInCheck(simulated, state.activeSeat)) return;
  for (const landing of landings) delete state.board[landing.from];
  for (const landing of landings) {
    if (state.board[landing.to]) captureAt(state, landing.to);
    state.board[landing.to] = {
      ...landing.piece,
      hasMoved: true,
      status: { ...landing.piece.status, movedThisTurn: true },
    };
  }
  mutatePosition(state);
  finishDivineTurn(
    state,
    abilityDescription(state, `: escorted to ${to}`),
  );
};

const executeMarchHome = (
  state: ThreePlayerState,
  kingCell: string,
  companions: string[],
) => {
  const king = state.board[kingCell];
  const destination = king
    ? threePlayerHomeCell(state, king.owner)
    : undefined;
  if (!king || !destination) return;
  const landings = [
    { from: kingCell, to: destination, piece: king },
    ...companions.flatMap((cell) => {
      const piece = state.board[cell];
      const target = piece
        ? threePlayerFormationDestination(
          state,
          kingCell,
          destination,
          cell,
        )
        : undefined;
      return piece && target ? [{ from: cell, to: target, piece }] : [];
    }),
  ];
  if (landings.length !== companions.length + 1) return;
  const moving = new Set(landings.map((landing) => landing.from));
  const simulated = clone(state);
  for (const landing of landings) delete simulated.board[landing.from];
  for (const landing of landings) {
    const occupying = simulated.board[landing.to];
    if (
      occupying?.status.hardened
    ) return;
    delete simulated.board[landing.to];
    simulated.board[landing.to] = landing.piece;
  }
  if (threePlayerIsInCheck(simulated, state.activeSeat)) return;
  for (const landing of landings) {
    if (state.board[landing.to] && !moving.has(landing.to)) {
      captureAt(state, landing.to, true);
    }
  }
  for (const landing of landings) delete state.board[landing.from];
  for (const landing of landings) {
    state.board[landing.to] = {
      ...landing.piece,
      hasMoved: true,
      status: { ...landing.piece.status, movedThisTurn: true },
    };
  }
  mutatePosition(state);
  finishDivineTurn(
    state,
    abilityDescription(state, `: returned to ${destination}`),
  );
};

const executeMovement = (
  state: ThreePlayerState,
  from: string,
  to: string,
) => {
  const abilityId = state.selectedAbility!;
  const moving = state.board[from];
  if (!moving) return;
  if (abilityId === "escort") {
    executeEscort(state, from, to);
    return;
  }
  if (abilityId === "stealth") {
    delete state.board[from];
    state.stealth![state.activeSeat].push({
      piece: moving,
      destination: to,
      returnOnTurn: state.seatTurns![state.activeSeat] + 1,
    });
    mutatePosition(state);
    finishDivineTurn(
      state,
      abilityDescription(state, `: entered stealth toward ${to}`),
    );
    return;
  }
  if (
    abilityId === "military-funding" &&
    currentLevel(state, abilityId) >= 2 &&
    (state.pending?.selected?.filter((id) => id !== "__no-repeat").length ??
      0) >= 1
  ) {
    if (activePlayer(state).orbs.light < 1) return;
    addOrbs(state, state.activeSeat, -1, 0);
  }
  const originalController = moving.controller;
  if (abilityId === "enchant") moving.controller = state.activeSeat;
  const boardBefore = clone(state.board);
  const result = moveDirect(
    state,
    from,
    to,
    ["air-lift", "pick-a-fight"].includes(abilityId),
    state.selectedPath,
  );
  if (!result) return;
  if (abilityId === "enchant") {
    state.board[result.to].controller = originalController;
  }
  if (moving.status.hardened && !result.captured) {
    delete state.board[result.to].status.hardened;
  }
  delete state.board[result.to].status.luredBy;
  if (abilityId === "slither") {
    const unlimited = currentLevel(state, abilityId) >= 3;
    const remaining = unlimited
      ? -1
      : (state.pending?.movesRemaining ??
        currentLevel(state, abilityId) + 1) - 1;
    if (unlimited || remaining > 0) {
      state.pending = {
        godId: state.selectedGod!,
        abilityId,
        step: "slither",
        source: result.to,
        movedPieceId: moving.id,
        movesRemaining: remaining,
      };
      state.selectedCell = result.to;
      state.legalCells = threePlayerLegalTargets(state, result.to, {
        forceType: "bishop",
        noCapture: true,
      });
      state.notice = unlimited
        ? "Slither may continue; pass to stop."
        : `Slither has ${remaining} moves remaining.`;
      return;
    }
  }
  if (abilityId === "military-funding") {
    const level = currentLevel(state, abilityId);
    const selected = [
      ...(state.pending?.selected ?? []),
      moving.id,
      ...(result.captured || state.board[result.to].type !== "pawn"
        ? ["__no-repeat"]
        : []),
    ];
    const count = selected.filter((id) => id !== "__no-repeat").length;
    if (level === 1 ? count < 2 : activePlayer(state).orbs.light > 0) {
      state.pending = {
        godId: state.selectedGod!,
        abilityId,
        step: "funding",
        selected,
      };
      state.selectedCell = undefined;
      state.legalCells = [];
      state.notice = level === 1
        ? "Move a second pawn."
        : "Move another pawn for 1 light orb, or pass.";
      return;
    }
  }
  if (
    resolveMoveEffect(
      state,
      abilityId,
      result.from,
      result.to,
      moving,
      result.captured,
      boardBefore,
    ) === "pending"
  ) return;
  finishDivineTurn(
    state,
    abilityDescription(
      state,
      `: ${pieceName(moving)} at ${from} -> ${result.to}`,
    ),
  );
};

const resolveRage = (
  state: ThreePlayerState,
  center: string,
  spareAllies: boolean,
) => {
  for (const cell of threePlayerAdjacentCells(state, center)) {
    const victim = state.board[cell];
    if (
      !victim ||
      (spareAllies && alliedPiece(state, victim))
    ) continue;
    captureAt(state, cell, true);
  }
};

const chooseTarget = (state: ThreePlayerState, cell: string) => {
  const abilityId = state.selectedAbility!;
  const level = currentLevel(state, abilityId);
  const piece = state.board[cell];
  if (abilityId === "lure" && piece) {
    piece.status.luredBy = state.activeSeat;
  } else if (abilityId === "poison-cloud") {
    if (level === 1 && piece) {
      piece.status.poisoned = "god";
      piece.status.poisonedBy = state.activeSeat;
    } else {
      const areas = threePlayerAreas(state, cell, level as 2 | 3);
      state.pending = {
        ...state.pending!,
        step: "poison-area",
        source: cell,
        selectedPathIds: areas.map((area) => area.id),
      };
      state.legalCells = [...new Set(areas.flatMap((area) =>
        area.cells.filter((candidate) => candidate !== cell)
      ))];
      state.notice = "Choose the other cell defining the poison area.";
      return;
    }
  } else if (abilityId === "polymorph" && piece) {
    piece.status.polymorphed = level >= 3 ? "god" : level + 1;
  } else if (abilityId === "rage") {
    state.pending = {
      ...state.pending!,
      step: "rage-choice",
      destination: cell,
    };
    state.legalCells = [];
    state.notice = level >= 2
      ? "Choose whether allied pieces are spared."
      : "Confirm Rage.";
    return;
  }
  finishDivineTurn(state, abilityDescription(state, ` on ${cell}`));
};

const chooseGravePiece = (
  state: ThreePlayerState,
  pieceId: string,
) => {
  const entry = activePlayer(state).graveyard.find(
    (candidate) => candidate.piece.id === pieceId,
  );
  if (!entry) return;
  const level = currentLevel(state, "resurrect");
  const cells = Object.entries(state.board)
    .filter(([, piece]) =>
      piece.controller === state.activeSeat && piece.type === "bishop"
    )
    .flatMap(([cell]) => threePlayerAdjacentCells(state, cell))
    .filter((cell) => {
      const occupying = state.board[cell];
      return !occupying ||
        (
          level >= 3 &&
          hostilePiece(state, occupying) &&
              !occupying.status.hardened
        );
    });
  if (!cells.length) return;
  state.pending = {
    ...state.pending!,
    step: "revive-place",
    movedPieceId: pieceId,
  };
  state.legalCells = [...new Set(cells)];
  state.notice = "Choose a resurrection cell adjacent to a Bishop.";
};

const completeSpecialTarget = (
  state: ThreePlayerState,
  cell: string,
) => {
  const pending = state.pending!;
  if (pending.step === "banana") {
    const level = currentLevel(state, "banana-peel");
    state.bananas!.push({
      cell,
      owner: state.activeSeat,
      expires: level === 1
        ? state.hostileTurns![state.activeSeat] + 1
        : level === 2 ? "kangus" : "god",
    });
    finishDivineTurn(state, abilityDescription(state, ` on ${cell}`));
  } else if (pending.step === "hire") {
    const target = state.board[cell];
    if (!target?.controller || target.type === "king") return;
    const extra = target.type === "rook" ? 1 : target.type === "queen" ? 2 : 0;
    if (activePlayer(state).orbs.dark < extra) return;
    addOrbs(state, state.activeSeat, 0, -extra);
    addOrbs(state, target.controller, 0, 4 + extra, cell);
    target.controller = state.activeSeat;
    target.status.hired = true;
    finishDivineTurn(state, abilityDescription(state, ` on ${cell}`));
  } else if (pending.step === "revive-place" && pending.movedPieceId) {
    const graveyard = activePlayer(state).graveyard;
    const index = graveyard.findIndex(({ piece }) =>
      piece.id === pending.movedPieceId
    );
    if (index < 0) return;
    const revived = graveyard[index].piece;
    if (state.board[cell]) captureAt(state, cell);
    revived.controller = state.activeSeat;
    revived.status = {};
    revived.hasMoved = true;
    state.board[cell] = revived;
    graveyard.splice(index, 1);
    mutatePosition(state);
    const revivedIds = [...(pending.selected ?? []), revived.id];
    if (
      currentLevel(state, "resurrect") >= 2 &&
      revivedIds.length < 2 &&
      graveyard.length &&
      activePlayer(state).orbs.light >= 2
    ) {
      state.pending = {
        ...pending,
        step: "resurrect-more",
        selected: revivedIds,
      };
      state.legalCells = [];
      state.notice = "Spend 2 more light orbs to resurrect another piece?";
      return;
    }
    finishDivineTurn(state, abilityDescription(state, ` on ${cell}`));
  } else if (pending.step === "monument-sacrifice") {
    const selected = [...(pending.selected ?? []), cell];
    const required = 4 - currentLevel(state, "monument");
    if (selected.length < required) {
      state.pending = { ...pending, selected };
      state.legalCells = state.legalCells!.filter(
        (candidate) => candidate !== cell,
      );
      return;
    }
    state.pending = { ...pending, step: "monument-base", selected };
    state.legalCells = selected;
    state.notice = "Choose which sacrificed cell receives the Monument.";
  } else if (pending.step === "monument-base") {
    const selected = pending.selected ?? [];
    if (!state.board[cell]) return;
    for (const sacrifice of selected) {
      const victim = state.board[sacrifice];
      if (victim) {
        delete state.board[sacrifice];
        sendToGraveyard(state, victim);
      }
    }
    state.board[cell] = {
      id: `${state.activeSeat}-monument-${state.turn}-${state.revision}`,
      type: "rook",
      owner: state.activeSeat,
      controller: state.activeSeat,
      hasMoved: true,
      status: {},
    };
    mutatePosition(state);
    finishDivineTurn(state, abilityDescription(state, ` on ${cell}`));
  }
};

const airStrikePassengers = (
  state: ThreePlayerState,
  carrier: string,
) => {
  const level = currentLevel(state, "air-strike");
  return threePlayerAdjacentCells(state, carrier).filter((cell) => {
    const piece = state.board[cell];
    return alliedPiece(state, piece) &&
      (level >= 3
        ? ["pawn", "knight", "bishop"].includes(piece.type)
        : piece.type === "pawn") &&
      !piece.status.hardened &&
      !piece.status.frozen &&
      !piece.status.gazing;
  });
};

const airStrikeDrops = (
  state: ThreePlayerState,
  carrier: string,
  destination: string,
  passenger: string,
  pathId?: string,
) => {
  const crossed = threePlayerCrossedCells(
    state,
    carrier,
    destination,
    pathId,
  );
  const banana = bananaOnPath(state, carrier, destination, pathId);
  const bananaIndex = banana ? crossed.indexOf(banana) : -1;
  const reachable = bananaIndex >= 0
    ? crossed.slice(0, bananaIndex)
    : crossed;
  const firstEnemy = currentLevel(state, "air-strike") >= 2
    ? reachable.find((cell) => hostilePiece(state, state.board[cell]))
    : undefined;
  return reachable.filter((cell) => {
    const occupying = state.board[cell];
    return !occupying || (
      cell === firstEnemy &&
      hostilePiece(state, occupying) &&
      !occupying.status.hardened
    );
  }).filter((cell) => cell !== passenger);
};

const airStrikeDestinations = (
  state: ThreePlayerState,
  carrier: string,
  passenger: string,
) => {
  const simulated = clone(state);
  delete simulated.board[passenger];
  return threePlayerLegalTargets(simulated, carrier, {
    ignoreBlockers: true,
    noCapture: true,
  }).filter((cell) =>
    !simulated.board[cell] &&
    threePlayerTravelPaths(state, carrier, cell).some((path) =>
      airStrikeDrops(
        state,
        carrier,
        cell,
        passenger,
        path.traceId,
      ).length > 0
    )
  );
};

const handleCell = (state: ThreePlayerState, cell: string) => {
  if (state.pending?.abilityId === "harden-choice") {
    if (
      state.pending.step === "harden-choice" &&
      state.legalCells!.includes(cell)
    ) {
      state.pending = {
        ...state.pending,
        step: "harden-decision",
        source: cell,
      };
      state.legalCells = [];
    }
    return;
  }
  if (state.pending?.abilityId === "snipe-shot") {
    if (
      state.pending.step === "snipe-source" &&
      state.legalCells!.includes(cell)
    ) {
      state.selectedCell = cell;
      state.pending.step = "snipe-target";
      state.legalCells = preparedShotTargets(state, cell);
    } else if (
      state.pending.step === "snipe-target" &&
      state.selectedCell &&
      state.legalCells!.includes(cell)
    ) {
      captureAt(state, cell);
      delete state.board[state.selectedCell]?.status.prepared;
      state.pending = undefined;
      state.selectedCell = undefined;
      state.legalCells = [];
      if (!queuePreparedShot(state)) {
        state.notice = `${name(state, state.activeSeat)} to act. Choose a God.`;
      }
    }
    return;
  }
  if (state.pending?.abilityId === "air-strike") {
    const pending = state.pending;
    if (pending.step === "source" && sourceIsAllowed(state, cell)) {
      state.pending = { ...pending, step: "air-strike-passenger", source: cell };
      state.selectedCell = cell;
      state.legalCells = airStrikePassengers(state, cell);
    } else if (
      pending.step === "air-strike-passenger" &&
      pending.source &&
      state.legalCells!.includes(cell)
    ) {
      state.pending = {
        ...pending,
        step: "air-strike-destination",
        selected: [cell],
      };
      state.legalCells = airStrikeDestinations(state, pending.source, cell);
    } else if (
      pending.step === "air-strike-destination" &&
      pending.source &&
      pending.selected?.[0] &&
      state.legalCells!.includes(cell)
    ) {
      const paths = threePlayerTravelPaths(state, pending.source, cell)
        .filter((path) =>
          airStrikeDrops(
            state,
            pending.source!,
            cell,
            pending.selected![0],
            path.traceId,
          ).length > 0
        );
      if (!paths.length) return;
      if (paths.length > 1) {
        state.pending = {
          ...pending,
          step: "air-strike-path",
          destination: cell,
        };
        state.legalPaths = paths.map((path) => path.traceId);
      } else {
        state.selectedPath = paths[0]?.traceId;
        state.pending = {
          ...pending,
          step: "air-strike-drop",
          destination: cell,
        };
        state.legalCells = airStrikeDrops(
          state,
          pending.source,
          cell,
          pending.selected[0],
          state.selectedPath,
        );
      }
    } else if (
      pending.step === "air-strike-drop" &&
      pending.source &&
      pending.destination &&
      pending.selected?.[0] &&
      state.legalCells!.includes(cell)
    ) {
      const passengerCell = pending.selected[0];
      const passenger = state.board[passengerCell];
      if (!passenger) return;
      const allowedDrops = airStrikeDrops(
        state,
        pending.source,
        pending.destination,
        passengerCell,
        state.selectedPath,
      );
      if (!allowedDrops.includes(cell)) return;
      delete state.board[passengerCell];
      const result = moveDirect(
        state,
        pending.source,
        pending.destination,
        false,
        state.selectedPath,
      );
      if (!result) {
        state.board[passengerCell] = passenger;
        return;
      }
      if (state.board[cell]) captureAt(state, cell);
      state.board[cell] = {
        ...passenger,
        hasMoved: true,
        status: { ...passenger.status, movedThisTurn: true },
      };
      finishDivineTurn(
        state,
        abilityDescription(state, `: dropped ${pieceName(passenger)} on ${cell}`),
      );
    }
    return;
  }
  if (
    state.pending?.step === "march-companions" &&
    state.pending.source
  ) {
    if (!state.legalCells!.includes(cell)) return;
    state.pending.selected = [...(state.pending.selected ?? []), cell];
    state.legalCells = state.legalCells!.filter(
      (candidate) => candidate !== cell,
    );
    return;
  }
  if (state.pending?.step === "rage-source") {
    if (!state.legalCells!.includes(cell)) return;
    state.selectedCell = cell;
    state.pending = { ...state.pending, step: "rage-destination", source: cell };
    state.legalCells = [
      cell,
      ...threePlayerLegalTargets(state, cell).filter((target) =>
        threePlayerDistance(state, cell, target) === 1
      ),
    ];
    return;
  }
  if (
    state.pending?.step === "rage-destination" &&
    state.pending.source &&
    state.legalCells!.includes(cell)
  ) {
    let center = state.pending.source;
    if (cell !== center) center = moveDirect(state, center, cell)?.to ?? center;
    state.pending = { ...state.pending, step: "rage-choice", destination: center };
    state.selectedCell = undefined;
    state.legalCells = [];
    return;
  }
  if (
    state.pending?.step === "poison-area" &&
    state.pending.source &&
    state.legalCells!.includes(cell)
  ) {
    const level = currentLevel(state, "poison-cloud") as 2 | 3;
    const area = threePlayerAreas(state, state.pending.source, level)
      .find((candidate) => candidate.cells.includes(cell));
    if (!area) return;
    for (const target of area.cells) {
      const victim = state.board[target];
      if (victim && hostilePiece(state, victim)) {
        victim.status.poisoned = "god";
        victim.status.poisonedBy = state.activeSeat;
      }
    }
    finishDivineTurn(state, abilityDescription(state, " across an area"));
    return;
  }
  if (
    state.pending?.step === "mount-rider" &&
    state.pending.destination
  ) {
    if (!state.legalCells!.includes(cell) || !state.board[cell]) return;
    const destination = state.pending.destination;
    state.pending = {
      ...state.pending,
      step: "mount-place",
      movedPieceId: state.board[cell].id,
    };
    state.legalCells = threePlayerOrthogonalCells(
      state,
      destination,
    ).filter((target) => !state.board[target]);
    return;
  }
  if (
    state.pending?.step === "mount-place" &&
    state.pending.movedPieceId &&
    state.legalCells!.includes(cell)
  ) {
    const riderCell = findCellById(state, state.pending.movedPieceId);
    if (!riderCell) return;
    const rider = state.board[riderCell];
    delete state.board[riderCell];
    state.board[cell] = { ...rider, hasMoved: true };
    const selected = [...(state.pending.selected ?? []), rider.id];
    if (selected.length >= currentLevel(state, "mount")) {
      finishDivineTurn(
        state,
        abilityDescription(state, `: moved with ${selected.length} riders`),
      );
    } else {
      const remaining = threePlayerOrthogonalCells(
        state,
        state.pending.source!,
      ).filter((candidate) => {
        const piece = state.board[candidate];
        return alliedPiece(state, piece) && !selected.includes(piece.id);
      });
      if (!remaining.length) {
        finishDivineTurn(
          state,
          abilityDescription(state, `: moved with ${selected.length} riders`),
        );
      } else {
        state.pending = {
          ...state.pending,
          step: "mount-rider",
          selected,
          movedPieceId: undefined,
        };
        state.legalCells = remaining;
      }
    }
    return;
  }
  if (
    state.pending?.step === "escort-companions" &&
    state.pending.source
  ) {
    if (!state.legalCells!.includes(cell) || !state.board[cell]) return;
    const selected = [
      ...(state.pending.selected ?? []),
      state.board[cell].id,
    ];
    state.pending.selected = selected;
    if (currentLevel(state, "escort") === 1) {
      state.pending.step = "escort-move";
      state.selectedCell = state.pending.source;
      state.legalCells = sourceTargets(state, state.pending.source);
    } else {
      state.legalCells = state.legalCells!.filter(
        (candidate) => candidate !== cell,
      );
    }
    return;
  }
  if (!state.selectedAbility || !state.pending) return;
  if (state.pending.step === "hex-target") {
    if (!state.legalCells!.includes(cell) || !state.board[cell]) return;
    state.board[cell].status.hexedBy = state.activeSeat;
    const selected = [
      ...(state.pending.selected ?? []),
      state.board[cell].id,
    ];
    state.pending.selected = selected;
    if (selected.length >= currentLevel(state, "hex")) {
      state.pending.step = "source";
      state.legalCells = [];
    } else {
      state.legalCells = state.legalCells!.filter(
        (candidate) => candidate !== cell,
      );
    }
    return;
  }
  if (
    state.pending.step === "target" &&
    state.legalCells!.includes(cell)
  ) {
    chooseTarget(state, cell);
    return;
  }
  if (
    ["banana", "hire", "revive-place", "monument-base",
      "monument-sacrifice"].includes(state.pending.step) &&
    state.legalCells!.includes(cell)
  ) {
    completeSpecialTarget(state, cell);
    return;
  }
  if (state.pending.step === "cull-choice") {
    if (!state.legalCells!.includes(cell)) return;
    const attacker = findCellById(state, state.pending.movedPieceId!);
    if (!attacker) return;
    const victim = state.board[cell];
    const attacked = threePlayerPseudoTargets(state, attacker, {
      attacksOnly: true,
    }).filter((target) => hostilePiece(state, state.board[target]));
    const lowest = Math.min(...attacked.map((target) =>
      threePlayerPieceValue(state.board[target].type)
    ));
    if (threePlayerPieceValue(victim.type) === lowest) captureAt(state, cell);
    else moveDirect(state, attacker, cell);
    finishDivineTurn(state, abilityDescription(state, ` on ${cell}`));
    return;
  }
  if (state.selectedCell) {
    if (state.legalCells!.includes(cell)) {
      const pathSensitive = ["flight"].includes(state.selectedAbility);
      const paths = pathSensitive
        ? threePlayerTravelPaths(state, state.selectedCell, cell)
        : [];
      if (paths.length > 1) {
        state.pending = {
          ...state.pending,
          step: "path-choice",
          destination: cell,
        };
        state.legalPaths = paths.map((path) => path.traceId);
        state.legalCells = [];
      } else {
        state.selectedPath = paths[0]?.traceId;
        executeMovement(state, state.selectedCell, cell);
      }
    } else if (
      !["slither", "escort-move"].includes(state.pending.step) &&
      sourceIsAllowed(state, cell)
    ) {
      const targets = sourceTargets(state, cell);
      if (targets.length) {
        state.selectedCell = cell;
        state.pending.source = cell;
        state.legalCells = targets;
      }
    }
    return;
  }
  if (!sourceIsAllowed(state, cell)) return;
  if (state.selectedAbility === "escort") {
    const companions = threePlayerAdjacentCells(state, cell)
      .filter((target) => alliedPiece(state, state.board[target]));
    if (!companions.length) return;
    state.pending = {
      ...state.pending,
      step: "escort-companions",
      source: cell,
      selected: [],
    };
    state.legalCells = companions;
    return;
  }
  const targets = sourceTargets(state, cell);
  if (!targets.length) return;
  state.selectedCell = cell;
  state.pending.source = cell;
  state.legalCells = targets;
};

const handlePath = (state: ThreePlayerState, pathId: string) => {
  if (!state.legalPaths!.includes(pathId)) return;
  state.selectedPath = pathId;
  if (
    state.pending?.step === "air-strike-path" &&
    state.pending.source &&
    state.pending.destination &&
    state.pending.selected?.[0]
  ) {
    state.pending.step = "air-strike-drop";
    state.legalPaths = [];
    state.legalCells = airStrikeDrops(
      state,
      state.pending.source,
      state.pending.destination,
      state.pending.selected[0],
      pathId,
    );
  } else if (
    state.pending?.step === "path-choice" &&
    state.pending.destination &&
    state.selectedCell
  ) {
    const destination = state.pending.destination;
    state.legalPaths = [];
    executeMovement(state, state.selectedCell, destination);
  }
};

const clearSelection = (state: ThreePlayerState, refund = true) => {
  if (refund && state.selectedAbility) refundCost(state);
  state.selectedAbility = undefined;
  state.selectedCell = undefined;
  state.selectedPath = undefined;
  state.pending = undefined;
  state.legalCells = [];
  state.legalSeats = [];
  state.legalPaths = [];
};

const handlePass = (state: ThreePlayerState) => {
  if (state.pending?.abilityId === "snipe-shot") {
    for (const piece of Object.values(state.board)) {
      const prepared = preparedDetails(piece);
      if (prepared?.owner === state.activeSeat && prepared.level === 1) {
        delete piece.status.prepared;
      }
    }
    state.pending = undefined;
    state.legalCells = [];
    state.notice = `${name(state, state.activeSeat)} to act. Choose a God.`;
    return;
  }
  if (
    state.pending?.step === "march-companions" &&
    state.pending.source
  ) {
    executeMarchHome(
      state,
      state.pending.source,
      state.pending.selected ?? [],
    );
    return;
  }
  if (
    state.pending?.step === "escort-companions" &&
    state.pending.source &&
    state.pending.selected?.length
  ) {
    state.pending.step = "escort-move";
    state.selectedCell = state.pending.source;
    state.legalCells = sourceTargets(state, state.pending.source);
    return;
  }
  if (
    state.pending?.step === "hex-target" &&
    state.pending.selected?.length
  ) {
    state.pending.step = "source";
    state.legalCells = [];
    return;
  }
  if (state.pending?.step === "barter-orb") {
    finishDivineTurn(state, abilityDescription(state, " without trading"));
    return;
  }
  if (
    ["slither", "mount-rider", "funding"].includes(
      state.pending?.step ?? "",
    )
  ) {
    finishDivineTurn(state, abilityDescription(state));
    return;
  }
  if (state.selectedAbility === "construction") {
    addOrbs(state, state.activeSeat, 2, 0);
    finishDivineTurn(state, abilityDescription(state, " without moving"));
  } else if (state.selectedAbility === "marked") {
    if (currentLevel(state, "marked") >= 2) {
      addOrbs(state, state.activeSeat, 1, 0);
    }
    finishDivineTurn(state, abilityDescription(state, " without moving"));
  }
};

const handleChoice = (state: ThreePlayerState, value: boolean) => {
  if (
    state.pending?.abilityId === "harden-choice" &&
    state.pending.source
  ) {
    const piece = state.board[state.pending.source];
    if (piece) {
      if (value) piece.status.hardened = "god";
      else delete piece.status.hardened;
    }
    state.pending = undefined;
    state.legalCells = [];
    if (!queueHardenChoice(state) && !queuePreparedShot(state)) {
      state.notice = `${name(state, state.activeSeat)} to act. Choose a God.`;
    }
  } else if (
    state.pending?.step === "rage-choice" &&
    state.pending.destination
  ) {
    resolveRage(
      state,
      state.pending.destination,
      currentLevel(state, "rage") >= 2 && value,
    );
    finishDivineTurn(state, abilityDescription(state));
  } else if (state.pending?.step === "marked-choice") {
    if (value && state.pending.movedPieceId) {
      const cell = findCellById(state, state.pending.movedPieceId);
      if (cell) {
        const piece = state.board[cell];
        delete state.board[cell];
        sendToGraveyard(state, piece);
        addOrbs(state, state.activeSeat, 0, 5, cell);
      }
    }
    finishDivineTurn(state, abilityDescription(state));
  } else if (state.pending?.step === "resurrect-more") {
    if (value && activePlayer(state).orbs.light >= 2) {
      addOrbs(state, state.activeSeat, -2, 0);
      state.pending.step = "grave";
      state.pending.movedPieceId = undefined;
      state.legalCells = [];
    } else {
      finishDivineTurn(state, abilityDescription(state));
    }
  }
};

const handleSeat = (state: ThreePlayerState, seat: ThreePlayerSeat) => {
  if (!state.legalSeats!.includes(seat)) return;
  if (state.pending?.step === "siphon-seat") {
    state.pending.step = "siphon-amount";
    state.pending.targetSeat = seat;
  } else if (state.pending?.step === "barter-seat") {
    state.pending.step = "barter-orb";
    state.pending.targetSeat = seat;
    state.legalSeats = [];
  }
};

const handleAmount = (
  state: ThreePlayerState,
  amount: 0 | 1 | 2,
) => {
  if (
    state.pending?.step !== "siphon-amount" ||
    !state.pending.targetSeat
  ) return;
  const target = state.players[state.pending.targetSeat];
  const stolen = Math.min(amount, target.orbs.light);
  addOrbs(state, state.pending.targetSeat, -stolen, 0);
  addOrbs(
    state,
    state.activeSeat,
    stolen,
    0,
    state.pending.destination,
  );
  finishDivineTurn(state, abilityDescription(state));
};

const handleOrb = (
  state: ThreePlayerState,
  orb?: ThreePlayerOrbAffinity,
) => {
  if (
    state.pending?.step !== "barter-orb" ||
    !state.pending.targetSeat
  ) return;
  if (!orb) {
    finishDivineTurn(state, abilityDescription(state, " without trading"));
    return;
  }
  const opposite = orb === "light" ? "dark" : "light";
  const actor = activePlayer(state);
  const target = state.players[state.pending.targetSeat];
  const take = currentLevel(state, "barter") >= 3 ? 3 : 2;
  if (actor.orbs[orb] < 1 || target.orbs[opposite] < take) return;
  actor.orbs[orb] -= 1;
  target.orbs[orb] += 1;
  target.orbs[opposite] -= take;
  actor.orbs[opposite] += take;
  if (currentLevel(state, "barter") >= 2 && state.pending.destination) {
    addAffinityOrb(
      state,
      state.activeSeat,
      threePlayerCellAffinity(state, state.pending.destination),
      1,
      state.pending.destination,
    );
  }
  finishDivineTurn(state, abilityDescription(state));
};

const upgradeAbility = (state: ThreePlayerState, abilityId: string) => {
  const player = activePlayer(state);
  if (!player.gods.some((godId) =>
    GOD_BY_ID[godId].abilities.some((ability) => ability.id === abilityId)
  )) return;
  const current = player.upgrades[abilityId] ?? 1;
  if (current >= 3) return;
  player.upgrades[abilityId] = (current + 1) as 2 | 3;
  appendHistory(
    state,
    `${name(state, state.activeSeat)} upgraded ${abilityId} to level ${current + 1}.`,
  );
  emitPresentation(state, {
    kind: "upgrade",
    seat: state.activeSeat,
    abilityId,
  });
  state.upgradeQueue!.shift();
  normalizeUpgradeQueue(state);
  if (state.upgradeQueue!.length) {
    state.activeSeat = state.upgradeQueue![0];
    state.notice = `${name(state, state.activeSeat)} upgrades one ability.`;
  } else {
    startNextRound(state);
  }
};

export const THREE_PLAYER_SUPPORTED_ABILITIES = new Set(
  GODS.flatMap((god) => god.abilities.map((ability) => ability.id)),
);

export const unsupportedThreePlayerAbilities = () =>
  GODS.flatMap((god) => god.abilities)
    .map((ability) => ability.id)
    .filter((abilityId) =>
      !THREE_PLAYER_SUPPORTED_ABILITIES.has(abilityId)
    );

const canPassAction = (state: ThreePlayerState) =>
  state.pending?.abilityId === "snipe-shot" ||
  state.selectedAbility === "construction" ||
  state.selectedAbility === "marked" ||
  ["slither", "mount-rider", "funding", "march-companions",
    "barter-orb"].includes(state.pending?.step ?? "") ||
  (
    state.pending?.step === "escort-companions" &&
    Boolean(state.pending.selected?.length)
  ) ||
  (
    state.pending?.step === "hex-target" &&
    Boolean(state.pending.selected?.length)
  );

export const availableThreePlayerActions = (
  input: ThreePlayerState,
): ThreePlayerAction[] => {
  const state = ensureLayer2(clone(input));
  if (state.phase === "draft") {
    return state.draft.available.map((godId) => ({ type: "draft", godId }));
  }
  if (state.phase === "upgrade") {
    return state.players[state.activeSeat].gods.flatMap((godId) =>
      GOD_BY_ID[godId].abilities
        .filter((ability) =>
          abilityLevel(state.players[state.activeSeat].upgrades, ability.id) < 3
        )
        .map((ability) => ({
          type: "upgrade",
          abilityId: ability.id,
        } as ThreePlayerAction))
    );
  }
  if (state.phase !== "play") return [];
  if (state.pending?.abilityId === "harden-choice") {
    return state.pending.step === "harden-choice"
      ? state.legalCells!.map((cell) => ({ type: "cell", cell }))
      : [
        { type: "choice", value: true },
        { type: "choice", value: false },
      ];
  }
  if (state.pending?.abilityId === "snipe-shot") {
    return [
      ...state.legalCells!.map((cell) => ({
        type: "cell",
        cell,
      } as ThreePlayerAction)),
      { type: "pass" },
    ];
  }
  if (state.pending?.step === "grave") {
    return activePlayer(state).graveyard.map(({ piece }) => ({
      type: "grave",
      pieceId: piece.id,
    }));
  }
  if (
    ["siphon-seat", "barter-seat"].includes(state.pending?.step ?? "")
  ) {
    return state.legalSeats!.map((seat) => ({ type: "seat", seat }));
  }
  if (state.pending?.step === "siphon-amount") {
    return [2, 1, 0].map((amount) => ({
      type: "amount",
      amount,
    } as ThreePlayerAction));
  }
  if (state.pending?.step === "barter-orb") {
    const target = state.pending.targetSeat
      ? state.players[state.pending.targetSeat]
      : undefined;
    const take = currentLevel(state, "barter") >= 3 ? 3 : 2;
    return [
      ...(activePlayer(state).orbs.light > 0 &&
          (target?.orbs.dark ?? 0) >= take
        ? [{ type: "orb", orb: "light" } as ThreePlayerAction]
        : []),
      ...(activePlayer(state).orbs.dark > 0 &&
          (target?.orbs.light ?? 0) >= take
        ? [{ type: "orb", orb: "dark" } as ThreePlayerAction]
        : []),
      { type: "orb" },
    ];
  }
  if (
    ["rage-choice", "marked-choice", "resurrect-more"].includes(
      state.pending?.step ?? "",
    )
  ) {
    return [
      { type: "choice", value: true },
      { type: "choice", value: false },
    ];
  }
  if (
    ["confirm-stone-gaze", "confirm-march-home"].includes(
      state.pending?.step ?? "",
    )
  ) return [{ type: "confirm-ability" }];
  if (state.legalPaths!.length) {
    return state.legalPaths!.map((pathId) => ({ type: "path", pathId }));
  }
  if (!state.selectedGod) {
    return activePlayer(state).gods
      .filter((godId) => !state.rested.includes(godId))
      .map((godId) => ({ type: "select-god", godId }));
  }
  if (!state.selectedAbility) {
    const orbs = activePlayer(state).orbs;
    return [
      ...GOD_BY_ID[state.selectedGod].abilities
      .filter((ability) =>
        orbs.light >= (ability.cost?.white ?? 0) &&
        orbs.dark >= (ability.cost?.black ?? 0)
      )
      .map((ability) => ({
        type: "select-ability",
        abilityId: ability.id,
      } as ThreePlayerAction)),
      { type: "clear-god" },
    ];
  }
  const actions: ThreePlayerAction[] = state.legalCells!.map((cell) => ({
    type: "cell",
    cell,
  }));
  if (
    !state.legalCells!.length &&
    state.pending?.step === "source"
  ) {
    actions.push(...Object.keys(state.board)
      .filter((cell) => sourceIsAllowed(state, cell))
      .map((cell) => ({ type: "cell", cell } as ThreePlayerAction)));
  }
  if (canPassAction(state)) actions.push({ type: "pass" });
  if (!hasCommittedThreePlayerAction(state)) actions.push({ type: "cancel" });
  return actions;
};

export const threePlayerReducer = (
  state: ThreePlayerState,
  action: ThreePlayerAction,
): ThreePlayerState => {
  if (action.type === "load") {
    const loaded = ensureLayer2(prepareThreePlayerState(action.state));
    resolveTurnStart(loaded);
    if (!loaded.result && !loaded.pending) resolveStartOfDivineTurn(loaded);
    return loaded;
  }
  if (action.type === "restart") {
    const restarted = createThreePlayerGame(state.config);
    restarted.revision = state.revision + 1;
    return restarted;
  }
  if (state.phase === "gameover") return state;
  const next = ensureLayer2(clone(state));
  const before = JSON.stringify(next);
  const actor = state.activeSeat;
  const boardBefore = JSON.stringify(state.board);
  const actorTurns = state.completedTurns[actor];
  if (action.type === "draft" && next.phase === "draft") {
    reduceDraft(next, action.godId);
  } else if (action.type === "move" && next.phase === "play") {
    reduceMove(next, action);
  } else if (action.type === "upgrade" && next.phase === "upgrade") {
    upgradeAbility(next, action.abilityId);
  } else if (next.phase === "play") {
    if (action.type === "select-god") selectGod(next, action.godId);
    else if (action.type === "clear-god" && !next.selectedAbility) {
      next.selectedGod = undefined;
    } else if (action.type === "select-ability") {
      activateAbility(next, action.abilityId);
    } else if (action.type === "confirm-ability") {
      if (next.pending?.step === "confirm-stone-gaze") {
        resolveStoneGaze(next);
      } else if (
        next.pending?.step === "confirm-march-home" &&
        next.pending.source
      ) {
        executeMarchHome(next, next.pending.source, []);
      }
    } else if (action.type === "cell") handleCell(next, action.cell);
    else if (action.type === "path") handlePath(next, action.pathId);
    else if (action.type === "grave") {
      chooseGravePiece(next, action.pieceId);
    } else if (action.type === "choice") {
      handleChoice(next, action.value);
    } else if (action.type === "seat") handleSeat(next, action.seat);
    else if (action.type === "amount") handleAmount(next, action.amount);
    else if (action.type === "orb") handleOrb(next, action.orb);
    else if (action.type === "pass") handlePass(next);
    else if (action.type === "cancel" && !hasCommittedThreePlayerAction(next)) {
      clearSelection(next);
    }
  }
  if (JSON.stringify(next) === before) return state;
  const boardChanged = JSON.stringify(next.board) !== boardBefore;
  if (boardChanged && next.positionRevision === state.positionRevision) {
    mutatePosition(next);
  }
  if (
    !next.players[actor].eliminated &&
    (
      boardChanged ||
      next.completedTurns[actor] !== actorTurns
    ) &&
    threePlayerIsInCheck(next, actor)
  ) return state;
  recordKingAttackChanges(state, next);
  next.revision = state.revision + 1;
  return next;
};
