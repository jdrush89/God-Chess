// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultFourPlayerConfig } from "../game/fourPlayerConfig";
import { createFourPlayerGame } from "../game/fourPlayerEngine";
import { createFourPlayerStateEnvelope } from "../game/fourPlayerSession";
import { FOUR_PLAYER_SEATS } from "../game/fourPlayerTypes";
import type { FourPlayerRoomSnapshot } from "./types";

const peerHarness = vi.hoisted(() => ({
  instances: [] as Array<{
    callbacks: {
      onAccepted: (
        participantId: string,
        reconnectToken: string,
        roomCode: string,
      ) => void;
      onSnapshot: (snapshot: FourPlayerRoomSnapshot) => void;
      onRejected: (reason: string) => void;
      onDisconnected: (roomEnded: boolean) => void;
    };
    connectArgs: unknown[][];
    readyCalls: boolean[];
  }>,
}));

vi.mock("./fourPlayerRoom", () => ({
  FourPlayerRoomHost: class {
    stop() {}
  },
  FourPlayerRoomPeer: class {
    connectArgs: unknown[][] = [];
    readyCalls: boolean[] = [];

    constructor(readonly callbacks: {
      onAccepted: (
        participantId: string,
        reconnectToken: string,
        roomCode: string,
      ) => void;
      onSnapshot: (snapshot: FourPlayerRoomSnapshot) => void;
      onRejected: (reason: string) => void;
      onDisconnected: (roomEnded: boolean) => void;
    }) {
      peerHarness.instances.push(this);
    }

    async connect(...args: unknown[]) {
      this.connectArgs.push(args);
    }

    disconnect() {}
    setReady(ready: boolean) {
      this.readyCalls.push(ready);
    }
    sendAction() {}
    setUndoConsent() {}
    requestUndo() {}
  },
}));

import {
  fourPlayerOnlineLocalSeat,
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
  const config = createDefaultFourPlayerConfig();
  for (const seat of FOUR_PLAYER_SEATS) {
    config.seats[seat].name = `${seat} AI`;
    config.seats[seat].control = { kind: "ai", difficulty: 5 };
  }
  config.seats.north = {
    ...config.seats.north,
    name: "Host",
    control: { kind: "online", local: false },
  };
  config.seats.east = {
    ...config.seats.east,
    name: "Guest",
    control: { kind: "online", local: true },
  };
  const state = createFourPlayerGame(config);
  return {
    roomCode: "ABCDE",
    status: "playing",
    participants: [
      {
        name: "Host",
        host: true,
        connected: true,
        ready: true,
        local: false,
        seat: "north",
      },
      {
        name: "Guest",
        host: false,
        connected: true,
        ready: true,
        local: true,
        seat: "east",
      },
    ],
    config,
    canonical: createFourPlayerStateEnvelope(
      state,
      revision,
      lastActionId,
    ),
    localUndoConsent: false,
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

  it("uses recipient-local snapshot identity even when assignment arrives before acceptance", async () => {
    const { result } = renderHook(() => useFourPlayerOnlineGame());
    await act(async () => {
      await result.current[1].joinGame("ABCDE", "Guest");
    });
    const peer = peerHarness.instances[0];
    const { canonical: _canonical, ...lobby } = snapshot(0, "lobby");

    act(() => {
      peer.callbacks.onSnapshot({
        ...lobby,
        status: "lobby",
      });
    });
    expect(result.current[0].participantId).toBeUndefined();
    expect(fourPlayerOnlineLocalSeat(result.current[0])).toBe("east");

    act(() => {
      result.current[1].setReady(true);
    });
    expect(peer.readyCalls).toEqual([true]);

    act(() => {
      peer.callbacks.onAccepted("private-guest", "opaque-token", "ABCDE");
    });
    expect(result.current[0].participantId).toBe("private-guest");
    expect(fourPlayerOnlineLocalSeat(result.current[0])).toBe("east");
    expect(window.sessionStorage.getItem(reconnectStorageKey))
      .toBe("opaque-token");
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
