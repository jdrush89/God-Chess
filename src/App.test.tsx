// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";
import { createGame, gameReducer } from "./game/engine";

const SAVE_KEY = "god-chess-save-v1";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("game startup", () => {
  it("shows local, AI, and online choices when starting a new game", () => {
    const savedState = createGame(1);
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      state: savedState,
    }));

    render(<App />);
    expect(screen.getByRole("img", { name: /god chess/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^new game$/i }));

    expect(screen.getByRole("button", { name: /two players share this device/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /divine ai/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /online versus/i })).toBeTruthy();
  });

  it("restores the saved position instead of the fresh initial game", () => {
    const savedState = gameReducer(createGame(1), {
      type: "draft",
      godId: "quetzacoatl",
    });
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      state: savedState,
    }));

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /resume game/i }));

    expect(screen.getByText(/player 2 · black picks/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /quetzacoatl sky w/i })).toBeTruthy();
  });
});
