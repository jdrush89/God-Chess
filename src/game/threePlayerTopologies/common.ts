import type {
  ThreePlayerCell,
  ThreePlayerSeat,
} from "../threePlayerTypes";
import type {
  ThreePlayerAdjacencyKind,
  ThreePlayerDirectedTrace,
  ThreePlayerInitialPlacement,
  ThreePlayerKnightTrace,
  ThreePlayerPath,
  ThreePlayerStandardPieceType,
  ThreePlayerTopologyCell,
  ThreePlayerTraceKind,
} from "../threePlayerTopology";

export const SEATS: readonly ThreePlayerSeat[] = ["white", "red", "black"];

export const mod = (value: number, divisor: number) =>
  ((value % divisor) + divisor) % divisor;

export const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

export const buildCellLookups = (cells: readonly ThreePlayerTopologyCell[]) => {
  const cellById = new Map(cells.map((cell) => [cell.id, cell]));
  const bySourceIndex = new Map(cells.map((cell) => [cell.sourceIndex, cell.id]));
  return {
    cellById,
    cellFromSourceIndex: (sourceIndex: number) => bySourceIndex.get(sourceIndex),
    sourceIndex: (cell: ThreePlayerCell) => cellById.get(cell)?.sourceIndex,
  };
};

export const tracePaths = (
  traces: readonly ThreePlayerDirectedTrace[],
  to: ThreePlayerCell,
): ThreePlayerPath[] =>
  traces.flatMap((trace) => {
    const index = trace.cells.indexOf(to);
    return index < 0
      ? []
      : [{
        traceId: trace.id,
        context: trace.context,
        cells: trace.cells.slice(0, index + 1),
      }];
  });

export const topologyPaths = (
  from: ThreePlayerCell,
  to: ThreePlayerCell,
  kind: ThreePlayerTraceKind | undefined,
  rookTraces: (cell: ThreePlayerCell) => readonly ThreePlayerDirectedTrace[],
  bishopTraces: (cell: ThreePlayerCell) => readonly ThreePlayerDirectedTrace[],
) => [
  ...(kind === "bishop" ? [] : tracePaths(rookTraces(from), to)),
  ...(kind === "rook" ? [] : tracePaths(bishopTraces(from), to)),
];

export const topologyAdjacent = (
  from: ThreePlayerCell,
  kind: ThreePlayerAdjacencyKind | undefined,
  rookTraces: (cell: ThreePlayerCell) => readonly ThreePlayerDirectedTrace[],
  bishopTraces: (cell: ThreePlayerCell) => readonly ThreePlayerDirectedTrace[],
  kingNeighbors: (cell: ThreePlayerCell) => readonly ThreePlayerCell[],
  knightTraces: (cell: ThreePlayerCell) => readonly ThreePlayerKnightTrace[],
) => {
  if (!kind || kind === "king") return kingNeighbors(from);
  if (kind === "knight") return unique(knightTraces(from).map((trace) => trace.target));
  const traces = kind === "rook" ? rookTraces(from) : bishopTraces(from);
  return unique(traces.flatMap((trace) => trace.cells.slice(0, 1)));
};

export const topologyDistance = (
  from: ThreePlayerCell,
  to: ThreePlayerCell,
  neighbors: (cell: ThreePlayerCell) => readonly ThreePlayerCell[],
) => {
  if (from === to) return 0;
  const queue: Array<[ThreePlayerCell, number]> = [[from, 0]];
  const visited = new Set<ThreePlayerCell>([from]);
  for (let index = 0; index < queue.length; index += 1) {
    const [cell, distance] = queue[index];
    for (const next of neighbors(cell)) {
      if (next === to) return distance + 1;
      if (!visited.has(next)) {
        visited.add(next);
        queue.push([next, distance + 1]);
      }
    }
  }
  return undefined;
};

export const placementsFromSource = (
  variant: string,
  pieces: Readonly<Record<number, readonly [ThreePlayerSeat, ThreePlayerStandardPieceType]>>,
  cellFromSourceIndex: (sourceIndex: number) => ThreePlayerCell | undefined,
  pawnGroup?: (seat: ThreePlayerSeat, sourceIndex: number) => string | undefined,
): ThreePlayerInitialPlacement[] =>
  Object.entries(pieces).map(([rawIndex, [seat, type]], ordinal) => {
    const sourceIndex = Number(rawIndex);
    const cell = cellFromSourceIndex(sourceIndex);
    if (!cell) throw new Error(`${variant} placement references missing source cell ${sourceIndex}`);
    return {
      cell,
      sourceIndex,
      seat,
      type,
      pieceId: `${variant}-${seat}-${type}-${ordinal + 1}`,
      pawnGroup: type === "pawn" ? pawnGroup?.(seat, sourceIndex) : undefined,
    };
  });

export const standardArmySource = (
  starts: Readonly<Record<ThreePlayerSeat, number>>,
): Record<number, readonly [ThreePlayerSeat, ThreePlayerStandardPieceType]> => {
  const result: Record<number, readonly [ThreePlayerSeat, ThreePlayerStandardPieceType]> = {};
  const back: ThreePlayerStandardPieceType[] = [
    "rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook",
  ];
  for (const seat of SEATS) {
    const start = starts[seat];
    for (let file = 0; file < 8; file += 1) {
      result[start + file] = [seat, "pawn"];
      result[start + 8 + file] = [seat, back[file]];
    }
  }
  return result;
};

