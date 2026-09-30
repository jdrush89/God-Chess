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
  topologyAdjacent,
  topologyDistance,
  topologyPaths,
  unique,
} from "./common";

const SECTORS = 24;
const RINGS = 4;
const cellId = (ring: number, sector: number) => `three-circular:${ring * SECTORS + sector}`;

interface CircularPawnGroup {
  id: string;
  direction: -1 | 1;
  sectors: ReadonlySet<number>;
  promotionSector: number;
}

const PAWN_GROUPS: Readonly<Record<ThreePlayerSeat, readonly CircularPawnGroup[]>> = {
  white: [
    { id: "clockwise", direction: 1, sectors: new Set([1, 2, 3, 4, 5, 6]), promotionSector: 6 },
    { id: "counterclockwise", direction: -1, sectors: new Set([17, 18, 19, 20, 21, 22]), promotionSector: 17 },
  ],
  red: [
    { id: "counterclockwise", direction: -1, sectors: new Set([1, 2, 3, 4, 5, 6]), promotionSector: 1 },
    { id: "clockwise", direction: 1, sectors: new Set([9, 10, 11, 12, 13, 14]), promotionSector: 14 },
  ],
  black: [
    { id: "counterclockwise", direction: -1, sectors: new Set([9, 10, 11, 12, 13, 14]), promotionSector: 9 },
    { id: "clockwise", direction: 1, sectors: new Set([17, 18, 19, 20, 21, 22]), promotionSector: 22 },
  ],
};

const CIRCULAR_PIECES: Record<
  number,
  readonly [ThreePlayerSeat, ThreePlayerStandardPieceType]
> = {
  0: ["white", "rook"], 1: ["white", "pawn"], 22: ["white", "pawn"],
  23: ["white", "rook"], 24: ["white", "knight"], 25: ["white", "pawn"],
  46: ["white", "pawn"], 47: ["white", "knight"], 48: ["white", "bishop"],
  49: ["white", "pawn"], 70: ["white", "pawn"], 71: ["white", "bishop"],
  72: ["white", "king"], 73: ["white", "pawn"], 94: ["white", "pawn"],
  95: ["white", "queen"],
  6: ["red", "pawn"], 7: ["red", "rook"], 8: ["red", "rook"], 9: ["red", "pawn"],
  30: ["red", "pawn"], 31: ["red", "knight"], 32: ["red", "knight"],
  33: ["red", "pawn"], 54: ["red", "pawn"], 55: ["red", "bishop"],
  56: ["red", "bishop"], 57: ["red", "pawn"], 78: ["red", "pawn"],
  79: ["red", "queen"], 80: ["red", "king"], 81: ["red", "pawn"],
  14: ["black", "pawn"], 15: ["black", "rook"], 16: ["black", "rook"],
  17: ["black", "pawn"], 38: ["black", "pawn"], 39: ["black", "knight"],
  40: ["black", "knight"], 41: ["black", "pawn"], 62: ["black", "pawn"],
  63: ["black", "bishop"], 64: ["black", "bishop"], 65: ["black", "pawn"],
  86: ["black", "pawn"], 87: ["black", "queen"], 88: ["black", "king"],
  89: ["black", "pawn"],
};

const groupForSource = (seat: ThreePlayerSeat, sourceIndex: number) => {
  const sector = sourceIndex % SECTORS;
  return PAWN_GROUPS[seat].find((group) => group.sectors.has(sector))?.id;
};

export const createCircularTopology = (): ThreePlayerTopology => {
  const cellDescriptors: ThreePlayerTopologyCell[] = [];
  for (let ring = 0; ring < RINGS; ring += 1) {
    for (let sector = 0; sector < SECTORS; sector += 1) {
      const sourceIndex = ring * SECTORS + sector;
      const angle = (sector / SECTORS) * Math.PI * 2;
      const geometricClass = mod(ring + sector, 2) as 0 | 1;
      cellDescriptors.push({
        id: cellId(ring, sector),
        ordinal: sourceIndex,
        sourceIndex,
        circular: { ring, sector },
        render: {
          x: (RINGS - ring) * Math.sin(angle),
          y: (RINGS - ring) * Math.cos(angle),
          size: 1,
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
    const groups = PAWN_GROUPS[seat].filter((group) => group.sectors.has(origin.sector));
    const initialDouble = initialPawnSources.has(sourceIndex) &&
      CIRCULAR_PIECES[sourceIndex]?.[0] === seat;
    const advances = groups.flatMap((group) => {
      const one = at(origin.ring, origin.sector + group.direction)!;
      const result = [{
        group: group.id,
        to: one,
        path: [one],
        double: false,
        initialOnly: false,
        initialDouble: false,
        promotes: mod(origin.sector + group.direction, SECTORS) === group.promotionSector,
      }];
      if (initialDouble) {
        const two = at(origin.ring, origin.sector + group.direction * 2)!;
        result.push({
          group: group.id,
          to: two,
          path: [one, two],
          double: true,
          initialOnly: true,
          initialDouble: true,
          promotes: mod(origin.sector + group.direction * 2, SECTORS) === group.promotionSector,
        });
      }
      return result;
    });
    const captures = groups.flatMap((group) =>
      [-1, 1].flatMap((ringDelta) => {
        const to = at(origin.ring + ringDelta, origin.sector + group.direction);
        return to
          ? [{
            group: group.id,
            to,
            promotes: mod(origin.sector + group.direction, SECTORS) === group.promotionSector,
          }]
          : [];
      })
    );
    return {
      advances,
      captures,
      promotion: groups.some((group) => origin.sector === group.promotionSector),
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

  return {
    variant: "three-circular",
    cells: cellDescriptors.map((cell) => cell.id),
    cellSet: new Set(cellDescriptors.map((cell) => cell.id)),
    cellDescriptors,
    ...lookups,
    initialPlacements,
    castlingBySeat,
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
