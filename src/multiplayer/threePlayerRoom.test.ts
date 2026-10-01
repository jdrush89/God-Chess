import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  availableThreePlayerActions,
  threePlayerReducer,
} from "../game/threePlayerEngine";
import { threePlayerCellAffinity } from "../game/threePlayerDivineGeometry";
import { getThreePlayerTopology } from "../game/threePlayerTopology";
import { createThreePlayerStateEnvelope } from "../game/threePlayerSession";
import { THREE_PLAYER_BOARD_VARIANTS } from "../game/threePlayerTypes";
import { GODS } from "../game/gods";
import type {
  MultiplayerTransport,
  NetworkCallbacks,
  PeerDisconnectReason,
  TransportFactory,
} from "./network";
import {
  ThreePlayerRoomHost,
  ThreePlayerRoomPeer,
  type ThreePlayerAiPlanner,
} from "./threePlayerRoom";
import {
  createProtocolMessage,
  type ProtocolMessage,
  type ThreePlayerHostMessage,
  type ThreePlayerPeerMessage,
  type ThreePlayerRoomSnapshot,
} from "./types";

class FakeTransport implements MultiplayerTransport {
  connectedPeers: string[] = [];
  sent: Array<{ peerId: string; message: ProtocolMessage }> = [];

  constructor(readonly callbacks: NetworkCallbacks) {}

  async hostRoom() {}
  async joinRoom() {}
  send(peerId: string, message: ProtocolMessage) {
    this.sent.push({ peerId, message });
  }
  sendToHost() {}
  broadcast() {}
  disconnect() {}

  receive(peerId: string, payload: ThreePlayerPeerMessage) {
    this.callbacks.onMessage(
      peerId,
      createProtocolMessage("three-player", "peer", payload),
    );
  }

  receiveHost(payload: ThreePlayerHostMessage) {
    this.callbacks.onMessage(
      "host",
      createProtocolMessage("three-player", "host", payload),
    );
  }

  disconnectPeer(
    peerId: string,
    reason: PeerDisconnectReason = "peer-left",
  ) {
    this.callbacks.onPeerDisconnected(peerId, reason);
  }

  hostPayloads(peerId: string) {
    return this.sent
      .filter((entry) => entry.peerId === peerId)
      .map((entry) => entry.message)
      .filter((message) =>
        message.variant === "three-player" && message.direction === "host"
      )
      .map((message) => message.payload as ThreePlayerHostMessage);
  }
}

const singleActionPlanner: ThreePlayerAiPlanner = async (state) =>
  availableThreePlayerActions(state).slice(0, 1);

const setup = (planner: ThreePlayerAiPlanner = singleActionPlanner) => {
  let transport!: FakeTransport;
  const factory: TransportFactory = (callbacks) => {
    transport = new FakeTransport(callbacks);
    return transport;
  };
  const snapshots: ThreePlayerRoomHost["snapshot"][] = [];
  const errors: string[] = [];
  const host = new ThreePlayerRoomHost("Host", {
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    onError: (error) => errors.push(error),
  }, factory, planner);
  return { host, transport, snapshots, errors };
};

const join = (
  transport: FakeTransport,
  peerId: string,
  playerName = "Guest",
  token?: string,
) => {
  transport.receive(peerId, {
    type: "join_request",
    playerName,
    ...(token ? { reconnectToken: token } : {}),
  });
  return transport.hostPayloads(peerId).find(
    (
      payload,
    ): payload is Extract<
      ThreePlayerHostMessage,
      { type: "join_accepted" }
    > => payload.type === "join_accepted",
  );
};

const readyTwoHumanRoom = () => {
  const context = setup();
  const accepted = join(context.transport, "peer-1");
  expect(accepted).toBeTruthy();
  context.host.assignSeat(accepted!.participantId, "red");
  context.host.setHostReady(true);
  context.transport.receive("peer-1", { type: "ready", ready: true });
  return { ...context, accepted: accepted! };
};

