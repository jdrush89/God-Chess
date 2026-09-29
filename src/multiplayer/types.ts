import { allSquares } from "../game/chess";
import type { GameAction } from "../game/engine";
import {
  isFourPlayerConfig,
} from "../game/fourPlayerPersistence";
import {
  normalizeFourPlayerAction,
  normalizeFourPlayerStateEnvelope,
  type FourPlayerStateEnvelope,
} from "../game/fourPlayerSession";
import {
  FOUR_PLAYER_SEATS,
  type FourPlayerAction,
  type FourPlayerConfig,
  type Seat,
} from "../game/fourPlayerTypes";
import { GODS } from "../game/gods";
import type { Color, GameMode, GameState, GodId } from "../game/types";
import {
  isTwoPlayerGameState,
  prepareTwoPlayerState,
} from "../saves";

export const MULTIPLAYER_PROTOCOL = "god-chess-online";
export const MULTIPLAYER_PROTOCOL_VERSION = 1;

export type RoomVariant = "classic" | "four-player";
export type MessageDirection = "peer" | "host";

export interface OnlinePlayer {
  id: string;
  name: string;
}

export type PeerMessage =
  | { type: "join_request"; playerName: string }
  | { type: "game_action"; action: GameAction }
  | { type: "undo_consent"; enabled: boolean }
  | { type: "undo_request" };

export type HostMessage =
  | { type: "join_accepted"; player: OnlinePlayer; roomCode: string }
  | { type: "join_rejected"; reason: string }
  | { type: "lobby_state"; hostName: string; guest?: OnlinePlayer; roomCode: string }
  | { type: "game_start"; state: GameState; hostColor: Color; guestColor: Color }
  | { type: "state_sync"; state: GameState }
  | { type: "undo_settings"; hostEnabled: boolean; guestEnabled: boolean; canUndo: boolean }
  | { type: "guest_left" }
  | { type: "error"; message: string };

export type FourPlayerRoomStatus = "lobby" | "playing" | "paused" | "finished";

export interface FourPlayerParticipant {
  id: string;
  name: string;
  host: boolean;
  connected: boolean;
  ready: boolean;
  seat?: Seat;
}

export interface FourPlayerRoomSnapshot {
  roomCode: string;
  status: FourPlayerRoomStatus;
  hostParticipantId: string;
  participants: FourPlayerParticipant[];
  config: FourPlayerConfig;
  canonical?: FourPlayerStateEnvelope;
  pausedParticipantId?: string;
  pausedSeat?: Seat;
  undoConsents: Record<string, boolean>;
  undoAvailable: boolean;
}

export type FourPlayerPeerMessage =
  | { type: "join_request"; playerName: string; reconnectToken?: string }
  | { type: "ready"; ready: boolean }
  | {
    type: "action";
    revision: number;
    actionId: string;
    action: FourPlayerAction;
  }
  | { type: "undo_consent"; enabled: boolean }
  | { type: "undo_request" };

export type FourPlayerHostMessage =
  | {
    type: "join_accepted";
    participantId: string;
    reconnectToken: string;
    roomCode: string;
  }
  | { type: "join_rejected"; reason: string }
  | { type: "room_state"; snapshot: FourPlayerRoomSnapshot }
  | { type: "error"; message: string; resync: boolean };

export type ProtocolMessage =
  | {
    protocol: typeof MULTIPLAYER_PROTOCOL;
    version: typeof MULTIPLAYER_PROTOCOL_VERSION;
    variant: "classic";
    direction: "peer";
    payload: PeerMessage;
  }
  | {
    protocol: typeof MULTIPLAYER_PROTOCOL;
    version: typeof MULTIPLAYER_PROTOCOL_VERSION;
    variant: "classic";
    direction: "host";
    payload: HostMessage;
  }
  | {
    protocol: typeof MULTIPLAYER_PROTOCOL;
    version: typeof MULTIPLAYER_PROTOCOL_VERSION;
    variant: "four-player";
    direction: "peer";
    payload: FourPlayerPeerMessage;
  }
  | {
    protocol: typeof MULTIPLAYER_PROTOCOL;
    version: typeof MULTIPLAYER_PROTOCOL_VERSION;
    variant: "four-player";
    direction: "host";
    payload: FourPlayerHostMessage;
  };

