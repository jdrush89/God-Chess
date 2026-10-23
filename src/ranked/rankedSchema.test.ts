import { describe, expect, it } from "vitest";
import schema from "../../supabase/schema.sql?raw";

const rankedSchema = schema.slice(schema.indexOf("-- Ranked classic"));

describe("ranked schema integrity contract", () => {
  it("issues private color credentials and only returns them to the host", () => {
    expect(rankedSchema).toContain(
      "join_token uuid not null default gen_random_uuid()",
    );
    expect(rankedSchema).toContain(
      "when local_player.is_host then (",
    );
    expect(rankedSchema).toContain(
      "jsonb_object_agg(player.color, player.join_token::text)",
    );
  });

  it("expires unstarted matches and avoids unnecessary matchmaking locks", () => {
    expect(rankedSchema).toContain(
      "match.created_at < now() - interval '2 minutes'",
    );
    expect(rankedSchema).toMatch(
      /if selected_match_id is null and exists \(\s*select 1\s*from public\.ranked_queue queue\s*where queue\.user_id = current_user_id\s*\) then\s*perform public\.try_create_ranked_match\(\)/,
    );
  });

  it("serializes queue departure with matchmaking", () => {
    const joinQueue = rankedSchema.slice(
      rankedSchema.indexOf(
        "create or replace function public.join_ranked_queue",
      ),
      rankedSchema.indexOf(
        "create or replace function public.leave_ranked_queue",
      ),
    );
    const leaveQueue = rankedSchema.slice(
      rankedSchema.indexOf(
        "create or replace function public.leave_ranked_queue",
      ),
      rankedSchema.indexOf(
        "create or replace function public.publish_ranked_room",
      ),
    );
    expect(leaveQueue).toContain(
      "pg_advisory_xact_lock(hashtext('god-chess-ranked-1v1'))",
    );
    expect(joinQueue).toContain(
      "pg_advisory_xact_lock(hashtext('god-chess-ranked-1v1'))",
    );
  });

  it("allows idempotent host publication of the same room", () => {
    const publishRoom = rankedSchema.slice(
      rankedSchema.indexOf(
        "create or replace function public.publish_ranked_room",
      ),
      rankedSchema.indexOf(
        "create or replace function public.report_ranked_result",
      ),
    );
    expect(publishRoom).toContain(
      "match.status = 'playing' and\n        match.room_code = ranked_room_code",
    );
  });

  it("protects submitted results from forfeits and requires both players to agree", () => {
    const reportResult = rankedSchema.slice(
      rankedSchema.indexOf(
        "create or replace function public.report_ranked_result",
      ),
      rankedSchema.indexOf(
        "create or replace function public.forfeit_ranked_match",
      ),
    );
    const forfeit = rankedSchema.slice(
      rankedSchema.indexOf(
        "create or replace function public.forfeit_ranked_match",
      ),
      rankedSchema.indexOf("revoke all on function public.glicko2_volatility_value"),
    );
    expect(reportResult).toContain(
      "having count(*) = 2",
    );
    expect(reportResult).toContain("for update");
    expect(forfeit).toContain(
      "from public.ranked_result_reports report",
    );
    expect(forfeit).toContain("for update");
  });

  it("locks the match before touching player heartbeat rows", () => {
    const status = rankedSchema.slice(
      rankedSchema.indexOf(
        "create or replace function public.ranked_status",
      ),
      rankedSchema.indexOf(
        "create or replace function public.join_ranked_queue",
      ),
    );
    const matchLockIndex = status.indexOf(
      "perform 1\n    from public.ranked_matches match",
    );
    expect(matchLockIndex).toBeGreaterThan(-1);
    expect(matchLockIndex)
      .toBeLessThan(status.indexOf("update public.ranked_match_players player"));
    expect(status).toContain("for update");
  });
});
