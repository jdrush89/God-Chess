import { beforeEach, describe, expect, it, vi } from "vitest";
import source from "../src/game/dailies/2026-10-14.json";
import { gameReducer } from "../src/game/engine";
import type { DailyPuzzleSource } from "../src/game/dailyPuzzles";

const mocks = vi.hoisted(() => ({
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  chooseAiPlan: vi.fn(() => {
    throw new Error("The CPU cannot rediscover this solution.");
  }),
}));

vi.mock("node:fs", () => ({
  default: {
    readFileSync: mocks.readFileSync,
    mkdirSync: mocks.mkdirSync,
    writeFileSync: mocks.writeFileSync,
  },
}));

vi.mock("node:process", () => ({
  default: {
    argv: ["node", "generate-daily-puzzle.ts", "checkpoint.json", "2026-10-29"],
    cwd: () => process.cwd(),
  },
}));

vi.mock("../src/game/ai", () => ({
  chooseAiPlan: mocks.chooseAiPlan,
}));

vi.mock("../src/game/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/game/engine")>();
  return { ...actual, gameReducer: vi.fn(actual.gameReducer) };
});

const createPayload = () => ({
  result: {
    summary: source.resultSummary,
    completedTurns: 100,
    terminalResult: structuredClone(source.targetResult),
  },
  rewind: {
    rounds: source.playerTurns,
    requestedUndoActions: 9,
    appliedUndoActions: 9,
  },
  solutionActions: structuredClone(source.solutionActions),
  save: { state: structuredClone(source.state) },
});

const generate = (payload: unknown) => {
  mocks.readFileSync.mockReturnValue(JSON.stringify(payload));
  return import("./generate-daily-puzzle");
};

describe("Daily puzzle generator", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("preserves a valid exact solution without asking the CPU to solve it again", async () => {
    const payload = createPayload();
    await generate(payload);

    expect(mocks.chooseAiPlan).not.toHaveBeenCalled();
    expect(mocks.writeFileSync).toHaveBeenCalledOnce();
    const output = JSON.parse(mocks.writeFileSync.mock.calls[0][1]) as DailyPuzzleSource;
    expect(output).toMatchObject({
      date: "2026-10-29",
      playerColor: "white",
      playerTurns: 4,
      targetResult: payload.result.terminalResult,
      state: payload.save.state,
      solutionActions: payload.solutionActions,
    });
  });

  it("rejects a checkpoint in the middle of a turn", async () => {
    const payload = createPayload();
    await expect(generate({
      ...payload,
      save: { state: { ...payload.save.state, selectedSquare: "a6" } },
    })).rejects.toThrow("stable turn boundary");
    expect(mocks.writeFileSync).not.toHaveBeenCalled();
  });

  it("rejects a checkpoint with the other player active", async () => {
    const payload = createPayload();
    await expect(generate({
      ...payload,
      save: { state: { ...payload.save.state, activeColor: "black" } },
    })).rejects.toThrow("checkmating player's turn");
    expect(mocks.writeFileSync).not.toHaveBeenCalled();
  });

  it("rejects a non-checkmate simulation result", async () => {
    const payload = createPayload();
    payload.result.terminalResult.reason = "king-death";
    await expect(generate(payload)).rejects.toThrow("checkmate simulations");
    expect(mocks.writeFileSync).not.toHaveBeenCalled();
  });

  it("rejects an empty exported solution", async () => {
    const payload = createPayload();
    payload.solutionActions = [];
    await expect(generate(payload)).rejects.toThrow("exact solutionActions");
    expect(mocks.writeFileSync).not.toHaveBeenCalled();
  });

  it("rejects actions that do not reproduce the checkmate", async () => {
    const payload = createPayload();
    payload.solutionActions.pop();
    await expect(generate(payload)).rejects.toThrow("do not reproduce the simulation result");
    expect(mocks.writeFileSync).not.toHaveBeenCalled();
  });

  it("counts player turns independently of upgrade undo boundaries", async () => {
    const payload = createPayload();
    payload.rewind.rounds = 5;
    await expect(generate(payload)).rejects.toThrow(
      "The export reports 5 player turns, but its exact solution takes 4.",
    );
    expect(mocks.writeFileSync).not.toHaveBeenCalled();
  });

  it("does not accept a replay ending in king capture instead of checkmate", async () => {
    const actual = await vi.importActual<typeof import("../src/game/engine")>(
      "../src/game/engine",
    );
    vi.mocked(gameReducer).mockImplementationOnce((state, action) => ({
      ...actual.gameReducer(state, action),
      phase: "gameover",
      result: { kind: "winner", winner: "white", reason: "king-death" },
    }));

    await expect(generate(createPayload())).rejects.toThrow(
      "do not reproduce the simulation result",
    );
    expect(mocks.writeFileSync).not.toHaveBeenCalled();
  });
});
