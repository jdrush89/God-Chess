import { getThreePlayerTopology } from "./threePlayerTopology";
import {
  THREE_PLAYER_SEATS,
  type ThreePlayerBanana,
  type ThreePlayerBoardVariant,
  type ThreePlayerCastlingRights,
  type ThreePlayerCell,
  type ThreePlayerEnPassant,
  type ThreePlayerMove,
  type ThreePlayerPiece,
  type ThreePlayerPromotion,
  type ThreePlayerSeat,
  type ThreePlayerState,
} from "./threePlayerTypes";

const PROMOTIONS: ThreePlayerPromotion[] = [
  "queen",
  "rook",
  "bishop",
  "knight",
];

export interface ThreePlayerAppliedMove {
  board: ThreePlayerState["board"];
  castlingRights: ThreePlayerState["castlingRights"];
  enPassant?: ThreePlayerEnPassant;
  captured?: ThreePlayerPiece;
}

export interface ThreePlayerMoveOptions {
  attacksOnly?: boolean;
  ignoreCheck?: boolean;
  ignoreBlockers?: boolean;
  noCapture?: boolean;
  maxDistance?: number;
  forceType?: ThreePlayerPiece["type"];
  includeAlliedTargets?: boolean;
  pathId?: string;
  bananas?: readonly ThreePlayerBanana[];
}

const topologyFor = (state: Pick<ThreePlayerState, "config">) =>
  getThreePlayerTopology(state.config.boardVariant);

const canTarget = (
  actor: ThreePlayerSeat,
  target: ThreePlayerPiece,
  attacksOnly = false,
  includeAlliedTargets = false,
) => {
  const hostile = target.controller === null || target.controller !== actor ||
    includeAlliedTargets;
  if (!hostile) return false;
  if (target.type === "king") return attacksOnly;
  return !target.status.hardened;
};

const stoppedByBanana = (
  bananas: readonly ThreePlayerBanana[],
  target: ThreePlayerCell,
  actor: ThreePlayerSeat,
) => bananas.some((banana) =>
  banana.cell === target && banana.owner !== actor
);

const uniqueCells = (cells: ThreePlayerCell[]) => [...new Set(cells)];

export const createThreePlayerInitialBoard = (
  variant: ThreePlayerBoardVariant,
): ThreePlayerState["board"] => {
  const board: ThreePlayerState["board"] = {};
  for (const placement of getThreePlayerTopology(variant).initialPlacements) {
    board[placement.cell] = {
      id: placement.pieceId,
      type: placement.type,
      owner: placement.seat,
      controller: placement.seat,
      hasMoved: false,
      status: {},
    };
  }
  return board;
};

export const createThreePlayerInitialCastlingRights = (
  variant: ThreePlayerBoardVariant,
): ThreePlayerState["castlingRights"] => {
  const topology = getThreePlayerTopology(variant);
  return Object.fromEntries(THREE_PLAYER_SEATS.map((seat) => {
    const descriptors = topology.castling(seat);
    return [
      seat,
      {
        king: descriptors.some((descriptor) => descriptor.side === "king"),
        queen: descriptors.some((descriptor) => descriptor.side === "queen"),
      },
    ];
  })) as ThreePlayerState["castlingRights"];
};

const rayTargets = (
  state: ThreePlayerState,
  from: ThreePlayerCell,
  actor: ThreePlayerSeat,
  kind: "rook" | "bishop",
  options: ThreePlayerMoveOptions,
) => {
  const topology = topologyFor(state);
  const rays = kind === "rook"
    ? topology.rookRays(from)
    : topology.bishopRays(from);
  const targets: ThreePlayerCell[] = [];
  for (const ray of rays) {
    if (options.pathId && ray.id !== options.pathId) continue;
    for (const [index, target] of ray.cells.entries()) {
      if (index >= (options.maxDistance ?? Number.POSITIVE_INFINITY)) break;
      if (target === from) break;
      const occupying = state.board[target];
      const banana = stoppedByBanana(
        options.bananas ?? state.bananas ?? [],
        target,
        actor,
      );
      if (!occupying) {
        targets.push(target);
        if (banana) break;
        continue;
      }
      if (
        !options.noCapture &&
        canTarget(
          actor,
          occupying,
          Boolean(options.attacksOnly),
          options.includeAlliedTargets,
        )
      ) targets.push(target);
      if (!options.ignoreBlockers) break;
    }
  }
  return uniqueCells(targets);
};

