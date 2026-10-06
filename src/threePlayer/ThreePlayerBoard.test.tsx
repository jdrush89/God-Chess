// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createThreePlayerGame } from "../game/threePlayerEngine";
import { createDefaultThreePlayerConfig } from "../game/threePlayerConfig";
import { getThreePlayerTopology } from "../game/threePlayerTopology";
import { THREE_PLAYER_BOARD_VARIANTS } from "../game/threePlayerTypes";
import { ThreePlayerBoard } from "./ThreePlayerBoard";

afterEach(cleanup);

const distance = (
  [ax, ay]: readonly [number, number],
  [bx, by]: readonly [number, number],
) => Math.hypot(ax - bx, ay - by);

const legacyPieceFontSize = (
  descriptor: ReturnType<typeof getThreePlayerTopology>["cellDescriptors"][number],
  variant: (typeof THREE_PLAYER_BOARD_VARIANTS)[number],
) => {
  if (variant === "three-player") return 0.64;
  const shape = descriptor.render.shape;
  if (shape.kind === "annular-sector") {
    const radial = shape.outerRadius - shape.innerRadius;
    const angular = 2 * ((shape.innerRadius + shape.outerRadius) / 2) *
      Math.sin((shape.endAngle - shape.startAngle) / 2);
    return Math.min(0.76, radial * 0.72, angular * 0.72);
  }
  const edges = shape.points.map((point, index) =>
    distance(point, shape.points[(index + 1) % shape.points.length])
  );
  return Math.min(0.76, Math.min(...edges) * 0.68);
};

const pointInPolygon = (
  [x, y]: readonly [number, number],
  polygon: readonly (readonly [number, number])[],
) => {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [xi, yi] = polygon[index];
    const [xj, yj] = polygon[previous];
    if (
      ((yi > y) !== (yj > y)) &&
      x < (xj - xi) * (y - yi) / (yj - yi) + xi
    ) inside = !inside;
  }
  return inside;
};

const polygonInradius = (
  center: readonly [number, number],
  polygon: readonly (readonly [number, number])[],
) => Math.min(...polygon.map((point, index) => {
  const next = polygon[(index + 1) % polygon.length];
  return Math.abs(
    (next[0] - point[0]) * (point[1] - center[1]) -
      (point[0] - center[0]) * (next[1] - point[1]),
  ) / distance(point, next);
}));

