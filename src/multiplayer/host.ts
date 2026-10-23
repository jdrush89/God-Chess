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
  type ClassicRankedCredentials,
  type OnlinePlayer,
  type PeerMessage,
  type ProtocolMessage,
} from "./types";
import {
  DEFAULT_ACCOUNT_PORTRAIT_ID,
  type AccountPortraitId,
} from "../account/portraits";

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

export interface ClassicRankedHostConfig {
  matchId: string;
  hostColor: Color;
  guestColor: Color;
  guestJoinToken: string;
}

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
    private hostPortraitId: AccountPortraitId =
      DEFAULT_ACCOUNT_PORTRAIT_ID,
    private ranked?: ClassicRankedHostConfig,
  ) {
    this.callbacks = callbacks;
    this.network = transportFactory({
      onMessage: (peerId, message) => this.handleMessage(peerId, message),
      onPeerConnected: () => {},
      onPeerDisconnected: (peerId) => {
        if (this.guest?.id !== peerId) return;
        if (this.ranked) {
          this.guest = { ...this.guest, id: "" };
        } else {
          this.guest = null;
        }
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
    if (this.ranked && state.onlineHostColor !== this.ranked.hostColor) {
      throw new Error("The ranked game has the wrong host color.");
    }
    this.started = true;
    this.hostColor = state.onlineHostColor;
    this.sendToGuest({
      type: "game_start",
      state,
      hostColor: this.hostColor,
      guestColor: this.hostColor === "white" ? "black" : "white",
    });
    this.publishUndoSettings();
  }

  syncState(state: GameState) {
    if (!this.started) return;
    this.sendToGuest({
      type: "state_sync",
      state,
    });
    this.publishUndoSettings();
  }

  setUndoConsent(enabled: boolean) {
    if (this.ranked) return;
    this.hostUndoEnabled = enabled;
    this.publishUndoSettings();
  }

  requestUndo() {
    if (this.ranked) return;
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
      if (this.ranked) return;
      this.guestUndoEnabled = payload.enabled;
      this.publishUndoSettings();
      return;
    }
    if (payload.type === "undo_request") {
      if (this.ranked) {
        this.syncState(this.callbacks.getState());
        return;
      }
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
    if (this.ranked && !this.validRankedCredentials(message.ranked)) {
      this.network.send(peerId, createProtocolMessage("classic", "host", {
        type: "join_rejected",
        reason: "Those ranked match credentials are invalid.",
      }));
      return;
    }
    if (this.started && !this.ranked) {
      this.network.send(peerId, createProtocolMessage("classic", "host", {
        type: "join_rejected",
        reason: "That game has already started.",
      }));
      return;
    }
    if (!this.ranked && this.guest && this.guest.id !== peerId) {
      this.network.send(peerId, createProtocolMessage("classic", "host", {
        type: "join_rejected",
        reason: "That room already has two players.",
      }));
      return;
    }
    const name = message.playerName.trim().slice(0, 24) || "Guest";
    this.guest = {
      id: peerId,
      name,
      portraitId: message.portraitId,
    };
    this.guestUndoEnabled = false;
    this.network.send(peerId, createProtocolMessage("classic", "host", {
      type: "join_accepted",
      player: this.guest,
      roomCode: this.roomCode,
    }));
    this.network.broadcast(createProtocolMessage("classic", "host", {
      type: "lobby_state",
      hostName: this.hostName,
      hostPortraitId: this.hostPortraitId,
      guest: this.guest,
      roomCode: this.roomCode,
    }));
    this.callbacks.onGuestJoined(this.guest);
    if (this.started && this.ranked) {
      const state = this.callbacks.getState();
      this.sendToGuest({
        type: "game_start",
        state,
        hostColor: this.ranked.hostColor,
        guestColor: this.ranked.guestColor,
      });
      this.publishUndoSettings();
    }
  }

  private publishUndoSettings() {
    const canUndo =
      !this.ranked &&
      this.started &&
      this.hostUndoEnabled &&
      this.guestUndoEnabled &&
      this.callbacks.canUndo();
    this.callbacks.onUndoSettings(this.hostUndoEnabled, this.guestUndoEnabled, canUndo);
    if (this.started) {
      this.sendToGuest({
        type: "undo_settings",
        hostEnabled: this.ranked ? false : this.hostUndoEnabled,
        guestEnabled: this.ranked ? false : this.guestUndoEnabled,
        canUndo,
      });
    }
  }

  private validRankedCredentials(
    credentials?: ClassicRankedCredentials,
  ) {
    return Boolean(
      this.ranked &&
      credentials?.matchId === this.ranked.matchId &&
      credentials.color === this.ranked.guestColor &&
      credentials.joinToken === this.ranked.guestJoinToken,
    );
  }

  private sendToGuest(
    payload: Parameters<typeof createProtocolMessage<"classic", "host">>[2],
  ) {
    const message = createProtocolMessage("classic", "host", payload);
    if (this.ranked && this.guest?.id) {
      this.network.send(this.guest.id, message);
      return;
    }
    this.network.broadcast(message);
  }
}