const pawnTargets = (
  state: ThreePlayerState,
  from: ThreePlayerCell,
  piece: ThreePlayerPiece,
  actor: ThreePlayerSeat,
  options: ThreePlayerMoveOptions,
) => {
  const rules = topologyFor(state).pawnRules(piece.owner, from);
  if (options.attacksOnly) return rules.captures.map((capture) => capture.to);
  const targets: ThreePlayerCell[] = [];
  for (const capture of rules.captures) {
    const occupying = state.board[capture.to];
    const enPassantPawn = state.enPassant?.target === capture.to &&
        state.enPassant.expiresOnTurn === state.turn
      ? state.board[state.enPassant.capturedCell]
      : undefined;
    if (
      occupying && canTarget(
        actor,
        occupying,
        false,
        options.includeAlliedTargets,
      ) ||
      enPassantPawn &&
        enPassantPawn.type === "pawn" &&
        canTarget(actor, enPassantPawn, false, options.includeAlliedTargets)
    ) targets.push(capture.to);
  }
  for (const advance of rules.advances) {
    if (advance.initialOnly && piece.hasMoved) continue;
    if (!options.ignoreBlockers && advance.path.some((cell) => state.board[cell])) {
      continue;
    }
    if (state.board[advance.to]) continue;
    if (
      advance.path.some((cell) =>
        stoppedByBanana(options.bananas ?? state.bananas ?? [], cell, actor)
      )
    ) continue;
    targets.push(advance.to);
  }
  return uniqueCells(targets);
};

const castlingDescriptor = (
  state: ThreePlayerState,
  actor: ThreePlayerSeat,
  from: ThreePlayerCell,
  to: ThreePlayerCell,
) => topologyFor(state).castling(actor).find(
  (descriptor) => descriptor.kingFrom === from && descriptor.kingTo === to,
);

const canCastle = (
  state: ThreePlayerState,
  actor: ThreePlayerSeat,
  side: keyof ThreePlayerCastlingRights,
) => {
  if (!state.castlingRights[actor][side]) return false;
  const topology = topologyFor(state);
  return topology.castling(actor).some((descriptor) => {
    if (descriptor.side !== side) return false;
    const king = state.board[descriptor.kingFrom];
    const rook = state.board[descriptor.rookFrom];
    if (
      king?.type !== "king" ||
      king.owner !== actor ||
      king.controller !== actor ||
      king.hasMoved ||
      rook?.type !== "rook" ||
      rook.owner !== actor ||
      rook.controller !== actor ||
      rook.hasMoved ||
      descriptor.empty.some((cell) => state.board[cell])
    ) return false;
    if (threePlayerIsSquareAttacked(state, descriptor.kingFrom, actor)) {
      return false;
    }
    return descriptor.kingPath.every((cell) => {
      const board = structuredClone(state.board);
      delete board[descriptor.kingFrom];
      board[cell] = { ...king, hasMoved: true };
      return !threePlayerIsSquareAttacked(
        { ...state, board },
        cell,
        actor,
      );
    });
  });
};

export const threePlayerPseudoTargets = (
  state: ThreePlayerState,
  from: ThreePlayerCell,
  options: ThreePlayerMoveOptions = {},
) => {
  const piece = state.board[from];
  const actor = piece?.controller;
  if (!piece || !actor) return [];
  if (
    !options.attacksOnly &&
    (piece.status.hardened || piece.status.frozen || piece.status.gazing)
  ) return [];
  const topology = topologyFor(state);
  const type = piece.status.polymorphed
    ? "pawn"
    : options.forceType ?? piece.type;
  let targets: ThreePlayerCell[];
  if (type === "pawn") {
    targets = pawnTargets(
      state,
      from,
      piece,
      actor,
      options,
    );
  } else if (type === "knight") {
    targets = [...topology.knightTargets(from)];
  } else if (type === "bishop") {
    targets = rayTargets(
      state,
      from,
      actor,
      "bishop",
      options,
    );
  } else if (type === "rook") {
    targets = rayTargets(
      state,
      from,
      actor,
      "rook",
      options,
    );
  } else if (type === "queen") {
    targets = uniqueCells([
      ...rayTargets(
        state,
        from,
        actor,
        "rook",
        options,
      ),
      ...rayTargets(
        state,
        from,
        actor,
        "bishop",
        options,
      ),
    ]);
  } else {
    targets = [...topology.kingTargets(from)].filter((target) =>
      (topology.distance(from, target) ?? Number.POSITIVE_INFINITY) <=
        (options.maxDistance ?? 1)
    );
    if (!options.attacksOnly && !options.forceType && piece.owner === actor) {
      if (canCastle(state, actor, "king")) {
        const descriptor = topology.castling(actor).find(
          (candidate) => candidate.side === "king",
        );
        if (descriptor) targets.push(descriptor.kingTo);
      }
      if (canCastle(state, actor, "queen")) {
        const descriptor = topology.castling(actor).find(
          (candidate) => candidate.side === "queen",
        );
        if (descriptor) targets.push(descriptor.kingTo);
      }
    }
  }
  if (piece.status.poisoned && !options.attacksOnly) {
    targets = targets.filter((target) =>
      (topology.distance(from, target) ?? Number.POSITIVE_INFINITY) <= 3
    );
  }
  return uniqueCells(targets).filter((target) => {
    const occupying = state.board[target];
    return !occupying ||
      (
        !options.noCapture &&
        canTarget(
          actor,
          occupying,
          Boolean(options.attacksOnly),
          options.includeAlliedTargets,
        )
      );
  });
};

