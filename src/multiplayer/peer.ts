import type { GameAction } from "../game/engine";
import type { Color, GameState } from "../game/types";
import { NetworkManager } from "./network";
import type { HostMessage, NetworkMessage, OnlinePlayer } from "./types";

interface PeerCallbacks {
  onJoinAccepted: (player: OnlinePlayer, roomCode: string) => void;
  onLobbyState: (hostName: string, guest?: OnlinePlayer) => void;
  onGameStart: (state: GameState, guestColor: Color) => void;
  onStateSync: (state: GameState) => void;
  onUndoSettings: (hostEnabled: boolean, guestEnabled: boolean, canUndo: boolean) => void;
  onRejected: (reason: string) => void;
  onDisconnected: () => void;
  onError: (error: string) => void;
}

export class MultiplayerPeer {
  private network: NetworkManager;

  constructor(private callbacks: PeerCallbacks) {
    this.network = new NetworkManager({
      onMessage: (_peerId, message) => this.handleMessage(message),
      onPeerConnected: () => {},
      onPeerDisconnected: () => callbacks.onDisconnected(),
      onStatusChange: () => {},
      onError: callbacks.onError,
    });
  }

  async connect(roomCode: string, playerName: string) {
    await this.network.joinRoom(roomCode);
    this.network.sendToHost({ type: "join_request", playerName });
  }

  sendAction(action: GameAction) {
    this.network.sendToHost({ type: "game_action", action });
  }

  sendUndoConsent(enabled: boolean) {
    this.network.sendToHost({ type: "undo_consent", enabled });
  }

  requestUndo() {
    this.network.sendToHost({ type: "undo_request" });
  }

  disconnect() {
    this.network.disconnect();
  }

  private handleMessage(message: NetworkMessage) {
    switch (message.type) {
      case "join_accepted":
        this.callbacks.onJoinAccepted(message.player, message.roomCode);
        break;
      case "join_rejected":
        this.callbacks.onRejected(message.reason);
        break;
      case "lobby_state":
        this.callbacks.onLobbyState(message.hostName, message.guest);
        break;
      case "game_start":
        this.callbacks.onGameStart(message.state, message.guestColor);
        break;
      case "state_sync":
        this.callbacks.onStateSync(message.state);
        break;
      case "undo_settings":
        this.callbacks.onUndoSettings(
          message.hostEnabled,
          message.guestEnabled,
          message.canUndo,
        );
        break;
      case "guest_left":
        this.callbacks.onDisconnected();
        break;
      case "error":
        this.callbacks.onError(message.message);
        break;
    }
  }
}
