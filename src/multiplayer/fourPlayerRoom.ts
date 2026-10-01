import {
  chooseFourPlayerAiPlan,
  isFourPlayerAiTurn,
} from "../game/fourPlayerAi";
import {
  createDefaultFourPlayerConfig,
  validateFourPlayerConfig,
} from "../game/fourPlayerConfig";
import {
  availableFourPlayerActions,
  createFourPlayerGame,
  fourPlayerReducer,
} from "../game/fourPlayerEngine";
import { prepareFourPlayerState } from "../game/fourPlayerPersistence";
import {
  applyAuthorizedFourPlayerAction,
  createFourPlayerStateEnvelope,
  type FourPlayerActionEnvelope,
  type FourPlayerStateEnvelope,
} from "../game/fourPlayerSession";
import {
  FOUR_PLAYER_SEATS,
  type FourPlayerAction,
  type FourPlayerConfig,
  type FourPlayerState,
  type Seat,
} from "../game/fourPlayerTypes";
import {
  generateRoomCode,
  NetworkManager,
  type MultiplayerTransport,
  type TransportFactory,
} from "./network";
import {
  createProtocolMessage,
  type FourPlayerHostMessage,
  type FourPlayerParticipant,
  type FourPlayerPeerMessage,
  type FourPlayerRoomSnapshot,
  type ProtocolMessage,
} from "./types";

interface PrivateParticipant extends FourPlayerParticipant {
  peerId?: string;
  reconnectToken: string;
}

export interface FourPlayerHostCallbacks {
  onSnapshot: (snapshot: FourPlayerRoomSnapshot) => void;
  onError: (error: string) => void;
}

export interface FourPlayerPeerCallbacks {
  onAccepted: (
    participantId: string,
    reconnectToken: string,
    roomCode: string,
  ) => void;
  onSnapshot: (snapshot: FourPlayerRoomSnapshot) => void;
  onRejected: (reason: string) => void;
  onDisconnected: (roomEnded: boolean) => void;
  onError: (error: string) => void;
}

const stableState = (state: FourPlayerState) =>
  (state.phase === "draft" ||
    state.phase === "play" ||
    state.phase === "upgrade" ||
    state.phase === "gameover") &&
  !state.selectedGod &&
  !state.selectedAbility &&
  !state.pending;

const stateChanged = (first: FourPlayerState, second: FourPlayerState) =>
  JSON.stringify(first) !== JSON.stringify(second);

const opaqueId = (prefix: string) => {
  const random = globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
};

const reconnectToken = () =>
  `${opaqueId("reconnect")}.${opaqueId("proof")}`;

const aiName = (seat: Seat) =>
  `${seat[0].toUpperCase()}${seat.slice(1)} Divine AI`;

const replaceSeatWithAi = (
  source: FourPlayerState,
  seat: Seat,
  difficulty: number,
) => {
  const state = prepareFourPlayerState(source);
  const name = aiName(seat);
  const control = { kind: "ai" as const, difficulty };
  state.config.seats[seat].name = name;
  state.config.seats[seat].control = control;
  state.players[seat].name = name;
  state.players[seat].control = control;
  return state;
};

export const createFourPlayerOnlineConfig = (): FourPlayerConfig => {
  const config = createDefaultFourPlayerConfig();
  for (const seat of FOUR_PLAYER_SEATS) {
    config.seats[seat].name = aiName(seat);
    config.seats[seat].control = { kind: "ai", difficulty: 5 };
  }
  return config;
};

export class FourPlayerRoomHost {
  readonly roomCode = generateRoomCode();
  readonly hostParticipantId = opaqueId("participant");

  private network: MultiplayerTransport;
  private participants = new Map<string, PrivateParticipant>();
  private peerParticipants = new Map<string, string>();
  private config = createFourPlayerOnlineConfig();
  private status: FourPlayerRoomSnapshot["status"] = "lobby";
  private canonical?: FourPlayerStateEnvelope;
  private undoConsents = new Map<string, boolean>();
  private undoStack: FourPlayerState[] = [];
  private turnStart?: FourPlayerState;
  private processedActionIds = new Set<string>();
  private aiTimer?: number;
  private aiActionsThisTurn = 0;
  private stopped = false;

