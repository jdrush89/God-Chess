import { beforeEach, describe, expect, it, vi } from "vitest";

const searchHarness = vi.hoisted(() => ({
  hasCompleteTurn: vi.fn(() => true),
}));

vi.mock("./completeTurnSearch", async (importOriginal) => ({
  ...await importOriginal<typeof import("./completeTurnSearch")>(),
  hasCompleteTurn: searchHarness.hasCompleteTurn,
}));

import { enumerateTurnPlans } from "./ai";
import { createGame, gameReducer } from "./engine";
import { createPuzzleGame } from "./puzzles";

describe("puzzle interactive performance", () => {
  beforeEach(() => {
    searchHarness.hasCompleteTurn.mockClear();
  });

  it("does not run exhaustive turn validation when a human puzzle move commits", () => {
    let state = createPuzzleGame("centaurs-lance");
    state = gameReducer(state, { type: "select-god", godId: "chiron" });
    state = gameReducer(state, {
      type: "select-ability",
      abilityId: "charge",
    });
    state = gameReducer(state, { type: "square", square: "e2" });

    const next = gameReducer(state, { type: "square", square: "e3" });

    expect(next.activeColor).toBe("black");
    expect(searchHarness.hasCompleteTurn).not.toHaveBeenCalled();
  });

  it("does not adjudicate every hypothetical turn during AI enumeration", () => {
    let state = createPuzzleGame("centaurs-lance");
    state = gameReducer(state, { type: "select-god", godId: "chiron" });
    state = gameReducer(state, {
      type: "select-ability",
      abilityId: "charge",
    });
    state = gameReducer(state, { type: "square", square: "e2" });
    state = gameReducer(state, { type: "square", square: "e3" });
    searchHarness.hasCompleteTurn.mockClear();

    expect(enumerateTurnPlans(state, "black").length).toBeGreaterThan(0);
    expect(searchHarness.hasCompleteTurn).not.toHaveBeenCalled();
  });

  it("keeps exhaustive no-turn adjudication for non-puzzle matches", () => {
    const state = createGame(1);
    state.phase = "play";

    gameReducer(state, { type: "load-game", state });

    expect(searchHarness.hasCompleteTurn).toHaveBeenCalledTimes(1);
  });
});