export const threePlayerKingCell = (
  state: Pick<ThreePlayerState, "board">,
  seat: ThreePlayerSeat,
) => Object.entries(state.board).find(([, piece]) =>
  piece.type === "king" &&
  piece.owner === seat &&
  piece.controller === seat
)?.[0];

export const threePlayerIsSquareAttackedBy = (
  state: ThreePlayerState,
  cell: ThreePlayerCell,
  attacker: ThreePlayerSeat,
) => Object.entries(state.board).some(([from, piece]) =>
  piece.controller === attacker &&
  !piece.status.frozen &&
  threePlayerOrdinaryAttackCells(state, from).includes(cell)
);

export function threePlayerOrdinaryAttackCells(
  state: ThreePlayerState,
  from: ThreePlayerCell,
) {
  return threePlayerPseudoTargets(state, from, {
    attacksOnly: true,
    ignoreCheck: true,
  });
}

export function threePlayerOrdinaryAttackedCells(
  state: ThreePlayerState,
  from: ThreePlayerCell,
) {
  return threePlayerOrdinaryAttackCells(state, from)
    .filter((cell) => Boolean(state.board[cell]));
}

export const threePlayerIsSquareAttacked = (
  state: ThreePlayerState,
  cell: ThreePlayerCell,
  defender: ThreePlayerSeat,
) => THREE_PLAYER_SEATS.some((attacker) =>
  attacker !== defender &&
  !state.players[attacker].eliminated &&
  threePlayerIsSquareAttackedBy(state, cell, attacker)
);

export const threePlayerCheckingSeats = (
  state: ThreePlayerState,
  defender: ThreePlayerSeat,
) => {
  const king = threePlayerKingCell(state, defender);
  if (!king) return [];
  return THREE_PLAYER_SEATS.filter((attacker) =>
    attacker !== defender &&
    !state.players[attacker].eliminated &&
    threePlayerIsSquareAttackedBy(state, king, attacker)
  );
};

export const threePlayerIsInCheck = (
  state: ThreePlayerState,
  seat: ThreePlayerSeat,
) => {
  const king = threePlayerKingCell(state, seat);
  return king
    ? threePlayerIsSquareAttacked(state, king, seat)
    : true;
};

const disableRookRight = (
  rights: ThreePlayerState["castlingRights"],
  variant: ThreePlayerBoardVariant,
  owner: ThreePlayerSeat,
  cell: ThreePlayerCell,
) => {
  for (const descriptor of getThreePlayerTopology(variant).castling(owner)) {
    if (descriptor.rookFrom === cell) rights[owner][descriptor.side] = false;
  }
};

export const threePlayerApplyMove = (
  state: ThreePlayerState,
  move: ThreePlayerMove,
): ThreePlayerAppliedMove => {
  const moving = state.board[move.from];
  if (!moving) {
    return {
      board: structuredClone(state.board),
      castlingRights: structuredClone(state.castlingRights),
    };
  }
  if (state.board[move.to]?.type === "king") {
    throw new Error("Ordinary moves cannot capture a King.");
  }
  const board = structuredClone(state.board);
  const castlingRights = structuredClone(state.castlingRights);
  const descriptor = moving.type === "king" && moving.controller
    ? castlingDescriptor(state, moving.controller, move.from, move.to)
    : undefined;
  let capturedCell = move.to;
  let captured = board[move.to];
  if (
    moving.type === "pawn" &&
    !captured &&
    state.enPassant?.target === move.to &&
    state.enPassant.expiresOnTurn === state.turn
  ) {
    capturedCell = state.enPassant.capturedCell;
    captured = board[capturedCell];
  }
  delete board[move.from];
  if (captured) delete board[capturedCell];

  const movedPiece = {
    ...moving,
    type: moving.type === "pawn" &&
        topologyFor(state).isPromotionCell(moving.owner, move.to)
      ? move.promotion ?? "queen"
      : moving.type,
    hasMoved: true,
    status: { ...moving.status, movedThisTurn: true },
  };
  board[move.to] = movedPiece;

  if (moving.type === "king") {
    castlingRights[moving.owner] = { king: false, queen: false };
  }
  if (moving.type === "rook") {
    disableRookRight(
      castlingRights,
      state.config.boardVariant,
      moving.owner,
      move.from,
    );
  }
  if (captured?.type === "rook") {
    disableRookRight(
      castlingRights,
      state.config.boardVariant,
      captured.owner,
      capturedCell,
    );
  }
  if (descriptor) {
    const rook = board[descriptor.rookFrom];
    if (rook) {
      delete board[descriptor.rookFrom];
      board[descriptor.rookTo] = { ...rook, hasMoved: true };
    }
  }

  let enPassant: ThreePlayerEnPassant | undefined;
  if (moving.type === "pawn") {
    const advance = topologyFor(state)
      .pawnRules(moving.owner, move.from)
      .advances.find((candidate) =>
        candidate.to === move.to && candidate.double
      );
    if (advance && advance.path.length > 1) {
      enPassant = {
        target: advance.path[advance.path.length - 2],
        capturedCell: move.to,
        pawnId: moving.id,
        expiresOnTurn: state.turn + 1,
      };
    }
  }
  return {
    board,
    castlingRights,
    enPassant,
    ...(captured ? { captured } : {}),
  };
};

