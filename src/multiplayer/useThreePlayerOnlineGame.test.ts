// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultThreePlayerConfig } from "../game/threePlayerConfig";
import { createThreePlayerGame } from "../game/threePlayerEngine";
import { createThreePlayerStateEnvelope } from "../game/threePlayerSession";
import type { ThreePlayerRoomSnapshot } from "./types";

const peerHarness = vi.hoisted(() => ({
  autoResolveHost: true,
  autoResolvePeer: true,
  hosts: [] as Array<{
    callbacks: {
      onSnapshot: (snapshot: unknown) => void;
      onError: (error: string) => void;
    };
    resolveStart: () => void;
    stopped: boolean;
  }>,
  instances: [] as Array<{
    callbacks: {
      onAccepted: (
        participantId: string,
        token: string,
        roomCode: string,
      ) => void;
      onSnapshot: (snapshot: unknown) => void;
      onRejected: (reason: string) => void;
      onDisconnected: (roomEnded: boolean) => void;
      onError: (error: string) => void;
    };
    connectArgs: unknown[][];
    resolveConnect: () => void;
    disconnected: boolean;
  }>,
}));

vi.mock("./threePlayerRoom", () => ({
  ThreePlayerRoomHost: class {
    readonly hostParticipantId = "host";
    readonly snapshot = {};
    stopped = false;
    private resolveStartPromise!: () => void;
    private startPromise = new Promise<void>((resolve) => {
      this.resolveStartPromise = resolve;
    });

    constructor(readonly name: string, readonly callbacks: {
      onSnapshot: (snapshot: unknown) => void;
      onError: (error: string) => void;
    }) {
      peerHarness.hosts.push({
        callbacks,
        resolveStart: () => this.resolveStartPromise(),
        get stopped() {
          return thisHost.stopped;
        },
      });
      const thisHost = this;
      if (peerHarness.autoResolveHost) this.resolveStartPromise();
    }

    async start() {
      await this.startPromise;
      return "HOST1";
    }

    stop() {
      this.stopped = true;
    }
  },
  ThreePlayerRoomPeer: class {
    connectArgs: unknown[][] = [];
    disconnected = false;
    private resolveConnectPromise!: () => void;
    private connectPromise = new Promise<void>((resolve) => {
      this.resolveConnectPromise = resolve;
    });

    constructor(readonly callbacks: {
      onAccepted: (
        participantId: string,
        token: string,
        roomCode: string,
      ) => void;
      onSnapshot: (snapshot: unknown) => void;
      onRejected: (reason: string) => void;
      onDisconnected: (roomEnded: boolean) => void;
      onError: (error: string) => void;
    }) {
      peerHarness.instances.push({
        callbacks,
        connectArgs: this.connectArgs,
        resolveConnect: () => this.resolveConnectPromise(),
        get disconnected() {
          return thisPeer.disconnected;
        },
      });
      const thisPeer = this;
      if (peerHarness.autoResolvePeer) this.resolveConnectPromise();
    }

    async connect(...args: unknown[]) {
      this.connectArgs.push(args);
      await this.connectPromise;
    }

    disconnect() {
      this.disconnected = true;
    }
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
    peerHarness.autoResolveHost = true;
    peerHarness.autoResolvePeer = true;
    peerHarness.hosts.length = 0;
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

  it("cancels a delayed join before it completes and ignores late callbacks", async () => {
    peerHarness.autoResolvePeer = false;
    const { result } = renderHook(() => useThreePlayerOnlineGame());
    let pending!: Promise<void>;
    act(() => {
      pending = result.current[1].joinGame("ABCDE", "Guest");
    });
    const peer = peerHarness.instances[0];

    act(() => {
      result.current[1].disconnect();
    });
    expect(peer.disconnected).toBe(true);
    expect(result.current[0]).toEqual({
      role: "none",
      connecting: false,
    });

    act(() => {
      peer.callbacks.onAccepted("stale", "late-token", "ABCDE");
      peer.callbacks.onSnapshot(snapshot(4, "late"));
      peer.callbacks.onError("late error");
      peer.resolveConnect();
    });
    await act(async () => {
      await pending;
    });
    expect(result.current[0]).toEqual({
      role: "none",
      connecting: false,
    });
    expect(window.sessionStorage.getItem(reconnectStorageKey)).toBeNull();
  });

  it("stops a delayed host when the hook unmounts", async () => {
    peerHarness.autoResolveHost = false;
    const { result, unmount } = renderHook(() => useThreePlayerOnlineGame());
    let pending!: Promise<void>;
    act(() => {
      pending = result.current[1].hostGame("Host");
    });
    const host = peerHarness.hosts[0];

    unmount();
    expect(host.stopped).toBe(true);
    act(() => {
      host.callbacks.onSnapshot(snapshot(3, "late-host"));
      host.callbacks.onError("late host error");
      host.resolveStart();
    });
    await pending;
    expect(host.stopped).toBe(true);
  });

  it("disconnects a pending join when switching attempts and rejects stale completion", async () => {
    peerHarness.autoResolvePeer = false;
    peerHarness.autoResolveHost = false;
    const { result } = renderHook(() => useThreePlayerOnlineGame());
    let pendingJoin!: Promise<void>;
    let pendingHost!: Promise<void>;
    act(() => {
      pendingJoin = result.current[1].joinGame("ABCDE", "Guest");
    });
    const peer = peerHarness.instances[0];

    act(() => {
      pendingHost = result.current[1].hostGame("Host");
    });
    const host = peerHarness.hosts[0];
    expect(peer.disconnected).toBe(true);
    expect(result.current[0].playerName).toBe("Host");
    expect(result.current[0].connecting).toBe(true);

    act(() => {
      peer.callbacks.onAccepted("stale", "late-token", "ABCDE");
      peer.callbacks.onDisconnected(true);
      peer.resolveConnect();
    });
    await act(async () => {
      await pendingJoin;
    });
    expect(result.current[0].playerName).toBe("Host");
    expect(result.current[0].connecting).toBe(true);
    expect(window.sessionStorage.getItem(reconnectStorageKey)).toBeNull();

    act(() => host.resolveStart());
    await act(async () => {
      await pendingHost;
    });
    expect(result.current[0].role).toBe("host");
    expect(result.current[0].roomCode).toBe("HOST1");
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
