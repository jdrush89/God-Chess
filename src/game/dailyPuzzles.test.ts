import { describe, expect, it } from "vitest";
import { chooseAiPlan } from "./ai";
import {
  currentDailyPuzzle,
  DAILY_PUZZLES,
  dailyPuzzleResultMatches,
} from "./dailyPuzzles";
import { gameReducer } from "./engine";

describe("daily puzzles", () => {
  it("loads the generated checkpoint as a four-turn White puzzle", () => {
    const puzzle = currentDailyPuzzle(new Date("2026-10-14T12:00:00"));
    expect(DAILY_PUZZLES.length).toBeGreaterThanOrEqual(1);
    expect(puzzle).toMatchObject({
      id: "daily-2026-10-14",
      playerColor: "white",
      playerTurns: 4,
      targetResult: {
        kind: "winner",
        winner: "white",
        reason: "checkmate",
      },
    });

    const state = puzzle!.createState("Daily Solver");
    expect(state).toMatchObject({
      gameMode: "puzzle",
      phase: "play",
      activeColor: "white",
      aiColor: "black",
      puzzleId: "daily-2026-10-14",
      puzzlePlayerTurnsRemaining: 4,
      puzzleFailed: false,
    });
    expect(state.players.white.name).toBe("Daily Solver");
    expect(state.players.black.name).toBe("Black Level 10 CPU");
    expect(Object.keys(state.board)).toHaveLength(6);
    expect(state.history.some((entry) => /simulation/i.test(entry))).toBe(false);
    expect(puzzle?.hint).not.toMatch(/simulation/i);
    expect(puzzle?.hint).toMatch(
      /^Start by moving a (king|queen|rook|bishop|knight|pawn)\./,
    );
    expect(puzzle?.abilityHint).toMatch(
      /^The winning CPU line used .+\.$/,
    );
    expect(puzzle?.completionText).toBe("Puzzle complete.");
  });

  it("stores a target checkmate within the generated turn limit", () => {
    const puzzle = DAILY_PUZZLES.at(-1)!;
    let state = puzzle.createState();
    let completedPlayerTurns = 0;

    for (const action of puzzle.solutionActions) {
      const before = state;
      state = gameReducer(state, action);
      if (
        before.phase === "play" &&
        before.activeColor === puzzle.playerColor &&
        (
          state.turn !== before.turn ||
          state.phase === "upgrade" ||
          state.phase === "gameover"
        )
      ) {
        completedPlayerTurns += 1;
      }
    }

    expect(dailyPuzzleResultMatches(puzzle, state)).toBe(true);
    expect(completedPlayerTurns).toBe(puzzle.playerTurns);
  });

  it("replays the stored simulation solution to the target result", () => {
    for (const puzzle of DAILY_PUZZLES) {
      let state = puzzle.createState();
      expect(puzzle.solutionActions.length).toBeGreaterThan(0);
      for (const action of puzzle.solutionActions) {
        state = gameReducer(state, action);
      }
      expect(
        dailyPuzzleResultMatches(puzzle, state),
        JSON.stringify({ puzzle: puzzle.id, result: state.result }),
      ).toBe(true);
    }
  });

  it("requires four player turns along the stored winning line", () => {
    const puzzle = DAILY_PUZZLES[0];
    let state = puzzle.createState();

    let completedPlayerTurns = 0;
    for (const action of puzzle.solutionActions) {
      const before = state;
      state = gameReducer(state, action);
      if (
        before.phase === "play" &&
        before.activeColor === puzzle.playerColor &&
        (
          state.turn !== before.turn ||
          state.phase === "upgrade" ||
          state.phase === "gameover"
        )
      ) {
        completedPlayerTurns += 1;
      }
    }

    expect(state).toMatchObject({
      phase: "gameover",
      winner: "white",
      result: {
        kind: "winner",
        winner: "white",
        reason: "checkmate",
      },
      puzzlePlayerTurnsRemaining: 0,
    });
    expect(completedPlayerTurns).toBe(4);
  });

  it("decrements the limit only after the player's turns", () => {
    const puzzle = currentDailyPuzzle(new Date("2026-10-15T12:00:00"))!;
    let state = puzzle.createState();

    const playerPlan = chooseAiPlan(state, () => 0);
    for (const action of playerPlan) state = gameReducer(state, action);
    expect(state.activeColor).toBe("black");
    expect(state.puzzlePlayerTurnsRemaining).toBe(3);

    const cpuReply = chooseAiPlan(state, () => 0);
    for (const action of cpuReply) state = gameReducer(state, action);
    expect(state.activeColor).toBe("white");
    expect(state.puzzlePlayerTurnsRemaining).toBe(3);
  });

  it("requires the same terminal reason as the source simulation", () => {
    const puzzle = DAILY_PUZZLES[0];
    const state = puzzle.createState();
    state.phase = "gameover";
    state.winner = "white";
    state.result = {
      kind: "winner",
      winner: "white",
      reason: "king-death",
    };

    expect(dailyPuzzleResultMatches(puzzle, state)).toBe(false);
    state.result.reason = "checkmate";
    expect(dailyPuzzleResultMatches(puzzle, state)).toBe(true);
  });
});
