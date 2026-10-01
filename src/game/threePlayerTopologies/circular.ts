import type {
  ThreePlayerCell,
  ThreePlayerSeat,
} from "../threePlayerTypes";
import type {
  ThreePlayerDirectedTrace,
  ThreePlayerKnightTrace,
  ThreePlayerPawnMetadata,
  ThreePlayerStandardPieceType,
  ThreePlayerTopology,
  ThreePlayerTopologyCell,
  ThreePlayerTraceKind,
} from "../threePlayerTopology";
import {
  buildCellLookups,
  mod,
  placementsFromSource,
  SEATS,
  topologyAdjacent,
  topologyContracts,
  topologyDistance,
  topologyPaths,
  unique,
} from "./common";

const SECTORS = 24;
const RINGS = 4;
const cellId = (ring: number, sector: number) => `three-circular:${ring * SECTORS + sector}`;

interface CircularPawnGroup {
  id: string;
  sectors: ReadonlySet<number>;
}

const PAWN_GROUPS: Readonly<Record<ThreePlayerSeat, readonly CircularPawnGroup[]>> = {
  white: [
    { id: "toward-center", sectors: new Set([20, 21, 22, 23, 0, 1, 2, 3]) },
  ],
  red: [
    { id: "toward-center", sectors: new Set([4, 5, 6, 7, 8, 9, 10, 11]) },
  ],
  black: [
    { id: "toward-center", sectors: new Set([12, 13, 14, 15, 16, 17, 18, 19]) },
  ],
};

const BACK_RANK: readonly ThreePlayerStandardPieceType[] = [
  "rook",
  "knight",
  "bishop",
  "queen",
  "king",
  "bishop",
  "knight",
  "rook",
];

const HOME_SECTORS: Readonly<Record<ThreePlayerSeat, readonly number[]>> = {
  white: [20, 21, 22, 23, 0, 1, 2, 3],
  red: [4, 5, 6, 7, 8, 9, 10, 11],
  black: [12, 13, 14, 15, 16, 17, 18, 19],
};

const CIRCULAR_PIECES: Record<
  number,
  readonly [ThreePlayerSeat, ThreePlayerStandardPieceType]
> = {};

for (const seat of SEATS) {
  HOME_SECTORS[seat].forEach((sector, file) => {
    CIRCULAR_PIECES[sector] = [seat, BACK_RANK[file]];
    CIRCULAR_PIECES[SECTORS + sector] = [seat, "pawn"];
  });
}

const groupForSource = (seat: ThreePlayerSeat, sourceIndex: number) => {
  const sector = sourceIndex % SECTORS;
  return PAWN_GROUPS[seat].find((group) => group.sectors.has(sector))?.id;
};

