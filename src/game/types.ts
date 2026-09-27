export type Color = "white" | "black";
export type GameMode = "local" | "ai" | "online";
export type OrbColor = Color;
export type PieceType = "king" | "queen" | "rook" | "bishop" | "knight" | "pawn";
export type Square = string;
export type GodId =
  | "quetzacoatl"
  | "chiron"
  | "anubis"
  | "teles"
  | "artemis"
  | "kangus"
  | "death"
  | "leonidas"
  | "medusa"
  | "salem"
  | "midas"
  | "ares";

export type AbilityKind =
  | "move"
  | "target"
  | "teleport"
  | "multi-move"
  | "sacrifice"
  | "revive";

export interface Ability {
  id: string;
  name: string;
  summary: string;
  details: [string, string, string];
  kind: AbilityKind;
  cost?: Partial<Record<OrbColor, number>>;
}

export interface God {
  id: GodId;
  name: string;
  epithet: string;
  domain: string;
  accent: string;
  symbol: string;
  abilities: [Ability, Ability, Ability];
}

export interface PieceStatus {
  hardened?: number | "choice" | "god";
  frozen?: number | "god";
  frozenBy?: Color;
  gazing?: boolean;
  poisoned?: number | "god";
  poisonedBy?: Color;
  polymorphed?: number | "god";
  luredBy?: Color;
  hexedBy?: Color;
  prepared?: boolean | { owner: Color; level: 1 | 2 | 3 };
  ritual?: { owner: Color; expires: number | "kangus" };
  markedForDeath?: { owner: Color; round: number; immediate?: boolean };
  hired?: boolean;
  movedThisTurn?: boolean;
  chargeUntil?: number | "god";
}

export interface Piece {
  id: string;
  type: PieceType;
  color: Color;
  controller: Color;
  hasMoved: boolean;
  status: PieceStatus;
}

export interface GravePiece {
  piece: Piece;
  capturedOnTurn: number;
}

export interface PlayerState {
  name: string;
  color: Color;
  gods: GodId[];
  orbs: Record<OrbColor, number>;
  graveyard: GravePiece[];
  upgrades: Record<string, 1 | 2 | 3>;
}

export interface DraftState {
  order: Color[];
  pickIndex: number;
  available: GodId[];
}

export interface Banana {
  square: Square;
  owner: Color;
  expires: number | "kangus" | "god";
}

export interface StealthMove {
  piece: Piece;
  destination: Square;
  returnOnTurn: number;
}

export interface PendingAction {
  godId: GodId;
  abilityId: string;
  step: string;
  source?: Square;
  destination?: Square;
  selected?: Square[];
  movedPieceId?: string;
  movesRemaining?: number;
}

export interface OrbAnimation {
  id: number;
  player: Color;
  orb: OrbColor;
  amount: number;
  total: number;
  source: Square;
}

export interface CaptureAnimation {
  id: number;
  player: Color;
  piece: Piece;
  source: Square;
  total: number;
}

export interface GameState {
  phase: "draft" | "play" | "upgrade" | "gameover";
  gameMode: GameMode;
  aiDifficulty: number;
  aiColor?: Color;
  onlineHostColor?: Color;
  board: Record<Square, Piece>;
  players: Record<Color, PlayerState>;
  activeColor: Color;
  whitePlayer: 1 | 2;
  draft: DraftState;
  rested: GodId[];
  round: number;
  turn: number;
  upgradeQueue: Color[];
  selectedGod?: GodId;
  selectedAbility?: string;
  selectedSquare?: Square;
  legalTargets: Square[];
  pending?: PendingAction;
  enPassant?: Square;
  bananas: Banana[];
  stealth: Record<Color, StealthMove[]>;
  orbAnimations: OrbAnimation[];
  nextOrbAnimationId: number;
  captureAnimations: CaptureAnimation[];
  nextCaptureAnimationId: number;
  bonusTurn?: Color;
  winner?: Color;
  history: string[];
  notice: string;
}

export interface Move {
  from: Square;
  to: Square;
  capture?: Piece;
  castle?: "king" | "queen";
  enPassant?: Square;
  promotion?: PieceType;
}

export const opposite = (color: Color): Color => (color === "white" ? "black" : "white");
