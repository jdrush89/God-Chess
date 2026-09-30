import {
  chooseThreePlayerAiPlan,
  isThreePlayerAiTurn,
} from "../game/threePlayerAi";
import {
  createDefaultThreePlayerConfig,
  validateThreePlayerConfig,
} from "../game/threePlayerConfig";
import {
  availableThreePlayerActions,
  createThreePlayerGame,
  threePlayerReducer,
} from "../game/threePlayerEngine";
import { prepareThreePlayerState } from "../game/threePlayerPersistence";
import {
  applyAuthorizedThreePlayerAction,
  approveThreePlayerUndo,
  createRevisedThreePlayerStateEnvelope,
  createThreePlayerStateEnvelope,
  createThreePlayerUndoProposal,
  isThreePlayerUndoUnanimous,
  type ThreePlayerActionEnvelope,
  type ThreePlayerStateEnvelope,
  type ThreePlayerUndoProposal,
} from "../game/threePlayerSession";
import {
  THREE_PLAYER_SEATS,
  type ThreePlayerAction,
  type ThreePlayerConfig,
  type ThreePlayerSeat,
  type ThreePlayerState,
} from "../game/threePlayerTypes";
import {
  generateRoomCode,
  NetworkManager,
  type MultiplayerTransport,
  type TransportFactory,
} from "./network";
import {
  createProtocolMessage,
  type ProtocolMessage,
  type ThreePlayerHostMessage,
  type ThreePlayerHostParticipant,
  type ThreePlayerHostRoomSnapshot,
  type ThreePlayerParticipant,
  type ThreePlayerPeerMessage,
  type ThreePlayerRoomSnapshot,
  type ThreePlayerUndoStatus,
} from "./types";

interface PrivateParticipant extends ThreePlayerHostParticipant {
  peerId?: string;
  reconnectToken: string;
}

export interface ThreePlayerHostCallbacks {
  onSnapshot: (snapshot: ThreePlayerHostRoomSnapshot) => void;
  onError: (error: string) => void;
}

export interface ThreePlayerPeerCallbacks {
  onAccepted: (
    participantId: string,
    reconnectToken: string,
    roomCode: string,
  ) => void;
  onSnapshot: (snapshot: ThreePlayerRoomSnapshot) => void;
  onRejected: (reason: string) => void;
  onDisconnected: (roomEnded: boolean) => void;
  onError: (error: string, resync: boolean) => void;
}

export type ThreePlayerAiPlanner = (
  state: ThreePlayerState,
) => Promise<ThreePlayerAction[]>;

const stableState = (state: ThreePlayerState) =>
  (
    state.phase === "draft" ||
    state.phase === "play" ||
    state.phase === "upgrade" ||
    state.phase === "gameover"
  ) &&
  !state.selectedGod &&
  !state.selectedAbility &&
  !state.pending;

const stateChanged = (first: ThreePlayerState, second: ThreePlayerState) =>
  JSON.stringify(first) !== JSON.stringify(second);

const opaqueId = (prefix: string) => {
  const random = globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
};

const reconnectToken = () =>
  `${opaqueId("reconnect")}.${opaqueId("proof")}`;

const seatLabel = (seat: ThreePlayerSeat) =>
  seat[0].toUpperCase() + seat.slice(1);

const aiName = (seat: ThreePlayerSeat) =>
  `${seatLabel(seat)} Divine AI`;

const replaceSeatWithAi = (
  source: ThreePlayerState,
  seat: ThreePlayerSeat,
  difficulty: number,
) => {
  const state = prepareThreePlayerState(source);
  const control = { kind: "ai" as const, difficulty };
  const name = aiName(seat);
  state.config.seats[seat].name = name;
  state.config.seats[seat].control = control;
  state.players[seat].name = name;
  state.players[seat].control = control;
  return prepareThreePlayerState(state);
};

