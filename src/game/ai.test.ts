import { describe, expect, it } from "vitest";
import { chooseAiPlan } from "./ai";
import { createGame, gameReducer } from "./engine";

describe("Divine AI", () => {
  it("always chooses its highest-scoring draft pick at difficulty 10", () => {
    const state = createGame(2, { mode: "ai", aiDifficulty: 10 });
    expect(chooseAiPlan(state, () => 0.99)).toEqual([
      { type: "draft", godId: "quetzacoatl" },
    ]);
  });

  it("uses the difficulty as the chance to choose the optimal plan", () => {
    const state = createGame(2, { mode: "ai", aiDifficulty: 1 });
    const randomValues = [0.5, 0];
    const plan = chooseAiPlan(state, () => randomValues.shift() ?? 0);
    expect(plan[0]).not.toEqual({ type: "draft", godId: "quetzacoatl" });
  });

  it("builds a complete legal divine turn through reducer actions", () => {
    let state = createGame(2, { mode: "ai", aiDifficulty: 10 });
    (["ares", "medusa", "midas", "death", "artemis", "chiron"] as const).forEach((godId) => {
      state = gameReducer(state, { type: "draft", godId });
    });
    const initialTurn = state.turn;
    const plan = chooseAiPlan(state, () => 0);
    expect(plan.length).toBeGreaterThanOrEqual(3);
    for (const action of plan) state = gameReducer(state, action);
    expect(state.turn).toBeGreaterThan(initialTurn);
    expect(state.activeColor).toBe("black");
  });
});
