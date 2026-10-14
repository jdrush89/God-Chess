// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  loadLocalCompletedPuzzles,
  normalizeCompletedPuzzles,
  persistLocalCompletedPuzzles,
  PUZZLE_PROGRESS_KEY,
} from "./puzzleProgress";

beforeEach(() => window.localStorage.clear());

describe("puzzle progress", () => {
  it("keeps unique known puzzle identifiers", () => {
    expect(normalizeCompletedPuzzles([
      "centaurs-lance",
      "centaurs-lance",
      "opened-file",
      "three-frontier-fork",
      "daily-2026-10-14",
      "unknown-position",
    ])).toEqual([
      "centaurs-lance",
      "opened-file",
      "three-frontier-fork",
      "daily-2026-10-14",
    ]);
  });

  it("persists completed puzzles locally", () => {
    persistLocalCompletedPuzzles([
      "centaurs-lance",
      "opened-file",
      "three-frontier-fork",
      "daily-2026-10-14",
    ]);
    expect(loadLocalCompletedPuzzles()).toEqual([
      "centaurs-lance",
      "opened-file",
      "three-frontier-fork",
      "daily-2026-10-14",
    ]);
    expect(window.localStorage.getItem(PUZZLE_PROGRESS_KEY)).toBeTruthy();
  });
});
