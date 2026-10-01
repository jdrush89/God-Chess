import { describe, expect, it } from "vitest";
import { threePlayerCellAffinity } from "./threePlayerDivineGeometry";
import {
  getThreePlayerTopology,
  threePlayerTopologies,
  type ThreePlayerTopology,
} from "./threePlayerTopology";
import type {
  ThreePlayerBoardVariant,
  ThreePlayerSeat,
} from "./threePlayerTypes";

const seats: readonly ThreePlayerSeat[] = ["white", "red", "black"];
type Point = readonly [number, number];

const pointKey = ([x, y]: Point) => `${x.toFixed(8)},${y.toFixed(8)}`;

const polygonArea = (points: readonly Point[]) => Math.abs(
  points.reduce((area, [x, y], index) => {
    const [nextX, nextY] = points[(index + 1) % points.length];
    return area + x * nextY - nextX * y;
  }, 0) / 2,
);

const cross = (origin: Point, left: Point, right: Point) =>
  (left[0] - origin[0]) * (right[1] - origin[1]) -
  (left[1] - origin[1]) * (right[0] - origin[0]);

const convexHull = (points: readonly Point[]) => {
  const sorted = [...new Map(points.map((point) => [pointKey(point), point])).values()]
    .sort(([leftX, leftY], [rightX, rightY]) =>
      leftX - rightX || leftY - rightY
    );
  const half = (values: readonly Point[]) => {
    const hull: Point[] = [];
    for (const point of values) {
      while (
        hull.length >= 2 &&
        cross(hull[hull.length - 2], hull[hull.length - 1], point) <= 1e-8
      ) {
        hull.pop();
      }
      hull.push(point);
    }
    return hull;
  };
  return [
    ...half(sorted).slice(0, -1),
    ...half([...sorted].reverse()).slice(0, -1),
  ];
};

const pointInsideConvexPolygon = (point: Point, polygon: readonly Point[]) => {
  const signs = polygon.map((vertex, index) =>
    cross(vertex, polygon[(index + 1) % polygon.length], point)
  );
  return signs.every((value) => value >= -1e-8) ||
    signs.every((value) => value <= 1e-8);
};

const distanceToSegment = (point: Point, start: Point, end: Point) => {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const parameter = lengthSquared === 0
    ? 0
    : Math.max(
      0,
      Math.min(
        1,
        ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) /
          lengthSquared,
      ),
    );
  return Math.hypot(
    point[0] - (start[0] + parameter * dx),
    point[1] - (start[1] + parameter * dy),
  );
};

const polygonsOverlapInside = (
  left: readonly Point[],
  right: readonly Point[],
) => {
  for (const polygon of [left, right]) {
    for (let index = 0; index < polygon.length; index += 1) {
      const start = polygon[index];
      const end = polygon[(index + 1) % polygon.length];
      const axis: Point = [-(end[1] - start[1]), end[0] - start[0]];
      const project = (points: readonly Point[]) =>
        points.map(([x, y]) => x * axis[0] + y * axis[1]);
      const leftProjection = project(left);
      const rightProjection = project(right);
      const overlap = Math.min(
        Math.max(...leftProjection),
        Math.max(...rightProjection),
      ) - Math.max(
        Math.min(...leftProjection),
        Math.min(...rightProjection),
      );
      if (overlap <= 1e-8) return false;
    }
  }
  return true;
};

const inventory = (topology: ThreePlayerTopology, seat: ThreePlayerSeat) =>
  topology.initialPlacements
    .filter((placement) => placement.seat === seat)
    .reduce<Record<string, number>>((counts, placement) => {
      counts[placement.type] = (counts[placement.type] ?? 0) + 1;
      return counts;
    }, {});

const expected: Record<
  ThreePlayerBoardVariant,
  { cells: number; pieces: number; inventory: Record<string, number> }
