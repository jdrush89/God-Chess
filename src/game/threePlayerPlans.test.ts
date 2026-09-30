import { describe, expect, it } from "vitest";
import { createDefaultThreePlayerConfig } from "./threePlayerConfig";
import {
  createThreePlayerGame,
  threePlayerReducer,
} from "./threePlayerEngine";
import {
  enumerateCompleteThreePlayerPlans,
  isCompleteThreePlayerPlan,
} from "./threePlayerPlans";
import { GODS } from "./gods";

const finishDraft = (state: ReturnType<typeof createThreePlayerGame>) =>
  GODS.slice(0, 9).reduce(
    (current, god) =>
      threePlayerReducer(current, { type: "draft", godId: god.id }),
    state,
  );

describe("three-player complete plans", () => {
  it("returns progressing, reducer-legal plans on every topology", () => {
    for (const boardVariant of [
      "three-player",
      "three-hexagonal",
      "triad",
      "three-circular",
      "three-half",
    ] as const) {
      const config = createDefaultThreePlayerConfig();
      config.boardVariant = boardVariant;
      const state = finishDraft(createThreePlayerGame(config));
      const plans = enumerateCompleteThreePlayerPlans(state, {
        maxPlans: 6,
        maxStates: 8_000,
      });
      expect(plans.length).toBeGreaterThan(0);
      for (const plan of plans) {
        let replay = state;
        for (const action of plan.actions) {
          const next = threePlayerReducer(replay, action);
          expect(next).not.toBe(replay);
          replay = next;
        }
        expect(isCompleteThreePlayerPlan(state, replay)).toBe(true);
      }
    }
  });
});

