import type { Banana, Color, Move, Piece, PieceType, Square } from "./types";
import { opposite } from "./types";

export const files = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export const ranks = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;
export const allSquares = ranks.flatMap((rank) => files.map((file) => `${file}${rank}`));

export const coords = (square: Square): [number, number] => [
  files.indexOf(square[0] as (typeof files)[number]),
  Number(square[1]) - 1,
];

export const squareAt = (file: number, rank: number): Square | undefined =>
  file >= 0 && file < 8 && rank >= 0 && rank < 8 ? `${files[file]}${rank + 1}` : undefined;

export const squareColor = (square: Square): Color => {
  const [file, rank] = coords(square);
  return (file + rank) % 2 === 0 ? "black" : "white";
};

export const distance = (from: Square, to: Square) => {
  const [fx, fy] = coords(from);
  const [tx, ty] = coords(to);
  return Math.max(Math.abs(tx - fx), Math.abs(ty - fy));
};

export const createInitialBoard = (): Record<Square, Piece> => {
  const board: Record<Square, Piece> = {};
  const backRank: PieceType[] = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];
  for (const color of ["white", "black"] as Color[]) {
    const back = color === "white" ? "1" : "8";
    const pawn = color === "white" ? "2" : "7";
    backRank.forEach((type, index) => {
      const square = `${files[index]}${back}`;
      board[square] = {
        id: `${color}-${type}-${index}`,
        type,
        color,
        controller: color,
        hasMoved: false,
        status: {},
      };
      const pawnSquare = `${files[index]}${pawn}`;
      board[pawnSquare] = {
        id: `${color}-pawn-${index}`,
        type: "pawn",
        color,
        controller: color,
        hasMoved: false,
        status: {},
      };
    });
  }
  return board;
};

const ray = (
  board: Record<Square, Piece>,
  from: Square,
  color: Color,
  directions: [number, number][],
  max = 8,
  ignoreBlockers = false,
  noCapture = false,
  bananas: Banana[] = [],
  includeFriendlyTargets = false,
) => {
  const [file, rank] = coords(from);
  const moves: Square[] = [];
  for (const [dx, dy] of directions) {
    for (let step = 1; step <= max; step += 1) {
      const target = squareAt(file + dx * step, rank + dy * step);
      if (!target) break;
      const occupying = board[target];
      const stopsAtBanana = bananas.some((banana) => banana.square === target && banana.owner !== color);
      if (!occupying) {
        moves.push(target);
        if (stopsAtBanana) break;
        continue;
      }
      if (ignoreBlockers) {
        if (
          !noCapture &&
          (
            (occupying.controller !== color && !occupying.status.hardened) ||
            (occupying.controller === color && includeFriendlyTargets)
          )
        ) {
          moves.push(target);
        }
        continue;
      }
      if (
        !noCapture &&
        (
          (occupying.controller !== color && !occupying.status.hardened) ||
          (occupying.controller === color && includeFriendlyTargets)
        )
      ) {
        moves.push(target);
      }
      break;
    }
  }
  return moves;
};

const pawnMoves = (
  board: Record<Square, Piece>,
  from: Square,
  piece: Piece,
  attacksOnly: boolean,
  enPassant?: Square,
  bananas: Banana[] = [],
  ignoreBlockers = false,
) => {
  const [file, rank] = coords(from);
  const direction = piece.color === "white" ? 1 : -1;
  const targets: Square[] = [];
  for (const dx of [-1, 1]) {
    const target = squareAt(file + dx, rank + direction);
    if (!target) continue;
    if (attacksOnly || (board[target] && board[target].controller !== piece.controller) || target === enPassant) {
      targets.push(target);
    }
  }
  if (attacksOnly) return targets;
  const one = squareAt(file, rank + direction);
  if (one && (!board[one] || ignoreBlockers)) {
    if (!board[one]) targets.push(one);
    const two = squareAt(file, rank + direction * 2);
    const stoppedAtOne = bananas.some((banana) => banana.square === one && banana.owner !== piece.controller);
    if (!piece.hasMoved && !stoppedAtOne && two && !board[two]) targets.push(two);
  }
  return targets;
};

export interface MoveOptions {
  enPassant?: Square;
  attacksOnly?: boolean;
  ignoreCheck?: boolean;
  ignoreBlockers?: boolean;
  noCapture?: boolean;
  maxDistance?: number;
  forceType?: PieceType;
  bananas?: Banana[];
  includeFriendlyTargets?: boolean;
}

