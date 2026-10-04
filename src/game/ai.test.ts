import { describe, expect, it } from "vitest";
import { chooseAiPlan, enumerateTurnPlans, evaluateGameState } from "./ai";
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

  it("enumerates the committed Enchant follow-up without another God or ability choice", () => {
    let state = createGame(2, { mode: "ai", aiDifficulty: 10 });
    state.phase = "play";
    state.activeColor = "white";
    state.players.white.gods = ["teles"];
    state.players.black.gods = ["ares"];
    state.players.white.orbs.black = 4;
    state = gameReducer(state, { type: "select-god", godId: "teles" });
    state = gameReducer(state, { type: "select-ability", abilityId: "enchant" });
    state = gameReducer(state, { type: "square", square: "b8" });
    state = gameReducer(state, { type: "square", square: "c6" });

    expect(state.pending?.step).toBe("enchant-followup-move");
    const plan = chooseAiPlan(state, () => 0);
    expect(plan.length).toBeGreaterThanOrEqual(2);
    expect(plan.some((action) =>
      action.type === "select-god" || action.type === "select-ability"
    )).toBe(false);
    for (const action of plan) state = gameReducer(state, action);
    expect(state.activeColor).toBe("black");
    expect(state.pending).toBeUndefined();
  });

  it("finishes every committed Mount plan without chaining a second God or ability", () => {
    let state = createGame(2, { mode: "ai", aiDifficulty: 10 });
    state.phase = "play";
    state.activeColor = "black";
    state.players.black.gods = ["chiron", "kangus"];
    state.players.black.orbs.white = 1;
    state = gameReducer(state, { type: "select-god", godId: "chiron" });
    state = gameReducer(state, { type: "select-ability", abilityId: "mount" });
    state = gameReducer(state, { type: "square", square: "b8" });
    state = gameReducer(state, { type: "square", square: "c6" });

    const plans = enumerateTurnPlans(state);
    expect(plans.length).toBeGreaterThan(0);
    expect(plans.some((plan) => plan.actions.at(-1)?.type === "pass")).toBe(true);
    expect(plans.every((plan) =>
      plan.actions.every((action) =>
        action.type !== "select-god" &&
        action.type !== "select-ability" &&
        action.type !== "clear-god" &&
        action.type !== "cancel"
      )
    )).toBe(true);
    expect(plans.every((plan) =>
      plan.state.turn > state.turn &&
      plan.state.activeColor === "white" &&
      plan.state.pending === undefined
    )).toBe(true);

    const chosen = chooseAiPlan(state, () => 0);
    expect(chosen.some((action) =>
      action.type === "select-god" || action.type === "select-ability"
    )).toBe(false);
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
      delete state.board.b4;

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
    for (const piece of Object.values(state.board)) {
      if (piece.controller === "black" && piece.type !== "king") {
        piece.status.movedThisTurn = true;
      }
    }

    const response = chooseAiPlan(state, () => 0);
    for (const action of response) state = gameReducer(state, action);

    expect(state.board.h8).toMatchObject({ type: "king", controller: "black" });
    expect(state.board.h7?.type).not.toBe("king");
  });

  it("moves the King away from an imminent legal Air Strike capture", () => {
    const puzzle = PUZZLE_BY_ID["funded-flight"];
    let state = puzzle.createState();
    for (const action of puzzle.solutionTurns[0]) state = gameReducer(state, action);
    delete state.board.f8;
    delete state.board.b4;

    const response = chooseAiPlan(state, () => 0);
    for (const action of response) state = gameReducer(state, action);

    expect(state.board.f8).toMatchObject({ type: "king", controller: "black" });
    expect(state.board.f7?.type).not.toBe("king");
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
