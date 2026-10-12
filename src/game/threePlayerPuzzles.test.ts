import { describe, expect, it } from "vitest";
import {
  threePlayerIsInCheck,
} from "./threePlayerChess";
import { threePlayerReducer } from "./threePlayerEngine";
import {
  THREE_PLAYER_BOARD_VARIANTS,
  THREE_PLAYER_SEATS,
} from "./threePlayerTypes";
import {
  THREE_PLAYER_PUZZLES,
} from "./threePlayerPuzzles";

describe("three-player puzzles", () => {
  it("includes ten positions with two on every board variant", () => {
    expect(THREE_PLAYER_PUZZLES).toHaveLength(10);
    for (const variant of THREE_PLAYER_BOARD_VARIANTS) {
      expect(
        THREE_PLAYER_PUZZLES.filter(
          (puzzle) => puzzle.boardVariant === variant,
        ),
      ).toHaveLength(2);
    }
  });

  it("starts every position safe, unique, and free of artificial statuses", () => {
    const signatures = new Set<string>();
    for (const puzzle of THREE_PLAYER_PUZZLES) {
      const state = puzzle.createState();
      expect(state.config.victoryMode).toBe("last-survivor");
      expect(state.activeSeat).toBe("white");
      expect(state.phase).toBe("play");
      expect(Object.values(state.board).some((piece) =>
        piece.status.frozen ||
        piece.status.frozenBy ||
        piece.status.gazing ||
        piece.status.stunned
      )).toBe(false);
      for (const seat of THREE_PLAYER_SEATS) {
        expect(threePlayerIsInCheck(state, seat)).toBe(false);
      }
      const signature = Object.entries(state.board)
        .map(([cell, piece]) => `${cell}:${piece.owner}:${piece.type}`)
        .sort()
        .join("|");
      expect(signatures.has(signature)).toBe(false);
      signatures.add(signature);
    }
  });

  it("checkmates one rival per documented turn and wins on turn two", () => {
    for (const puzzle of THREE_PLAYER_PUZZLES) {
      let state = puzzle.createState();
      state = puzzle.solutionTurns[0].reduce(threePlayerReducer, state);
      expect(state.players.red.eliminated, puzzle.id).toBe(true);
      expect(state.players.black.eliminated, puzzle.id).toBe(false);
      expect(state.activeSeat, puzzle.id).toBe("white");
      expect(state.completedTurns.white, puzzle.id).toBe(1);
      expect(state.result, puzzle.id).toBeUndefined();

      state = puzzle.solutionTurns[1].reduce(threePlayerReducer, state);
      expect(state.players.red.eliminated, puzzle.id).toBe(true);
      expect(state.players.black.eliminated, puzzle.id).toBe(true);
      expect(state.completedTurns.white, puzzle.id).toBe(2);
      expect(state.result, puzzle.id).toEqual({
        kind: "winner",
        seat: "white",
        reason: "last-survivor",
      });
    }
  });
});
