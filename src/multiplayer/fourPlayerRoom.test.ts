import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  availableFourPlayerActions,
  createFourPlayerGame,
  fourPlayerReducer,
} from "../game/fourPlayerEngine";
import { createFourPlayerStateEnvelope } from "../game/fourPlayerSession";
import { GODS } from "../game/gods";
import type {
  MultiplayerTransport,
  NetworkCallbacks,
  TransportFactory,
} from "./network";
import {
  createFourPlayerOnlineConfig,
  FourPlayerRoomHost,
  FourPlayerRoomPeer,
} from "./fourPlayerRoom";
import {
  createProtocolMessage,
  type FourPlayerHostMessage,
  type FourPlayerPeerMessage,
  type FourPlayerRoomSnapshot,
  type ProtocolMessage,
} from "./types";

class FakeTransport implements MultiplayerTransport {
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

  receive(peerId: string, payload: FourPlayerPeerMessage) {
    this.callbacks.onMessage(
      peerId,
      createProtocolMessage("four-player", "peer", payload),
    );
  }

  receiveHost(payload: FourPlayerHostMessage) {
    this.callbacks.onMessage(
      "host",
      createProtocolMessage("four-player", "host", payload),
    );
  }

  disconnectPeer(peerId: string) {
    this.callbacks.onPeerDisconnected(peerId, "peer-left");
  }

  hostPayloads(peerId: string) {
    return this.sent
      .filter((entry) => entry.peerId === peerId)
      .map((entry) => entry.message)
      .filter((message) =>
        message.variant === "four-player" && message.direction === "host"
      )
      .map((message) => message.payload as FourPlayerHostMessage);
  }
}

const setup = () => {
  let transport!: FakeTransport;
  const factory: TransportFactory = (callbacks) => {
    transport = new FakeTransport(callbacks);
    return transport;
  };
  const snapshots: ReturnType<FourPlayerRoomHost["snapshot"]["participants"]["slice"]> = [];
  const roomSnapshots: FourPlayerRoomHost["snapshot"][] = [];
  const errors: string[] = [];
  const host = new FourPlayerRoomHost("Host", {
    onSnapshot: (snapshot) => roomSnapshots.push(snapshot),
    onError: (error) => errors.push(error),
  }, factory);
  return { host, transport, roomSnapshots, errors, snapshots };
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
    (payload): payload is Extract<FourPlayerHostMessage, { type: "join_accepted" }> =>
      payload.type === "join_accepted",
  );
};

const latestRoomSnapshot = (
  transport: FakeTransport,
  peerId: string,
) => transport.hostPayloads(peerId)
  .filter((payload): payload is Extract<
    FourPlayerHostMessage,
    { type: "room_state" }
  > => payload.type === "room_state")
  .at(-1)?.snapshot;

const readyTwoHumanRoom = () => {
  const context = setup();
  const accepted = join(context.transport, "peer-1");
  expect(accepted).toBeTruthy();
  context.host.assignSeat(accepted!.participantId, "east");
  context.host.setHostReady(true);
  context.transport.receive("peer-1", { type: "ready", ready: true });
  return { ...context, accepted: accepted! };
};

