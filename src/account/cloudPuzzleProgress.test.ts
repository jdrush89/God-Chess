import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadCloudCompletedPuzzles,
  upsertCloudCompletedPuzzles,
} from "./cloudPuzzleProgress";

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

describe("cloud puzzle progress", () => {
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

  it("loads and normalizes completed puzzle ids from the progress row", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        game: {
          version: 1,
          completedPuzzleIds: ["centaurs-lance", "unknown", "centaurs-lance"],
        },
      },
      error: null,
    });

    await expect(loadCloudCompletedPuzzles("user-1")).resolves.toEqual(["centaurs-lance"]);
    expect(mocks.from).toHaveBeenCalledWith("game_saves");
  });

  it("upserts normalized progress without creating a normal saved game", async () => {
    mocks.upsert.mockResolvedValue({ error: null });

    await upsertCloudCompletedPuzzles("user-1", ["centaurs-lance", "centaurs-lance"]);

    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "user-1",
      id: "__puzzle_progress_v1__",
      game: {
        version: 1,
        completedPuzzleIds: ["centaurs-lance"],
      },
    }));
  });
});
