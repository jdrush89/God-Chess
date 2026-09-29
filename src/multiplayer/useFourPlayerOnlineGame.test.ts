// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFourPlayerGame } from "../game/fourPlayerEngine";
import { createFourPlayerStateEnvelope } from "../game/fourPlayerSession";
import type { FourPlayerRoomSnapshot } from "./types";

const peerHarness = vi.hoisted(() => ({
  instances: [] as Array<{
    callbacks: {
      onRejected: (reason: string) => void;
      onDisconnected: (roomEnded: boolean) => void;
    };
    connectArgs: unknown[][];
  }>,
}));

vi.mock("./fourPlayerRoom", () => ({
  FourPlayerRoomHost: class {
    stop() {}
  },
  FourPlayerRoomPeer: class {
    connectArgs: unknown[][] = [];

    constructor(readonly callbacks: {
      onRejected: (reason: string) => void;
      onDisconnected: (roomEnded: boolean) => void;
    }) {
      peerHarness.instances.push(this);
    }

    async connect(...args: unknown[]) {
      this.connectArgs.push(args);
    }

    disconnect() {}
    setReady() {}
    sendAction() {}
    setUndoConsent() {}
    requestUndo() {}
  },
}));

import {
  reconcileFourPlayerSnapshot,
  useFourPlayerOnlineGame,
  type FourPlayerOnlineState,
} from "./useFourPlayerOnlineGame";

const reconnectStorageKey =
  "god-chess-four-player-reconnect:ABCDE";

const snapshot = (
  revision: number,
  lastActionId: string,
): FourPlayerRoomSnapshot => {
  const state = createFourPlayerGame();
  return {
    roomCode: "ABCDE",
    status: "playing",
    hostParticipantId: "host",
    participants: [
      {
        id: "host",
        name: "Host",
        host: true,
        connected: true,
        ready: true,
        seat: "north",
      },
      {
        id: "guest",
        name: "Guest",
        host: false,
        connected: true,
        ready: true,
        seat: "east",
      },
    ],
    config: state.config,
    canonical: createFourPlayerStateEnvelope(
      state,
      revision,
      lastActionId,
    ),
    undoConsents: { host: false, guest: false },
    undoAvailable: false,
  };
};

describe("four-player online hook state", () => {
  beforeEach(() => {
    peerHarness.instances.length = 0;
    window.sessionStorage.clear();
  });

  afterEach(cleanup);

  it("keeps reconnect credentials through an already-connected race and transient loss", async () => {
    window.sessionStorage.setItem(reconnectStorageKey, "opaque-token");
    const { result } = renderHook(() => useFourPlayerOnlineGame());

    await act(async () => {
      await result.current[1].joinGame("ABCDE", "Guest");
    });
    const first = peerHarness.instances[0];
    expect(first.connectArgs[0]).toEqual([
      "ABCDE",
      "Guest",
      "opaque-token",
    ]);

    act(() => {
      first.callbacks.onRejected("That participant is already connected.");
    });
    expect(window.sessionStorage.getItem(reconnectStorageKey))
      .toBe("opaque-token");

    await act(async () => {
      await result.current[1].joinGame("ABCDE", "Guest");
    });
    const retry = peerHarness.instances[1];
    expect(retry.connectArgs[0]?.[2]).toBe("opaque-token");

    act(() => {
      retry.callbacks.onDisconnected(false);
    });
    expect(window.sessionStorage.getItem(reconnectStorageKey))
      .toBe("opaque-token");

    act(() => {
      result.current[1].disconnect();
    });
    expect(window.sessionStorage.getItem(reconnectStorageKey)).toBeNull();
  });

  it("clears reconnect credentials only for invalid tokens or confirmed room end", async () => {
    window.sessionStorage.setItem(reconnectStorageKey, "invalid-token");
    const invalid = renderHook(() => useFourPlayerOnlineGame());
    await act(async () => {
      await invalid.result.current[1].joinGame("ABCDE", "Guest");
    });
    act(() => {
      peerHarness.instances[0].callbacks.onRejected(
        "That reconnect token is not valid for this match.",
      );
    });
    expect(window.sessionStorage.getItem(reconnectStorageKey)).toBeNull();
    invalid.unmount();

    window.sessionStorage.setItem(reconnectStorageKey, "valid-token");
    const ended = renderHook(() => useFourPlayerOnlineGame());
    await act(async () => {
      await ended.result.current[1].joinGame("ABCDE", "Guest");
    });
    act(() => {
      peerHarness.instances[1].callbacks.onDisconnected(true);
    });
    expect(window.sessionStorage.getItem(reconnectStorageKey)).toBeNull();
  });

  it("ignores older snapshots and keeps action locks until acknowledgement", () => {
    const currentSnapshot = snapshot(5, "other-action");
    const current: FourPlayerOnlineState = {
      role: "peer",
      connecting: false,
      participantId: "guest",
      snapshot: currentSnapshot,
      awaitingActionId: "my-action",
    };

    expect(reconcileFourPlayerSnapshot(
      current,
      snapshot(4, "my-action"),
    )).toBe(current);

    const equalRevision = reconcileFourPlayerSnapshot(
      current,
      snapshot(5, "other-action"),
    );
    expect(equalRevision.awaitingActionId).toBe("my-action");

    const explicitAcknowledgement = reconcileFourPlayerSnapshot(
      current,
      snapshot(5, "my-action"),
    );
    expect(explicitAcknowledgement.awaitingActionId).toBeUndefined();

    const advancedRevision = reconcileFourPlayerSnapshot(
      current,
      snapshot(6, "ai-action"),
    );
    expect(advancedRevision.awaitingActionId).toBeUndefined();
  });
});
