import type {
  ThreePlayerBoardVariant,
  ThreePlayerCell,
  ThreePlayerSeat,
} from "../threePlayerTypes";
import {
  hexCellAffinity,
  type ThreePlayerCastlingDescriptor,
  type ThreePlayerDirectedTrace,
  type ThreePlayerKnightTrace,
  type ThreePlayerPawnMetadata,
  type ThreePlayerStandardPieceType,
  type ThreePlayerTopology,
  type ThreePlayerTopologyCell,
  type ThreePlayerTraceKind,
} from "../threePlayerTopology";
import {
  buildCellLookups,
  mod,
  placementsFromSource,
  topologyAdjacent,
  topologyDistance,
  topologyPaths,
  unique,
} from "./common";

type Axial = readonly [number, number];

const ROOK_DIRECTIONS: readonly Axial[] = [
  [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1],
];
const BISHOP_DIRECTIONS: readonly Axial[] = [
  [1, 1], [2, -1], [1, -2], [-1, -1], [-2, 1], [-1, 2],
];
const KNIGHT_DIRECTIONS: readonly Axial[] = [
  [1, -3], [2, -3], [3, -2], [3, -1], [2, 1], [1, 2],
  [-1, 3], [-2, 3], [-3, 2], [-3, 1], [-2, -1], [-1, -2],
];

interface HexPawnSpec {
  forward: readonly Axial[];
  captures: readonly Axial[];
  initial: ReadonlySet<number>;
  promotes(q: number, r: number): boolean;
}

interface AxialTopologySpec {
  variant: ThreePlayerBoardVariant;
  stride: number;
  sourceIndexes: readonly number[];
  centerColumn: number;
  centerRow: number;
  pieces: Readonly<Record<number, readonly [ThreePlayerSeat, ThreePlayerStandardPieceType]>>;
  pawns: Readonly<Record<ThreePlayerSeat, HexPawnSpec>>;
  castling?: (
    cellFromSourceIndex: (sourceIndex: number) => ThreePlayerCell | undefined,
  ) => Readonly<Record<ThreePlayerSeat, readonly ThreePlayerCastlingDescriptor[]>>;
}

const cellId = (variant: ThreePlayerBoardVariant, sourceIndex: number) =>
  `${variant}:${sourceIndex}`;