const defaultAiPlanner: ThreePlayerAiPlanner = (state) => {
  if (typeof Worker === "undefined") {
    return Promise.resolve(chooseThreePlayerAiPlan(state));
  }
  return new Promise((resolve) => {
    const worker = new Worker(
      new URL("../game/threePlayerAi.worker.ts", import.meta.url),
      { type: "module" },
    );
    const finish = (plan: ThreePlayerAction[]) => {
      worker.terminate();
      resolve(plan);
    };
    worker.onmessage = (
      event: MessageEvent<{
        revision: number;
        plan: ThreePlayerAction[];
      }>,
    ) => {
      finish(
        event.data.revision === state.revision
          ? event.data.plan
          : [],
      );
    };
    worker.onerror = () => finish(chooseThreePlayerAiPlan(state));
    worker.postMessage(state);
  });
};

export const createThreePlayerOnlineConfig = (): ThreePlayerConfig => {
  const config = createDefaultThreePlayerConfig();
  for (const seat of THREE_PLAYER_SEATS) {
    config.seats[seat].name = aiName(seat);
    config.seats[seat].control = { kind: "ai", difficulty: 5 };
  }
  return config;
};

export class ThreePlayerRoomHost {
  readonly roomCode = generateRoomCode();
  readonly hostParticipantId = opaqueId("participant");

  private network: MultiplayerTransport;
  private participants = new Map<string, PrivateParticipant>();
  private peerParticipants = new Map<string, string>();
  private config = createThreePlayerOnlineConfig();
  private status: ThreePlayerRoomSnapshot["status"] = "lobby";
  private canonical?: ThreePlayerStateEnvelope;
  private undoStack: ThreePlayerState[] = [];
  private chainStart?: ThreePlayerState;
  private undoProposal?: ThreePlayerUndoProposal;
  private processedActionIds = new Set<string>();
  private aiPlan: ThreePlayerAction[] = [];
  private aiPlanningRevision?: number;
  private aiGeneration = 0;
  private aiTimer?: number;
  private stopped = false;

  constructor(
    hostName: string,
    private callbacks: ThreePlayerHostCallbacks,
    transportFactory: TransportFactory = (networkCallbacks) =>
      new NetworkManager(networkCallbacks),
    private planAi: ThreePlayerAiPlanner = defaultAiPlanner,
  ) {
    const host: PrivateParticipant = {
      participantId: this.hostParticipantId,
      name: hostName.trim().slice(0, 24) || "Host",
      host: true,
      connected: true,
      ready: false,
      local: true,
      seat: "white",
      reconnectToken: reconnectToken(),
    };
    this.participants.set(host.participantId, host);
    this.applyAssignmentsToConfig();
    this.network = transportFactory({
      onMessage: (peerId, message) => this.handleMessage(peerId, message),
      onInvalidMessage: (peerId) => {
        if (this.peerParticipants.has(peerId)) {
          this.sendError(
            peerId,
            "Received an invalid multiplayer message.",
            true,
          );
        }
      },
      onPeerConnected: () => {},
      onPeerDisconnected: (peerId) => this.handleDisconnect(peerId),
      onStatusChange: () => {},
      onError: callbacks.onError,
    });
  }

