import { fourPlayerSquares } from "./fourPlayerChess";
import { validateFourPlayerConfig } from "./fourPlayerConfig";
import {
  FOUR_PLAYER_SEATS,
  type FourPlayerConfig,
  type FourPlayerPiece,
  type FourPlayerPieceStatus,
  type FourPlayerState,
  type Seat,
  type SeatControl,
} from "./fourPlayerTypes";
import { GOD_BY_ID, GODS } from "./gods";
import type { GodId } from "./types";

const GOD_IDS = new Set(GODS.map((god) => god.id));
const PIECE_TYPES = new Set(["king", "queen", "rook", "bishop", "knight", "pawn"]);
const PHASES = new Set(["draft", "play", "upgrade", "gameover"]);
const TEAM_IDS = new Set(["team-a", "team-b"]);
const AFFINITIES = new Set(["light", "dark"]);
const VALID_SQUARES = new Set(fourPlayerSquares);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const isSeat = (value: unknown): value is Seat =>
  typeof value === "string" && FOUR_PLAYER_SEATS.includes(value as Seat);
const isGodId = (value: unknown): value is GodId =>
  typeof value === "string" && GOD_IDS.has(value as GodId);
const isSquare = (value: unknown): value is string =>
  typeof value === "string" && VALID_SQUARES.has(value);
const isInteger = (value: unknown, minimum = 0): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= minimum;
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");
const isUnique = <T>(values: T[]) => new Set(values).size === values.length;

const isSeatControl = (value: unknown): value is SeatControl => {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "human") return typeof value.local === "boolean";
  if (value.kind === "ai") {
    return value.difficulty === undefined ||
      (isInteger(value.difficulty, 1) && value.difficulty <= 10);
  }
  if (value.kind === "online") {
    return (
      (value.participantId === undefined || typeof value.participantId === "string") &&
      (value.local === undefined || typeof value.local === "boolean")
    );
  }
  return false;
};

const controlsEqual = (first: SeatControl, second: SeatControl) => {
  if (first.kind !== second.kind) return false;
  if (first.kind === "human" && second.kind === "human") return first.local === second.local;
  if (first.kind === "ai" && second.kind === "ai") return first.difficulty === second.difficulty;
  if (first.kind === "online" && second.kind === "online") {
    return first.participantId === second.participantId && first.local === second.local;
  }
  return false;
};

export const isFourPlayerConfig = (value: unknown): value is FourPlayerConfig => {
  if (
    !isRecord(value) ||
    !["ffa", "teams"].includes(String(value.mode)) ||
    !["clockwise", "alternate-teams"].includes(String(value.turnPolicy)) ||
    !["last-survivor", "first-king-captured"].includes(String(value.victoryMode)) ||
    typeof value.takeover !== "boolean" ||
    !isSeat(value.startingSeat) ||
    !isRecord(value.seats)
  ) return false;
  for (const seat of FOUR_PLAYER_SEATS) {
    const seatConfig = value.seats[seat];
    if (
      !isRecord(seatConfig) ||
      typeof seatConfig.name !== "string" ||
      !seatConfig.name.trim() ||
      typeof seatConfig.displayColor !== "string" ||
      !seatConfig.displayColor.trim() ||
      !AFFINITIES.has(String(seatConfig.orbAffinity)) ||
      !isSeatControl(seatConfig.control)
    ) return false;
  }
  if (value.mode === "teams") {
    if (!isRecord(value.teams)) return false;
    for (const seat of FOUR_PLAYER_SEATS) {
      if (!TEAM_IDS.has(String(value.teams[seat]))) return false;
    }
  } else if (value.teams !== undefined) {
    if (!isRecord(value.teams)) return false;
  }
  try {
    validateFourPlayerConfig(value as unknown as FourPlayerConfig);
    return true;
  } catch {
    return false;
  }
};

const isDuration = (value: unknown, strings: string[]) =>
  isInteger(value, 1) || (typeof value === "string" && strings.includes(value));

