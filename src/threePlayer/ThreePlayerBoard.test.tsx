// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createThreePlayerGame } from "../game/threePlayerEngine";
import { createDefaultThreePlayerConfig } from "../game/threePlayerConfig";
import { getThreePlayerTopology } from "../game/threePlayerTopology";
import { THREE_PLAYER_BOARD_VARIANTS } from "../game/threePlayerTypes";
import { ThreePlayerBoard } from "./ThreePlayerBoard";

afterEach(cleanup);

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
});
