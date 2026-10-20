// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  DAILY_PUZZLE_RATINGS_KEY,
  loadLocalDailyPuzzleRatings,
  normalizeDailyPuzzleRatings,
  persistLocalDailyPuzzleRatings,
} from "./dailyPuzzleRatings";

beforeEach(() => window.localStorage.clear());

describe("Daily puzzle ratings", () => {
  it("keeps ratings for known Daily puzzles", () => {
    expect(normalizeDailyPuzzleRatings({
      "daily-2026-10-19": "up",
      "daily-2026-10-20": "down",
      "daily-2099-01-01": "up",
      "centaurs-lance": "up",
      "daily-2026-10-18": "maybe",
    })).toEqual({
      "daily-2026-10-19": "up",
      "daily-2026-10-20": "down",
    });
  });

  it("persists Daily ratings locally", () => {
    persistLocalDailyPuzzleRatings({
      "daily-2026-10-19": "up",
      "daily-2026-10-20": "down",
    });

    expect(loadLocalDailyPuzzleRatings()).toEqual({
      "daily-2026-10-19": "up",
      "daily-2026-10-20": "down",
    });
    expect(window.localStorage.getItem(DAILY_PUZZLE_RATINGS_KEY)).toBeTruthy();
  });
});
