import { describe, expect, it } from "vitest";
import { chooseAiPlan } from "./ai";
import {
  currentDailyPuzzle,
  DAILY_PUZZLES,
  dailyPuzzleResultMatches,
} from "./dailyPuzzles";
import { gameReducer } from "./engine";

describe("daily puzzles", () => {
  it("loads the generated simulation checkpoint as a five-turn White puzzle", () => {
    const puzzle = currentDailyPuzzle(new Date("2026-10-14T12:00:00"));
    expect(DAILY_PUZZLES).toHaveLength(1);
    expect(puzzle).toMatchObject({
      id: "daily-2026-10-14",
      playerColor: "white",
      playerTurns: 5,
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
      puzzlePlayerTurnsRemaining: 5,
      puzzleFailed: false,
    });
    expect(state.players.white.name).toBe("Daily Solver");
    expect(state.players.black.name).toBe("Black Level 10 CPU");
    expect(Object.keys(state.board)).toHaveLength(8);
  });

  it("reproduces the simulation checkmate within the generated turn limit", () => {
    const puzzle = DAILY_PUZZLES[0];
    let state = puzzle.createState();

    for (let plans = 0; plans < 12 && state.phase !== "gameover"; plans += 1) {
      const actions = chooseAiPlan(state, () => 0);
      expect(actions.length, JSON.stringify({
        phase: state.phase,
        activeColor: state.activeColor,
        turn: state.turn,
        round: state.round,
        turnsRemaining: state.puzzlePlayerTurnsRemaining,
        rested: state.rested,
      })).toBeGreaterThan(0);
      for (const action of actions) state = gameReducer(state, action);
    }

    expect(dailyPuzzleResultMatches(puzzle, state), JSON.stringify({
      phase: state.phase,
      result: state.result,
      activeColor: state.activeColor,
      turn: state.turn,
      round: state.round,
      turnsRemaining: state.puzzlePlayerTurnsRemaining,
      rested: state.rested,
    })).toBe(true);
    expect(state.puzzlePlayerTurnsRemaining).toBeGreaterThanOrEqual(1);
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
