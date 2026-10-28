import { describe, expect, it } from "vitest";
import { createDefaultThreePlayerConfig } from "./threePlayerConfig";
import {
  chooseThreePlayerAiPlan,
  evaluateThreePlayerState,
} from "./threePlayerAi";
import {
  createThreePlayerGame,
  threePlayerReducer,
} from "./threePlayerEngine";
import { isCompleteThreePlayerPlan } from "./threePlayerPlans";
import { GODS } from "./gods";

describe("three-player AI", () => {
  it("is deterministic for an injected seed and returns legal complete plans", () => {
    for (const boardVariant of [
      "three-player",
      "three-hexagonal",
      "triad",
      "three-circular",
      "three-half",
    ] as const) {
      const config = createDefaultThreePlayerConfig();
      config.boardVariant = boardVariant;
      config.seats.white.control = { kind: "ai", difficulty: 4 };
      const state = createThreePlayerGame(config);
      const first = chooseThreePlayerAiPlan(state, 12345);
      const second = chooseThreePlayerAiPlan(state, 12345);
      expect(first).toEqual(second);
      expect(first.length).toBeGreaterThan(0);
      const result = first.reduce(threePlayerReducer, state);
      expect(isCompleteThreePlayerPlan(state, result)).toBe(true);
    }
  });

  it.each([1, 5, 10])(
    "supports difficulty %i",
    (difficulty) => {
      const config = createDefaultThreePlayerConfig();
      config.seats.white.control = { kind: "ai", difficulty };
      const state = createThreePlayerGame(config);
      expect(chooseThreePlayerAiPlan(state, () => 0.5).length)
        .toBeGreaterThan(0);
    },
  );

  it("chooses the final draft God without enumerating live play", () => {
    const config = createDefaultThreePlayerConfig();
    config.boardVariant = "three-hexagonal";
    config.seats.black.control = { kind: "ai", difficulty: 10 };
    let state = createThreePlayerGame(config);
    for (const god of GODS.slice(0, 8)) {
      state = threePlayerReducer(state, { type: "draft", godId: god.id });
    }
    const [cell, piece] = Object.entries(state.board)[0];
    let boardCloneCount = 0;
    Object.defineProperty(state.board, cell, {
      configurable: true,
      enumerable: true,
      get() {
        boardCloneCount += 1;
        if (boardCloneCount > 1) {
          throw new Error("Draft planning continued into live play.");
        }
        return piece;
      },
    });

    expect(chooseThreePlayerAiPlan(state, 42)).toEqual([
      { type: "draft", godId: "ares" },
    ]);
    expect(boardCloneCount).toBe(1);
  });

  it("plays a complete legal turn on every topology", () => {
    for (const boardVariant of [
      "three-player",
      "three-hexagonal",
      "triad",
      "three-circular",
      "three-half",
    ] as const) {
      const config = createDefaultThreePlayerConfig();
      config.boardVariant = boardVariant;
      config.seats.white.control = { kind: "ai", difficulty: 1 };
      let state = createThreePlayerGame(config);
      state = GODS.slice(0, 9).reduce(
        (current, god) =>
          threePlayerReducer(current, { type: "draft", godId: god.id }),
        state,
      );
      const actions = chooseThreePlayerAiPlan(state, 99);
      expect(actions.length).toBeGreaterThan(0);
      let result = state;
      for (const action of actions) {
        const next = threePlayerReducer(result, action);
        expect(next).not.toBe(result);
        result = next;
      }
      expect(isCompleteThreePlayerPlan(state, result)).toBe(true);
    }
  });

  it("plans both CPU opening turns promptly in the reported three-player position", () => {
    const config = createDefaultThreePlayerConfig();
    config.seats.red.control = { kind: "ai", difficulty: 5 };
    config.seats.black.control = { kind: "ai", difficulty: 5 };
    let state = createThreePlayerGame(config);
    for (
      const godId of [
        "anubis",
        "leonidas",
        "medusa",
        "death",
        "midas",
        "salem",
        "kangus",
        "quetzacoatl",
        "chiron",
      ] as const
    ) {
      state = threePlayerReducer(state, { type: "draft", godId });
    }
    for (
      const action of [
        { type: "select-god", godId: "anubis" },
        { type: "select-ability", abilityId: "construction" },
        { type: "cell", cell: "three-player:19" },
        { type: "cell", cell: "three-player:11" },
      ] as const
    ) {
      state = threePlayerReducer(state, action);
    }

    const startedAt = Date.now();
    for (const seed of [123, 456]) {
      const before = state;
      const plan = chooseThreePlayerAiPlan(state, seed);
      expect(plan.length).toBeGreaterThan(0);
      state = plan.reduce(threePlayerReducer, state);
      expect(isCompleteThreePlayerPlan(before, state)).toBe(true);
    }

    expect(Date.now() - startedAt).toBeLessThan(8_000);
    expect(state.activeSeat).toBe("white");
    expect(state.turn).toBe(4);
  }, 25_000);

  it("values an allied challenge victory as its own", () => {
    const config = createDefaultThreePlayerConfig();
    config.teams = {
      white: "player",
      red: "allied-ai",
      black: "allied-ai",
    };
    const state = createThreePlayerGame(config);
    state.phase = "gameover";
    state.result = {
      kind: "winner",
      seat: "red",
      reason: "last-survivor",
    };

    expect(evaluateThreePlayerState(state, "black")).toBe(1_000_000);
    expect(evaluateThreePlayerState(state, "white")).toBe(-1_000_000);
  });
});
