import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadCloudCompletedChallenges,
  upsertCloudCompletedChallenges,
} from "./cloudChallengeProgress";

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

describe("cloud challenge progress", () => {
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

  it("loads and normalizes challenge ids from the reserved row", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        game: {
          version: 1,
          completed: ["phalanx", "unknown", "phalanx"],
        },
      },
      error: null,
    });

    await expect(loadCloudCompletedChallenges("user-1"))
      .resolves.toEqual(["phalanx"]);
  });

  it("upserts normalized progress without creating a normal save", async () => {
    mocks.upsert.mockResolvedValue({ error: null });

    await upsertCloudCompletedChallenges("user-1", ["jumped", "jumped"]);

    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "user-1",
      id: "__challenge_progress_v1__",
      game: {
        version: 1,
        completed: ["jumped"],
      },
    }));
  });
});
