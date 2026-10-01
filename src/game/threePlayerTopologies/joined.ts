import type {
  ThreePlayerBoardVariant,
  ThreePlayerCell,
  ThreePlayerSeat,
} from "../threePlayerTypes";
import type {
  ThreePlayerCastlingDescriptor,
  ThreePlayerDirectedTrace,
  ThreePlayerKnightTrace,
  ThreePlayerPawnMetadata,
  ThreePlayerTopology,
  ThreePlayerTopologyCell,
  ThreePlayerTraceKind,
} from "../threePlayerTopology";
import {
  buildCellLookups,
  placementsFromSource,
  SEATS,
  squareRender,
  standardArmySource,
  topologyAdjacent,
  topologyContracts,
  topologyDistance,
  topologyPaths,
  unique,
} from "./common";

interface LocalCell {
  half: ThreePlayerSeat;
  file: number;
  rank: number;
}

interface PairContext {
  id: string;
  lower: ThreePlayerSeat;
  upper: ThreePlayerSeat;
}

interface JoinedSpec {
  variant: "three-half";
  render(halfIndex: number, file: number, rank: number): { x: number; y: number };
}

const sourceIndexFor = (half: ThreePlayerSeat, file: number, rank: number) =>
  SEATS.indexOf(half) * 32 + rank * 8 + file;

const joinedCellId = (
  variant: ThreePlayerBoardVariant,
  half: ThreePlayerSeat,
  file: number,
  rank: number,
) => `${variant}:${sourceIndexFor(half, file, rank)}`;

const pairContexts = (): PairContext[] => [
  { id: "white-red", lower: "white", upper: "red" },
  { id: "white-black", lower: "white", upper: "black" },
  { id: "red-black", lower: "red", upper: "black" },
];

const localToPair = (local: LocalCell, context: PairContext) => {
  if (local.half === context.lower) return { x: local.file, y: 3 - local.rank };
  if (local.half === context.upper) return { x: local.file, y: 4 + local.rank };
  return undefined;
};

const pairToLocal = (
  x: number,
  y: number,
  context: PairContext,
): LocalCell | undefined => {
  if (x < 0 || x >= 8 || y < 0 || y >= 8) return undefined;
  return y <= 3
    ? { half: context.lower, file: x, rank: 3 - y }
    : { half: context.upper, file: x, rank: y - 4 };
};

const contextsFor = (half: ThreePlayerSeat) =>
  pairContexts().filter((context) => context.lower === half || context.upper === half);

const createCastling = (
  variant: JoinedSpec["variant"],
): Readonly<Record<ThreePlayerSeat, readonly ThreePlayerCastlingDescriptor[]>> => {
  const cell = (seat: ThreePlayerSeat, file: number) => joinedCellId(variant, seat, file, 3);
  const forSeat = (seat: ThreePlayerSeat): ThreePlayerCastlingDescriptor[] => [
      {
        id: `${seat}-king`,
        seat,
        side: "king",
        kingFrom: cell(seat, 4),
        rookFrom: cell(seat, 7),
        kingTo: cell(seat, 6),
        rookTo: cell(seat, 5),
        empty: [cell(seat, 5), cell(seat, 6)],
        kingPath: [cell(seat, 5), cell(seat, 6)],
      },
      {
        id: `${seat}-queen`,
        seat,
        side: "queen",
        kingFrom: cell(seat, 4),
        rookFrom: cell(seat, 0),
        kingTo: cell(seat, 2),
        rookTo: cell(seat, 3),
        empty: [cell(seat, 1), cell(seat, 2), cell(seat, 3)],
        kingPath: [cell(seat, 3), cell(seat, 2)],
      },
    ];
  return {
    white: forSeat("white"),
    red: forSeat("red"),
    black: forSeat("black"),
  };
};

