import { describe, expect, it } from "vitest";
import schema from "../../supabase/schema.sql?raw";

const socialSchema = schema.slice(schema.indexOf("-- Social identity"));

describe("social schema privacy contract", () => {
  it("searches only minimal public identity fields", () => {
    expect(socialSchema).toMatch(
      /returns table\(public_id text, display_name text\)/,
    );
    expect(
      socialSchema.slice(
        socialSchema.indexOf("create or replace function public.search_profiles"),
        socialSchema.indexOf("create or replace function public.send_friend_request"),
      ),
    ).not.toMatch(/\bemail\b|\bgame_saves\b/);
  });

  it("limits public stats and achievement snapshots to accepted friends", () => {
    expect(socialSchema).toContain(
      "public.are_friends(auth.uid(), user_id)",
    );
    expect(socialSchema).toContain("player_achievements_public");
    expect(socialSchema).toContain("completed_ids jsonb");
  });

  it("validates friend-only typed invitations and publishes inbox changes", () => {
    expect(socialSchema).toContain(
      "Only accepted friends can be invited",
    );
    expect(socialSchema).toContain(
      "(variant = 'classic' and player_count = 2)",
    );
    expect(socialSchema).toContain(
      "alter publication supabase_realtime add table public.game_invitations",
    );
  });

  it("does not shadow PostgreSQL's current_user identifier in UUID comparisons", () => {
    expect(socialSchema).not.toContain("current_user uuid := auth.uid()");
    expect(socialSchema.match(/current_user_id uuid := auth\.uid\(\)/g))
      .toHaveLength(2);
  });
});