describe("ThreePlayerBoard", () => {
  it.each(THREE_PLAYER_BOARD_VARIANTS)(
    "renders every %s topology cell inside a padded accessible SVG",
    (variant) => {
      const config = createDefaultThreePlayerConfig();
      config.boardVariant = variant;
      const state = createThreePlayerGame(config);
      const { container } = render(<ThreePlayerBoard state={state} />);
      const board = screen.getByRole("grid", { name: new RegExp(variant) });

      expect(board.tagName.toLowerCase()).toBe("svg");
      expect(board.getAttribute("viewBox")).toMatch(/^-?\d/);
      expect(screen.getAllByRole("gridcell")).toHaveLength(
        getThreePlayerTopology(variant).cells.length,
      );
      expect(container.querySelectorAll("[data-cell]").length).toBe(
        getThreePlayerTopology(variant).cells.length,
      );
      const [minX, minY, width, height] = board.getAttribute("viewBox")!
        .split(" ")
        .map(Number);
      const maxX = minX + width;
      const maxY = minY + height;
      for (const descriptor of getThreePlayerTopology(variant).cellDescriptors) {
        const shape = descriptor.render.shape;
        const points = shape.kind === "polygon"
          ? shape.points
          : [
            [shape.cx - shape.outerRadius, shape.cy - shape.outerRadius],
            [shape.cx + shape.outerRadius, shape.cy + shape.outerRadius],
          ];
        expect(points.every(([x, y]) =>
          x > minX && x < maxX && y > minY && y < maxY
        )).toBe(true);
      }
    },
  );

  it.each(["three-hexagonal", "triad"] as const)(
    "renders only geometric class 2 as neutral on %s",
    (variant) => {
      const config = createDefaultThreePlayerConfig();
      config.boardVariant = variant;
      const state = createThreePlayerGame(config);
      const topology = getThreePlayerTopology(variant);
      const { container, rerender } = render(<ThreePlayerBoard state={state} />);

      for (const descriptor of topology.cellDescriptors) {
        const cell = container.querySelector(`[data-cell="${descriptor.id}"]`)!;
        expect(cell.classList.contains("neutral")).toBe(
          descriptor.geometricClass === 2,
        );
      }

      const next = structuredClone(state);
      next.turn = 2;
      rerender(<ThreePlayerBoard state={next} />);
      for (const descriptor of topology.cellDescriptors.filter(
        (cell) => cell.geometricClass === 2,
      )) {
        expect(container.querySelector(`[data-cell="${descriptor.id}"]`)
          ?.classList.contains("neutral")).toBe(true);
      }
    },
  );

  it("announces pieces and exposes legal, selected, and path highlights", () => {
    const state = createThreePlayerGame();
    const pieceCell = Object.keys(state.board)[0];
    const target = getThreePlayerTopology(state.config.boardVariant).cells.find(
      (cell) => cell !== pieceCell,
    )!;
    const { container } = render(
      <ThreePlayerBoard
        state={state}
        selectedCell={pieceCell}
        legalCells={[target]}
        pathCells={[target]}
      />,
    );

    expect(screen.getByRole("gridcell", { name: new RegExp(`${pieceCell},`) })).toBeTruthy();
    expect(container.querySelector(`[data-cell="${pieceCell}"]`)?.classList.contains("selected")).toBe(true);
    expect(container.querySelector(`[data-cell="${target}"]`)?.classList.contains("legal")).toBe(true);
    expect(container.querySelector(`[data-cell="${target}"]`)?.classList.contains("path")).toBe(true);
  });

  it("announces and distinguishes provisional move-first endpoints", () => {
    const state = createThreePlayerGame();
    const source = Object.keys(state.board)[0];
    const destination = getThreePlayerTopology(
      state.config.boardVariant,
    ).cells.find((cell) => !state.board[cell])!;
    const { container } = render(
      <ThreePlayerBoard
        state={state}
        provisionalSource={source}
        provisionalDestination={destination}
      />,
    );

    expect(screen.getByRole("gridcell", {
      name: new RegExp(`${source}.*provisional move source`, "i"),
    })).toBeTruthy();
    expect(screen.getByRole("gridcell", {
      name: new RegExp(
        `${destination}.*provisional move destination, not committed`,
        "i",
      ),
    })).toBeTruthy();
    expect(container.querySelector(`[data-cell="${source}"]`)
      ?.classList.contains("provisional-source")).toBe(true);
    expect(container.querySelector(`[data-cell="${destination}"]`)
      ?.classList.contains("provisional-destination")).toBe(true);
  });

  it.each(THREE_PLAYER_BOARD_VARIANTS)(
    "renders centered empty-target dots and occupied capture markers on %s",
    (variant) => {
      const config = createDefaultThreePlayerConfig();
      config.boardVariant = variant;
      const state = createThreePlayerGame(config);
      const topology = getThreePlayerTopology(variant);
      const occupied = Object.keys(state.board)[0];
      const empty = topology.cells.find((cell) => !state.board[cell])!;
      const { container } = render(
        <ThreePlayerBoard state={state} legalCells={[empty, occupied]} />,
      );

      const emptyCell = container.querySelector(`[data-cell="${empty}"]`)!;
      const occupiedCell = container.querySelector(`[data-cell="${occupied}"]`)!;
      const marker = emptyCell.parentElement?.querySelector("circle.move-target-dot");
      expect(emptyCell.classList.contains("legal-destination")).toBe(true);
      expect(marker).toBeTruthy();
      expect(marker?.getAttribute("cx")).toBe(
        String(topology.cellById.get(empty)!.render.x),
      );
      expect(marker?.getAttribute("cy")).toBe(
        String(topology.cellById.get(empty)!.render.y),
      );
      expect(Number(marker?.getAttribute("r"))).toBeCloseTo(
        legacyPieceFontSize(topology.cellById.get(empty)!, variant) * 0.14,
        8,
      );
      expect(occupiedCell.classList.contains("legal-occupied")).toBe(true);
      expect(occupiedCell.parentElement?.querySelector(".move-target-dot")).toBeNull();
    },
  );

  it("keeps ability effect previews distinct from ordinary move targets", () => {
    const state = createThreePlayerGame();
    const target = Object.keys(state.board)[0];
    state.pending = {
      godId: "medusa",
      abilityId: "stone-gaze",
      step: "confirm-stone-gaze",
    };
    const { container } = render(
      <ThreePlayerBoard state={state} legalCells={[target]} />,
    );
    const targetCell = container.querySelector(`[data-cell="${target}"]`)!;

    expect(targetCell.classList.contains("effect-preview")).toBe(true);
    expect(targetCell.classList.contains("legal-destination")).toBe(false);
    expect(targetCell.parentElement?.querySelector(".move-target-dot")).toBeNull();
  });

  it("visually distinguishes Enchant source and destination highlights", () => {
    const state = createThreePlayerGame();
    const source = Object.keys(state.board)[0];
    state.pending = {
      godId: "teles",
      abilityId: "enchant",
      step: "enchant-enemy-move",
    };
    const { container, rerender } = render(
      <ThreePlayerBoard state={state} legalCells={[source]} />,
    );
    expect(container.querySelector(`[data-cell="${source}"]`)?.classList.contains("legal-source"))
      .toBe(true);

    rerender(
      <ThreePlayerBoard
        state={state}
        selectedCell={source}
        legalCells={[source]}
      />,
    );
    expect(container.querySelector(`[data-cell="${source}"]`)?.classList.contains("legal-destination"))
      .toBe(true);
  });

  it("renders banana locations with an accessible cell description", () => {
    const state = createThreePlayerGame();
    const cell = getThreePlayerTopology(state.config.boardVariant).cells.find(
      (candidate) => !state.board[candidate],
    )!;
    state.bananas.push({ cell, owner: "red", expires: 1 });
    const { container } = render(<ThreePlayerBoard state={state} />);

    expect(screen.getByRole("gridcell", {
      name: new RegExp(`${cell}, banana placed by red`, "i"),
    })).toBeTruthy();
    expect(container.querySelector(`[data-cell="${cell}"]`)?.parentElement
      ?.querySelector(".three-board-banana")).toBeTruthy();
  });

  it.each(THREE_PLAYER_BOARD_VARIANTS)(
    "renders an accessible Hex marker on controlled hostile pieces on %s",
    (variant) => {
      const config = createDefaultThreePlayerConfig();
      config.boardVariant = variant;
      const state = createThreePlayerGame(config);
      const [cell, piece] = Object.entries(state.board).find(
        ([, candidate]) => candidate.owner === "red",
      )!;
      piece.controller = "black";
      piece.status.hexedBy = "white";
      const onCell = vi.fn();
      const onInspectCell = vi.fn();
      const { container } = render(
        <ThreePlayerBoard
          state={state}
          onCell={onCell}
          onInspectCell={onInspectCell}
        />,
      );

      const boardCell = screen.getByRole("gridcell", {
        name: new RegExp(`${cell}.*controlled by black.*Hexed`, "i"),
      });
      const marker = container.querySelector(
        `[data-cell="${cell}"] ~ [data-status="hexedBy"]`,
      );
      expect(marker?.getAttribute("aria-label")).toBe("Hexed by White");
      expect(marker?.querySelector("title")?.textContent).toBe("Hexed by White");

      fireEvent.click(boardCell);
      expect(onInspectCell).toHaveBeenCalledWith(cell);
      expect(onCell).toHaveBeenCalledWith(cell);
    },
  );

  it.each(THREE_PLAYER_BOARD_VARIANTS)(
    "keeps %s piece sizing variant-specific and geometry-aware",
    (variant) => {
      const config = createDefaultThreePlayerConfig();
      config.boardVariant = variant;
      const state = createThreePlayerGame(config);
      const topology = getThreePlayerTopology(variant);
      const { container } = render(<ThreePlayerBoard state={state} />);

      const pieces = [...container.querySelectorAll<SVGTextElement>(".three-board-piece")];
      expect(pieces).toHaveLength(topology.initialPlacements.length);
      for (const piece of pieces) {
        const cell = piece.parentElement?.querySelector<SVGElement>("[data-cell]")
          ?.getAttribute("data-cell");
        expect(cell).toBeTruthy();
        const descriptor = topology.cellById.get(cell!)!;
        expect(Number(piece.getAttribute("x"))).toBeCloseTo(descriptor.render.x, 8);
        expect(Number(piece.getAttribute("y"))).toBeCloseTo(descriptor.render.y, 8);
        const fontSize = Number.parseFloat(piece.style.fontSize);
        const legacySize = legacyPieceFontSize(descriptor, variant);
        if (variant === "three-hexagonal" || variant === "triad") {
          expect(fontSize).toBeCloseTo(legacySize * 1.8, 8);
          expect(fontSize).toBeCloseTo(1.224, 8);
          const shape = descriptor.render.shape;
          expect(shape.kind).toBe("polygon");
          if (shape.kind === "polygon") {
            expect(fontSize).toBeLessThanOrEqual(
              polygonInradius(
                [descriptor.render.x, descriptor.render.y],
                shape.points,
              ) * 1.42,
            );
          }
        } else {
          expect(fontSize).toBeCloseTo(legacySize, 8);
        }
      }

      if (variant === "three-hexagonal" || variant === "triad") {
        for (const type of ["king", "queen", "rook"] as const) {
          const cells = topology.initialPlacements
            .filter((placement) => placement.type === type)
            .map((placement) => placement.cell);
          expect(cells.length).toBeGreaterThan(0);
          for (const cell of cells) {
            const group = container.querySelector(`[data-cell="${cell}"]`)!.parentElement!;
            expect(Number.parseFloat(
              group.querySelector<SVGTextElement>(".three-board-piece")!.style.fontSize,
            )).toBeCloseTo(1.224, 8);
          }
        }
      }
    },
  );

  it.each(["three-hexagonal", "triad"] as const)(
    "keeps enlarged %s Hex status markers inside their cells",
    (variant) => {
      const config = createDefaultThreePlayerConfig();
      config.boardVariant = variant;
      const state = createThreePlayerGame(config);
      const topology = getThreePlayerTopology(variant);
      const placements = topology.initialPlacements.filter(
        ({ type }) => type === "king" || type === "queen" || type === "rook",
      );
      for (const { cell } of placements) {
        state.board[cell].status.hexedBy = "white";
      }

      const { container } = render(<ThreePlayerBoard state={state} />);
      for (const { cell } of placements) {
        const descriptor = topology.cellById.get(cell)!;
        const shape = descriptor.render.shape;
        expect(shape.kind).toBe("polygon");
        const marker = container.querySelector(`[data-cell="${cell}"]`)!
          .parentElement!.querySelector<SVGPolygonElement>(
            '[data-status="hexedBy"] polygon',
          )!;
        const markerPoints = marker.getAttribute("points")!.split(" ").map((point) =>
          point.split(",").map(Number) as [number, number]
        );
        if (shape.kind === "polygon") {
          expect(markerPoints.every((point) => pointInPolygon(point, shape.points)))
            .toBe(true);
        }
      }
    },
  );

  it("keeps Yalta pieces uniformly readable after moving into innermost cells", () => {
    const config = createDefaultThreePlayerConfig();
    config.boardVariant = "three-player";
    const state = createThreePlayerGame(config);
    const topology = getThreePlayerTopology("three-player");
    const movedCells: string[] = [];

    (["white", "red", "black"] as const).forEach((seat, seatIndex) => {
      const source = topology.initialPlacements.find(
        (placement) => placement.seat === seat && placement.type === "rook",
      )!.cell;
      const target = topology.cellFromSourceIndex(seatIndex * 32 + 3)!;
      state.board[target] = state.board[source];
      delete state.board[source];
      movedCells.push(target);
    });

    const { container } = render(<ThreePlayerBoard state={state} />);
    const pieces = [...container.querySelectorAll<SVGTextElement>(".three-board-piece")];
    expect(pieces).toHaveLength(48);
    expect(new Set(pieces.map((piece) => piece.style.fontSize))).toEqual(
      new Set(["0.64px"]),
    );

    for (const target of movedCells) {
      const group = container.querySelector(`[data-cell="${target}"]`)!.parentElement!;
      const piece = group.querySelector<SVGTextElement>(".three-board-piece")!;
      const descriptor = topology.cellById.get(target)!;
      expect(Number(piece.getAttribute("x"))).toBeCloseTo(descriptor.render.x, 8);
      expect(Number(piece.getAttribute("y"))).toBeCloseTo(descriptor.render.y, 8);
      expect(Number.parseFloat(piece.style.fontSize)).toBeGreaterThanOrEqual(0.6);
      expect(Number.parseFloat(piece.style.fontSize)).toBeLessThanOrEqual(0.7);
    }
  });

  it("keeps Circular cells away from the collapsed center point", () => {
    const topology = getThreePlayerTopology("three-circular");
    const sectors = topology.cellDescriptors.map((cell) => cell.render.shape)
      .filter((shape) => shape.kind === "annular-sector");
    expect(sectors).toHaveLength(96);
    expect(Math.min(...sectors.map((shape) => shape.innerRadius))).toBeGreaterThanOrEqual(1.5);
  });
});