> = {
  "three-player": {
    cells: 96,
    pieces: 48,
    inventory: { pawn: 8, rook: 2, knight: 2, bishop: 2, queen: 1, king: 1 },
  },
  "three-hexagonal": {
    cells: 217,
    pieces: 84,
    inventory: { pawn: 19, rook: 2, knight: 2, bishop: 3, queen: 1, king: 1 },
  },
  triad: {
    cells: 144,
    pieces: 72,
    inventory: { pawn: 12, rook: 3, knight: 3, bishop: 3, queen: 2, king: 1 },
  },
  "three-circular": {
    cells: 96,
    pieces: 48,
    inventory: { pawn: 8, rook: 2, knight: 2, bishop: 2, queen: 1, king: 1 },
  },
  "three-half": {
    cells: 96,
    pieces: 48,
    inventory: { pawn: 8, rook: 2, knight: 2, bishop: 2, queen: 1, king: 1 },
  },
};

describe("three-player topology fixtures", () => {
  it("matches every authoritative board and army count", () => {
    for (const [variant, topology] of Object.entries(threePlayerTopologies()) as Array<
      [ThreePlayerBoardVariant, ThreePlayerTopology]
    >) {
      expect(topology.cells, variant).toHaveLength(expected[variant].cells);
      expect(topology.cells.every((cell) => cell.startsWith(`${variant}:`)), variant)
        .toBe(true);
      expect(topology.initialPlacements, variant).toHaveLength(expected[variant].pieces);
      expect(new Set(topology.cells).size, variant)
        .toBe(expected[variant].cells);
      expect(new Set(topology.initialPlacements.map((piece) => piece.cell)).size, variant)
        .toBe(expected[variant].pieces);
      for (const seat of seats) {
        expect(inventory(topology, seat), `${variant}:${seat}`)
          .toEqual(expected[variant].inventory);
      }
    }
  });

  it("exposes stable Layer 2 geometry primitives on every variant", () => {
    for (const [variant, topology] of Object.entries(threePlayerTopologies()) as Array<
      [ThreePlayerBoardVariant, ThreePlayerTopology]
    >) {
      expect(topology.renderBounds.width, variant).toBeGreaterThan(0);
      expect(topology.renderBounds.height, variant).toBeGreaterThan(0);
      expect(
        topology.cellDescriptors.every((cell) =>
          cell.render.shape.kind === "polygon"
            ? cell.render.shape.points.length >= 4
            : cell.render.shape.outerRadius > cell.render.shape.innerRadius
        ),
        variant,
      ).toBe(true);

      const origin = topology.cells.find((cell) =>
        topology.rookTraces(cell).length > 1 &&
        topology.bishopTraces(cell).length > 1
      )!;
      const rook = topology.rookTraces(origin)[0];
      const destination = rook.cells[0];
      expect(topology.trace(rook.id), variant).toEqual(rook);
      expect(topology.path(rook.id, destination), variant).toMatchObject({
        traceId: rook.id,
        kind: "rook",
        origin,
        destination,
        cells: [destination],
      });
      expect(topology.linePaths(origin, destination, "rook"), variant)
        .toContainEqual(topology.path(rook.id, destination));
      expect(topology.sharesTrace(origin, destination, "rook"), variant).toBe(true);
      expect(topology.sharesTrace(origin, destination, "bishop"), variant).toBe(false);
      const farDestination = rook.cells.at(-1)!;
      const occupied = new Set([rook.cells[0]]);
      expect(topology.hasLineOfSight(origin, origin, occupied), variant).toBe(true);
      if (rook.cells.length > 1) {
        expect(
          topology.unobstructedPaths(origin, farDestination, occupied, "rook"),
          variant,
        ).toEqual([]);
        expect(
          topology.unobstructedPaths(origin, farDestination, new Set(), "rook")
            .length,
          variant,
        ).toBeGreaterThan(0);
        expect(topology.crossedCells(rook.id, farDestination), variant)
          .toEqual(rook.cells.slice(0, -1));
      }
      expect(topology.orthogonalNeighbors(origin), variant)
        .toEqual(topology.adjacent(origin, "rook"));
      expect(topology.diagonalNeighbors(origin), variant)
        .toEqual(topology.adjacent(origin, "bishop"));
      expect(topology.areas(origin, "1x2").length, variant).toBeGreaterThan(0);
      const areaOrigin = topology.cells.find((cell) =>
        topology.areas(cell, "2x2").length > 0
      );
      expect(areaOrigin, `${variant}:2x2`).toBeDefined();

      for (const seat of seats) {
        const home = topology.homeCell(seat);
        expect(home, `${variant}:${seat}:home`).toBeDefined();
        expect(
          topology.initialPlacements.find((placement) =>
            placement.cell === home &&
            placement.seat === seat &&
            placement.type === "king"
          ),
        ).toBeDefined();
        const frontier = topology.promotionFrontier(seat);
        expect(frontier.length, `${variant}:${seat}:frontier`).toBeGreaterThan(0);
        expect(frontier.every((cell) => topology.isPromotionCell(seat, cell)))
          .toBe(true);
        expect(topology.advancement(seat, frontier[0])).toBe(1);
        for (const front of topology.frontCells(seat, home!)) {
          expect(topology.classifyAdvance(seat, home!, front)).toBeDefined();
        }
      }

      const transform = topology.cells.flatMap((anchorFrom) =>
        topology.orthogonalNeighbors(anchorFrom).flatMap((anchorTo) =>
          topology.orthogonalNeighbors(anchorFrom).map((member) => ({
            anchorFrom,
            anchorTo,
            member,
            destination: topology.formationTransform(
              anchorFrom,
              anchorTo,
              member,
            ),
          }))
        )
      ).find((candidate) => candidate.destination);
      expect(transform?.destination, `${variant}:formation`).toBeDefined();
      expect(
        topology.formationTransform(
          transform!.anchorFrom,
          transform!.anchorTo,
          transform!.anchorFrom,
        ),
      ).toBe(transform!.anchorTo);
    }
  });

  it("retains exact source indexes for representative initial pieces", () => {
    const checks: Array<
      [ThreePlayerBoardVariant, number, ThreePlayerSeat, string]
    > = [
      ["three-player", 28, "white", "king"],
      ["three-player", 60, "red", "king"],
      ["three-hexagonal", 101, "white", "king"],
      ["three-hexagonal", 275, "red", "king"],
      ["three-hexagonal", 56, "black", "king"],
      ["triad", 297, "white", "king"],
      ["triad", 34, "red", "king"],
      ["triad", 163, "black", "king"],
      ["three-circular", 23, "white", "queen"],
      ["three-half", 92, "black", "king"],
    ];
    for (const [variant, sourceIndex, seat, type] of checks) {
      const topology = getThreePlayerTopology(variant);
      const cell = topology.cellFromSourceIndex(sourceIndex);
      expect(cell, `${variant}:${sourceIndex}`).toBeDefined();
      expect(topology.cellSet.has(cell!)).toBe(true);
      expect(topology.initialPlacements.find((piece) => piece.cell === cell))
        .toMatchObject({ sourceIndex, seat, type });
      expect(topology.sourceIndex(cell!)).toBe(sourceIndex);
    }
  });
});

