import {
  availableThreePlayerActions,
  threePlayerReducer,
} from "./threePlayerEngine";
import {
  isThreePlayerPromotion,
  prepareThreePlayerState,
} from "./threePlayerPersistence";
import { threePlayerPathIdBelongsToVariant } from "./threePlayerDivineGeometry";
import { getThreePlayerTopology } from "./threePlayerTopology";
import {
  THREE_PLAYER_BOARD_VARIANTS,
  THREE_PLAYER_SEATS,
  type ThreePlayerAction,
  type ThreePlayerBoardVariant,
  type ThreePlayerOrbAffinity,
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

export interface ThreePlayerUndoVote {
  requestId: string;
  targetRevision: number;
  approved: boolean;
}

const GOD_IDS = new Set(GODS.map((god) => god.id));
const ABILITY_IDS = new Set(
  GODS.flatMap((god) => god.abilities.map((ability) => ability.id)),
);
const VALID_CELLS = new Set(
  THREE_PLAYER_BOARD_VARIANTS.flatMap(
    (variant) => getThreePlayerTopology(variant).cells,
  ),
);
const ORB_AFFINITIES = new Set<ThreePlayerOrbAffinity>(["light", "dark"]);

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
const isBoundedString = (
  value: unknown,
  maximum: number,
): value is string =>
  isNonEmptyString(value) && value.length <= maximum;
const isRevision = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;
const isSeat = (value: unknown): value is ThreePlayerSeat =>
  typeof value === "string" &&
  THREE_PLAYER_SEATS.includes(value as ThreePlayerSeat);
const isGodId = (value: unknown): value is GodId =>
  typeof value === "string" && GOD_IDS.has(value as GodId);
const isCell = (value: unknown): value is string =>
  typeof value === "string" && VALID_CELLS.has(value);
const cellVariant = (value: string): ThreePlayerBoardVariant | undefined =>
  THREE_PLAYER_BOARD_VARIANTS.find((variant) =>
    getThreePlayerTopology(variant).cellSet.has(value)
  );
const pathVariant = (value: unknown): ThreePlayerBoardVariant | undefined =>
  typeof value === "string"
    ? THREE_PLAYER_BOARD_VARIANTS.find((variant) =>
      threePlayerPathIdBelongsToVariant(variant, value)
    )
    : undefined;
const isAbilityId = (value: unknown): value is string =>
  typeof value === "string" && ABILITY_IDS.has(value);

export const normalizeThreePlayerAction = (
  value: unknown,
): ThreePlayerAction | undefined => {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  if (value.type === "draft") {
    return hasExactKeys(value, ["type", "godId"]) && isGodId(value.godId)
      ? { type: "draft", godId: value.godId }
      : undefined;
  }
  if (value.type === "select-god") {
    return hasExactKeys(value, ["type", "godId"]) && isGodId(value.godId)
      ? { type: "select-god", godId: value.godId }
      : undefined;
  }
  if (value.type === "clear-god" || value.type === "confirm-ability" ||
      value.type === "pass" || value.type === "cancel" ||
      value.type === "restart") {
    return hasExactKeys(value, ["type"])
      ? { type: value.type }
      : undefined;
  }
  if (value.type === "select-ability" || value.type === "upgrade") {
    if (
      !hasExactKeys(value, ["type", "abilityId"]) ||
      !isAbilityId(value.abilityId)
    ) return undefined;
    return { type: value.type, abilityId: value.abilityId };
  }
  if (value.type === "cell") {
    return hasExactKeys(value, ["type", "cell"]) && isCell(value.cell)
      ? { type: "cell", cell: value.cell }
      : undefined;
  }
  if (value.type === "path") {
    return hasExactKeys(value, ["type", "pathId"]) &&
        typeof value.pathId === "string" && pathVariant(value.pathId)
      ? { type: "path", pathId: value.pathId }
      : undefined;
  }
  if (value.type === "seat") {
    return hasExactKeys(value, ["type", "seat"]) && isSeat(value.seat)
      ? { type: "seat", seat: value.seat }
      : undefined;
  }
  if (value.type === "grave") {
    return hasExactKeys(value, ["type", "pieceId"]) &&
        isNonEmptyString(value.pieceId)
      ? { type: "grave", pieceId: value.pieceId }
      : undefined;
  }
  if (value.type === "choice") {
    return hasExactKeys(value, ["type", "value"]) &&
        typeof value.value === "boolean"
      ? { type: "choice", value: value.value }
      : undefined;
  }
  if (value.type === "amount") {
    return hasExactKeys(value, ["type", "amount"]) &&
        typeof value.amount === "number" &&
        Number.isInteger(value.amount) &&
        [0, 1, 2].includes(value.amount)
      ? { type: "amount", amount: value.amount as 0 | 1 | 2 }
      : undefined;
  }
  if (value.type === "orb") {
    return hasExactKeys(value, ["type"], ["orb"]) &&
        (value.orb === undefined ||
          ORB_AFFINITIES.has(value.orb as ThreePlayerOrbAffinity))
      ? {
        type: "orb",
        ...(value.orb !== undefined
          ? { orb: value.orb as ThreePlayerOrbAffinity }
          : {}),
      }
      : undefined;
  }
  if (value.type === "move") {
    if (
      !hasExactKeys(value, ["type", "from", "to"], ["promotion"]) ||
      !isCell(value.from) ||
      !isCell(value.to) ||
      cellVariant(value.from) !== cellVariant(value.to) ||
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
  if (value.type === "commit-move-first") {
    if (
      !hasExactKeys(value, [
        "type",
        "godId",
        "abilityId",
        "move",
        "expectedSeat",
        "expectedTurn",
        "expectedRevision",
      ]) ||
      !isGodId(value.godId) ||
      !isAbilityId(value.abilityId) ||
      !isSeat(value.expectedSeat) ||
      !isRevision(value.expectedTurn) ||
      value.expectedTurn < 1 ||
      !isRevision(value.expectedRevision) ||
      !isRecord(value.move) ||
      !hasExactKeys(value.move, ["from", "to"]) ||
      !isCell(value.move.from) ||
      !isCell(value.move.to) ||
      cellVariant(value.move.from) !== cellVariant(value.move.to)
    ) return undefined;
    return {
      type: "commit-move-first",
      godId: value.godId,
      abilityId: value.abilityId,
      move: {
        from: value.move.from,
        to: value.move.to,
      },
      expectedSeat: value.expectedSeat,
      expectedTurn: value.expectedTurn as number,
      expectedRevision: value.expectedRevision as number,
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
  return undefined;
};

const actionMatchesVariant = (
  state: ThreePlayerState,
  action: ThreePlayerAction,
) => {
  const topology = getThreePlayerTopology(state.config.boardVariant);
  if (action.type === "move") {
    return topology.cellSet.has(action.from) && topology.cellSet.has(action.to);
  }
  if (action.type === "commit-move-first") {
    return topology.cellSet.has(action.move.from) &&
      topology.cellSet.has(action.move.to);
  }
  if (action.type === "cell") return topology.cellSet.has(action.cell);
  if (action.type === "path") {
    return threePlayerPathIdBelongsToVariant(
      state.config.boardVariant,
      action.pathId,
    );
  }
  return true;
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
    !isRevision(value.revision) ||
    !isBoundedString(value.actionId, 128) ||
    !isBoundedString(value.participantId, 128) ||
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
  if (!actionMatchesVariant(state, action)) return false;
  if (action.type === "load" || action.type === "restart") return false;
  const control = state.config.seats[seat].control;
  if (
    control.kind !== "online" ||
    control.participantId !== participantId
  ) return false;
  if (action.type === "commit-move-first") {
    return action.expectedSeat === seat &&
      action.expectedTurn === state.turn &&
      action.expectedRevision === state.revision &&
      threePlayerReducer(state, action) !== state;
  }
  if (!availableThreePlayerActions(state).some(
    (available) => JSON.stringify(available) === JSON.stringify(action),
  )) return false;
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

export const createRevisedThreePlayerStateEnvelope = (
  state: ThreePlayerState,
  revision: number,
  lastActionId?: string,
): ThreePlayerStateEnvelope => {
  if (!isRevision(revision)) {
    throw new Error("Three-player canonical revision is invalid.");
  }
  const prepared = prepareThreePlayerState(state);
  prepared.revision = revision;
  return createThreePlayerStateEnvelope(
    prepareThreePlayerState(prepared),
    lastActionId,
  );
};

export const normalizeThreePlayerStateEnvelope = (
  value: unknown,
): ThreePlayerStateEnvelope | undefined => {
  if (!isRecord(value) ||
      !hasExactKeys(value, ["revision", "state"], ["lastActionId"]) ||
      !isRevision(value.revision) ||
      (value.lastActionId !== undefined &&
        !isBoundedString(value.lastActionId, 128))) return undefined;
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
): ThreePlayerUndoProposal => {
  if (
    !isBoundedString(requestId, 128) ||
    !isRevision(targetRevision) ||
    !isBoundedString(requestedBy, 128) ||
    !eligibleParticipantIds.every((participantId) =>
      isBoundedString(participantId, 128)
    )
  ) {
    throw new Error("Three-player undo proposal is invalid.");
  }
  const eligible = [...new Set(eligibleParticipantIds)];
  return {
    requestId,
    targetRevision,
    requestedBy,
    eligibleParticipantIds: eligible,
    approvedParticipantIds: eligible.includes(requestedBy)
      ? [requestedBy]
      : [],
  };
};

export const normalizeThreePlayerUndoProposal = (
  value: unknown,
): ThreePlayerUndoProposal | undefined => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "requestId",
      "targetRevision",
      "requestedBy",
      "eligibleParticipantIds",
      "approvedParticipantIds",
    ]) ||
    !isBoundedString(value.requestId, 128) ||
    !isRevision(value.targetRevision) ||
    !isBoundedString(value.requestedBy, 128) ||
    !Array.isArray(value.eligibleParticipantIds) ||
    !Array.isArray(value.approvedParticipantIds)
  ) return undefined;
  const eligibleParticipantIds = value.eligibleParticipantIds;
  const approvedParticipantIds = value.approvedParticipantIds;
  if (
    !eligibleParticipantIds.every((participantId) =>
      isBoundedString(participantId, 128)
    ) ||
    new Set(eligibleParticipantIds).size !== eligibleParticipantIds.length ||
    !approvedParticipantIds.every((participantId) =>
      isBoundedString(participantId, 128) &&
      eligibleParticipantIds.includes(participantId)
    ) ||
    new Set(approvedParticipantIds).size !== approvedParticipantIds.length ||
    !eligibleParticipantIds.includes(value.requestedBy)
  ) return undefined;
  return {
    requestId: value.requestId,
    targetRevision: value.targetRevision,
    requestedBy: value.requestedBy,
    eligibleParticipantIds: [...eligibleParticipantIds] as string[],
    approvedParticipantIds: [...approvedParticipantIds] as string[],
  };
};

export const normalizeThreePlayerUndoVote = (
  value: unknown,
): ThreePlayerUndoVote | undefined => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "requestId",
      "targetRevision",
      "approved",
    ]) ||
    !isBoundedString(value.requestId, 128) ||
    !isRevision(value.targetRevision) ||
    typeof value.approved !== "boolean"
  ) return undefined;
  return {
    requestId: value.requestId,
    targetRevision: value.targetRevision,
    approved: value.approved,
  };
};

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
