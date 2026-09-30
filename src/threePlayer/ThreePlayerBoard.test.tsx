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
    "renders every %s topology cell in one accessible SVG",
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
