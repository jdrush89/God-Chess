import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPlayerStatisticsProgress } from "../playerStatistics";
import {
  loadCloudPlayerStatistics,
  upsertCloudPlayerStatistics,
} from "./cloudPlayerStatistics";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  maybeSingle: vi.fn(),
  upsertPrivate: vi.fn(),
  upsertPublic: vi.fn(),
}));

vi.mock("./supabase", () => ({
  supabase: {
    from: mocks.from,
  },
}));

describe("cloud player statistics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const query = {
      eq: vi.fn(),
      maybeSingle: mocks.maybeSingle,
    };
    query.eq.mockReturnValue(query);
    mocks.from.mockImplementation((table: string) => ({
      select: vi.fn(() => query),
      upsert: table === "player_stats"
        ? mocks.upsertPrivate
        : mocks.upsertPublic,
    }));
  });
  it("loads private progress from the dedicated stats table", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { progress: createPlayerStatisticsProgress() },
      error: null,
    });
    await expect(loadCloudPlayerStatistics("user-1")).resolves.toEqual(
      createPlayerStatisticsProgress(),
    );
    expect(mocks.from).toHaveBeenCalledWith("player_stats");
  });

  it("stores private progress separately from the sanitized public snapshot", async () => {
    mocks.upsertPrivate.mockResolvedValue({ error: null });
    mocks.upsertPublic.mockResolvedValue({ error: null });
    const progress = createPlayerStatisticsProgress();

    await upsertCloudPlayerStatistics(
      "user-1",
      progress,
      ["centaurs-lance"],
    );

    expect(mocks.upsertPrivate).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "user-1",
      progress,
    }));
    expect(mocks.upsertPublic).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "user-1",
      snapshot: expect.objectContaining({
        totalPuzzlesCompleted: 1,
      }),
    }));
    expect(
      mocks.upsertPublic.mock.calls[0][0].snapshot,
    ).not.toHaveProperty("matches");
  });
});
