import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadCloudDailyPuzzleRatings,
  upsertCloudDailyPuzzleRatings,
} from "./cloudDailyPuzzleRatings";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  maybeSingle: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("./supabase", () => ({
  supabase: {
    from: mocks.from,
  },
}));

describe("cloud Daily puzzle ratings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const query = {
      eq: vi.fn(),
      maybeSingle: mocks.maybeSingle,
    };
    query.eq.mockReturnValue(query);
    mocks.from.mockReturnValue({
      select: vi.fn(() => query),
      upsert: mocks.upsert,
    });
  });

  it("loads and normalizes Daily ratings", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        game: {
          version: 1,
          ratings: {
            "daily-2026-10-19": "up",
            "daily-2026-10-20": "down",
            unknown: "up",
          },
        },
      },
      error: null,
    });

    await expect(loadCloudDailyPuzzleRatings("user-1")).resolves.toEqual({
      "daily-2026-10-19": "up",
      "daily-2026-10-20": "down",
    });
  });

  it("upserts normalized ratings separately from saved games", async () => {
    mocks.upsert.mockResolvedValue({ error: null });

    await upsertCloudDailyPuzzleRatings("user-1", {
      "daily-2026-10-19": "up",
    });

    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "user-1",
      id: "__daily_puzzle_ratings_v1__",
      game: {
        version: 1,
        ratings: {
          "daily-2026-10-19": "up",
        },
      },
    }));
  });
});
