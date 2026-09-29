import type { GameAction } from "../game/engine";
import type { Color, GameState } from "../game/types";
import {
  generateRoomCode,
  NetworkManager,
  type MultiplayerTransport,
  type TransportFactory,
} from "./network";
import {
  createProtocolMessage,
  type OnlinePlayer,
  type PeerMessage,
  type ProtocolMessage,
} from "./types";

interface HostCallbacks {
  getState: () => GameState;
  applyRemoteAction: (action: GameAction) => GameState;
  applyUndo: () => GameState | undefined;
  canUndo: () => boolean;
  onGuestJoined: (guest: OnlinePlayer) => void;
  onGuestLeft: () => void;
  onUndoSettings: (hostEnabled: boolean, guestEnabled: boolean, canUndo: boolean) => void;
  onError: (error: string) => void;
}

const remoteActionIsAllowed = (action: GameAction) =>
  !["load-game", "new-game", "restart"].includes(action.type);

export class MultiplayerHost {
  private network: MultiplayerTransport;
  private callbacks: HostCallbacks;
  private guest: OnlinePlayer | null = null;
  private started = false;
  private hostColor?: Color;
  private hostUndoEnabled = false;
  private guestUndoEnabled = false;
  readonly roomCode = generateRoomCode();

  constructor(
    private hostName: string,
    callbacks: HostCallbacks,
    transportFactory: TransportFactory = (networkCallbacks) =>
      new NetworkManager(networkCallbacks),
  ) {
    this.callbacks = callbacks;
    this.network = transportFactory({
      onMessage: (peerId, message) => this.handleMessage(peerId, message),
      onPeerConnected: () => {},
      onPeerDisconnected: (peerId) => {
        if (this.guest?.id !== peerId) return;
        this.guest = null;
        this.guestUndoEnabled = false;
        this.publishUndoSettings();
        this.callbacks.onGuestLeft();
        this.network.broadcast(createProtocolMessage("classic", "host", {
          type: "guest_left",
        }));
      },
      onStatusChange: () => {},
      onError: callbacks.onError,
    });
  }

  get guestPlayer() {
    return this.guest;
  }

  async start() {
    await this.network.hostRoom(this.roomCode);
    return this.roomCode;
  }

  startGame(state: GameState) {
    if (!this.guest) throw new Error("A second player must join before the game can start.");
    if (!state.onlineHostColor) throw new Error("The online game has no host color.");
    this.started = true;
    this.hostColor = state.onlineHostColor;
    this.network.broadcast(createProtocolMessage("classic", "host", {
      type: "game_start",
      state,
      hostColor: this.hostColor,
      guestColor: this.hostColor === "white" ? "black" : "white",
    }));
    this.publishUndoSettings();
  }

  syncState(state: GameState) {
    if (!this.started) return;
    this.network.broadcast(createProtocolMessage("classic", "host", {
      type: "state_sync",
      state,
    }));
    this.publishUndoSettings();
  }

  setUndoConsent(enabled: boolean) {
    this.hostUndoEnabled = enabled;
    this.publishUndoSettings();
  }

  requestUndo() {
    if (!this.started || !this.hostUndoEnabled || !this.guestUndoEnabled) return;
    const next = this.callbacks.applyUndo();
    if (next) this.syncState(next);
    else this.publishUndoSettings();
  }

  stop() {
    this.network.disconnect();
    this.guest = null;
    this.started = false;
    this.hostColor = undefined;
    this.hostUndoEnabled = false;
    this.guestUndoEnabled = false;
  }

  private handleMessage(peerId: string, message: ProtocolMessage) {
    if (message.variant !== "classic" || message.direction !== "peer") return;
    const payload = message.payload;
    if (payload.type === "join_request") {
      this.handleJoin(peerId, payload);
      return;
    }
    if (this.guest?.id !== peerId || !this.started) return;
    if (payload.type === "undo_consent") {
      this.guestUndoEnabled = payload.enabled;
      this.publishUndoSettings();
      return;
    }
    if (payload.type === "undo_request") {
      if (this.hostUndoEnabled && this.guestUndoEnabled) {
        const next = this.callbacks.applyUndo();
        if (next) this.syncState(next);
        else {
          this.syncState(this.callbacks.getState());
        }
      } else {
        this.syncState(this.callbacks.getState());
      }
      return;
    }
    if (
      payload.type !== "game_action" ||
      !remoteActionIsAllowed(payload.action)
    ) return;
    const state = this.callbacks.getState();
    const guestColor = this.hostColor === "white" ? "black" : "white";
    if (state.activeColor !== guestColor) {
      this.syncState(state);
      return;
    }
    const next = this.callbacks.applyRemoteAction(payload.action);
    this.syncState(next);
  }

  private handleJoin(peerId: string, message: Extract<PeerMessage, { type: "join_request" }>) {
    if (this.started) {
      this.network.send(peerId, createProtocolMessage("classic", "host", {
        type: "join_rejected",
        reason: "That game has already started.",
      }));
      return;
    }
    if (this.guest && this.guest.id !== peerId) {
      this.network.send(peerId, createProtocolMessage("classic", "host", {
        type: "join_rejected",
        reason: "That room already has two players.",
      }));
      return;
    }
    const name = message.playerName.trim().slice(0, 24) || "Guest";
    this.guest = { id: peerId, name };
    this.guestUndoEnabled = false;
    this.network.send(peerId, createProtocolMessage("classic", "host", {
      type: "join_accepted",
      player: this.guest,
      roomCode: this.roomCode,
    }));
    this.network.broadcast(createProtocolMessage("classic", "host", {
      type: "lobby_state",
      hostName: this.hostName,
      guest: this.guest,
      roomCode: this.roomCode,
    }));
    this.callbacks.onGuestJoined(this.guest);
  }

  private publishUndoSettings() {
    const canUndo =
      this.started &&
      this.hostUndoEnabled &&
      this.guestUndoEnabled &&
      this.callbacks.canUndo();
    this.callbacks.onUndoSettings(this.hostUndoEnabled, this.guestUndoEnabled, canUndo);
    if (this.started) {
      this.network.broadcast(createProtocolMessage("classic", "host", {
        type: "undo_settings",
        hostEnabled: this.hostUndoEnabled,
        guestEnabled: this.guestUndoEnabled,
        canUndo,
      }));
    }
  }
}