export type NetworkMessage = ProtocolMessage;

const GOD_IDS = new Set(GODS.map((god) => god.id));
const ABILITY_IDS = new Set(GODS.flatMap((god) =>
  god.abilities.map((ability) => ability.id)
));
const SQUARES = new Set(allSquares);

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

const isRoomCode = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Z2-9]{5}$/.test(value);

const isBoolean = (value: unknown): value is boolean =>
  typeof value === "boolean";

const isRevision = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isColor = (value: unknown): value is Color =>
  value === "white" || value === "black";

const isSeat = (value: unknown): value is Seat =>
  typeof value === "string" && FOUR_PLAYER_SEATS.includes(value as Seat);

const isGodId = (value: unknown): value is GodId =>
  typeof value === "string" && GOD_IDS.has(value as GodId);

const isAbilityId = (value: unknown): value is string =>
  typeof value === "string" && ABILITY_IDS.has(value);

const isClassicSquare = (value: unknown): value is string =>
  typeof value === "string" && SQUARES.has(value);

const normalizeGameAction = (value: unknown): GameAction | undefined => {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  switch (value.type) {
    case "draft":
      return hasExactKeys(value, ["type", "godId"]) && isGodId(value.godId)
        ? { type: "draft", godId: value.godId }
        : undefined;
    case "auto-draft":
      return hasExactKeys(value, ["type", "godId"]) && isGodId(value.godId)
        ? { type: "auto-draft", godId: value.godId }
        : undefined;
    case "select-god":
      return hasExactKeys(value, ["type", "godId"]) && isGodId(value.godId)
        ? { type: "select-god", godId: value.godId }
        : undefined;
    case "load-game":
      return hasExactKeys(value, ["type", "state"]) &&
          isTwoPlayerGameState(value.state)
        ? { type: "load-game", state: prepareTwoPlayerState(value.state) }
        : undefined;
    case "clear-god":
    case "confirm-ability":
    case "marked-execute":
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
      return hasExactKeys(value, ["type", "square"]) &&
          isClassicSquare(value.square)
        ? { type: "square", square: value.square }
        : undefined;
    case "grave":
      return hasExactKeys(value, ["type", "pieceId"]) &&
          isNonEmptyString(value.pieceId)
        ? { type: "grave", pieceId: value.pieceId }
        : undefined;
    case "rage-resolve":
      return hasExactKeys(value, ["type", "spareFriendly"]) &&
          isBoolean(value.spareFriendly)
        ? { type: "rage-resolve", spareFriendly: value.spareFriendly }
        : undefined;
    case "barter":
      return hasExactKeys(value, ["type"], ["give"]) &&
          (value.give === undefined || isColor(value.give))
        ? { type: "barter", ...(value.give ? { give: value.give } : {}) }
        : undefined;
    case "resurrect-more":
      return hasExactKeys(value, ["type", "revive"]) && isBoolean(value.revive)
        ? { type: "resurrect-more", revive: value.revive }
        : undefined;
    case "harden-choice":
      return hasExactKeys(value, ["type", "keep"]) && isBoolean(value.keep)
        ? { type: "harden-choice", keep: value.keep }
        : undefined;
    case "siphon":
      return hasExactKeys(value, ["type", "amount"]) &&
          (value.amount === 0 || value.amount === 1 || value.amount === 2)
        ? { type: "siphon", amount: value.amount }
        : undefined;
    case "preview-upgrade":
      return hasExactKeys(value, ["type"], ["godId", "abilityId"]) &&
          (value.godId === undefined || isGodId(value.godId)) &&
          (value.abilityId === undefined || isAbilityId(value.abilityId))
        ? {
          type: "preview-upgrade",
          ...(value.godId ? { godId: value.godId } : {}),
          ...(value.abilityId ? { abilityId: value.abilityId } : {}),
        }
        : undefined;
    case "new-game":
      return hasExactKeys(value, ["type", "mode", "aiDifficulty"]) &&
          ["local", "ai", "online", "puzzle"].includes(String(value.mode)) &&
          typeof value.aiDifficulty === "number" &&
          Number.isInteger(value.aiDifficulty) &&
          value.aiDifficulty >= 1 &&
          value.aiDifficulty <= 10
        ? {
          type: "new-game",
          mode: value.mode as GameMode,
          aiDifficulty: value.aiDifficulty,
        }
        : undefined;
    default:
      return undefined;
  }
};

