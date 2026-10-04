import {
  fourPlayerAdjacentSquares,
  fourPlayerApplyMove,
  fourPlayerCanOrdinarilyCapture,
  fourPlayerCoords,
  fourPlayerDistance,
  fourPlayerFlightPathSquares,
  fourPlayerIsInCheck,
  fourPlayerIsSquareAttacked,
  fourPlayerIsSquareAttackedBy,
  fourPlayerKingSquare,
  fourPlayerLegalTargets,
  fourPlayerLineOfSight,
  fourPlayerOrdinaryAttackedSquares,
  fourPlayerPathSquares,
  fourPlayerPieceValue,
  fourPlayerPseudoTargets,
  fourPlayerSquareAffinity,
  fourPlayerSquareAt,
  fourPlayerSquares,
  forwardDirection,
  homeSquares,
  createFourPlayerInitialBoard,
} from "./fourPlayerChess";
import {
  createDefaultFourPlayerConfig,
  createFourPlayerDraftOrder,
  createTurnOrder,
  seatsAreAllies,
  seatsAreHostile,
  teamForSeat,
  validateFourPlayerConfig,
} from "./fourPlayerConfig";
import {
  FOUR_PLAYER_SEATS,
  type FourPlayerAction,
  type FourPlayerConfig,
  type FourPlayerPiece,
  type FourPlayerState,
  type OrbAffinity,
  type Seat,
} from "./fourPlayerTypes";
import { isFourPlayerState } from "./fourPlayerPersistence";
import { abilityLevel, GOD_BY_ID, GODS } from "./gods";
import { hasCompleteTurn } from "./completeTurnSearch";
import { qualifyingSnake } from "./slither";
import type { GodId, PieceType, Square } from "./types";

const name = (seat: Seat) => seat[0].toUpperCase() + seat.slice(1);
const pieceName = (piece: FourPlayerPiece) => piece.type[0].toUpperCase() + piece.type.slice(1);
const clone = (state: FourPlayerState): FourPlayerState => structuredClone(state);
const emptyKingAttackRecency = (): NonNullable<FourPlayerState["kingAttackRecency"]> => ({
  north: {},
  east: {},
  south: {},
  west: {},
});

const activePlayer = (state: FourPlayerState) => state.players[state.activeSeat];
const currentLevel = (state: FourPlayerState, abilityId: string) =>
  abilityLevel(activePlayer(state).upgrades, abilityId);
const levelFor = (state: FourPlayerState, seat: Seat, abilityId: string) =>
  abilityLevel(state.players[seat].upgrades, abilityId);

const log = (state: FourPlayerState, entry: string) => {
  state.history = [entry, ...state.history].slice(0, 50);
  state.lastAction = entry;
};

const abilityDescription = (state: FourPlayerState, detail: string) => {
  const god = GOD_BY_ID[state.selectedGod!];
  const ability = god.abilities.find((candidate) => candidate.id === state.selectedAbility);
  return `${name(state.activeSeat)} used ${ability?.name ?? state.selectedAbility} with ${god.name}${detail}.`;
};

const addOrbs = (
  state: FourPlayerState,
  seat: Seat,
  light = 0,
  dark = 0,
) => {
  state.players[seat].orbs.light = Math.max(0, state.players[seat].orbs.light + light);
  state.players[seat].orbs.dark = Math.max(0, state.players[seat].orbs.dark + dark);
};

const addAffinityOrb = (
  state: FourPlayerState,
  seat: Seat,
  affinity: OrbAffinity,
  amount: number,
) => addOrbs(state, seat, affinity === "light" ? amount : 0, affinity === "dark" ? amount : 0);

const abilityCost = (state: FourPlayerState, abilityId: string) => {
  const ability = GOD_BY_ID[state.selectedGod!].abilities.find((candidate) => candidate.id === abilityId)!;
  return { light: ability.cost?.white ?? 0, dark: ability.cost?.black ?? 0 };
};

const payCost = (state: FourPlayerState, abilityId: string) => {
  const cost = abilityCost(state, abilityId);
  const orbs = activePlayer(state).orbs;
  if (orbs.light < cost.light || orbs.dark < cost.dark) return false;
  addOrbs(state, state.activeSeat, -cost.light, -cost.dark);
  return true;
};

const refundCost = (state: FourPlayerState) => {
  if (!state.selectedAbility) return;
  const cost = abilityCost(state, state.selectedAbility);
  addOrbs(state, state.activeSeat, cost.light, cost.dark);
};

const COMMITTED_PENDING_STEPS = new Set([
  "banana",
  "barter-orb",
  "barter-seat",
  "cull-choice",
  "enchant-followup-move",
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
  "slither-orb",
]);

export const hasCommittedFourPlayerAction = (state: FourPlayerState) => {
  const pending = state.pending;
  if (!pending) return false;
  if (COMMITTED_PENDING_STEPS.has(pending.step)) return true;
  if (
    ["grave", "revive-place"].includes(pending.step) &&
    Boolean(pending.selected?.length)
  ) return true;
  return pending.abilityId === "hex" && Boolean(pending.selected?.length);
};

const findSquareById = (state: FourPlayerState, pieceId: string) =>
  Object.entries(state.board).find(([, piece]) => piece.id === pieceId)?.[0];

const livingSeats = (state: FourPlayerState) =>
  state.turnOrder.filter((seat) => !state.players[seat].eliminated);

const checkingSeats = (state: FourPlayerState, defender: Seat) => {
  const king = fourPlayerKingSquare(state.board, defender);
  if (!king) return [];
  return FOUR_PLAYER_SEATS.filter((attacker) =>
    seatsAreHostile(state.config, defender, attacker) &&
    fourPlayerIsSquareAttackedBy(
      state.board,
      king,
      attacker,
      state.config,
      state.bananas,
    )
  );
};

const ensureKingAttackTracking = (state: FourPlayerState) => {
  state.attackSequence ??= 0;
  state.kingAttackRecency ??= emptyKingAttackRecency();
};

const recordKingAttackChanges = (
  previous: FourPlayerState | undefined,
  next: FourPlayerState,
) => {
  ensureKingAttackTracking(next);
  for (const defender of FOUR_PLAYER_SEATS) {
    if (next.players[defender].eliminated) continue;
    const previousAttackers = new Set(
      previous && !previous.players[defender].eliminated
        ? checkingSeats(previous, defender)
        : [],
    );
    for (const attacker of checkingSeats(next, defender)) {
      const recorded = next.kingAttackRecency![defender][attacker];
      if (
        recorded !== undefined &&
        (!previous || previousAttackers.has(attacker))
      ) continue;
      next.attackSequence! += 1;
      next.kingAttackRecency![defender][attacker] = next.attackSequence;
    }
  }
};

const hasUpgradeableAbility = (state: FourPlayerState, seat: Seat) =>
  state.players[seat].gods.some((godId) =>
    GOD_BY_ID[godId].abilities.some((ability) =>
      abilityLevel(state.players[seat].upgrades, ability.id) < 3
    )
  );

const normalizeUpgradeQueue = (state: FourPlayerState) => {
  state.upgradeQueue = state.upgradeQueue.filter((seat) =>
    !state.players[seat].eliminated && hasUpgradeableAbility(state, seat)
  );
};

const setWinner = (
  state: FourPlayerState,
  seat: Seat,
  reason: NonNullable<FourPlayerState["winner"]>["reason"],
) => {
  state.phase = "gameover";
  state.winner = {
    seat: state.config.mode === "ffa" ? seat : undefined,
    team: teamForSeat(state.config, seat),
    reason,
  };
};

const setDraw = (state: FourPlayerState) => {
  state.phase = "gameover";
  state.drawReason = "stalemate-cycle";
  state.notice = "The match is a draw: every living seat is stalemated.";
};

const stalematePositionSignature = (state: FourPlayerState) => JSON.stringify({
  phase: state.phase,
  config: state.config,
  board: state.board,
  players: state.players,
  turnOrder: state.turnOrder,
  rested: state.rested,
  round: state.round,
  seatTurns: state.seatTurns,
  hostileTurns: state.hostileTurns,
  godTurns: state.godTurns,
  upgradeQueue: state.upgradeQueue,
  enPassant: state.enPassant,
  bananas: state.bananas,
  stealth: state.stealth,
  bonusTurn: state.bonusTurn,
});

const ensurePassCycle = (state: FourPlayerState) => {
  state.passCycle ??= {
    positionSignature: stalematePositionSignature(state),
    passedSeats: [],
  };
  const signature = stalematePositionSignature(state);
  if (state.passCycle.positionSignature !== signature) {
    state.passCycle = { positionSignature: signature, passedSeats: [] };
  }
  return signature;
};

const evaluateLastSurvivorVictory = (state: FourPlayerState) => {
  if (state.winner) return;
  const survivors = livingSeats(state);
  if (state.config.mode === "ffa") {
    if (survivors.length === 1) setWinner(state, survivors[0], "last-player");
    return;
  }
  const teams = new Set(survivors.map((seat) => teamForSeat(state.config, seat)));
  if (teams.size === 1 && survivors.length) setWinner(state, survivors[0], "last-team");
};

