import { DAILY_PUZZLE_BY_ID } from "./game/dailyPuzzles";
import type { DailyPuzzleId } from "./game/types";

export type DailyPuzzleRating = "up" | "down";
export type DailyPuzzleRatings = Partial<Record<DailyPuzzleId, DailyPuzzleRating>>;

export const DAILY_PUZZLE_RATINGS_KEY = "god-chess-daily-ratings-v1";

export const normalizeDailyPuzzleRatings = (
  value: unknown,
): DailyPuzzleRatings => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [DailyPuzzleId, DailyPuzzleRating] =>
        entry[0] in DAILY_PUZZLE_BY_ID &&
        (entry[1] === "up" || entry[1] === "down"),
    ),
  );
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
