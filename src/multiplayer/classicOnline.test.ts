import { describe, expect, it, vi } from "vitest";
import { createGame, gameReducer } from "../game/engine";
import type {
  MultiplayerTransport,
  NetworkCallbacks,
  TransportFactory,
} from "./network";
import { MultiplayerHost } from "./host";
import { MultiplayerPeer } from "./peer";
import {
  createProtocolMessage,
  type ProtocolMessage,
} from "./types";

class ClassicTransport implements MultiplayerTransport {
  connectedPeers: string[] = [];
  sent: Array<{ peerId: string; message: ProtocolMessage }> = [];
  broadcasts: ProtocolMessage[] = [];

  constructor(readonly callbacks: NetworkCallbacks) {}
  async hostRoom() {}
  async joinRoom() {}
  send(peerId: string, message: ProtocolMessage) {
    this.sent.push({ peerId, message });
  }
  sendToHost() {}
  broadcast(message: ProtocolMessage) {
    this.broadcasts.push(message);
  }
  disconnect() {}
}

describe("classic online protocol compatibility", () => {
  it("preserves completed Mount route history through state sync", () => {
    let transport!: ClassicTransport;
    const onStateSync = vi.fn();
    new MultiplayerPeer({
      onJoinAccepted: vi.fn(),
      onLobbyState: vi.fn(),
      onGameStart: vi.fn(),
      onStateSync,
      onUndoSettings: vi.fn(),
      onRejected: vi.fn(),
      onDisconnected: vi.fn(),
      onError: vi.fn(),
    }, (callbacks) => {
      transport = new ClassicTransport(callbacks);
      return transport;
    });

    let state = createGame(2);
    state.phase = "play";
    state.activeColor = "black";
    state.players.black.gods = ["chiron"];
    state.players.white.gods = ["ares"];
    state.players.black.orbs.white = 1;
    state = gameReducer(state, { type: "select-god", godId: "chiron" });
    state = gameReducer(state, { type: "select-ability", abilityId: "mount" });
    state = gameReducer(state, { type: "square", square: "b8" });
    state = gameReducer(state, { type: "square", square: "c6" });
    state = gameReducer(state, { type: "square", square: "b7" });
    state = gameReducer(state, { type: "square", square: "b6" });
    const synced = JSON.parse(JSON.stringify(state));

    transport.callbacks.onMessage("host-peer", createProtocolMessage(
      "classic",
      "host",
      { type: "state_sync", state: synced },
    ));

    expect(onStateSync).toHaveBeenCalledWith(expect.objectContaining({
      lastAction: "Black used Mount with Chiron: Knight b8 -> c6; Pawn b7 -> b6; 1 rider.",
    }));
  });

  it("keeps the existing join, turn, sync, and unanimous undo flow on versioned messages", async () => {
    let transport!: ClassicTransport;
    const factory: TransportFactory = (callbacks) => {
      transport = new ClassicTransport(callbacks);
      return transport;
    };
    let state = createGame(2, {
      mode: "online",
      hostName: "Host",
      guestName: "Guest",
    });
    const applyUndo = vi.fn(() => state);
    const host = new MultiplayerHost("Host", {
      getState: () => state,
      applyRemoteAction: (action) => {
        state = gameReducer(state, action);
        return state;
      },
      applyUndo,
      canUndo: () => true,
      onGuestJoined: vi.fn(),
      onGuestLeft: vi.fn(),
      onUndoSettings: vi.fn(),
      onError: vi.fn(),
    }, factory);
    await host.start();

    transport.callbacks.onMessage("guest-peer", createProtocolMessage(
      "classic",
      "peer",
      { type: "join_request", playerName: "Guest" },
    ));
    expect(transport.sent[0].message).toMatchObject({
      protocol: "god-chess-online",
      version: 1,
      variant: "classic",
      direction: "host",
      payload: { type: "join_accepted" },
    });

    host.startGame(state);
    transport.callbacks.onMessage("guest-peer", createProtocolMessage(
      "classic",
      "peer",
      {
        type: "game_action",
        action: { type: "draft", godId: "ares" },
      },
    ));
    expect(state.players.white.gods).toEqual(["ares"]);
    expect(transport.broadcasts.at(-2)).toMatchObject({
      payload: { type: "state_sync" },
    });

    host.setUndoConsent(true);
    transport.callbacks.onMessage("guest-peer", createProtocolMessage(
      "classic",
      "peer",
      { type: "undo_consent", enabled: true },
    ));
    transport.callbacks.onMessage("guest-peer", createProtocolMessage(
      "classic",
      "peer",
      { type: "undo_request" },
    ));
    expect(applyUndo).toHaveBeenCalled();
  });

  it("reports and drops malformed classic state messages before peer callbacks", () => {
    let transport!: ClassicTransport;
    const onStateSync = vi.fn();
    const onGameStart = vi.fn();
    const onError = vi.fn();
    new MultiplayerPeer({
      onJoinAccepted: vi.fn(),
      onLobbyState: vi.fn(),
      onGameStart,
      onStateSync,
      onUndoSettings: vi.fn(),
      onRejected: vi.fn(),
      onDisconnected: vi.fn(),
      onError,
    }, (callbacks) => {
      transport = new ClassicTransport(callbacks);
      return transport;
    });

    transport.callbacks.onInvalidMessage?.("host-peer");

    expect(onError).toHaveBeenCalledWith(
      "Received an invalid multiplayer message.",
    );
    expect(onGameStart).not.toHaveBeenCalled();
    expect(onStateSync).not.toHaveBeenCalled();
  });

  it("rejects forged move-first actor metadata and accepts the exact guest turn", async () => {
    let transport!: ClassicTransport;
    let state = createGame(2, {
      mode: "online",
      hostName: "Host",
      guestName: "Guest",
    });
    state.phase = "play";
    state.players.white.gods = ["anubis"];
    state.players.black.gods = ["ares"];
    const host = new MultiplayerHost("Host", {
      getState: () => state,
      applyRemoteAction: (action) => {
        state = gameReducer(state, action);
        return state;
      },
      applyUndo: vi.fn(),
      canUndo: () => false,
      onGuestJoined: vi.fn(),
      onGuestLeft: vi.fn(),
      onUndoSettings: vi.fn(),
      onError: vi.fn(),
    }, (callbacks) => {
      transport = new ClassicTransport(callbacks);
      return transport;
    });
    await host.start();
    transport.callbacks.onMessage("guest-peer", createProtocolMessage(
      "classic",
      "peer",
      { type: "join_request", playerName: "Guest" },
    ));
    host.startGame(state);

    const action = {
      type: "commit-move-first" as const,
      godId: "anubis" as const,
      abilityId: "construction",
      move: { from: "e2", to: "e4" },
      expectedActor: "white" as const,
      expectedTurn: state.turn,
    };
    transport.callbacks.onMessage("guest-peer", createProtocolMessage(
      "classic",
      "peer",
      {
        type: "game_action",
        action: { ...action, expectedActor: "black" },
      },
    ));
    expect(state.board.e2).toBeDefined();
    expect(state.board.e4).toBeUndefined();

    transport.callbacks.onMessage("guest-peer", createProtocolMessage(
      "classic",
      "peer",
      { type: "game_action", action },
    ));
    expect(state.board.e2).toBeUndefined();
    expect(state.board.e4).toBeDefined();
    expect(state.activeColor).toBe("black");
  });
});
