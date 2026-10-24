import {
  normalizeAccountPortraitId,
} from "../account/portraits";
import { supabase } from "../account/supabase";
import {
  normalizeCustomPuzzleContent,
  validateCustomPuzzle,
  type CustomPuzzleContent,
  type CustomPuzzleMarketplaceEntry,
} from "./model";

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const callRpc = async <T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> => {
  if (!supabase) throw new Error("Account services are not configured.");
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
};

const normalizeMarketplaceEntry = (
  value: unknown,
): CustomPuzzleMarketplaceEntry | undefined => {
  if (!isRecord(value)) return undefined;
  const puzzle = normalizeCustomPuzzleContent(value.puzzle);
  if (
    !puzzle ||
    validateCustomPuzzle(puzzle).length > 0 ||
    typeof value.id !== "string" ||
    typeof value.creatorPublicId !== "string" ||
    typeof value.creatorDisplayName !== "string" ||
    typeof value.createdAt !== "string"
  ) return undefined;
  const friendCompletions = Array.isArray(value.friendCompletions)
    ? value.friendCompletions.flatMap((completion) => {
      if (
        !isRecord(completion) ||
        typeof completion.publicId !== "string" ||
        typeof completion.displayName !== "string" ||
        typeof completion.completedAt !== "string"
      ) return [];
      return [{
        publicId: completion.publicId,
        displayName: completion.displayName,
        portraitId: normalizeAccountPortraitId(completion.portraitId),
        completedAt: completion.completedAt,
      }];
    })
    : [];
  return {
    id: value.id,
    creatorPublicId: value.creatorPublicId,
    creatorDisplayName: value.creatorDisplayName,
    creatorPortraitId: normalizeAccountPortraitId(value.creatorPortraitId),
    puzzle,
    createdAt: value.createdAt,
    completedByMe: value.completedByMe === true,
    ownedByMe: value.ownedByMe === true,
    friendCompletions,
  };
};

export const loadCustomPuzzleMarketplace = async (
  friendsOnly: boolean,
): Promise<CustomPuzzleMarketplaceEntry[]> => {
  const value = await callRpc<unknown>("custom_puzzle_marketplace", {
    friends_only: friendsOnly,
  });
  if (!Array.isArray(value)) {
    throw new Error("The custom puzzle marketplace returned invalid data.");
  }
  return value.flatMap((entry) => {
    const normalized = normalizeMarketplaceEntry(entry);
    return normalized ? [normalized] : [];
  });
};

export const publishCustomPuzzle = async ({
  puzzle,
  turnsUsed,
  puzzleId,
}: {
  puzzle: CustomPuzzleContent;
  turnsUsed: number;
  puzzleId?: string;
}): Promise<string> => {
  const normalizedPuzzle = normalizeCustomPuzzleContent(puzzle);
  if (
    !normalizedPuzzle ||
    validateCustomPuzzle(normalizedPuzzle).length > 0
  ) {
    throw new Error("The custom puzzle is not valid.");
  }
  const value = await callRpc<unknown>("publish_custom_puzzle", {
    puzzle_payload: normalizedPuzzle,
    verified_turns: turnsUsed,
    target_puzzle_id: puzzleId ?? null,
  });
  if (typeof value !== "string") {
    throw new Error("The published puzzle did not return an ID.");
  }
  return value;
};

export const recordCustomPuzzleCompletion = async (
  puzzleId: string,
  turnsUsed: number,
) => {
  await callRpc("record_custom_puzzle_completion", {
    target_puzzle_id: puzzleId,
    turns_used: turnsUsed,
  });
};
