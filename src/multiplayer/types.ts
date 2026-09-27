import type { GameAction } from "../game/engine";
import type { Color, GameState } from "../game/types";

export interface OnlinePlayer {
  id: string;
  name: string;
}

export type PeerMessage =
  | { type: "join_request"; playerName: string }
  | { type: "game_action"; action: GameAction };

export type HostMessage =
  | { type: "join_accepted"; player: OnlinePlayer; roomCode: string }
  | { type: "join_rejected"; reason: string }
  | { type: "lobby_state"; hostName: string; guest?: OnlinePlayer; roomCode: string }
  | { type: "game_start"; state: GameState; hostColor: Color; guestColor: Color }
  | { type: "state_sync"; state: GameState }
  | { type: "guest_left" }
  | { type: "error"; message: string };

export type NetworkMessage = PeerMessage | HostMessage;
