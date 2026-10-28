import { describe, expect, it } from "vitest";
import schema from "../../supabase/schema.sql?raw";

describe("balance analytics schema", () => {
  it("accepts anonymous reports only through the validated RPC", () => {
    expect(schema).toContain(
      "create table if not exists public.balance_match_reports",
    );
    expect(schema).toContain(
      "revoke all on table public.balance_match_reports from anon, authenticated",
    );
    expect(schema).toContain(
      "grant execute on function public.report_balance_match(text, text, text, text, jsonb)",
    );
    expect(schema).toContain("if octet_length(p_report::text) > 131072");
  });

  it("provides protected analysis views for every requested metric", () => {
    for (const view of [
      "balance_games_by_mode",
      "balance_god_pick_rates",
      "balance_god_win_rates",
      "balance_ability_usage",
      "balance_ability_upgrade_timing",
    ]) {
      expect(schema).toContain(`create or replace view public.${view}`);
    }
    expect(schema).toContain("selection_method");
    expect(schema).toContain("average_turn");
    expect(schema).toContain("games_started");
    expect(schema).toContain("games_completed");
  });
});
