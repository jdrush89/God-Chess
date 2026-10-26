import { DAILY_PUZZLE_BY_ID } from "./game/dailyPuzzles";
import type { DailyPuzzleId } from "./game/types";

export const DAILY_PUZZLE_GIVE_UPS_KEY = "god-chess-daily-give-ups-v1";

export const normalizeDailyPuzzleGiveUps = (
  value: unknown,
): DailyPuzzleId[] => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(
    (candidate): candidate is DailyPuzzleId =>
      typeof candidate === "string" && candidate in DAILY_PUZZLE_BY_ID,
  ))];
};

export const loadLocalDailyPuzzleGiveUps = (): DailyPuzzleId[] => {
  try {
    const raw = window.localStorage.getItem(DAILY_PUZZLE_GIVE_UPS_KEY);
    return normalizeDailyPuzzleGiveUps(raw ? JSON.parse(raw) : []);
  } catch (error) {
    console.error("Unable to load local Daily puzzle give-ups.", error);
    return [];
  }
};

export const persistLocalDailyPuzzleGiveUps = (
  puzzleIds: DailyPuzzleId[],
) => {
  window.localStorage.setItem(
    DAILY_PUZZLE_GIVE_UPS_KEY,
    JSON.stringify(normalizeDailyPuzzleGiveUps(puzzleIds)),
  );
};