  constructor(
    hostName: string,
    private callbacks: FourPlayerHostCallbacks,
    transportFactory: TransportFactory = (networkCallbacks) =>
      new NetworkManager(networkCallbacks),
  ) {
    const host: PrivateParticipant = {
      id: this.hostParticipantId,
      name: hostName.trim().slice(0, 24) || "Host",
      host: true,
      connected: true,
      ready: false,
      seat: "north",
      reconnectToken: reconnectToken(),
    };
    this.participants.set(host.id, host);
    this.undoConsents.set(host.id, false);
    this.applyAssignmentsToConfig();
    this.network = transportFactory({
      onMessage: (peerId, message) => this.handleMessage(peerId, message),
      onInvalidMessage: (peerId) => {
        if (this.peerParticipants.has(peerId)) {
          this.sendError(peerId, "Received an invalid multiplayer message.", true);
        }
      },
      onPeerConnected: () => {},
      onPeerDisconnected: (peerId) => this.handleDisconnect(peerId),
      onStatusChange: () => {},
      onError: callbacks.onError,
    });
  }

  get snapshot() {
    return this.createSnapshot();
  }

  async start() {
    await this.network.hostRoom(this.roomCode);
    this.publish();
    return this.roomCode;
  }

  setHostReady(ready: boolean) {
    const host = this.participants.get(this.hostParticipantId);
    if (!host || this.status !== "lobby") return;
    host.ready = ready;
    this.publish();
  }

  assignSeat(participantId: string, seat?: Seat) {
    if (this.status !== "lobby") return;
    const participant = this.participants.get(participantId);
    if (!participant || !participant.connected) return;
    for (const candidate of this.participants.values()) {
      if (candidate.id !== participantId && candidate.seat === seat) {
        candidate.seat = undefined;
        candidate.ready = false;
      }
    }
    participant.seat = seat;
    this.clearReadiness();
    this.applyAssignmentsToConfig();
    this.publish();
  }

  updateConfig(value: FourPlayerConfig) {
    if (this.status !== "lobby") return;
    const next = structuredClone(value);
    for (const seat of FOUR_PLAYER_SEATS) {
      const participant = [...this.participants.values()]
        .find((candidate) => candidate.seat === seat);
      if (participant) {
        next.seats[seat].name = participant.name;
        next.seats[seat].control = {
          kind: "online",
          participantId: participant.id,
          local: participant.host,
        };
      } else {
        const difficulty = next.seats[seat].control.kind === "ai"
          ? next.seats[seat].control.difficulty ?? 5
          : 5;
        next.seats[seat].name = aiName(seat);
        next.seats[seat].control = { kind: "ai", difficulty };
      }
    }
    try {
      validateFourPlayerConfig(next);
    } catch (error) {
      this.callbacks.onError(
        error instanceof Error ? error.message : "Invalid four-player setup.",
      );
      return;
    }
    this.config = next;
    this.clearReadiness();
    this.publish();
  }

  startGame() {
    const errors = this.startErrors();
    if (errors.length) {
      this.callbacks.onError(errors[0]);
      return false;
    }
    const state = createFourPlayerGame(this.config);
    this.canonical = createFourPlayerStateEnvelope(state, 0);
    this.status = "playing";
    this.undoStack = [];
    this.turnStart = undefined;
    this.processedActionIds.clear();
    this.aiActionsThisTurn = 0;
    for (const participant of this.participants.values()) {
      this.undoConsents.set(participant.id, false);
    }
    this.publish();
    this.scheduleAi();
    return true;
  }

  submitHostAction(action: FourPlayerAction) {
    const host = this.participants.get(this.hostParticipantId);
    if (!host?.seat || !this.canonical) return false;
    return this.applyHumanAction(host, opaqueId("action"), action);
  }

  setHostUndoConsent(enabled: boolean) {
    if (!this.canonical) return;
    this.undoConsents.set(this.hostParticipantId, enabled);
    this.publish();
  }

  requestHostUndo() {
    this.applyUndo(this.hostParticipantId);
  }

  replaceDisconnectedSeatWithAi(seat: Seat, difficulty: number) {
    if (this.status !== "paused" || !this.canonical) return false;
    const participant = [...this.participants.values()]
      .find((candidate) =>
        candidate.seat === seat && !candidate.connected && !candidate.host
      );
    if (!participant) return false;
    const level = Math.max(1, Math.min(10, Math.round(difficulty)));
    this.participants.delete(participant.id);
    this.undoConsents.delete(participant.id);
    if (participant.peerId) this.peerParticipants.delete(participant.peerId);

    const state = replaceSeatWithAi(this.canonical.state, seat, level);
    this.undoStack = this.undoStack.map((snapshot) =>
      replaceSeatWithAi(snapshot, seat, level)
    );
    this.turnStart = this.turnStart
      ? replaceSeatWithAi(this.turnStart, seat, level)
      : undefined;
    this.config = structuredClone(state.config);
    this.canonical = createFourPlayerStateEnvelope(
      state,
      this.canonical.revision + 1,
      opaqueId("replace-ai"),
    );
    this.resumeIfConnected();
    this.publish();
    this.scheduleAi();
    return true;
  }

