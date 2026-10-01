import {
  FOUR_PLAYER_GEOMETRY,
  geometryAdjacentSquares,
  geometryCoords,
  geometryDistance,
  geometryFlightPathSquares,
  geometryLineStaysOnBoard,
  geometryLineOfSightSquares,
  geometryPathSquares,
  geometrySquareAt,
  geometrySquares,
} from "./geometry";
import { seatsAreAllies, seatsAreHostile } from "./fourPlayerConfig";
import {
  FOUR_PLAYER_SEATS,
  type FourPlayerBanana,
  type FourPlayerConfig,
  type FourPlayerEnPassant,
  type FourPlayerMove,
  type FourPlayerPiece,
  type OrbAffinity,
  type Seat,
} from "./fourPlayerTypes";
import type { PieceType, Square } from "./types";

export type Direction = readonly [number, number];

export const fourPlayerSquares = geometrySquares(FOUR_PLAYER_GEOMETRY);
export const fourPlayerCoords = geometryCoords;
export const fourPlayerSquareAt = (file: number, rank: number) =>
  geometrySquareAt(FOUR_PLAYER_GEOMETRY, file, rank);
export const fourPlayerDistance = geometryDistance;
export const fourPlayerAdjacentSquares = (square: Square, diagonal = true) =>
  geometryAdjacentSquares(FOUR_PLAYER_GEOMETRY, square, diagonal);
export const fourPlayerPathSquares = (from: Square, to: Square) =>
  geometryPathSquares(FOUR_PLAYER_GEOMETRY, from, to);
export const fourPlayerFlightPathSquares = (from: Square, to: Square) =>
  geometryFlightPathSquares(FOUR_PLAYER_GEOMETRY, from, to);
export const fourPlayerLineOfSightSquares = (from: Square, to: Square) =>
  geometryLineOfSightSquares(FOUR_PLAYER_GEOMETRY, from, to);

export const forwardDirection = (seat: Seat): Direction => {
  if (seat === "north") return [0, -1];
  if (seat === "east") return [-1, 0];
  if (seat === "south") return [0, 1];
  return [1, 0];
};

export const leftDirection = (seat: Seat): Direction => {
  const [forwardFile, forwardRank] = forwardDirection(seat);
  return [-forwardRank || 0, forwardFile || 0];
};

export const rightDirection = (seat: Seat): Direction => {
  const [leftFile, leftRank] = leftDirection(seat);
  return [-leftFile || 0, -leftRank || 0];
};

export const oppositeSeat = (seat: Seat): Seat => ({
  north: "south",
  east: "west",
  south: "north",
  west: "east",
})[seat] as Seat;

export const homeSquares = (seat: Seat): Square[] => {
  if (seat === "south") return Array.from({ length: 8 }, (_, index) => fourPlayerSquareAt(index + 3, 0)!);
  if (seat === "north") return Array.from({ length: 8 }, (_, index) => fourPlayerSquareAt(10 - index, 13)!);
  if (seat === "west") return Array.from({ length: 8 }, (_, index) => fourPlayerSquareAt(0, 10 - index)!);
  return Array.from({ length: 8 }, (_, index) => fourPlayerSquareAt(13, index + 3)!);
};

export const pawnSquares = (seat: Seat) => {
  const [forwardFile, forwardRank] = forwardDirection(seat);
  return homeSquares(seat).map((square) => {
    const [file, rank] = fourPlayerCoords(square);
    return fourPlayerSquareAt(file + forwardFile, rank + forwardRank)!;
  });
};

export const promotionSquares = (seat: Seat) => new Set(homeSquares(oppositeSeat(seat)));

export const fourPlayerSquareAffinity = (square: Square): OrbAffinity => {
  const [file, rank] = fourPlayerCoords(square);
  return (file + rank) % 2 === 0 ? "dark" : "light";
};

const backRank: PieceType[] = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];

export const createFourPlayerInitialBoard = (
  config: FourPlayerConfig,
): Record<Square, FourPlayerPiece> => {
  const board: Record<Square, FourPlayerPiece> = {};
  for (const seat of FOUR_PLAYER_SEATS) {
    homeSquares(seat).forEach((square, index) => {
      board[square] = {
        id: `${seat}-${backRank[index]}-${index}`,
        type: backRank[index],
        owner: seat,
        controller: seat,
        displayColor: config.seats[seat].displayColor,
        orbAffinity: config.seats[seat].orbAffinity,
        hasMoved: false,
        status: {},
      };
    });
    pawnSquares(seat).forEach((square, index) => {
      board[square] = {
        id: `${seat}-pawn-${index}`,
        type: "pawn",
        owner: seat,
        controller: seat,
        displayColor: config.seats[seat].displayColor,
        orbAffinity: config.seats[seat].orbAffinity,
        hasMoved: false,
        status: {},
      };
    });
  }
  return board;
};

