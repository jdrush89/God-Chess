import { describe, expect, it } from "vitest";
import { createDefaultThreePlayerConfig } from "./threePlayerConfig";
import { chooseThreePlayerAiPlan } from "./threePlayerAi";
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
});