  get snapshot() {
    return this.createHostSnapshot();
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

  assignSeat(participantId: string, seat?: ThreePlayerSeat) {
    if (this.status !== "lobby") return;
    const participant = this.participants.get(participantId);
    if (!participant || !participant.connected) return;
    for (const candidate of this.participants.values()) {
      if (
        candidate.participantId !== participantId &&
        candidate.seat === seat
      ) {
        candidate.seat = undefined;
        candidate.ready = false;
      }
    }
    participant.seat = seat;
    this.clearReadiness();
    this.applyAssignmentsToConfig();
    this.publish();
  }

  updateConfig(value: ThreePlayerConfig) {
    if (this.status !== "lobby") return;
    const next = structuredClone(value);
    for (const seat of THREE_PLAYER_SEATS) {
      const participant = [...this.participants.values()]
        .find((candidate) => candidate.seat === seat);
      if (participant) {
        next.seats[seat].name = participant.name;
        next.seats[seat].control = {
          kind: "online",
          participantId: participant.participantId,
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
      validateThreePlayerConfig(next);
    } catch (error) {
      this.callbacks.onError(
        error instanceof Error ? error.message : "Invalid three-player setup.",
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
    const state = createThreePlayerGame(this.config);
    this.canonical = createThreePlayerStateEnvelope(state, opaqueId("start"));
    this.status = "playing";
    this.undoStack = [];
    this.chainStart = undefined;
    this.undoProposal = undefined;
    this.processedActionIds.clear();
    this.resetAi();
    this.publish();
    this.scheduleAi();
    return true;
  }

  submitHostAction(action: ThreePlayerAction) {
    const host = this.participants.get(this.hostParticipantId);
    if (!host?.seat || !this.canonical) return false;
    return this.applyHumanAction(host, opaqueId("action"), action);
  }

  requestHostUndo() {
    return this.requestUndo(this.hostParticipantId);
  }

  voteHostUndo(
    requestId: string,
    targetRevision: number,
    approved: boolean,
  ) {
    return this.voteUndo(
      this.hostParticipantId,
      { requestId, targetRevision, approved },
    );
  }

  replaceDisconnectedSeatWithAi(
    seat: ThreePlayerSeat,
    difficulty: number,
  ) {
    if (this.status !== "paused" || !this.canonical) return false;
    const participant = [...this.participants.values()]
      .find((candidate) =>
        candidate.seat === seat &&
        !candidate.connected &&
        !candidate.host
      );
    if (!participant) return false;
    const level = Math.max(1, Math.min(10, Math.round(difficulty)));
    this.participants.delete(participant.participantId);
    if (participant.peerId) this.peerParticipants.delete(participant.peerId);

    const state = replaceSeatWithAi(this.canonical.state, seat, level);
    this.undoStack = this.undoStack.map((snapshot) =>
      replaceSeatWithAi(snapshot, seat, level)
    );
    this.chainStart = this.chainStart
      ? replaceSeatWithAi(this.chainStart, seat, level)
      : undefined;
    this.config = structuredClone(state.config);
    this.undoProposal = undefined;
    this.resetAi();
    this.canonical = createRevisedThreePlayerStateEnvelope(
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
    this.resetAi();
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
    if (connected.length > 3) {
      errors.push("Three-player rooms support at most three Human participants.");
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
    const assigned = connected.flatMap((participant) =>
      participant.seat ? [participant.seat] : []
    );
    if (new Set(assigned).size !== assigned.length) {
      errors.push("Each connected participant requires a unique seat.");
    }
    try {
      validateThreePlayerConfig(this.config);
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : "Invalid three-player setup.",
      );
    }
    return [...new Set(errors)];
  }

  private handleMessage(peerId: string, message: ProtocolMessage) {
    if (message.variant !== "three-player" || message.direction !== "peer") {
      return;
    }
    const payload = message.payload;
    if (payload.type === "join_request") {
      this.handleJoin(peerId, payload);
      return;
    }
    const participantId = this.peerParticipants.get(peerId);
    const participant = participantId
      ? this.participants.get(participantId)
      : undefined;
    if (
      !participant ||
      participant.peerId !== peerId ||
      !participant.connected
    ) {
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
      case "undo_request":
        if (!this.requestUndo(participant.participantId, payload.revision)) {
          this.resync(peerId, "Undo is not currently available.");
        }
        return;
      case "undo_vote":
        if (!this.voteUndo(participant.participantId, payload)) {
          this.resync(peerId, "That undo vote is stale or unauthorized.");
        }
        return;
    }
  }

  private handleJoin(
    peerId: string,
    message: Extract<ThreePlayerPeerMessage, { type: "join_request" }>,
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
      this.peerParticipants.set(peerId, participant.participantId);
      this.undoProposal = undefined;
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
    if (connectedHumans >= 3) {
      this.reject(peerId, "That room already has three Human participants.");
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
      participantId: opaqueId("participant"),
      name: message.playerName.trim().slice(0, 24) || "Guest",
      host: false,
      connected: true,
      ready: false,
      local: false,
      peerId,
      reconnectToken: reconnectToken(),
    };
    this.participants.set(participant.participantId, participant);
    this.peerParticipants.set(peerId, participant.participantId);
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
    this.undoProposal = undefined;
    this.resetAi();
    if (this.status === "lobby") {
      this.participants.delete(participant.participantId);
      this.applyAssignmentsToConfig();
      this.clearReadiness();
      this.publish();
      return;
    }
    participant.connected = false;
    participant.ready = false;
    if (this.status === "playing") this.status = "paused";
    this.publish();
  }

  private applyPeerAction(
    peerId: string,
    participant: PrivateParticipant,
    message: Extract<ThreePlayerPeerMessage, { type: "action" }>,
  ) {
    if (
      !this.canonical ||
      this.status !== "playing" ||
      this.undoProposal
    ) {
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
    action: ThreePlayerAction,
    revision = this.canonical?.revision,
  ) {
    if (
      !this.canonical ||
      this.status !== "playing" ||
      this.undoProposal ||
      !participant.seat ||
      revision === undefined
    ) return false;
    const envelope: ThreePlayerActionEnvelope = {
      revision,
      actionId,
      participantId: participant.participantId,
      seat: participant.seat,
      action,
    };
    try {
      const current = this.canonical.state;
      this.beginBoundary(current, "human");
      const next = applyAuthorizedThreePlayerAction(
        current,
        envelope,
        this.canonical.revision,
      );
      this.completeBoundary(next.state);
      this.undoProposal = undefined;
      this.resetAi();
      this.canonical = next;
      this.processedActionIds.add(actionId);
      this.trimProcessedActions();
      this.finishOrPublish();
      return true;
    } catch {
      return false;
    }
  }

  private applyAiAction(action: ThreePlayerAction) {
    if (
      !this.canonical ||
      this.status !== "playing" ||
      this.undoProposal ||
      !isThreePlayerAiTurn(this.canonical.state)
    ) return false;
    const current = this.canonical.state;
    const available = availableThreePlayerActions(current);
    if (!available.some((candidate) =>
      JSON.stringify(candidate) === JSON.stringify(action)
    )) return false;
    const nextState = threePlayerReducer(current, action);
    if (!stateChanged(current, nextState)) return false;
    this.beginBoundary(current, "ai");
    this.completeBoundary(nextState);
    const actionId = opaqueId("ai-action");
    this.canonical = createThreePlayerStateEnvelope(nextState, actionId);
    this.processedActionIds.add(actionId);
    this.trimProcessedActions();
    this.finishOrPublish();
    return true;
  }

  private beginBoundary(
    current: ThreePlayerState,
    source: "human" | "ai",
  ) {
    if (
      source === "human" &&
      stableState(current) &&
      !this.chainStart
    ) {
      this.chainStart = prepareThreePlayerState(current);
    }
  }

  private completeBoundary(next: ThreePlayerState) {
    const nextHuman =
      next.players[next.activeSeat].control.kind !== "ai";
    if (stableState(next) && nextHuman && this.chainStart) {
      this.undoStack.push(prepareThreePlayerState(this.chainStart));
      this.chainStart = undefined;
    }
  }

  private requestUndo(
    participantId: string,
    revision = this.canonical?.revision,
  ) {
    if (
      !this.canonical ||
      revision !== this.canonical.revision ||
      !this.undoAvailable() ||
      !this.connectedParticipantIds().includes(participantId)
    ) return false;
    const proposal = createThreePlayerUndoProposal(
      opaqueId("undo"),
      this.canonical.revision,
      participantId,
      this.connectedParticipantIds(),
    );
    this.undoProposal = proposal;
    this.resetAi();
    if (isThreePlayerUndoUnanimous(proposal)) {
      return this.applyUndo();
    }
    this.publish();
    return true;
  }

  private voteUndo(
    participantId: string,
    vote: {
      requestId: string;
      targetRevision: number;
      approved: boolean;
    },
  ) {
    if (
      !this.canonical ||
      !this.undoProposal ||
      vote.requestId !== this.undoProposal.requestId ||
      vote.targetRevision !== this.undoProposal.targetRevision ||
      vote.targetRevision !== this.canonical.revision ||
      !this.undoProposal.eligibleParticipantIds.includes(participantId)
    ) return false;
    if (!vote.approved) {
      this.undoProposal = undefined;
      this.publish();
      return true;
    }
    this.undoProposal = approveThreePlayerUndo(
      this.undoProposal,
      participantId,
    );
    if (isThreePlayerUndoUnanimous(this.undoProposal)) {
      return this.applyUndo();
    }
    this.publish();
    return true;
  }

  private applyUndo() {
    if (!this.canonical || !this.undoProposal) return false;
    const restored = this.undoStack.pop();
    if (!restored) {
      this.undoProposal = undefined;
      this.publish();
      return false;
    }
    const actionId = this.undoProposal.requestId;
    this.undoProposal = undefined;
    this.chainStart = undefined;
    this.resetAi();
    this.canonical = createRevisedThreePlayerStateEnvelope(
      restored,
      this.canonical.revision + 1,
      actionId,
    );
    this.status = restored.phase === "gameover" ? "finished" : "playing";
    this.publish();
    this.scheduleAi();
    return true;
  }

  private scheduleAi() {
    if (
      this.stopped ||
      this.status !== "playing" ||
      !this.canonical ||
      this.undoProposal ||
      !isThreePlayerAiTurn(this.canonical.state) ||
      this.aiTimer !== undefined ||
      this.aiPlanningRevision !== undefined
    ) return;
    if (this.aiPlan.length) {
      this.aiTimer = globalThis.setTimeout(() => {
        this.aiTimer = undefined;
        const action = this.aiPlan.shift();
        if (!action || !this.applyAiAction(action)) {
          this.aiPlan = [];
        }
        this.scheduleAi();
      }, 180);
      return;
    }
    const state = prepareThreePlayerState(this.canonical.state);
    const revision = this.canonical.revision;
    const generation = this.aiGeneration;
    this.aiPlanningRevision = revision;
    void this.planAi(state).then((plan) => {
      if (
        this.stopped ||
        generation !== this.aiGeneration ||
        this.status !== "playing" ||
        !this.canonical ||
        this.canonical.revision !== revision ||
        !isThreePlayerAiTurn(this.canonical.state)
      ) return;
      this.aiPlanningRevision = undefined;
      this.aiPlan = plan;
      if (!this.aiPlan.length) {
        this.aiPlan = availableThreePlayerActions(this.canonical.state)
          .slice(0, 1);
      }
      this.scheduleAi();
    }).catch((error) => {
      if (generation !== this.aiGeneration) return;
      this.aiPlanningRevision = undefined;
      this.aiPlan = [];
      this.callbacks.onError(
        error instanceof Error
          ? error.message
          : "Unable to plan the three-player AI turn.",
      );
    });
  }

  private finishOrPublish() {
    if (!this.canonical) return;
    if (this.canonical.state.phase === "gameover") {
      this.status = "finished";
      this.resetAi();
    }
    this.publish();
    this.scheduleAi();
  }

  private resetAi() {
    this.aiGeneration += 1;
    this.aiPlanningRevision = undefined;
    this.aiPlan = [];
    if (this.aiTimer !== undefined) globalThis.clearTimeout(this.aiTimer);
    this.aiTimer = undefined;
  }

  private clearReadiness() {
    for (const participant of this.participants.values()) {
      participant.ready = false;
    }
  }

  private applyAssignmentsToConfig() {
    for (const seat of THREE_PLAYER_SEATS) {
      const participant = [...this.participants.values()]
        .find((candidate) => candidate.seat === seat);
      if (participant) {
        this.config.seats[seat].name = participant.name;
        this.config.seats[seat].control = {
          kind: "online",
          participantId: participant.participantId,
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

  private connectedParticipantIds() {
    return [...this.participants.values()]
      .filter((participant) => participant.connected)
      .map((participant) => participant.participantId);
  }

  private undoAvailable() {
    return Boolean(
      this.status === "playing" &&
      this.canonical &&
      stableState(this.canonical.state) &&
      this.canonical.state.players[this.canonical.state.activeSeat].control
          .kind !== "ai" &&
      this.undoStack.length &&
      !this.chainStart &&
      !this.undoProposal &&
      this.aiPlanningRevision === undefined &&
      this.aiPlan.length === 0 &&
      this.aiTimer === undefined,
    );
  }

  private projectConfig(participantId: string) {
    const config = structuredClone(this.config);
    for (const seat of THREE_PLAYER_SEATS) {
      const control = config.seats[seat].control;
      if (control.kind !== "online") continue;
      config.seats[seat].control = {
        kind: "online",
        local: control.participantId === participantId,
      };
    }
    return config;
  }

  private projectCanonical(participantId: string) {
    if (!this.canonical) return undefined;
    const state = prepareThreePlayerState(this.canonical.state);
    const config = this.projectConfig(participantId);
    state.config = config;
    for (const seat of THREE_PLAYER_SEATS) {
      state.players[seat].control = structuredClone(config.seats[seat].control);
    }
    return createThreePlayerStateEnvelope(
      prepareThreePlayerState(state),
      this.canonical.lastActionId,
    );
  }

  private projectUndoStatus(
    participantId: string,
  ): ThreePlayerUndoStatus | undefined {
    if (!this.undoProposal) return undefined;
    const requestedBy = this.participants.get(this.undoProposal.requestedBy);
    return {
      requestId: this.undoProposal.requestId,
      targetRevision: this.undoProposal.targetRevision,
      requestedByName: requestedBy?.name ?? "A participant",
      eligibleCount: this.undoProposal.eligibleParticipantIds.length,
      approvedCount: this.undoProposal.approvedParticipantIds.length,
      localEligible: this.undoProposal.eligibleParticipantIds.includes(
        participantId,
      ),
      localApproved: this.undoProposal.approvedParticipantIds.includes(
        participantId,
      ),
    };
  }

  private createParticipants(
    localParticipantId: string,
  ): ThreePlayerParticipant[] {
    return [...this.participants.values()].map((participant) => ({
      name: participant.name,
      host: participant.host,
      connected: participant.connected,
      ready: participant.ready,
      local: participant.participantId === localParticipantId,
      ...(participant.seat ? { seat: participant.seat } : {}),
    }));
  }

  private createPeerSnapshot(
    participantId: string,
  ): ThreePlayerRoomSnapshot {
    const paused = this.status === "paused"
      ? this.disconnectedParticipant()
      : undefined;
    return {
      roomCode: this.roomCode,
      status: this.status,
      participants: this.createParticipants(participantId),
      config: this.projectConfig(participantId),
      ...(this.canonical
        ? { canonical: this.projectCanonical(participantId) }
        : {}),
      ...(paused?.seat ? { pausedSeat: paused.seat } : {}),
      ...(paused ? { pausedParticipantName: paused.name } : {}),
      ...(this.undoProposal
        ? { undoProposal: this.projectUndoStatus(participantId) }
        : {}),
      undoAvailable: this.undoAvailable(),
    };
  }

  private createHostSnapshot(): ThreePlayerHostRoomSnapshot {
    const host = this.participants.get(this.hostParticipantId);
    const paused = this.status === "paused"
      ? this.disconnectedParticipant()
      : undefined;
    return {
      roomCode: this.roomCode,
      status: this.status,
      participants: [...this.participants.values()].map((participant) => ({
        participantId: participant.participantId,
        name: participant.name,
        host: participant.host,
        connected: participant.connected,
        ready: participant.ready,
        local: participant.host,
        ...(participant.seat ? { seat: participant.seat } : {}),
      })),
      config: structuredClone(this.config),
      ...(this.canonical
        ? {
          canonical: createThreePlayerStateEnvelope(
            this.canonical.state,
            this.canonical.lastActionId,
          ),
        }
        : {}),
      ...(paused?.seat ? { pausedSeat: paused.seat } : {}),
      ...(paused ? { pausedParticipantName: paused.name } : {}),
      ...(this.undoProposal && host
        ? { undoProposal: this.projectUndoStatus(host.participantId) }
        : {}),
      undoAvailable: this.undoAvailable(),
    };
  }

  private publish() {
    this.callbacks.onSnapshot(this.createHostSnapshot());
    for (const participant of this.participants.values()) {
      if (!participant.peerId || !participant.connected) continue;
      this.network.send(
        participant.peerId,
        createProtocolMessage("three-player", "host", {
          type: "room_state",
          snapshot: this.createPeerSnapshot(participant.participantId),
        }),
      );
    }
  }

  private sendSnapshot(peerId: string) {
    const participantId = this.peerParticipants.get(peerId);
    if (!participantId) return;
    this.network.send(peerId, createProtocolMessage("three-player", "host", {
      type: "room_state",
      snapshot: this.createPeerSnapshot(participantId),
    }));
  }

  private sendError(peerId: string, message: string, resync: boolean) {
    this.network.send(peerId, createProtocolMessage("three-player", "host", {
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
    this.network.send(peerId, createProtocolMessage("three-player", "host", {
      type: "join_rejected",
      reason,
    }));
  }

  private accept(peerId: string, participant: PrivateParticipant) {
    this.network.send(peerId, createProtocolMessage("three-player", "host", {
      type: "join_accepted",
      participantId: participant.participantId,
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

export class ThreePlayerRoomPeer {
  private network: MultiplayerTransport;
  private latestCanonicalRevision = -1;

  constructor(
    private callbacks: ThreePlayerPeerCallbacks,
    transportFactory: TransportFactory = (networkCallbacks) =>
      new NetworkManager(networkCallbacks),
  ) {
    this.network = transportFactory({
      onMessage: (_peerId, message) => this.handleMessage(message),
      onInvalidMessage: () =>
        callbacks.onError("Received an invalid multiplayer message.", false),
      onPeerConnected: () => {},
      onPeerDisconnected: (_peerId, reason) =>
        callbacks.onDisconnected(reason === "peer-left"),
      onStatusChange: () => {},
      onError: (error) => callbacks.onError(error, false),
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
    action: ThreePlayerAction,
  ) {
    this.send({ type: "action", revision, actionId, action });
  }

  requestUndo(revision: number) {
    this.send({ type: "undo_request", revision });
  }

  voteUndo(
    requestId: string,
    targetRevision: number,
    approved: boolean,
  ) {
    this.send({
      type: "undo_vote",
      requestId,
      targetRevision,
      approved,
    });
  }

  disconnect() {
    this.network.disconnect();
  }

  private send(payload: ThreePlayerPeerMessage) {
    this.network.sendToHost(
      createProtocolMessage("three-player", "peer", payload),
    );
  }

  private handleMessage(message: ProtocolMessage) {
    if (message.variant !== "three-player" || message.direction !== "host") {
      return;
    }
    const payload: ThreePlayerHostMessage = message.payload;
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
            : payload.snapshot.canonical.revision <
              this.latestCanonicalRevision
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
        this.callbacks.onError(payload.message, payload.resync);
        break;
    }
  }
}
