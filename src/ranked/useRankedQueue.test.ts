// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountProfile } from "../account/useAccount";
import { useRankedQueue } from "./useRankedQueue";

const supabaseHarness = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("../account/supabase", () => ({
  supabase: {
    rpc: supabaseHarness.rpc,
  },
}));

const account: AccountProfile = {
  userId: "user-1",
  email: "athena@example.com",
  displayName: "Athena",
  portraitId: "artemis",
};

const matchedPayload = {
  phase: "matched",
  rating: {
    rating: 1512,
    deviation: 240,
    volatility: 0.06,
    gamesPlayed: 4,
    wins: 2,
    losses: 1,
    draws: 1,
  },
  match: {
    id: "match-1",
    roomCode: "ABCDE",
    joinToken: "black-token",
    color: "black",
    host: false,
    participants: [],
  },
};

describe("useRankedQueue", () => {
  beforeEach(() => {
    supabaseHarness.rpc.mockReset();
    supabaseHarness.rpc.mockResolvedValue({
      data: matchedPayload,
      error: null,
    });
  });

  afterEach(cleanup);

  it("loads status for an authenticated account and controls match heartbeats", async () => {
    const { result } = renderHook(() => useRankedQueue(account));

    await waitFor(() => expect(result.current[0].phase).toBe("matched"));
    expect(supabaseHarness.rpc).toHaveBeenNthCalledWith(1, "ranked_status", {
      target_match_id: null,
      touch_match: true,
    });

    act(() => result.current[1].setMatchHeartbeat(false));
    await act(async () => {
      await result.current[1].refresh();
    });
    expect(supabaseHarness.rpc).toHaveBeenLastCalledWith("ranked_status", {
      target_match_id: "match-1",
      touch_match: false,
    });
  });

  it("does not contact ranked services without an account", async () => {
    const { result } = renderHook(() => useRankedQueue());

    expect(result.current[0]).toEqual({
      phase: "idle",
      loading: false,
    });
    await act(async () => {
      await result.current[1].refresh();
    });
    expect(supabaseHarness.rpc).not.toHaveBeenCalled();
  });

  it("surfaces queue RPC failures without returning success-shaped state", async () => {
    supabaseHarness.rpc.mockResolvedValueOnce({
      data: null,
      error: new Error("Matchmaking unavailable"),
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useRankedQueue(account));

    await waitFor(() =>
      expect(result.current[0].error).toBe("Matchmaking unavailable")
    );
    expect(result.current[0].phase).toBe("idle");
    expect(result.current[0].loading).toBe(false);
    consoleError.mockRestore();
  });

  it("reports classic winners by color", async () => {
    const { result } = renderHook(() => useRankedQueue(account));
    await waitFor(() => expect(result.current[0].phase).toBe("matched"));

    await act(async () => {
      await result.current[1].reportResult("match-1", "white");
    });

    expect(supabaseHarness.rpc).toHaveBeenLastCalledWith(
      "report_ranked_result",
      {
        target_match_id: "match-1",
        winning_color: "white",
      },
    );
  });
});