describe("hex topologies", () => {
  it("provides six continuous rook and bishop rays plus twelve king and knight targets", () => {
    const topology = getThreePlayerTopology("three-hexagonal");
    const center = topology.cellFromSourceIndex(144)!;
    const rooks = topology.rookTraces(center);
    const bishops = topology.bishopTraces(center);
    expect(rooks).toHaveLength(6);
    expect(bishops).toHaveLength(6);
    expect(topology.rookRays(center)).toEqual(rooks);
    expect(topology.bishopRays(center)).toEqual(bishops);
    expect(rooks.every((trace) => trace.cells.length === 8)).toBe(true);
    expect(new Set(topology.kingNeighbors(center)).size).toBe(12);
    expect(topology.kingTargets(center)).toEqual(topology.kingNeighbors(center));
    expect(new Set(topology.knightTraces(center).map((trace) => trace.target)).size).toBe(12);
    expect(topology.knightTargets(center)).toHaveLength(12);

    for (const trace of [...rooks, ...bishops]) {
      const points = [center, ...trace.cells].map((cell) => topology.cellById.get(cell)!.axial!);
      const steps = points.slice(1).map((point, index) => [
        point.q - points[index].q,
        point.r - points[index].r,
      ].join(","));
      expect(new Set(steps).size, trace.id).toBe(1);
      expect(trace.cells.at(-1), trace.id).toBeDefined();
      expect(
        topology.adjacent(trace.cells.at(-1)!, trace.kind).includes(
          topology.cellFromSourceIndex(-1) ?? "missing",
        ),
      ).toBe(false);
    }
  });

  it("exposes two-direction hex pawns, opposite-wall promotion, and source castling", () => {
    const topology = getThreePlayerTopology("three-hexagonal");
    const pawn = topology.pawnMetadata("white", topology.cellFromSourceIndex(31)!);
    expect(topology.pawnRules("white", topology.cellFromSourceIndex(31)!)).toEqual(pawn);
    expect(pawn.initialDouble).toBe(true);
    expect(pawn.advances.filter((move) => move.initialDouble)).toHaveLength(2);
    expect(pawn.advances.filter((move) => !move.initialDouble)).toHaveLength(2);
    expect(pawn.advances.filter((move) => move.double && move.initialOnly)).toHaveLength(2);
    expect(pawn.advances.filter((move) => !move.double && !move.initialOnly)).toHaveLength(2);
    expect(pawn.captures).toHaveLength(2);
    expect(topology.isPromotionCell("white", topology.cellFromSourceIndex(136)!)).toBe(true);

    const queenSide = topology.castling("white").find((castle) => castle.side === "queen")!;
    expect(topology.sourceIndex(queenSide.kingFrom)).toBe(101);
    expect(topology.sourceIndex(queenSide.kingTo)).toBe(50);
    expect(topology.sourceIndex(queenSide.rookFrom)).toBe(16);
    expect(topology.sourceIndex(queenSide.rookTo)).toBe(67);
    expect(queenSide.kingPath).toHaveLength(3);
  });

  it("uses straight opposite-wall pawns and no castling on Triad", () => {
    const topology = getThreePlayerTopology("triad");
    const pawn = topology.pawnMetadata("white", topology.cellFromSourceIndex(227)!);
    expect(pawn.advances.map((move) => topology.sourceIndex(move.to))).toEqual([209, 191]);
    expect(pawn.captures.map((move) => topology.sourceIndex(move.to))).toEqual([208, 192]);
    expect(topology.castlingBySeat).toEqual({ white: [], red: [], black: [] });
  });

  it.each(["three-hexagonal", "triad"] as const)(
    "keeps ordinary %s affinities fixed while neutral cells alternate by turn",
    (boardVariant) => {
      const topology = getThreePlayerTopology(boardVariant);
      const config = {
        boardVariant,
      } as Parameters<typeof threePlayerCellAffinity>[0]["config"];
      const classZero = topology.cellDescriptors.filter(
        (cell) => cell.geometricClass === 0,
      );
      const classOne = topology.cellDescriptors.filter(
        (cell) => cell.geometricClass === 1,
      );
      const classTwo = topology.cellDescriptors.filter(
        (cell) => cell.geometricClass === 2,
      );

      for (const turn of [1, 2, 3]) {
        expect(classZero.every((cell) =>
          threePlayerCellAffinity({ config, turn }, cell.id) === "light"
        )).toBe(true);
        expect(classOne.every((cell) =>
          threePlayerCellAffinity({ config, turn }, cell.id) === "dark"
        )).toBe(true);
        expect(new Set(classTwo.map((cell) =>
          threePlayerCellAffinity({ config, turn }, cell.id)
        ))).toEqual(new Set([turn % 2 === 1 ? "light" : "dark"]));
      }
    },
  );
});