const normalizeOnlinePlayer = (value: unknown): OnlinePlayer | undefined => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["id", "name"]) ||
    !isBoundedString(value.id, 128) ||
    !isBoundedString(value.name, 24)
  ) return undefined;
  return { id: value.id, name: value.name };
};

const normalizeClassicPeerMessage = (value: unknown): PeerMessage | undefined => {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  switch (value.type) {
    case "join_request":
      return hasExactKeys(value, ["type", "playerName"]) &&
          typeof value.playerName === "string" &&
          value.playerName.length <= 128
        ? { type: "join_request", playerName: value.playerName }
        : undefined;
    case "game_action": {
      if (!hasExactKeys(value, ["type", "action"])) return undefined;
      const action = normalizeGameAction(value.action);
      return action ? { type: "game_action", action } : undefined;
    }
    case "undo_consent":
      return hasExactKeys(value, ["type", "enabled"]) && isBoolean(value.enabled)
        ? { type: "undo_consent", enabled: value.enabled }
        : undefined;
    case "undo_request":
      return hasExactKeys(value, ["type"]) ? { type: "undo_request" } : undefined;
    default:
      return undefined;
  }
};

const normalizeClassicHostMessage = (value: unknown): HostMessage | undefined => {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  switch (value.type) {
    case "join_accepted": {
      if (
        !hasExactKeys(value, ["type", "player", "roomCode"]) ||
        !isRoomCode(value.roomCode)
      ) return undefined;
      const player = normalizeOnlinePlayer(value.player);
      return player
        ? { type: "join_accepted", player, roomCode: value.roomCode }
        : undefined;
    }
    case "join_rejected":
      return hasExactKeys(value, ["type", "reason"]) &&
          typeof value.reason === "string" &&
          value.reason.length <= 500
        ? { type: "join_rejected", reason: value.reason }
        : undefined;
    case "lobby_state": {
      if (
        !hasExactKeys(value, ["type", "hostName", "roomCode"], ["guest"]) ||
        typeof value.hostName !== "string" ||
        !isRoomCode(value.roomCode)
      ) return undefined;
      const guest = value.guest === undefined
        ? undefined
        : normalizeOnlinePlayer(value.guest);
      if (value.guest !== undefined && !guest) return undefined;
      return {
        type: "lobby_state",
        hostName: value.hostName,
        roomCode: value.roomCode,
        ...(guest ? { guest } : {}),
      };
    }
    case "game_start":
      return hasExactKeys(value, [
        "type",
        "state",
        "hostColor",
        "guestColor",
      ]) &&
          isTwoPlayerGameState(value.state) &&
          isColor(value.hostColor) &&
          isColor(value.guestColor)
        ? {
          type: "game_start",
          state: prepareTwoPlayerState(value.state),
          hostColor: value.hostColor,
          guestColor: value.guestColor,
        }
        : undefined;
    case "state_sync":
      return hasExactKeys(value, ["type", "state"]) &&
          isTwoPlayerGameState(value.state)
        ? { type: "state_sync", state: prepareTwoPlayerState(value.state) }
        : undefined;
    case "undo_settings":
      return hasExactKeys(value, [
        "type",
        "hostEnabled",
        "guestEnabled",
        "canUndo",
      ]) &&
          isBoolean(value.hostEnabled) &&
          isBoolean(value.guestEnabled) &&
          isBoolean(value.canUndo)
        ? {
          type: "undo_settings",
          hostEnabled: value.hostEnabled,
          guestEnabled: value.guestEnabled,
          canUndo: value.canUndo,
        }
        : undefined;
    case "guest_left":
      return hasExactKeys(value, ["type"]) ? { type: "guest_left" } : undefined;
    case "error":
      return hasExactKeys(value, ["type", "message"]) &&
          typeof value.message === "string" &&
          value.message.length <= 500
        ? { type: "error", message: value.message }
        : undefined;
    default:
      return undefined;
  }
};

