import type { SavedGame } from "../saves";
import { normalizeSavedGame, sortSavedGames } from "../saves";
import { supabase } from "./supabase";

interface CloudSaveRow {
  id: string;
  saved_at: string;
  game: unknown;
}

export const loadCloudSavedGames = async (userId: string): Promise<SavedGame[]> => {
  if (!supabase) throw new Error("Account services are not configured.");
  const { data, error } = await supabase
    .from("game_saves")
    .select("id, saved_at, game")
    .eq("user_id", userId)
    .order("saved_at", { ascending: false });
  if (error) throw error;
  return sortSavedGames((data as CloudSaveRow[]).flatMap((row) => {
    const game = normalizeSavedGame({
      ...(typeof row.game === "object" && row.game ? row.game : {}),
      id: row.id,
      savedAt: row.saved_at,
    });
    return game ? [game] : [];
  }));
};

export const upsertCloudSavedGame = async (userId: string, game: SavedGame) => {
  if (!supabase) throw new Error("Account services are not configured.");
  const { error } = await supabase.from("game_saves").upsert({
    user_id: userId,
    id: game.id,
    saved_at: game.savedAt,
    game,
  });
  if (error) throw error;
};

export const deleteCloudSavedGame = async (userId: string, id: string) => {
  if (!supabase) throw new Error("Account services are not configured.");
  const { error } = await supabase
    .from("game_saves")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw error;
};
