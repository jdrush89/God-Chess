import { describe, expect, it } from "vitest";
import { chooseAiPlan, isAiTurn } from "./ai";
import { legalTargets } from "./chess";
import { gameReducer } from "./engine";
import { PUZZLES } from "./puzzles";

describe("puzzle mode", () => {
  it.each(PUZZLES)("$title has a legal one-turn winning solution", (puzzle) => {
    let state = puzzle.createState("Solver");

    expect(state.gameMode).toBe("puzzle");
    expect(state.aiDifficulty).toBe(10);
    expect(state.aiColor).toBe("black");
    expect(Object.keys(state.board).length).toBeGreaterThanOrEqual(16);

    const blackKingSquare = Object.entries(state.board).find(
      ([, piece]) => piece.type === "king" && piece.controller === "black",
    )?.[0];
    expect(blackKingSquare).toBeTruthy();
    for (const [square, piece] of Object.entries(state.board)) {
      if (piece.controller === "white") {
        expect(legalTargets(state.board, square)).not.toContain(blackKingSquare);
      }
    }

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
    state = gameReducer(state, { type: "square", square: "c3" });
    state = gameReducer(state, { type: "square", square: "d4" });

    expect(state.puzzleFailed).toBe(true);
    expect(isAiTurn(state)).toBe(true);
    expect(chooseAiPlan(state, () => 0).length).toBeGreaterThan(0);
  });
});
