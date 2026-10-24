import {
  normalizeCustomPuzzleDraft,
  type CustomPuzzleDraft,
} from "./model";

export const CUSTOM_PUZZLES_KEY = "god-chess-custom-puzzles-v1";

export const loadCustomPuzzleDrafts = (): CustomPuzzleDraft[] => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CUSTOM_PUZZLES_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value) => {
      const puzzle = normalizeCustomPuzzleDraft(value);
      return puzzle ? [puzzle] : [];
    }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch (error) {
    console.error("Unable to load custom puzzle drafts.", error);
    return [];
  }
};

export const persistCustomPuzzleDrafts = (
  puzzles: CustomPuzzleDraft[],
) => {
  window.localStorage.setItem(CUSTOM_PUZZLES_KEY, JSON.stringify(puzzles));
};

export const upsertCustomPuzzleDraft = (
  puzzles: CustomPuzzleDraft[],
  puzzle: CustomPuzzleDraft,
) => [
  puzzle,
  ...puzzles.filter((candidate) => candidate.id !== puzzle.id),
].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

