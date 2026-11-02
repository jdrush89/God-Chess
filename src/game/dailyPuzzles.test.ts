import { describe, expect, it } from "vitest";
import { chooseAiPlan } from "./ai";
import {
  currentDailyPuzzle,
  DAILY_PUZZLE_BY_ID,
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

    expect(puzzle.playerTurns).toBeGreaterThanOrEqual(3);
    expect(puzzle.playerTurns).toBeLessThanOrEqual(5);
    expect(state.phase).toBe("play");
    expect(state.activeColor).toBe(puzzle.playerColor);
    expect(state.aiDifficulty).toBe(10);
    expect(state.selectedGod).toBeUndefined();
    expect(state.selectedAbility).toBeUndefined();
    expect(state.selectedSquare).toBeUndefined();
    expect(state.pending).toBeUndefined();
    expect(state.upgradeQueue).toHaveLength(0);
    expect(puzzle.hint).toMatch(
      /^Start by moving a (king|queen|rook|bishop|knight|pawn)\./,
    );
    expect(puzzle.abilityHint).toMatch(
      /^The winning CPU line (used .+|did not require a named God ability)\.$/,
    );
    expect(`${puzzle.hint} ${puzzle.abilityHint}`).not.toMatch(/simulation/i);

    for (const action of puzzle.solutionActions) {
      const before = state;
      state = gameReducer(state, action);
      if (
        before.phase === "play" &&
        action.type !== "adjudicate-no-turn" &&
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

  it("keeps the latest Dailies unique from the archive", () => {
    const fingerprints = DAILY_PUZZLES.map((puzzle) => JSON.stringify({
      board: puzzle.createState().board,
      solutionActions: puzzle.solutionActions,
    }));

    for (const id of [
      "daily-2026-10-31",
      "daily-2026-11-01",
      "daily-2026-11-02",
    ] as const) {
      const index = DAILY_PUZZLES.findIndex((puzzle) => puzzle.id === id);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(fingerprints.indexOf(fingerprints[index])).toBe(index);
    }
  });

  it("preserves the November 2 Black checkmate replay and its hints", () => {
    const puzzle = DAILY_PUZZLE_BY_ID["daily-2026-11-02"]!;
    expect(currentDailyPuzzle(new Date("2026-11-02T12:00:00"))).toBe(puzzle);
    expect(puzzle.playerColor).toBe("black");
    expect(puzzle.playerTurns).toBe(5);
    expect(puzzle.targetResult).toEqual({
      kind: "winner",
      winner: "black",
      reason: "checkmate",
    });
    expect(puzzle.hint).toBe(
      "Start by moving a queen. Find the strongest continuation from there.",
    );
    expect(puzzle.abilityHint).toBe(
      "The winning CPU line used Cull the Weak, Royal Step, Gallop, and Threaten.",
    );

    let state = puzzle.createState();
    const completedTurns = { white: 0, black: 0 };
    for (const action of puzzle.solutionActions) {
      const before = state;
      state = gameReducer(state, action);
      if (
        before.phase === "play" &&
        action.type !== "adjudicate-no-turn" &&
        (
          state.turn !== before.turn ||
          state.phase === "upgrade" ||
          state.phase === "gameover"
        )
      ) {
        completedTurns[before.activeColor] += 1;
      }
    }

    expect(state.phase).toBe("gameover");
    expect(state.result).toEqual(puzzle.targetResult);
    expect(completedTurns).toEqual({ white: 4, black: 5 });
    expect(state.puzzlePlayerTurnsRemaining).toBe(0);
    expect(state.puzzleFailed).toBe(false);
  });

  it("adjudicates the November 2 checkmate after the final player upgrade", () => {
    const puzzle = DAILY_PUZZLE_BY_ID["daily-2026-11-02"]!;
    const finalAction = puzzle.solutionActions.at(-1)!;
    let state = puzzle.solutionActions.slice(0, -1)
      .reduce(gameReducer, puzzle.createState());

    expect(state).toMatchObject({
      phase: "upgrade",
      activeColor: puzzle.playerColor,
      puzzlePlayerTurnsRemaining: 0,
      puzzleFailed: true,
    });
    expect(finalAction).toEqual({
      type: "upgrade",
      abilityId: "pick-a-fight",
    });

    state = gameReducer(state, finalAction);

    expect(state).toMatchObject({
      phase: "gameover",
      winner: "black",
      result: {
        kind: "winner",
        winner: "black",
        reason: "checkmate",
      },
      puzzleFailed: false,
    });
  });

  it("keeps the November 1 solver's King alive through the winning line", () => {
    const puzzle = DAILY_PUZZLE_BY_ID["daily-2026-11-01"]!;
    const result = puzzle.solutionActions.reduce(gameReducer, puzzle.createState());

    expect(dailyPuzzleResultMatches(puzzle, result)).toBe(true);
    expect(Object.values(result.board)).toContainEqual(
      expect.objectContaining({
        type: "king",
        controller: puzzle.playerColor,
      }),
    );
  });

  it("keeps the November 1 solution valid against the current level 10 CPU", () => {
    const puzzle = DAILY_PUZZLE_BY_ID["daily-2026-11-01"]!;
    let recorded = puzzle.createState();
    let live = puzzle.createState();
    let segment: typeof puzzle.solutionActions = [];

    const replaySegment = () => {
      if (!segment.length) return;
      if (live.activeColor === puzzle.playerColor) {
        live = segment.reduce(gameReducer, live);
      } else {
        live = chooseAiPlan(live, () => 0).reduce(gameReducer, live);
      }
      segment = [];
    };

    for (const action of puzzle.solutionActions) {
      const before = recorded;
      segment.push(action);
      recorded = gameReducer(recorded, action);
      const completedSegment = before.phase === "play"
        ? (
          recorded.phase !== before.phase ||
          recorded.turn !== before.turn ||
          recorded.activeColor !== before.activeColor
        )
        : (
          recorded.phase !== before.phase ||
          recorded.upgradeQueue.length !== before.upgradeQueue.length ||
          recorded.activeColor !== before.activeColor
        );
      if (completedSegment) replaySegment();
    }
    replaySegment();

    expect(dailyPuzzleResultMatches(puzzle, live)).toBe(true);
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

  it("accepts capturing the target King as an alternate Daily win", () => {
    const puzzle = DAILY_PUZZLES[0];
    const state = puzzle.createState();
    state.phase = "gameover";
    state.winner = "white";
    state.result = {
      kind: "winner",
      winner: "white",
      reason: "king-death",
    };

    expect(dailyPuzzleResultMatches(puzzle, state)).toBe(true);
    state.result.reason = "checkmate";
    expect(dailyPuzzleResultMatches(puzzle, state)).toBe(true);
  });

  it("lets Charge capture the adjacent King in the October 21 Daily", () => {
    const puzzle = currentDailyPuzzle(new Date("2026-10-21T12:00:00"))!;
    let state = puzzle.createState();
    state.rested = state.rested.filter((godId) => godId !== "chiron");

    state = gameReducer(state, { type: "select-god", godId: "chiron" });
    state = gameReducer(state, {
      type: "select-ability",
      abilityId: "charge",
    });
    state = gameReducer(state, { type: "square", square: "f7" });

    expect(state.legalTargets).toContain("g7");

    state = gameReducer(state, { type: "square", square: "g7" });
    expect(state).toMatchObject({
      phase: "gameover",
      result: {
        kind: "winner",
        winner: "white",
        reason: "king-death",
      },
    });
    expect(dailyPuzzleResultMatches(puzzle, state)).toBe(true);
  });
});
