import { describe, expect, it } from "vitest";
import { chooseAiPlan, evaluateGameState } from "./ai";
import { createGame, gameReducer } from "./engine";
import { PUZZLE_BY_ID } from "./puzzles";
import type { Piece, PieceType } from "./types";

const piece = (type: PieceType, controller: "white" | "black", id: string): Piece => ({
  id,
  type,
  color: controller,
  controller,
  hasMoved: true,
  status: {},
});

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

  it("confirms an instant ability after its affected pieces are previewed", () => {
    let state = createGame(2, { mode: "ai", aiDifficulty: 10 });
    state.phase = "play";
    state.activeColor = "white";
    state.players.white.gods = ["medusa"];
    state.players.white.orbs.black = 3;

    state = gameReducer(state, { type: "select-god", godId: "medusa" });
    state = gameReducer(state, { type: "select-ability", abilityId: "stone-gaze" });

    expect(state.pending?.step).toBe("confirm-stone-gaze");
    expect(chooseAiPlan(state, () => 0)).toEqual([{ type: "confirm-ability" }]);
  });

  it("strongly prefers a defended piece over the same piece left hanging", () => {
    const hanging = createGame(1);
    hanging.phase = "play";
    hanging.board = {
      a1: piece("king", "white", "white-king"),
      d4: piece("knight", "white", "white-knight"),
      a2: piece("pawn", "white", "white-pawn"),
      h8: piece("king", "black", "black-king"),
      d8: piece("rook", "black", "black-rook"),
    };
    const defended = structuredClone(hanging);
    delete defended.board.a2;
    defended.board.c3 = piece("pawn", "white", "white-pawn");

    expect(evaluateGameState(defended, "white"))
      .toBeGreaterThan(evaluateGameState(hanging, "white") + 5);
  });

  it("does not use Pick a Fight to hang a knight for a single attack", () => {
    const state = createGame(2, { mode: "ai", aiDifficulty: 10 });
    state.phase = "play";
    state.activeColor = "white";
    state.players.white.gods = ["ares"];
    state.players.white.orbs = { white: 2, black: 0 };
    state.players.black.gods = ["medusa"];
    state.rested = [];
    state.board = {
      a1: piece("king", "white", "white-king"),
      b1: piece("knight", "white", "white-knight"),
      h8: piece("king", "black", "black-king"),
      d8: piece("rook", "black", "black-rook"),
      e4: piece("queen", "black", "black-queen"),
    };

    const plan = chooseAiPlan(state, () => 0);

    expect(plan).toContainEqual({ type: "select-ability", abilityId: "threaten" });
    expect(plan).not.toContainEqual({ type: "select-ability", abilityId: "pick-a-fight" });
  });

  it.each(["turncoat-charge", "cleared-lane"] as const)(
    "moves the King away from an incoming Charge in the %s pattern",
    (puzzleId) => {
      const puzzle = PUZZLE_BY_ID[puzzleId];
      let state = puzzle.createState();
      for (const action of puzzle.solutionTurns[0]) state = gameReducer(state, action);
      delete state.board.f8;

      const response = chooseAiPlan(state, () => 0);
      for (const action of response) state = gameReducer(state, action);

      expect(state.board.f8).toMatchObject({ type: "king", controller: "black" });
      expect(state.board.e8?.type).not.toBe("king");
    },
  );

  it("takes the available backward King escape in the Position Thirteen pattern", () => {
    const puzzle = PUZZLE_BY_ID["royal-landing"];
    let state = puzzle.createState();
    for (const action of puzzle.solutionTurns[0]) state = gameReducer(state, action);
    delete state.board.h8;

    const response = chooseAiPlan(state, () => 0);
    for (const action of response) state = gameReducer(state, action);

    expect(state.board.h8).toMatchObject({ type: "king", controller: "black" });
    expect(state.board.h7?.type).not.toBe("king");
  });

  it("captures the hanging Pick a Fight knight when the apparent defender is unpinned", () => {
    const puzzle = PUZZLE_BY_ID["provoked-fury"];
    let state = puzzle.createState();
    for (const action of puzzle.solutionTurns[0]) state = gameReducer(state, action);
    delete state.board.e6;

    const response = chooseAiPlan(state, () => 0);
    for (const action of response) state = gameReducer(state, action);

    expect(state.board.g6).toMatchObject({ id: "black-provoker", controller: "black" });
    expect(Object.values(state.board).some((candidate) => candidate.id === "white-provoked-knight"))
      .toBe(false);
  });
});
