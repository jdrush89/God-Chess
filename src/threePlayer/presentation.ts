import type {
  ThreePlayerPiece,
  ThreePlayerPieceStatus,
} from "../game/threePlayerTypes";

export const THREE_PLAYER_PIECE_SYMBOLS: Record<ThreePlayerPiece["type"], string> = {
  king: "♚",
  queen: "♛",
  rook: "♜",
  bishop: "♝",
  knight: "♞",
  pawn: "♟",
};

export const THREE_PLAYER_PIECE_NAMES: Record<ThreePlayerPiece["type"], string> = {
  king: "King",
  queen: "Queen",
  rook: "Rook",
  bishop: "Bishop",
  knight: "Knight",
  pawn: "Pawn",
};

export const THREE_PLAYER_STATUS_LABELS: ReadonlyArray<{
  key: keyof ThreePlayerPieceStatus;
  label: string;
}> = [
  { key: "hardened", label: "Hardened" },
  { key: "frozen", label: "Stone" },
  { key: "gazing", label: "Gazing" },
  { key: "poisoned", label: "Poisoned" },
  { key: "polymorphed", label: "Polymorphed" },
  { key: "luredBy", label: "Lured" },
  { key: "hexedBy", label: "Hexed" },
  { key: "prepared", label: "Prepared" },
  { key: "ritual", label: "Ritual" },
  { key: "markedForDeath", label: "Marked" },
  { key: "hired", label: "Hired" },
  { key: "chargeUntil", label: "Charged" },
];

export const threePlayerPieceStatusLabels = (piece: ThreePlayerPiece) =>
  THREE_PLAYER_STATUS_LABELS
    .filter(({ key }) => Boolean(piece.status[key]))
    .map(({ label }) => label);