const createAxialTopology = (spec: AxialTopologySpec): ThreePlayerTopology => {
  const sourceCoordinates = new Map<number, Axial>();
  const idAt = new Map<string, ThreePlayerCell>();
  const cellDescriptors: ThreePlayerTopologyCell[] = spec.sourceIndexes.map((sourceIndex, ordinal) => {
    const column = sourceIndex % spec.stride;
    const row = Math.floor(sourceIndex / spec.stride);
    const q = column - spec.centerColumn;
    const r = row - spec.centerRow;
    const id = cellId(spec.variant, sourceIndex);
    const geometricClass = mod(q - r, 3) as 0 | 1 | 2;
    sourceCoordinates.set(sourceIndex, [q, r]);
    idAt.set(`${q},${r}`, id);
    return {
      id,
      ordinal,
      sourceIndex,
      axial: { q, r },
      render: {
        x: q * 1.5,
        y: (r + q / 2) * Math.sqrt(3),
        size: 1,
      },
      geometricClass,
      affinity: hexCellAffinity(geometricClass, q, r),
    };
  });
  const lookups = buildCellLookups(cellDescriptors);
  const at = (q: number, r: number) => idAt.get(`${q},${r}`);
  const coordinates = (cell: ThreePlayerCell) => {
    const descriptor = lookups.cellById.get(cell);
    return descriptor?.axial ? [descriptor.axial.q, descriptor.axial.r] as Axial : undefined;
  };

  const traces = (
    from: ThreePlayerCell,
    kind: ThreePlayerTraceKind,
  ): ThreePlayerDirectedTrace[] => {
    const origin = coordinates(from);
    if (!origin) return [];
    const directions = kind === "rook" ? ROOK_DIRECTIONS : BISHOP_DIRECTIONS;
    return directions.flatMap(([dq, dr], directionIndex) => {
      const ray: ThreePlayerCell[] = [];
      for (let step = 1; ; step += 1) {
        const target = at(origin[0] + dq * step, origin[1] + dr * step);
        if (!target) break;
        ray.push(target);
      }
      return ray.length
        ? [{
          id: `${spec.variant}:${kind}:${from}:${directionIndex}`,
          kind,
          origin: from,
          direction: `${dq},${dr}`,
          cells: ray,
        }]
        : [];
    });
  };
  const rookTraces = (from: ThreePlayerCell) => traces(from, "rook");
  const bishopTraces = (from: ThreePlayerCell) => traces(from, "bishop");
  const kingNeighbors = (from: ThreePlayerCell) => unique([
    ...rookTraces(from).flatMap((trace) => trace.cells.slice(0, 1)),
    ...bishopTraces(from).flatMap((trace) => trace.cells.slice(0, 1)),
  ]);
  const knightTraces = (from: ThreePlayerCell): ThreePlayerKnightTrace[] => {
    const origin = coordinates(from);
    if (!origin) return [];
    return KNIGHT_DIRECTIONS.flatMap(([dq, dr], directionIndex) => {
      const target = at(origin[0] + dq, origin[1] + dr);
      return target
        ? [{
          id: `${spec.variant}:knight:${from}:${directionIndex}`,
          origin: from,
          target,
          path: [target],
        }]
        : [];
    });
  };
  const pawnMetadata = (
    seat: ThreePlayerSeat,
    from: ThreePlayerCell,
  ): ThreePlayerPawnMetadata => {
    const origin = coordinates(from);
    const sourceIndex = lookups.sourceIndex(from);
    if (!origin || sourceIndex === undefined) {
      return { advances: [], captures: [], promotion: false, initialDouble: false };
    }
    const pawn = spec.pawns[seat];
    const promotion = pawn.promotes(origin[0], origin[1]);
    const initialDouble = pawn.initial.has(sourceIndex);
    const advances = pawn.forward.flatMap(([dq, dr], directionIndex) => {
      const one = at(origin[0] + dq, origin[1] + dr);
      if (!one) return [];
      const result = [{
        group: `forward-${directionIndex}`,
        to: one,
        path: [one],
        double: false,
        initialOnly: false,
        initialDouble: false,
        promotes: pawn.promotes(origin[0] + dq, origin[1] + dr),
      }];
      const two = initialDouble ? at(origin[0] + dq * 2, origin[1] + dr * 2) : undefined;
      if (two) {
        result.push({
          group: `forward-${directionIndex}`,
          to: two,
          path: [one, two],
          double: true,
          initialOnly: true,
          initialDouble: true,
          promotes: pawn.promotes(origin[0] + dq * 2, origin[1] + dr * 2),
        });
      }
      return result;
    });
    const captures = pawn.captures.flatMap(([dq, dr], directionIndex) => {
      const to = at(origin[0] + dq, origin[1] + dr);
      return to
        ? [{
          group: `capture-${directionIndex}`,
          to,
          promotes: pawn.promotes(origin[0] + dq, origin[1] + dr),
        }]
        : [];
    });
    return { advances, captures, promotion, initialDouble };
  };
  const initialPlacements = placementsFromSource(
    spec.variant,
    spec.pieces,
    lookups.cellFromSourceIndex,
  );
  const emptyCastling = { white: [], red: [], black: [] } as const;
  const castling = spec.castling?.(lookups.cellFromSourceIndex) ?? emptyCastling;

  return {
    variant: spec.variant,
    cells: cellDescriptors.map((cell) => cell.id),
    cellSet: new Set(cellDescriptors.map((cell) => cell.id)),
    cellDescriptors,
    ...lookups,
    initialPlacements,
    castlingBySeat: castling,
    rookTraces,
    rookRays: rookTraces,
    bishopTraces,
    bishopRays: bishopTraces,
    kingNeighbors,
    kingTargets: kingNeighbors,
    knightTraces,
    knightTargets: (from) => unique(knightTraces(from).map((trace) => trace.target)),
    pawnMetadata,
    pawnRules: pawnMetadata,
    isPromotionCell: (seat, cell) => pawnMetadata(seat, cell).promotion,
    castling: (seat) => castling[seat],
    adjacent: (from, kind) =>
      topologyAdjacent(from, kind, rookTraces, bishopTraces, kingNeighbors, knightTraces),
    paths: (from, to, kind) => topologyPaths(from, to, kind, rookTraces, bishopTraces),
    distance: (from, to) => topologyDistance(from, to, kingNeighbors),
  };
};

