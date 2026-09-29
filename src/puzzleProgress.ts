import { PUZZLE_BY_ID } from "./game/puzzles";
import type { PuzzleId } from "./game/types";

export const PUZZLE_PROGRESS_KEY = "god-chess-puzzle-progress-v1";

export const normalizeCompletedPuzzles = (value: unknown): PuzzleId[] => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(
    (candidate): candidate is PuzzleId =>
      typeof candidate === "string" && candidate in PUZZLE_BY_ID,
  ))];
};

export const loadLocalCompletedPuzzles = (): PuzzleId[] => {
  try {
    const raw = window.localStorage.getItem(PUZZLE_PROGRESS_KEY);
    return normalizeCompletedPuzzles(raw ? JSON.parse(raw) : []);
  } catch (error) {
    console.error("Unable to load local puzzle progress.", error);
    return [];
  }
};

export const persistLocalCompletedPuzzles = (puzzleIds: PuzzleId[]) => {
  window.localStorage.setItem(
    PUZZLE_PROGRESS_KEY,
    JSON.stringify(normalizeCompletedPuzzles(puzzleIds)),
  );
};
