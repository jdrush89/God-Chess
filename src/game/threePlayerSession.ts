import { threePlayerReducer } from "./threePlayerEngine";
import {
  isThreePlayerPromotion,
  prepareThreePlayerState,
} from "./threePlayerPersistence";
import { getThreePlayerTopology } from "./threePlayerTopology";
import {
  THREE_PLAYER_BOARD_VARIANTS,
  THREE_PLAYER_SEATS,
  type ThreePlayerAction,
  type ThreePlayerSeat,
  type ThreePlayerState,
} from "./threePlayerTypes";
import { GODS } from "./gods";
import type { GodId } from "./types";

export interface ThreePlayerActionEnvelope {
  revision: number;
  actionId: string;
  participantId: string;
  seat: ThreePlayerSeat;
  action: ThreePlayerAction;
}

export interface ThreePlayerStateEnvelope {
  revision: number;
  lastActionId?: string;
  state: ThreePlayerState;
}

export interface ThreePlayerUndoProposal {
  requestId: string;
  targetRevision: number;
  requestedBy: string;
  eligibleParticipantIds: string[];
  approvedParticipantIds: string[];
}

const GOD_IDS = new Set(GODS.map((god) => god.id));
const VALID_CELLS = new Set(
  THREE_PLAYER_BOARD_VARIANTS.flatMap(
    (variant) => getThreePlayerTopology(variant).cells,
  ),
);

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
const isSeat = (value: unknown): value is ThreePlayerSeat =>
  typeof value === "string" &&
  THREE_PLAYER_SEATS.includes(value as ThreePlayerSeat);
const isGodId = (value: unknown): value is GodId =>
  typeof value === "string" && GOD_IDS.has(value as GodId);
const isCell = (value: unknown): value is string =>
  typeof value === "string" && VALID_CELLS.has(value);

export const normalizeThreePlayerAction = (
  value: unknown,
): ThreePlayerAction | undefined => {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  if (value.type === "draft") {
    return hasExactKeys(value, ["type", "godId"]) && isGodId(value.godId)
      ? { type: "draft", godId: value.godId }
      : undefined;
  }
  if (value.type === "move") {
    if (
      !hasExactKeys(value, ["type", "from", "to"], ["promotion"]) ||
      !isCell(value.from) ||
      !isCell(value.to) ||
      (
        value.promotion !== undefined &&
        !isThreePlayerPromotion(value.promotion)
      )
    ) return undefined;
    return {
      type: "move",
      from: value.from,
      to: value.to,
      ...(value.promotion ? { promotion: value.promotion } : {}),
    };
  }
  if (value.type === "load") {
    if (!hasExactKeys(value, ["type", "state"])) return undefined;
    try {
      return { type: "load", state: prepareThreePlayerState(value.state) };
    } catch {
      return undefined;
    }
  }
  if (value.type === "restart") {
    return hasExactKeys(value, ["type"]) ? { type: "restart" } : undefined;
  }
  return undefined;
};

export const normalizeThreePlayerActionEnvelope = (
  value: unknown,
): ThreePlayerActionEnvelope | undefined => {
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
  const action = normalizeThreePlayerAction(value.action);
  if (!action) return undefined;
  return {
    revision: value.revision as number,
    actionId: value.actionId,
    participantId: value.participantId,
    seat: value.seat,
    action,
  };
};

export const threePlayerParticipantSeats = (
  state: ThreePlayerState,
  participantId: string,
) => THREE_PLAYER_SEATS.filter((seat) => {
  const control = state.config.seats[seat].control;
  return control.kind === "online" && control.participantId === participantId;
});

export const threePlayerHumanParticipantIds = (state: ThreePlayerState) =>
  [...new Set(THREE_PLAYER_SEATS.flatMap((seat) => {
    const control = state.config.seats[seat].control;
    return control.kind === "online" && control.participantId
      ? [control.participantId]
      : [];
  }))];

export const canParticipantSubmitThreePlayerAction = (
  state: ThreePlayerState,
  participantId: string,
  seat: ThreePlayerSeat,
  actionValue: unknown,
) => {
  const action = normalizeThreePlayerAction(actionValue);
  if (!action || state.phase === "gameover" || state.activeSeat !== seat) {
    return false;
  }
  if (action.type === "load" || action.type === "restart") return false;
  const control = state.config.seats[seat].control;
  if (
    control.kind !== "online" ||
    control.participantId !== participantId
  ) return false;
  return threePlayerReducer(state, action) !== state;
};

export const applyAuthorizedThreePlayerAction = (
  state: ThreePlayerState,
  envelopeValue: unknown,
  expectedRevision: number,
): ThreePlayerStateEnvelope => {
  const envelope = normalizeThreePlayerActionEnvelope(envelopeValue);
  if (!envelope) {
    throw new Error("Three-player action envelope is invalid.");
  }
  if (
    envelope.revision !== expectedRevision ||
    state.revision !== expectedRevision
  ) {
    throw new Error("Three-player action revision does not match the host state.");
  }
  if (!canParticipantSubmitThreePlayerAction(
    state,
    envelope.participantId,
    envelope.seat,
    envelope.action,
  )) {
    throw new Error(
      "Three-player action is not authorized for this participant and seat.",
    );
  }
  const next = threePlayerReducer(state, envelope.action);
  return {
    revision: next.revision,
    lastActionId: envelope.actionId,
    state: next,
  };
};

export const createThreePlayerStateEnvelope = (
  state: ThreePlayerState,
  lastActionId?: string,
): ThreePlayerStateEnvelope => {
  const prepared = prepareThreePlayerState(state);
  return {
    revision: prepared.revision,
    lastActionId,
    state: prepared,
  };
};

export const normalizeThreePlayerStateEnvelope = (
  value: unknown,
): ThreePlayerStateEnvelope | undefined => {
  if (!isRecord(value) ||
      !hasExactKeys(value, ["revision", "state"], ["lastActionId"]) ||
      !Number.isInteger(value.revision) ||
      Number(value.revision) < 0 ||
      (value.lastActionId !== undefined &&
        typeof value.lastActionId !== "string")) return undefined;
  try {
    const state = prepareThreePlayerState(value.state);
    if (state.revision !== value.revision) return undefined;
    return createThreePlayerStateEnvelope(state, value.lastActionId as string | undefined);
  } catch {
    return undefined;
  }
};

export const createThreePlayerUndoProposal = (
  requestId: string,
  targetRevision: number,
  requestedBy: string,
  eligibleParticipantIds: string[],
): ThreePlayerUndoProposal => ({
  requestId,
  targetRevision,
  requestedBy,
  eligibleParticipantIds: [...new Set(eligibleParticipantIds)],
  approvedParticipantIds: eligibleParticipantIds.includes(requestedBy)
    ? [requestedBy]
    : [],
});

export const approveThreePlayerUndo = (
  proposal: ThreePlayerUndoProposal,
  participantId: string,
): ThreePlayerUndoProposal => {
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

export const isThreePlayerUndoUnanimous = (
  proposal: ThreePlayerUndoProposal,
) => proposal.eligibleParticipantIds.every((participantId) =>
  proposal.approvedParticipantIds.includes(participantId)
);