const normalizeFourPlayerParticipant = (
  value: unknown,
): FourPlayerParticipant | undefined => {
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      ["id", "name", "host", "connected", "ready"],
      ["seat"],
    ) ||
    !isBoundedString(value.id, 128) ||
    typeof value.name !== "string" ||
    value.name.length > 24 ||
    !isBoolean(value.host) ||
    !isBoolean(value.connected) ||
    !isBoolean(value.ready) ||
    (value.seat !== undefined && !isSeat(value.seat))
  ) return undefined;
  return {
    id: value.id,
    name: value.name,
    host: value.host,
    connected: value.connected,
    ready: value.ready,
    ...(value.seat ? { seat: value.seat } : {}),
  };
};

export const normalizeFourPlayerRoomSnapshot = (
  value: unknown,
): FourPlayerRoomSnapshot | undefined => {
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      [
        "roomCode",
        "status",
        "hostParticipantId",
        "participants",
        "config",
        "undoConsents",
        "undoAvailable",
      ],
      ["canonical", "pausedParticipantId", "pausedSeat"],
    ) ||
    !isRoomCode(value.roomCode) ||
    !["lobby", "playing", "paused", "finished"].includes(String(value.status)) ||
    !isBoundedString(value.hostParticipantId, 128) ||
    !Array.isArray(value.participants) ||
    !isFourPlayerConfig(value.config) ||
    !isRecord(value.undoConsents) ||
    !Object.values(value.undoConsents).every(isBoolean) ||
    !isBoolean(value.undoAvailable) ||
    (value.pausedParticipantId !== undefined &&
      !isBoundedString(value.pausedParticipantId, 128)) ||
    (value.pausedSeat !== undefined && !isSeat(value.pausedSeat))
  ) return undefined;
  const participants = value.participants.map(normalizeFourPlayerParticipant);
  if (
    participants.some((participant) => !participant) ||
    new Set(participants.map((participant) => participant!.id)).size !==
      participants.length ||
    !participants.some((participant) =>
      participant!.id === value.hostParticipantId && participant!.host
    )
  ) return undefined;
  const canonical = value.canonical === undefined
    ? undefined
    : normalizeFourPlayerStateEnvelope(value.canonical);
  if (value.canonical !== undefined && !canonical) return undefined;
  return {
    roomCode: value.roomCode,
    status: value.status as FourPlayerRoomStatus,
    hostParticipantId: value.hostParticipantId,
    participants: participants as FourPlayerParticipant[],
    config: structuredClone(value.config),
    ...(canonical ? { canonical } : {}),
    ...(value.pausedParticipantId
      ? { pausedParticipantId: value.pausedParticipantId }
      : {}),
    ...(value.pausedSeat ? { pausedSeat: value.pausedSeat } : {}),
    undoConsents: { ...value.undoConsents } as Record<string, boolean>,
    undoAvailable: value.undoAvailable,
  };
};

const normalizeFourPlayerPeerMessage = (
  value: unknown,
): FourPlayerPeerMessage | undefined => {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  switch (value.type) {
    case "join_request":
      return hasExactKeys(
        value,
        ["type", "playerName"],
        ["reconnectToken"],
      ) &&
          typeof value.playerName === "string" &&
          value.playerName.length <= 128 &&
          (value.reconnectToken === undefined ||
            isBoundedString(value.reconnectToken, 512))
        ? {
          type: "join_request",
          playerName: value.playerName,
          ...(value.reconnectToken
            ? { reconnectToken: value.reconnectToken }
            : {}),
        }
        : undefined;
    case "ready":
      return hasExactKeys(value, ["type", "ready"]) && isBoolean(value.ready)
        ? { type: "ready", ready: value.ready }
        : undefined;
    case "action": {
      if (
        !hasExactKeys(value, [
          "type",
          "revision",
          "actionId",
          "action",
        ]) ||
        !isRevision(value.revision) ||
        !isBoundedString(value.actionId, 128)
      ) return undefined;
      const action = normalizeFourPlayerAction(value.action);
      return action
        ? {
          type: "action",
          revision: value.revision,
          actionId: value.actionId,
          action,
        }
        : undefined;
    }
    case "undo_consent":
      return hasExactKeys(value, ["type", "enabled"]) && isBoolean(value.enabled)
        ? { type: "undo_consent", enabled: value.enabled }
        : undefined;
    case "undo_request":
      return hasExactKeys(value, ["type"]) ? { type: "undo_request" } : undefined;
    default:
      return undefined;
  }
};

