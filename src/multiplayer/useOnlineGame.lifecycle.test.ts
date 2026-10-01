// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGame, gameReducer } from "../game/engine";

const transportHarness = vi.hoisted(() => ({
  autoResolvePeer: true,
  peers: [] as Array<{
    resolveConnect: () => void;
    disconnected: boolean;
  }>,
}));

vi.mock("./host", () => ({
  MultiplayerHost: class {
    async start() {
      return "HOST1";
    }
    stop() {}
    startGame() {}
    syncState() {}
    setUndoConsent() {}
    requestUndo() {}
  },
}));

vi.mock("./peer", () => ({
  MultiplayerPeer: class {
    disconnected = false;
    private resolveConnectPromise!: () => void;
    private connectPromise = new Promise<void>((resolve) => {
      this.resolveConnectPromise = resolve;
    });

    constructor() {
      transportHarness.peers.push({
        resolveConnect: () => this.resolveConnectPromise(),
        get disconnected() {
          return thisPeer.disconnected;
        },
      });
      const thisPeer = this;
      if (transportHarness.autoResolvePeer) this.resolveConnectPromise();
    }

    async connect() {
      await this.connectPromise;
    }

    disconnect() {
      this.disconnected = true;
    }

    sendAction() {}
    sendUndoConsent() {}
    requestUndo() {}
  },
}));

import { useOnlineGame } from "./useOnlineGame";

describe("classic online connection lifecycle", () => {
  beforeEach(() => {
    transportHarness.autoResolvePeer = true;
    transportHarness.peers.length = 0;
  });

  afterEach(cleanup);

  it("does not restore a room after a pending join is disconnected", async () => {
    transportHarness.autoResolvePeer = false;
    const state = createGame(1, { mode: "online" });
    const { result } = renderHook(() => useOnlineGame({
      getState: () => state,
      applyRemoteAction: (action) => gameReducer(state, action),
      applyUndo: () => undefined,
      canUndo: () => false,
      receiveState: vi.fn(),
    }));
    let pending!: Promise<void>;

    act(() => {
      pending = result.current[1].joinGame("ABCDE", "Guest");
    });
    const peer = transportHarness.peers[0];
    expect(result.current[0]).toMatchObject({
      connecting: true,
      roomCode: "ABCDE",
    });

    act(() => {
      result.current[1].disconnect();
    });
    expect(result.current[0]).toMatchObject({
      role: "none",
      connecting: false,
    });
    expect(result.current[0].roomCode).toBeUndefined();

    await act(async () => {
      peer.resolveConnect();
      await pending;
    });
    expect(peer.disconnected).toBe(true);
    expect(result.current[0]).toMatchObject({
      role: "none",
      connecting: false,
    });
    expect(result.current[0].roomCode).toBeUndefined();
  });
});
