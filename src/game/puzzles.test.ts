import { describe, expect, it } from "vitest";
import { chooseAiPlan, isAiTurn } from "./ai";
import { gameReducer } from "./engine";
import { PUZZLES } from "./puzzles";

describe("puzzle mode", () => {
  it.each(PUZZLES)("$title has a legal one-turn winning solution", (puzzle) => {
    let state = puzzle.createState("Solver");

    expect(state.gameMode).toBe("puzzle");
    expect(state.aiDifficulty).toBe(10);
    expect(state.aiColor).toBe("black");

    for (const action of puzzle.solution) state = gameReducer(state, action);

    expect(state.phase).toBe("gameover");
    expect(state.winner).toBe("white");
    expect(state.puzzleFailed).toBe(false);
  });

  it("marks a missed one-turn solution and gives the level 10 AI a response", () => {
    const puzzle = PUZZLES[0];
    let state = puzzle.createState("Solver");
    state = gameReducer(state, { type: "select-god", godId: "teles" });
    state = gameReducer(state, { type: "select-ability", abilityId: "resonance" });
    state = gameReducer(state, { type: "square", square: "a1" });
    state = gameReducer(state, { type: "square", square: "b1" });

    expect(state.puzzleFailed).toBe(true);
    expect(isAiTurn(state)).toBe(true);
    expect(chooseAiPlan(state, () => 0).length).toBeGreaterThan(0);
  });
});
