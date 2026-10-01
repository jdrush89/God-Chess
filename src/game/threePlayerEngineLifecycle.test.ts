import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ThreePlayerSeat,
  ThreePlayerState,
} from "./threePlayerTypes";
import { GODS } from "./gods";

const mockedChess = vi.hoisted(() => ({
  mode: "normal" as
    | "normal"
    | "red-skip-once"
    | "all-stalemate"
    | "white-mated"
    | "white-and-red-mated",
}));

vi.mock("./threePlayerChess", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("./threePlayerChess")
  >();
  const legalMoves = (state: ThreePlayerState, seat: ThreePlayerSeat) => {
    if (mockedChess.mode === "all-stalemate") return [];
    if (
      (mockedChess.mode === "white-mated" ||
        mockedChess.mode === "white-and-red-mated") &&
      seat === "white"
    ) return [];
    if (mockedChess.mode === "white-and-red-mated" && seat === "red") return [];
    if (
      mockedChess.mode === "red-skip-once" &&
      seat === "red" &&
      state.positionRevision < 3
    ) return [];
    const from = Object.entries(state.board).find(
      ([, candidate]) => candidate.controller === seat,
    )?.[0];
    return from
      ? [{ from, to: `${seat}-target-${state.positionRevision}` }]
      : [];
  };
  return {
    ...actual,
    createThreePlayerInitialCastlingRights: () => ({
      white: { king: false, queen: false },
      red: { king: false, queen: false },
      black: { king: false, queen: false },
    }),
    threePlayerLegalMoves: legalMoves,
    threePlayerIsInCheck: (_state: ThreePlayerState, seat: ThreePlayerSeat) =>
      (
        (mockedChess.mode === "white-mated" ||
          mockedChess.mode === "white-and-red-mated") &&
        seat === "white"
      ) ||
      (mockedChess.mode === "white-and-red-mated" && seat === "red"),
    threePlayerCheckingSeats: (
      _state: ThreePlayerState,
      seat: ThreePlayerSeat,
    ) => {
      if (
        (mockedChess.mode === "white-mated" ||
          mockedChess.mode === "white-and-red-mated") &&
        seat === "white"
      ) return ["red", "black"];
      if (mockedChess.mode === "white-and-red-mated" && seat === "red") {
        return ["black"];
      }
      return [];
    },
    threePlayerKingCell: (
      state: ThreePlayerState,
      seat: ThreePlayerSeat,
    ) => Object.entries(state.board).find(
      ([, candidate]) =>
        candidate.owner === seat && candidate.type === "king",
    )?.[0],
    threePlayerApplyMove: (
      state: ThreePlayerState,
      move: { from: string; to: string },
    ) => {
      const board = structuredClone(state.board);
      board[move.to] = { ...board[move.from], hasMoved: true };
      delete board[move.from];
      return {
        board,
        castlingRights: structuredClone(state.castlingRights),
        enPassant: undefined,
      };
    },
  };
});

import { threePlayerPieceAffinity } from "./threePlayerConfig";
import {
  createThreePlayerGame,
  resolveThreePlayerTurnStart,
  threePlayerReducer,
} from "./threePlayerEngine";

const finishDraft = (
  state = createThreePlayerGame(),
) => GODS.slice(0, 9).reduce((current, god, index) => {
  if (index === 8 && mockedChess.mode !== "normal") {
    const seats = mockedChess.mode === "all-stalemate"
      ? ["white", "red", "black"] as const
      : mockedChess.mode === "white-and-red-mated"
        ? ["white", "red"] as const
        : mockedChess.mode === "white-mated"
          ? ["white"] as const
          : ["red"] as const;
    current.rested = seats.flatMap((seat) => [
      ...current.players[seat].gods,
      ...(seat === current.activeSeat ? [god.id] : []),
    ]);
  }
  return threePlayerReducer(current, { type: "draft", godId: god.id });
}, state);

const playLegacyMove = (state: ThreePlayerState) => {
  const from = Object.entries(state.board).find(
    ([, piece]) => piece.controller === state.activeSeat,
  )?.[0]!;
  return threePlayerReducer(state, {
    type: "move",
    from,
    to: `${state.activeSeat}-target-${state.positionRevision}`,
  });
};

beforeEach(() => {
  mockedChess.mode = "normal";
});

