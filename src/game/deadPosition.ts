import { squareColor } from "./chess";
import type { Color, GameState, Piece, Square } from "./types";

interface MaterialPiece {
  square: Square;
  piece: Piece;
}

const livingPieces = (state: GameState): MaterialPiece[] => [
  ...Object.entries(state.board).map(([square, piece]) => ({ square, piece })),
  ...(["white", "black"] as const).flatMap((color) =>
    state.stealth[color].map(({ destination, piece }) => ({
      square: destination,
      piece,
    }))
  ),
];

const hasDivineMatingPotential = (
  state: GameState,
  pieces: MaterialPiece[],
  color: Color,
) => {
  const controlled = pieces.filter(({ piece }) => piece.controller === color);
  const player = state.players[color];

  if (
    controlled.some(({ piece }) =>
      piece.type === "knight" && Boolean(piece.status.chargeUntil)
    )
  ) return true;

  if (
    player.gods.includes("chiron") &&
    controlled.some(({ piece }) => piece.type === "knight")
  ) return true;

  return player.gods.includes("death") &&
    controlled.some(({ piece }) => piece.type === "bishop") &&
    player.graveyard.some(({ piece }) => piece.type !== "king");
};

const canChangeBishopSquareColor = (
  state: GameState,
  color: Color,
) => {
  const gods = state.players[color].gods;
  return gods.includes("ares") ||
    gods.includes("leonidas") ||
    gods.includes("salem");
};

export const isClassicDeadPosition = (state: GameState) => {
  if (state.phase !== "play") return false;

  const pieces = livingPieces(state);
  const kings = pieces.filter(({ piece }) => piece.type === "king");
  if (
    kings.length !== 2 ||
    !kings.some(({ piece }) => piece.controller === "white") ||
    !kings.some(({ piece }) => piece.controller === "black")
  ) return false;

  const material = pieces.filter(({ piece }) => piece.type !== "king");
  if (
    (["white", "black"] as const).some((color) =>
      hasDivineMatingPotential(state, pieces, color)
    )
  ) return false;

  if (material.length === 0) return true;

  if (
    material.length === 1 &&
    (material[0].piece.type === "bishop" ||
      material[0].piece.type === "knight")
  ) return true;

  const sameColorBishopEnding = material.length === 2 &&
    material.every(({ piece }) => piece.type === "bishop") &&
    material[0].piece.controller !== material[1].piece.controller &&
    squareColor(material[0].square) === squareColor(material[1].square);
  if (!sameColorBishopEnding) return false;

  return !(["white", "black"] as const).some((color) =>
    canChangeBishopSquareColor(state, color)
  );
};
