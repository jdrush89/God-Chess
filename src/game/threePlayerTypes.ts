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
export type ThreePlayerPhase = "draft" | "play" | "upgrade" | "gameover";
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

export interface ThreePlayerBanana {
  cell: ThreePlayerCell;
  owner: ThreePlayerSeat;
  expires: number | "kangus" | "god";
}

export interface ThreePlayerStealthMove {
  piece: ThreePlayerPiece;
  destination: ThreePlayerCell;
  returnOnTurn: number;
}

export interface ThreePlayerOrbEvent {
  id: number;
  player: ThreePlayerSeat;
  orb: ThreePlayerOrbAffinity;
  amount: number;
  total: number;
  source: ThreePlayerCell;
}

export type ThreePlayerPresentationEventKind =
  | "move"
  | "capture"
  | "god"
  | "ability"
  | "upgrade"
  | "orb";

export interface ThreePlayerPresentationEvent {
  id: number;
  kind: ThreePlayerPresentationEventKind;
  seat?: ThreePlayerSeat;
  source?: ThreePlayerCell;
  destination?: ThreePlayerCell;
  pieceId?: string;
  godId?: GodId;
  abilityId?: string;
}

export interface ThreePlayerPendingAction {
  godId: GodId;
  abilityId: string;
  step: string;
  source?: ThreePlayerCell;
  destination?: ThreePlayerCell;
  selected?: string[];
  selectedCellIds?: ThreePlayerCell[];
  selectedPieceIds?: string[];
  selectedPathIds?: string[];
  movedPieceId?: string;
  movesRemaining?: number;
  targetSeat?: ThreePlayerSeat;
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
  schemaVersion: 2;
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
  seatTurns: Record<ThreePlayerSeat, number>;
  hostileTurns: Record<ThreePlayerSeat, number>;
  godTurns: Record<ThreePlayerSeat, Partial<Record<GodId, number>>>;
  upgradeQueue: ThreePlayerSeat[];
  selectedGod?: GodId;
  selectedAbility?: string;
  selectedCell?: ThreePlayerCell;
  selectedPath?: string;
  legalCells: ThreePlayerCell[];
  legalSeats: ThreePlayerSeat[];
  legalPaths: string[];
  pending?: ThreePlayerPendingAction;
  castlingRights: Record<ThreePlayerSeat, ThreePlayerCastlingRights>;
  enPassant?: ThreePlayerEnPassant;
  bananas: ThreePlayerBanana[];
  stealth: Record<ThreePlayerSeat, ThreePlayerStealthMove[]>;
  bonusTurn?: ThreePlayerSeat;
  orbEvents: ThreePlayerOrbEvent[];
  nextOrbEventId: number;
  presentationEvents: ThreePlayerPresentationEvent[];
  nextPresentationEventId: number;
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
  | { type: "select-god"; godId: GodId }
  | { type: "clear-god" }
  | { type: "select-ability"; abilityId: string }
  | { type: "confirm-ability" }
  | { type: "cell"; cell: ThreePlayerCell }
  | { type: "path"; pathId: string }
  | { type: "seat"; seat: ThreePlayerSeat }
  | { type: "grave"; pieceId: string }
  | { type: "choice"; value: boolean }
  | { type: "amount"; amount: 0 | 1 | 2 }
  | { type: "orb"; orb?: ThreePlayerOrbAffinity }
  | { type: "pass" }
  | { type: "cancel" }
  | { type: "upgrade"; abilityId: string }
  | { type: "move"; from: ThreePlayerCell; to: ThreePlayerCell; promotion?: ThreePlayerPromotion }
  | { type: "load"; state: ThreePlayerState }
  | { type: "restart" };