describe("four-player authoritative room", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("accepts duplicate names, caps the room at four Humans, and keeps tokens private", () => {
    const { host, transport } = setup();
    const first = join(transport, "peer-1", "Host");
    const second = join(transport, "peer-2", "Host");
    const third = join(transport, "peer-3", "Host");
    const fourth = join(transport, "peer-4", "Host");

    expect(first && second && third).toBeTruthy();
    expect(fourth).toBeUndefined();
    expect(transport.hostPayloads("peer-4")).toContainEqual({
      type: "join_rejected",
      reason: "That room already has four Human participants.",
    });
    expect(host.snapshot.participants.map((participant) => participant.name))
      .toEqual(["Host", "Host", "Host", "Host"]);
    expect(JSON.stringify(host.snapshot)).not.toContain("reconnect");
  });

  it("projects recipient identity and authorizes readiness only for the sending participant", () => {
    const { host, transport } = setup();
    const first = join(transport, "peer-1", "First")!;
    const second = join(transport, "peer-2", "Second")!;
    host.assignSeat(first.participantId, "east");
    host.assignSeat(second.participantId, "south");

    const firstSnapshot = latestRoomSnapshot(transport, "peer-1")!;
    const secondSnapshot = latestRoomSnapshot(transport, "peer-2")!;
    expect(firstSnapshot.participants.filter((participant) => participant.local))
      .toEqual([expect.objectContaining({ name: "First", seat: "east" })]);
    expect(secondSnapshot.participants.filter((participant) => participant.local))
      .toEqual([expect.objectContaining({ name: "Second", seat: "south" })]);
    expect(JSON.stringify(firstSnapshot)).not.toContain("participantId");
    expect(JSON.stringify(secondSnapshot)).not.toContain("participantId");

    transport.receive("peer-1", { type: "ready", ready: true });
    expect(host.snapshot.participants.find((participant) =>
      participant.participantId === first.participantId
    )?.ready).toBe(true);
    expect(host.snapshot.participants.find((participant) =>
      participant.participantId === second.participantId
    )?.ready).toBe(false);
    expect(host.snapshot.participants.find((participant) =>
      participant.host
    )?.ready).toBe(false);
    expect(latestRoomSnapshot(transport, "peer-2")?.participants.find(
      (participant) => participant.name === "First",
    )?.ready).toBe(true);

    transport.receive("stale-peer", { type: "ready", ready: true });
    expect(transport.hostPayloads("stale-peer")).toContainEqual({
      type: "error",
      message: "Join the room before sending actions.",
      resync: false,
    });
    expect(host.startErrors()).toContain(
      "Every connected participant must be ready.",
    );

    host.setHostReady(true);
    transport.receive("peer-2", { type: "ready", ready: true });
    expect(host.startErrors()).toEqual([]);
  });

  it("validates assignments/readiness and starts 2-, 3-, and 4-Human AI-filled games", () => {
    for (const humanCount of [2, 3, 4]) {
      const { host, transport } = setup();
      const accepted = Array.from({ length: humanCount - 1 }, (_, index) =>
        join(transport, `peer-${index + 1}`, `Guest ${index + 1}`)!
      );
      accepted.forEach((participant, index) =>
        host.assignSeat(participant.participantId, ["east", "south", "west"][index] as "east" | "south" | "west")
      );
      host.setHostReady(true);
      accepted.forEach((_, index) =>
        transport.receive(`peer-${index + 1}`, { type: "ready", ready: true })
      );

      expect(host.startErrors()).toEqual([]);
      expect(host.startGame()).toBe(true);
      const controls = Object.values(host.snapshot.canonical!.state.config.seats)
        .map((seat) => seat.control.kind);
      expect(controls.filter((kind) => kind === "online")).toHaveLength(humanCount);
      expect(controls.filter((kind) => kind === "ai")).toHaveLength(4 - humanCount);
      host.stop();
    }
  });

  it("rejects stale, duplicate, and unauthorized actions with sender-only resync", () => {
    const { host, transport, accepted } = readyTwoHumanRoom();
    expect(host.startGame()).toBe(true);
    expect(host.submitHostAction({ type: "draft", godId: GODS[0].id })).toBe(true);
    const before = transport.sent.length;

    transport.receive("peer-1", {
      type: "action",
      revision: 0,
      actionId: "stale",
      action: { type: "draft", godId: GODS[1].id },
    });
    expect(host.snapshot.canonical?.revision).toBe(1);
    expect(transport.sent.slice(before).every((entry) => entry.peerId === "peer-1")).toBe(true);

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
    expect(accepted.participantId).toBe(
      host.snapshot.participants.find((participant) =>
        participant.seat === "east"
      )?.participantId,
    );
  });

  it("pauses before an AI step, reconnects only with the opaque token, and resumes", () => {
    const { host, transport, accepted } = readyTwoHumanRoom();
    expect(host.startGame()).toBe(true);
    host.submitHostAction({ type: "draft", godId: GODS[0].id });
    transport.receive("peer-1", {
      type: "action",
      revision: 1,
      actionId: "guest-pick",
      action: { type: "draft", godId: GODS[1].id },
    });
    expect(host.snapshot.canonical?.state.activeSeat).toBe("south");
    transport.disconnectPeer("peer-1");
    const pausedRevision = host.snapshot.canonical?.revision;
    expect(host.snapshot.status).toBe("paused");
    vi.advanceTimersByTime(1000);
    expect(host.snapshot.canonical?.revision).toBe(pausedRevision);

    expect(join(transport, "wrong-peer", "Guest", "wrong-token")).toBeUndefined();
    expect(transport.hostPayloads("wrong-peer")).toContainEqual({
      type: "join_rejected",
      reason: "That reconnect token is not valid for this match.",
    });
    const rejoined = join(
      transport,
      "peer-reconnected",
      "Different display name",
      accepted.reconnectToken,
    );
    expect(rejoined?.participantId).toBe(accepted.participantId);
    expect(host.snapshot.status).toBe("playing");
    expect(latestRoomSnapshot(
      transport,
      "peer-reconnected",
    )?.participants.find((participant) => participant.local)).toMatchObject({
      name: "Guest",
      seat: "east",
      connected: true,
    });
    const rejoinedSnapshot = transport.hostPayloads("peer-reconnected")
      .filter((payload) => payload.type === "room_state")
      .at(-1);
    expect(rejoinedSnapshot?.type === "room_state"
      ? rejoinedSnapshot.snapshot.localUndoConsent
      : undefined).toBe(false);
  });

  it("keeps the reconnect token valid across an old/new connection race", () => {
    const { host, transport, accepted } = readyTwoHumanRoom();
    expect(host.startGame()).toBe(true);

    expect(join(
      transport,
      "peer-new",
      "Guest",
      accepted.reconnectToken,
    )).toBeUndefined();
    expect(transport.hostPayloads("peer-new")).toContainEqual({
      type: "join_rejected",
      reason: "That participant is already connected.",
    });

    transport.disconnectPeer("peer-1");
    const retried = join(
      transport,
      "peer-new",
      "Guest",
      accepted.reconnectToken,
    );
    expect(retried?.participantId).toBe(accepted.participantId);
    expect(host.snapshot.status).toBe("playing");
  });

  it("runs AI draft actions only through the host canonical revision chain", () => {
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
    vi.advanceTimersByTime(500);
    expect(host.snapshot.canonical!.revision).toBeGreaterThan(2);
    expect(host.snapshot.canonical?.lastActionId).toMatch(/^ai-action-/);
  });

  it("rewrites undo history when permanently replacing a disconnected seat with AI", () => {
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
    expect(host.replaceDisconnectedSeatWithAi("east", 9)).toBe(true);
    expect(host.snapshot.status).toBe("playing");
    expect(host.snapshot.participants.some((participant) =>
      participant.participantId === accepted.participantId
    )).toBe(false);
    expect(host.snapshot.canonical?.state.players.east.control).toEqual({
      kind: "ai",
      difficulty: 9,
    });

    host.setHostUndoConsent(true);
    expect(host.snapshot.undoAvailable).toBe(true);
    host.requestHostUndo();
    expect(host.snapshot.canonical?.state.players.east.control).toEqual({
      kind: "ai",
      difficulty: 9,
    });
    expect(host.snapshot.canonical?.state.config.seats.east.control).toEqual({
      kind: "ai",
      difficulty: 9,
    });
    expect(host.snapshot.canonical?.state.draft.pickIndex).toBe(0);
    expect(host.snapshot.canonical?.state.activeSeat).toBe("north");
  });

  it("requires every connected Human to consent before any participant can undo", () => {
    const { host, transport } = readyTwoHumanRoom();
    expect(host.startGame()).toBe(true);
    host.submitHostAction({ type: "draft", godId: GODS[0].id });
    transport.receive("peer-1", {
      type: "action",
      revision: 1,
      actionId: "guest-pick",
      action: { type: "draft", godId: GODS[1].id },
    });
    expect(host.snapshot.canonical?.state.draft.pickIndex).toBe(2);

    host.setHostUndoConsent(true);
    expect(host.snapshot.undoAvailable).toBe(false);
    transport.receive("peer-1", { type: "undo_consent", enabled: true });
    expect(host.snapshot.undoAvailable).toBe(true);
    transport.receive("peer-1", { type: "undo_request" });
    expect(host.snapshot.canonical?.revision).toBe(3);
    expect(host.snapshot.canonical?.state.draft.pickIndex).toBe(1);
  });

  it("keeps authoritative undo available after the room reaches game over", () => {
    const { host, transport } = readyTwoHumanRoom();
    expect(host.startGame()).toBe(true);
    const canonical = host.snapshot.canonical!;
    let playable = canonical.state;
    while (playable.phase === "draft") {
      playable = fourPlayerReducer(
        playable,
        availableFourPlayerActions(playable)[0],
      );
    }
    const finished = structuredClone(playable);
    finished.phase = "gameover";
    finished.winner = {
      seat: "north",
      reason: "last-player",
    };
    Reflect.set(
      host,
      "canonical",
      createFourPlayerStateEnvelope(
        finished,
        canonical.revision + 1,
        "finish",
      ),
    );
    Reflect.set(host, "status", "finished");
    Reflect.set(host, "undoStack", [playable]);

    host.setHostUndoConsent(true);
    transport.receive("peer-1", { type: "undo_consent", enabled: true });
    expect(host.snapshot.undoAvailable).toBe(true);
    host.requestHostUndo();
    expect(host.snapshot.status).toBe("playing");
    expect(host.snapshot.canonical?.state.phase).not.toBe("gameover");
  });

  it("ignores canonical room states delivered out of revision order", () => {
    let transport!: FakeTransport;
    const snapshots: FourPlayerRoomSnapshot[] = [];
    const peer = new FourPlayerRoomPeer({
      onAccepted: vi.fn(),
      onSnapshot: (snapshot) => snapshots.push(snapshot),
      onRejected: vi.fn(),
      onDisconnected: vi.fn(),
      onError: vi.fn(),
    }, (callbacks) => {
      transport = new FakeTransport(callbacks);
      return transport;
    });
    const config = createFourPlayerOnlineConfig();
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
    const lobby: FourPlayerRoomSnapshot = {
      roomCode: "ABCDE",
      status: "lobby",
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
      localUndoConsent: false,
      undoAvailable: false,
    };
    const newer = {
      ...lobby,
      status: "playing" as const,
      canonical: createFourPlayerStateEnvelope(state, 5, "newer"),
    };
    const older = {
      ...newer,
      canonical: createFourPlayerStateEnvelope(state, 4, "older"),
    };

    transport.receiveHost({ type: "room_state", snapshot: newer });
    transport.receiveHost({ type: "room_state", snapshot: older });

    expect(snapshots).toEqual([newer]);
    peer.disconnect();
  });
});
