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
      "unknown-position",
    ])).toEqual(["centaurs-lance", "opened-file"]);
  });

  it("persists completed puzzles locally", () => {
    persistLocalCompletedPuzzles(["centaurs-lance", "opened-file"]);
    expect(loadLocalCompletedPuzzles()).toEqual(["centaurs-lance", "opened-file"]);
    expect(window.localStorage.getItem(PUZZLE_PROGRESS_KEY)).toBeTruthy();
  });
});
