// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  DAILY_PUZZLE_GIVE_UPS_KEY,
  loadLocalDailyPuzzleGiveUps,
  normalizeDailyPuzzleGiveUps,
  persistLocalDailyPuzzleGiveUps,
} from "./dailyPuzzleGiveUps";

beforeEach(() => window.localStorage.clear());

describe("Daily puzzle give-ups", () => {
  it("keeps unique known Daily puzzle identifiers", () => {
    expect(normalizeDailyPuzzleGiveUps([
      "daily-2026-10-14",
      "daily-2026-10-14",
      "centaurs-lance",
      "unknown-position",
    ])).toEqual(["daily-2026-10-14"]);
  });

  it("persists Daily puzzle give-ups locally", () => {
    persistLocalDailyPuzzleGiveUps(["daily-2026-10-14"]);

    expect(loadLocalDailyPuzzleGiveUps()).toEqual(["daily-2026-10-14"]);
    expect(window.localStorage.getItem(DAILY_PUZZLE_GIVE_UPS_KEY)).toBeTruthy();
  });
});
