import { describe, expect, it } from "vitest";
import {
  threePlayerIsInCheck,
  threePlayerLegalMoves,
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
      const draftedGods = THREE_PLAYER_SEATS.flatMap(
        (seat) => state.players[seat].gods,
      );
      expect(draftedGods).toHaveLength(9);
      expect(new Set(draftedGods)).toHaveLength(9);
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

  it("recognizes the red pawn capture that answers a knight check on White f3", () => {
    const state = THREE_PLAYER_PUZZLES[0].createState();
    delete state.board["three-player:4"];
    state.board["three-player:13"] = {
      id: "checking-knight",
      type: "knight",
      owner: "white",
      controller: "white",
      hasMoved: true,
      status: {},
    };
    state.board["three-player:6"] = {
      id: "red-answering-pawn",
      type: "pawn",
      owner: "red",
      controller: "red",
      hasMoved: true,
      status: {},
    };
    state.activeSeat = "red";

    expect(
      threePlayerLegalMoves(state, "red").some(
        (move) =>
          move.from === "three-player:6" &&
          move.to === "three-player:13",
      ),
    ).toBe(true);
  });

  it("allows a CPU turn between documented player turns and wins on turn two", () => {
    for (const puzzle of THREE_PLAYER_PUZZLES) {
      let state = puzzle.createState();
      state = puzzle.solutionTurns[0].reduce(threePlayerReducer, state);
      expect(state.players.red.eliminated, puzzle.id).toBe(true);
      expect(state.players.black.eliminated, puzzle.id).toBe(false);
      expect(state.activeSeat, puzzle.id).toBe("black");
      expect(state.completedTurns.white, puzzle.id).toBe(1);
      expect(state.result, puzzle.id).toBeUndefined();

      const cpuTurn = puzzle.cpuTurns[0];
      state = cpuTurn.reduce(threePlayerReducer, state);
      expect(state.completedTurns.black, puzzle.id).toBe(1);
      expect(state.activeSeat, puzzle.id).toBe("white");

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
