import type { PuzzleId } from "../game/types";
import { normalizeCompletedPuzzles } from "../puzzleProgress";
import { supabase } from "./supabase";

const PUZZLE_PROGRESS_SAVE_ID = "__puzzle_progress_v1__";

interface PuzzleProgressPayload {
  version: 1;
  completedPuzzleIds: PuzzleId[];
}

export const loadCloudCompletedPuzzles = async (userId: string): Promise<PuzzleId[]> => {
  if (!supabase) throw new Error("Account services are not configured.");
  const { data, error } = await supabase
    .from("game_saves")
    .select("game")
    .eq("user_id", userId)
    .eq("id", PUZZLE_PROGRESS_SAVE_ID)
    .maybeSingle();
  if (error) throw error;
  const payload = data?.game as Partial<PuzzleProgressPayload> | undefined;
  return normalizeCompletedPuzzles(payload?.completedPuzzleIds);
};

export const upsertCloudCompletedPuzzles = async (
  userId: string,
  completedPuzzleIds: PuzzleId[],
) => {
  if (!supabase) throw new Error("Account services are not configured.");
  const payload: PuzzleProgressPayload = {
    version: 1,
    completedPuzzleIds: normalizeCompletedPuzzles(completedPuzzleIds),
  };
  const { error } = await supabase.from("game_saves").upsert({
    user_id: userId,
    id: PUZZLE_PROGRESS_SAVE_ID,
    saved_at: new Date().toISOString(),
    game: payload,
  });
  if (error) throw error;
};