const canCapture = (
  config: FourPlayerConfig,
  actor: Seat,
  target: FourPlayerPiece,
  includeAlliedTargets = false,
  attacksOnly = false,
) => {
  if (target.type === "king") return attacksOnly;
  if (target.status.hardened) return false;
  if (target.controller === null) return true;
  return seatsAreHostile(config, actor, target.controller) || includeAlliedTargets;
};

const stoppedByBanana = (
  config: FourPlayerConfig,
  bananas: FourPlayerBanana[],
  target: Square,
  actor: Seat,
) => bananas.some(
  (banana) => banana.square === target && seatsAreHostile(config, actor, banana.owner),
);

const rayTargets = (
  board: Record<Square, FourPlayerPiece>,
  from: Square,
  actor: Seat,
  config: FourPlayerConfig,
  directions: Direction[],
  options: FourPlayerMoveOptions,
) => {
  const [file, rank] = fourPlayerCoords(from);
  const targets: Square[] = [];
  const max = options.maxDistance ?? 14;
  for (const [fileStep, rankStep] of directions) {
    for (let step = 1; step <= max; step += 1) {
      const target = fourPlayerSquareAt(file + fileStep * step, rank + rankStep * step);
      if (!target) break;
      const occupying = board[target];
      const banana = stoppedByBanana(config, options.bananas ?? [], target, actor);
      if (!occupying) {
        targets.push(target);
        if (banana) break;
        continue;
      }
      if (
        !options.noCapture &&
        canCapture(
          config,
          actor,
          occupying,
          options.includeAlliedTargets,
          options.attacksOnly,
        )
      ) {
        targets.push(target);
      }
      if (!options.ignoreBlockers) break;
    }
  }
  return targets;
};

const pawnTargets = (
  board: Record<Square, FourPlayerPiece>,
  from: Square,
  piece: FourPlayerPiece,
  actor: Seat,
  config: FourPlayerConfig,
  options: FourPlayerMoveOptions,
) => {
  const [file, rank] = fourPlayerCoords(from);
  const [forwardFile, forwardRank] = forwardDirection(piece.owner);
  const [leftFile, leftRank] = leftDirection(piece.owner);
  const [rightFile, rightRank] = rightDirection(piece.owner);
  const targets: Square[] = [];
  for (const [sideFile, sideRank] of [[leftFile, leftRank], [rightFile, rightRank]] as Direction[]) {
    const target = fourPlayerSquareAt(
      file + forwardFile + sideFile,
      rank + forwardRank + sideRank,
    );
    if (!target) continue;
    const occupying = board[target];
    const enPassantPiece = target === options.enPassant?.target
      ? board[options.enPassant.capturedSquare]
      : undefined;
    if (
      options.attacksOnly ||
      (occupying && canCapture(
        config,
        actor,
        occupying,
        options.includeAlliedTargets,
        options.attacksOnly,
      )) ||
      (enPassantPiece && canCapture(
        config,
        actor,
        enPassantPiece,
        options.includeAlliedTargets,
        options.attacksOnly,
      ))
    ) {
      targets.push(target);
    }
  }
  if (options.attacksOnly) return targets;
  const one = fourPlayerSquareAt(file + forwardFile, rank + forwardRank);
  if (one && (!board[one] || options.ignoreBlockers)) {
    if (!board[one]) targets.push(one);
    const two = fourPlayerSquareAt(file + forwardFile * 2, rank + forwardRank * 2);
    if (
      !piece.hasMoved &&
      !stoppedByBanana(config, options.bananas ?? [], one, actor) &&
      two &&
      !board[two]
    ) {
      targets.push(two);
    }
  }
  return targets;
};

export interface FourPlayerMoveOptions {
  enPassant?: FourPlayerEnPassant;
  attacksOnly?: boolean;
  ignoreCheck?: boolean;
  ignoreBlockers?: boolean;
  noCapture?: boolean;
  maxDistance?: number;
  forceType?: PieceType;
  bananas?: FourPlayerBanana[];
  includeAlliedTargets?: boolean;
}

