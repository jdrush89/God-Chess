// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { isInCheck } from "../game/chess";
import { gameReducer } from "../game/engine";
import { PUZZLE_BY_ID } from "../game/puzzles";
import {
  createBlankCustomPuzzle,
  createCustomPuzzleGame,
  customPuzzleFingerprint,
  customPuzzleIsVerified,
  normalizeCustomPuzzleDraft,
  validateCustomPuzzle,
} from "./model";

describe("custom puzzle model", () => {
  it("creates a valid capture draft and converts it to a level 10 puzzle game", () => {
    const draft = createBlankCustomPuzzle();
    expect(validateCustomPuzzle(draft)).toEqual([]);

    const state = createCustomPuzzleGame(draft, "Athena");
    expect(state).toMatchObject({
      gameMode: "puzzle",
      phase: "play",
      activeColor: "white",
      aiColor: "black",
      aiDifficulty: 10,
      puzzlePlayerTurnsRemaining: 2,
    });
    expect(state.players.white.name).toBe("Athena");
    expect(state.board.e1).toMatchObject({
      type: "king",
      color: "white",
    });
  });

  it("requires exactly one King per side and a checked solver for escape puzzles", () => {
    const draft = createBlankCustomPuzzle();
    draft.objective = "escape-check";
    draft.turnLimit = 1;
    expect(validateCustomPuzzle(draft)).toContain(
      "The solver's King must begin in check.",
    );

    draft.board.e8 = {
      ...draft.board.e8,
      id: "black-rook-e8",
      type: "rook",
    };
    draft.board.a8 = {
      ...draft.board.e1,
      id: "black-king-a8",
      color: "black",
      controller: "black",
    };
    expect(isInCheck(draft.board, "white", [])).toBe(true);
    expect(validateCustomPuzzle(draft)).toEqual([]);

    const state = createCustomPuzzleGame(draft);
    expect(state.puzzleEscapeAny).toBe(true);
    expect(state.puzzlePlayerTurnsRemaining).toBe(1);
  });

  it("allows any legal completed divine turn to solve a custom escape puzzle", () => {
    const puzzle = PUZZLE_BY_ID["last-second-flight"];
    let state = puzzle.createState("Solver");
    state.puzzleEscapeAbilityId = undefined;
    state.puzzleEscapeAny = true;
    for (const action of puzzle.solutionTurns[0]) {
      state = gameReducer(state, action);
    }
    expect(state).toMatchObject({
      puzzleSolved: true,
      puzzleFailed: false,
    });
    expect(isInCheck(state.board, "white", state.bananas)).toBe(false);
  });

  it("rejects malformed local drafts and ties verification to exact content", () => {
    const draft = createBlankCustomPuzzle();
    draft.players.white.gods = ["ares", "ares", "chiron"];
    expect(normalizeCustomPuzzleDraft(draft)).toBeUndefined();

    const valid = createBlankCustomPuzzle();
    valid.verifiedFingerprint = customPuzzleFingerprint(valid);
    valid.verifiedTurnsUsed = 1;
    expect(customPuzzleIsVerified(valid)).toBe(true);

    valid.players.white.orbs.white += 1;
    expect(customPuzzleIsVerified(valid)).toBe(false);

    const duplicateIds = createBlankCustomPuzzle();
    duplicateIds.board.a1 = {
      ...duplicateIds.board.e1,
      color: "white",
      controller: "white",
    };
    expect(validateCustomPuzzle(duplicateIds)).toContain(
      "Every placed piece must have a unique ID.",
    );
  });
});
