import type { GodId, PieceType } from "./types";

export const THREE_PLAYER_SEATS = ["white", "red", "black"] as const;
export type ThreePlayerSeat = (typeof THREE_PLAYER_SEATS)[number];

export const THREE_PLAYER_BOARD_VARIANTS = [
  "three-player",
  "three-hexagonal",
  "triad",
  "three-circular",
  "three-half",
] as const;
export type ThreePlayerBoardVariant = (typeof THREE_PLAYER_BOARD_VARIANTS)[number];
export type ThreePlayerCell = string;
export type ThreePlayerOrbAffinity = "light" | "dark";
export type ThreePlayerPhase = "draft" | "play" | "gameover";
export type ThreePlayerVictoryMode = "first-checkmate" | "last-survivor";

export type ThreePlayerSeatControl =
  | { kind: "human"; local: boolean }
  | { kind: "ai"; difficulty?: number }
  | { kind: "online"; participantId?: string; local?: boolean };

export interface ThreePlayerSeatConfig {
  name: string;
  displayColor: string;
  control: ThreePlayerSeatControl;
}

export interface ThreePlayerConfig {
  boardVariant: ThreePlayerBoardVariant;
  victoryMode: ThreePlayerVictoryMode;
  takeover: boolean;
  seats: Record<ThreePlayerSeat, ThreePlayerSeatConfig>;
}

export interface ThreePlayerPieceStatus {
  hardened?: number | "choice" | "god";
  frozen?: number | "god";
  frozenBy?: ThreePlayerSeat;
  gazing?: boolean;
  poisoned?: number | "god";
  poisonedBy?: ThreePlayerSeat;
  polymorphed?: number | "god";
  luredBy?: ThreePlayerSeat;
  hexedBy?: ThreePlayerSeat;
  prepared?: boolean | { owner: ThreePlayerSeat; level: 1 | 2 | 3 };
  ritual?: { owner: ThreePlayerSeat; expires: number | "kangus" };
  markedForDeath?: { owner: ThreePlayerSeat; round: number; immediate?: boolean };
  hired?: boolean;
  movedThisTurn?: boolean;
  chargeUntil?: number | "god";
}

export interface ThreePlayerPiece {
  id: string;
  type: PieceType;
  owner: ThreePlayerSeat;
  controller: ThreePlayerSeat | null;
  hasMoved: boolean;
  status: ThreePlayerPieceStatus;
}

export interface ThreePlayerGravePiece {
  piece: ThreePlayerPiece;
  capturedOnTurn: number;
}

export interface ThreePlayerSeatState {
  seat: ThreePlayerSeat;
  name: string;
  displayColor: string;
  control: ThreePlayerSeatControl;
  eliminated: boolean;
  eliminatedBy?: ThreePlayerSeat;
  gods: GodId[];
  orbs: Record<ThreePlayerOrbAffinity, number>;
  graveyard: ThreePlayerGravePiece[];
  upgrades: Record<string, 1 | 2 | 3>;
}

export interface ThreePlayerDraftState {
  order: ThreePlayerSeat[];
  pickIndex: number;
  available: GodId[];
  unused: GodId[];
}

export interface ThreePlayerEnPassant {
  target: ThreePlayerCell;
  capturedCell: ThreePlayerCell;
  pawnId: string;
  expiresOnTurn: number;
}

export interface ThreePlayerCastlingRights {
  king: boolean;
  queen: boolean;
}

export interface ThreePlayerPassCycle {
  positionRevision: number;
  passedSeats: ThreePlayerSeat[];
}

export type ThreePlayerResult =
  | {
    kind: "winner";
    seat: ThreePlayerSeat;
    reason: "first-checkmate" | "last-survivor";
  }
  | {
    kind: "draw";
    reason: "stalemate" | "stalemate-cycle";
  };

export interface ThreePlayerState {
  variant: "three-player";
  schemaVersion: 1;
  phase: ThreePlayerPhase;
  config: ThreePlayerConfig;
  board: Record<ThreePlayerCell, ThreePlayerPiece>;
  players: Record<ThreePlayerSeat, ThreePlayerSeatState>;
  activeSeat: ThreePlayerSeat;
  turnOrder: ThreePlayerSeat[];
  draft: ThreePlayerDraftState;
  rested: GodId[];
  round: number;
  turn: number;
  completedTurns: Record<ThreePlayerSeat, number>;
  castlingRights: Record<ThreePlayerSeat, ThreePlayerCastlingRights>;
  enPassant?: ThreePlayerEnPassant;
  attackSequence: number;
  kingAttackRecency: Record<
    ThreePlayerSeat,
    Partial<Record<ThreePlayerSeat, number>>
  >;
  revision: number;
  positionRevision: number;
  passCycle: ThreePlayerPassCycle;
  result?: ThreePlayerResult;
  history: string[];
  lastAction?: string;
  notice: string;
}

export type ThreePlayerPromotion = Extract<
  PieceType,
  "queen" | "rook" | "bishop" | "knight"
>;

export interface ThreePlayerMove {
  from: ThreePlayerCell;
  to: ThreePlayerCell;
  promotion?: ThreePlayerPromotion;
}

export type ThreePlayerAction =
  | { type: "draft"; godId: GodId }
  | { type: "move"; from: ThreePlayerCell; to: ThreePlayerCell; promotion?: ThreePlayerPromotion }
  | { type: "load"; state: ThreePlayerState }
  | { type: "restart" };
