import { describe, expect, it } from "vitest";
import readme from "../../README.md?raw";
import { chooseAiPlan, isAiTurn } from "./ai";
import { legalTargets } from "./chess";
import { gameReducer } from "./engine";
import { GOD_BY_ID, GODS } from "./gods";
import {
  PUZZLE_GOD_INDEX,
  PUZZLE_GOD_USAGE,
  PUZZLE_GOD_USAGE_BY_ID,
  PUZZLES,
} from "./puzzles";

describe("puzzle mode", () => {
  it("includes five one-turn and ten two-turn positions", () => {
    expect(PUZZLES.filter((puzzle) => puzzle.playerTurns === 1)).toHaveLength(5);
    expect(PUZZLES.filter((puzzle) => puzzle.playerTurns === 2)).toHaveLength(10);
    expect(PUZZLES.filter((puzzle) => puzzle.difficulty === "easy")).toHaveLength(5);
    expect(PUZZLES.filter((puzzle) => puzzle.difficulty === "medium")).toHaveLength(10);
  });

  it.each([
    "hidden-reserve",
    "serpents-delivery",
    "borrowed-bishop",
    "rising-monument",
    "funded-flight",
    "cleared-lane",
    "royal-landing",
  ])("%s disguises its required upgrade among multiple upgraded abilities", (puzzleId) => {
    const puzzle = PUZZLES.find((candidate) => candidate.id === puzzleId)!;
    const state = puzzle.createState("Solver");
    expect(Object.values(state.players.white.upgrades).filter((level) => level > 1)).toHaveLength(3);
  });

  it.each(PUZZLES)("$title records its player, opponent, and required solution gods", (puzzle) => {
    const state = puzzle.createState("Solver");
    const usage = PUZZLE_GOD_USAGE_BY_ID[puzzle.id];
    const requiredGods = [...new Set(puzzle.solutionTurns.flatMap((turn) =>
      turn.flatMap((action) => action.type === "select-god" ? [action.godId] : [])
    ))];

    expect(usage.playerGods).toEqual(state.players.white.gods);
    expect(usage.opponentGods).toEqual(state.players.black.gods);
    expect(usage.requiredGods).toEqual(requiredGods);
    expect(usage.requiredGods.every((godId) => usage.playerGods.includes(godId))).toBe(true);
  });

  it("indexes every god by player, opponent, and tested-solution usage", () => {
    expect(Object.keys(PUZZLE_GOD_INDEX)).toHaveLength(GODS.length);
    for (const god of GODS) {
      const entry = PUZZLE_GOD_INDEX[god.id];
      expect(entry.playerIn).toEqual(
        PUZZLE_GOD_USAGE.filter((usage) => usage.playerGods.includes(god.id))
          .map((usage) => usage.puzzleId),
      );
      expect(entry.opponentIn).toEqual(
        PUZZLE_GOD_USAGE.filter((usage) => usage.opponentGods.includes(god.id))
          .map((usage) => usage.puzzleId),
      );
      expect(entry.requiredBy).toEqual(
        PUZZLE_GOD_USAGE.filter((usage) => usage.requiredGods.includes(god.id))
          .map((usage) => usage.puzzleId),
      );
    }
  });

  it("keeps the human-readable puzzle god index synchronized", () => {
    for (const usage of PUZZLE_GOD_USAGE) {
      const playerGods = usage.playerGods.map((godId) => GOD_BY_ID[godId].name).join(", ");
      const opponentGods = usage.opponentGods.map((godId) => GOD_BY_ID[godId].name).join(", ");
      const requiredGods = usage.requiredGods.map((godId) =>
        `${GOD_BY_ID[godId].name} (${usage.solutionAbilities[godId]?.join(", ")})`
      ).join("; ");
      expect(readme).toContain(
        `| ${usage.title} | ${playerGods} | ${opponentGods} | ${requiredGods} |`,
      );
    }
  });

  it.each(PUZZLES)("$title has a legal winning solution against level 10 AI", (puzzle) => {
    let state = puzzle.createState("Solver");

    expect(state.gameMode).toBe("puzzle");
    expect(state.aiDifficulty).toBe(10);
    expect(state.aiColor).toBe("black");
    expect(Object.keys(state.board).length).toBeGreaterThanOrEqual(16);

    const blackKingSquare = Object.entries(state.board).find(
      ([, piece]) => piece.type === "king" && piece.controller === "black",
    )?.[0];
    expect(blackKingSquare).toBeTruthy();
    for (const [square, piece] of Object.entries(state.board)) {
      if (piece.controller === "white") {
        expect(legalTargets(state.board, square)).not.toContain(blackKingSquare);
      }
    }

    for (const [turnIndex, actions] of puzzle.solutionTurns.entries()) {
      for (const action of actions) state = gameReducer(state, action);
      if (state.phase === "gameover") break;

      expect(turnIndex).toBeLessThan(puzzle.solutionTurns.length - 1);
      expect(state.puzzleFailed).toBe(false);
      expect(isAiTurn(state)).toBe(true);
      const aiPlan = chooseAiPlan(state, () => 0);
      expect(aiPlan.length).toBeGreaterThan(0);
      for (const action of aiPlan) state = gameReducer(state, action);
      expect(state.activeColor).toBe("white");
    }

    expect(state.phase).toBe("gameover");
    expect(state.winner).toBe("white");
    expect(state.puzzleFailed).toBe(false);
  });

  it("marks a missed one-turn solution and gives the level 10 AI a response", () => {
    const puzzle = PUZZLES[0];
    let state = puzzle.createState("Solver");
    state = gameReducer(state, { type: "select-god", godId: "teles" });
    state = gameReducer(state, { type: "select-ability", abilityId: "resonance" });
    state = gameReducer(state, { type: "square", square: "c3" });
    state = gameReducer(state, { type: "square", square: "d4" });

    expect(state.puzzleFailed).toBe(true);
    expect(isAiTurn(state)).toBe(true);
    expect(chooseAiPlan(state, () => 0).length).toBeGreaterThan(0);
  });

  it("lets the AI complete a response after a missed second turn", () => {
    const puzzle = PUZZLES.find((candidate) => candidate.id === "opened-file")!;
    let state = puzzle.createState("Solver");
    for (const action of puzzle.solutionTurns[0]) state = gameReducer(state, action);
    for (const action of chooseAiPlan(state, () => 0)) state = gameReducer(state, action);

    state = gameReducer(state, { type: "select-god", godId: "medusa" });
    state = gameReducer(state, { type: "select-ability", abilityId: "captivate" });
    state = gameReducer(state, { type: "square", square: "g2" });
    state = gameReducer(state, { type: "square", square: "g3" });

    expect(state.puzzleFailed).toBe(true);
    expect(isAiTurn(state)).toBe(true);
    const response = chooseAiPlan(state, () => 0);
    expect(response.length).toBeGreaterThan(1);
    for (const action of response) state = gameReducer(state, action);
    expect(state.activeColor).toBe("white");
  });

  it("does not stall after the Position Eight rook moves from f7 to h7", () => {
    const puzzle = PUZZLES.find((candidate) => candidate.id === "mounted-fury")!;
    let state = puzzle.createState("Solver");
    state = gameReducer(state, { type: "select-god", godId: "chiron" });
    state = gameReducer(state, { type: "select-ability", abilityId: "gallop" });
    state = gameReducer(state, { type: "square", square: "f7" });
    state = gameReducer(state, { type: "square", square: "h7" });

    expect(isAiTurn(state)).toBe(true);
    const response = chooseAiPlan(state, () => 0);
    expect(response.length).toBeGreaterThan(1);
    for (const action of response) state = gameReducer(state, action);
    expect(state.activeColor).toBe("white");
  });
});