  stop() {
    this.stopped = true;
    if (this.aiTimer !== undefined) globalThis.clearTimeout(this.aiTimer);
    this.aiTimer = undefined;
    this.network.disconnect();
    this.peerParticipants.clear();
  }

  startErrors() {
    const connected = [...this.participants.values()]
      .filter((participant) => participant.connected);
    const errors: string[] = [];
    if (connected.length < 2) {
      errors.push("At least two connected Human participants are required.");
    }
    if (connected.length > 4) {
      errors.push("Four-player rooms support at most four Human participants.");
    }
    if (!this.participants.get(this.hostParticipantId)?.seat) {
      errors.push("The host must be assigned to a seat.");
    }
    if (connected.some((participant) => !participant.seat)) {
      errors.push("Every connected participant must be assigned to one seat.");
    }
    if (connected.some((participant) => !participant.ready)) {
      errors.push("Every connected participant must be ready.");
    }
    try {
      validateFourPlayerConfig(this.config);
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : "Invalid four-player setup.",
      );
    }
    return [...new Set(errors)];
  }

  private handleMessage(peerId: string, message: ProtocolMessage) {
    if (message.variant !== "four-player" || message.direction !== "peer") return;
    const payload = message.payload;
    if (payload.type === "join_request") {
      this.handleJoin(peerId, payload);
      return;
    }
    const participantId = this.peerParticipants.get(peerId);
    const participant = participantId
      ? this.participants.get(participantId)
      : undefined;
    if (!participant || participant.peerId !== peerId || !participant.connected) {
      this.sendError(peerId, "Join the room before sending actions.", false);
      return;
    }
    switch (payload.type) {
      case "ready":
        if (this.status !== "lobby") {
          this.resync(peerId, "The match has already started.");
          return;
        }
        participant.ready = payload.ready;
        this.publish();
        return;
      case "action":
        this.applyPeerAction(peerId, participant, payload);
        return;
      case "undo_consent":
        if (!this.canonical) {
          this.resync(peerId, "Undo consent is available after the match starts.");
          return;
        }
        this.undoConsents.set(participant.id, payload.enabled);
        this.publish();
        return;
      case "undo_request":
        this.applyUndo(participant.id, peerId);
        return;
    }
  }

  private handleJoin(
    peerId: string,
    message: Extract<FourPlayerPeerMessage, { type: "join_request" }>,
  ) {
    if (message.reconnectToken) {
      const participant = [...this.participants.values()]
        .find((candidate) =>
          !candidate.host &&
          candidate.reconnectToken === message.reconnectToken
        );
      if (!participant || this.status === "lobby") {
        this.reject(peerId, "That reconnect token is not valid for this match.");
        return;
      }
      if (participant.connected) {
        this.reject(peerId, "That participant is already connected.");
        return;
      }
      participant.peerId = peerId;
      participant.connected = true;
      participant.ready = true;
      this.peerParticipants.set(peerId, participant.id);
      this.undoConsents.set(participant.id, false);
      this.accept(peerId, participant);
      this.resumeIfConnected();
      this.publish();
      this.scheduleAi();
      return;
    }
    if (this.status !== "lobby") {
      this.reject(peerId, "That game has already started.");
      return;
    }
    const connectedHumans = [...this.participants.values()]
      .filter((participant) => participant.connected).length;
    if (connectedHumans >= 4) {
      this.reject(peerId, "That room already has four Human participants.");
      return;
    }
    const existingParticipantId = this.peerParticipants.get(peerId);
    if (existingParticipantId) {
      const existing = this.participants.get(existingParticipantId);
      if (existing) {
        this.accept(peerId, existing);
        this.publish();
      }
      return;
    }
    const participant: PrivateParticipant = {
      id: opaqueId("participant"),
      name: message.playerName.trim().slice(0, 24) || "Guest",
      host: false,
      connected: true,
      ready: false,
      peerId,
      reconnectToken: reconnectToken(),
    };
    this.participants.set(participant.id, participant);
    this.peerParticipants.set(peerId, participant.id);
    this.undoConsents.set(participant.id, false);
    this.accept(peerId, participant);
    this.publish();
  }

  private handleDisconnect(peerId: string) {
    const participantId = this.peerParticipants.get(peerId);
    if (!participantId) return;
    this.peerParticipants.delete(peerId);
    const participant = this.participants.get(participantId);
    if (!participant) return;
    participant.peerId = undefined;
    this.undoConsents.set(participant.id, false);
    if (this.status === "lobby") {
      this.participants.delete(participant.id);
      this.undoConsents.delete(participant.id);
      this.applyAssignmentsToConfig();
      this.clearReadiness();
      this.publish();
      return;
    }
    participant.connected = false;
    participant.ready = false;
    this.status = "paused";
    if (this.aiTimer !== undefined) globalThis.clearTimeout(this.aiTimer);
    this.aiTimer = undefined;
    this.publish();
  }

  private applyPeerAction(
    peerId: string,
    participant: PrivateParticipant,
    message: Extract<FourPlayerPeerMessage, { type: "action" }>,
  ) {
    if (!this.canonical || this.status !== "playing") {
      this.resync(peerId, "The room is not accepting actions.");
      return;
    }
    if (this.processedActionIds.has(message.actionId)) {
      this.resync(peerId, "That action has already been processed.");
      return;
    }
    if (!participant.seat) {
      this.resync(peerId, "This participant has no assigned seat.");
      return;
    }
    const applied = this.applyHumanAction(
      participant,
      message.actionId,
      message.action,
      message.revision,
    );
    if (!applied) this.resync(peerId, "That action is stale or unauthorized.");
  }

  private applyHumanAction(
    participant: PrivateParticipant,
    actionId: string,
    action: FourPlayerAction,
    revision = this.canonical?.revision,
  ) {
    if (
      !this.canonical ||
      this.status !== "playing" ||
      !participant.seat ||
      revision === undefined
    ) return false;
    const envelope: FourPlayerActionEnvelope = {
      revision,
      actionId,
      participantId: participant.id,
      seat: participant.seat,
      action,
    };
    try {
      const current = this.canonical.state;
      const next = applyAuthorizedFourPlayerAction(
        current,
        envelope,
        this.canonical.revision,
      );
      this.recordBoundary(current, action, next.state);
      this.canonical = next;
      this.processedActionIds.add(actionId);
      this.trimProcessedActions();
      this.aiActionsThisTurn = 0;
      this.finishOrPublish();
      return true;
    } catch {
      return false;
    }
  }

  private applyAiAction(action: FourPlayerAction) {
    if (!this.canonical || this.status !== "playing") return false;
    const current = this.canonical.state;
    const nextState = fourPlayerReducer(current, action);
    if (!stateChanged(current, nextState)) return false;
    this.recordBoundary(current, action, nextState);
    const actionId = opaqueId("ai-action");
    this.canonical = createFourPlayerStateEnvelope(
      nextState,
      this.canonical.revision + 1,
      actionId,
    );
    this.processedActionIds.add(actionId);
    this.trimProcessedActions();
    this.finishOrPublish();
    return true;
  }

  private recordBoundary(
    current: FourPlayerState,
    action: FourPlayerAction,
    next: FourPlayerState,
  ) {
    const completedDraft =
      current.phase === "draft" &&
      next.draft.pickIndex !== current.draft.pickIndex;
    const completedTurn =
      current.phase === "play" &&
      (
        next.turn !== current.turn ||
        next.activeSeat !== current.activeSeat ||
        next.phase === "upgrade" ||
        next.phase === "gameover"
      );
    const completedUpgrade =
      action.type === "upgrade" &&
      current.phase === "upgrade" &&
      (
        next.phase !== current.phase ||
        next.activeSeat !== current.activeSeat ||
        next.upgradeQueue.length !== current.upgradeQueue.length
      );
    if (completedDraft) {
      this.undoStack.push(prepareFourPlayerState(current));
      if (next.phase === "play") this.turnStart = prepareFourPlayerState(next);
    } else if (completedTurn) {
      this.undoStack.push(prepareFourPlayerState(this.turnStart ?? current));
      this.turnStart = next.phase === "play" && stableState(next)
        ? prepareFourPlayerState(next)
        : undefined;
    } else if (completedUpgrade) {
      this.undoStack.push(prepareFourPlayerState(current));
      this.turnStart = next.phase === "play" && stableState(next)
        ? prepareFourPlayerState(next)
        : undefined;
    }
  }

  private applyUndo(requestedBy: string, peerId?: string) {
    if (
      !this.canonical ||
      !this.undoAvailable() ||
      !this.participants.has(requestedBy)
    ) {
      if (peerId) this.resync(peerId, "Undo is not currently available.");
      return false;
    }
    let restored = this.undoStack.pop();
    if (!restored) return false;
    while (
      isFourPlayerAiTurn(restored) &&
      this.undoStack.length
    ) {
      restored = this.undoStack.pop()!;
    }
    this.turnStart = restored.phase === "play" && stableState(restored)
      ? prepareFourPlayerState(restored)
      : undefined;
    this.canonical = createFourPlayerStateEnvelope(
      restored,
      this.canonical.revision + 1,
      opaqueId("undo"),
    );
    this.status = restored.phase === "gameover" ? "finished" : "playing";
    this.aiActionsThisTurn = 0;
    this.publish();
    this.scheduleAi();
    return true;
  }

  private scheduleAi() {
    if (
      this.stopped ||
      this.status !== "playing" ||
      !this.canonical ||
      !isFourPlayerAiTurn(this.canonical.state) ||
      this.aiTimer !== undefined
    ) return;
    this.aiTimer = globalThis.setTimeout(() => {
      this.aiTimer = undefined;
      if (
        this.status !== "playing" ||
        !this.canonical ||
        !isFourPlayerAiTurn(this.canonical.state)
      ) return;
      let action = chooseFourPlayerAiPlan(this.canonical.state)[0];
      if (this.aiActionsThisTurn >= 40 || !action) {
        const available = availableFourPlayerActions(this.canonical.state);
        action = available.find((candidate) =>
          candidate.type === "pass" || candidate.type === "cancel"
        ) ?? available[0];
        this.aiActionsThisTurn = 0;
      }
      if (!action) return;
      this.aiActionsThisTurn += 1;
      if (!this.applyAiAction(action)) this.aiActionsThisTurn = 0;
      this.scheduleAi();
    }, 220);
  }

  private finishOrPublish() {
    if (!this.canonical) return;
    if (this.canonical.state.phase === "gameover") this.status = "finished";
    this.publish();
    this.scheduleAi();
  }

  private clearReadiness() {
    for (const participant of this.participants.values()) {
      participant.ready = false;
    }
  }

  private applyAssignmentsToConfig() {
    for (const seat of FOUR_PLAYER_SEATS) {
      const participant = [...this.participants.values()]
        .find((candidate) => candidate.seat === seat);
      if (participant) {
        this.config.seats[seat].name = participant.name;
        this.config.seats[seat].control = {
          kind: "online",
          participantId: participant.id,
          local: participant.host,
        };
      } else {
        const difficulty = this.config.seats[seat].control.kind === "ai"
          ? this.config.seats[seat].control.difficulty ?? 5
          : 5;
        this.config.seats[seat].name = aiName(seat);
        this.config.seats[seat].control = { kind: "ai", difficulty };
      }
    }
  }

  private disconnectedParticipant() {
    return [...this.participants.values()]
      .find((participant) => !participant.connected && !participant.host);
  }

  private resumeIfConnected() {
    if (
      this.status === "paused" &&
      !this.disconnectedParticipant() &&
      this.canonical
    ) {
      this.status = this.canonical.state.phase === "gameover"
        ? "finished"
        : "playing";
    }
  }

  private undoAvailable() {
    if (
      (this.status !== "playing" && this.status !== "finished") ||
      !this.canonical ||
      !stableState(this.canonical.state) ||
      !this.undoStack.length
    ) {
      return false;
    }
    const connected = [...this.participants.values()]
      .filter((participant) => participant.connected);
    return connected.length >= 1 &&
      connected.every((participant) =>
        this.undoConsents.get(participant.id) === true
      );
  }

  private createSnapshot(): FourPlayerRoomSnapshot {
    const paused = this.disconnectedParticipant();
    return {
      roomCode: this.roomCode,
      status: this.status,
      hostParticipantId: this.hostParticipantId,
      participants: [...this.participants.values()].map((participant) => ({
        id: participant.id,
        name: participant.name,
        host: participant.host,
        connected: participant.connected,
        ready: participant.ready,
        ...(participant.seat ? { seat: participant.seat } : {}),
      })),
      config: structuredClone(this.config),
      ...(this.canonical
        ? {
          canonical: createFourPlayerStateEnvelope(
            this.canonical.state,
            this.canonical.revision,
            this.canonical.lastActionId,
          ),
        }
        : {}),
      ...(paused
        ? {
          pausedParticipantId: paused.id,
          ...(paused.seat ? { pausedSeat: paused.seat } : {}),
        }
        : {}),
      undoConsents: Object.fromEntries(this.undoConsents),
      undoAvailable: this.undoAvailable(),
    };
  }

  private publish() {
    const snapshot = this.createSnapshot();
    this.callbacks.onSnapshot(snapshot);
    this.network.broadcast(createProtocolMessage("four-player", "host", {
      type: "room_state",
      snapshot,
    }));
  }

  private sendSnapshot(peerId: string) {
    this.network.send(peerId, createProtocolMessage("four-player", "host", {
      type: "room_state",
      snapshot: this.createSnapshot(),
    }));
  }

  private sendError(peerId: string, message: string, resync: boolean) {
    this.network.send(peerId, createProtocolMessage("four-player", "host", {
      type: "error",
      message,
      resync,
    }));
    if (resync) this.sendSnapshot(peerId);
  }

  private resync(peerId: string, message: string) {
    this.sendError(peerId, message, true);
  }

  private reject(peerId: string, reason: string) {
    this.network.send(peerId, createProtocolMessage("four-player", "host", {
      type: "join_rejected",
      reason,
    }));
  }

  private accept(peerId: string, participant: PrivateParticipant) {
    this.network.send(peerId, createProtocolMessage("four-player", "host", {
      type: "join_accepted",
      participantId: participant.id,
      reconnectToken: participant.reconnectToken,
      roomCode: this.roomCode,
    }));
    this.sendSnapshot(peerId);
  }

  private trimProcessedActions() {
    if (this.processedActionIds.size <= 256) return;
    this.processedActionIds = new Set(
      [...this.processedActionIds].slice(-128),
    );
  }
}