const isPieceStatus = (value: unknown): value is FourPlayerPieceStatus => {
  if (!isRecord(value)) return false;
  if (value.hardened !== undefined && !isDuration(value.hardened, ["choice", "god"])) return false;
  if (value.frozen !== undefined && !isDuration(value.frozen, ["god"])) return false;
  if (value.frozenBy !== undefined && !isSeat(value.frozenBy)) return false;
  if (value.gazing !== undefined && typeof value.gazing !== "boolean") return false;
  if (value.poisoned !== undefined && !isDuration(value.poisoned, ["god"])) return false;
  if (value.poisonedBy !== undefined && !isSeat(value.poisonedBy)) return false;
  if (value.polymorphed !== undefined && !isDuration(value.polymorphed, ["god"])) return false;
  if (value.luredBy !== undefined && !isSeat(value.luredBy)) return false;
  if (value.hexedBy !== undefined && !isSeat(value.hexedBy)) return false;
  if (
    value.prepared !== undefined &&
    typeof value.prepared !== "boolean" &&
    !(
      isRecord(value.prepared) &&
      isSeat(value.prepared.owner) &&
      [1, 2, 3].includes(Number(value.prepared.level))
    )
  ) return false;
  if (
    value.ritual !== undefined &&
    !(
      isRecord(value.ritual) &&
      isSeat(value.ritual.owner) &&
      isDuration(value.ritual.expires, ["kangus"])
    )
  ) return false;
  if (
    value.markedForDeath !== undefined &&
    !(
      isRecord(value.markedForDeath) &&
      isSeat(value.markedForDeath.owner) &&
      isInteger(value.markedForDeath.round, 1) &&
      (
        value.markedForDeath.immediate === undefined ||
        typeof value.markedForDeath.immediate === "boolean"
      )
    )
  ) return false;
  if (value.hired !== undefined && typeof value.hired !== "boolean") return false;
  if (value.movedThisTurn !== undefined && typeof value.movedThisTurn !== "boolean") return false;
  if (value.chargeUntil !== undefined && !isDuration(value.chargeUntil, ["god"])) return false;
  return true;
};

const isPiece = (value: unknown): value is FourPlayerPiece => {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    Boolean(value.id) &&
    PIECE_TYPES.has(String(value.type)) &&
    isSeat(value.owner) &&
    (value.controller === null || isSeat(value.controller)) &&
    typeof value.displayColor === "string" &&
    Boolean(value.displayColor) &&
    AFFINITIES.has(String(value.orbAffinity)) &&
    typeof value.hasMoved === "boolean" &&
    isPieceStatus(value.status)
  );
};

const isSeatArray = (value: unknown, expectedLength?: number): value is Seat[] =>
  Array.isArray(value) &&
  (expectedLength === undefined || value.length === expectedLength) &&
  value.every(isSeat) &&
  isUnique(value);

const isGodArray = (value: unknown): value is GodId[] =>
  Array.isArray(value) && value.every(isGodId) && isUnique(value);

const isSeatNumberRecord = (value: unknown) =>
  isRecord(value) && FOUR_PLAYER_SEATS.every((seat) => isInteger(value[seat]));

const isKingAttackRecency = (value: unknown) =>
  isRecord(value) && FOUR_PLAYER_SEATS.every((defender) => {
    const recency = value[defender];
    return isRecord(recency) && Object.entries(recency).every(
      ([attacker, sequence]) => isSeat(attacker) && isInteger(sequence, 1),
    );
  });

const isUpgrades = (value: unknown) =>
  isRecord(value) && Object.entries(value).every(
    ([abilityId, level]) =>
      GODS.some((god) => god.abilities.some((ability) => ability.id === abilityId)) &&
      [1, 2, 3].includes(Number(level)),
  );

const isPending = (value: unknown) => {
  if (!isRecord(value) || !isGodId(value.godId) || typeof value.abilityId !== "string") return false;
  if (!GOD_BY_ID[value.godId].abilities.some((ability) => ability.id === value.abilityId) &&
      value.abilityId !== "snipe-shot" &&
      value.abilityId !== "harden-choice") return false;
  return (
    typeof value.step === "string" &&
    Boolean(value.step) &&
    (value.source === undefined || isSquare(value.source)) &&
    (value.destination === undefined || isSquare(value.destination)) &&
    (value.selected === undefined || isStringArray(value.selected)) &&
    (value.movedPieceId === undefined || typeof value.movedPieceId === "string") &&
    (value.movesRemaining === undefined || Number.isInteger(value.movesRemaining)) &&
    (value.targetSeat === undefined || isSeat(value.targetSeat))
  );
};

