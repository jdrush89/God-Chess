import { describe, expect, it } from "vitest";
import schema from "../../supabase/schema.sql?raw";

const customPuzzleSchema = schema.slice(
  schema.indexOf("-- Player-created classic puzzle marketplace."),
  schema.indexOf("-- Ranked classic 1v1 matchmaking"),
);

describe("custom puzzle marketplace schema contract", () => {
  it("stores published puzzles and unique player completions behind RLS", () => {
    expect(customPuzzleSchema).toContain(
      "create table if not exists public.custom_puzzles",
    );
    expect(customPuzzleSchema).toContain(
      "primary key (puzzle_id, user_id)",
    );
    expect(customPuzzleSchema).toContain(
      "alter table public.custom_puzzles enable row level security",
    );
    expect(customPuzzleSchema).toContain(
      "alter table public.custom_puzzle_completions enable row level security",
    );
  });

  it("validates ownership, puzzle shape, Kings, gods, orbs, and turn limits on upload", () => {
    const publish = customPuzzleSchema.slice(
      customPuzzleSchema.indexOf(
        "create or replace function public.publish_custom_puzzle",
      ),
      customPuzzleSchema.indexOf(
        "create or replace function public.custom_puzzle_marketplace",
      ),
    );
    expect(publish).toContain("creator_id = requesting_user_id");
    expect(publish).toContain("Place exactly one % King.");
    expect(publish).toContain("Each player must have three unique gods.");
    expect(publish).toContain("Only selected gods can start resting.");
    expect(publish).toContain(
      "Each player needs at least one god ready to act.",
    );
    expect(publish).toContain("Orb counts must be between 0 and 20.");
    expect(publish).toContain(
      "verified_turns not between 1 and turn_limit_value",
    );
  });

  it("supports all and friends listings plus creator-only friend completion details", () => {
    const marketplace = customPuzzleSchema.slice(
      customPuzzleSchema.indexOf(
        "create or replace function public.custom_puzzle_marketplace",
      ),
      customPuzzleSchema.indexOf(
        "create or replace function public.record_custom_puzzle_completion",
      ),
    );
    expect(marketplace).toContain(
      "public.are_friends(auth.uid(), puzzle.creator_id)",
    );
    expect(marketplace).toContain(
      "when visible.creator_id = auth.uid()",
    );
    expect(marketplace).toContain(
      "public.are_friends(auth.uid(), completion.user_id)",
    );
    expect(schema).toContain(
      "grant execute on function public.custom_puzzle_marketplace(boolean) to anon, authenticated",
    );
    expect(schema).toContain(
      "grant execute on function public.publish_custom_puzzle(jsonb, integer, uuid) to authenticated",
    );
  });
});