const addPieces = (
  target: Record<number, readonly [ThreePlayerSeat, ThreePlayerStandardPieceType]>,
  seat: ThreePlayerSeat,
  entries: Readonly<Record<ThreePlayerStandardPieceType, readonly number[]>>,
) => {
  for (const [type, indexes] of Object.entries(entries) as Array<
    [ThreePlayerStandardPieceType, readonly number[]]
  >) {
    for (const index of indexes) target[index] = [seat, type];
  }
};

const THREE_HEX_PIECES: Record<
  number,
  readonly [ThreePlayerSeat, ThreePlayerStandardPieceType]
> = {};
addPieces(THREE_HEX_PIECES, "white", {
  pawn: [15, 31, 32, 48, 49, 65, 66, 82, 83, 99, 100, 116, 117, 133, 134, 150, 151, 167, 168],
  rook: [16, 152],
  knight: [33, 135],
  bishop: [50, 84, 118],
  queen: [67],
  king: [101],
});
addPieces(THREE_HEX_PIECES, "red", {
  pawn: [239, 240, 241, 242, 243, 244, 245, 246, 247, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264],
  rook: [272, 280],
  knight: [273, 279],
  bishop: [274, 276, 278],
  queen: [277],
  king: [275],
});
addPieces(THREE_HEX_PIECES, "black", {
  pawn: [9, 25, 26, 41, 42, 57, 58, 73, 74, 89, 90, 105, 106, 121, 122, 137, 138, 153, 154],
  rook: [8, 136],
  knight: [24, 120],
  bishop: [40, 72, 104],
  queen: [88],
  king: [56],
});

const descriptor = (
  cellFromSourceIndex: (sourceIndex: number) => ThreePlayerCell | undefined,
  seat: ThreePlayerSeat,
  side: "king" | "queen",
  line: readonly number[],
): ThreePlayerCastlingDescriptor => {
  const cell = (index: number) => {
    const result = cellFromSourceIndex(line[index]);
    if (!result) throw new Error(`Missing ${seat} castling source ${line[index]}`);
    return result;
  };
  if (side === "king") {
    return {
      id: `${seat}-king`,
      seat,
      side,
      kingFrom: cell(5),
      rookFrom: cell(8),
      kingTo: cell(7),
      rookTo: cell(6),
      empty: [cell(6), cell(7)],
      kingPath: [cell(6), cell(7)],
    };
  }
  return {
    id: `${seat}-queen`,
    seat,
    side,
    kingFrom: cell(5),
    rookFrom: cell(0),
    kingTo: cell(2),
    rookTo: cell(3),
    empty: [cell(1), cell(2), cell(3), cell(4)],
    kingPath: [cell(4), cell(3), cell(2)],
  };
};

const threeHexCastling = (
  cellFromSourceIndex: (sourceIndex: number) => ThreePlayerCell | undefined,
) => {
  const lines: Record<ThreePlayerSeat, readonly number[]> = {
    white: [16, 33, 50, 67, 84, 101, 118, 135, 152],
    red: [280, 279, 278, 277, 276, 275, 274, 273, 272],
    black: [136, 120, 104, 88, 72, 56, 40, 24, 8],
  };
  const forSeat = (seat: ThreePlayerSeat) => [
    descriptor(cellFromSourceIndex, seat, "king", lines[seat]),
    descriptor(cellFromSourceIndex, seat, "queen", lines[seat]),
  ];
  return {
    white: forSeat("white"),
    red: forSeat("red"),
    black: forSeat("black"),
  };
};

const regularHexIndexes = () => {
  const indexes: number[] = [];
  for (let r = -8; r <= 8; r += 1) {
    for (let q = -8; q <= 8; q += 1) {
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= 8) {
        indexes.push((r + 8) * 17 + q + 8);
      }
    }
  }
  return indexes;
};

