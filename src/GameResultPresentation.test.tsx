// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameResultPresentation } from "./GameResultPresentation";

afterEach(cleanup);

describe("GameResultPresentation", () => {
  it("traps focus within the blocking result dialog", async () => {
    render(
      <GameResultPresentation
        open
        eyebrow="Match complete"
        title="White wins"
        description="Checkmate"
        newGameLabel="New game"
        undoEnabled
        canUndo
        onOpenChange={vi.fn()}
        onUndo={vi.fn()}
        onNewGame={vi.fn()}
      />,
    );

    const viewBoard = screen.getByRole("button", { name: /view board/i });
    const newGame = screen.getByRole("button", { name: /new game/i });
    await waitFor(() => expect(document.activeElement).toBe(viewBoard));

    fireEvent.keyDown(viewBoard, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(newGame);
    fireEvent.keyDown(newGame, { key: "Tab" });
    expect(document.activeElement).toBe(viewBoard);
  });

  it("uses a forward icon for the next-puzzle action", () => {
    const { container } = render(
      <GameResultPresentation
        open
        eyebrow="Puzzle complete"
        title="Solved"
        description="You completed the puzzle."
        newGameLabel="Next puzzle"
        newGameIcon="next"
        undoEnabled
        canUndo={false}
        onOpenChange={vi.fn()}
        onUndo={vi.fn()}
        onNewGame={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /next puzzle/i }),
    ).toBeTruthy();
    expect(container.querySelector(".lucide-chevron-right")).toBeTruthy();
    expect(container.querySelector(".lucide-rotate-ccw")).toBeNull();
  });
});
