import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGame } from "../game/engine";
import { createSavedGame } from "../saves";
import { loadCloudSavedGames } from "./cloudSaves";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  order: vi.fn(),
}));

vi.mock("./supabase", () => ({
  supabase: {
    from: mocks.from,
  },
}));

describe("cloud saves", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const query = {
      eq: vi.fn(),
      order: mocks.order,
    };
    query.eq.mockReturnValue(query);
    mocks.from.mockReturnValue({
      select: vi.fn(() => query),
    });
  });

  it("discards malformed rows without rejecting valid saves", async () => {
    const valid = createSavedGame("valid", createGame(1), []);
    mocks.order.mockResolvedValue({
      data: [
        null,
        42,
        {
          id: "malformed",
          saved_at: valid.savedAt,
          game: {
            version: 3,
            state: 42,
            undoHistory: [],
          },
        },
        {
          id: valid.id,
          saved_at: valid.savedAt,
          game: valid,
        },
      ],
      error: null,
    });

    await expect(loadCloudSavedGames("user-1")).resolves.toEqual([valid]);
    expect(mocks.from).toHaveBeenCalledWith("game_saves");
  });
});
