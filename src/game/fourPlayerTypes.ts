import type {
  GodId,
  MoveFirstCandidate,
  MoveFirstMove,
  PieceType,
  Square,
} from "./types";

export const FOUR_PLAYER_SEATS = ["north", "east", "south", "west"] as const;
export type Seat = (typeof FOUR_PLAYER_SEATS)[number];
export type TeamId = "team-a" | "team-b";
export type FourPlayerMode = "ffa" | "teams";
export type TurnPolicy = "clockwise" | "alternate-teams";
export type VictoryMode = "last-survivor" | "first-king-captured";
export type OrbAffinity = "light" | "dark";
export type FourPlayerPhase = "draft" | "play" | "upgrade" | "gameover";

export type SeatControl =
  | { kind: "human"; local: boolean }
  | { kind: "ai"; difficulty?: number }
  | { kind: "online"; participantId?: string; local?: boolean };

export interface FourPlayerSeatConfig {
  name: string;
  displayColor: string;
  orbAffinity: OrbAffinity;
  control: SeatControl;
}

export interface FourPlayerConfig {
  mode: FourPlayerMode;
  teams?: Record<Seat, TeamId>;
  turnPolicy: TurnPolicy;
  victoryMode: VictoryMode;
  takeover: boolean;
  startingSeat: Seat;
  seats: Record<Seat, FourPlayerSeatConfig>;
}

export interface FourPlayerPieceStatus {
  hardened?: number | "choice" | "god";
  frozen?: number | "god";
  frozenBy?: Seat;
  gazing?: boolean;
  poisoned?: number | "god";
  poisonedBy?: Seat;
  polymorphed?: number | "god";
  luredBy?: Seat;
  hexedBy?: Seat;
  prepared?: boolean | { owner: Seat; level: 1 | 2 | 3 };
  ritual?: { owner: Seat; expires: number | "kangus" };
  markedForDeath?: { owner: Seat; round: number; immediate?: boolean };
  hired?: boolean;
  movedThisTurn?: boolean;
  chargeUntil?: number | "god";
}

export interface FourPlayerPiece {
  id: string;
  type: PieceType;
  owner: Seat;
  controller: Seat | null;
  displayColor: string;
  orbAffinity: OrbAffinity;
  hasMoved: boolean;
  status: FourPlayerPieceStatus;
}

export interface FourPlayerGravePiece {
  piece: FourPlayerPiece;
  capturedOnTurn: number;
}

export interface FourPlayerSeatState {
  seat: Seat;
  name: string;
  team?: TeamId;
  displayColor: string;
  orbAffinity: OrbAffinity;
  control: SeatControl;
  eliminated: boolean;
  eliminatedBy?: Seat;
  gods: GodId[];
  orbs: Record<OrbAffinity, number>;
  graveyard: FourPlayerGravePiece[];
  upgrades: Record<string, 1 | 2 | 3>;
}

export interface FourPlayerDraftState {
  order: Seat[];
  pickIndex: number;
  available: GodId[];
}

export interface FourPlayerBanana {
  square: Square;
  owner: Seat;
  expires: number | "kangus" | "god";
}

export interface FourPlayerStealthMove {
  piece: FourPlayerPiece;
  destination: Square;
  returnOnTurn: number;
}

export interface FourPlayerEnPassant {
  target: Square;
  capturedSquare: Square;
  pawnId: string;
  expiresOnTurn: number;
}

export interface FourPlayerOrbAnimation {
  id: number;
  player: Seat;
  orb: OrbAffinity;
  amount: number;
  total: number;
  source: Square;
}

export interface FourPlayerPendingAction {
  godId: GodId;
  abilityId: string;
  step: string;
  source?: Square;
  destination?: Square;
  selected?: string[];
  movedPieceId?: string;
  movesRemaining?: number;
  targetSeat?: Seat;
  queuedMove?: FourPlayerQueuedMove;
}

export interface FourPlayerQueuedMove {
  from: Square;
  to: Square;
  actor: Seat;
  turn: number;
  round: number;
  boardIdentity: string;
  pieceId: string;
}

export interface FourPlayerWinner {
  seat?: Seat;
  team?: TeamId;
  reason: "first-king-captured" | "last-player" | "last-team";
}

export interface FourPlayerPassCycle {
  positionSignature: string;
  passedSeats: Seat[];
}

export interface FourPlayerState {
  variant: "four-player";
  phase: FourPlayerPhase;
  config: FourPlayerConfig;
  board: Record<Square, FourPlayerPiece>;
  players: Record<Seat, FourPlayerSeatState>;
  activeSeat: Seat;
  turnOrder: Seat[];
  draft: FourPlayerDraftState;
  rested: GodId[];
  round: number;
  turn: number;
  seatTurns: Record<Seat, number>;
  hostileTurns: Record<Seat, number>;
  godTurns: Record<Seat, Partial<Record<GodId, number>>>;
  upgradeQueue: Seat[];
  selectedGod?: GodId;
  selectedAbility?: string;
  selectedSquare?: Square;
  legalTargets: Square[];
  legalSeats: Seat[];
  pending?: FourPlayerPendingAction;
  enPassant?: FourPlayerEnPassant;
  bananas: FourPlayerBanana[];
  stealth: Record<Seat, FourPlayerStealthMove[]>;
  bonusTurn?: Seat;
  orbAnimations?: FourPlayerOrbAnimation[];
  nextOrbAnimationId?: number;
  attackSequence?: number;
  kingAttackRecency?: Record<Seat, Partial<Record<Seat, number>>>;
  passCycle?: FourPlayerPassCycle;
  winner?: FourPlayerWinner;
  drawReason?: "stalemate-cycle";
  history: string[];
  lastAction?: string;
  notice: string;
}

export interface FourPlayerMove {
  from: Square;
  to: Square;
  promotion?: PieceType;
}

export type FourPlayerMoveFirstMove = MoveFirstMove<Square>;
export type FourPlayerMoveFirstCandidate = MoveFirstCandidate<
  FourPlayerMoveFirstMove,
  OrbAffinity
>;

export type FourPlayerAction =
  | { type: "draft"; godId: GodId }
  | { type: "select-god"; godId: GodId }
  | { type: "clear-god" }
  | { type: "select-ability"; abilityId: string }
  | { type: "confirm-ability" }
  | { type: "square"; square: Square }
  | { type: "seat"; seat: Seat }
  | { type: "grave"; pieceId: string }
  | { type: "choice"; value: boolean }
  | { type: "amount"; amount: 0 | 1 | 2 }
  | { type: "orb"; orb?: OrbAffinity }
  | { type: "pass" }
  | { type: "cancel" }
  | { type: "upgrade"; abilityId: string }
  | {
    type: "commit-move-first";
    godId: GodId;
    abilityId: string;
    move: FourPlayerMoveFirstMove;
    expectedSeat: Seat;
    expectedTurn: number;
    expectedRound: number;
    expectedBoardIdentity: string;
  }
  | { type: "load"; state: FourPlayerState }
  | { type: "restart" };
