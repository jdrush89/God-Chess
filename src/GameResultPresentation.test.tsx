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

    const seeBoard = screen.getByRole("button", { name: /see board/i });
    const newGame = screen.getByRole("button", { name: /new game/i });
    await waitFor(() => expect(document.activeElement).toBe(seeBoard));

    fireEvent.keyDown(seeBoard, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(newGame);
    fireEvent.keyDown(newGame, { key: "Tab" });
    expect(document.activeElement).toBe(seeBoard);
  });
});