export const threePlayerLegalMoves = (
  state: ThreePlayerState,
  seat: ThreePlayerSeat = state.activeSeat,
): ThreePlayerMove[] => {
  if (state.players[seat].eliminated) return [];
  const topology = topologyFor(state);
  const moves: ThreePlayerMove[] = [];
  for (const from of topology.cells) {
    const piece = state.board[from];
    if (piece?.controller !== seat) continue;
    for (const to of threePlayerPseudoTargets(state, from)) {
      const promotion = piece.type === "pawn" &&
        topology.isPromotionCell(piece.owner, to);
      const candidates: ThreePlayerMove[] = promotion
        ? PROMOTIONS.map((choice) => ({ from, to, promotion: choice }))
        : [{ from, to }];
      for (const move of candidates) {
        const applied = threePlayerApplyMove(state, move);
        const next: ThreePlayerState = {
          ...state,
          board: applied.board,
          castlingRights: applied.castlingRights,
          enPassant: applied.enPassant,
        };
        if (!threePlayerIsInCheck(next, seat)) moves.push(move);
      }
    }
  }
  return moves;
};

export const threePlayerLegalTargets = (
  state: ThreePlayerState,
  from: ThreePlayerCell,
  options: ThreePlayerMoveOptions = {},
) => uniqueCells(
  options.ignoreCheck
    ? threePlayerPseudoTargets(state, from, options)
    : threePlayerPseudoTargets(state, from, options).filter((to) => {
      const moving = state.board[from];
      if (!moving?.controller || state.board[to]?.type === "king") return false;
      const applied = threePlayerApplyMove(state, { from, to });
      return !threePlayerIsInCheck({
        ...state,
        board: applied.board,
        castlingRights: applied.castlingRights,
        enPassant: applied.enPassant,
      }, moving.controller);
    }),
);

export const threePlayerPathCells = (
  state: Pick<ThreePlayerState, "config">,
  from: ThreePlayerCell,
  to: ThreePlayerCell,
  pathId?: string,
) => {
  const topology = topologyFor(state);
  const path = pathId
    ? topology.path(pathId, to)
    : topology.paths(from, to)[0];
  if (!path) return [];
  const cells = [...path.cells];
  if (cells.at(-1) === to) cells.pop();
  return cells;
};

export const threePlayerLineOfSight = (
  state: ThreePlayerState,
  from: ThreePlayerCell,
  to: ThreePlayerCell,
  pathId?: string,
) => {
  if (from === to) return true;
  const topology = topologyFor(state);
  const paths = pathId
    ? [topology.path(pathId, to)].filter(Boolean)
    : topology.linePaths(from, to);
  return paths.some((path) =>
    path && path.cells.slice(0, -1).every((cell) => !state.board[cell])
  );
};

export const threePlayerPieceValue = (type: ThreePlayerPiece["type"]) =>
  ({ pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100 })[type];

export const threePlayerCanOrdinarilyCapture = (
  actor: ThreePlayerSeat,
  target: ThreePlayerPiece,
) => canTarget(actor, target);

export const threePlayerPiecesAreAllied = (
  first: ThreePlayerPiece,
  second: ThreePlayerPiece,
) => Boolean(
  first.controller &&
  second.controller &&
  first.controller === second.controller
);

export const threePlayerSimulateMove = (
  state: ThreePlayerState,
  move: ThreePlayerMove,
) => {
  const applied = threePlayerApplyMove(state, move);
  return {
    ...state,
    board: applied.board,
    castlingRights: applied.castlingRights,
    enPassant: applied.enPassant,
  };
};
