import type { GameAction } from "../game/engine";
import type { Color, GameState } from "../game/types";
import { generateRoomCode, NetworkManager } from "./network";
import type { NetworkMessage, OnlinePlayer, PeerMessage } from "./types";

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
  private network: NetworkManager;
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
  ) {
    this.callbacks = callbacks;
    this.network = new NetworkManager({
      onMessage: (peerId, message) => this.handleMessage(peerId, message),
      onPeerConnected: () => {},
      onPeerDisconnected: (peerId) => {
        if (this.guest?.id !== peerId) return;
        this.guest = null;
        this.guestUndoEnabled = false;
        this.publishUndoSettings();
        this.callbacks.onGuestLeft();
        this.network.broadcast({ type: "guest_left" });
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
    this.network.broadcast({
      type: "game_start",
      state,
      hostColor: this.hostColor,
      guestColor: this.hostColor === "white" ? "black" : "white",
    });
    this.publishUndoSettings();
  }

  syncState(state: GameState) {
    if (!this.started) return;
    this.network.broadcast({ type: "state_sync", state });
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

  private handleMessage(peerId: string, message: NetworkMessage) {
    if (message.type === "join_request") {
      this.handleJoin(peerId, message);
      return;
    }
    if (this.guest?.id !== peerId || !this.started) return;
    if (message.type === "undo_consent") {
      this.guestUndoEnabled = message.enabled;
      this.publishUndoSettings();
      return;
    }
    if (message.type === "undo_request") {
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
      message.type !== "game_action" ||
      !message.action ||
      typeof message.action.type !== "string" ||
      !remoteActionIsAllowed(message.action)
    ) return;
    const state = this.callbacks.getState();
    const guestColor = this.hostColor === "white" ? "black" : "white";
    if (state.activeColor !== guestColor) {
      this.syncState(state);
      return;
    }
    const next = this.callbacks.applyRemoteAction(message.action);
    this.syncState(next);
  }

  private handleJoin(peerId: string, message: Extract<PeerMessage, { type: "join_request" }>) {
    if (this.started) {
      this.network.send(peerId, { type: "join_rejected", reason: "That game has already started." });
      return;
    }
    if (this.guest && this.guest.id !== peerId) {
      this.network.send(peerId, { type: "join_rejected", reason: "That room already has two players." });
      return;
    }
    const name = message.playerName.trim().slice(0, 24) || "Guest";
    this.guest = { id: peerId, name };
    this.guestUndoEnabled = false;
    this.network.send(peerId, {
      type: "join_accepted",
      player: this.guest,
      roomCode: this.roomCode,
    });
    this.network.broadcast({
      type: "lobby_state",
      hostName: this.hostName,
      guest: this.guest,
      roomCode: this.roomCode,
    });
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
      this.network.broadcast({
        type: "undo_settings",
        hostEnabled: this.hostUndoEnabled,
        guestEnabled: this.guestUndoEnabled,
        canUndo,
      });
    }
  }
}
