import { describe, expect, it } from "vitest";
import { createGame } from "../game/engine";
import { createFourPlayerGame } from "../game/fourPlayerEngine";
import { createFourPlayerStateEnvelope } from "../game/fourPlayerSession";
import { createDefaultThreePlayerConfig } from "../game/threePlayerConfig";
import { createThreePlayerGame } from "../game/threePlayerEngine";
import { createThreePlayerStateEnvelope } from "../game/threePlayerSession";
import {
  createProtocolMessage,
  MULTIPLAYER_PROTOCOL_VERSION,
  normalizeProtocolMessage,
  normalizeFourPlayerRoomSnapshot,
  type FourPlayerRoomSnapshot,
  type ThreePlayerRoomSnapshot,
} from "./types";

const fourSnapshot = (): FourPlayerRoomSnapshot => {
  const state = createFourPlayerGame();
  return {
    roomCode: "ABCDE",
    status: "playing",
    hostParticipantId: "host",
    participants: [
      {
        id: "host",
        name: "Same name",
        host: true,
        connected: true,
        ready: true,
        seat: "north",
      },
      {
        id: "guest",
        name: "Same name",
        host: false,
        connected: true,
        ready: true,
        seat: "east",
      },
    ],
    config: state.config,
    canonical: createFourPlayerStateEnvelope(state, 4, "action-4"),
    undoConsents: { host: true, guest: false },
    undoAvailable: false,
  };
};

const threeSnapshot = (): ThreePlayerRoomSnapshot => {
    const config = createDefaultThreePlayerConfig();
    config.seats.white.name = "Host";
    config.seats.white.control = { kind: "online", local: true };
    config.seats.red.name = "Guest";
    config.seats.red.control = { kind: "online", local: false };
    config.seats.black.name = "Black Divine AI";
    config.seats.black.control = { kind: "ai", difficulty: 5 };
    const state = createThreePlayerGame(config);
    return {
      roomCode: "ABCDE",
      status: "playing",
      participants: [
        {
          name: "Host",
          host: true,
          connected: true,
          ready: true,
          local: true,
          seat: "white",
        },
        {
          name: "Guest",
          host: false,
          connected: true,
          ready: true,
          local: false,
          seat: "red",
        },
      ],
      config,
      canonical: createThreePlayerStateEnvelope(state, "action-1"),
      undoAvailable: false,
  };
};