const normalizeFourPlayerHostMessage = (
  value: unknown,
): FourPlayerHostMessage | undefined => {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  switch (value.type) {
    case "join_accepted":
      return hasExactKeys(value, [
        "type",
        "participantId",
        "reconnectToken",
        "roomCode",
      ]) &&
          isBoundedString(value.participantId, 128) &&
          isBoundedString(value.reconnectToken, 512) &&
          isRoomCode(value.roomCode)
        ? {
          type: "join_accepted",
          participantId: value.participantId,
          reconnectToken: value.reconnectToken,
          roomCode: value.roomCode,
        }
        : undefined;
    case "join_rejected":
      return hasExactKeys(value, ["type", "reason"]) &&
          typeof value.reason === "string" &&
          value.reason.length <= 500
        ? { type: "join_rejected", reason: value.reason }
        : undefined;
    case "room_state": {
      if (!hasExactKeys(value, ["type", "snapshot"])) return undefined;
      const snapshot = normalizeFourPlayerRoomSnapshot(value.snapshot);
      return snapshot ? { type: "room_state", snapshot } : undefined;
    }
    case "error":
      return hasExactKeys(value, ["type", "message", "resync"]) &&
          typeof value.message === "string" &&
          value.message.length <= 500 &&
          isBoolean(value.resync)
        ? {
          type: "error",
          message: value.message,
          resync: value.resync,
        }
        : undefined;
    default:
      return undefined;
  }
};

export const createProtocolMessage = <
  Variant extends RoomVariant,
  Direction extends MessageDirection,
>(
  variant: Variant,
  direction: Direction,
  payload: Extract<
    ProtocolMessage,
    { variant: Variant; direction: Direction }
  >["payload"],
): Extract<ProtocolMessage, { variant: Variant; direction: Direction }> => ({
  protocol: MULTIPLAYER_PROTOCOL,
  version: MULTIPLAYER_PROTOCOL_VERSION,
  variant,
  direction,
  payload,
}) as Extract<ProtocolMessage, { variant: Variant; direction: Direction }>;

export const normalizeProtocolMessage = (
  value: unknown,
): ProtocolMessage | undefined => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "protocol",
      "version",
      "variant",
      "direction",
      "payload",
    ]) ||
    value.protocol !== MULTIPLAYER_PROTOCOL ||
    value.version !== MULTIPLAYER_PROTOCOL_VERSION ||
    !["classic", "four-player"].includes(String(value.variant)) ||
    !["peer", "host"].includes(String(value.direction))
  ) return undefined;
  if (value.variant === "classic" && value.direction === "peer") {
    const payload = normalizeClassicPeerMessage(value.payload);
    return payload
      ? createProtocolMessage("classic", "peer", payload)
      : undefined;
  }
  if (value.variant === "classic" && value.direction === "host") {
    const payload = normalizeClassicHostMessage(value.payload);
    return payload
      ? createProtocolMessage("classic", "host", payload)
      : undefined;
  }
  if (value.variant === "four-player" && value.direction === "peer") {
    const payload = normalizeFourPlayerPeerMessage(value.payload);
    return payload
      ? createProtocolMessage("four-player", "peer", payload)
      : undefined;
  }
  const payload = normalizeFourPlayerHostMessage(value.payload);
  return payload
    ? createProtocolMessage("four-player", "host", payload)
    : undefined;
};