export class FourPlayerRoomPeer {
  private network: MultiplayerTransport;
  private latestCanonicalRevision = -1;

  constructor(
    private callbacks: FourPlayerPeerCallbacks,
    transportFactory: TransportFactory = (networkCallbacks) =>
      new NetworkManager(networkCallbacks),
  ) {
    this.network = transportFactory({
      onMessage: (_peerId, message) => this.handleMessage(message),
      onInvalidMessage: () =>
        callbacks.onError("Received an invalid multiplayer message."),
      onPeerConnected: () => {},
      onPeerDisconnected: (_peerId, reason) =>
        callbacks.onDisconnected(reason === "peer-left"),
      onStatusChange: () => {},
      onError: callbacks.onError,
    });
  }

  async connect(
    roomCode: string,
    playerName: string,
    token?: string,
  ) {
    await this.network.joinRoom(roomCode);
    this.send({
      type: "join_request",
      playerName,
      ...(token ? { reconnectToken: token } : {}),
    });
  }

  setReady(ready: boolean) {
    this.send({ type: "ready", ready });
  }

  sendAction(
    revision: number,
    actionId: string,
    action: FourPlayerAction,
  ) {
    this.send({ type: "action", revision, actionId, action });
  }

  setUndoConsent(enabled: boolean) {
    this.send({ type: "undo_consent", enabled });
  }

