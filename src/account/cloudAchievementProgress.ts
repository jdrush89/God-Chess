import {
  normalizeAchievementProgress,
} from "../achievementProgress";
import type { AchievementProgress } from "../achievements";
import { supabase } from "./supabase";

const ACHIEVEMENT_PROGRESS_SAVE_ID = "__achievement_progress_v1__";

interface AchievementProgressPayload {
  version: 1;
  progress: AchievementProgress;
}

export const loadCloudAchievementProgress = async (
  userId: string,
): Promise<AchievementProgress> => {
  if (!supabase) throw new Error("Account services are not configured.");
  const { data, error } = await supabase
    .from("game_saves")
    .select("game")
    .eq("user_id", userId)
    .eq("id", ACHIEVEMENT_PROGRESS_SAVE_ID)
    .maybeSingle();
  if (error) throw error;
  const payload = data?.game as Partial<AchievementProgressPayload> | undefined;
  return normalizeAchievementProgress(payload?.progress);
};

export const upsertCloudAchievementProgress = async (
  userId: string,
  progress: AchievementProgress,
) => {
  if (!supabase) throw new Error("Account services are not configured.");
  const payload: AchievementProgressPayload = {
    version: 1,
    progress: normalizeAchievementProgress(progress),
  };
  const { error } = await supabase.from("game_saves").upsert({
    user_id: userId,
    id: ACHIEVEMENT_PROGRESS_SAVE_ID,
    saved_at: new Date().toISOString(),
    game: payload,
  });
  if (error) throw error;
};