describe("three-player turn-start resolution", () => {
  it("skips a stalemated Red seat without toggling affinity and retries later", () => {
    mockedChess.mode = "red-skip-once";
    let state = finishDraft();
    const turnBeforeSkip = state.turn;

    state = playLegacyMove(state);
    expect(state.activeSeat).toBe("black");
    expect(state.turn).toBe(turnBeforeSkip + 2);
    expect(state.completedTurns.red).toBe(0);
    const redPiece = Object.values(state.board).find(
      (candidate) => candidate.owner === "red",
    )!;
    expect(threePlayerPieceAffinity(state, redPiece)).toBe("light");

    state = playLegacyMove(state);
    expect(state.activeSeat).toBe("white");
    state.rested = state.rested.filter((godId) =>
      !state.players.red.gods.includes(godId)
    );
    state = playLegacyMove(state);
    expect(state.activeSeat).toBe("red");
    expect(state.passCycle.passedSeats).toEqual([]);

    state = playLegacyMove(state);
    expect(state.completedTurns.red).toBe(1);
    expect(threePlayerPieceAffinity(state, redPiece)).toBe("dark");
  });

  it("draws after a full unchanged-position cycle of stalemates", () => {
    mockedChess.mode = "all-stalemate";
    const state = finishDraft();
    expect(state.phase).toBe("gameover");
    expect(state.result).toEqual({
      kind: "draw",
      reason: "stalemate-cycle",
    });
    expect(state.completedTurns.red).toBe(0);
    expect(state.passCycle.passedSeats).toEqual(["white", "red", "black"]);
  });

  it("credits the most recently recorded current attacker and takes over pieces", () => {
    mockedChess.mode = "white-mated";
    const config = createThreePlayerGame().config;
    config.takeover = true;
    const state = finishDraft(createThreePlayerGame(config));
    expect(state.players.white.eliminated).toBe(true);
    expect(state.players.white.eliminatedBy).toBe("black");
    expect(Object.values(state.board)
      .filter((piece) => piece.owner === "white")
      .every((piece) => piece.controller === "black")).toBe(true);
    expect(state.activeSeat).toBe("red");
    expect(state.result).toBeUndefined();
  });

  it("ends first-checkmate mode only for checkmate and skips stalemates", () => {
    const mateConfig = createThreePlayerGame().config;
    mateConfig.victoryMode = "first-checkmate";
    mockedChess.mode = "white-mated";
    expect(finishDraft(createThreePlayerGame(mateConfig)).result).toEqual({
      kind: "winner",
      seat: "black",
      reason: "first-checkmate",
    });

    const stalemateConfig = createThreePlayerGame().config;
    stalemateConfig.victoryMode = "first-checkmate";
    mockedChess.mode = "all-stalemate";
    expect(finishDraft(createThreePlayerGame(stalemateConfig)).result).toEqual({
      kind: "draw",
      reason: "stalemate-cycle",
    });
  });

  it("continues through chained eliminations to a last-survivor victory", () => {
    mockedChess.mode = "white-and-red-mated";
    const state = finishDraft();
    expect(state.players.white.eliminated).toBe(true);
    expect(state.players.red.eliminated).toBe(true);
    expect(state.result).toEqual({
      kind: "winner",
      seat: "black",
      reason: "last-survivor",
    });
  });

  it("resolves checkmate before exposing the first turn of a new round", () => {
    let state = finishDraft();
    state.phase = "upgrade";
    state.upgradeQueue = ["white"];
    state.activeSeat = "white";
    const abilityId = GODS.find((god) =>
      state.players.white.gods.includes(god.id)
    )!.abilities[0].id;
    mockedChess.mode = "white-mated";
    state.rested = [...state.players.white.gods];

    state = threePlayerReducer(state, { type: "upgrade", abilityId });

    expect(state.players.white.eliminated).toBe(true);
    expect(state.activeSeat).toBe("red");
    expect(state.phase).toBe("play");
    expect(state.pending).toBeUndefined();
  });

  it("records a full stalemate cycle when a new round cannot begin", () => {
    let state = finishDraft();
    state.phase = "upgrade";
    state.upgradeQueue = ["white"];
    state.activeSeat = "white";
    const abilityId = GODS.find((god) =>
      state.players.white.gods.includes(god.id)
    )!.abilities[0].id;
    mockedChess.mode = "all-stalemate";

    state = threePlayerReducer(state, { type: "upgrade", abilityId });
    state.rested = Object.values(state.players)
      .flatMap((player) => player.gods);
    resolveThreePlayerTurnStart(state);

    expect(state.result).toEqual({
      kind: "draw",
      reason: "stalemate-cycle",
    });
    expect(state.passCycle.passedSeats).toEqual(["white", "red", "black"]);
  });
});
