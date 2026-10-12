import { normalizeCompletedChallenges } from "../challengeProgress";
import type { ChallengeId } from "../game/types";
import { supabase } from "./supabase";

const CHALLENGE_PROGRESS_SAVE_ID = "__challenge_progress_v1__";

interface ChallengeProgressPayload {
  version: 1;
  completed: ChallengeId[];
}

export const loadCloudCompletedChallenges = async (
  userId: string,
): Promise<ChallengeId[]> => {
  if (!supabase) throw new Error("Account services are not configured.");
  const { data, error } = await supabase
    .from("game_saves")
    .select("game")
    .eq("user_id", userId)
    .eq("id", CHALLENGE_PROGRESS_SAVE_ID)
    .maybeSingle();
  if (error) throw error;
  const payload = data?.game as Partial<ChallengeProgressPayload> | undefined;
  return normalizeCompletedChallenges(payload?.completed);
};

export const upsertCloudCompletedChallenges = async (
  userId: string,
  completed: ChallengeId[],
) => {
  if (!supabase) throw new Error("Account services are not configured.");
  const payload: ChallengeProgressPayload = {
    version: 1,
    completed: normalizeCompletedChallenges(completed),
  };
  const { error } = await supabase.from("game_saves").upsert({
    user_id: userId,
    id: CHALLENGE_PROGRESS_SAVE_ID,
    saved_at: new Date().toISOString(),
    game: payload,
  });
  if (error) throw error;
};
