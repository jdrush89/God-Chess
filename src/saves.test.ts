// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { createFourPlayerGame, fourPlayerReducer } from "./game/fourPlayerEngine";
import { createGame } from "./game/engine";
import {
  createSavedGame,
  isFourPlayerSavedGame,
  LEGACY_SAVE_KEY,
  loadLocalSavedGames,
  normalizeSavedGame,
  SAVE_KEY,
} from "./saves";

describe("saved-game variants", () => {
  it("normalizes a strict four-player state and matching undo snapshots", () => {
    const state = fourPlayerReducer(createFourPlayerGame(), {
      type: "draft",
      godId: "ares",
    });
    const saved = createSavedGame("four", state, [createFourPlayerGame()]);
    const normalized = normalizeSavedGame(JSON.parse(JSON.stringify(saved)));
    expect(normalized && isFourPlayerSavedGame(normalized)).toBe(true);
    if (!normalized || !isFourPlayerSavedGame(normalized)) return;
    expect(normalized.state.variant).toBe("four-player");
    expect(normalized.state.players.north.gods).toEqual(["ares"]);
    expect(normalized.undoHistory).toHaveLength(1);
  });
  it("rejects mixed-variant undo histories", () => {
    const state = createFourPlayerGame();
    const malformed = {
      version: 3,
      id: "mixed",
      savedAt: new Date().toISOString(),
      state,
      undoHistory: [createGame(1)],
    };
    expect(normalizeSavedGame(malformed)).toBeUndefined();
  });

  it("continues normalizing existing two-player saves", () => {
    const state = createGame(1);
    const normalized = normalizeSavedGame({
      version: 3,
      id: "two",
      savedAt: new Date().toISOString(),
      state,
      undoHistory: [state],
    });
    expect(normalized && !isFourPlayerSavedGame(normalized)).toBe(true);
  });

  it("rejects primitive state values without throwing", () => {
    expect(() => normalizeSavedGame({
      version: 3,
      id: "malformed",
      savedAt: new Date().toISOString(),
      state: 42,
      undoHistory: [],
    })).not.toThrow();
    expect(normalizeSavedGame({
      version: 3,
      id: "malformed",
      savedAt: new Date().toISOString(),
      state: 42,
      undoHistory: [],
    })).toBeUndefined();
  });

  it("discards malformed local records without losing valid saves", () => {
    const valid = createSavedGame("valid", createGame(1), []);
    window.localStorage.setItem(SAVE_KEY, JSON.stringify([
      42,
      { version: 3, id: "bad", savedAt: valid.savedAt, state: null },
      valid,
    ]));
    expect(loadLocalSavedGames()).toEqual([valid]);
  });

  it("discards a malformed legacy record without losing current saves", () => {
    const valid = createSavedGame("valid", createGame(1), []);
    window.localStorage.setItem(SAVE_KEY, JSON.stringify([valid]));
    window.localStorage.setItem(LEGACY_SAVE_KEY, "{not-json");
    expect(loadLocalSavedGames()).toEqual([valid]);
    expect(window.localStorage.getItem(LEGACY_SAVE_KEY)).toBeNull();
  });
});
