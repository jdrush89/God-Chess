import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGame } from "../game/engine";
import { createThreePlayerGame } from "../game/threePlayerEngine";
import {
  createSavedGame,
  isThreePlayerSavedGame,
} from "../saves";
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

  it("loads strict three-player saves through the generic cloud boundary", async () => {
    const valid = createSavedGame(
      "three",
      createThreePlayerGame(),
      [],
    );
    mocks.order.mockResolvedValue({
      data: [{
        id: valid.id,
        saved_at: valid.savedAt,
        game: valid,
      }],
      error: null,
    });

    const games = await loadCloudSavedGames("user-1");
    expect(games).toHaveLength(1);
    expect(isThreePlayerSavedGame(games[0])).toBe(true);
  });
});