describe("versioned multiplayer protocol", () => {
  it("round-trips classic, four-player, and three-player messages without ambiguity", () => {
    const classic = createProtocolMessage("classic", "host", {
      type: "state_sync",
      state: createGame(undefined, { mode: "online" }),
    });
    const four = createProtocolMessage("four-player", "host", {
      type: "room_state",
      snapshot: fourSnapshot(),
    });
    const three = createProtocolMessage("three-player", "host", {
      type: "room_state",
      snapshot: threeSnapshot(),
    });

    expect(normalizeProtocolMessage(classic)).toEqual(classic);
    expect(normalizeProtocolMessage(four)).toEqual(four);
    expect(normalizeProtocolMessage(three)).toEqual(three);
    expect(normalizeProtocolMessage({
      ...classic,
      variant: "four-player",
    })).toBeUndefined();
  });

  it("rejects unknown versions, directions, extra keys, and malformed actions", () => {
    const action = createProtocolMessage("four-player", "peer", {
      type: "action",
      revision: 2,
      actionId: "action-3",
      action: { type: "draft", godId: "ares" },
    });

    expect(normalizeProtocolMessage({
      ...action,
      version: MULTIPLAYER_PROTOCOL_VERSION + 1,
    })).toBeUndefined();
    expect(normalizeProtocolMessage({ ...action, direction: "broadcast" })).toBeUndefined();
    expect(normalizeProtocolMessage({ ...action, unexpected: true })).toBeUndefined();
    expect(normalizeProtocolMessage({
      ...action,
      payload: {
        ...action.payload,
        action: { type: "draft", godId: "unknown" },
      },
    })).toBeUndefined();
  });

  it("rejects crash-shaped classic game states with missing or malformed nested fields", () => {
    const state = createGame(undefined, { mode: "online" });
    const missingRequiredField = structuredClone(state) as unknown as Record<string, unknown>;
    delete missingRequiredField.legalTargets;
    expect(normalizeProtocolMessage(createProtocolMessage(
      "classic",
      "host",
      { type: "state_sync", state: missingRequiredField as never },
    ))).toBeUndefined();

    const malformedPiece = structuredClone(state);
    (malformedPiece.board.a2 as unknown as { status: unknown }).status = null;
    expect(normalizeProtocolMessage(createProtocolMessage(
      "classic",
      "host",
      { type: "game_start", state: malformedPiece, hostColor: "white", guestColor: "black" },
    ))).toBeUndefined();

    const malformedPlayer = structuredClone(state);
    (malformedPlayer.players.white as unknown as { graveyard: unknown }).graveyard = [
      { piece: { id: "broken" }, capturedOnTurn: 1 },
    ];
    expect(normalizeProtocolMessage(createProtocolMessage(
      "classic",
      "host",
      { type: "state_sync", state: malformedPlayer },
    ))).toBeUndefined();
  });

  it("strictly validates public room snapshots without reconnect secrets", () => {
    const snapshot = fourSnapshot();
    expect(normalizeFourPlayerRoomSnapshot(snapshot)).toEqual(snapshot);
    expect(normalizeFourPlayerRoomSnapshot({
      ...snapshot,
      participants: [
        ...snapshot.participants,
        snapshot.participants[0],
      ],
    })).toBeUndefined();
    expect(normalizeFourPlayerRoomSnapshot({
      ...snapshot,
      reconnectToken: "must-never-broadcast",
    })).toBeUndefined();
  });

  it("rejects leaked three-player authorization identities and inconsistent room state", () => {
    const snapshot = threeSnapshot();
    const message = createProtocolMessage("three-player", "host", {
      type: "room_state",
      snapshot,
    });
    expect(normalizeProtocolMessage(message)).toEqual(message);

    expect(normalizeProtocolMessage({
      ...message,
      payload: {
        type: "room_state",
        snapshot: {
          ...snapshot,
          participants: [{
            ...snapshot.participants[0],
            participantId: "must-stay-private",
          }, snapshot.participants[1]],
        },
      },
    })).toBeUndefined();

    const leakedCanonical = structuredClone(snapshot);
    leakedCanonical.config.seats.white.control = {
      kind: "online",
      participantId: "host-private",
      local: true,
    };
    leakedCanonical.canonical!.state.config.seats.white.control =
      structuredClone(leakedCanonical.config.seats.white.control);
    leakedCanonical.canonical!.state.players.white.control =
      structuredClone(leakedCanonical.config.seats.white.control);
    expect(normalizeProtocolMessage(createProtocolMessage(
      "three-player",
      "host",
      { type: "room_state", snapshot: leakedCanonical },
    ))).toBeUndefined();

    expect(normalizeProtocolMessage(createProtocolMessage(
      "three-player",
      "host",
      {
        type: "room_state",
        snapshot: {
          ...snapshot,
          participants: snapshot.participants.map((participant) => ({
            ...participant,
            seat: "white" as const,
          })),
        },
      },
    ))).toBeUndefined();

    const coercedLevel = structuredClone(snapshot) as unknown as {
      canonical: {
        state: {
          board: Record<string, {
            status: {
              prepared?: { owner: string; level: string };
            };
          }>;
        };
      };
    };
    const piece = Object.values(coercedLevel.canonical.state.board)[0];
    piece.status.prepared = { owner: "white", level: "2" };
    expect(normalizeProtocolMessage(createProtocolMessage(
      "three-player",
      "host",
      { type: "room_state", snapshot: coercedLevel as never },
    ))).toBeUndefined();
  });
});
