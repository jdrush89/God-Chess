// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRankedLeaderboard } from "./useRankedLeaderboard";

const supabaseHarness = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("../account/supabase", () => ({
  supabase: {
    rpc: supabaseHarness.rpc,
  },
}));

describe("useRankedLeaderboard", () => {
  beforeEach(() => {
    supabaseHarness.rpc.mockReset();
    supabaseHarness.rpc.mockResolvedValue({
      data: [{
        publicId: "gc-athena",
        displayName: "Athena",
        portraitId: "artemis",
        rating: 1724.4,
        deviation: 82,
        volatility: 0.058,
        gamesPlayed: 18,
        wins: 11,
        losses: 5,
        draws: 2,
      }],
      error: null,
    });
  });

  afterEach(cleanup);

  it("loads and normalizes the public top-100 leaderboard", async () => {
    const { result } = renderHook(() => useRankedLeaderboard());

    await waitFor(() => expect(result.current[0].loading).toBe(false));
    expect(supabaseHarness.rpc).toHaveBeenCalledWith("ranked_leaderboard");
    expect(result.current[0].entries).toEqual([
      expect.objectContaining({
        publicId: "gc-athena",
        displayName: "Athena",
        portraitId: "artemis",
        rating: 1724.4,
        gamesPlayed: 18,
      }),
    ]);
  });

  it("surfaces leaderboard failures and supports retry", async () => {
    supabaseHarness.rpc
      .mockResolvedValueOnce({
        data: null,
        error: new Error("Leaderboard unavailable"),
      })
      .mockResolvedValueOnce({ data: [], error: null });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useRankedLeaderboard());

    await waitFor(() =>
      expect(result.current[0].error).toBe("Leaderboard unavailable")
    );
    await act(async () => {
      await result.current[1].refresh();
    });
    expect(result.current[0]).toEqual({
      entries: [],
      loading: false,
    });
    consoleError.mockRestore();
  });
});
