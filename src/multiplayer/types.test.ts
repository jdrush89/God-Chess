import { describe, expect, it } from "vitest";
import { createGame } from "../game/engine";
import { createFourPlayerGame } from "../game/fourPlayerEngine";
import { createFourPlayerStateEnvelope } from "../game/fourPlayerSession";
import {
  createProtocolMessage,
  MULTIPLAYER_PROTOCOL_VERSION,
  normalizeProtocolMessage,
  normalizeFourPlayerRoomSnapshot,
  type FourPlayerRoomSnapshot,
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

describe("versioned multiplayer protocol", () => {
  it("round-trips classic and four-player messages without ambiguity", () => {
    const classic = createProtocolMessage("classic", "host", {
      type: "state_sync",
      state: createGame(undefined, { mode: "online" }),
    });
    const four = createProtocolMessage("four-player", "host", {
      type: "room_state",
      snapshot: fourSnapshot(),
    });

    expect(normalizeProtocolMessage(classic)).toEqual(classic);
    expect(normalizeProtocolMessage(four)).toEqual(four);
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
});