const createJoinedTopology = (spec: JoinedSpec): ThreePlayerTopology => {
  const cellDescriptors: ThreePlayerTopologyCell[] = [];
  for (let halfIndex = 0; halfIndex < SEATS.length; halfIndex += 1) {
    const half = SEATS[halfIndex];
    for (let rank = 0; rank < 4; rank += 1) {
      for (let file = 0; file < 8; file += 1) {
        const sourceIndex = sourceIndexFor(half, file, rank);
        const render = spec.render(halfIndex, file, rank);
        const geometricClass = ((file + rank) % 2) as 0 | 1;
        cellDescriptors.push({
          id: joinedCellId(spec.variant, half, file, rank),
          ordinal: sourceIndex,
          sourceIndex,
          half,
          local: { file, rank },
          render: squareRender(render.x, render.y),
          geometricClass,
          affinity: geometricClass === 0 ? "light" : "dark",
        });
      }
    }
  }
  const lookups = buildCellLookups(cellDescriptors);
  const local = (cell: ThreePlayerCell): LocalCell | undefined => {
    const descriptor = lookups.cellById.get(cell);
    return descriptor?.half && descriptor.local
      ? {
        half: descriptor.half,
        file: descriptor.local.file,
        rank: descriptor.local.rank,
      }
      : undefined;
  };
  const idOf = (value: LocalCell) =>
    joinedCellId(spec.variant, value.half, value.file, value.rank);
  const traces = (
    from: ThreePlayerCell,
    kind: ThreePlayerTraceKind,
  ): ThreePlayerDirectedTrace[] => {
    const origin = local(from);
    if (!origin) return [];
    const directions = kind === "rook"
      ? [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
      : [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
    return contextsFor(origin.half).flatMap((context) => {
      const pairOrigin = localToPair(origin, context)!;
      return directions.flatMap(([dx, dy], directionIndex) => {
        const ray: ThreePlayerCell[] = [];
        for (let step = 1; step < 8; step += 1) {
          const target = pairToLocal(
            pairOrigin.x + dx * step,
            pairOrigin.y + dy * step,
            context,
          );
          if (!target) break;
          ray.push(idOf(target));
        }
        return ray.length
          ? [{
            id: `${spec.variant}:${kind}:${from}:${context.id}:${directionIndex}`,
            kind,
            origin: from,
            direction: `${dx},${dy}`,
            cells: ray,
            context: context.id,
          }]
          : [];
      });
    });
  };
  const rookTraces = (from: ThreePlayerCell) => traces(from, "rook");
  const bishopTraces = (from: ThreePlayerCell) => traces(from, "bishop");
  const kingNeighbors = (from: ThreePlayerCell) => unique([
    ...rookTraces(from).flatMap((trace) => trace.cells.slice(0, 1)),
    ...bishopTraces(from).flatMap((trace) => trace.cells.slice(0, 1)),
  ]);
  const knightTraces = (from: ThreePlayerCell): ThreePlayerKnightTrace[] => {
    const origin = local(from);
    if (!origin) return [];
    const directions = [
      [1, 2], [2, 1], [2, -1], [1, -2],
      [-1, -2], [-2, -1], [-2, 1], [-1, 2],
    ] as const;
    return contextsFor(origin.half).flatMap((context) => {
      const pairOrigin = localToPair(origin, context)!;
      return directions.flatMap(([dx, dy], directionIndex) => {
        const target = pairToLocal(pairOrigin.x + dx, pairOrigin.y + dy, context);
        if (!target) return [];
        const longFirst = Math.abs(dx) === 2
          ? [[Math.sign(dx), 0], [Math.sign(dx) * 2, 0], [dx, dy]] as const
          : [[0, Math.sign(dy)], [0, Math.sign(dy) * 2], [dx, dy]] as const;
        const orderings = [longFirst];
        return orderings.map((steps, orderIndex) => ({
          id: `${spec.variant}:knight:${from}:${context.id}:${directionIndex}:${orderIndex}`,
          origin: from,
          target: idOf(target),
          path: steps.flatMap(([stepX, stepY]) => {
            const step = pairToLocal(
              pairOrigin.x + stepX,
              pairOrigin.y + stepY,
              context,
            );
            return step ? [idOf(step)] : [];
          }),
          context: context.id,
        }));
      });
    });
  };
  const pawnMetadata = (
    seat: ThreePlayerSeat,
    from: ThreePlayerCell,
  ): ThreePlayerPawnMetadata => {
    const origin = local(from);
    if (!origin) {
      return { advances: [], captures: [], promotion: false, initialDouble: false };
    }
    const contexts = origin.half === seat
      ? contextsFor(seat)
      : pairContexts().filter((context) =>
        (context.lower === seat && context.upper === origin.half) ||
        (context.upper === seat && context.lower === origin.half)
      );
    const initialDouble = origin.half === seat && origin.rank === 2;
    const promotion = origin.half !== seat && origin.rank === 3;
    const advances = contexts.flatMap((context) => {
      const pairOrigin = localToPair(origin, context)!;
      const homeIsLower = context.lower === seat;
      const direction = homeIsLower ? 1 : -1;
      const oneLocal = pairToLocal(pairOrigin.x, pairOrigin.y + direction, context);
      if (!oneLocal) return [];
      const one = idOf(oneLocal);
      const result = [{
        group: context.id,
        to: one,
        path: [one],
        double: false,
        initialOnly: false,
        initialDouble: false,
        promotes: oneLocal.half !== seat && oneLocal.rank === 3,
        context: context.id,
      }];
      const twoLocal = initialDouble
        ? pairToLocal(pairOrigin.x, pairOrigin.y + direction * 2, context)
        : undefined;
      if (twoLocal) {
        const two = idOf(twoLocal);
        result.push({
          group: context.id,
          to: two,
          path: [one, two],
          double: true,
          initialOnly: true,
          initialDouble: true,
          promotes: twoLocal.half !== seat && twoLocal.rank === 3,
          context: context.id,
        });
      }
      return result;
    });
    const captures = contexts.flatMap((context) => {
      const pairOrigin = localToPair(origin, context)!;
      const direction = context.lower === seat ? 1 : -1;
      return [-1, 1].flatMap((fileDelta) => {
        const target = pairToLocal(
          pairOrigin.x + fileDelta,
          pairOrigin.y + direction,
          context,
        );
        return target
          ? [{
            group: context.id,
            to: idOf(target),
            promotes: target.half !== seat && target.rank === 3,
            context: context.id,
          }]
          : [];
      });
    });
    return { advances, captures, promotion, initialDouble };
  };

  const pieces = standardArmySource({ white: 16, red: 48, black: 80 });
  const initialPlacements = placementsFromSource(
    spec.variant,
    pieces,
    lookups.cellFromSourceIndex,
  );
  const castlingBySeat = createCastling(spec.variant);
  const contracts = topologyContracts({
    cells: cellDescriptors.map((cell) => cell.id),
    cellDescriptors,
    initialPlacements,
    rookTraces,
    bishopTraces,
    kingNeighbors,
    pawnMetadata,
    formationTransform: (anchorFrom, anchorTo, cell, contextId) => {
      const from = local(anchorFrom);
      const to = local(anchorTo);
      const member = local(cell);
      if (!from || !to || !member) return undefined;
      if (cell === anchorFrom) return anchorTo;
      const contexts = pairContexts().filter((context) =>
        (contextId === undefined || context.id === contextId) &&
        localToPair(from, context) &&
        localToPair(to, context) &&
        localToPair(member, context)
      );
      if (contextId === undefined && contexts.length !== 1) return undefined;
      const destinations = unique(contexts.flatMap((context) => {
        const fromPair = localToPair(from, context)!;
        const toPair = localToPair(to, context)!;
        const memberPair = localToPair(member, context)!;
        const target = pairToLocal(
          memberPair.x + toPair.x - fromPair.x,
          memberPair.y + toPair.y - fromPair.y,
          context,
        );
        return target ? [idOf(target)] : [];
      }));
      return destinations.length === 1 ? destinations[0] : undefined;
    },
  });

  return {
    variant: spec.variant,
    cells: cellDescriptors.map((cell) => cell.id),
    cellSet: new Set(cellDescriptors.map((cell) => cell.id)),
    cellDescriptors,
    ...lookups,
    initialPlacements,
    castlingBySeat,
    ...contracts,
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
    castling: (seat) => castlingBySeat[seat],
    adjacent: (from, kind) =>
      topologyAdjacent(from, kind, rookTraces, bishopTraces, kingNeighbors, knightTraces),
    paths: (from, to, kind) => topologyPaths(from, to, kind, rookTraces, bishopTraces),
    distance: (from, to) => topologyDistance(from, to, kingNeighbors),
  };
};

export const createThreeHalfTopology = (): ThreePlayerTopology =>
  createJoinedTopology({
    variant: "three-half",
    render: (halfIndex, file, rank) => ({
      x: file,
      y: halfIndex * 5 + rank,
    }),
  });
