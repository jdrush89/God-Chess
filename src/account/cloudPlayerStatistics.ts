import type { PuzzleId } from "../game/types";
import {
  createPlayerStatisticsSnapshot,
  normalizePlayerStatisticsProgress,
  type PlayerStatisticsProgress,
} from "../playerStatistics";
import { supabase } from "./supabase";

export const loadCloudPlayerStatistics = async (
  userId: string,
): Promise<PlayerStatisticsProgress> => {
  if (!supabase) throw new Error("Account services are not configured.");
  const { data, error } = await supabase
    .from("player_stats")
    .select("progress")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return normalizePlayerStatisticsProgress(data?.progress);
};
export const upsertCloudPlayerStatistics = async (
  userId: string,
  progress: PlayerStatisticsProgress,
  completedPuzzleIds: PuzzleId[],
) => {
  if (!supabase) throw new Error("Account services are not configured.");
  const normalized = normalizePlayerStatisticsProgress(progress);
  const updatedAt = new Date().toISOString();
  const [{ error: privateError }, { error: publicError }] = await Promise.all([
    supabase.from("player_stats").upsert({
      user_id: userId,
      updated_at: updatedAt,
      progress: normalized,
    }),
    supabase.from("player_stats_public").upsert({
      user_id: userId,
      updated_at: updatedAt,
      snapshot: createPlayerStatisticsSnapshot(
        normalized,
        completedPuzzleIds,
      ),
    }),
  ]);
  if (privateError) throw privateError;
  if (publicError) throw publicError;
};
