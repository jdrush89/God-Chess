import type { GameAction } from "../game/engine";
import type { Color, GameState } from "../game/types";
import {
  NetworkManager,
  type MultiplayerTransport,
  type TransportFactory,
} from "./network";
import {
  createProtocolMessage,
  type HostMessage,
  type OnlinePlayer,
  type ProtocolMessage,
} from "./types";
import {
  DEFAULT_ACCOUNT_PORTRAIT_ID,
  type AccountPortraitId,
} from "../account/portraits";

interface PeerCallbacks {
  onJoinAccepted: (player: OnlinePlayer, roomCode: string) => void;
  onLobbyState: (
    hostName: string,
    hostPortraitId: AccountPortraitId | undefined,
    guest?: OnlinePlayer,
  ) => void;
  onGameStart: (state: GameState, guestColor: Color) => void;
  onStateSync: (state: GameState) => void;
  onUndoSettings: (hostEnabled: boolean, guestEnabled: boolean, canUndo: boolean) => void;
  onRejected: (reason: string) => void;
  onDisconnected: () => void;
  onError: (error: string) => void;
}

export class MultiplayerPeer {
  private network: MultiplayerTransport;

  constructor(
    private callbacks: PeerCallbacks,
    transportFactory: TransportFactory = (networkCallbacks) =>
      new NetworkManager(networkCallbacks),
  ) {
    this.network = transportFactory({
      onMessage: (_peerId, message) => this.handleMessage(message),
      onInvalidMessage: () =>
        callbacks.onError("Received an invalid multiplayer message."),
      onPeerConnected: () => {},
      onPeerDisconnected: () => callbacks.onDisconnected(),
      onStatusChange: () => {},
      onError: callbacks.onError,
    });
  }

  async connect(
    roomCode: string,
    playerName: string,
    portraitId: AccountPortraitId = DEFAULT_ACCOUNT_PORTRAIT_ID,
  ) {
    await this.network.joinRoom(roomCode);
    this.network.sendToHost(createProtocolMessage("classic", "peer", {
      type: "join_request",
      playerName,
      portraitId,
    }));
  }

  sendAction(action: GameAction) {
    this.network.sendToHost(createProtocolMessage("classic", "peer", {
      type: "game_action",
      action,
    }));
  }

  sendUndoConsent(enabled: boolean) {
    this.network.sendToHost(createProtocolMessage("classic", "peer", {
      type: "undo_consent",
      enabled,
    }));
  }

  requestUndo() {
    this.network.sendToHost(createProtocolMessage("classic", "peer", {
      type: "undo_request",
    }));
  }

  disconnect() {
    this.network.disconnect();
  }

  private handleMessage(message: ProtocolMessage) {
    if (message.variant !== "classic" || message.direction !== "host") return;
    const payload: HostMessage = message.payload;
    switch (payload.type) {
      case "join_accepted":
        this.callbacks.onJoinAccepted(payload.player, payload.roomCode);
        break;
      case "join_rejected":
        this.callbacks.onRejected(payload.reason);
        break;
      case "lobby_state":
        this.callbacks.onLobbyState(
          payload.hostName,
          payload.hostPortraitId,
          payload.guest,
        );
        break;
      case "game_start":
        this.callbacks.onGameStart(payload.state, payload.guestColor);
        break;
      case "state_sync":
        this.callbacks.onStateSync(payload.state);
        break;
      case "undo_settings":
        this.callbacks.onUndoSettings(
          payload.hostEnabled,
          payload.guestEnabled,
          payload.canUndo,
        );
        break;
      case "guest_left":
        this.callbacks.onDisconnected();
        break;
      case "error":
        this.callbacks.onError(payload.message);
        break;
    }
  }
}