const eliminateSeat = (state: FourPlayerState, eliminated: Seat, captor: Seat) => {
  const player = state.players[eliminated];
  if (player.eliminated) return;
  const isFirstKingCapture = !FOUR_PLAYER_SEATS.some(
    (seat) => state.players[seat].eliminated,
  );
  player.eliminated = true;
  player.eliminatedBy = captor;
  const takeoverController =
    state.config.takeover && !state.players[captor].eliminated ? captor : null;
  const clearEliminatedEffects = (piece: FourPlayerPiece) => {
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
    if (typeof piece.status.prepared === "object" && piece.status.prepared.owner === eliminated) {
      delete piece.status.prepared;
    }
    if (piece.status.ritual?.owner === eliminated) delete piece.status.ritual;
    if (piece.status.markedForDeath?.owner === eliminated) delete piece.status.markedForDeath;
  };
  const nextController = (piece: FourPlayerPiece) => {
    if (piece.owner === eliminated || state.players[piece.owner].eliminated) {
      return takeoverController;
    }
    return piece.owner;
  };
  for (const piece of Object.values(state.board)) {
    clearEliminatedEffects(piece);
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
  const eliminatedStealth = FOUR_PLAYER_SEATS.flatMap((seat) =>
    state.stealth[seat].filter((move) =>
      move.piece.owner === eliminated || move.piece.controller === eliminated
    )
  );
  for (const seat of FOUR_PLAYER_SEATS) {
    for (const move of state.stealth[seat]) clearEliminatedEffects(move.piece);
    state.stealth[seat] = state.stealth[seat].filter(
      (move) => move.piece.owner !== eliminated && move.piece.controller !== eliminated,
    );
  }
  for (const move of eliminatedStealth) {
    clearEliminatedEffects(move.piece);
    if (move.piece.owner === eliminated) {
      delete move.piece.status.hardened;
      delete move.piece.status.gazing;
      delete move.piece.status.chargeUntil;
      delete move.piece.status.prepared;
    }
    delete move.piece.status.hired;
    move.piece.controller = nextController(move.piece);
    if (move.piece.controller) {
      state.stealth[move.piece.controller].push({
        ...move,
        returnOnTurn: state.seatTurns[move.piece.controller] + 1,
      });
    } else {
      if (!state.board[move.destination]) state.board[move.destination] = move.piece;
      else sendToGraveyard(state, move.piece, move.destination);
    }
  }
  state.bananas = state.bananas.filter((banana) => banana.owner !== eliminated);
  state.upgradeQueue = state.upgradeQueue.filter((seat) => seat !== eliminated);
  log(state, `${name(eliminated)} was eliminated by ${name(captor)}.`);
  if (
    isFirstKingCapture &&
    state.config.victoryMode === "first-king-captured" &&
    seatsAreHostile(state.config, captor, eliminated)
  ) {
    setWinner(state, captor, "first-king-captured");
  } else {
    evaluateLastSurvivorVictory(state);
  }
};

const sendToGraveyard = (
  state: FourPlayerState,
  piece: FourPlayerPiece,
  source: Square,
  captor = state.activeSeat,
) => {
  state.players[piece.owner].graveyard.push({
    piece: structuredClone(piece),
    capturedOnTurn: state.turn,
  });
  if (
    piece.status.ritual &&
    (
      piece.status.ritual.expires === "kangus" ||
      state.hostileTurns[piece.status.ritual.owner] < piece.status.ritual.expires
    )
  ) {
    const reward = levelFor(state, piece.status.ritual.owner, "ritual-sacrifice") >= 3 ? 4 : 3;
    addOrbs(state, piece.status.ritual.owner, reward, reward);
  }
  if (piece.type === "king") eliminateSeat(state, piece.owner, captor);
  log(state, `${name(piece.owner)}'s ${piece.type} was captured on ${source}.`);
};

const captureAt = (
  state: FourPlayerState,
  square: Square,
  explicitFriendly = false,
  allowKing = false,
) => {
  const piece = state.board[square];
  if (
    !piece ||
    (!allowKing && piece.type === "king") ||
    piece.status.hardened
  ) return undefined;
  if (
    !explicitFriendly &&
    piece.controller &&
    !seatsAreHostile(state.config, state.activeSeat, piece.controller)
  ) return undefined;
  delete state.board[square];
  sendToGraveyard(state, piece, square);
  return piece;
};

const bananaOnPath = (
  state: FourPlayerState,
  from: Square,
  requestedTo: Square,
  actor: Seat,
) => [...fourPlayerPathSquares(from, requestedTo), requestedTo].find((square) =>
  state.bananas.some(
    (banana) =>
      banana.square === square &&
      seatsAreHostile(state.config, actor, banana.owner),
  )
);

const moveDirect = (
  state: FourPlayerState,
  from: Square,
  requestedTo: Square,
  teleport = false,
) => {
  const moving = state.board[from];
  if (
    !moving?.controller ||
    state.board[requestedTo]?.type === "king"
  ) return undefined;
  const peel = teleport ? undefined : bananaOnPath(state, from, requestedTo, moving.controller);
  const to = peel ?? requestedTo;
  const result = fourPlayerApplyMove(state.board, { from, to }, state.enPassant);
  state.board = result.board;
  state.enPassant = result.enPassant
    ? { ...result.enPassant, expiresOnTurn: state.turn + 1 }
    : undefined;
  if (result.captured) sendToGraveyard(state, result.captured, result.capturedSquare ?? to);
  if (peel) state.bananas = state.bananas.filter((banana) => banana.square !== peel);
  return { piece: state.board[to], from, to, captured: result.captured };
};

const nextLivingSeat = (state: FourPlayerState, after: Seat) => {
  const start = state.turnOrder.indexOf(after);
  for (let offset = 1; offset <= state.turnOrder.length; offset += 1) {
    const seat = state.turnOrder[(start + offset) % state.turnOrder.length];
    if (!state.players[seat].eliminated) return seat;
  }
  return after;
};

const expireStatuses = (state: FourPlayerState, endingSeat: Seat) => {
  for (const piece of Object.values(state.board)) {
    const controller = piece.controller;
    const status = { ...piece.status };
    if (
      controller &&
      typeof status.hardened === "number" &&
      seatsAreHostile(state.config, controller, endingSeat)
    ) {
      if (status.hardened <= 1) {
        if (levelFor(state, controller, "harden") >= 2) status.hardened = "choice";
        else delete status.hardened;
      } else status.hardened -= 1;
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
      state.hostileTurns[status.ritual.owner] >= status.ritual.expires
    ) {
      delete status.ritual;
    }
    piece.status = status;
  }
  for (const piece of Object.values(state.board)) {
    if (!piece.status.gazing || !piece.controller) continue;
    const remains = Object.values(state.board).some(
      (target) => target.status.frozen && target.status.frozenBy === piece.controller,
    );
    if (!remains) delete piece.status.gazing;
  }
  state.bananas = state.bananas.filter((banana) =>
    typeof banana.expires === "number"
      ? state.hostileTurns[banana.owner] < banana.expires
      : true
  );
};

const preparedDetails = (piece: FourPlayerPiece) => {
  if (!piece.status.prepared) return undefined;
  return typeof piece.status.prepared === "boolean"
    ? { owner: piece.controller!, level: 1 as const }
    : piece.status.prepared;
};

const preparedShotTargets = (state: FourPlayerState, source: Square) =>
  fourPlayerOrdinaryAttackedSquares(
    state.board,
    source,
    state.config,
    state.bananas,
  ).filter((target) => {
    const piece = state.board[target];
    if (
      !piece?.controller ||
      piece.type === "king" ||
      !seatsAreHostile(state.config, state.activeSeat, piece.controller)
    ) return false;
    const simulated = { ...state.board };
    delete simulated[target];
    return !fourPlayerIsInCheck(simulated, state.activeSeat, state.config, state.bananas);
  });

const queuePreparedShot = (state: FourPlayerState) => {
  const prepared = Object.entries(state.board).filter(([square, piece]) => {
    const details = preparedDetails(piece);
    if (
      !details ||
      details.owner !== state.activeSeat ||
      piece.controller !== state.activeSeat
    ) return false;
    if (preparedShotTargets(state, square).length) return true;
    if (details.level === 1) delete piece.status.prepared;
    return false;
  });
  if (!prepared.length) return false;
  state.pending = { godId: "artemis", abilityId: "snipe-shot", step: "snipe-source" };
  state.legalTargets = prepared.map(([square]) => square);
  state.notice = "Prepared Shot: choose a prepared piece or pass.";
  return true;
};

const queueHardenChoice = (state: FourPlayerState) => {
  const targets = Object.entries(state.board)
    .filter(([, piece]) => piece.controller === state.activeSeat && piece.status.hardened === "choice")
    .map(([square]) => square);
  if (!targets.length) return false;
  state.pending = { godId: "anubis", abilityId: "harden-choice", step: "harden-choice" };
  state.legalTargets = targets;
  state.notice = "Harden: choose a piece whose initial duration ended.";
  return true;
};

const resolveStartOfTurn = (state: FourPlayerState) => {
  for (const piece of Object.values(state.board)) {
    if (piece.status.poisonedBy === state.activeSeat) {
      delete piece.status.poisoned;
      delete piece.status.poisonedBy;
    }
  }
  const returns = state.stealth[state.activeSeat].filter(
    (move) => move.returnOnTurn <= state.seatTurns[state.activeSeat],
  );
  for (const returning of returns) {
    const occupant = state.board[returning.destination];
    if (occupant && !occupant.status.hardened) {
      captureAt(state, returning.destination, true, true);
    }
    if (!state.board[returning.destination]) {
      state.board[returning.destination] = {
        ...returning.piece,
        status: { ...returning.piece.status, movedThisTurn: true },
      };
    } else {
      sendToGraveyard(state, returning.piece, returning.destination);
    }
  }
  state.stealth[state.activeSeat] = state.stealth[state.activeSeat].filter(
    (move) => move.returnOnTurn > state.seatTurns[state.activeSeat],
  );
  if (!queueHardenChoice(state)) queuePreparedShot(state);
};

const resolveMarkedForDeath = (state: FourPlayerState) => {
  for (const [square, piece] of Object.entries(state.board)) {
    if (
      piece.status.markedForDeath?.owner !== state.activeSeat ||
      piece.status.markedForDeath.round > state.round
    ) continue;
    if (piece.type === "king") {
      delete piece.status.markedForDeath;
      continue;
    }
    delete state.board[square];
    sendToGraveyard(state, piece, square);
    addOrbs(state, state.activeSeat, 0, 3);
  }
};

const survivingGods = (state: FourPlayerState) =>
  livingSeats(state).flatMap((seat) => state.players[seat].gods);

const startNextRound = (state: FourPlayerState) => {
  const survivors = livingSeats(state);
  if (!survivors.length) return;
  state.phase = "play";
  state.round += 1;
  state.rested = [];
  state.upgradeQueue = [];
  state.activeSeat = survivors[0];
  state.turn += 1;
  resolveStartOfTurn(state);
  if (!state.winner) state.notice = `Round ${state.round}. ${name(state.activeSeat)} to act.`;
};

const finishTurn = (state: FourPlayerState, description: string) => {
  if (state.selectedGod === "death") resolveMarkedForDeath(state);
  const god = state.selectedGod;
  if (god && !state.rested.includes(god)) state.rested.push(god);
  log(state, description);
  state.selectedGod = undefined;
  state.selectedAbility = undefined;
  state.selectedSquare = undefined;
  state.pending = undefined;
  state.legalTargets = [];
  state.legalSeats = [];
  if (state.phase === "gameover") return;
  const endingSeat = state.activeSeat;
  state.seatTurns[endingSeat] += 1;
  for (const seat of FOUR_PLAYER_SEATS) {
    if (seatsAreHostile(state.config, seat, endingSeat)) state.hostileTurns[seat] += 1;
  }
  expireStatuses(state, endingSeat);
  const gods = survivingGods(state);
  if (gods.length && gods.every((candidate) => state.rested.includes(candidate))) {
    state.upgradeQueue = livingSeats(state);
    normalizeUpgradeQueue(state);
    if (!state.upgradeQueue.length) {
      startNextRound(state);
      return;
    }
    state.phase = "upgrade";
    state.activeSeat = state.upgradeQueue[0];
    state.notice = `${name(state.activeSeat)} upgrades one ability.`;
    return;
  }
  state.turn += 1;
  const keepsTurn = state.bonusTurn === endingSeat && !state.players[endingSeat].eliminated;
  state.activeSeat = keepsTurn ? endingSeat : nextLivingSeat(state, endingSeat);
  state.bonusTurn = undefined;
  if (state.enPassant && state.enPassant.expiresOnTurn < state.turn) state.enPassant = undefined;
  resolveStartOfTurn(state);
  if (!state.winner) state.notice = `${name(state.activeSeat)} to act. Choose an available God.`;
};

export const createFourPlayerGame = (
  configuration: FourPlayerConfig = createDefaultFourPlayerConfig(),
): FourPlayerState => {
  const config = structuredClone(validateFourPlayerConfig(configuration));
  const turnOrder = createTurnOrder(config);
  const createSeatState = (seat: Seat): FourPlayerState["players"][Seat] => ({
      seat,
      name: config.seats[seat].name,
      team: teamForSeat(config, seat),
      displayColor: config.seats[seat].displayColor,
      orbAffinity: config.seats[seat].orbAffinity,
      control: structuredClone(config.seats[seat].control),
      eliminated: false,
      gods: [],
      orbs: { light: 0, dark: 0 },
      graveyard: [],
      upgrades: {},
  });
  const players: FourPlayerState["players"] = {
    north: createSeatState("north"),
    east: createSeatState("east"),
    south: createSeatState("south"),
    west: createSeatState("west"),
  };
  return {
    variant: "four-player",
    phase: "draft",
    config,
    board: createFourPlayerInitialBoard(config),
    players,
    activeSeat: turnOrder[0],
    turnOrder,
    draft: {
      order: createFourPlayerDraftOrder(turnOrder),
      pickIndex: 0,
      available: GODS.map((god) => god.id),
    },
    rested: [],
    round: 1,
    turn: 1,
    seatTurns: { north: 0, east: 0, south: 0, west: 0 },
    hostileTurns: { north: 0, east: 0, south: 0, west: 0 },
    godTurns: { north: {}, east: {}, south: {}, west: {} },
    orbAnimations: [],
    nextOrbAnimationId: 1,
    attackSequence: 0,
    kingAttackRecency: emptyKingAttackRecency(),
    passCycle: { positionSignature: "", passedSeats: [] },
    upgradeQueue: [],
    legalTargets: [],
    legalSeats: [],
    bananas: [],
    stealth: { north: [], east: [], south: [], west: [] },
    history: [],
    notice: `${name(turnOrder[0])} drafts first. Choose a God.`,
  };
};

const allowedEnchantTypes = (level: number): PieceType[] =>
  level === 1
    ? ["pawn", "knight", "bishop"]
    : level === 2
      ? ["pawn", "knight", "bishop", "rook"]
      : ["pawn", "knight", "bishop", "rook", "queen"];

const hostilePiece = (state: FourPlayerState, piece: FourPlayerPiece | undefined) =>
  Boolean(
    piece?.controller &&
    seatsAreHostile(state.config, state.activeSeat, piece.controller),
  );

const alliedPiece = (state: FourPlayerState, piece: FourPlayerPiece | undefined) =>
  Boolean(
    piece?.controller &&
    seatsAreAllies(state.config, state.activeSeat, piece.controller),
  );

const queensControlledBy = (state: FourPlayerState, seat: Seat) =>
  Object.entries(state.board)
    .filter(([, piece]) => piece.controller === seat && piece.type === "queen")
    .map(([square]) => square);

const compelledLuredSources = (state: FourPlayerState) =>
  Object.entries(state.board)
    .filter(([source, piece]) => {
      if (piece.controller !== state.activeSeat || !piece.status.luredBy) return false;
      const queens = queensControlledBy(state, piece.status.luredBy);
      if (!queens.length) return false;
      const currentDistance = Math.min(...queens.map((queen) => fourPlayerDistance(source, queen)));
      return fourPlayerLegalTargets(state.board, source, state.config, {
        enPassant: state.enPassant,
        bananas: state.bananas,
      }).some((target) =>
        Math.min(...queens.map((queen) => fourPlayerDistance(target, queen))) < currentDistance
      );
    })
    .map(([square]) => square);

const constrainLure = (
  state: FourPlayerState,
  source: Square,
  targets: Square[],
) => {
  const piece = state.board[source];
  if (!piece?.status.luredBy) return targets;
  const queens = queensControlledBy(state, piece.status.luredBy);
  if (!queens.length) return targets;
  const currentDistance = Math.min(...queens.map((queen) => fourPlayerDistance(source, queen)));
  const closer = targets.filter((target) =>
    Math.min(...queens.map((queen) => fourPlayerDistance(target, queen))) < currentDistance
  );
  return closer.length ? closer : targets;
};

const airStrikePassengerTypes = (level: number): PieceType[] =>
  level >= 3 ? ["pawn", "knight", "bishop"] : ["pawn"];

const airStrikePassengerSquares = (
  state: FourPlayerState,
  carrierSquare: Square,
) => fourPlayerAdjacentSquares(carrierSquare).filter((square) => {
  const passenger = state.board[square];
  return (
    alliedPiece(state, passenger) &&
    airStrikePassengerTypes(currentLevel(state, "air-strike")).includes(passenger.type) &&
    !passenger.status.hardened &&
    !passenger.status.frozen &&
    !passenger.status.gazing &&
    !passenger.status.movedThisTurn
  );
});

const airStrikeDropTargets = (
  state: FourPlayerState,
  carrierSquare: Square,
  carrierDestination: Square,
  passengerSquare: Square,
) => {
  const passenger = state.board[passengerSquare];
  if (!passenger) return [];
  const path = fourPlayerFlightPathSquares(carrierSquare, carrierDestination);
  const board = structuredClone(state.board);
  delete board[passengerSquare];
  const afterCarrier = fourPlayerApplyMove(
    board,
    { from: carrierSquare, to: carrierDestination },
    state.enPassant,
  ).board;
  const firstEnemy = currentLevel(state, "air-strike") >= 2
    ? path.find((square) => hostilePiece(state, afterCarrier[square]))
    : undefined;
  return path.filter((square) => {
    const occupying = afterCarrier[square];
    if (
      occupying &&
      (
        square !== firstEnemy ||
        !hostilePiece(state, occupying) ||
        occupying.type === "king" ||
        occupying.status.hardened
      )
    ) {
      return false;
    }
    const simulated = { ...afterCarrier };
    delete simulated[square];
    simulated[square] = {
      ...passenger,
      hasMoved: true,
      status: { ...passenger.status, movedThisTurn: true },
    };
    return !fourPlayerIsInCheck(
      simulated,
      state.activeSeat,
      state.config,
      state.bananas,
    );
  });
};

const airStrikeLandingTargets = (
  state: FourPlayerState,
  carrierSquare: Square,
  passengerSquare: Square,
) => {
  const board = structuredClone(state.board);
  delete board[passengerSquare];
  const carrier = board[carrierSquare];
  if (!carrier) return [];
  return constrainLure(
    state,
    carrierSquare,
    fourPlayerPseudoTargets(board, carrierSquare, state.config, {
      enPassant: state.enPassant,
      ignoreBlockers: true,
      noCapture: true,
      bananas: state.bananas,
    }).filter((target) =>
      !board[target] &&
      (carrier.type !== "king" || fourPlayerDistance(carrierSquare, target) <= 1) &&
      airStrikeDropTargets(state, carrierSquare, target, passengerSquare).length > 0
    ),
  );
};

interface EscortLanding {
  from: Square;
  to: Square;
  piece: FourPlayerPiece;
}

const escortPlan = (
  state: FourPlayerState,
  kingSquare: Square,
  requestedDestination: Square,
) => {
  const king = state.board[kingSquare];
  if (!king || king.type !== "king") return undefined;
  const selected = new Set(state.pending?.selected ?? []);
  const companions = fourPlayerAdjacentSquares(kingSquare)
    .map((from) => ({ from, piece: state.board[from] }))
    .filter((entry): entry is { from: Square; piece: FourPlayerPiece } =>
      Boolean(entry.piece && selected.has(entry.piece.id))
    );
  if (!companions.length) return undefined;
  const slippedOn = bananaOnPath(state, kingSquare, requestedDestination, king.controller!);
  const kingDestination = slippedOn ?? requestedDestination;
  const [fromFile, fromRank] = fourPlayerCoords(kingSquare);
  const [toFile, toRank] = fourPlayerCoords(kingDestination);
  const fileDelta = toFile - fromFile;
  const rankDelta = toRank - fromRank;
  const moved = Math.max(Math.abs(fileDelta), Math.abs(rankDelta));
  if (
    moved < 1 ||
    moved > (currentLevel(state, "escort") >= 3 ? 2 : 1) ||
    (fileDelta !== 0 && rankDelta !== 0 && Math.abs(fileDelta) !== Math.abs(rankDelta))
  ) return undefined;
  const landings: EscortLanding[] = [{ from: kingSquare, to: kingDestination, piece: king }];
  for (const companion of companions) {
    const [file, rank] = fourPlayerCoords(companion.from);
    const to = fourPlayerSquareAt(file + fileDelta, rank + rankDelta);
    if (!to) return undefined;
    landings.push({ ...companion, to });
  }
  if (new Set(landings.map((landing) => landing.to)).size !== landings.length) {
    return undefined;
  }
  const simulated = structuredClone(state.board);
  for (const landing of landings) delete simulated[landing.from];
  for (const landing of landings) {
    const occupying = simulated[landing.to];
    if (
      occupying?.type === "king" ||
      occupying?.status.hardened ||
      (
        occupying?.controller &&
        seatsAreAllies(state.config, state.activeSeat, occupying.controller)
      )
    ) return undefined;
    delete simulated[landing.to];
    simulated[landing.to] = {
      ...landing.piece,
      hasMoved: true,
      status: { ...landing.piece.status, movedThisTurn: true },
    };
  }
  const bananas = slippedOn
    ? state.bananas.filter((banana) => banana.square !== slippedOn)
    : state.bananas;
  if (fourPlayerIsInCheck(simulated, state.activeSeat, state.config, bananas)) return undefined;
  return { kingDestination, landings, slippedOn };
};

const sourceIsAllowed = (state: FourPlayerState, square: Square) => {
  const piece = state.board[square];
  if (!piece || piece.status.gazing || piece.status.frozen || !state.selectedAbility) return false;
  const abilityId = state.selectedAbility;
  const level = currentLevel(state, abilityId);
  const fundingRepeat =
    abilityId === "military-funding" &&
    level >= 3 &&
    state.pending?.step === "funding" &&
    !state.pending.selected?.includes("__no-repeat");
  if (piece.status.movedThisTurn && !fundingRepeat) return false;
  const compelled = compelledLuredSources(state);
  if (state.pending?.step === "enchant-followup-move") {
    return (
      piece.controller === state.activeSeat &&
      (!compelled.length || compelled.includes(square))
    );
  }
  if (abilityId !== "enchant" && compelled.length && !compelled.includes(square)) return false;
  if (abilityId === "enchant") {
    return hostilePiece(state, piece) && allowedEnchantTypes(level).includes(piece.type);
  }
  if (["air-lift", "march-home", "escort"].includes(abilityId)) {
    return piece.controller === state.activeSeat && piece.type === "king";
  }
  if (abilityId === "air-strike") {
    return (
      piece.controller === state.activeSeat &&
      airStrikePassengerSquares(state, square)
        .some((passenger) => airStrikeLandingTargets(state, square, passenger).length)
    );
  }
  if (abilityId === "slither") return piece.controller === state.activeSeat && piece.type === "queen";
  if (abilityId === "military-funding") return piece.controller === state.activeSeat && piece.type === "pawn";
  if (abilityId === "charge") return piece.controller === state.activeSeat && piece.type === "knight";
  if (abilityId === "marked" && piece.type === "king") return false;
  return piece.controller === state.activeSeat;
};

const ordinaryMoveTargets = (state: FourPlayerState, square: Square) => {
  const piece = state.board[square];
  if (!piece || piece.controller !== state.activeSeat) return [];
  let targets = fourPlayerLegalTargets(state.board, square, state.config, {
    enPassant: state.enPassant,
    bananas: state.bananas,
  });
  if (piece.type === "knight" && piece.status.chargeUntil) {
    targets = [...new Set([
      ...targets,
      ...fourPlayerLegalTargets(state.board, square, state.config, {
        forceType: "rook",
        bananas: state.bananas,
      }),
    ])];
  }
  return constrainLure(state, square, targets);
};

const enchantFollowupSources = (state: FourPlayerState) =>
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
  state: FourPlayerState,
  source: Square,
  destination: Square,
) => {
  const simulated = clone(state);
  const moving = simulated.board[source];
  if (!moving) return false;
  const originalController = moving.controller;
  moving.controller = simulated.activeSeat;
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

const sourceTargets = (state: FourPlayerState, square: Square): Square[] => {
  const abilityId = state.selectedAbility!;
  const level = currentLevel(state, abilityId);
  const piece = state.board[square];
  if (!piece) return [];
  if (state.pending?.step === "enchant-followup-move") {
    return ordinaryMoveTargets(state, square);
  }
  if (piece.status.hardened && levelFor(state, piece.controller!, "harden") >= 3) {
    const board = structuredClone(state.board);
    delete board[square].status.hardened;
    return constrainLure(
      state,
      square,
      fourPlayerLegalTargets(board, square, state.config, {
        enPassant: state.enPassant,
        bananas: state.bananas,
      }).filter((target) => !board[target]),
    );
  }
  if (abilityId === "air-lift") {
    return constrainLure(
      state,
      square,
      fourPlayerSquares.filter((target) =>
        !state.board[target] &&
        fourPlayerDistance(square, target) <= level + 2 &&
        !fourPlayerIsInCheck(
          fourPlayerApplyMove(state.board, { from: square, to: target }, state.enPassant).board,
          state.activeSeat,
          state.config,
          state.bananas,
        )
      ),
    );
  }
  if (abilityId === "charge") {
    return constrainLure(
      state,
      square,
      fourPlayerLegalTargets(state.board, square, state.config, {
        forceType: "rook",
        bananas: state.bananas,
      }),
    );
  }
  if (abilityId === "mount") {
    const riders = fourPlayerAdjacentSquares(square, false)
      .filter((target) => alliedPiece(state, state.board[target]));
    if (!riders.length) return [];
    return constrainLure(
      state,
      square,
      fourPlayerLegalTargets(state.board, square, state.config, {
        enPassant: state.enPassant,
        bananas: state.bananas,
      }).filter((target) => {
        const board = fourPlayerApplyMove(state.board, { from: square, to: target }, state.enPassant).board;
        const simulatedState = { ...state, board };
        return riders.some((rider) =>
          mountPlacementTargets(simulatedState, rider, target).length > 0
        );
      }),
    );
  }
  if (abilityId === "siphon") {
    return constrainLure(
      state,
      square,
      fourPlayerLegalTargets(state.board, square, state.config, {
        enPassant: state.enPassant,
        bananas: state.bananas,
      }).filter((target) =>
        fourPlayerAdjacentSquares(target).some((adjacent) => hostilePiece(state, state.board[adjacent]))
      ),
    );
  }
  if (abilityId === "march-home") return [homeSquares(piece.owner)[4]];
  if (abilityId === "escort") {
    const board = structuredClone(state.board);
    for (const selectedId of state.pending?.selected ?? []) {
      const selectedSquare = Object.entries(board).find(([, candidate]) => candidate.id === selectedId)?.[0];
      if (selectedSquare) delete board[selectedSquare];
    }
    return constrainLure(
      state,
      square,
      fourPlayerPseudoTargets(board, square, state.config, {
        forceType: level >= 3 ? "queen" : "king",
        maxDistance: level >= 3 ? 2 : 1,
        bananas: state.bananas,
      }).filter((target) => Boolean(escortPlan(state, square, target))),
    );
  }
  if (abilityId === "slither") {
    return constrainLure(
      state,
      square,
      fourPlayerLegalTargets(state.board, square, state.config, {
        forceType: "bishop",
        noCapture: true,
        bananas: state.bananas,
      }),
    );
  }
  if (abilityId === "pick-a-fight") {
    if (level < 3 && !["knight", "bishop"].includes(piece.type)) return [];
    const ordinaryTargets = fourPlayerLegalTargets(
      state.board,
      square,
      state.config,
      {
        enPassant: state.enPassant,
        bananas: state.bananas,
      },
    ).filter((target) => !state.board[target]);
    return constrainLure(
      state,
      square,
      ordinaryTargets.filter((target) => {
        const simulated = { ...state.board, [target]: piece };
        delete simulated[square];
        const attacked = fourPlayerIsSquareAttacked(
          simulated,
          target,
          state.activeSeat,
          state.config,
          state.bananas,
        );
        const attacksTwo = fourPlayerOrdinaryAttackedSquares(
          simulated,
          target,
          state.config,
          state.bananas,
        ).filter((candidate) => hostilePiece(state, simulated[candidate])).length >= 2;
        if (!attacked && !(level >= 2 && attacksTwo)) return false;
        return !fourPlayerIsInCheck(
          simulated,
          state.activeSeat,
          state.config,
          state.bananas,
        );
      }),
    );
  }
  if (abilityId === "enchant") {
    const board = structuredClone(state.board);
    board[square].controller = state.activeSeat;
    return fourPlayerLegalTargets(board, square, state.config, {
      enPassant: state.enPassant,
      bananas: state.bananas,
    }).filter((target) =>
      state.board[target]?.type !== "king" &&
      enchantDestinationHasFollowup(state, square, target)
    );
  }
  if (abilityId === "banana-peel") {
    return constrainLure(
      state,
      square,
      fourPlayerLegalTargets(state.board, square, state.config, {
        enPassant: state.enPassant,
        bananas: state.bananas,
      }).filter((target) =>
        safeBananaPlacementsAfterMove(state, square, target).placements.length > 0
      ),
    );
  }
  if (abilityId === "stealth") {
    return constrainLure(
      state,
      square,
      fourPlayerLegalTargets(state.board, square, state.config, {
        enPassant: state.enPassant,
        bananas: state.bananas,
      }).filter(() => {
        const simulated = { ...state.board };
        delete simulated[square];
        return !fourPlayerIsInCheck(
          simulated,
          state.activeSeat,
          state.config,
          state.bananas,
        );
      }),
    );
  }
  if (abilityId === "leverage") {
    return constrainLure(
      state,
      square,
      fourPlayerLegalTargets(state.board, square, state.config, {
        enPassant: state.enPassant,
        bananas: state.bananas,
      }).filter((target) => {
        const board = fourPlayerApplyMove(state.board, { from: square, to: target }, state.enPassant).board;
        return fourPlayerAdjacentSquares(target).some((adjacent) => {
          const hire = board[adjacent];
          if (!hostilePiece(state, hire) || hire.type === "king") return false;
          if (!allowedEnchantTypes(level).includes(hire.type)) return false;
          const extra = hire.type === "rook" ? 1 : hire.type === "queen" ? 2 : 0;
          return activePlayer(state).orbs.dark >= extra;
        });
      }),
    );
  }
  if (abilityId === "cull-the-weak") {
    return constrainLure(
      state,
      square,
      fourPlayerLegalTargets(state.board, square, state.config, {
        enPassant: state.enPassant,
        bananas: state.bananas,
      }).filter((target) => {
        const board = fourPlayerApplyMove(state.board, { from: square, to: target }, state.enPassant).board;
        return fourPlayerOrdinaryAttackedSquares(
          board,
          target,
          state.config,
          state.bananas,
        ).filter((attacked) => hostilePiece(state, board[attacked])).length >= 2;
      }),
    );
  }
  const charged = piece.type === "knight" && piece.status.chargeUntil
    ? fourPlayerLegalTargets(state.board, square, state.config, {
      forceType: "rook",
      bananas: state.bananas,
    })
    : [];
  return constrainLure(
    state,
    square,
    [...new Set([
      ...fourPlayerLegalTargets(state.board, square, state.config, {
        enPassant: state.enPassant,
        bananas: state.bananas,
      }),
      ...charged,
    ])],
  );
};

const movableSourceSquares = (state: FourPlayerState) =>
  Object.keys(state.board).filter((square) =>
    sourceIsAllowed(state, square) && sourceTargets(state, square).length > 0
  );

const enterHexMovement = (state: FourPlayerState) => {
  const sources = movableSourceSquares(state);
  if (!sources.length) {
    finishTurn(
      state,
      abilityDescription(state, ": completed Hex without a legal movement"),
    );
    return;
  }
  state.pending = {
    ...state.pending!,
    step: "source",
  };
  state.selectedSquare = undefined;
  state.legalTargets = sources;
  state.notice = "Choose a piece to move.";
};

const stoneGazeTargets = (state: FourPlayerState) => {
  const queens = Object.entries(state.board)
    .filter(([, piece]) => piece.controller === state.activeSeat && piece.type === "queen");
  const queenIds = new Set(queens.map(([, piece]) => piece.id));
  const targets = Object.entries(state.board).filter(
    ([square, piece]) =>
      !queenIds.has(piece.id) &&
      queens.some(([queenSquare]) => fourPlayerLineOfSight(state.board, queenSquare, square)),
  );
  return { queens, targets };
};

const resolveStoneGaze = (state: FourPlayerState) => {
  const level = currentLevel(state, "stone-gaze");
  const { queens, targets } = stoneGazeTargets(state);
  for (const [, piece] of targets) {
    piece.status.frozen = level >= 3
      ? "god"
      : level + 1 + (piece.controller === state.activeSeat ? 1 : 0);
    piece.status.frozenBy = state.activeSeat;
  }
  if (targets.length) {
    for (const [, queen] of queens) queen.status.gazing = true;
  }
  finishTurn(
    state,
    abilityDescription(state, `: petrified ${targets.length} piece${targets.length === 1 ? "" : "s"}`),
  );
};

const startTargetAbility = (state: FourPlayerState, abilityId: string) => {
  const level = currentLevel(state, abilityId);
  if (abilityId === "lure") {
    state.legalTargets = Object.entries(state.board)
      .filter(([, piece]) => hostilePiece(state, piece) && allowedEnchantTypes(level).includes(piece.type))
      .map(([square]) => square);
  } else if (abilityId === "rage") {
    state.legalTargets = Object.keys(state.board);
    state.pending = {
      godId: state.selectedGod!,
      abilityId,
      step: level >= 3 ? "rage-source" : "target",
    };
    state.notice = level >= 3
      ? "Rage: choose a controlled piece to move up to one space."
      : "Choose the piece at the center of Rage.";
    if (level >= 3) {
      state.legalTargets = Object.entries(state.board)
        .filter(([, piece]) => piece.controller === state.activeSeat)
        .map(([square]) => square);
    }
    return;
  } else if (abilityId === "poison-cloud" && level >= 2) {
    state.legalTargets = fourPlayerSquares;
  } else {
    state.legalTargets = Object.entries(state.board)
      .filter(([, piece]) => hostilePiece(state, piece) && piece.type !== "king")
      .map(([square]) => square);
  }
  state.pending = { godId: state.selectedGod!, abilityId, step: "target" };
  state.notice = `Choose a target for ${abilityId}.`;
};

const activateAbility = (state: FourPlayerState, abilityId: string) => {
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
      ability.kind === "target" ||
      ability.kind === "revive" ||
      ability.kind === "sacrifice" ||
      ["enchant", "march-home"].includes(abilityId)
    )
  ) {
    state.notice = "A Lured piece must move closer to its luring Queen if possible.";
    return;
  }
  if (!payCost(state, abilityId)) {
    state.notice = "You do not have enough orbs for that ability.";
    return;
  }
  state.selectedAbility = abilityId;
  state.selectedSquare = undefined;
  state.legalTargets = [];
  state.legalSeats = [];
  state.pending = { godId: god.id, abilityId, step: "source" };
  if (abilityId === "enchant") {
    state.pending.step = "enchant-enemy-move";
    state.legalTargets = movableSourceSquares(state);
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
    state.notice = `Stone Gaze will affect ${targets.length} pieces. Confirm to continue.`;
    return;
  }
  if (ability.kind === "target") {
    startTargetAbility(state, abilityId);
    return;
  }
  if (ability.kind === "revive") {
    const bishops = Object.values(state.board)
      .some((piece) => piece.controller === state.activeSeat && piece.type === "bishop");
    if (!bishops || !activePlayer(state).graveyard.length) {
      refundCost(state);
      state.selectedAbility = undefined;
      state.pending = undefined;
      state.notice = bishops ? "Your graveyard is empty." : "Resurrect requires a living Bishop.";
      return;
    }
    state.pending.step = "grave";
    state.notice = "Choose a piece from your graveyard.";
    return;
  }
  if (abilityId === "monument") {
    const needed = 4 - currentLevel(state, abilityId);
    const pawns = Object.entries(state.board)
      .filter(([, piece]) => piece.controller === state.activeSeat && piece.type === "pawn");
    if (pawns.length < needed) {
      refundCost(state);
      state.selectedAbility = undefined;
      state.pending = undefined;
      state.notice = `Monument requires ${needed} pawns.`;
      return;
    }
    state.pending = { ...state.pending, step: "monument-sacrifice", selected: [] };
    state.legalTargets = pawns.map(([square]) => square);
    state.notice = `Choose ${needed} pawns to sacrifice.`;
    return;
  }
  if (abilityId === "hex") {
    const capacity = currentLevel(state, abilityId);
    const existing = Object.values(state.board)
      .filter((piece) => piece.status.hexedBy === state.activeSeat).length;
    if (!existing) {
      state.pending = { ...state.pending, step: "hex-target", selected: [] };
      state.legalTargets = Object.entries(state.board)
        .filter(([, piece]) =>
          hostilePiece(state, piece) &&
          piece.controller !== null &&
          !state.players[piece.controller].eliminated &&
          !piece.status.hexedBy
        )
        .map(([square]) => square);
      state.notice = `Choose up to ${capacity} hostile pieces to hex.`;
      if (!state.legalTargets.length) enterHexMovement(state);
      return;
    }
    enterHexMovement(state);
    return;
  }
  if (abilityId === "march-home") {
    const king = Object.entries(state.board)
      .find(([, piece]) => piece.controller === state.activeSeat && piece.type === "king");
    if (!king) return;
    state.pending.source = king[0];
    if (currentLevel(state, abilityId) === 1) {
      state.pending.step = "confirm-march-home";
      state.legalTargets = [homeSquares(king[1].owner)[4]];
      state.notice = "Confirm March Home.";
    } else {
      const [kingFile, kingRank] = fourPlayerCoords(king[0]);
      const [homeFile, homeRank] = fourPlayerCoords(homeSquares(king[1].owner)[4]);
      state.pending.step = "march-companions";
      state.pending.selected = [];
      state.legalTargets = fourPlayerAdjacentSquares(king[0])
        .filter((square) => {
          const [file, rank] = fourPlayerCoords(square);
          return (
            alliedPiece(state, state.board[square]) &&
            Boolean(fourPlayerSquareAt(file + homeFile - kingFile, rank + homeRank - kingRank))
          );
        });
      state.notice = "Choose companions, then pass to teleport.";
    }
    return;
  }
  state.notice = `Choose a piece for ${ability.name}.`;
};