export const fourPlayerPseudoTargets = (
  board: Record<Square, FourPlayerPiece>,
  from: Square,
  config: FourPlayerConfig,
  options: FourPlayerMoveOptions = {},
) => {
  const piece = board[from];
  const actor = piece?.controller;
  if (!piece || !actor) return [];
  if (!options.attacksOnly && (piece.status.hardened || piece.status.frozen || piece.status.gazing)) return [];
  const [file, rank] = fourPlayerCoords(from);
  const type = piece.status.polymorphed ? "pawn" : options.forceType ?? piece.type;
  const diagonal: Direction[] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const straight: Direction[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let targets: Square[];
  if (type === "pawn") {
    targets = pawnTargets(board, from, piece, actor, config, options);
  } else if (type === "knight") {
    const jumps: Direction[] = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
    targets = jumps
      .map(([fileStep, rankStep]) => fourPlayerSquareAt(file + fileStep, rank + rankStep))
      .filter((square): square is Square => Boolean(square))
      .filter((square) => {
        const occupying = board[square];
        return !occupying || canCapture(
          config,
          actor,
          occupying,
          options.includeAlliedTargets,
          options.attacksOnly,
        );
      });
  } else if (type === "bishop") {
    targets = rayTargets(board, from, actor, config, diagonal, options);
  } else if (type === "rook") {
    targets = rayTargets(board, from, actor, config, straight, options);
  } else if (type === "queen") {
    targets = rayTargets(board, from, actor, config, [...diagonal, ...straight], options);
  } else {
    targets = rayTargets(board, from, actor, config, [...diagonal, ...straight], {
      ...options,
      maxDistance: 1,
      ignoreBlockers: false,
    });
    if (!piece.hasMoved && !options.attacksOnly && !options.forceType) {
      for (const side of ["king", "queen"] as const) {
        if (fourPlayerCanCastle(board, actor, side, config, options.bananas)) {
          targets.push(homeSquares(piece.owner)[side === "king" ? 6 : 2]);
        }
      }
    }
  }
  if (piece.status.poisoned && !options.attacksOnly) {
    targets = targets.filter((target) => fourPlayerDistance(from, target) <= 3);
  }
  return targets.filter((target) => {
    const occupying = board[target];
    return !occupying || canCapture(
      config,
      actor,
      occupying,
      options.includeAlliedTargets,
      options.attacksOnly,
    );
  });
};

export const fourPlayerKingSquare = (
  board: Record<Square, FourPlayerPiece>,
  seat: Seat,
) => Object.entries(board).find(([, piece]) =>
  piece.type === "king" && piece.controller === seat
)?.[0];

export const fourPlayerIsSquareAttackedBy = (
  board: Record<Square, FourPlayerPiece>,
  square: Square,
  attacker: Seat,
  config: FourPlayerConfig,
  bananas: FourPlayerBanana[] = [],
) => Object.entries(board).some(([from, piece]) =>
  piece.controller === attacker &&
  !piece.status.frozen &&
  fourPlayerPseudoTargets(board, from, config, {
    attacksOnly: true,
    ignoreCheck: true,
    bananas,
    includeAlliedTargets: true,
  }).includes(square),
);

export const fourPlayerIsSquareAttacked = (
  board: Record<Square, FourPlayerPiece>,
  square: Square,
  defender: Seat,
  config: FourPlayerConfig,
  bananas: FourPlayerBanana[] = [],
) => FOUR_PLAYER_SEATS.some((attacker) =>
  seatsAreHostile(config, defender, attacker) &&
  fourPlayerIsSquareAttackedBy(board, square, attacker, config, bananas),
);

export const fourPlayerIsInCheck = (
  board: Record<Square, FourPlayerPiece>,
  seat: Seat,
  config: FourPlayerConfig,
  bananas: FourPlayerBanana[] = [],
) => {
  const king = fourPlayerKingSquare(board, seat);
  return king ? fourPlayerIsSquareAttacked(board, king, seat, config, bananas) : true;
};

const boardAfterBasicMove = (
  board: Record<Square, FourPlayerPiece>,
  move: FourPlayerMove,
  enPassant?: FourPlayerEnPassant,
) => fourPlayerApplyMove(board, move, enPassant).board;

export const fourPlayerLegalTargets = (
  board: Record<Square, FourPlayerPiece>,
  from: Square,
  config: FourPlayerConfig,
  options: FourPlayerMoveOptions = {},
) => {
  const piece = board[from];
  if (!piece?.controller) return [];
  const targets = fourPlayerPseudoTargets(board, from, config, options);
  if (options.ignoreCheck) return targets;
  return targets.filter((to) =>
    !fourPlayerIsInCheck(
      boardAfterBasicMove(board, { from, to }, options.enPassant),
      piece.controller!,
      config,
      options.bananas,
    )
  );
};

export const fourPlayerCanCastle = (
  board: Record<Square, FourPlayerPiece>,
  seat: Seat,
  side: "king" | "queen",
  config: FourPlayerConfig,
  bananas: FourPlayerBanana[] = [],
) => {
  const kingEntry = Object.entries(board).find(([, piece]) =>
    piece.type === "king" && piece.owner === seat && piece.controller === seat
  );
  if (!kingEntry) return false;
  const homes = homeSquares(seat);
  const kingSquare = homes[4];
  if (kingEntry[0] !== kingSquare) return false;
  const rookSquare = homes[side === "king" ? 7 : 0];
  const king = board[kingSquare];
  const rook = board[rookSquare];
  if (
    !king ||
    !rook ||
    king.hasMoved ||
    rook.hasMoved ||
    rook.type !== "rook" ||
    rook.controller !== seat
  ) return false;
  const clearIndexes = side === "king" ? [5, 6] : [1, 2, 3];
  if (clearIndexes.some((index) => board[homes[index]])) return false;
  const safeIndexes = side === "king" ? [4, 5, 6] : [4, 3, 2];
  return safeIndexes.every((index) =>
    !fourPlayerIsSquareAttacked(board, homes[index], seat, config, bananas)
  );
};

export const fourPlayerApplyMove = (
  board: Record<Square, FourPlayerPiece>,
  move: FourPlayerMove,
  enPassant?: FourPlayerEnPassant,
): {
  board: Record<Square, FourPlayerPiece>;
  captured?: FourPlayerPiece;
  capturedSquare?: Square;
  enPassant?: Omit<FourPlayerEnPassant, "expiresOnTurn">;
} => {
  const moving = board[move.from];
  if (board[move.to]?.type === "king") {
    throw new Error("Ordinary moves cannot capture a King.");
  }
  let captured = board[move.to];
  let capturedSquare = captured ? move.to : undefined;
  const next = { ...board };
  delete next[move.from];
  if (moving.type === "pawn" && move.to === enPassant?.target && !captured) {
    captured = next[enPassant.capturedSquare];
    capturedSquare = captured ? enPassant.capturedSquare : undefined;
    delete next[enPassant.capturedSquare];
  }
  let type = moving.type;
  if (type === "pawn" && promotionSquares(moving.owner).has(move.to)) {
    type = move.promotion ?? "queen";
  }
  next[move.to] = {
    ...moving,
    type,
    hasMoved: true,
    status: { ...moving.status, movedThisTurn: true },
  };
  const homes = homeSquares(moving.owner);
  if (moving.type === "king" && move.from === homes[4]) {
    const destinationIndex = homes.indexOf(move.to);
    if (destinationIndex === 6 || destinationIndex === 2) {
      const kingSide = destinationIndex === 6;
      const rookFrom = homes[kingSide ? 7 : 0];
      const rookTo = homes[kingSide ? 5 : 3];
      next[rookTo] = { ...next[rookFrom], hasMoved: true };
      delete next[rookFrom];
    }
  }
  let nextEnPassant: Omit<FourPlayerEnPassant, "expiresOnTurn"> | undefined;
  if (moving.type === "pawn" && fourPlayerDistance(move.from, move.to) === 2) {
    const [fromFile, fromRank] = fourPlayerCoords(move.from);
    const [forwardFile, forwardRank] = forwardDirection(moving.owner);
    const target = fourPlayerSquareAt(fromFile + forwardFile, fromRank + forwardRank);
    if (target) {
      nextEnPassant = {
        target,
        capturedSquare: move.to,
        pawnId: moving.id,
      };
    }
  }
  return { board: next, captured, capturedSquare, enPassant: nextEnPassant };
};

export const fourPlayerLineOfSight = (
  board: Record<Square, FourPlayerPiece>,
  from: Square,
  to: Square,
) =>
  geometryLineStaysOnBoard(FOUR_PLAYER_GEOMETRY, from, to) &&
  fourPlayerLineOfSightSquares(from, to).every((square) => !board[square]);

export const fourPlayerHasAnyLegalMove = (
  board: Record<Square, FourPlayerPiece>,
  seat: Seat,
  config: FourPlayerConfig,
  enPassant?: FourPlayerEnPassant,
  bananas: FourPlayerBanana[] = [],
) => Object.entries(board).some(([square, piece]) =>
  piece.controller === seat &&
  fourPlayerLegalTargets(board, square, config, { enPassant, bananas }).length > 0
);

export const fourPlayerPieceValue = (type: PieceType) =>
  ({ pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100 })[type];

export const fourPlayerCanOrdinarilyCapture = (
  config: FourPlayerConfig,
  actor: Seat,
  target: FourPlayerPiece,
) => canCapture(config, actor, target);

export const fourPlayerPiecesAreAllied = (
  config: FourPlayerConfig,
  first: FourPlayerPiece,
  second: FourPlayerPiece,
) => Boolean(
  first.controller &&
  second.controller &&
  seatsAreAllies(config, first.controller, second.controller),
);
