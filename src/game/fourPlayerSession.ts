import { fourPlayerReducer } from "./fourPlayerEngine";
import {
  isFourPlayerState,
  prepareFourPlayerState,
} from "./fourPlayerPersistence";
import {
  FOUR_PLAYER_SEATS,
  type FourPlayerAction,
  type FourPlayerState,
  type OrbAffinity,
  type Seat,
} from "./fourPlayerTypes";
import { fourPlayerSquares } from "./fourPlayerChess";
import { GODS } from "./gods";
import type { GodId, Square } from "./types";

export interface FourPlayerActionEnvelope {
  revision: number;
  actionId: string;
  participantId: string;
  seat: Seat;
  action: FourPlayerAction;
}

export interface FourPlayerStateEnvelope {
  revision: number;
  lastActionId?: string;
  state: FourPlayerState;
}

export interface FourPlayerUndoProposal {
  requestId: string;
  targetRevision: number;
  requestedBy: string;
  eligibleParticipantIds: string[];
  approvedParticipantIds: string[];
}

const GOD_IDS = new Set(GODS.map((god) => god.id));
const ABILITY_IDS = new Set(GODS.flatMap((god) =>
  god.abilities.map((ability) => ability.id)
));
const VALID_SQUARES = new Set(fourPlayerSquares);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const hasExactKeys = (
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
) => {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key));
};
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && Boolean(value.trim());
const isSeat = (value: unknown): value is Seat =>
  typeof value === "string" && FOUR_PLAYER_SEATS.includes(value as Seat);
const isGodId = (value: unknown): value is GodId =>
  typeof value === "string" && GOD_IDS.has(value as GodId);
const isAbilityId = (value: unknown): value is string =>
  typeof value === "string" && ABILITY_IDS.has(value);
const isSquare = (value: unknown): value is Square =>
  typeof value === "string" && VALID_SQUARES.has(value);
const isOrbAffinity = (value: unknown): value is OrbAffinity =>
  value === "light" || value === "dark";

export const normalizeFourPlayerAction = (
  value: unknown,
): FourPlayerAction | undefined => {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  switch (value.type) {
    case "draft":
    case "select-god":
      return hasExactKeys(value, ["type", "godId"]) && isGodId(value.godId)
        ? { type: value.type, godId: value.godId }
        : undefined;
    case "clear-god":
    case "confirm-ability":
    case "pass":
    case "cancel":
    case "restart":
      return hasExactKeys(value, ["type"]) ? { type: value.type } : undefined;
    case "select-ability":
    case "upgrade":
      return hasExactKeys(value, ["type", "abilityId"]) &&
          isAbilityId(value.abilityId)
        ? { type: value.type, abilityId: value.abilityId }
        : undefined;
    case "square":
      return hasExactKeys(value, ["type", "square"]) && isSquare(value.square)
        ? { type: "square", square: value.square }
        : undefined;
    case "seat":
      return hasExactKeys(value, ["type", "seat"]) && isSeat(value.seat)
        ? { type: "seat", seat: value.seat }
        : undefined;
    case "grave":
      return hasExactKeys(value, ["type", "pieceId"]) &&
          isNonEmptyString(value.pieceId)
        ? { type: "grave", pieceId: value.pieceId }
        : undefined;
    case "choice":
      return hasExactKeys(value, ["type", "value"]) &&
          typeof value.value === "boolean"
        ? { type: "choice", value: value.value }
        : undefined;
    case "amount":
      return hasExactKeys(value, ["type", "amount"]) &&
          (value.amount === 0 || value.amount === 1 || value.amount === 2)
        ? { type: "amount", amount: value.amount }
        : undefined;
    case "orb":
      return hasExactKeys(value, ["type"], ["orb"]) &&
          (value.orb === undefined || isOrbAffinity(value.orb))
        ? { type: "orb", ...(value.orb ? { orb: value.orb } : {}) }
        : undefined;
    case "load":
      return hasExactKeys(value, ["type", "state"]) &&
          isFourPlayerState(value.state)
        ? { type: "load", state: prepareFourPlayerState(value.state) }
        : undefined;
    default:
      return undefined;
  }
};