const bananaPlacementTargets = (
  state: FourPlayerState,
  center: Square,
) => fourPlayerAdjacentSquares(center, false).filter(
  (square) =>
    !state.board[square] &&
    !state.bananas.some((banana) => banana.square === square),
);

const safeBananaPlacementsAfterMove = (
  state: FourPlayerState,
  from: Square,
  requestedTo: Square,
) => {
  const moving = state.board[from];
  if (!moving?.controller) return { destination: requestedTo, placements: [] as Square[] };
  const peel = bananaOnPath(state, from, requestedTo, moving.controller);
  const destination = peel ?? requestedTo;
  const simulated = fourPlayerApplyMove(
    state.board,
    { from, to: destination },
    state.enPassant,
  ).board;
  const remaining = peel
    ? state.bananas.filter((banana) => banana.square !== peel)
    : state.bananas;
  return {
    destination,
    placements: fourPlayerAdjacentSquares(destination, false).filter((placement) =>
      !simulated[placement] &&
      !remaining.some((banana) => banana.square === placement) &&
      !fourPlayerIsInCheck(
        simulated,
        state.activeSeat,
        state.config,
        [...remaining, { square: placement, owner: state.activeSeat, expires: "god" }],
      )
    ),
  };
};

const hostileControllersAdjacentTo = (state: FourPlayerState, square: Square) =>
  [...new Set(fourPlayerAdjacentSquares(square)
    .map((adjacent) => state.board[adjacent]?.controller)
    .filter((seat): seat is Seat =>
      Boolean(seat && seatsAreHostile(state.config, state.activeSeat, seat))
    ))];

