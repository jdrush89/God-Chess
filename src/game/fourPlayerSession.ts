import { fourPlayerReducer } from "./fourPlayerEngine";
import {
  isFourPlayerState,
  prepareFourPlayerState,
} from "./fourPlayerPersistence";
import {
  FOUR_PLAYER_SEATS,
  type FourPlayerAction,
  type FourPlayerState,
  type Seat,
} from "./fourPlayerTypes";

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
  action: FourPlayerAction,
) => {
  if (state.phase === "gameover" || state.activeSeat !== seat) return false;
  if (action.type === "load" || action.type === "restart") return false;
  const control = state.config.seats[seat].control;
  if (control.kind !== "online" || control.participantId !== participantId) return false;
  const next = fourPlayerReducer(state, action);
  return JSON.stringify(next) !== JSON.stringify(state);
};

export const applyAuthorizedFourPlayerAction = (
  state: FourPlayerState,
  envelope: FourPlayerActionEnvelope,
  expectedRevision: number,
) => {
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
