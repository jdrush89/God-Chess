import { describe, expect, it } from "vitest";
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
      ["three-circular", 95, "white", "queen"],
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

  it("maps three geometric classes to deterministic, balanced affinities", () => {
    const first = getThreePlayerTopology("three-hexagonal");
    const second = getThreePlayerTopology("three-hexagonal");
    expect(first.cellDescriptors.map((cell) => cell.affinity))
      .toEqual(second.cellDescriptors.map((cell) => cell.affinity));
    expect(first.cellDescriptors.filter((cell) => cell.geometricClass === 0)
      .every((cell) => cell.affinity === "light")).toBe(true);
    expect(first.cellDescriptors.filter((cell) => cell.geometricClass === 1)
      .every((cell) => cell.affinity === "dark")).toBe(true);
    expect(new Set(
      first.cellDescriptors.filter((cell) => cell.geometricClass === 2)
        .map((cell) => cell.affinity),
    )).toEqual(new Set(["light", "dark"]));
    const light = first.cellDescriptors.filter((cell) => cell.affinity === "light").length;
    const dark = first.cells.length - light;
    expect(Math.abs(light - dark)).toBeLessThanOrEqual(5);
  });
});

describe("branched and wrapped topologies", () => {
  it("keeps distinct center continuations and knight orderings on Yalta", () => {
    const topology = getThreePlayerTopology("three-player");
    const centerEdge = topology.cellFromSourceIndex(3)!;
    const branches = topology.bishopTraces(centerEdge)
      .filter((trace) => trace.cells.some((cell) => topology.cellById.get(cell)!.half !== "white"));
    expect(new Set(branches.map((trace) => trace.context)))
      .toEqual(new Set(["white-red", "white-black"]));
    expect(branches.some((trace) =>
      trace.cells.some((cell) => topology.cellById.get(cell)!.half === "red")
    )).toBe(true);
    expect(branches.some((trace) =>
      trace.cells.some((cell) => topology.cellById.get(cell)!.half === "black")
    )).toBe(true);

    const knight = topology.cellFromSourceIndex(10)!;
    const traces = topology.knightTraces(knight);
    const duplicateTarget = traces.find((trace, index) =>
      traces.slice(index + 1).some((other) =>
        other.target === trace.target &&
        other.context === trace.context &&
        other.path.join(",") !== trace.path.join(",")
      )
    );
    expect(duplicateTarget).toBeDefined();
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

    const initial = topology.pawnMetadata("white", topology.cellFromSourceIndex(1)!);
    expect(initial.initialDouble).toBe(true);
    expect(initial.advances).toHaveLength(2);
    expect(new Set(initial.advances.map((move) => move.group)))
      .toEqual(new Set(["clockwise"]));
    const beforeBoundary = topology.pawnMetadata(
      "white",
      topology.cellFromSourceIndex(5)!,
    );
    expect(beforeBoundary.advances[0]).toMatchObject({ promotes: true });
    expect(topology.castling("white")).toEqual([]);
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
    expect(topology.castling("white")).toHaveLength(2);
  });
});
