import type {
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

interface YaltaCell {
  half: ThreePlayerSeat;
  file: number;
  rank: number;
}

const sourceIndexFor = (half: ThreePlayerSeat, file: number, rank: number) =>
  SEATS.indexOf(half) * 32 + rank * 8 + file;

const cellId = (half: ThreePlayerSeat, file: number, rank: number) =>
  `three-player:${sourceIndexFor(half, file, rank)}`;

const nextSeat = (seat: ThreePlayerSeat, offset: -1 | 1) => {
  const index = SEATS.indexOf(seat);
  return SEATS[(index + offset + SEATS.length) % SEATS.length];
};

const inwardRookTarget = (
  half: ThreePlayerSeat,
  file: number,
): YaltaCell => ({
  half: nextSeat(half, file < 4 ? -1 : 1),
  file: 7 - file,
  rank: 0,
});

const traceContext = (origin: ThreePlayerSeat, cells: readonly YaltaCell[]) => {
  const halves = unique([origin, ...cells.map((cell) => cell.half)]);
  return halves.join("-");
};

const createCastling = (): Readonly<
  Record<ThreePlayerSeat, readonly ThreePlayerCastlingDescriptor[]>
> => {
  const home = (seat: ThreePlayerSeat, file: number) => cellId(seat, file, 3);
  const forSeat = (seat: ThreePlayerSeat): ThreePlayerCastlingDescriptor[] => [
    {
      id: `${seat}-king`,
      seat,
      side: "king",
      kingFrom: home(seat, 4),
      rookFrom: home(seat, 7),
      kingTo: home(seat, 6),
      rookTo: home(seat, 5),
      empty: [home(seat, 5), home(seat, 6)],
      kingPath: [home(seat, 5), home(seat, 6)],
    },
    {
      id: `${seat}-queen`,
      seat,
      side: "queen",
      kingFrom: home(seat, 4),
      rookFrom: home(seat, 0),
      kingTo: home(seat, 2),
      rookTo: home(seat, 3),
      empty: [home(seat, 1), home(seat, 2), home(seat, 3)],
      kingPath: [home(seat, 3), home(seat, 2)],
    },
  ];
  return {
    white: forSeat("white"),
    red: forSeat("red"),
    black: forSeat("black"),
  };
};

export const createYaltaTopology = (): ThreePlayerTopology => {
  const cellDescriptors: ThreePlayerTopologyCell[] = [];
  for (let halfIndex = 0; halfIndex < SEATS.length; halfIndex += 1) {
    const half = SEATS[halfIndex];
    for (let rank = 0; rank < 4; rank += 1) {
      for (let file = 0; file < 8; file += 1) {
        const sourceIndex = sourceIndexFor(half, file, rank);
        const angle = halfIndex * Math.PI * 2 / 3;
        const lateral = file - 3.5;
        const radial = rank + 1;
        const geometricClass = ((file + rank) % 2) as 0 | 1;
        cellDescriptors.push({
          id: cellId(half, file, rank),
          ordinal: sourceIndex,
          sourceIndex,
          half,
          local: { file, rank },
          render: squareRender(
            lateral * Math.cos(angle) - radial * Math.sin(angle),
            lateral * Math.sin(angle) + radial * Math.cos(angle),
          ),
          geometricClass,
          affinity: geometricClass === 0 ? "light" : "dark",
        });
      }
    }
  }
  const lookups = buildCellLookups(cellDescriptors);
  const local = (cell: ThreePlayerCell): YaltaCell | undefined => {
    const descriptor = lookups.cellById.get(cell);
    return descriptor?.half && descriptor.local
      ? {
        half: descriptor.half,
        file: descriptor.local.file,
        rank: descriptor.local.rank,
      }
      : undefined;
  };
  const ids = (cells: readonly YaltaCell[]) =>
    cells.map((cell) => cellId(cell.half, cell.file, cell.rank));

  const rookTraces = (from: ThreePlayerCell): ThreePlayerDirectedTrace[] => {
    const origin = local(from);
    if (!origin) return [];
    const traces: ThreePlayerDirectedTrace[] = [];
    for (const fileStep of [-1, 1] as const) {
      const ray: YaltaCell[] = [];
      for (
        let file = origin.file + fileStep;
        file >= 0 && file < 8;
        file += fileStep
      ) {
        ray.push({ ...origin, file });
      }
      if (ray.length) {
        traces.push({
          id: `three-player:rook:${from}:file:${fileStep}`,
          kind: "rook",
          origin: from,
          direction: `file:${fileStep}`,
          cells: ids(ray),
          context: origin.half,
        });
      }
    }
    const outward: YaltaCell[] = [];
    for (let rank = origin.rank + 1; rank < 4; rank += 1) {
      outward.push({ ...origin, rank });
    }
    if (outward.length) {
      traces.push({
        id: `three-player:rook:${from}:rank:1`,
        kind: "rook",
        origin: from,
        direction: "rank:1",
        cells: ids(outward),
        context: origin.half,
      });
    }
    const inward: YaltaCell[] = [];
    for (let rank = origin.rank - 1; rank >= 0; rank -= 1) {
      inward.push({ ...origin, rank });
    }
    const across = inwardRookTarget(origin.half, origin.file);
    inward.push(across);
    for (let rank = 1; rank < 4; rank += 1) {
      inward.push({ ...across, rank });
    }
    traces.push({
      id: `three-player:rook:${from}:rank:-1`,
      kind: "rook",
      origin: from,
      direction: "rank:-1",
      cells: ids(inward),
      context: traceContext(origin.half, inward),
    });
    return traces;
  };

  const bishopCrossings = (
    boundary: YaltaCell,
    fileStep: -1 | 1,
  ) => {
    const across = inwardRookTarget(boundary.half, boundary.file);
    const normal: YaltaCell = {
      ...across,
      file: across.file - fileStep,
    };
    const targets: YaltaCell[] = normal.file >= 0 && normal.file < 8
      ? [normal]
      : [];
    if (
      boundary.file === 3 && fileStep === 1 ||
      boundary.file === 4 && fileStep === -1
    ) {
      targets.push(
        inwardRookTarget(
          boundary.half,
          boundary.file === 3 ? 4 : 3,
        ),
      );
    }
    return targets;
  };

  const bishopTraces = (from: ThreePlayerCell): ThreePlayerDirectedTrace[] => {
    const origin = local(from);
    if (!origin) return [];
    const traces: ThreePlayerDirectedTrace[] = [];
    for (const rankStep of [-1, 1] as const) {
      for (const fileStep of [-1, 1] as const) {
        const prefix: YaltaCell[] = [];
        let file = origin.file + fileStep;
        let rank = origin.rank + rankStep;
        while (file >= 0 && file < 8 && rank >= 0 && rank < 4) {
          prefix.push({ half: origin.half, file, rank });
          file += fileStep;
          rank += rankStep;
        }
        if (
          rankStep === -1 &&
          rank < 0 &&
          file >= -1 &&
          file <= 8
        ) {
          const boundary = prefix.at(-1) ?? origin;
          if (boundary.rank === 0) {
            const continuations = bishopCrossings(boundary, fileStep);
            continuations.forEach((crossing, branch) => {
              const ray = [...prefix, crossing];
              const crossingFileStep = -fileStep;
              for (
                let nextFile = crossing.file + crossingFileStep, nextRank = 1;
                nextFile >= 0 && nextFile < 8 && nextRank < 4;
                nextFile += crossingFileStep, nextRank += 1
              ) {
                ray.push({
                  half: crossing.half,
                  file: nextFile,
                  rank: nextRank,
                });
              }
              traces.push({
                id: `three-player:bishop:${from}:${fileStep}:${rankStep}:${branch}`,
                kind: "bishop",
                origin: from,
                direction: `bishop:${fileStep}:${rankStep}:${branch}`,
                cells: ids(ray),
                context: traceContext(origin.half, ray),
              });
            });
            continue;
          }
        }
        if (prefix.length) {
          traces.push({
            id: `three-player:bishop:${from}:${fileStep}:${rankStep}:0`,
            kind: "bishop",
            origin: from,
            direction: `bishop:${fileStep}:${rankStep}:0`,
            cells: ids(prefix),
            context: origin.half,
          });
        }
      }
    }
    return traces;
  };

  const kingNeighbors = (from: ThreePlayerCell) => unique([
    ...rookTraces(from).flatMap((trace) => trace.cells.slice(0, 1)),
    ...bishopTraces(from).flatMap((trace) => trace.cells.slice(0, 1)),
  ]);

  const perpendicularRays = (
    from: ThreePlayerCell,
    back: ThreePlayerCell,
    forward?: ThreePlayerCell,
  ) => rookTraces(from).filter((trace) =>
    trace.cells[0] !== back && trace.cells[0] !== forward
  );

  const knightTraces = (from: ThreePlayerCell): ThreePlayerKnightTrace[] => {
    const traces: ThreePlayerKnightTrace[] = [];
    rookTraces(from).forEach((first, firstIndex) => {
      const one = first.cells[0];
      if (!one) return;
      const forwardFromOne = first.cells[1];
      perpendicularRays(one, from, forwardFromOne)
        .forEach((turn, turnIndex) => {
          const target = turn.cells[1];
          if (!target || target === from) return;
          const path = [one, turn.cells[0], target];
          traces.push({
            id: `three-player:knight:${from}:short:${firstIndex}:${turnIndex}`,
            origin: from,
            target,
            path,
            context: unique(
              [from, ...path].map((cell) => local(cell)!.half),
            ).join("-"),
          });
        });
      const two = first.cells[1];
      if (!two) return;
      const forwardFromTwo = first.cells[2];
      perpendicularRays(two, one, forwardFromTwo)
        .forEach((turn, turnIndex) => {
          const target = turn.cells[0];
          if (!target || target === from) return;
          const path = [one, two, target];
          traces.push({
            id: `three-player:knight:${from}:long:${firstIndex}:${turnIndex}`,
            origin: from,
            target,
            path,
            context: unique(
              [from, ...path].map((cell) => local(cell)!.half),
            ).join("-"),
          });
        });
    });
    return traces;
  };

  const pawnMetadata = (
    seat: ThreePlayerSeat,
    from: ThreePlayerCell,
  ): ThreePlayerPawnMetadata => {
    const origin = local(from);
    if (!origin) {
      return {
        advances: [],
        captures: [],
        promotion: false,
        initialDouble: false,
      };
    }
    const movingInward = origin.half === seat;
    const rankDirection = movingInward ? -1 : 1;
    const forward = rookTraces(from).find(
      (trace) => trace.direction === `rank:${rankDirection}`,
    );
    const initialDouble = movingInward && origin.rank === 2;
    const advances = forward?.cells.slice(0, initialDouble ? 2 : 1)
      .map((to, index) => {
        const target = local(to)!;
        const double = index === 1;
        return {
          group: movingInward ? "toward-center" : `toward-${origin.half}-edge`,
          to,
          path: forward.cells.slice(0, index + 1),
          double,
          initialOnly: double,
          initialDouble: double,
          promotes: target.half !== seat && target.rank === 3,
          context: traceContext(origin.half, [target]),
        };
      }) ?? [];
    const captures = unique(
      bishopTraces(from)
        .filter(
          (trace) =>
            trace.direction.split(":")[2] === String(rankDirection),
        )
        .map((trace) => trace.cells[0])
        .filter((cell): cell is ThreePlayerCell => Boolean(cell)),
    ).map((to) => {
      const target = local(to)!;
      return {
        group: movingInward ? "toward-center" : `toward-${origin.half}-edge`,
        to,
        promotes: target.half !== seat && target.rank === 3,
        context: traceContext(origin.half, [target]),
      };
    });
    return {
      advances,
      captures,
      promotion: origin.half !== seat && origin.rank === 3,
      initialDouble,
    };
  };

  const initialPlacements = placementsFromSource(
    "three-player",
    standardArmySource({ white: 16, red: 48, black: 80 }),
    lookups.cellFromSourceIndex,
  );
  const castlingBySeat = createCastling();
  const contracts = topologyContracts({
    cells: cellDescriptors.map((cell) => cell.id),
    cellDescriptors,
    initialPlacements,
    rookTraces,
    bishopTraces,
    kingNeighbors,
    pawnMetadata,
  });

  return {
    variant: "three-player",
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
    knightTargets: (from) =>
      unique(knightTraces(from).map((trace) => trace.target)),
    pawnMetadata,
    pawnRules: pawnMetadata,
    isPromotionCell: (seat, cell) => pawnMetadata(seat, cell).promotion,
    castling: (seat) => castlingBySeat[seat],
    adjacent: (from, kind) =>
      topologyAdjacent(
        from,
        kind,
        rookTraces,
        bishopTraces,
        kingNeighbors,
        knightTraces,
      ),
    paths: (from, to, kind) =>
      topologyPaths(from, to, kind, rookTraces, bishopTraces),
    distance: (from, to) => topologyDistance(from, to, kingNeighbors),
  };
};
