import type {
  ThreePlayerCell,
  ThreePlayerSeat,
} from "../threePlayerTypes";
import type {
  ThreePlayerArea,
  ThreePlayerAdjacencyKind,
  ThreePlayerDirectedTrace,
  ThreePlayerInitialPlacement,
  ThreePlayerKnightTrace,
  ThreePlayerPath,
  ThreePlayerPawnMetadata,
  ThreePlayerRenderBounds,
  ThreePlayerRenderCoordinate,
  ThreePlayerStandardPieceType,
  ThreePlayerTopology,
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
        kind: trace.kind,
        origin: trace.origin,
        destination: to,
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

export const polygonRender = (
  x: number,
  y: number,
  points: readonly [number, number][],
  size = 1,
): ThreePlayerRenderCoordinate => ({
  x,
  y,
  size,
  shape: {
    kind: "polygon",
    points: points.map(([dx, dy]) => [x + dx * size, y + dy * size]),
  },
});

export const squareRender = (
  x: number,
  y: number,
  size = 1,
): ThreePlayerRenderCoordinate =>
  polygonRender(x, y, [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ], size);

export const hexRender = (
  x: number,
  y: number,
  size = 1,
): ThreePlayerRenderCoordinate =>
  polygonRender(x, y, Array.from({ length: 6 }, (_, index) => {
    const angle = Math.PI / 3 * index;
    return [Math.cos(angle), Math.sin(angle)] as [number, number];
  }), size);

export const renderBounds = (
  cells: readonly ThreePlayerTopologyCell[],
): ThreePlayerRenderBounds => {
  const points = cells.flatMap((cell) => {
    const shape = cell.render.shape;
    if (shape.kind === "polygon") return shape.points;
    return [
      [shape.cx - shape.outerRadius, shape.cy - shape.outerRadius],
      [shape.cx + shape.outerRadius, shape.cy + shape.outerRadius],
    ] as [number, number][];
  });
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

interface TopologyContractInput {
  cells: readonly ThreePlayerCell[];
  cellDescriptors: readonly ThreePlayerTopologyCell[];
  initialPlacements: readonly ThreePlayerInitialPlacement[];
  rookTraces(cell: ThreePlayerCell): readonly ThreePlayerDirectedTrace[];
  bishopTraces(cell: ThreePlayerCell): readonly ThreePlayerDirectedTrace[];
  kingNeighbors(cell: ThreePlayerCell): readonly ThreePlayerCell[];
  pawnMetadata(seat: ThreePlayerSeat, cell: ThreePlayerCell): ThreePlayerPawnMetadata;
  formationTransform?(
    anchorFrom: ThreePlayerCell,
    anchorTo: ThreePlayerCell,
    cell: ThreePlayerCell,
    context?: string,
  ): ThreePlayerCell | undefined;
}

const compatibleContext = (paths: readonly ThreePlayerPath[]) => {
  const contexts = unique(
    paths.map((path) => path.context).filter((context): context is string => Boolean(context)),
  );
  return contexts.length <= 1 ? contexts[0] : undefined;
};

export const topologyContracts = (
  input: TopologyContractInput,
): Pick<
  ThreePlayerTopology,
  | "renderBounds"
  | "orthogonalNeighbors"
  | "diagonalNeighbors"
  | "trace"
  | "path"
  | "linePaths"
  | "sharesTrace"
  | "crossedCells"
  | "unobstructedPaths"
  | "hasLineOfSight"
  | "areas"
  | "homeCell"
  | "promotionFrontier"
  | "advancement"
  | "classifyAdvance"
  | "frontCells"
  | "formationTransform"
> => {
  let traceCache: Map<string, ThreePlayerDirectedTrace> | undefined;
  const traces = () => {
    if (!traceCache) {
      traceCache = new Map();
      for (const cell of input.cells) {
        for (const trace of [
          ...input.rookTraces(cell),
          ...input.bishopTraces(cell),
        ]) traceCache.set(trace.id, trace);
      }
    }
    return traceCache;
  };
  const trace = (traceId: string) => traces().get(traceId);
  const path = (traceId: string, to?: ThreePlayerCell): ThreePlayerPath | undefined => {
    const selected = trace(traceId);
    if (!selected) return undefined;
    const index = to === undefined ? selected.cells.length - 1 : selected.cells.indexOf(to);
    if (index < 0) return undefined;
    return {
      traceId,
      kind: selected.kind,
      origin: selected.origin,
      destination: selected.cells[index],
      context: selected.context,
      cells: selected.cells.slice(0, index + 1),
    };
  };
  const linePaths = (
    from: ThreePlayerCell,
    to: ThreePlayerCell,
    kind?: ThreePlayerTraceKind,
  ) => topologyPaths(from, to, kind, input.rookTraces, input.bishopTraces);
  const unobstructedPaths = (
    from: ThreePlayerCell,
    to: ThreePlayerCell,
    occupied: ReadonlySet<ThreePlayerCell>,
    kind?: ThreePlayerTraceKind,
  ) => from === to
    ? []
    : linePaths(from, to, kind).filter((candidate) =>
      candidate.cells.slice(0, -1).every((cell) => !occupied.has(cell))
    );
  const orthogonalNeighbors = (from: ThreePlayerCell) =>
    unique(input.rookTraces(from).flatMap((candidate) => candidate.cells.slice(0, 1)));
  const diagonalNeighbors = (from: ThreePlayerCell) =>
    unique(input.bishopTraces(from).flatMap((candidate) => candidate.cells.slice(0, 1)));
  const areas = (
    from: ThreePlayerCell,
    kind: ThreePlayerArea["kind"],
  ): ThreePlayerArea[] => {
    const firstPaths = input.rookTraces(from)
      .filter((candidate) => candidate.cells.length > 0)
      .map((candidate) => ({
        trace: candidate,
        cell: candidate.cells[0],
      }));
    if (kind !== "2x2") {
      return firstPaths.map(({ trace: candidate, cell }, index) => ({
        id: `${kind}:${from}:${candidate.id}:${index}`,
        kind,
        cells: [from, cell],
        traceIds: [candidate.id],
        context: candidate.context,
      }));
    }
    const result: ThreePlayerArea[] = [];
    for (let firstIndex = 0; firstIndex < firstPaths.length; firstIndex += 1) {
      const first = firstPaths[firstIndex];
      for (let secondIndex = firstIndex + 1; secondIndex < firstPaths.length; secondIndex += 1) {
        const second = firstPaths[secondIndex];
        const initialContexts = unique(
          [first.trace.context, second.trace.context]
            .filter((context): context is string => Boolean(context)),
        );
        if (initialContexts.length > 1) continue;
        const requiredContext = initialContexts[0];
        const firstCorners = new Set(orthogonalNeighbors(first.cell));
        for (const corner of orthogonalNeighbors(second.cell)) {
          if (corner === from || !firstCorners.has(corner)) continue;
          const firstEdges = linePaths(first.cell, corner, "rook")
            .filter((candidate) =>
              requiredContext === undefined ||
              candidate.context === requiredContext
            );
          const secondEdges = linePaths(second.cell, corner, "rook")
            .filter((candidate) =>
              requiredContext === undefined ||
              candidate.context === requiredContext
            );
          if (!firstEdges.length || !secondEdges.length) continue;
          const edgePaths = [firstEdges[0], secondEdges[0]];
          const selectedPaths = [
            path(first.trace.id, first.cell)!,
            path(second.trace.id, second.cell)!,
            ...edgePaths,
          ];
          const definedContexts = unique(
            selectedPaths
              .map((candidate) => candidate.context)
              .filter((context): context is string => Boolean(context)),
          );
          if (definedContexts.length > 1) continue;
          const cells = [from, first.cell, second.cell, corner];
          const key = [...cells].sort().join("|");
          if (result.some((area) => [...area.cells].sort().join("|") === key)) continue;
          result.push({
            id: `2x2:${key}`,
            kind,
            cells,
            traceIds: unique(selectedPaths.map((candidate) => candidate.traceId)),
            context: compatibleContext(selectedPaths),
          });
        }
      }
    }
    return result;
  };
  const homeBySeat = new Map<ThreePlayerSeat, ThreePlayerCell>();
  for (const placement of input.initialPlacements) {
    if (placement.type === "king") homeBySeat.set(placement.seat, placement.cell);
  }
  const frontierCache = new Map<ThreePlayerSeat, ThreePlayerCell[]>();
  const promotionFrontier = (seat: ThreePlayerSeat) => {
    let frontier = frontierCache.get(seat);
    if (!frontier) {
      frontier = input.cells.filter((cell) => input.pawnMetadata(seat, cell).promotion);
      frontierCache.set(seat, frontier);
    }
    return frontier;
  };
  const progressCache = new Map<ThreePlayerSeat, Map<ThreePlayerCell, number>>();
  const advancement = (seat: ThreePlayerSeat, cell: ThreePlayerCell) => {
    let progress = progressCache.get(seat);
    if (!progress) {
      const frontier = promotionFrontier(seat);
      const distances = new Map<ThreePlayerCell, number>(
        frontier.map((cell) => [cell, 0]),
      );
      const queue = [...frontier];
      for (let index = 0; index < queue.length; index += 1) {
        const current = queue[index];
        const distance = distances.get(current)!;
        for (const neighbor of input.kingNeighbors(current)) {
          if (!distances.has(neighbor)) {
            distances.set(neighbor, distance + 1);
            queue.push(neighbor);
          }
        }
      }
      const maximum = Math.max(0, ...distances.values());
      progress = new Map(
        [...distances].map(([candidate, distance]) => [
          candidate,
          maximum === 0 ? 1 : (maximum - distance) / maximum,
        ]),
      );
      progressCache.set(seat, progress);
    }
    return progress.get(cell);
  };
  const exactTraceTransform = (
    anchorFrom: ThreePlayerCell,
    anchorTo: ThreePlayerCell,
    cell: ThreePlayerCell,
    context?: string,
  ) => {
    if (cell === anchorFrom) return anchorTo;
    const relations = [
      ...input.rookTraces(anchorFrom),
      ...input.bishopTraces(anchorFrom),
    ].flatMap((candidate) => {
      const index = candidate.cells.indexOf(cell);
      return index < 0 || (context !== undefined && candidate.context !== context)
        ? []
        : [{ candidate, index }];
    });
    const destinations = unique(relations.flatMap(({ candidate, index }) =>
      [
        ...input.rookTraces(anchorTo),
        ...input.bishopTraces(anchorTo),
      ].flatMap((targetTrace) =>
        targetTrace.kind === candidate.kind &&
          targetTrace.direction === candidate.direction &&
          (context === undefined || targetTrace.context === context) &&
          targetTrace.cells[index]
          ? [targetTrace.cells[index]]
          : []
      )
    ));
    return destinations.length === 1 ? destinations[0] : undefined;
  };
  return {
    renderBounds: renderBounds(input.cellDescriptors),
    orthogonalNeighbors,
    diagonalNeighbors,
    trace,
    path,
    linePaths,
    sharesTrace: (from, to, kind) => linePaths(from, to, kind).length > 0,
    crossedCells: (traceId, to) => path(traceId, to)?.cells.slice(0, -1) ?? [],
    unobstructedPaths,
    hasLineOfSight: (from, to, occupied, kind) =>
      from === to || unobstructedPaths(from, to, occupied, kind).length > 0,
    areas,
    homeCell: (seat) => homeBySeat.get(seat),
    promotionFrontier,
    advancement,
    classifyAdvance: (seat, from, to) => {
      const before = advancement(seat, from);
      const after = advancement(seat, to);
      if (before === undefined || after === undefined) return undefined;
      if (after > before) return "forward";
      if (after < before) return "backward";
      return "sideways";
    },
    frontCells: (seat, from) => input.kingNeighbors(from).filter(
      (candidate) => {
        const before = advancement(seat, from);
        const after = advancement(seat, candidate);
        return before !== undefined && after !== undefined && after > before;
      },
    ),
    formationTransform: input.formationTransform ?? exactTraceTransform,
  };
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
