import type { Square } from "./types";

export interface BoardGeometry {
  width: number;
  height: number;
  isValid(file: number, rank: number): boolean;
}

export const CLASSIC_GEOMETRY: BoardGeometry = {
  width: 8,
  height: 8,
  isValid: (file, rank) => file >= 0 && file < 8 && rank >= 0 && rank < 8,
};

export const FOUR_PLAYER_GEOMETRY: BoardGeometry = {
  width: 14,
  height: 14,
  isValid: (file, rank) => {
    if (file < 0 || file >= 14 || rank < 0 || rank >= 14) return false;
    return (file >= 3 && file <= 10) || (rank >= 3 && rank <= 10);
  },
};

const fileName = (file: number) => String.fromCharCode("a".charCodeAt(0) + file);

export const geometryCoords = (square: Square): [number, number] => {
  const match = /^([a-z])([1-9]\d*)$/.exec(square);
  if (!match) return [-1, -1];
  return [match[1].charCodeAt(0) - "a".charCodeAt(0), Number(match[2]) - 1];
};

export const geometrySquareAt = (
  geometry: BoardGeometry,
  file: number,
  rank: number,
): Square | undefined =>
  geometry.isValid(file, rank) ? `${fileName(file)}${rank + 1}` : undefined;

export const geometrySquares = (geometry: BoardGeometry): Square[] => {
  const squares: Square[] = [];
  for (let rank = 0; rank < geometry.height; rank += 1) {
    for (let file = 0; file < geometry.width; file += 1) {
      const square = geometrySquareAt(geometry, file, rank);
      if (square) squares.push(square);
    }
  }
  return squares;
};

export const geometryDistance = (from: Square, to: Square) => {
  const [fromFile, fromRank] = geometryCoords(from);
  const [toFile, toRank] = geometryCoords(to);
  return Math.max(Math.abs(toFile - fromFile), Math.abs(toRank - fromRank));
};

export const geometryPathSquares = (
  geometry: BoardGeometry,
  from: Square,
  to: Square,
) => {
  const [fromFile, fromRank] = geometryCoords(from);
  const [toFile, toRank] = geometryCoords(to);
  const fileDistance = Math.abs(toFile - fromFile);
  const rankDistance = Math.abs(toRank - fromRank);
  const isStraight = fileDistance === 0 || rankDistance === 0;
  const isDiagonal = fileDistance === rankDistance;
  if (!isStraight && !isDiagonal) return [];
  const dx = Math.sign(toFile - fromFile);
  const dy = Math.sign(toRank - fromRank);
  const path: Square[] = [];
  let file = fromFile + dx;
  let rank = fromRank + dy;
  while (file !== toFile || rank !== toRank) {
    const square = geometrySquareAt(geometry, file, rank);
    if (!square) break;
    path.push(square);
    file += dx;
    rank += dy;
  }
  return file === toFile && rank === toRank ? path : [];
};

export const geometryFlightPathSquares = (
  geometry: BoardGeometry,
  from: Square,
  to: Square,
) => {
  const directPath = geometryPathSquares(geometry, from, to);
  if (directPath.length || from === to) return directPath;
  const [fromFile, fromRank] = geometryCoords(from);
  const [toFile, toRank] = geometryCoords(to);
  const fileDistance = Math.abs(toFile - fromFile);
  const rankDistance = Math.abs(toRank - fromRank);
  if (!((fileDistance === 1 && rankDistance === 2) || (fileDistance === 2 && rankDistance === 1))) {
    return [];
  }
  return sampledSquares(geometry, from, to, 64);
};

const sampledSquares = (
  geometry: BoardGeometry,
  from: Square,
  to: Square,
  samples: number,
) => {
  const [fromFile, fromRank] = geometryCoords(from);
  const [toFile, toRank] = geometryCoords(to);
  if (
    !geometry.isValid(fromFile, fromRank) ||
    !geometry.isValid(toFile, toRank)
  ) return [];
  const crossed = new Set<Square>();
  for (let step = 1; step < samples; step += 1) {
    const progress = step / samples;
    const file = Math.floor(fromFile + 0.5 + (toFile - fromFile) * progress);
    const rank = Math.floor(fromRank + 0.5 + (toRank - fromRank) * progress);
    const square = geometrySquareAt(geometry, file, rank);
    if (square && square !== from && square !== to) crossed.add(square);
  }
  return [...crossed];
};

export const geometryLineOfSightSquares = (
  geometry: BoardGeometry,
  from: Square,
  to: Square,
) => {
  if (from === to) return [];
  return sampledSquares(geometry, from, to, 512);
};

export const geometryLineStaysOnBoard = (
  geometry: BoardGeometry,
  from: Square,
  to: Square,
  samples = 512,
) => {
  const [fromFile, fromRank] = geometryCoords(from);
  const [toFile, toRank] = geometryCoords(to);
  if (
    !geometry.isValid(fromFile, fromRank) ||
    !geometry.isValid(toFile, toRank)
  ) return false;
  for (let step = 1; step < samples; step += 1) {
    const progress = step / samples;
    const file = Math.floor(fromFile + 0.5 + (toFile - fromFile) * progress);
    const rank = Math.floor(fromRank + 0.5 + (toRank - fromRank) * progress);
    if (!geometry.isValid(file, rank)) return false;
  }
  return true;
};

export const geometryAdjacentSquares = (
  geometry: BoardGeometry,
  square: Square,
  diagonal = true,
) => {
  const [file, rank] = geometryCoords(square);
  const result: Square[] = [];
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      if ((!dx && !dy) || (!diagonal && dx && dy)) continue;
      const target = geometrySquareAt(geometry, file + dx, rank + dy);
      if (target) result.push(target);
    }
  }
  return result;
};

export const geometryRay = (
  geometry: BoardGeometry,
  from: Square,
  direction: readonly [number, number],
  max = Math.max(geometry.width, geometry.height),
) => {
  const [file, rank] = geometryCoords(from);
  const squares: Square[] = [];
  for (let step = 1; step <= max; step += 1) {
    const square = geometrySquareAt(
      geometry,
      file + direction[0] * step,
      rank + direction[1] * step,
    );
    if (!square) break;
    squares.push(square);
  }
  return squares;
};
