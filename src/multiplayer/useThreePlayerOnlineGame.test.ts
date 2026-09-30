// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultThreePlayerConfig } from "../game/threePlayerConfig";
import { createThreePlayerGame } from "../game/threePlayerEngine";
import { createThreePlayerStateEnvelope } from "../game/threePlayerSession";
import type { ThreePlayerRoomSnapshot } from "./types";

const peerHarness = vi.hoisted(() => ({
  instances: [] as Array<{
    callbacks: {
      onRejected: (reason: string) => void;
      onDisconnected: (roomEnded: boolean) => void;
    };
    connectArgs: unknown[][];
  }>,
}));

vi.mock("./threePlayerRoom", () => ({
  ThreePlayerRoomHost: class {
    stop() {}
  },
  ThreePlayerRoomPeer: class {
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
    requestUndo() {}
    voteUndo() {}
  },
}));

import {
  reconcileThreePlayerSnapshot,
  threePlayerOnlineInputDisabled,
  useThreePlayerOnlineGame,
  type ThreePlayerOnlineState,
} from "./useThreePlayerOnlineGame";

const reconnectStorageKey =
  "god-chess-three-player-reconnect:ABCDE";

const snapshot = (
  revision: number,
  lastActionId: string,
): ThreePlayerRoomSnapshot => {
  const config = createDefaultThreePlayerConfig();
  config.seats.white.name = "Host";
  config.seats.white.name = "Guest";
  config.seats.white.control = { kind: "online", local: true };
  config.seats.red.name = "Guest";
  config.seats.red.name = "Host";
  config.seats.red.control = { kind: "online", local: false };
  config.seats.black.name = "Black Divine AI";
  config.seats.black.control = { kind: "ai", difficulty: 5 };
  const state = createThreePlayerGame(config);
  state.revision = revision;
  return {
    roomCode: "ABCDE",
    status: "playing",
    participants: [
      {
        name: "Guest",
        host: false,
        connected: true,
        ready: true,
        local: true,
        seat: "white",
      },
      {
        name: "Host",
        host: true,
        connected: true,
        ready: true,
        local: false,
        seat: "red",
      },
    ],
    config,
    canonical: createThreePlayerStateEnvelope(state, lastActionId),
    undoAvailable: false,
  };
};

describe("three-player online hook state", () => {
  beforeEach(() => {
    peerHarness.instances.length = 0;
    window.sessionStorage.clear();
  });

  afterEach(cleanup);

  it("keeps reconnect credentials through retryable races and transient loss", async () => {
    window.sessionStorage.setItem(reconnectStorageKey, "opaque-token");
    const { result } = renderHook(() => useThreePlayerOnlineGame());

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
    const invalid = renderHook(() => useThreePlayerOnlineGame());
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
    const ended = renderHook(() => useThreePlayerOnlineGame());
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
    const current: ThreePlayerOnlineState = {
      role: "peer",
      connecting: false,
      participantId: "guest",
      snapshot: currentSnapshot,
      awaitingActionId: "my-action",
    };

    expect(reconcileThreePlayerSnapshot(
      current,
      snapshot(4, "my-action"),
    )).toBe(current);

    const equalRevision = reconcileThreePlayerSnapshot(
      current,
      snapshot(5, "other-action"),
    );
    expect(equalRevision.awaitingActionId).toBe("my-action");
    expect(threePlayerOnlineInputDisabled(equalRevision)).toBe(true);

    const explicitAcknowledgement = reconcileThreePlayerSnapshot(
      current,
      snapshot(5, "my-action"),
    );
    expect(explicitAcknowledgement.awaitingActionId).toBeUndefined();
    expect(threePlayerOnlineInputDisabled(explicitAcknowledgement)).toBe(false);

    const advancedRevision = reconcileThreePlayerSnapshot(
      current,
      snapshot(6, "ai-action"),
    );
    expect(advancedRevision.awaitingActionId).toBeUndefined();
  });

  it("gates input during pause, votes, wrong seats, and non-local control", () => {
    const base: ThreePlayerOnlineState = {
      role: "peer",
      connecting: false,
      participantId: "guest",
      snapshot: snapshot(2, "ready"),
    };
    expect(threePlayerOnlineInputDisabled(base)).toBe(false);

    expect(threePlayerOnlineInputDisabled({
      ...base,
      snapshot: {
        ...base.snapshot!,
        status: "paused",
        pausedSeat: "white",
        pausedParticipantName: "Guest",
      },
    })).toBe(true);

    expect(threePlayerOnlineInputDisabled({
      ...base,
      snapshot: {
        ...base.snapshot!,
        undoProposal: {
          requestId: "undo-1",
          targetRevision: 2,
          requestedByName: "Host",
          eligibleCount: 2,
          approvedCount: 1,
          localEligible: true,
          localApproved: false,
        },
      },
    })).toBe(true);

    const wrongSeat = structuredClone(base);
    wrongSeat.snapshot!.canonical!.state.activeSeat = "red";
    expect(threePlayerOnlineInputDisabled(wrongSeat)).toBe(true);

    const remoteControl = structuredClone(base);
    remoteControl.snapshot!.canonical!.state.players.white.control = {
      kind: "online",
      local: false,
    };
    expect(threePlayerOnlineInputDisabled(remoteControl)).toBe(true);
  });
});