export const pseudoTargets = (
  board: Record<Square, Piece>,
  from: Square,
  options: MoveOptions = {},
): Square[] => {
  const piece = board[from];
  if (!piece) return [];
  if (!options.attacksOnly && (piece.status.hardened || piece.status.frozen || piece.status.gazing)) return [];
  const [file, rank] = coords(from);
  const type = piece.status.polymorphed ? "pawn" : options.forceType ?? piece.type;
  let targets: Square[] = [];
  const diagonal: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const straight: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  if (type === "pawn") {
    targets = pawnMoves(
      board,
      from,
      piece,
      Boolean(options.attacksOnly),
      options.enPassant,
      options.bananas,
      options.ignoreBlockers,
    );
  } else if (type === "knight") {
    const jumps = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
    targets = jumps
      .map(([dx, dy]) => squareAt(file + dx, rank + dy))
      .filter((square): square is Square => Boolean(square))
      .filter((square) =>
        !board[square] ||
        (board[square].controller !== piece.controller && !board[square].status.hardened) ||
        (board[square].controller === piece.controller && options.includeFriendlyTargets),
      );
  } else if (type === "bishop") {
    targets = ray(board, from, piece.controller, diagonal, options.maxDistance, options.ignoreBlockers, options.noCapture, options.bananas, options.includeFriendlyTargets);
  } else if (type === "rook") {
    targets = ray(board, from, piece.controller, straight, options.maxDistance, options.ignoreBlockers, options.noCapture, options.bananas, options.includeFriendlyTargets);
  } else if (type === "queen") {
    targets = ray(board, from, piece.controller, [...diagonal, ...straight], options.maxDistance, options.ignoreBlockers, options.noCapture, options.bananas, options.includeFriendlyTargets);
  } else {
    targets = ray(board, from, piece.controller, [...diagonal, ...straight], 1, false, options.noCapture, options.bananas, options.includeFriendlyTargets);
    if (!piece.hasMoved && !options.attacksOnly && !options.forceType) {
      for (const side of ["king", "queen"] as const) {
        if (canCastle(board, piece.controller, side, options.bananas)) targets.push(side === "king" ? `g${piece.color === "white" ? "1" : "8"}` : `c${piece.color === "white" ? "1" : "8"}`);
      }
    }
  }

  if (piece.status.poisoned && !options.attacksOnly) {
    targets = targets.filter((target) => distance(from, target) <= 3);
  }
  return targets.filter((target) => {
    const occupant = board[target];
    return !occupant || occupant.controller !== piece.controller || options.includeFriendlyTargets;
  });
};

export const isSquareAttacked = (board: Record<Square, Piece>, square: Square, by: Color, bananas: Banana[] = []) =>
  Object.entries(board).some(([from, piece]) =>
    piece.controller === by && pseudoTargets(board, from, { attacksOnly: true, ignoreCheck: true, bananas }).includes(square),
  );

export const kingSquare = (board: Record<Square, Piece>, color: Color) =>
  Object.entries(board).find(([, piece]) => piece.type === "king" && piece.controller === color)?.[0];

export const isInCheck = (board: Record<Square, Piece>, color: Color, bananas: Banana[] = []) => {
  const king = kingSquare(board, color);
  return king ? isSquareAttacked(board, king, opposite(color), bananas) : true;
};

const boardAfterBasicMove = (board: Record<Square, Piece>, from: Square, to: Square, enPassant?: Square) => {
  const next = { ...board };
  const piece = next[from];
  delete next[from];
  if (piece.type === "pawn" && to === enPassant && !board[to]) {
    const [file, rank] = coords(to);
    const captured = squareAt(file, rank + (piece.color === "white" ? -1 : 1));
    if (captured) delete next[captured];
  }
  next[to] = { ...piece, hasMoved: true };
  if (piece.type === "king" && Math.abs(coords(to)[0] - coords(from)[0]) === 2) {
    const rank = piece.color === "white" ? 0 : 7;
    const kingSide = coords(to)[0] === 6;
    const rookFrom = squareAt(kingSide ? 7 : 0, rank)!;
    const rookTo = squareAt(kingSide ? 5 : 3, rank)!;
    next[rookTo] = { ...next[rookFrom], hasMoved: true };
    delete next[rookFrom];
  }
  return next;
};

export const legalTargets = (
  board: Record<Square, Piece>,
  from: Square,
  options: MoveOptions = {},
) => {
  const piece = board[from];
  if (!piece) return [];
  const raw = pseudoTargets(board, from, options);
  if (options.ignoreCheck) return raw;
  return raw.filter((to) =>
    !isInCheck(boardAfterBasicMove(board, from, to, options.enPassant), piece.controller, options.bananas),
  );
};

export const canCastle = (
  board: Record<Square, Piece>,
  color: Color,
  side: "king" | "queen",
  bananas: Banana[] = [],
) => {
  const rank = color === "white" ? "1" : "8";
  const king = board[`e${rank}`];
  const rookSquare = `${side === "king" ? "h" : "a"}${rank}`;
  const rook = board[rookSquare];
  if (!king || !rook || king.hasMoved || rook.hasMoved || king.type !== "king" || rook.type !== "rook") return false;
  const clear = side === "king" ? [`f${rank}`, `g${rank}`] : [`b${rank}`, `c${rank}`, `d${rank}`];
  if (clear.some((square) => board[square])) return false;
  const safe = side === "king" ? [`e${rank}`, `f${rank}`, `g${rank}`] : [`e${rank}`, `d${rank}`, `c${rank}`];
  return safe.every((square) => !isSquareAttacked(board, square, opposite(color), bananas));
};

