import type { ChallengeId } from "./game/types";
import { CHALLENGES } from "./game/challenges";

export const CHALLENGE_PROGRESS_KEY = "god-chess-challenges-v1";

const challengeIds = new Set(CHALLENGES.map((challenge) => challenge.id));

export const normalizeCompletedChallenges = (
  value: unknown,
): ChallengeId[] => Array.isArray(value)
  ? [...new Set(value.filter((id): id is ChallengeId =>
    typeof id === "string" && challengeIds.has(id as ChallengeId)
  ))]
  : [];

export const loadLocalCompletedChallenges = (): ChallengeId[] => {
  try {
    const raw = window.localStorage.getItem(CHALLENGE_PROGRESS_KEY);
    return normalizeCompletedChallenges(raw ? JSON.parse(raw) : undefined);
  } catch (error) {
    console.error("Unable to load local challenge progress.", error);
    return [];
  }
};

export const persistLocalCompletedChallenges = (
  completed: ChallengeId[],
) => {
  window.localStorage.setItem(
    CHALLENGE_PROGRESS_KEY,
    JSON.stringify(normalizeCompletedChallenges(completed)),
  );
};
