import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(() => false),
  unlinkSync: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: { existsSync: mocks.existsSync, unlinkSync: mocks.unlinkSync },
}));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));

import { prepareDailyPuzzle, SEARCH_TIMEOUT_MS } from "./prepare-daily-puzzle.mjs";

describe("Daily preparation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-03T14:00:00Z"));
    vi.clearAllMocks();
    mocks.existsSync.mockReturnValue(false);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const respondWith = (codes: number[]) => {
    mocks.spawn.mockImplementation(() => {
      const child = new EventEmitter();
      vi.setSystemTime(Date.now() + 1_000);
      Promise.resolve().then(() => child.emit("exit", codes.shift() ?? 0));
      return child;
    });
  };

  it("uses the generator and existing replay/hint tests without a counter-zero guard or CPU re-solve", async () => {
    respondWith([0, 0, 0, 0]);
    await prepareDailyPuzzle("2026-11-03", "/tmp/accepted-daily-export.json");

    expect(SEARCH_TIMEOUT_MS).toBe(20 * 60 * 1000);
    expect(mocks.spawn.mock.calls.map(([command, args]) => [command, args])).toEqual([
      [process.execPath, [
        "node_modules/vite-node/vite-node.mjs", "scripts/run-cpu-simulation.ts",
        "/tmp/accepted-daily-export.json", "2026-11-03",
      ]],
      ["npm", ["run", "generate:daily", "--", "/tmp/accepted-daily-export.json", "2026-11-03"]],
      ["npm", ["test", "--", "scripts/generate-daily-puzzle.test.ts", "src/game/dailyPuzzles.test.ts"]],
      ["npm", ["run", "build"]],
    ]);
  });

  it("retries a rejected checkpoint with a fresh simulation and the original deadline", async () => {
    respondWith([0, 1, 0, 0, 0, 0]);
    const started = Date.now();
    await prepareDailyPuzzle("2026-11-03", "/tmp/retry-daily-export.json");

    const deadlines = mocks.spawn.mock.calls.map(([, , options]) =>
      options.env.DAILY_SEARCH_DEADLINE);
    expect(deadlines).toEqual(Array(6).fill(String(started + SEARCH_TIMEOUT_MS)));
    expect(mocks.spawn.mock.calls[2][1][1]).toBe("scripts/run-cpu-simulation.ts");
  });

  it("interrupts a blocked CPU attempt at 20 minutes and deletes only this attempt's files", async () => {
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    const child = Object.assign(new EventEmitter(), { pid: 12345 });
    mocks.spawn.mockReturnValue(child);
    const outcome = prepareDailyPuzzle("2026-11-03", "/tmp/timeout-daily-export.json")
      .then(() => undefined, (error: Error) => error);

    mocks.existsSync.mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(SEARCH_TIMEOUT_MS);
    expect(kill).toHaveBeenCalledWith(-12345, "SIGKILL");
    child.emit("exit", null);

    expect((await outcome)?.message).toContain("single 20-minute deadline");
    expect(mocks.unlinkSync.mock.calls).toEqual([
      [expect.stringContaining("src/game/dailies/2026-11-03.json")],
      ["/tmp/timeout-daily-export.json"],
    ]);
    expect(mocks.spawn).toHaveBeenCalledOnce();
  });

  it("does not overwrite a published Daily", async () => {
    mocks.existsSync.mockReturnValue(true);
    await expect(prepareDailyPuzzle("2026-11-03", "/tmp/existing.json"))
      .rejects.toThrow("Refusing to overwrite");
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(mocks.unlinkSync).not.toHaveBeenCalled();
  });

  it("removes generated output and refuses publication after a failed build", async () => {
    respondWith([0, 0, 0, 1]);
    mocks.existsSync.mockReturnValueOnce(false).mockReturnValueOnce(false).mockReturnValue(true);
    await expect(prepareDailyPuzzle("2026-11-03", "/tmp/build-failed-export.json"))
      .rejects.toThrow("Daily build failed; publication is forbidden");
    expect(mocks.unlinkSync).toHaveBeenCalledTimes(2);
  });

  it("allows validation to finish after the search deadline without starting another search", async () => {
    let calls = 0;
    mocks.spawn.mockImplementation(() => {
      const child = new EventEmitter();
      if (++calls === 3) vi.setSystemTime(Date.now() + SEARCH_TIMEOUT_MS);
      Promise.resolve().then(() => child.emit("exit", 0));
      return child;
    });
    await prepareDailyPuzzle("2026-11-03", "/tmp/validated-export.json");
    expect(mocks.spawn).toHaveBeenCalledTimes(4);
    expect(mocks.unlinkSync).not.toHaveBeenCalled();
  });
});