export const pathSquares = (from: Square, to: Square) => {
  const [fx, fy] = coords(from);
  const [tx, ty] = coords(to);
  const fileDistance = Math.abs(tx - fx);
  const rankDistance = Math.abs(ty - fy);
  const isStraight = fileDistance === 0 || rankDistance === 0;
  const isDiagonal = fileDistance === rankDistance;
  if (!isStraight && !isDiagonal) return [];
  const dx = Math.sign(tx - fx);
  const dy = Math.sign(ty - fy);
  const path: Square[] = [];
  let x = fx + dx;
  let y = fy + dy;
  while (x !== tx || y !== ty) {
    const square = squareAt(x, y);
    if (square) path.push(square);
    x += dx;
    y += dy;
  }
  return path;
};

export const flightPathSquares = (from: Square, to: Square) => {
  const directPath = pathSquares(from, to);
  if (directPath.length || from === to) return directPath;

  const [fromFile, fromRank] = coords(from);
  const [toFile, toRank] = coords(to);
  const fileDistance = Math.abs(toFile - fromFile);
  const rankDistance = Math.abs(toRank - fromRank);
  if (!((fileDistance === 1 && rankDistance === 2) || (fileDistance === 2 && rankDistance === 1))) return [];

  const crossed = new Set<Square>();
  const samples = 64;
  for (let step = 1; step < samples; step += 1) {
    const progress = step / samples;
    const file = Math.floor(fromFile + 0.5 + (toFile - fromFile) * progress);
    const rank = Math.floor(fromRank + 0.5 + (toRank - fromRank) * progress);
    const square = squareAt(file, rank);
    if (square && square !== from && square !== to) crossed.add(square);
  }
  return [...crossed];
};

export const lineOfSightSquares = (from: Square, to: Square) => {
  if (from === to) return [];
  const [fromFile, fromRank] = coords(from);
  const [toFile, toRank] = coords(to);
  const crossed = new Set<Square>();
  const samples = 512;
  for (let step = 1; step < samples; step += 1) {
    const progress = step / samples;
    const file = Math.floor(fromFile + 0.5 + (toFile - fromFile) * progress);
    const rank = Math.floor(fromRank + 0.5 + (toRank - fromRank) * progress);
    const square = squareAt(file, rank);
    if (square && square !== from && square !== to) crossed.add(square);
  }
  return [...crossed];
};

export const lineOfSight = (board: Record<Square, Piece>, from: Square, to: Square) => {
  return lineOfSightSquares(from, to).every((square) => !board[square]);
};

export const adjacentSquares = (square: Square, diagonal = true) => {
  const [file, rank] = coords(square);
  const result: Square[] = [];
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      if ((!dx && !dy) || (!diagonal && dx && dy)) continue;
      const target = squareAt(file + dx, rank + dy);
      if (target) result.push(target);
    }
  }
  return result;
};

export const applyMove = (
  board: Record<Square, Piece>,
  move: Move,
  enPassant?: Square,
): { board: Record<Square, Piece>; captured?: Piece; capturedSquare?: Square; enPassant?: Square } => {
  const moving = board[move.from];
  let captured = board[move.to];
  let capturedSquare = captured ? move.to : undefined;
  const next = { ...board };
  delete next[move.from];
  if (moving.type === "pawn" && move.to === enPassant && !captured) {
    const [file, rank] = coords(move.to);
    const captureSquare = squareAt(file, rank + (moving.color === "white" ? -1 : 1));
    if (captureSquare) {
      captured = next[captureSquare];
      capturedSquare = captured ? captureSquare : undefined;
      delete next[captureSquare];
    }
  }
  let type = moving.type;
  if (type === "pawn" && (move.to[1] === "8" || move.to[1] === "1")) type = move.promotion ?? "queen";
  next[move.to] = { ...moving, type, hasMoved: true, status: { ...moving.status, movedThisTurn: true } };

  if (moving.type === "king" && Math.abs(coords(move.to)[0] - coords(move.from)[0]) === 2) {
    const rank = moving.color === "white" ? 0 : 7;
    const kingSide = coords(move.to)[0] === 6;
    const rookFrom = squareAt(kingSide ? 7 : 0, rank)!;
    const rookTo = squareAt(kingSide ? 5 : 3, rank)!;
    next[rookTo] = { ...next[rookFrom], hasMoved: true };
    delete next[rookFrom];
  }

  let nextEnPassant: Square | undefined;
  if (moving.type === "pawn" && Math.abs(coords(move.to)[1] - coords(move.from)[1]) === 2) {
    const [file, rank] = coords(move.from);
    nextEnPassant = squareAt(file, rank + (moving.color === "white" ? 1 : -1));
  }
  return { board: next, captured, capturedSquare, enPassant: nextEnPassant };
};

export const hasAnyLegalMove = (board: Record<Square, Piece>, color: Color, enPassant?: Square, bananas: Banana[] = []) =>
  Object.entries(board).some(
    ([square, piece]) => piece.controller === color && legalTargets(board, square, { enPassant, bananas }).length > 0,
  );

export const pieceValue = (type: PieceType) =>
  ({ pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100 })[type];
