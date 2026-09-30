import { validateThreePlayerConfig } from "./threePlayerConfig";
import { getThreePlayerTopology } from "./threePlayerTopology";
import {
  THREE_PLAYER_BOARD_VARIANTS,
  THREE_PLAYER_SEATS,
  type ThreePlayerConfig,
  type ThreePlayerPiece,
  type ThreePlayerPieceStatus,
  type ThreePlayerPromotion,
  type ThreePlayerSeat,
  type ThreePlayerSeatControl,
  type ThreePlayerState,
} from "./threePlayerTypes";
import { GODS } from "./gods";
import type { GodId } from "./types";

const GOD_IDS = new Set(GODS.map((god) => god.id));
const ABILITY_IDS = new Set(
  GODS.flatMap((god) => god.abilities.map((ability) => ability.id)),
);
const PIECE_TYPES = new Set([
  "king",
  "queen",
  "rook",
  "bishop",
  "knight",
  "pawn",
]);
const PHASES = new Set(["draft", "play", "gameover"]);
const PROMOTIONS = new Set(["queen", "rook", "bishop", "knight"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const isInteger = (value: unknown, minimum = 0): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= minimum;
const isUnique = <T>(values: T[]) => new Set(values).size === values.length;
const isSeat = (value: unknown): value is ThreePlayerSeat =>
  typeof value === "string" &&
  THREE_PLAYER_SEATS.includes(value as ThreePlayerSeat);
const isGodId = (value: unknown): value is GodId =>
  typeof value === "string" && GOD_IDS.has(value as GodId);
const isGodArray = (value: unknown): value is GodId[] =>
  Array.isArray(value) && value.every(isGodId) && isUnique(value);
const isSeatArray = (value: unknown): value is ThreePlayerSeat[] =>
  Array.isArray(value) && value.every(isSeat) && isUnique(value);
const isDuration = (value: unknown, strings: string[]) =>
  isInteger(value, 1) ||
  (typeof value === "string" && strings.includes(value));

const isSeatControl = (value: unknown): value is ThreePlayerSeatControl => {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "human") {
    return Object.keys(value).every((key) => ["kind", "local"].includes(key)) &&
      typeof value.local === "boolean";
  }
  if (value.kind === "ai") {
    return Object.keys(value).every((key) => ["kind", "difficulty"].includes(key)) &&
      (
        value.difficulty === undefined ||
        (isInteger(value.difficulty, 1) && value.difficulty <= 10)
      );
  }
  if (value.kind === "online") {
    return Object.keys(value).every((key) =>
      ["kind", "participantId", "local"].includes(key)
    ) &&
      (value.participantId === undefined ||
        typeof value.participantId === "string") &&
      (value.local === undefined || typeof value.local === "boolean");
  }
  return false;
};

const controlsEqual = (
  first: ThreePlayerSeatControl,
  second: ThreePlayerSeatControl,
) => JSON.stringify(first) === JSON.stringify(second);

export const isThreePlayerConfig = (
  value: unknown,
): value is ThreePlayerConfig => {
  if (
    !isRecord(value) ||
    !THREE_PLAYER_BOARD_VARIANTS.includes(
      value.boardVariant as (typeof THREE_PLAYER_BOARD_VARIANTS)[number],
    ) ||
    !["first-checkmate", "last-survivor"].includes(String(value.victoryMode)) ||
    typeof value.takeover !== "boolean" ||
    !isRecord(value.seats)
  ) return false;
  for (const seat of THREE_PLAYER_SEATS) {
    const candidate = value.seats[seat];
    if (
      !isRecord(candidate) ||
      typeof candidate.name !== "string" ||
      !candidate.name.trim() ||
      typeof candidate.displayColor !== "string" ||
      !candidate.displayColor.trim() ||
      !isSeatControl(candidate.control)
    ) return false;
  }
  try {
    validateThreePlayerConfig(value as unknown as ThreePlayerConfig);
    return true;
  } catch {
    return false;
  }
};

const isPieceStatus = (value: unknown): value is ThreePlayerPieceStatus => {
  if (!isRecord(value)) return false;
  if (value.hardened !== undefined &&
      !isDuration(value.hardened, ["choice", "god"])) return false;
  if (value.frozen !== undefined && !isDuration(value.frozen, ["god"])) return false;
  if (value.frozenBy !== undefined && !isSeat(value.frozenBy)) return false;
  if (value.gazing !== undefined && typeof value.gazing !== "boolean") return false;
  if (value.poisoned !== undefined && !isDuration(value.poisoned, ["god"])) return false;
  if (value.poisonedBy !== undefined && !isSeat(value.poisonedBy)) return false;
  if (value.polymorphed !== undefined &&
      !isDuration(value.polymorphed, ["god"])) return false;
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
  if (value.movedThisTurn !== undefined &&
      typeof value.movedThisTurn !== "boolean") return false;
  if (value.chargeUntil !== undefined &&
      !isDuration(value.chargeUntil, ["god"])) return false;
  return true;
};

const isPiece = (value: unknown): value is ThreePlayerPiece => {
  if (!isRecord(value) || "orbAffinity" in value) return false;
  return (
    typeof value.id === "string" &&
    Boolean(value.id) &&
    PIECE_TYPES.has(String(value.type)) &&
    isSeat(value.owner) &&
    (value.controller === null || isSeat(value.controller)) &&
    typeof value.hasMoved === "boolean" &&
    isPieceStatus(value.status)
  );
};

const isUpgrades = (value: unknown) =>
  isRecord(value) && Object.entries(value).every(
    ([abilityId, level]) =>
      ABILITY_IDS.has(abilityId) && [1, 2, 3].includes(Number(level)),
  );

const isSeatNumberRecord = (value: unknown) =>
  isRecord(value) &&
  THREE_PLAYER_SEATS.every((seat) => isInteger(value[seat]));

const isKingAttackRecency = (value: unknown, attackSequence: number) =>
  isRecord(value) && THREE_PLAYER_SEATS.every((defender) => {
    const recency = value[defender];
    return isRecord(recency) && Object.entries(recency).every(
      ([attacker, sequence]) =>
        isSeat(attacker) &&
        attacker !== defender &&
        isInteger(sequence, 1) &&
        sequence <= attackSequence,
    );
  });

const expectedPieceController = (
  owner: ThreePlayerSeat,
  players: ThreePlayerState["players"],
  takeover: boolean,
): ThreePlayerSeat | null | undefined => {
  if (!players[owner].eliminated) return owner;

  const visited = new Set<ThreePlayerSeat>();
  let successor = owner;
  while (players[successor].eliminated) {
    if (visited.has(successor)) return undefined;
    visited.add(successor);
    const eliminatedBy = players[successor].eliminatedBy;
    if (!eliminatedBy) return undefined;
    successor = eliminatedBy;
  }
  return takeover ? successor : null;
};

export const isThreePlayerState = (
  value: unknown,
): value is ThreePlayerState => {
  if (
    !isRecord(value) ||
    "redAffinity" in value ||
    "pieceAffinities" in value ||
    value.variant !== "three-player" ||
    value.schemaVersion !== 1 ||
    !isThreePlayerConfig(value.config) ||
    !PHASES.has(String(value.phase)) ||
    !isRecord(value.board) ||
    !isRecord(value.players) ||
    !isSeat(value.activeSeat) ||
    !Array.isArray(value.turnOrder) ||
    value.turnOrder.length !== THREE_PLAYER_SEATS.length ||
    value.turnOrder.some((seat, index) => seat !== THREE_PLAYER_SEATS[index]) ||
    !isRecord(value.draft) ||
    !isGodArray(value.rested) ||
    !isInteger(value.round, 1) ||
    !isInteger(value.turn, 1) ||
    !isSeatNumberRecord(value.completedTurns) ||
    !isRecord(value.castlingRights) ||
    !isInteger(value.attackSequence) ||
    !isKingAttackRecency(value.kingAttackRecency, value.attackSequence) ||
    !isInteger(value.revision) ||
    !isInteger(value.positionRevision) ||
    !isRecord(value.passCycle) ||
    !isInteger(value.passCycle.positionRevision) ||
    value.passCycle.positionRevision !== value.positionRevision ||
    !isSeatArray(value.passCycle.passedSeats) ||
    !Array.isArray(value.history) ||
    !value.history.every((entry) => typeof entry === "string") ||
    typeof value.notice !== "string" ||
    (value.lastAction !== undefined && typeof value.lastAction !== "string")
  ) return false;

  const topology = getThreePlayerTopology(value.config.boardVariant);
  const validCells = new Set(topology.cells);
  const passCycle = value.passCycle as unknown as ThreePlayerState["passCycle"];
  const pieceIds: string[] = [];
  const allPieces: ThreePlayerPiece[] = [];
  const board = value.board as Record<string, ThreePlayerPiece>;
  for (const [cell, candidate] of Object.entries(value.board)) {
    if (!validCells.has(cell) || !isPiece(candidate)) return false;
    pieceIds.push(candidate.id);
    allPieces.push(candidate);
  }

  const draftedGods: GodId[] = [];
  for (const seat of THREE_PLAYER_SEATS) {
    const player = value.players[seat];
    const rights = value.castlingRights[seat];
    if (
      !isRecord(player) ||
      player.seat !== seat ||
      typeof player.name !== "string" ||
      typeof player.displayColor !== "string" ||
      !isSeatControl(player.control) ||
      typeof player.eliminated !== "boolean" ||
      (
        player.eliminated
          ? !isSeat(player.eliminatedBy)
          : player.eliminatedBy !== undefined
      ) ||
      !isGodArray(player.gods) ||
      !isRecord(player.orbs) ||
      !isInteger(player.orbs.light) ||
      !isInteger(player.orbs.dark) ||
      !Array.isArray(player.graveyard) ||
      !player.graveyard.every((entry) =>
        isRecord(entry) &&
        isPiece(entry.piece) &&
        isInteger(entry.capturedOnTurn)
      ) ||
      !isUpgrades(player.upgrades) ||
      !isRecord(rights) ||
      typeof rights.king !== "boolean" ||
      typeof rights.queen !== "boolean"
    ) return false;
    for (const side of ["king", "queen"] as const) {
      if (
        rights[side] &&
        !topology.castling(seat).some((descriptor) => descriptor.side === side)
      ) return false;
    }
    if (
      player.name !== value.config.seats[seat].name ||
      player.displayColor !== value.config.seats[seat].displayColor ||
      !controlsEqual(player.control, value.config.seats[seat].control)
    ) return false;
    draftedGods.push(...player.gods);
    if (player.gods.length > 3) return false;
    for (const entry of player.graveyard) {
      pieceIds.push(entry.piece.id);
      allPieces.push(entry.piece);
    }
  }
  if (!isUnique(pieceIds) || !isUnique(draftedGods)) return false;

  const players = value.players as unknown as ThreePlayerState["players"];
  const takeover = (value.config as ThreePlayerConfig).takeover;
  if (
    THREE_PLAYER_SEATS.some((seat) =>
      players[seat].eliminated &&
      expectedPieceController(seat, players, takeover) === undefined
    )
  ) return false;
  for (const piece of Object.values(board)) {
    const expected = expectedPieceController(
      piece.owner,
      players,
      takeover,
    );
    if (expected === undefined || piece.controller !== expected) return false;
  }
  if (passCycle.passedSeats.some((seat) => players[seat].eliminated)) {
    return false;
  }
  const living = THREE_PLAYER_SEATS.filter((seat) => !players[seat].eliminated);
  if (
    value.phase === "play" &&
    living.length > 0 &&
    living.every((seat) => passCycle.passedSeats.includes(seat))
  ) return false;

  const expectedDraftOrder = [
    "white",
    "red",
    "black",
    "black",
    "red",
    "white",
    "white",
    "red",
    "black",
  ];
  if (
    !Array.isArray(value.draft.order) ||
    value.draft.order.length !== expectedDraftOrder.length ||
    value.draft.order.some((seat, index) => seat !== expectedDraftOrder[index]) ||
    !isInteger(value.draft.pickIndex) ||
    value.draft.pickIndex > expectedDraftOrder.length ||
    !isGodArray(value.draft.available) ||
    !isGodArray(value.draft.unused)
  ) return false;
  const allGods = [
    ...draftedGods,
    ...value.draft.available,
    ...value.draft.unused,
  ];
  if (!isUnique(allGods) || allGods.length !== GODS.length) return false;
  if (!value.rested.every((godId) => draftedGods.includes(godId))) return false;
  if (value.phase === "draft") {
    if (
      draftedGods.length !== value.draft.pickIndex ||
      value.draft.unused.length !== 0 ||
      value.draft.available.length !== GODS.length - value.draft.pickIndex ||
      value.activeSeat !== value.draft.order[value.draft.pickIndex]
    ) return false;
  } else if (
    draftedGods.length !== 9 ||
    THREE_PLAYER_SEATS.some((seat) => players[seat].gods.length !== 3) ||
    value.draft.pickIndex !== 9 ||
    value.draft.available.length !== 0 ||
    value.draft.unused.length !== 3
  ) return false;

  if (value.enPassant !== undefined) {
    if (
      !isRecord(value.enPassant) ||
      typeof value.enPassant.target !== "string" ||
      !validCells.has(value.enPassant.target) ||
      typeof value.enPassant.capturedCell !== "string" ||
      !validCells.has(value.enPassant.capturedCell) ||
      typeof value.enPassant.pawnId !== "string" ||
      !isInteger(value.enPassant.expiresOnTurn, 1)
    ) return false;
    const pawn = board[value.enPassant.capturedCell];
    if (
      pawn?.id !== value.enPassant.pawnId ||
      pawn.type !== "pawn" ||
      value.enPassant.target in board
    ) return false;
  }

  if (value.result !== undefined) {
    if (!isRecord(value.result) || typeof value.result.kind !== "string") return false;
    if (
      value.result.kind === "winner" &&
      !(
        isSeat(value.result.seat) &&
        ["first-checkmate", "last-survivor"].includes(String(value.result.reason))
      )
    ) return false;
    if (
      value.result.kind === "draw" &&
      !["stalemate", "stalemate-cycle"].includes(String(value.result.reason))
    ) return false;
    if (!["winner", "draw"].includes(value.result.kind)) return false;
    const result = value.result as unknown as NonNullable<
      ThreePlayerState["result"]
    >;
    if (result.kind === "winner") {
      if (players[result.seat].eliminated) return false;
      if (
        result.reason === "first-checkmate" &&
        (
          value.config.victoryMode !== "first-checkmate" ||
          living.length === THREE_PLAYER_SEATS.length
        )
      ) return false;
      if (
        result.reason === "last-survivor" &&
        (
          value.config.victoryMode !== "last-survivor" ||
          living.length !== 1 ||
          living[0] !== result.seat
        )
      ) return false;
    } else if (
      result.reason === "stalemate" &&
      value.config.victoryMode !== "first-checkmate"
    ) return false;
    else if (
      result.reason === "stalemate-cycle" &&
      !living.every((seat) => passCycle.passedSeats.includes(seat))
    ) return false;
  }
  if ((value.phase === "gameover") !== Boolean(value.result)) return false;
  if (value.phase !== "gameover" && players[value.activeSeat].eliminated) return false;
  if (
    !value.result &&
    value.phase === "play" &&
    value.config.victoryMode === "last-survivor" &&
    living.length <= 1
  ) return false;

  for (const seat of THREE_PLAYER_SEATS) {
    const boardKings = Object.values(board).filter(
      (piece) => piece.type === "king" && piece.owner === seat,
    );
    const allKings = allPieces.filter(
      (piece) => piece.type === "king" && piece.owner === seat,
    );
    if (allKings.length !== 1 || boardKings.length > 1) return false;
    if (players[seat].eliminated === Boolean(boardKings[0])) return false;
    if (boardKings[0] && boardKings[0].controller !== seat) return false;
  }
  return true;
};

const emptyRecency = () => ({
  white: {},
  red: {},
  black: {},
});

export const prepareThreePlayerState = (value: unknown): ThreePlayerState => {
  if (!isRecord(value)) {
    throw new Error("Cannot serialize an invalid three-player state.");
  }
  const prepared = structuredClone(value) as Record<string, unknown>;
  prepared.schemaVersion ??= 1;
  prepared.attackSequence ??= 0;
  prepared.kingAttackRecency ??= emptyRecency();
  prepared.completedTurns ??= { white: 0, red: 0, black: 0 };
  prepared.revision ??= 0;
  prepared.positionRevision ??= 0;
  prepared.passCycle ??= {
    positionRevision: prepared.positionRevision,
    passedSeats: [],
  };
  if (!isThreePlayerState(prepared)) {
    throw new Error("Cannot serialize an invalid three-player state.");
  }
  return prepared;
};

export const isThreePlayerPromotion = (
  value: unknown,
): value is ThreePlayerPromotion =>
  typeof value === "string" && PROMOTIONS.has(value);