describe("branched and wrapped topologies", () => {
  it("uses the exact Yalta rook and color-preserving bishop center continuations", () => {
    const topology = getThreePlayerTopology("three-player");
    const indexes = (cells: readonly string[]) =>
      cells.map((cell) => topology.sourceIndex(cell));
    const rayIndexes = (source: number, kind: "rook" | "bishop") =>
      (kind === "rook"
        ? topology.rookTraces(topology.cellFromSourceIndex(source)!)
        : topology.bishopTraces(topology.cellFromSourceIndex(source)!))
        .map((trace) => indexes(trace.cells).join(","))
        .sort();

    expect(
      topology.rookTraces(topology.cellFromSourceIndex(9)!)
        .find((trace) => trace.direction === "rank:-1")
        ?.cells.map((cell) => topology.sourceIndex(cell)),
    ).toEqual([1, 70, 78, 86, 94]);
    expect(
      topology.rookTraces(topology.cellFromSourceIndex(11)!)
        .find((trace) => trace.direction === "rank:-1")
        ?.cells.map((cell) => topology.sourceIndex(cell)),
    ).toEqual([3, 68, 76, 84, 92]);

    expect(rayIndexes(1, "bishop")).toEqual([
      "10,19,28",
      "69,76,83,90",
      "71",
      "8",
    ].sort());
    expect(rayIndexes(2, "bishop")).toEqual([
      "11,20,29",
      "68,75,82,89",
      "70,79",
      "9,16",
    ].sort());
    expect(rayIndexes(17, "bishop")).toEqual([
      "10,3,35,42,49,56",
      "10,3,67,74,81,88",
      "24",
      "26",
      "8",
    ].sort());
    for (const source of [1, 2, 17]) {
      const origin = topology.cellFromSourceIndex(source)!;
      const color = topology.cellById.get(origin)!.geometricClass;
      expect(
        topology.bishopTraces(origin).every((trace) =>
          trace.cells.every((cell) =>
            topology.cellById.get(cell)!.geometricClass === color
          )
        ),
      ).toBe(true);
    }
  });

  it("matches exact Yalta king, knight, and pawn center destinations", () => {
    const topology = getThreePlayerTopology("three-player");
    const sourceIndexes = (cells: readonly string[]) =>
      cells.map((cell) => topology.sourceIndex(cell)).sort((a, b) => a! - b!);
    const exactTargets = [
      [10, [0, 4, 16, 20, 25, 27, 68, 70]],
      [2, [8, 12, 17, 19, 35, 67, 71, 76, 78]],
      [3, [9, 13, 18, 20, 34, 43, 66, 70, 75, 77]],
    ] as const;
    expect(
      sourceIndexes(topology.kingTargets(topology.cellFromSourceIndex(3)!)),
    ).toEqual([2, 4, 10, 11, 12, 35, 67, 68, 69]);
    expect(sourceIndexes([
      ...topology.rookTraces(topology.cellFromSourceIndex(3)!)
        .flatMap((trace) => trace.cells),
      ...topology.bishopTraces(topology.cellFromSourceIndex(3)!)
        .flatMap((trace) => trace.cells),
    ])).toEqual([
      0, 1, 2, 4, 5, 6, 7, 10, 11, 12, 17, 19, 21, 24, 27, 30, 35, 42,
      49, 56, 67, 68, 69, 74, 76, 78, 81, 84, 87, 88, 92,
    ]);
    for (const [source, expectedTargets] of exactTargets) {
      expect(
        sourceIndexes(topology.knightTargets(
          topology.cellFromSourceIndex(source)!,
        )),
      ).toEqual([...expectedTargets]);
    }

    const ownPawn = topology.pawnRules(
      "white",
      topology.cellFromSourceIndex(17)!,
    );
    expect(sourceIndexes(ownPawn.advances.map((move) => move.to)))
      .toEqual([1, 9]);
    expect(sourceIndexes(ownPawn.captures.map((move) => move.to)))
      .toEqual([8, 10]);
    const centerPawn = topology.pawnRules(
      "white",
      topology.cellFromSourceIndex(4)!,
    );
    expect(sourceIndexes(centerPawn.advances.map((move) => move.to)))
      .toEqual([35]);
    expect(sourceIndexes(centerPawn.captures.map((move) => move.to)))
      .toEqual([34, 36, 68]);
    const enemyThirdPawn = topology.pawnRules(
      "white",
      topology.cellFromSourceIndex(33)!,
    );
    expect(sourceIndexes(enemyThirdPawn.advances.map((move) => move.to)))
      .toEqual([41]);
    expect(sourceIndexes(enemyThirdPawn.captures.map((move) => move.to)))
      .toEqual([40, 42]);
  });

  it("terminates circular rays before their origin and preserves pawn groups", () => {
    const topology = getThreePlayerTopology("three-circular");
    const origin = topology.cellFromSourceIndex(0)!;
    const angular = topology.rookTraces(origin)
      .filter((trace) => trace.direction === "0,1" || trace.direction === "0,-1");
    expect(angular).toHaveLength(2);
    for (const trace of angular) {
      expect(trace.cells).toHaveLength(23);
      expect(trace.cells).not.toContain(origin);
      expect(new Set(trace.cells).size).toBe(23);
    }

    const initial = topology.pawnMetadata("white", topology.cellFromSourceIndex(44)!);
    expect(initial.initialDouble).toBe(true);
    expect(initial.advances).toHaveLength(2);
    expect(new Set(initial.advances.map((move) => move.group)))
      .toEqual(new Set(["toward-center"]));
    expect(initial.advances.map((move) => topology.sourceIndex(move.to)))
      .toEqual([68, 92]);
    const beforeBoundary = topology.pawnMetadata(
      "white",
      topology.cellFromSourceIndex(68)!,
    );
    expect(beforeBoundary.advances[0]).toMatchObject({ promotes: true });
    expect(topology.castling("white")).toEqual([]);

    expect(topology.formationTransform(
      topology.cellFromSourceIndex(0)!,
      topology.cellFromSourceIndex(12)!,
      topology.cellFromSourceIndex(1)!,
    )).toBeUndefined();
  });

  it("uses exact classic two-rank armies on Yalta and Circular", () => {
    const classic = [
      "rook",
      "knight",
      "bishop",
      "queen",
      "king",
      "bishop",
      "knight",
      "rook",
    ];
    const yalta = getThreePlayerTopology("three-player");
    const yaltaStarts = { white: 16, red: 48, black: 80 } as const;
    for (const seat of seats) {
      const placements = yalta.initialPlacements.filter((piece) => piece.seat === seat);
      expect(
        placements.filter((piece) => piece.type === "pawn")
          .sort((a, b) => a.sourceIndex - b.sourceIndex)
          .map((piece) => piece.sourceIndex),
      ).toEqual(Array.from({ length: 8 }, (_, file) => yaltaStarts[seat] + file));
      expect(
        placements.filter((piece) => piece.type !== "pawn")
          .sort((a, b) => a.sourceIndex - b.sourceIndex)
          .map((piece) => piece.type),
      ).toEqual(classic);
    }

    const circular = getThreePlayerTopology("three-circular");
    const sectors = {
      white: [20, 21, 22, 23, 0, 1, 2, 3],
      red: [4, 5, 6, 7, 8, 9, 10, 11],
      black: [12, 13, 14, 15, 16, 17, 18, 19],
    } as const;
    for (const seat of seats) {
      const placements = circular.initialPlacements.filter((piece) => piece.seat === seat);
      expect(sectors[seat].map((sector) =>
        placements.find((piece) => piece.sourceIndex === sector)?.type
      )).toEqual(classic);
      expect(sectors[seat].map((sector) =>
        placements.find((piece) => piece.sourceIndex === 24 + sector)?.type
      )).toEqual(Array(8).fill("pawn"));
    }
  });

  it("renders Yalta as one contiguous six-sided 96-cell board", () => {
    const topology = getThreePlayerTopology("three-player");
    const descriptors = topology.cellDescriptors;
    const polygons = descriptors.map((descriptor) => {
      expect(descriptor.render.shape.kind).toBe("polygon");
      return descriptor.render.shape.kind === "polygon"
        ? descriptor.render.shape.points
        : [];
    });
    expect(polygons).toHaveLength(96);

    const edges = new Map<string, { count: number; points: readonly [Point, Point] }>();
    for (const polygon of polygons) {
      polygon.forEach((point, index) => {
        const next = polygon[(index + 1) % polygon.length];
        const key = [pointKey(point), pointKey(next)].sort().join("|");
        const existing = edges.get(key);
        edges.set(key, {
          count: (existing?.count ?? 0) + 1,
          points: existing?.points ?? [point, next],
        });
      });
    }
    expect([...edges.values()].every(({ count }) => count === 1 || count === 2))
      .toBe(true);
    const boundary = [...edges.values()].filter(({ count }) => count === 1);
    expect(boundary).toHaveLength(48);

    const hull = convexHull(boundary.flatMap(({ points }) => points));
    expect(hull).toHaveLength(6);
    expect(hull.every((point, index) =>
      cross(point, hull[(index + 1) % hull.length], hull[(index + 2) % hull.length]) >
        0
    )).toBe(true);

    const sideCounts = hull.map((start, index) => {
      const end = hull[(index + 1) % hull.length];
      return boundary.filter(({ points: [left, right] }) =>
        Math.abs(cross(start, end, left)) < 1e-8 &&
        Math.abs(cross(start, end, right)) < 1e-8
      ).length;
    });
    expect(sideCounts).toEqual([8, 8, 8, 8, 8, 8]);

    const areas = polygons.map(polygonArea);
    expect(Math.min(...areas)).toBeGreaterThan(0.8);
    expect(
      areas.reduce((sum, area) => sum + area, 0),
    ).toBeCloseTo(polygonArea(hull), 7);

    descriptors.forEach((descriptor, index) => {
      const center: Point = [descriptor.render.x, descriptor.render.y];
      expect(pointInsideConvexPolygon(center, polygons[index]), descriptor.id)
        .toBe(true);
      const inradius = Math.min(...polygons[index].map((point, pointIndex) =>
        distanceToSegment(
          center,
          point,
          polygons[index][(pointIndex + 1) % polygons[index].length],
        )
      ));
      expect(inradius, descriptor.id).toBeGreaterThan(0.2);
    });

    for (let left = 0; left < polygons.length; left += 1) {
      for (let right = left + 1; right < polygons.length; right += 1) {
        expect(
          polygonsOverlapInside(polygons[left], polygons[right]),
          `${descriptors[left].id} overlaps ${descriptors[right].id}`,
        ).toBe(false);
      }
    }
  });

  it("orients straight Yalta armies White bottom, Red left, and Black right", () => {
    const topology = getThreePlayerTopology("three-player");
    const centers = (seat: ThreePlayerSeat, rank: number) =>
      Array.from({ length: 8 }, (_, file) => {
        const descriptor = topology.cellById.get(
          topology.cellFromSourceIndex(seats.indexOf(seat) * 32 + rank * 8 + file)!,
        )!;
        return [descriptor.render.x, descriptor.render.y] as Point;
      });
    const average = (points: readonly Point[]) => points.reduce(
      ([x, y], point) => [x + point[0] / points.length, y + point[1] / points.length],
      [0, 0] as [number, number],
    );
    const maximumLineDeviation = (points: readonly Point[]) => {
      const start = points[0];
      const end = points.at(-1)!;
      return Math.max(...points.map((point) => {
        const numerator = Math.abs(cross(start, end, point));
        return numerator / Math.hypot(end[0] - start[0], end[1] - start[1]);
      }));
    };

    expect(average(centers("white", 3))[1]).toBeGreaterThan(6);
    expect(average(centers("red", 3))[0]).toBeLessThan(-5);
    expect(average(centers("black", 3))[0]).toBeGreaterThan(5);
    expect(centers("white", 3).map(([x]) => x)).toEqual(
      [...centers("white", 3).map(([x]) => x)].sort((left, right) => left - right),
    );
    for (const seat of seats) {
      expect(maximumLineDeviation(centers(seat, 3)), `${seat} back rank`)
        .toBeLessThan(0.25);
      expect(maximumLineDeviation(centers(seat, 2)), `${seat} pawn rank`)
        .toBeLessThan(0.25);
    }
  });

  it("never mixes pair mappings on Three Half traces", () => {
    const topology = getThreePlayerTopology("three-half");
    const origin = topology.cellFromSourceIndex(3)!;
    const crossing = topology.bishopTraces(origin)
      .filter((trace) => trace.cells.some((cell) => topology.cellById.get(cell)!.half !== "white"));
    expect(new Set(crossing.map((trace) => trace.context)))
      .toEqual(new Set(["white-red", "white-black"]));
    for (const trace of crossing) {
      const halves = new Set([
        "white",
        ...trace.cells.map((cell) => topology.cellById.get(cell)!.half!),
      ]);
      expect(halves.size, trace.id).toBeLessThanOrEqual(2);
      if (trace.context === "white-red") expect(halves).not.toContain("black");
      if (trace.context === "white-black") expect(halves).not.toContain("red");
    }

    const redTarget = crossing
      .find((trace) => trace.context === "white-red")!
      .cells.find((cell) => topology.cellById.get(cell)!.half === "red")!;
    expect(topology.paths(origin, redTarget, "bishop").map((path) => path.context))
      .toEqual(["white-red"]);
    const localTarget = topology.cellFromSourceIndex(4)!;
    const localMember = topology.cellFromSourceIndex(2)!;
    expect(topology.formationTransform(origin, localTarget, localMember))
      .toBeUndefined();
    expect(topology.formationTransform(
      origin,
      localTarget,
      localMember,
      "white-red",
    )).toBeDefined();
    expect(topology.castling("white")).toHaveLength(2);
  });
});
