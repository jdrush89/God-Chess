import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadCloudDailyPuzzleGiveUps,
  upsertCloudDailyPuzzleGiveUps,
} from "./cloudDailyPuzzleGiveUps";

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

describe("cloud Daily puzzle give-ups", () => {
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

  it("loads and normalizes given-up Daily puzzle ids", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        game: {
          version: 1,
          puzzleIds: [
            "daily-2026-10-14",
            "unknown",
            "daily-2026-10-14",
          ],
        },
      },
      error: null,
    });

    await expect(loadCloudDailyPuzzleGiveUps("user-1"))
      .resolves.toEqual(["daily-2026-10-14"]);
    expect(mocks.from).toHaveBeenCalledWith("game_saves");
  });

  it("upserts normalized give-ups separately from normal saved games", async () => {
    mocks.upsert.mockResolvedValue({ error: null });

    await upsertCloudDailyPuzzleGiveUps("user-1", [
      "daily-2026-10-14",
      "daily-2026-10-14",
    ]);

    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "user-1",
      id: "__daily_puzzle_give_ups_v1__",
      game: {
        version: 1,
        puzzleIds: ["daily-2026-10-14"],
      },
    }));
  });
});