export const createCircularTopology = (): ThreePlayerTopology => {
  const centerRadius = 1.5;
  const cellDescriptors: ThreePlayerTopologyCell[] = [];
  for (let ring = 0; ring < RINGS; ring += 1) {
    for (let sector = 0; sector < SECTORS; sector += 1) {
      const sourceIndex = ring * SECTORS + sector;
      const angle = (sector / SECTORS) * Math.PI * 2;
      const geometricClass = mod(ring + sector, 2) as 0 | 1;
      const startAngle = (sector - 0.5) / SECTORS * Math.PI * 2;
      const endAngle = (sector + 0.5) / SECTORS * Math.PI * 2;
      const innerRadius = centerRadius + RINGS - ring - 1;
      const outerRadius = innerRadius + 1;
      const contentRadius = (innerRadius + outerRadius) / 2;
      cellDescriptors.push({
        id: cellId(ring, sector),
        ordinal: sourceIndex,
        sourceIndex,
        circular: { ring, sector },
        render: {
          x: contentRadius * Math.sin(angle),
          y: contentRadius * Math.cos(angle),
          size: 1,
          shape: {
            kind: "annular-sector",
            cx: 0,
            cy: 0,
            innerRadius,
            outerRadius,
            startAngle,
            endAngle,
          },
        },
        geometricClass,
        affinity: geometricClass === 0 ? "light" : "dark",
      });
    }
  }
  const lookups = buildCellLookups(cellDescriptors);
  const coordinates = (cell: ThreePlayerCell) => lookups.cellById.get(cell)?.circular;
  const at = (ring: number, sector: number) =>
    ring >= 0 && ring < RINGS ? cellId(ring, mod(sector, SECTORS)) : undefined;

  const traces = (
    from: ThreePlayerCell,
    kind: ThreePlayerTraceKind,
  ): ThreePlayerDirectedTrace[] => {
    const origin = coordinates(from);
    if (!origin) return [];
    const directions = kind === "rook"
      ? [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
      : [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
    return directions.flatMap(([dr, ds], directionIndex) => {
      const ray: ThreePlayerCell[] = [];
      const visitedStates = new Set<string>();
      for (let step = 1; ; step += 1) {
        const ring = origin.ring + dr * step;
        const sector = mod(origin.sector + ds * step, SECTORS);
        const state = `${ring}:${sector}:${dr}:${ds}`;
        if (visitedStates.has(state)) break;
        visitedStates.add(state);
        const target = at(ring, sector);
        if (!target || target === from) break;
        ray.push(target);
        if (dr === 0 && ray.length >= SECTORS - 1) break;
      }
      return ray.length
        ? [{
          id: `three-circular:${kind}:${from}:${directionIndex}`,
          kind,
          origin: from,
          direction: `${dr},${ds}`,
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
    const directions = [
      [1, 2], [1, -2], [-1, 2], [-1, -2],
      [2, 1], [2, -1], [-2, 1], [-2, -1],
    ] as const;
    return directions.flatMap(([dr, ds], index) => {
      const target = at(origin.ring + dr, origin.sector + ds);
      return target
        ? [{
          id: `three-circular:knight:${from}:${index}`,
          origin: from,
          target,
          path: [target],
        }]
        : [];
    });
  };

  const initialPawnSources = new Set(
    Object.entries(CIRCULAR_PIECES)
      .filter(([, [, type]]) => type === "pawn")
      .map(([index]) => Number(index)),
  );
  const pawnMetadata = (
    seat: ThreePlayerSeat,
    from: ThreePlayerCell,
  ): ThreePlayerPawnMetadata => {
    const origin = coordinates(from);
    const sourceIndex = lookups.sourceIndex(from);
    if (!origin || sourceIndex === undefined) {
      return { advances: [], captures: [], promotion: false, initialDouble: false };
    }
    const groups = PAWN_GROUPS[seat].filter((group) =>
      group.sectors.has(origin.sector)
    );
    const initialDouble = initialPawnSources.has(sourceIndex) &&
      CIRCULAR_PIECES[sourceIndex]?.[0] === seat;
    const advances = groups.flatMap((group) => {
      const one = at(origin.ring + 1, origin.sector);
      if (!one) return [];
      const result = [{
        group: group.id,
        to: one,
        path: [one],
        double: false,
        initialOnly: false,
        initialDouble: false,
        promotes: origin.ring + 1 === RINGS - 1,
      }];
      if (initialDouble) {
        const two = at(origin.ring + 2, origin.sector);
        if (two) {
          result.push({
            group: group.id,
            to: two,
            path: [one, two],
            double: true,
            initialOnly: true,
            initialDouble: true,
            promotes: origin.ring + 2 === RINGS - 1,
          });
        }
      }
      return result;
    });
    const captures = groups.flatMap((group) =>
      [-1, 1].flatMap((sectorDelta) => {
        const to = at(origin.ring + 1, origin.sector + sectorDelta);
        return to
          ? [{
            group: group.id,
            to,
            promotes: origin.ring + 1 === RINGS - 1,
          }]
          : [];
      })
    );
    return {
      advances,
      captures,
      promotion: groups.length > 0 && origin.ring === RINGS - 1,
      initialDouble,
    };
  };
  const initialPlacements = placementsFromSource(
    "three-circular",
    CIRCULAR_PIECES,
    lookups.cellFromSourceIndex,
    groupForSource,
  );
  const castlingBySeat = { white: [], red: [], black: [] } as const;
  const contracts = topologyContracts({
    cells: cellDescriptors.map((cell) => cell.id),
    cellDescriptors,
    initialPlacements,
    rookTraces,
    bishopTraces,
    kingNeighbors,
    pawnMetadata,
    formationTransform: (anchorFrom, anchorTo, cell) => {
      const from = coordinates(anchorFrom);
      const to = coordinates(anchorTo);
      const member = coordinates(cell);
      if (!from || !to || !member) return undefined;
      if (cell === anchorFrom) return anchorTo;
      let sectorDelta = to.sector - from.sector;
      if (sectorDelta > SECTORS / 2) sectorDelta -= SECTORS;
      if (sectorDelta < -SECTORS / 2) sectorDelta += SECTORS;
      if (Math.abs(sectorDelta) === SECTORS / 2) return undefined;
      return at(
        member.ring + to.ring - from.ring,
        member.sector + sectorDelta,
      );
    },
  });

  return {
    variant: "three-circular",
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