export const normalizeFourPlayerActionEnvelope = (
  value: unknown,
): FourPlayerActionEnvelope | undefined => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "revision",
      "actionId",
      "participantId",
      "seat",
      "action",
    ]) ||
    !Number.isInteger(value.revision) ||
    Number(value.revision) < 0 ||
    !isNonEmptyString(value.actionId) ||
    !isNonEmptyString(value.participantId) ||
    !isSeat(value.seat)
  ) return undefined;
  const action = normalizeFourPlayerAction(value.action);
  if (!action) return undefined;
  return {
    revision: value.revision as number,
    actionId: value.actionId,
    participantId: value.participantId,
    seat: value.seat,
    action,
  };
};

export const fourPlayerParticipantSeats = (
  state: FourPlayerState,
  participantId: string,
) => FOUR_PLAYER_SEATS.filter((seat) => {
  const control = state.config.seats[seat].control;
  return control.kind === "online" && control.participantId === participantId;
});

export const fourPlayerHumanParticipantIds = (state: FourPlayerState) =>
  [...new Set(FOUR_PLAYER_SEATS.flatMap((seat) => {
    const control = state.config.seats[seat].control;
    return control.kind === "online" && control.participantId
      ? [control.participantId]
      : [];
  }))];

export const canParticipantSubmitFourPlayerAction = (
  state: FourPlayerState,
  participantId: string,
  seat: Seat,
  actionValue: unknown,
) => {
  const action = normalizeFourPlayerAction(actionValue);
  if (!action) return false;
  if (state.phase === "gameover" || state.activeSeat !== seat) return false;
  if (action.type === "load" || action.type === "restart") return false;
  const control = state.config.seats[seat].control;
  if (control.kind !== "online" || control.participantId !== participantId) return false;
  const next = fourPlayerReducer(state, action);
  return JSON.stringify(next) !== JSON.stringify(state);
};

export const applyAuthorizedFourPlayerAction = (
  state: FourPlayerState,
  envelopeValue: unknown,
  expectedRevision: number,
) => {
  const envelope = normalizeFourPlayerActionEnvelope(envelopeValue);
  if (!envelope) {
    throw new Error("Four-player action envelope is invalid.");
  }
  if (envelope.revision !== expectedRevision) {
    throw new Error("Four-player action revision does not match the host state.");
  }
  if (!canParticipantSubmitFourPlayerAction(
    state,
    envelope.participantId,
    envelope.seat,
    envelope.action,
  )) {
    throw new Error("Four-player action is not authorized for this participant and seat.");
  }
  return {
    revision: expectedRevision + 1,
    lastActionId: envelope.actionId,
    state: fourPlayerReducer(state, envelope.action),
  } satisfies FourPlayerStateEnvelope;
};

export const createFourPlayerStateEnvelope = (
  state: FourPlayerState,
  revision: number,
  lastActionId?: string,
): FourPlayerStateEnvelope => ({
  revision,
  lastActionId,
  state: prepareFourPlayerState(state),
});

export const normalizeFourPlayerStateEnvelope = (
  value: unknown,
): FourPlayerStateEnvelope | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<FourPlayerStateEnvelope>;
  if (
    !Number.isInteger(candidate.revision) ||
    Number(candidate.revision) < 0 ||
    (candidate.lastActionId !== undefined && typeof candidate.lastActionId !== "string") ||
    !isFourPlayerState(candidate.state)
  ) return undefined;
  return createFourPlayerStateEnvelope(
    candidate.state,
    candidate.revision!,
    candidate.lastActionId,
  );
};

export const createFourPlayerUndoProposal = (
  requestId: string,
  targetRevision: number,
  requestedBy: string,
  eligibleParticipantIds: string[],
): FourPlayerUndoProposal => ({
  requestId,
  targetRevision,
  requestedBy,
  eligibleParticipantIds: [...new Set(eligibleParticipantIds)],
  approvedParticipantIds: eligibleParticipantIds.includes(requestedBy)
    ? [requestedBy]
    : [],
});

export const approveFourPlayerUndo = (
  proposal: FourPlayerUndoProposal,
  participantId: string,
): FourPlayerUndoProposal => {
  if (!proposal.eligibleParticipantIds.includes(participantId)) {
    throw new Error("Participant is not eligible to approve this undo.");
  }
  return {
    ...proposal,
    approvedParticipantIds: [
      ...new Set([...proposal.approvedParticipantIds, participantId]),
    ],
  };
};

export const isFourPlayerUndoUnanimous = (
  proposal: FourPlayerUndoProposal,
) => proposal.eligibleParticipantIds.every((participantId) =>
  proposal.approvedParticipantIds.includes(participantId)
);