describe("three-player authoritative room", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("caps rooms at three Humans and never broadcasts private participant credentials", () => {
    const { host, transport } = setup();
    const first = join(transport, "peer-1", "Host");
    const second = join(transport, "peer-2", "Host");
    const third = join(transport, "peer-3", "Host");

    expect(first && second).toBeTruthy();
    expect(third).toBeUndefined();
    expect(transport.hostPayloads("peer-3")).toContainEqual({
      type: "join_rejected",
      reason: "That room already has three Human participants.",
    });
    expect(host.snapshot.participants.map((participant) => participant.name))
      .toEqual(["Host", "Host", "Host"]);

    for (const peerId of ["peer-1", "peer-2"]) {
      const roomStates = transport.hostPayloads(peerId).filter(
        (
          payload,
        ): payload is Extract<
          ThreePlayerHostMessage,
          { type: "room_state" }
        > => payload.type === "room_state",
      );
      for (const payload of roomStates) {
        expect(JSON.stringify(payload.snapshot)).not.toContain("reconnect");
        expect(JSON.stringify(payload.snapshot)).not.toContain("participantId");
        expect(payload.snapshot.participants.filter((participant) =>
          participant.local
        )).toHaveLength(1);
      }
    }
  });

  it("starts 2- and 3-Human rooms for every board variant with AI-filled seats", () => {
    for (const humanCount of [2, 3]) {
      for (const boardVariant of THREE_PLAYER_BOARD_VARIANTS) {
        const { host, transport } = setup();
        const accepted = Array.from({ length: humanCount - 1 }, (_, index) =>
          join(transport, `peer-${index + 1}`, `Guest ${index + 1}`)!
        );
        accepted.forEach((participant, index) =>
          host.assignSeat(
            participant.participantId,
            (["red", "black"] as const)[index],
          )
        );
        const config = structuredClone(host.snapshot.config);
        config.boardVariant = boardVariant;
        config.victoryMode = humanCount === 2
          ? "first-checkmate"
          : "last-survivor";
        config.takeover = humanCount === 3;
        host.updateConfig(config);
        host.setHostReady(true);
        accepted.forEach((_, index) =>
          transport.receive(`peer-${index + 1}`, {
            type: "ready",
            ready: true,
          })
        );

        expect(host.startErrors()).toEqual([]);
        expect(host.startGame()).toBe(true);
        expect(host.snapshot.canonical?.state.config.boardVariant)
          .toBe(boardVariant);
        const controls = Object.values(
          host.snapshot.canonical!.state.config.seats,
        ).map((seat) => seat.control.kind);
        expect(controls.filter((kind) => kind === "online"))
          .toHaveLength(humanCount);
        expect(controls.filter((kind) => kind === "ai"))
          .toHaveLength(3 - humanCount);
        host.stop();
      }
    }
  });

  it("rejects stale, duplicate, and unauthorized actions with sender-only resync", () => {
    const { host, transport } = readyTwoHumanRoom();
    expect(host.startGame()).toBe(true);
    expect(host.submitHostAction({
      type: "draft",
      godId: GODS[0].id,
    })).toBe(true);
    const before = transport.sent.length;

    transport.receive("peer-1", {
      type: "action",
      revision: 0,
      actionId: "stale",
      action: { type: "draft", godId: GODS[1].id },
    });
    expect(host.snapshot.canonical?.revision).toBe(1);
    expect(transport.sent.slice(before).every((entry) =>
      entry.peerId === "peer-1"
    )).toBe(true);

    transport.receive("peer-1", {
      type: "action",
      revision: 1,
      actionId: "guest-pick",
      action: { type: "draft", godId: GODS[1].id },
    });
    expect(host.snapshot.canonical?.revision).toBe(2);
    transport.receive("peer-1", {
      type: "action",
      revision: 2,
      actionId: "guest-pick",
      action: { type: "draft", godId: GODS[2].id },
    });
    expect(host.snapshot.canonical?.revision).toBe(2);
  });

  it("pauses AI delivery, preserves token-bound identity, and handles reconnect races", async () => {
    const { host, transport, accepted } = readyTwoHumanRoom();
    expect(host.startGame()).toBe(true);
    host.submitHostAction({ type: "draft", godId: GODS[0].id });
    transport.receive("peer-1", {
      type: "action",
      revision: 1,
      actionId: "guest-pick",
      action: { type: "draft", godId: GODS[1].id },
    });
    transport.disconnectPeer("peer-1");
    const pausedRevision = host.snapshot.canonical?.revision;
    expect(host.snapshot.status).toBe("paused");
    await vi.runAllTimersAsync();
    expect(host.snapshot.canonical?.revision).toBe(pausedRevision);

    expect(join(
      transport,
      "peer-new",
      "Guest",
      accepted.reconnectToken,
    )?.participantId).toBe(accepted.participantId);
    expect(host.snapshot.status).toBe("playing");

    expect(join(
      transport,
      "peer-race",
      "Guest",
      accepted.reconnectToken,
    )).toBeUndefined();
    expect(transport.hostPayloads("peer-race")).toContainEqual({
      type: "join_rejected",
      reason: "That participant is already connected.",
    });

    transport.disconnectPeer("peer-new");
    expect(join(
      transport,
      "peer-race",
      "Guest",
      accepted.reconnectToken,
    )?.participantId).toBe(accepted.participantId);
  });

  it("advances canonical revision for every host-owned AI primitive", async () => {
    const { host, transport } = readyTwoHumanRoom();
    expect(host.startGame()).toBe(true);
    host.submitHostAction({ type: "draft", godId: GODS[0].id });
    transport.receive("peer-1", {
      type: "action",
      revision: 1,
      actionId: "guest-pick",
      action: { type: "draft", godId: GODS[1].id },
    });
    expect(host.snapshot.canonical?.revision).toBe(2);

    await vi.advanceTimersByTimeAsync(181);
    expect(host.snapshot.canonical!.revision).toBe(3);
    expect(host.snapshot.canonical?.lastActionId).toMatch(/^ai-action-/);
  });

  it("rewrites canonical and every undo boundary when replacing a disconnected Human", async () => {
    const { host, transport, accepted } = readyTwoHumanRoom();
    expect(host.startGame()).toBe(true);
    host.submitHostAction({ type: "draft", godId: GODS[0].id });
    transport.receive("peer-1", {
      type: "action",
      revision: 1,
      actionId: "guest-pick",
      action: { type: "draft", godId: GODS[1].id },
    });
    transport.disconnectPeer("peer-1");

    expect(host.replaceDisconnectedSeatWithAi("red", 9)).toBe(true);
    expect(host.snapshot.participants.some((participant) =>
      participant.participantId === accepted.participantId
    )).toBe(false);
    expect(host.snapshot.canonical?.state.players.red.control).toEqual({
      kind: "ai",
      difficulty: 9,
    });

    await vi.runAllTimersAsync();
    expect(host.snapshot.canonical?.state.activeSeat).toBe("white");
    expect(host.snapshot.undoAvailable).toBe(true);
    expect(host.requestHostUndo()).toBe(true);
    expect(host.snapshot.canonical?.state.players.red.control).toEqual({
      kind: "ai",
      difficulty: 9,
    });
    expect(host.snapshot.canonical?.state.config.seats.red.control).toEqual({
      kind: "ai",
      difficulty: 9,
    });
    expect(host.snapshot.canonical?.state.draft.pickIndex).toBe(1);
  });

  it("requires an exact unanimous revision-bound undo vote and rejects stale votes", () => {
    const { host, transport } = readyTwoHumanRoom();
    expect(host.startGame()).toBe(true);
    host.submitHostAction({ type: "draft", godId: GODS[0].id });
    expect(host.snapshot.canonical?.state.draft.pickIndex).toBe(1);

    expect(host.requestHostUndo()).toBe(true);
    const rejected = host.snapshot.undoProposal!;
    expect(rejected.approvedCount).toBe(1);
    transport.receive("peer-1", {
      type: "undo_vote",
      requestId: rejected.requestId,
      targetRevision: rejected.targetRevision,
      approved: false,
    });
    expect(host.snapshot.undoProposal).toBeUndefined();
    expect(host.snapshot.canonical?.state.draft.pickIndex).toBe(1);

    expect(host.requestHostUndo()).toBe(true);
    const approved = host.snapshot.undoProposal!;
    transport.receive("peer-1", {
      type: "undo_vote",
      requestId: approved.requestId,
      targetRevision: approved.targetRevision - 1,
      approved: true,
    });
    expect(host.snapshot.canonical?.state.draft.pickIndex).toBe(1);
    transport.receive("peer-1", {
      type: "undo_vote",
      requestId: approved.requestId,
      targetRevision: approved.targetRevision,
      approved: true,
    });
    expect(host.snapshot.canonical?.state.draft.pickIndex).toBe(0);
    expect(host.snapshot.canonical?.revision).toBe(2);
    expect(host.snapshot.canonical?.lastActionId).toBe(approved.requestId);
  });

  it("coordinates authoritative unanimous undo from a finished room", () => {
    const { host, transport } = readyTwoHumanRoom();
    expect(host.startGame()).toBe(true);
    const canonical = host.snapshot.canonical!;
    let playable = canonical.state;
    while (playable.phase === "draft") {
      playable = threePlayerReducer(
        playable,
        availableThreePlayerActions(playable)[0],
      );
    }
    const finished = structuredClone(playable);
    finished.phase = "gameover";
    finished.result = { kind: "draw", reason: "stalemate-cycle" };
    finished.passCycle = {
      positionRevision: finished.positionRevision,
      passedSeats: ["white", "red", "black"],
    };
    finished.revision = canonical.revision + 1;
    Reflect.set(
      host,
      "canonical",
      createThreePlayerStateEnvelope(
        finished,
        "finish",
      ),
    );
    Reflect.set(host, "status", "finished");
    Reflect.set(host, "undoStack", [playable]);

    expect(host.snapshot.undoAvailable).toBe(true);
    expect(host.requestHostUndo()).toBe(true);
    const proposal = host.snapshot.undoProposal!;
    transport.receive("peer-1", {
      type: "undo_vote",
      requestId: proposal.requestId,
      targetRevision: proposal.targetRevision,
      approved: true,
    });
    expect(host.snapshot.status).toBe("playing");
    expect(host.snapshot.canonical?.state.phase).not.toBe("gameover");
  });

  it("pauses finished rooms until a disconnected Human reconnects or is replaced", () => {
    const { host, transport, accepted } = readyTwoHumanRoom();
    expect(host.startGame()).toBe(true);
    const canonical = host.snapshot.canonical!;
    let playable = canonical.state;
    while (playable.phase === "draft") {
      playable = threePlayerReducer(
        playable,
        availableThreePlayerActions(playable)[0],
      );
    }
    const finished = structuredClone(playable);
    finished.phase = "gameover";
    finished.result = { kind: "draw", reason: "stalemate-cycle" };
    finished.passCycle = {
      positionRevision: finished.positionRevision,
      passedSeats: ["white", "red", "black"],
    };
    Reflect.set(
      host,
      "canonical",
      createThreePlayerStateEnvelope(finished, "finish"),
    );
    Reflect.set(host, "status", "finished");
    Reflect.set(host, "undoStack", [playable]);

    transport.disconnectPeer("peer-1");
    expect(host.snapshot.status).toBe("paused");
    expect(host.snapshot.undoAvailable).toBe(false);
    expect(host.requestHostUndo()).toBe(false);

    expect(join(
      transport,
      "peer-reconnected",
      "Guest",
      accepted.reconnectToken,
    )?.participantId).toBe(accepted.participantId);
    expect(host.snapshot.status).toBe("finished");
    expect(host.snapshot.undoAvailable).toBe(true);
  });

  it("ignores canonical room states delivered out of revision order", () => {
    let transport!: FakeTransport;
    const snapshots: ThreePlayerRoomSnapshot[] = [];
    const peer = new ThreePlayerRoomPeer({
      onAccepted: vi.fn(),
      onSnapshot: (snapshot) => snapshots.push(snapshot),
      onRejected: vi.fn(),
      onDisconnected: vi.fn(),
      onError: vi.fn(),
    }, (callbacks) => {
      transport = new FakeTransport(callbacks);
      return transport;
    });
    const context = readyTwoHumanRoom();
    context.host.startGame();
    const current = context.transport.hostPayloads("peer-1").filter(
      (
        payload,
      ): payload is Extract<
        ThreePlayerHostMessage,
        { type: "room_state" }
      > => payload.type === "room_state" && Boolean(payload.snapshot.canonical),
    ).at(-1)!.snapshot;
    const newer = structuredClone(current);
    newer.canonical!.revision = 5;
    newer.canonical!.state.revision = 5;
    newer.canonical!.state.config.boardVariant = "three-hexagonal";
    newer.canonical!.state.turn = 2;
    newer.canonical!.lastActionId = "newer";
    const older = structuredClone(newer);
    older.canonical!.revision = 4;
    older.canonical!.state.revision = 4;
    older.canonical!.lastActionId = "older";

    transport.receiveHost({ type: "room_state", snapshot: newer });
    transport.receiveHost({ type: "room_state", snapshot: older });

    expect(snapshots).toEqual([newer]);
    const neutralCell = getThreePlayerTopology("three-hexagonal")
      .cellDescriptors.find((cell) => cell.geometricClass === 2)!.id;
    expect(threePlayerCellAffinity(
      snapshots[0].canonical!.state,
      neutralCell,
    )).toBe("dark");
    peer.disconnect();
  });
});