export const createThreeHexagonalTopology = (): ThreePlayerTopology =>
  createAxialTopology({
    variant: "three-hexagonal",
    stride: 17,
    sourceIndexes: regularHexIndexes(),
    centerColumn: 8,
    centerRow: 8,
    pieces: THREE_HEX_PIECES,
    pawns: {
      white: {
        forward: [[-1, 0], [-1, 1]],
        captures: [[-1, -1], [-2, 1]],
        initial: new Set(
          Object.entries(THREE_HEX_PIECES)
            .filter(([, [seat, type]]) => seat === "white" && type === "pawn")
            .map(([index]) => Number(index)),
        ),
        promotes: (q) => q === -8,
      },
      red: {
        forward: [[0, -1], [1, -1]],
        captures: [[2, -1], [1, -2]],
        initial: new Set(
          Object.entries(THREE_HEX_PIECES)
            .filter(([, [seat, type]]) => seat === "red" && type === "pawn")
            .map(([index]) => Number(index)),
        ),
        promotes: (_q, r) => r === -8,
      },
      black: {
        forward: [[1, 0], [0, 1]],
        captures: [[1, 1], [-1, 2]],
        initial: new Set(
          Object.entries(THREE_HEX_PIECES)
            .filter(([, [seat, type]]) => seat === "black" && type === "pawn")
            .map(([index]) => Number(index)),
        ),
        promotes: (q, r) => q + r === 8,
      },
    },
    castling: threeHexCastling,
  });

const TRIAD_INDEXES = [
  14, 15, 31, 32, 33, 34, 48, 49, 50, 51, 52, 53, 65, 66, 67, 68, 69, 70, 71,
  82, 83, 84, 85, 86, 87, 88, 99, 100, 101, 102, 103, 104, 105, 111, 112, 113,
  114, 115, 116, 117, 118, 119, 120, 121, 122, 128, 129, 130, 131, 132, 133,
  134, 135, 136, 137, 138, 139, 146, 147, 148, 149, 150, 151, 152, 153, 154,
  155, 156, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 181,
  182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 198, 199, 200, 201,
  202, 203, 204, 205, 206, 207, 208, 209, 210, 216, 217, 218, 219, 220, 221,
  222, 223, 224, 225, 226, 227, 228, 240, 241, 242, 243, 244, 245, 246, 258,
  259, 260, 261, 262, 263, 264, 276, 277, 278, 279, 280, 281, 294, 295, 296,
  297, 312, 313,
] as const;

const TRIAD_PIECES: Record<
  number,
  readonly [ThreePlayerSeat, ThreePlayerStandardPieceType]
> = {};
addPieces(TRIAD_PIECES, "white", {
  pawn: [227, 228, 243, 244, 245, 259, 260, 261, 262, 276, 277, 278],
  rook: [246, 279, 294],
  knight: [264, 295, 313],
  bishop: [263, 281, 312],
  queen: [280, 296],
  king: [297],
});
addPieces(TRIAD_PIECES, "red", {
  pawn: [48, 49, 50, 66, 67, 68, 69, 85, 86, 87, 104, 105],
  rook: [31, 51, 88],
  knight: [14, 53, 70],
  bishop: [15, 32, 71],
  queen: [33, 52],
  king: [34],
});
addPieces(TRIAD_PIECES, "black", {
  pawn: [113, 130, 131, 147, 148, 165, 166, 182, 183, 200, 201, 218],
  rook: [112, 164, 217],
  knight: [128, 129, 216],
  bishop: [111, 198, 199],
  queen: [146, 181],
  king: [163],
});

const triadInitial = (seat: ThreePlayerSeat) =>
  new Set(
    Object.entries(TRIAD_PIECES)
      .filter(([, [owner, type]]) => owner === seat && type === "pawn")
      .map(([index]) => Number(index)),
  );

export const createTriadTopology = (): ThreePlayerTopology =>
  createAxialTopology({
    variant: "triad",
    stride: 18,
    sourceIndexes: TRIAD_INDEXES,
    centerColumn: 9,
    centerRow: 9,
    pieces: TRIAD_PIECES,
    pawns: {
      white: {
        forward: [[0, -1]],
        captures: [[-1, -1], [1, -2]],
        initial: triadInitial("white"),
        promotes: (q, r) => !TRIAD_INDEXES.includes(
          ((r - 1 + 9) * 18 + q + 9) as typeof TRIAD_INDEXES[number],
        ),
      },
      red: {
        forward: [[-1, 1]],
        captures: [[-2, 1], [-1, 2]],
        initial: triadInitial("red"),
        promotes: (q, r) => !TRIAD_INDEXES.includes(
          ((r + 1 + 9) * 18 + q - 1 + 9) as typeof TRIAD_INDEXES[number],
        ),
      },
      black: {
        forward: [[1, 0]],
        captures: [[1, 1], [2, -1]],
        initial: triadInitial("black"),
        promotes: (q, r) => !TRIAD_INDEXES.includes(
          ((r + 9) * 18 + q + 1 + 9) as typeof TRIAD_INDEXES[number],
        ),
      },
    },
  });