export const isFourPlayerState = (value: unknown): value is FourPlayerState => {
  if (!isRecord(value) || value.variant !== "four-player" || !isFourPlayerConfig(value.config)) return false;
  if (
    !PHASES.has(String(value.phase)) ||
    !isRecord(value.board) ||
    !isRecord(value.players) ||
    !isSeat(value.activeSeat) ||
    !isSeatArray(value.turnOrder, 4) ||
    !isRecord(value.draft) ||
    !isGodArray(value.rested) ||
    !isInteger(value.round, 1) ||
    !isInteger(value.turn, 1) ||
    !isSeatNumberRecord(value.seatTurns) ||
    !isSeatNumberRecord(value.hostileTurns) ||
    !isRecord(value.godTurns) ||
    !isSeatArray(value.upgradeQueue) ||
    !Array.isArray(value.legalTargets) ||
    !value.legalTargets.every(isSquare) ||
    !isUnique(value.legalTargets) ||
    !isSeatArray(value.legalSeats) ||
    !Array.isArray(value.bananas) ||
    !isRecord(value.stealth) ||
    !isStringArray(value.history) ||
    typeof value.notice !== "string"
  ) return false;

  const pieceIds: string[] = [];
  for (const [square, candidate] of Object.entries(value.board)) {
    if (!isSquare(square) || !isPiece(candidate)) return false;
    pieceIds.push(candidate.id);
  }

  const draftedGods: GodId[] = [];
  for (const seat of FOUR_PLAYER_SEATS) {
    const player = value.players[seat];
    if (
      !isRecord(player) ||
      player.seat !== seat ||
      typeof player.name !== "string" ||
      typeof player.displayColor !== "string" ||
      !AFFINITIES.has(String(player.orbAffinity)) ||
      !isSeatControl(player.control) ||
      typeof player.eliminated !== "boolean" ||
      (player.eliminatedBy !== undefined && !isSeat(player.eliminatedBy)) ||
      !isGodArray(player.gods) ||
      !isRecord(player.orbs) ||
      !isInteger(player.orbs.light) ||
      !isInteger(player.orbs.dark) ||
      !Array.isArray(player.graveyard) ||
      !player.graveyard.every((entry) =>
        isRecord(entry) && isPiece(entry.piece) && isInteger(entry.capturedOnTurn)
      ) ||
      !isUpgrades(player.upgrades)
    ) return false;
    if (
      player.name !== value.config.seats[seat].name ||
      player.displayColor !== value.config.seats[seat].displayColor ||
      player.orbAffinity !== value.config.seats[seat].orbAffinity ||
      !controlsEqual(player.control, value.config.seats[seat].control)
    ) return false;
    const expectedTeam = value.config.mode === "teams" ? value.config.teams?.[seat] : undefined;
    if (player.team !== expectedTeam) return false;
    draftedGods.push(...player.gods);
    for (const entry of player.graveyard) pieceIds.push(entry.piece.id);
  }
  if (!isUnique(draftedGods)) return false;
  const board = value.board as Record<string, FourPlayerPiece>;
  const players = value.players as unknown as FourPlayerState["players"];

  for (const piece of Object.values(board)) {
    if (piece.controller && players[piece.controller].eliminated) return false;
    if (piece.controller === null && !players[piece.owner].eliminated) return false;
  }

  if (
    !Array.isArray(value.draft.order) ||
    value.draft.order.length !== 12 ||
    !value.draft.order.every(isSeat) ||
    !isInteger(value.draft.pickIndex) ||
    value.draft.pickIndex > 12 ||
    !isGodArray(value.draft.available)
  ) return false;
  const draftGods = [...draftedGods, ...value.draft.available];
  if (!isUnique(draftGods) || draftGods.length !== GODS.length) return false;
  if (value.phase !== "draft" && draftedGods.length !== GODS.length) return false;
  if (!value.rested.every((godId) => draftedGods.includes(godId))) return false;

  for (const seat of FOUR_PLAYER_SEATS) {
    const turns = value.godTurns[seat];
    const stealth = value.stealth[seat];
    if (
      !isRecord(turns) ||
      !Object.entries(turns).every(([godId, count]) => GOD_IDS.has(godId as GodId) && isInteger(count)) ||
      !Array.isArray(stealth) ||
      !stealth.every((move) =>
        isRecord(move) &&
        isPiece(move.piece) &&
        isSquare(move.destination) &&
        isInteger(move.returnOnTurn)
      )
    ) return false;
    const validStealth = stealth as FourPlayerState["stealth"][Seat];
    for (const move of validStealth) {
      if (move.piece.controller !== seat || players[seat].eliminated) return false;
      pieceIds.push(move.piece.id);
    }
  }
  if (!isUnique(pieceIds)) return false;
  const stealthBySeat = value.stealth as unknown as FourPlayerState["stealth"];

  if (
    value.selectedGod !== undefined && !isGodId(value.selectedGod) ||
    value.selectedAbility !== undefined && typeof value.selectedAbility !== "string" ||
    value.selectedSquare !== undefined && !isSquare(value.selectedSquare) ||
    value.pending !== undefined && !isPending(value.pending) ||
    value.bonusTurn !== undefined && !isSeat(value.bonusTurn) ||
    value.attackSequence !== undefined && !isInteger(value.attackSequence) ||
    value.kingAttackRecency !== undefined && !isKingAttackRecency(value.kingAttackRecency) ||
    value.lastAction !== undefined && typeof value.lastAction !== "string"
  ) return false;
  if (
    value.selectedGod !== undefined &&
    !players[value.activeSeat].gods.includes(value.selectedGod)
  ) return false;
  if (
    value.selectedAbility !== undefined &&
    (
      value.selectedGod === undefined ||
      !GOD_BY_ID[value.selectedGod].abilities.some(
        (ability) => ability.id === value.selectedAbility,
      )
    )
  ) return false;

  if (value.enPassant !== undefined) {
    if (
      !isRecord(value.enPassant) ||
      !isSquare(value.enPassant.target) ||
      !isSquare(value.enPassant.capturedSquare) ||
      typeof value.enPassant.pawnId !== "string" ||
      !isInteger(value.enPassant.expiresOnTurn, 1)
    ) return false;
  }
  if (!value.bananas.every((banana) =>
    isRecord(banana) &&
    isSquare(banana.square) &&
    isSeat(banana.owner) &&
    (
      isInteger(banana.expires, 1) ||
      ["kangus", "god"].includes(String(banana.expires))
    )
  )) return false;

  if (value.winner !== undefined) {
    if (
      !isRecord(value.winner) ||
      !["first-king-captured", "last-player", "last-team"].includes(String(value.winner.reason)) ||
      (value.winner.seat !== undefined && !isSeat(value.winner.seat)) ||
      (value.winner.team !== undefined && !TEAM_IDS.has(String(value.winner.team)))
    ) return false;
  }
  if ((value.phase === "gameover") !== Boolean(value.winner)) return false;
  if (value.phase === "upgrade") {
    if (
      !value.upgradeQueue.length ||
      value.activeSeat !== value.upgradeQueue[0] ||
      value.upgradeQueue.some((seat) => players[seat].eliminated)
    ) return false;
  } else if (value.upgradeQueue.length) return false;
  if (value.phase !== "gameover" && players[value.activeSeat].eliminated) return false;

  for (const seat of FOUR_PLAYER_SEATS) {
    const kings = [
      ...Object.values(board),
      ...FOUR_PLAYER_SEATS.flatMap((controller) =>
        stealthBySeat[controller].map((move) => move.piece)
      ),
    ].filter((piece) => piece.type === "king" && piece.owner === seat);
    if (kings.length > 1) return false;
    if (players[seat].eliminated === Boolean(kings[0])) return false;
    if (kings[0] && kings[0].controller !== seat) return false;
  }
  return true;
};

export const prepareFourPlayerState = (state: FourPlayerState): FourPlayerState => {
  if (!isFourPlayerState(state)) throw new Error("Cannot serialize an invalid four-player state.");
  const prepared = structuredClone(state);
  prepared.attackSequence ??= 0;
  prepared.kingAttackRecency ??= {
    north: {},
    east: {},
    south: {},
    west: {},
  };
  return prepared;
};
