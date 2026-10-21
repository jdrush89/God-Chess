import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAchievementProgress } from "../achievements";
import { upsertCloudAchievementProgress } from "./cloudAchievementProgress";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  privateUpsert: vi.fn(),
  publicUpsert: vi.fn(),
}));

vi.mock("./supabase", () => ({
  supabase: {
    from: mocks.from,
  },
}));

describe("cloud achievement progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.privateUpsert.mockResolvedValue({ error: null });
    mocks.publicUpsert.mockResolvedValue({ error: null });
    mocks.from.mockImplementation((table: string) => ({
      upsert: table === "game_saves"
        ? mocks.privateUpsert
        : mocks.publicUpsert,
    }));
  });

  it("stores only completed IDs in the friend-visible snapshot", async () => {
    const progress = createAchievementProgress();
    progress.completed["it-begins"] = "2026-10-20T00:00:00.000Z";

    await upsertCloudAchievementProgress("user-1", progress);

    expect(mocks.privateUpsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "user-1",
      game: expect.objectContaining({ progress }),
    }));
    expect(mocks.publicUpsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "user-1",
      completed_ids: ["it-begins"],
    }));
    expect(mocks.publicUpsert.mock.calls[0][0]).not.toHaveProperty("progress");
  });
});