  requestUndo() {
    this.send({ type: "undo_request" });
  }

  disconnect() {
    this.network.disconnect();
  }

  private send(payload: FourPlayerPeerMessage) {
    this.network.sendToHost(
      createProtocolMessage("four-player", "peer", payload),
    );
  }

  private handleMessage(message: ProtocolMessage) {
    if (message.variant !== "four-player" || message.direction !== "host") return;
    const payload: FourPlayerHostMessage = message.payload;
    switch (payload.type) {
      case "join_accepted":
        this.callbacks.onAccepted(
          payload.participantId,
          payload.reconnectToken,
          payload.roomCode,
        );
        break;
      case "join_rejected":
        this.callbacks.onRejected(payload.reason);
        break;
      case "room_state":
        if (
          payload.snapshot.canonical === undefined
            ? this.latestCanonicalRevision >= 0
            : payload.snapshot.canonical.revision < this.latestCanonicalRevision
        ) {
          break;
        }
        if (payload.snapshot.canonical) {
          this.latestCanonicalRevision = Math.max(
            this.latestCanonicalRevision,
            payload.snapshot.canonical.revision,
          );
        }
        this.callbacks.onSnapshot(payload.snapshot);
        break;
      case "error":
        this.callbacks.onError(payload.message);
        break;
    }
  }
}
