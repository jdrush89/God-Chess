import { describe, expect, it, vi } from "vitest";
import { createGame, gameReducer } from "../game/engine";
import type {
  MultiplayerTransport,
  NetworkCallbacks,
  TransportFactory,
} from "./network";
import { MultiplayerHost } from "./host";
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
});
