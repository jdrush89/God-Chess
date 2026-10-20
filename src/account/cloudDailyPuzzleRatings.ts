import {
  normalizeDailyPuzzleRatings,
  type DailyPuzzleRatings,
} from "../dailyPuzzleRatings";
import { supabase } from "./supabase";

const DAILY_PUZZLE_RATINGS_SAVE_ID = "__daily_puzzle_ratings_v1__";

interface DailyPuzzleRatingsPayload {
  version: 1;
  ratings: DailyPuzzleRatings;
}

export const loadCloudDailyPuzzleRatings = async (
  userId: string,
): Promise<DailyPuzzleRatings> => {
  if (!supabase) throw new Error("Account services are not configured.");
  const { data, error } = await supabase
    .from("game_saves")
    .select("game")
    .eq("user_id", userId)
    .eq("id", DAILY_PUZZLE_RATINGS_SAVE_ID)
    .maybeSingle();
  if (error) throw error;
  const payload = data?.game as Partial<DailyPuzzleRatingsPayload> | undefined;
  return normalizeDailyPuzzleRatings(payload?.ratings);
};

export const upsertCloudDailyPuzzleRatings = async (
  userId: string,
  ratings: DailyPuzzleRatings,
) => {
  if (!supabase) throw new Error("Account services are not configured.");
  const payload: DailyPuzzleRatingsPayload = {
    version: 1,
    ratings: normalizeDailyPuzzleRatings(ratings),
  };
  const { error } = await supabase.from("game_saves").upsert({
    user_id: userId,
    id: DAILY_PUZZLE_RATINGS_SAVE_ID,
    saved_at: new Date().toISOString(),
    game: payload,
  });
  if (error) throw error;
};
