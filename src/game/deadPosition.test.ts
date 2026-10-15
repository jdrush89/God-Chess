import { describe, expect, it } from "vitest";
import { createGame, gameReducer } from "./engine";
import { isClassicDeadPosition } from "./deadPosition";
import type { Color, GameState, Piece, PieceType } from "./types";

const piece = (
  type: PieceType,
  color: Color,
  id: string,
): Piece => ({
  id,
  type,
  color,
  controller: color,
  hasMoved: false,
  status: {},
});

const position = (
  board: GameState["board"],
) => {
  const state = createGame(1);
  state.phase = "play";
  state.board = board;
  state.players.white.gods = [];
  state.players.black.gods = [];
  state.players.white.graveyard = [];
  state.players.black.graveyard = [];
  return state;
};

describe("classic dead positions", () => {
  it.each<{ name: string; board: GameState["board"] }>([
    {
      name: "King versus King",
      board: {
        a1: piece("king", "white", "white-king"),
        h8: piece("king", "black", "black-king"),
      },
    },
    {
      name: "King and Bishop versus King",
      board: {
        a1: piece("king", "white", "white-king"),
        c1: piece("bishop", "white", "white-bishop"),
        h8: piece("king", "black", "black-king"),
      },
    },
    {
      name: "King and Knight versus King",
      board: {
        a1: piece("king", "white", "white-king"),
        b1: piece("knight", "white", "white-knight"),
        h8: piece("king", "black", "black-king"),
      },
    },
    {
      name: "same-color Bishops",
      board: {
        a1: piece("king", "white", "white-king"),
        c1: piece("bishop", "white", "white-bishop"),
        h8: piece("king", "black", "black-king"),
        f8: piece("bishop", "black", "black-bishop"),
      },
    },
  ])(
    "detects $name",
    ({ board }) => {
      expect(isClassicDeadPosition(position(board))).toBe(true);
    },
  );

  it("keeps opposite-color Bishops playable", () => {
    const state = position({
      a1: piece("king", "white", "white-king"),
      c1: piece("bishop", "white", "white-bishop"),
      h8: piece("king", "black", "black-king"),
      c8: piece("bishop", "black", "black-bishop"),
    });

    expect(isClassicDeadPosition(state)).toBe(false);
  });

  it.each(["ares", "leonidas", "salem"] as const)(
    "keeps same-color Bishops playable when %s can change their square-color relationship",
    (godId) => {
      const state = position({
        a1: piece("king", "white", "white-king"),
        c1: piece("bishop", "white", "white-bishop"),
        h8: piece("king", "black", "black-king"),
        f8: piece("bishop", "black", "black-bishop"),
      });
      state.players.white.gods = [godId];

      expect(isClassicDeadPosition(state)).toBe(false);
    },
  );

  it("keeps a lone Knight playable when its controller has Chiron", () => {
    const state = position({
      a1: piece("king", "white", "white-king"),
      b1: piece("knight", "white", "white-knight"),
      h8: piece("king", "black", "black-king"),
    });
    state.players.white.gods = ["chiron"];

    expect(isClassicDeadPosition(state)).toBe(false);
  });

  it("keeps a lone Bishop playable when Death can resurrect material", () => {
    const state = position({
      a1: piece("king", "white", "white-king"),
      c1: piece("bishop", "white", "white-bishop"),
      h8: piece("king", "black", "black-king"),
    });
    state.players.white.gods = ["death"];
    state.players.white.graveyard = [{
      piece: piece("rook", "white", "captured-rook"),
      capturedOnTurn: 4,
    }];

    expect(isClassicDeadPosition(state)).toBe(false);
  });

  it("still detects a lone Bishop when Death has nothing to resurrect", () => {
    const state = position({
      a1: piece("king", "white", "white-king"),
      c1: piece("bishop", "white", "white-bishop"),
      h8: piece("king", "black", "black-king"),
    });
    state.players.white.gods = ["death"];

    expect(isClassicDeadPosition(state)).toBe(true);
  });

  it("adjudicates a dead loaded position as a stalemate draw", () => {
    const state = position({
      a1: piece("king", "white", "white-king"),
      h8: piece("king", "black", "black-king"),
    });

    const next = gameReducer(createGame(1), {
      type: "load-game",
      state,
    });

    expect(next).toMatchObject({
      phase: "gameover",
      result: {
        kind: "draw",
        reason: "stalemate",
      },
    });
    expect(next.notice).toMatch(/dead from insufficient material/i);
  });
});