const mountPlacementTargets = (
  state: FourPlayerState,
  riderSquare: Square,
  knightDestination: Square,
) => {
  const rider = state.board[riderSquare];
  if (!rider) return [];
  return fourPlayerAdjacentSquares(knightDestination, false)
    .filter((target) => {
      if (state.board[target]) return false;
      const simulated = { ...state.board };
      delete simulated[riderSquare];
      simulated[target] = rider;
      return !fourPlayerIsInCheck(
        simulated,
        state.activeSeat,
        state.config,
        state.bananas,
      );
    });
};

const resolveMoveEffect = (
  state: FourPlayerState,
  abilityId: string,
  from: Square,
  to: Square,
  moving: FourPlayerPiece,
  captured?: FourPlayerPiece,
  boardBefore?: Record<Square, FourPlayerPiece>,
) => {
  const level = currentLevel(state, abilityId);
  const [fromFile, fromRank] = fourPlayerCoords(from);
  const [toFile, toRank] = fourPlayerCoords(to);
  const [forwardFile, forwardRank] = forwardDirection(moving.owner);
  if (abilityId === "flight") {
    const snake = qualifyingSnake(
      to,
      (square) => Boolean(state.board[square]),
      (square) => {
        const orthogonal = new Set(fourPlayerAdjacentSquares(square, false));
        return fourPlayerAdjacentSquares(square)
          .filter((neighbor) => !orthogonal.has(neighbor));
      },
      (square) => fourPlayerAdjacentSquares(square, false),
    );
    for (const affinity of ["light", "dark"] as OrbAffinity[]) {
      const matching = snake.filter((square) =>
        state.board[square].orbAffinity === affinity
      ).length;
      const reward = level >= 3 ? matching : Number(matching > 0);
      addAffinityOrb(state, state.activeSeat, affinity, reward);
    }
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
      state.notice = "Slither: choose one extra light or dark orb.";
      return "pending";
    }
  } else if (abilityId === "gallop") {
    if (moving.type === "knight") addOrbs(state, state.activeSeat, level, 0);
    if (captured) addOrbs(state, state.activeSeat, 0, level + 1);
  } else if (abilityId === "mount") {
    const riders = fourPlayerAdjacentSquares(from, false)
      .filter((square) =>
        alliedPiece(state, state.board[square]) &&
        mountPlacementTargets(state, square, to).length > 0
      );
    const destinations = fourPlayerAdjacentSquares(to, false)
      .filter((square) => !state.board[square]);
    if (riders.length && destinations.length) {
      state.pending = {
        godId: state.selectedGod!,
        abilityId,
        step: "mount-rider",
        source: from,
        destination: to,
        selected: [],
      };
      state.legalTargets = riders;
      state.notice = `Mount: choose up to ${level} riders, or pass.`;
      return "pending";
    }
  } else if (abilityId === "charge") {
    if (level >= 2) {
      for (const piece of Object.values(state.board)) {
        if (piece.controller === state.activeSeat && piece.type === "knight") {
          piece.status.chargeUntil = level >= 3 ? "god" : 2;
        }
      }
    }
  } else if (abilityId === "construction") {
    if (fourPlayerDistance(from, to) === 1) addOrbs(state, state.activeSeat, 0, 1);
    if (level >= 2 && moving.type === "pawn") addOrbs(state, state.activeSeat, 0, 1);
    if (level >= 3 && moving.type === "rook") addOrbs(state, state.activeSeat, 0, 1);
  } else if (abilityId === "harden") {
    state.board[to].status.hardened = 2;
  } else if (abilityId === "resonance") {
    const neighbors = fourPlayerAdjacentSquares(to)
      .map((square) => ({ square, piece: state.board[square] }))
      .filter((entry): entry is { square: Square; piece: FourPlayerPiece } => Boolean(entry.piece));
    const orthogonal = neighbors.filter(({ square }) => {
      const [file, rank] = fourPlayerCoords(square);
      return file === toFile || rank === toRank;
    });
    for (const affinity of ["light", "dark"] as OrbAffinity[]) {
      const orthogonalCount = orthogonal.filter(({ piece }) => piece.orbAffinity === affinity).length;
      const reward = level === 1
        ? Math.floor(orthogonalCount / 2)
        : neighbors.filter(({ piece }) => piece.orbAffinity === affinity).length +
          (level >= 3 ? Math.floor(orthogonalCount / 2) : 0);
      addAffinityOrb(state, state.activeSeat, affinity, reward);
    }
  } else if (abilityId === "take-cover") {
    const coverSquares = [
      fourPlayerSquareAt(toFile + forwardFile, toRank + forwardRank),
      ...(level >= 2
        ? [
          fourPlayerSquareAt(toFile + forwardFile - forwardRank, toRank + forwardRank + forwardFile),
          fourPlayerSquareAt(toFile + forwardFile + forwardRank, toRank + forwardRank - forwardFile),
        ]
        : []),
    ].filter((square): square is Square => Boolean(square));
    const cover = coverSquares.filter((square) => alliedPiece(state, state.board[square])).length;
    if (cover) addOrbs(state, state.activeSeat, level >= 3 ? cover : 1, 0);
    if (captured) addOrbs(state, state.activeSeat, 0, 2);
  } else if (abilityId === "snipe") {
    state.board[to].status.prepared = { owner: state.activeSeat, level: level as 1 | 2 | 3 };
  } else if (abilityId === "ritual-sacrifice") {
    state.board[to].status.ritual = {
      owner: state.activeSeat,
      expires: level >= 2 ? "kangus" : state.hostileTurns[state.activeSeat] + 1,
    };
  } else if (abilityId === "banana-peel") {
    state.pending = {
      godId: state.selectedGod!,
      abilityId,
      step: "banana",
      movedPieceId: moving.id,
    };
    state.legalTargets = bananaPlacementTargets(state, to)
      .filter((placement) =>
        !fourPlayerIsInCheck(
          state.board,
          state.activeSeat,
          state.config,
          [...state.bananas, { square: placement, owner: state.activeSeat, expires: "god" }],
        )
      );
    state.notice = "Place the banana on an adjacent empty square.";
    return "pending";
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
      addOrbs(state, state.activeSeat, 0, 1);
    }
    const projection = (toFile - fromFile) * forwardFile + (toRank - fromRank) * forwardRank;
    const sideways = projection === 0;
    if (projection < 0 || (level >= 3 && sideways)) addOrbs(state, state.activeSeat, 1, 0);
  } else if (abilityId === "captivate") {
    const original = boardBefore ?? state.board;
    const beforeQueens = Object.entries(original)
      .filter(([square, piece]) =>
        piece.type === "queen" && fourPlayerLineOfSight(original, from, square)
      );
    const afterQueens = Object.entries(state.board)
      .filter(([square, piece]) =>
        piece.type === "queen" && fourPlayerLineOfSight(state.board, to, square)
      );
    for (const [, queen] of afterQueens) {
      const entered = !beforeQueens.some(([, before]) => before.id === queen.id);
      addAffinityOrb(state, state.activeSeat, queen.orbAffinity, entered && level >= 2 ? level : 1);
    }
  } else if (abilityId === "hex") {
    const hexed = Object.entries(state.board)
      .filter(([, piece]) => piece.status.hexedBy === state.activeSeat)
      .slice(0, level);
    const aligned = hexed.filter(([square]) => {
      const [file, rank] = fourPlayerCoords(square);
      return file === toFile || rank === toRank;
    }).length;
    if (aligned) addAffinityOrb(state, state.activeSeat, fourPlayerSquareAffinity(to), aligned + 1);
  } else if (abilityId === "barter") {
    const seats = hostileControllersAdjacentTo(state, to);
    if (
      seats.length &&
      (activePlayer(state).orbs.light > 0 || activePlayer(state).orbs.dark > 0)
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
    state.legalTargets = fourPlayerAdjacentSquares(to).filter((square) => {
      const target = state.board[square];
      return hostilePiece(state, target) &&
        target.type !== "king" &&
        allowedEnchantTypes(level).includes(target.type);
    });
    if (state.legalTargets.length) {
      state.notice = "Choose an adjacent hostile piece to hire.";
      return "pending";
    }
  } else if (abilityId === "threaten") {
    const attacked = fourPlayerOrdinaryAttackedSquares(
      state.board,
      to,
      state.config,
    ).filter((square) => hostilePiece(state, state.board[square])).length;
    if (attacked) addOrbs(state, state.activeSeat, 0, level >= 3 ? attacked : 1);
    const advancement = (square: Square, piece: FourPlayerPiece) => {
      const [file, rank] = fourPlayerCoords(square);
      const [pieceForwardFile, pieceForwardRank] = forwardDirection(piece.owner);
      return file * pieceForwardFile + rank * pieceForwardRank;
    };
    const values = Object.entries(state.board)
      .filter(([, piece]) => piece.controller === state.activeSeat)
      .map(([square, piece]) => advancement(square, piece));
    const lead = Math.max(...values);
    const tied = values.filter((value) => value === lead).length;
    if (advancement(to, state.board[to]) === lead && (level >= 2 || tied === 1)) {
      addOrbs(state, state.activeSeat, level >= 2 && tied === 1 ? 2 : 1, 0);
    }
  } else if (abilityId === "cull-the-weak") {
    const attacked = fourPlayerOrdinaryAttackedSquares(
      state.board,
      to,
      state.config,
    ).filter((square) => hostilePiece(state, state.board[square]));
    if (attacked.length >= 2) {
      const lowest = Math.min(...attacked.map((square) => fourPlayerPieceValue(state.board[square].type)));
      const choices = attacked.filter((square) => {
        const type = state.board[square].type;
        return fourPlayerPieceValue(type) === lowest ||
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
        state.legalTargets = choices;
        state.notice = "Choose the Cull target.";
        return "pending";
      }
    }
  }
  return undefined;
};

const executeEscort = (
  state: FourPlayerState,
  from: Square,
  to: Square,
) => {
  const plan = escortPlan(state, from, to);
  if (!plan) return;
  const king = state.board[from];
  for (const landing of plan.landings) delete state.board[landing.from];
  for (const landing of plan.landings) {
    if (state.board[landing.to]) captureAt(state, landing.to);
    state.board[landing.to] = {
      ...landing.piece,
      hasMoved: true,
      status: { ...landing.piece.status, movedThisTurn: true },
    };
  }
  if (plan.slippedOn) {
    state.bananas = state.bananas.filter((banana) => banana.square !== plan.slippedOn);
  }
  finishTurn(
    state,
    abilityDescription(state, `: ${pieceName(king)} at ${from} -> ${plan.kingDestination}`),
  );
};

const executeMarchHome = (
  state: FourPlayerState,
  kingSquare: Square,
  companionSquares: Square[],
) => {
  const king = state.board[kingSquare];
  if (!king) return;
  const destination = homeSquares(king.owner)[4];
  const [fromFile, fromRank] = fourPlayerCoords(kingSquare);
  const [toFile, toRank] = fourPlayerCoords(destination);
  const companions = companionSquares
    .map((square) => ({ square, piece: state.board[square] }))
    .filter((entry): entry is { square: Square; piece: FourPlayerPiece } => Boolean(entry.piece));
  if (companions.some(({ square }) => square === destination)) {
    state.notice = "March Home cannot bring a companion from the King's destination.";
    return;
  }
  const landings = [
    { from: kingSquare, to: destination, piece: king },
    ...companions.flatMap(({ square, piece }) => {
      const [file, rank] = fourPlayerCoords(square);
      const target = fourPlayerSquareAt(file + toFile - fromFile, rank + toRank - fromRank);
      return target ? [{ from: square, to: target, piece }] : [];
    }),
  ];
  if (landings.length !== companions.length + 1) {
    state.notice = "A March Home companion has no valid destination.";
    return;
  }
  const movingSources = new Set(landings.map((landing) => landing.from));
  for (const landing of landings) {
    const occupant = state.board[landing.to];
    if (
      occupant &&
      !movingSources.has(landing.to) &&
      (occupant.status.hardened || occupant.type === "king")
    ) {
      state.notice = "March Home cannot replace a hardened piece.";
      return;
    }
  }
  const simulated = structuredClone(state.board);
  for (const landing of landings) delete simulated[landing.from];
  for (const landing of landings) {
    delete simulated[landing.to];
    simulated[landing.to] = landing.piece;
  }
  if (fourPlayerIsInCheck(simulated, state.activeSeat, state.config, state.bananas)) {
    state.notice = "March Home would leave your King in check.";
    return;
  }
  for (const landing of landings) {
    if (
      state.board[landing.to] &&
      !movingSources.has(landing.to) &&
      !captureAt(state, landing.to, true)
    ) {
      state.notice = "March Home could not clear a destination.";
      return;
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
  finishTurn(
    state,
    abilityDescription(state, `: ${pieceName(king)} returned to ${destination}`),
  );
};

const executeMovement = (
  state: FourPlayerState,
  from: Square,
  to: Square,
) => {
  const abilityId = state.selectedAbility!;
  const moving = state.board[from];
  if (!moving) return;
  if (state.pending?.step === "enchant-followup-move") {
    const result = moveDirect(state, from, to);
    if (!result) return;
    const movedPiece = state.board[result.to];
    if (!movedPiece) return;
    delete movedPiece.status.luredBy;
    finishTurn(
      state,
      abilityDescription(
        state,
        `: enchanted a hostile piece, then moved ${pieceName(moving)} at ${from} -> ${result.to}`,
      ),
    );
    return;
  }
  if (abilityId === "escort") {
    executeEscort(state, from, to);
    return;
  }
  if (abilityId === "stealth") {
    delete state.board[from];
    state.stealth[state.activeSeat].push({
      piece: moving,
      destination: to,
      returnOnTurn: state.seatTurns[state.activeSeat] + 1,
    });
    finishTurn(state, abilityDescription(state, `: ${pieceName(moving)} entered stealth toward ${to}`));
    return;
  }
  if (
    abilityId === "military-funding" &&
    currentLevel(state, abilityId) >= 2 &&
    (state.pending?.selected?.filter((id) => id !== "__no-repeat").length ?? 0) >= 1
  ) {
    if (activePlayer(state).orbs.light < 1) {
      state.notice = "Military Funding requires 1 light orb for each move after the first.";
      return;
    }
    addOrbs(state, state.activeSeat, -1, 0);
  }
  const enchantingEnemy = state.pending?.step === "enchant-enemy-move";
  const originalController = moving.controller;
  if (enchantingEnemy) moving.controller = state.activeSeat;
  const boardBefore = structuredClone(state.board);
  const result = moveDirect(state, from, to, abilityId === "air-lift");
  if (!result) {
    if (enchantingEnemy) moving.controller = originalController;
    return;
  }
  if (enchantingEnemy) state.board[result.to].controller = originalController;
  if (moving.status.hardened && !result.captured) delete state.board[result.to].status.hardened;
  delete state.board[result.to].status.luredBy;
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
      finishTurn(
        state,
        abilityDescription(state, ": completed Enchant without an available follow-up move"),
      );
      return;
    }
    state.notice = "Enchant: choose one of your highlighted pieces, then make one ordinary legal move.";
    return;
  }
  if (abilityId === "slither") {
    const unlimited = currentLevel(state, abilityId) >= 3;
    const remaining = unlimited
      ? -1
      : (state.pending?.movesRemaining ?? currentLevel(state, abilityId) + 1) - 1;
    if (unlimited || remaining > 0) {
      state.pending = {
        godId: state.selectedGod!,
        abilityId,
        step: "slither",
        source: result.to,
        movedPieceId: moving.id,
        movesRemaining: remaining,
      };
      state.selectedSquare = result.to;
      state.legalTargets = fourPlayerLegalTargets(state.board, result.to, state.config, {
        forceType: "bishop",
        noCapture: true,
        bananas: state.bananas,
      });
      state.notice = unlimited
        ? "Serpentine Step may continue; pass to stop."
        : `Serpentine Step has ${remaining} moves remaining.`;
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
      : activePlayer(state).orbs.light > 0;
    if (canContinue) {
      state.pending = { godId: state.selectedGod!, abilityId, step: "funding", selected };
      state.selectedSquare = undefined;
      state.legalTargets = [];
      state.notice = level === 1
        ? "Move a second pawn."
        : "Move another pawn for 1 light orb, or pass.";
      return;
    }
  }
  const pending = resolveMoveEffect(
    state,
    abilityId,
    result.from,
    result.to,
    moving,
    result.captured,
    boardBefore,
  );
  if (pending === "pending") return;
  finishTurn(
    state,
    abilityDescription(state, `: ${pieceName(moving)} at ${from} -> ${result.to}`),
  );
};

const resolveRage = (
  state: FourPlayerState,
  center: Square,
  spareAllies: boolean,
) => {
  for (const square of fourPlayerAdjacentSquares(center)) {
    const victim = state.board[square];
    if (
      !victim ||
      (
        spareAllies &&
        victim.controller &&
        seatsAreAllies(state.config, state.activeSeat, victim.controller)
      )
    ) continue;
    captureAt(state, square, true);
    if (state.phase === "gameover" || state.players[state.activeSeat].eliminated) break;
  }
};

const chooseTarget = (state: FourPlayerState, square: Square) => {
  const abilityId = state.selectedAbility!;
  const level = currentLevel(state, abilityId);
  const piece = state.board[square];
  if (abilityId === "lure" && piece) {
    piece.status.luredBy = state.activeSeat;
  } else if (abilityId === "poison-cloud") {
    if (level === 1 && piece) {
      piece.status.poisoned = "god";
      piece.status.poisonedBy = state.activeSeat;
    } else {
      const [file, rank] = fourPlayerCoords(square);
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
        .map(([fileOffset, rankOffset]) => fourPlayerSquareAt(file + fileOffset, rank + rankOffset))
        .filter((target): target is Square => Boolean(target));
      state.notice = "Choose the opposite corner of the poison area.";
      return;
    }
  } else if (abilityId === "polymorph" && piece) {
    piece.status.polymorphed = level >= 3 ? "god" : level + 1;
  } else if (abilityId === "rage") {
    if (level >= 2) {
      state.pending = {
        godId: state.selectedGod!,
        abilityId,
        step: "rage-choice",
        destination: square,
      };
      state.legalTargets = [];
      state.notice = "Choose whether Rage spares allied pieces.";
      return;
    }
    resolveRage(state, square, false);
  }
  finishTurn(
    state,
    abilityDescription(state, piece ? ` on ${pieceName(piece)} at ${square}` : ` on ${square}`),
  );
};

const chooseGravePiece = (state: FourPlayerState, pieceId: string) => {
  const grave = activePlayer(state).graveyard.find((entry) => entry.piece.id === pieceId);
  if (!grave) return;
  const bishops = Object.entries(state.board)
    .filter(([, piece]) => piece.controller === state.activeSeat && piece.type === "bishop")
    .map(([square]) => square);
  if (!bishops.length) return;
  state.pending = { ...state.pending!, step: "revive-place", movedPieceId: pieceId };
  state.legalTargets = [...new Set(bishops.flatMap((square) => fourPlayerAdjacentSquares(square)))]
    .filter((square) => {
      const occupant = state.board[square];
      if (!occupant) return true;
      return (
        currentLevel(state, "resurrect") >= 3 &&
        !occupant.status.hardened &&
        hostilePiece(state, occupant)
      );
    });
  state.notice = "Choose a square adjacent to a controlled Bishop.";
};

const completeSpecialTarget = (state: FourPlayerState, square: Square) => {
  const pending = state.pending!;
  const abilityId = pending.abilityId;
  if (pending.step === "banana") {
    const level = currentLevel(state, abilityId);
    state.bananas.push({
      square,
      owner: state.activeSeat,
      expires: level >= 3
        ? "god"
        : level === 2
          ? "kangus"
          : state.hostileTurns[state.activeSeat] + 1,
    });
    finishTurn(state, abilityDescription(state, `: placed a banana on ${square}`));
  } else if (pending.step === "hire") {
    const target = state.board[square];
    if (!target?.controller) return;
    const previousController = target.controller;
    const extra = target.type === "rook" ? 1 : target.type === "queen" ? 2 : 0;
    if (activePlayer(state).orbs.dark < extra) return;
    addOrbs(state, state.activeSeat, 0, -extra);
    addOrbs(state, previousController, 0, 4 + extra);
    target.controller = state.activeSeat;
    target.status.hired = true;
    finishTurn(state, abilityDescription(state, `: hired the ${target.type} on ${square}`));
  } else if (pending.step === "revive-place" && pending.movedPieceId) {
    const graveyard = activePlayer(state).graveyard;
    const index = graveyard.findIndex((entry) => entry.piece.id === pending.movedPieceId);
    if (index < 0) return;
    if (state.board[square] && !captureAt(state, square)) {
      state.notice = "Resurrect cannot replace that piece.";
      return;
    }
    const [grave] = graveyard.splice(index, 1);
    state.board[square] = {
      ...grave.piece,
      controller: state.activeSeat,
      hasMoved: true,
      status: {},
    };
    if (
      currentLevel(state, abilityId) >= 2 &&
      !pending.selected?.length &&
      graveyard.length
    ) {
      state.pending = {
        ...pending,
        step: "resurrect-more",
        movedPieceId: undefined,
        selected: [grave.piece.id],
      };
      state.legalTargets = [];
      state.notice = "Spend 2 additional light orbs to revive a second piece, or finish.";
      return;
    }
    finishTurn(state, abilityDescription(state, `: revived ${grave.piece.type} on ${square}`));
  } else if (pending.step === "monument-sacrifice") {
    const needed = 4 - currentLevel(state, abilityId);
    const selected = [...(pending.selected ?? []), square];
    if (selected.length < needed) {
      state.pending = { ...pending, selected };
      state.legalTargets = state.legalTargets.filter((target) => target !== square);
      state.notice = `Choose ${needed - selected.length} more pawns.`;
      return;
    }
    state.pending = { ...pending, step: "monument-base", selected };
    state.legalTargets = selected.filter((base) => {
      const simulated = structuredClone(state.board);
      for (const pawnSquare of selected) delete simulated[pawnSquare];
      const config = state.config.seats[state.activeSeat];
      simulated[base] = {
        id: `${state.activeSeat}-monument-preview`,
        type: "rook",
        owner: state.activeSeat,
        controller: state.activeSeat,
        displayColor: config.displayColor,
        orbAffinity: config.orbAffinity,
        hasMoved: true,
        status: {},
      };
      return !fourPlayerIsInCheck(
        simulated,
        state.activeSeat,
        state.config,
        state.bananas,
      );
    });
    state.notice = state.legalTargets.length
      ? "Choose which sacrificed square receives the rook."
      : "Those sacrifices would leave your King in check. Cancel and choose another ability.";
  } else if (pending.step === "monument-base") {
    const selected = pending.selected ?? [];
    if (!selected.includes(square)) return;
    for (const pawnSquare of selected) {
      const pawn = state.board[pawnSquare];
      if (!pawn) continue;
      delete state.board[pawnSquare];
      sendToGraveyard(state, pawn, pawnSquare);
    }
    const config = state.config.seats[state.activeSeat];
    state.board[square] = {
      id: `${state.activeSeat}-monument-${state.turn}`,
      type: "rook",
      owner: state.activeSeat,
      controller: state.activeSeat,
      displayColor: config.displayColor,
      orbAffinity: config.orbAffinity,
      hasMoved: true,
      status: {},
    };
    finishTurn(state, abilityDescription(state, `: raised a rook on ${square}`));
  }
};

const handleSquare = (state: FourPlayerState, square: Square) => {
  if (["confirm-stone-gaze", "confirm-march-home"].includes(state.pending?.step ?? "")) return;
  if (state.pending?.abilityId === "harden-choice") {
    if (state.pending.step === "harden-choice" && state.legalTargets.includes(square)) {
      state.pending = { ...state.pending, step: "harden-decision", source: square };
      state.legalTargets = [];
      state.notice = "Remove Harden now, or keep it until Anubis is selected.";
    }
    return;
  }
  if (state.pending?.abilityId === "snipe-shot") {
    if (state.pending.step === "snipe-source" && state.legalTargets.includes(square)) {
      state.selectedSquare = square;
      state.pending.step = "snipe-target";
      state.legalTargets = preparedShotTargets(state, square);
      state.notice = "Choose a hostile attacked piece.";
    } else if (
      state.pending.step === "snipe-target" &&
      state.selectedSquare &&
      state.legalTargets.includes(square)
    ) {
      const prepared = state.board[state.selectedSquare];
      if (!captureAt(state, square)) return;
      if (prepared) delete prepared.status.prepared;
      state.pending = undefined;
      state.selectedSquare = undefined;
      state.legalTargets = [];
      if (state.phase !== "gameover" && !queuePreparedShot(state)) {
        state.notice = `${name(state.activeSeat)} to act. Choose an available God.`;
      }
    }
    return;
  }
  if (state.pending?.abilityId === "air-strike") {
    if (state.pending.step === "source") {
      if (!sourceIsAllowed(state, square)) return;
      const passengers = airStrikePassengerSquares(state, square)
        .filter((passenger) => airStrikeLandingTargets(state, square, passenger).length);
      state.pending = { ...state.pending, step: "air-strike-passenger", source: square };
      state.selectedSquare = square;
      state.legalTargets = passengers;
      state.notice = "Choose an adjacent passenger.";
    } else if (
      state.pending.step === "air-strike-passenger" &&
      state.pending.source &&
      state.legalTargets.includes(square)
    ) {
      const carrierSource = state.pending.source;
      state.pending = {
        ...state.pending,
        step: "air-strike-destination",
        selected: [square],
        movedPieceId: state.board[square]?.id,
      };
      state.legalTargets = airStrikeLandingTargets(state, carrierSource, square);
      state.notice = "Choose the carrier destination.";
    } else if (
      state.pending.step === "air-strike-destination" &&
      state.pending.source &&
      state.pending.selected?.[0] &&
      state.legalTargets.includes(square)
    ) {
      const carrierSource = state.pending.source;
      const passengerSquare = state.pending.selected[0];
      state.pending = { ...state.pending, step: "air-strike-drop", destination: square };
      state.legalTargets = airStrikeDropTargets(
        state,
        carrierSource,
        square,
        passengerSquare,
      );
      state.notice = "Choose the passenger drop square.";
    } else if (
      state.pending.step === "air-strike-drop" &&
      state.pending.source &&
      state.pending.destination &&
      state.pending.selected?.[0] &&
      state.legalTargets.includes(square)
    ) {
      const passengerSquare = state.pending.selected[0];
      const passenger = state.board[passengerSquare];
      if (!passenger) return;
      delete state.board[passengerSquare];
      const result = moveDirect(state, state.pending.source, state.pending.destination);
      if (!result) return;
      if (state.board[square]) captureAt(state, square);
      state.board[square] = {
        ...passenger,
        hasMoved: true,
        status: { ...passenger.status, movedThisTurn: true },
      };
      finishTurn(
        state,
        abilityDescription(state, `: landed on ${result.to} and dropped ${pieceName(passenger)} on ${square}`),
      );
    }
    return;
  }
  if (state.pending?.step === "march-companions") {
    if (!state.legalTargets.includes(square)) return;
    const selected = [...(state.pending.selected ?? []), square];
    state.pending = { ...state.pending, selected };
    state.legalTargets = state.legalTargets.filter((target) => target !== square);
    state.notice = `${selected.length} companions selected; choose more or pass.`;
    return;
  }
  if (state.pending?.step === "rage-source") {
    if (!state.legalTargets.includes(square)) return;
    state.selectedSquare = square;
    state.pending = { ...state.pending, step: "rage-destination", source: square };
    state.legalTargets = [
      square,
      ...fourPlayerLegalTargets(state.board, square, state.config, {
        enPassant: state.enPassant,
        bananas: state.bananas,
      }).filter((target) => fourPlayerDistance(square, target) === 1),
    ];
    state.notice = "Move up to one legal space, or keep the current square.";
    return;
  }
  if (state.pending?.step === "rage-destination" && state.pending.source) {
    if (!state.legalTargets.includes(square)) return;
    let center = state.pending.source;
    if (square !== center) center = moveDirect(state, center, square)?.to ?? center;
    state.selectedSquare = undefined;
    state.pending = { ...state.pending, step: "rage-choice", destination: center };
    state.legalTargets = [];
    state.notice = "Choose whether allied pieces are spared.";
    return;
  }
  if (state.pending?.step === "poison-area" && state.pending.source) {
    if (!state.legalTargets.includes(square)) return;
    const [firstFile, firstRank] = fourPlayerCoords(state.pending.source);
    const [secondFile, secondRank] = fourPlayerCoords(square);
    for (let file = Math.min(firstFile, secondFile); file <= Math.max(firstFile, secondFile); file += 1) {
      for (let rank = Math.min(firstRank, secondRank); rank <= Math.max(firstRank, secondRank); rank += 1) {
        const target = fourPlayerSquareAt(file, rank);
        const piece = target ? state.board[target] : undefined;
        if (piece && hostilePiece(state, piece)) {
          piece.status.poisoned = "god";
          piece.status.poisonedBy = state.activeSeat;
        }
      }
    }
    finishTurn(state, abilityDescription(state, " across the selected area"));
    return;
  }
  if (state.pending?.step === "cull-choice" && state.pending.movedPieceId) {
    if (!state.legalTargets.includes(square)) return;
    const attackerSquare = findSquareById(state, state.pending.movedPieceId);
    if (!attackerSquare) return;
    const attacked = fourPlayerOrdinaryAttackedSquares(
      state.board,
      attackerSquare,
      state.config,
    ).filter((target) => hostilePiece(state, state.board[target]));
    const lowest = Math.min(...attacked.map((target) => fourPlayerPieceValue(state.board[target].type)));
    if (fourPlayerPieceValue(state.board[square].type) === lowest) captureAt(state, square);
    else moveDirect(state, attackerSquare, square);
    finishTurn(state, abilityDescription(state, ` on ${square}`));
    return;
  }
  if (state.pending?.step === "mount-rider" && state.pending.destination) {
    if (!state.legalTargets.includes(square) || !state.board[square]) return;
    const destination = state.pending.destination;
    state.pending = {
      ...state.pending,
      step: "mount-place",
      movedPieceId: state.board[square].id,
    };
    state.legalTargets = mountPlacementTargets(state, square, destination);
    state.notice = "Choose the rider's dismount square.";
    return;
  }
  if (
    state.pending?.step === "mount-place" &&
    state.pending.destination &&
    state.pending.movedPieceId
  ) {
    if (!state.legalTargets.includes(square)) return;
    const riderSquare = findSquareById(state, state.pending.movedPieceId);
    if (!riderSquare) return;
    const rider = state.board[riderSquare];
    delete state.board[riderSquare];
    state.board[square] = { ...rider, hasMoved: true };
    const selected = [...(state.pending.selected ?? []), rider.id];
    const remaining = fourPlayerAdjacentSquares(state.pending.source!, false)
      .filter((target) => {
        const piece = state.board[target];
        return (
          alliedPiece(state, piece) &&
          !selected.includes(piece.id) &&
          mountPlacementTargets(state, target, state.pending!.destination!).length > 0
        );
      });
    const destinations = fourPlayerAdjacentSquares(state.pending.destination, false)
      .filter((target) => !state.board[target]);
    if (selected.length >= currentLevel(state, "mount") || !remaining.length || !destinations.length) {
      finishTurn(state, abilityDescription(state, `: moved with ${selected.length} riders`));
    } else {
      state.pending = {
        ...state.pending,
        step: "mount-rider",
        movedPieceId: undefined,
        selected,
      };
      state.legalTargets = remaining;
      state.notice = "Choose another rider, or pass.";
    }
    return;
  }
  if (state.pending?.step === "escort-companions" && state.pending.source) {
    if (!state.legalTargets.includes(square) || !state.board[square]) return;
    const kingSquare = state.pending.source;
    const selected = [...(state.pending.selected ?? []), state.board[square].id];
    if (currentLevel(state, "escort") === 1) {
      state.pending = { ...state.pending, step: "escort-move", selected };
      state.selectedSquare = kingSquare;
      state.legalTargets = sourceTargets(state, kingSquare);
      state.notice = "Choose the King's destination.";
      return;
    }
    state.pending = { ...state.pending, selected };
    state.legalTargets = state.legalTargets.filter((target) => target !== square);
    state.notice = "Choose more escorts, or pass.";
    return;
  }
  if (!state.selectedAbility || !state.pending) return;
  if (state.pending.step === "hex-target") {
    if (!state.legalTargets.includes(square) || !state.board[square]) return;
    state.board[square].status.hexedBy = state.activeSeat;
    const selected = [...(state.pending.selected ?? []), state.board[square].id];
    if (selected.length >= currentLevel(state, "hex")) {
      state.pending = { ...state.pending, selected };
      enterHexMovement(state);
    } else {
      state.pending = { ...state.pending, selected };
      state.legalTargets = state.legalTargets.filter((target) => target !== square);
      state.notice = "Choose another hex, or pass to move.";
    }
    return;
  }
  if (state.pending.step === "target") {
    if (state.legalTargets.includes(square)) chooseTarget(state, square);
    return;
  }
  if (["banana", "hire", "revive-place", "monument-base", "monument-sacrifice"].includes(state.pending.step)) {
    if (state.legalTargets.includes(square)) completeSpecialTarget(state, square);
    return;
  }
  if (state.selectedSquare) {
    if (state.legalTargets.includes(square)) {
      if (
        state.selectedAbility === "banana-peel" &&
        !safeBananaPlacementsAfterMove(state, state.selectedSquare, square).placements.length
      ) return;
      executeMovement(state, state.selectedSquare, square);
    } else if (
      !["slither", "escort-move"].includes(state.pending.step) &&
      sourceIsAllowed(state, square)
    ) {
      const targets = sourceTargets(state, square);
      if (!targets.length) return;
      state.selectedSquare = square;
      state.legalTargets = targets;
    }
    return;
  }
  if (sourceIsAllowed(state, square)) {
    if (state.selectedAbility === "escort" && state.pending.step === "source") {
      const companions = fourPlayerAdjacentSquares(square)
        .filter((target) => alliedPiece(state, state.board[target]));
      if (!companions.length) {
        state.notice = "Escort requires an adjacent allied piece.";
        return;
      }
      state.pending = {
        ...state.pending,
        step: "escort-companions",
        source: square,
        selected: [],
      };
      state.legalTargets = companions;
      state.notice = "Choose an escort.";
      return;
    }
    const targets = sourceTargets(state, square);
    if (!targets.length) {
      state.notice = "That piece has no legal destination for this ability.";
      return;
    }
    state.selectedSquare = square;
    state.legalTargets = targets;
    state.pending.source = square;
    state.notice = `Choose a destination for the ${state.board[square].type}.`;
  }
};

const selectGod = (state: FourPlayerState, godId: GodId) => {
  if (["snipe-shot", "harden-choice"].includes(state.pending?.abilityId ?? "")) return;
  if (state.pending?.step === "enchant-followup-move") return;
  if (!activePlayer(state).gods.includes(godId) || state.rested.includes(godId)) return;
  if (state.selectedAbility) refundCost(state);
  state.selectedGod = godId;
  state.selectedAbility = undefined;
  state.selectedSquare = undefined;
  state.pending = undefined;
  state.legalTargets = [];
  state.legalSeats = [];
  if (godId === "artemis") {
    for (const piece of Object.values(state.board)) {
      const prepared = preparedDetails(piece);
      if (prepared?.owner === state.activeSeat && prepared.level === 2) delete piece.status.prepared;
    }
  }
  for (const piece of Object.values(state.board)) {
    if (godId === "anubis" && piece.status.hardened === "god") delete piece.status.hardened;
    if (godId === "medusa" && piece.status.frozen === "god") delete piece.status.frozen;
    if (godId === "medusa" && piece.status.gazing) delete piece.status.gazing;
    if (godId === "salem") {
      if (piece.status.poisoned === "god") delete piece.status.poisoned;
      if (piece.status.polymorphed === "god") delete piece.status.polymorphed;
    }
    if (godId === "chiron" && piece.status.chargeUntil === "god") delete piece.status.chargeUntil;
    if (godId === "kangus" && piece.status.ritual?.expires === "kangus") delete piece.status.ritual;
  }
  if (godId === "kangus") {
    state.bananas = state.bananas.filter(
      (banana) => !(banana.owner === state.activeSeat && banana.expires === "kangus"),
    );
  }
  state.godTurns[state.activeSeat][godId] =
    (state.godTurns[state.activeSeat][godId] ?? 0) + 1;
  state.notice = `${GOD_BY_ID[godId].name} answers. Choose an ability.`;
};

const draftGod = (state: FourPlayerState, godId: GodId) => {
  if (!state.draft.available.includes(godId)) return;
  const seat = state.draft.order[state.draft.pickIndex];
  state.players[seat].gods.push(godId);
  state.draft.available = state.draft.available.filter((candidate) => candidate !== godId);
  state.draft.pickIndex += 1;
  if (state.draft.pickIndex >= state.draft.order.length) {
    state.phase = "play";
    state.activeSeat = state.turnOrder[0];
    state.notice = `${name(state.activeSeat)} takes the first turn.`;
  } else {
    state.activeSeat = state.draft.order[state.draft.pickIndex];
    state.notice = `${name(state.activeSeat)} chooses the next God.`;
  }
};

const upgradeAbility = (state: FourPlayerState, abilityId: string) => {
  const player = activePlayer(state);
  const godId = player.gods.find((candidate) =>
    GOD_BY_ID[candidate].abilities.some((ability) => ability.id === abilityId)
  );
  if (!godId) return;
  const current = player.upgrades[abilityId] ?? 1;
  if (current >= 3) return;
  player.upgrades[abilityId] = (current + 1) as 2 | 3;
  log(state, `${name(state.activeSeat)} upgraded ${abilityId} to level ${current + 1}.`);
  state.upgradeQueue.shift();
  normalizeUpgradeQueue(state);
  if (state.upgradeQueue.length) {
    state.activeSeat = state.upgradeQueue[0];
    state.notice = `${name(state.activeSeat)} upgrades one ability.`;
  } else {
    startNextRound(state);
  }
};

export const FOUR_PLAYER_SUPPORTED_ABILITIES = new Set([
  "flight",
  "air-lift",
  "air-strike",
  "gallop",
  "mount",
  "charge",
  "construction",
  "harden",
  "monument",
  "resonance",
  "lure",
  "enchant",
  "take-cover",
  "stealth",
  "snipe",
  "ritual-sacrifice",
  "banana-peel",
  "rage",
  "marked",
  "resurrect",
  "siphon",
  "royal-step",
  "march-home",
  "escort",
  "captivate",
  "slither",
  "stone-gaze",
  "hex",
  "poison-cloud",
  "polymorph",
  "barter",
  "military-funding",
  "leverage",
  "threaten",
  "pick-a-fight",
  "cull-the-weak",
]);

export const unsupportedFourPlayerAbilities = () =>
  GODS.flatMap((god) => god.abilities)
    .map((ability) => ability.id)
    .filter((abilityId) => !FOUR_PLAYER_SUPPORTED_ABILITIES.has(abilityId));

const availableAbilityActions = (state: FourPlayerState): FourPlayerAction[] => {
  if (!state.selectedGod) return [];
  const orbs = state.players[state.activeSeat].orbs;
  return GOD_BY_ID[state.selectedGod].abilities
    .filter((ability) =>
      orbs.light >= (ability.cost?.white ?? 0) &&
      orbs.dark >= (ability.cost?.black ?? 0)
    )
    .map((ability) => ({ type: "select-ability", abilityId: ability.id }));
};

const canPassAction = (state: FourPlayerState) =>
  state.pending?.abilityId === "snipe-shot" ||
  state.selectedAbility === "construction" ||
  state.selectedAbility === "marked" ||
  state.pending?.step === "slither" ||
  state.pending?.step === "mount-rider" ||
  state.pending?.step === "funding" ||
  state.pending?.step === "march-companions" ||
  state.pending?.step === "barter-orb" ||
  (state.pending?.step === "escort-companions" && Boolean(state.pending.selected?.length)) ||
  (state.pending?.step === "hex-target" && Boolean(state.pending.selected?.length));

export const availableFourPlayerActions = (
  state: FourPlayerState,
): FourPlayerAction[] => {
  if (state.phase === "draft") {
    return state.draft.available.map((godId) => ({ type: "draft", godId }));
  }
  if (state.phase === "upgrade") {
    return state.players[state.activeSeat].gods.flatMap((godId) =>
      GOD_BY_ID[godId].abilities
        .filter((ability) =>
          abilityLevel(state.players[state.activeSeat].upgrades, ability.id) < 3
        )
        .map((ability) => ({ type: "upgrade", abilityId: ability.id } as FourPlayerAction)),
    );
  }
  if (state.phase !== "play") return [];

  if (state.pending?.abilityId === "harden-choice") {
    if (state.pending.step === "harden-choice") {
      return state.legalTargets.map((square) => ({ type: "square", square }));
    }
    if (state.pending.step === "harden-decision") {
      return [{ type: "choice", value: true }, { type: "choice", value: false }];
    }
  }
  if (state.pending?.abilityId === "snipe-shot") {
    return [
      ...state.legalTargets.map((square) => ({ type: "square", square } as FourPlayerAction)),
      { type: "pass" },
    ];
  }
  if (state.pending?.step === "grave") {
    return state.players[state.activeSeat].graveyard
      .map(({ piece }) => ({ type: "grave", pieceId: piece.id }));
  }
  if (state.pending?.step === "siphon-seat" || state.pending?.step === "barter-seat") {
    return state.legalSeats.map((seat) => ({ type: "seat", seat }));
  }
  if (state.pending?.step === "siphon-amount") {
    return [2, 1, 0].map((amount) => ({ type: "amount", amount } as FourPlayerAction));
  }
  if (state.pending?.step === "barter-orb") {
    const orbs = state.players[state.activeSeat].orbs;
    return [
      ...(orbs.light > 0 ? [{ type: "orb", orb: "light" } as FourPlayerAction] : []),
      ...(orbs.dark > 0 ? [{ type: "orb", orb: "dark" } as FourPlayerAction] : []),
      { type: "orb" },
    ];
  }
  if (state.pending?.step === "slither-orb") {
    return [
      { type: "orb", orb: "light" },
      { type: "orb", orb: "dark" },
    ];
  }
  if (
    state.pending?.step === "rage-choice" ||
    state.pending?.step === "marked-choice" ||
    state.pending?.step === "resurrect-more"
  ) {
    return [{ type: "choice", value: true }, { type: "choice", value: false }];
  }
  if (
    state.pending?.step === "confirm-stone-gaze" ||
    state.pending?.step === "confirm-march-home"
  ) {
    return [{ type: "confirm-ability" }];
  }
  if (!state.selectedGod) {
    return state.players[state.activeSeat].gods
      .filter((godId) => !state.rested.includes(godId))
      .map((godId) => ({ type: "select-god", godId }));
  }
  if (!state.selectedAbility) return availableAbilityActions(state);

  const actions: FourPlayerAction[] = [];
  if (state.legalTargets.length) {
    actions.push(...state.legalTargets.map(
      (square) => ({ type: "square", square } as FourPlayerAction),
    ));
  } else if (state.pending?.step === "source") {
    actions.push(...movableSourceSquares(state).map(
      (square) => ({ type: "square", square } as FourPlayerAction),
    ));
  }
  if (canPassAction(state)) actions.push({ type: "pass" });
  return actions;
};

const checkmateStateSignature = (state: FourPlayerState) => JSON.stringify({
  phase: state.phase,
  activeSeat: state.activeSeat,
  turn: state.turn,
  round: state.round,
  selectedGod: state.selectedGod,
  selectedAbility: state.selectedAbility,
  selectedSquare: state.selectedSquare,
  legalTargets: state.legalTargets,
  legalSeats: state.legalSeats,
  pending: state.pending,
  board: state.board,
  players: state.players,
  rested: state.rested,
  seatTurns: state.seatTurns,
  hostileTurns: state.hostileTurns,
  godTurns: state.godTurns,
  bananas: state.bananas,
  stealth: state.stealth,
  enPassant: state.enPassant,
  bonusTurn: state.bonusTurn,
  winner: state.winner,
  drawReason: state.drawReason,
});

const completedTurnFor = (
  initial: FourPlayerState,
  candidate: FourPlayerState,
) =>
  candidate.phase === "gameover" ||
  candidate.phase !== initial.phase ||
  candidate.turn !== initial.turn ||
  candidate.activeSeat !== initial.activeSeat;

export const hasCompleteFourPlayerTurn = (state: FourPlayerState) => {
  const defender = state.activeSeat;
  return hasCompleteTurn({
    state,
    availableActions: availableFourPlayerActions,
    reduce: (candidate, action) =>
      reduceFourPlayerState(candidate, action, false),
    signature: checkmateStateSignature,
    isComplete: completedTurnFor,
    acceptComplete: (_initial, next) =>
      !next.players[defender].eliminated &&
      Boolean(fourPlayerKingSquare(next.board, defender)) &&
      !fourPlayerIsInCheck(
        next.board,
        defender,
        next.config,
        next.bananas,
      ),
    limits: {
      maxDepth: 18,
      maxStates: 24_000,
      maxActionsPerState: 256,
    },
  });
};

const mostRecentCheckingSeat = (state: FourPlayerState, defender: Seat) => {
  ensureKingAttackTracking(state);
  const attackers = checkingSeats(state, defender);
  return attackers.sort((first, second) =>
    (state.kingAttackRecency![defender][second] ?? 0) -
      (state.kingAttackRecency![defender][first] ?? 0) ||
    FOUR_PLAYER_SEATS.indexOf(second) - FOUR_PLAYER_SEATS.indexOf(first)
  )[0];
};

const resolveTurnStartAdjudication = (state: FourPlayerState) => {
  if (state.selectedGod || state.selectedAbility) return;
  let guard = 0;
  while (
    state.phase === "play" &&
    !state.winner &&
    !state.drawReason &&
    guard < 16
  ) {
    guard += 1;
    const seat = state.activeSeat;
    ensurePassCycle(state);
    if (hasCompleteFourPlayerTurn(state)) return;
    if (fourPlayerIsInCheck(
      state.board,
      seat,
      state.config,
      state.bananas,
    )) {
      const captor = mostRecentCheckingSeat(state, seat);
      const kingSquare = fourPlayerKingSquare(state.board, seat);
      const king = kingSquare ? state.board[kingSquare] : undefined;
      if (!captor || !kingSquare || !king) return;
      delete state.board[kingSquare];
      sendToGraveyard(state, king, kingSquare, captor);
      log(state, `${name(seat)} was checkmated by ${name(captor)}.`);
      if (state.winner) return;
    } else {
      if (!state.passCycle!.passedSeats.includes(seat)) {
        state.passCycle!.passedSeats.push(seat);
      }
      log(state, `${name(seat)} was stalemated and skipped.`);
      const survivors = livingSeats(state);
      if (survivors.every((survivor) =>
        state.passCycle!.passedSeats.includes(survivor)
      )) {
        setDraw(state);
        return;
      }
    }
    state.selectedGod = undefined;
    state.selectedAbility = undefined;
    state.selectedSquare = undefined;
    state.pending = undefined;
    state.legalTargets = [];
    state.legalSeats = [];
    state.turn += 1;
    if (state.enPassant && state.enPassant.expiresOnTurn < state.turn) {
      state.enPassant = undefined;
    }
    state.activeSeat = nextLivingSeat(state, seat);
    const beforeStart = clone(state);
    resolveStartOfTurn(state);
    recordKingAttackChanges(beforeStart, state);
    if (!state.winner && !state.drawReason) {
      state.notice = `${name(state.activeSeat)} to act. Choose an available God.`;
    }
  }
};

const beganPlayTurn = (previous: FourPlayerState, next: FourPlayerState) =>
  next.phase === "play" &&
  (
    previous.phase !== "play" ||
    next.turn !== previous.turn ||
    next.activeSeat !== previous.activeSeat
  );

const reduceFourPlayerState = (
  state: FourPlayerState,
  action: FourPlayerAction,
  resolveCheckmate: boolean,
): FourPlayerState => {
  if (action.type === "load") {
    if (!isFourPlayerState(action.state)) {
      throw new Error("Cannot load an invalid four-player state.");
    }
    const loaded = clone(action.state);
    loaded.orbAnimations ??= [];
    loaded.nextOrbAnimationId ??=
      Math.max(0, ...loaded.orbAnimations.map((event) => event.id)) + 1;
    recordKingAttackChanges(undefined, loaded);
    if (resolveCheckmate && loaded.phase === "play") {
      resolveTurnStartAdjudication(loaded);
    }
    return loaded;
  }
  if (action.type === "restart") return createFourPlayerGame(state.config);
  const previousOrbs = Object.fromEntries(
    FOUR_PLAYER_SEATS.map((seat) => [seat, { ...state.players[seat].orbs }]),
  ) as Record<Seat, Record<OrbAffinity, number>>;
  const animationSource =
    action.type === "square"
      ? action.square
      : state.pending?.destination ?? state.pending?.source ?? state.selectedSquare;
  const next = clone(state);
  next.orbAnimations ??= [];
  next.nextOrbAnimationId ??=
    Math.max(0, ...next.orbAnimations.map((event) => event.id)) + 1;
  if (action.type === "draft" && next.phase === "draft") {
    draftGod(next, action.godId);
  } else if (
    action.type === "select-god" &&
    next.phase === "play" &&
    !hasCommittedFourPlayerAction(next)
  ) {
    selectGod(next, action.godId);
  } else if (
    action.type === "clear-god" &&
    next.phase === "play" &&
    next.selectedGod &&
    !hasCommittedFourPlayerAction(next)
  ) {
    if (next.selectedAbility) refundCost(next);
    next.selectedGod = undefined;
    next.selectedAbility = undefined;
    next.selectedSquare = undefined;
    next.pending = undefined;
    next.legalTargets = [];
    next.legalSeats = [];
    next.notice = `${name(next.activeSeat)} to act. Choose an available God.`;
  } else if (
    action.type === "select-ability" &&
    next.phase === "play" &&
    !hasCommittedFourPlayerAction(next)
  ) {
    if (next.selectedAbility) refundCost(next);
    activateAbility(next, action.abilityId);
  } else if (action.type === "confirm-ability" && next.phase === "play") {
    if (next.pending?.step === "confirm-stone-gaze") resolveStoneGaze(next);
    else if (next.pending?.step === "confirm-march-home" && next.pending.source) {
      executeMarchHome(next, next.pending.source, []);
    }
  } else if (action.type === "square" && next.phase === "play") {
    handleSquare(next, action.square);
  } else if (action.type === "grave" && next.pending?.step === "grave") {
    chooseGravePiece(next, action.pieceId);
  } else if (action.type === "seat" && next.legalSeats.includes(action.seat)) {
    if (next.pending?.step === "siphon-seat") {
      next.pending = { ...next.pending, step: "siphon-amount", targetSeat: action.seat };
      next.legalSeats = [];
      next.notice = "Choose how many light orbs to steal.";
    } else if (next.pending?.step === "barter-seat") {
      next.pending = { ...next.pending, step: "barter-orb", targetSeat: action.seat };
      next.legalSeats = [];
      next.notice = "Choose which orb to give, or decline.";
    }
  } else if (action.type === "amount" && next.pending?.step === "siphon-amount" && next.pending.targetSeat) {
    const target = next.pending.targetSeat;
    const stolen = Math.min(action.amount, next.players[target].orbs.light);
    addOrbs(next, target, -stolen, 0);
    addOrbs(next, next.activeSeat, stolen, 0);
    finishTurn(next, abilityDescription(next, `: stole ${stolen} light orbs from ${name(target)}`));
  } else if (action.type === "orb" && next.pending?.step === "slither-orb") {
    if (!action.orb) return state;
    addAffinityOrb(next, next.activeSeat, action.orb, 1);
    finishTurn(next, abilityDescription(next, `: chose 1 extra ${action.orb} orb`));
  } else if (action.type === "orb" && next.pending?.step === "barter-orb" && next.pending.targetSeat) {
    const target = next.pending.targetSeat;
    if (action.orb && activePlayer(next).orbs[action.orb] > 0) {
      const take: OrbAffinity = action.orb === "light" ? "dark" : "light";
      activePlayer(next).orbs[action.orb] -= 1;
      next.players[target].orbs[action.orb] += 1;
      const amount = currentLevel(next, "barter") >= 3 ? 3 : 2;
      const available = Math.min(amount, next.players[target].orbs[take]);
      next.players[target].orbs[take] -= available;
      activePlayer(next).orbs[take] += available;
      if (currentLevel(next, "barter") >= 2 && next.pending.destination) {
        addAffinityOrb(
          next,
          next.activeSeat,
          fourPlayerSquareAffinity(next.pending.destination),
          1,
        );
      }
      finishTurn(next, abilityDescription(next, `: bartered with ${name(target)}`));
    } else {
      finishTurn(next, abilityDescription(next, ": declined the trade"));
    }
  } else if (action.type === "choice") {
    if (next.pending?.step === "harden-decision" && next.pending.source) {
      const piece = next.board[next.pending.source];
      if (piece) {
        if (action.value) piece.status.hardened = "god";
        else delete piece.status.hardened;
      }
      next.pending = undefined;
      next.legalTargets = [];
      if (!queueHardenChoice(next) && !queuePreparedShot(next)) {
        next.notice = `${name(next.activeSeat)} to act. Choose an available God.`;
      }
    } else if (next.pending?.step === "rage-choice" && next.pending.destination) {
      resolveRage(next, next.pending.destination, action.value);
      finishTurn(
        next,
        abilityDescription(next, action.value ? ": spared allied pieces" : ": captured every adjacent piece"),
      );
    } else if (next.pending?.step === "marked-choice" && next.pending.movedPieceId) {
      if (action.value) {
        const square = findSquareById(next, next.pending.movedPieceId);
        if (square) {
          const doomed = next.board[square];
          if (doomed.type !== "king") {
            delete next.board[square];
            sendToGraveyard(next, doomed, square);
            addOrbs(next, next.activeSeat, 0, 5);
          }
        }
        finishTurn(next, abilityDescription(next, ": executed the marked piece"));
      } else {
        finishTurn(next, abilityDescription(next, ": left the piece marked"));
      }
    } else if (next.pending?.step === "resurrect-more") {
      if (action.value) {
        if (activePlayer(next).orbs.light < 2) next.notice = "You need 2 light orbs.";
        else {
          addOrbs(next, next.activeSeat, -2, 0);
          next.pending.step = "grave";
          next.notice = "Choose the second grave piece.";
        }
      } else {
        finishTurn(next, abilityDescription(next, ": completed with one revived piece"));
      }
    }
  } else if (action.type === "upgrade" && next.phase === "upgrade") {
    upgradeAbility(next, action.abilityId);
  } else if (action.type === "cancel" && next.phase === "play") {
    if (!hasCommittedFourPlayerAction(next)) {
      refundCost(next);
      next.selectedAbility = undefined;
      next.selectedSquare = undefined;
      next.pending = undefined;
      next.legalTargets = [];
      next.legalSeats = [];
      next.notice = next.selectedGod ? "Choose an ability." : "Choose an available God.";
    }
  } else if (action.type === "pass" && next.phase === "play") {
    if (next.pending?.abilityId === "snipe-shot") {
      for (const piece of Object.values(next.board)) {
        const prepared = preparedDetails(piece);
        if (prepared?.owner === next.activeSeat && prepared.level === 1) delete piece.status.prepared;
      }
      next.pending = undefined;
      next.selectedSquare = undefined;
      next.legalTargets = [];
      next.notice = `${name(next.activeSeat)} skipped the prepared shot.`;
    } else if (next.selectedGod) {
      if (
        compelledLuredSources(next).length &&
        ["construction", "marked"].includes(next.selectedAbility ?? "") &&
        next.pending?.step === "source"
      ) {
        next.notice = "A Lured piece must move closer to its luring Queen.";
      } else if (next.selectedAbility === "construction") {
        addOrbs(next, next.activeSeat, 2, 0);
        finishTurn(next, abilityDescription(next, ": held position and gained 2 light orbs"));
      } else if (next.selectedAbility === "marked") {
        if (next.pending?.step === "marked-choice") {
          finishTurn(next, abilityDescription(next, ": left the piece marked"));
        } else {
          const reward = currentLevel(next, "marked") >= 2 ? 1 : 0;
          if (reward) addOrbs(next, next.activeSeat, 1, 0);
          finishTurn(next, abilityDescription(next, reward ? ": waited for 1 light orb" : ": waited"));
        }
      } else if (["slither", "mount-rider", "funding"].includes(next.pending?.step ?? "")) {
        finishTurn(next, abilityDescription(next, ": completed the movement"));
      } else if (next.pending?.step === "hex-target" && next.pending.selected?.length) {
        enterHexMovement(next);
      } else if (next.pending?.step === "march-companions" && next.pending.source) {
        executeMarchHome(next, next.pending.source, next.pending.selected ?? []);
      } else if (
        next.pending?.step === "escort-companions" &&
        next.pending.source &&
        next.pending.selected?.length
      ) {
        next.pending.step = "escort-move";
        next.selectedSquare = next.pending.source;
        next.legalTargets = sourceTargets(next, next.pending.source);
        next.notice = "Choose the King's destination.";
      } else if (next.pending?.step === "barter-orb") {
        finishTurn(next, abilityDescription(next, ": declined the trade"));
      }
    }
  }
  if (animationSource) {
    for (const seat of FOUR_PLAYER_SEATS) {
      for (const orb of ["light", "dark"] as const) {
        const amount = next.players[seat].orbs[orb] - previousOrbs[seat][orb];
        if (amount <= 0) continue;
        next.orbAnimations.push({
          id: next.nextOrbAnimationId,
          player: seat,
          orb,
          amount,
          total: next.players[seat].orbs[orb],
          source: animationSource,
        });
        next.nextOrbAnimationId += 1;
      }
    }
    next.orbAnimations = next.orbAnimations.slice(-16);
  }
  recordKingAttackChanges(state, next);
  const actor = state.activeSeat;
  if (
    completedTurnFor(state, next) &&
    !next.players[actor].eliminated &&
    fourPlayerIsInCheck(next.board, actor, next.config, next.bananas)
  ) {
    return state;
  }
  if (resolveCheckmate && beganPlayTurn(state, next)) {
    resolveTurnStartAdjudication(next);
  }
  return next;
};

export const fourPlayerReducer = (
  state: FourPlayerState,
  action: FourPlayerAction,
): FourPlayerState => reduceFourPlayerState(state, action, true);
