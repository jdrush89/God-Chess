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
      "daily-2026-10-20": {
        rating: "down",
        difficulty: "hard",
      },
      "daily-2026-10-21": {
        rating: "up",
        difficulty: "impossible",
      },
      "daily-2099-01-01": "up",
      "centaurs-lance": "up",
      "daily-2026-10-18": "maybe",
    })).toEqual({
      "daily-2026-10-19": { rating: "up" },
      "daily-2026-10-20": {
        rating: "down",
        difficulty: "hard",
      },
      "daily-2026-10-21": { rating: "up" },
    });
  });

  it("persists Daily ratings locally", () => {
    persistLocalDailyPuzzleRatings({
      "daily-2026-10-19": {
        rating: "up",
        difficulty: "easy",
      },
      "daily-2026-10-20": { rating: "down" },
    });

    expect(loadLocalDailyPuzzleRatings()).toEqual({
      "daily-2026-10-19": {
        rating: "up",
        difficulty: "easy",
      },
      "daily-2026-10-20": { rating: "down" },
    });
    expect(window.localStorage.getItem(DAILY_PUZZLE_RATINGS_KEY)).toBeTruthy();
  });
});
