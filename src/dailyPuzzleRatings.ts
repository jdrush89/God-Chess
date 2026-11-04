import { DAILY_PUZZLE_BY_ID } from "./game/dailyPuzzles";
import type { DailyPuzzleId } from "./game/types";

export type DailyPuzzleRating = "up" | "down";
export type DailyPuzzleDifficultyRating = "easy" | "medium" | "hard";

export interface DailyPuzzleFeedback {
  rating?: DailyPuzzleRating;
  difficulty?: DailyPuzzleDifficultyRating;
}

export type DailyPuzzleRatings =
  Partial<Record<DailyPuzzleId, DailyPuzzleFeedback>>;

export const DAILY_PUZZLE_RATINGS_KEY = "god-chess-daily-ratings-v1";

export const normalizeDailyPuzzleRatings = (
  value: unknown,
): DailyPuzzleRatings => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([id, entry]) => {
    if (!(id in DAILY_PUZZLE_BY_ID)) return [];
    if (entry === "up" || entry === "down") {
      return [[id as DailyPuzzleId, { rating: entry }]];
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const source = entry as Partial<DailyPuzzleFeedback>;
    const rating = source.rating === "up" || source.rating === "down"
      ? source.rating
      : undefined;
    const difficulty =
      source.difficulty === "easy" ||
        source.difficulty === "medium" ||
        source.difficulty === "hard"
        ? source.difficulty
        : undefined;
    return rating || difficulty
      ? [[id as DailyPuzzleId, { rating, difficulty }]]
      : [];
  }));
};

export const loadLocalDailyPuzzleRatings = (): DailyPuzzleRatings => {
  try {
    const raw = window.localStorage.getItem(DAILY_PUZZLE_RATINGS_KEY);
    return normalizeDailyPuzzleRatings(raw ? JSON.parse(raw) : {});
  } catch (error) {
    console.error("Unable to load local Daily puzzle ratings.", error);
    return {};
  }
};

export const persistLocalDailyPuzzleRatings = (
  ratings: DailyPuzzleRatings,
) => {
  window.localStorage.setItem(
    DAILY_PUZZLE_RATINGS_KEY,
    JSON.stringify(normalizeDailyPuzzleRatings(ratings)),
  );
};
