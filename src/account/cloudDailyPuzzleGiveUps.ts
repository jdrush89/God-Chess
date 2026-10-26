import type { DailyPuzzleId } from "../game/types";
import { normalizeDailyPuzzleGiveUps } from "../dailyPuzzleGiveUps";
import { supabase } from "./supabase";

const DAILY_PUZZLE_GIVE_UPS_SAVE_ID = "__daily_puzzle_give_ups_v1__";

interface DailyPuzzleGiveUpsPayload {
  version: 1;
  puzzleIds: DailyPuzzleId[];
}

export const loadCloudDailyPuzzleGiveUps = async (
  userId: string,
): Promise<DailyPuzzleId[]> => {
  if (!supabase) throw new Error("Account services are not configured.");
  const { data, error } = await supabase
    .from("game_saves")
    .select("game")
    .eq("user_id", userId)
    .eq("id", DAILY_PUZZLE_GIVE_UPS_SAVE_ID)
    .maybeSingle();
  if (error) throw error;
  const payload = data?.game as Partial<DailyPuzzleGiveUpsPayload> | undefined;
  return normalizeDailyPuzzleGiveUps(payload?.puzzleIds);
};

export const upsertCloudDailyPuzzleGiveUps = async (
  userId: string,
  puzzleIds: DailyPuzzleId[],
) => {
  if (!supabase) throw new Error("Account services are not configured.");
  const payload: DailyPuzzleGiveUpsPayload = {
    version: 1,
    puzzleIds: normalizeDailyPuzzleGiveUps(puzzleIds),
  };
  const { error } = await supabase.from("game_saves").upsert({
    user_id: userId,
    id: DAILY_PUZZLE_GIVE_UPS_SAVE_ID,
    saved_at: new Date().toISOString(),
    game: payload,
  });
  if (error) throw error;
};
