// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  favoriteGodSkin,
  GOD_SKINS,
  isGodSkinFor,
  isGodSkinSelections,
  isGodSkinUnlocked,
  loadFavoriteGodSkins,
  persistFavoriteGodSkins,
} from "./godSkins";
import { GOD_ACHIEVEMENT_IDS } from "./achievements";

describe("God skins", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defines the supplied custom skin names for every God", () => {
    expect(Object.fromEntries(
      Object.entries(GOD_SKINS).map(([godId, skins]) => [godId, skins[1].name]),
    )).toEqual({
      anubis: "Tightrope",
      ares: "Businessman",
      artemis: "Owl Rider",
      chiron: "Female",
      death: "Disrobed",
      kangus: "Genghis",
      leonidas: "Playful",
      medusa: "Stone Mason",
      midas: "Beach",
      quetzacoatl: "Pilot",
      salem: "Chonk",
      teles: "Performance",
    });
  });

  it("locks every custom skin by default and unlocks it with any matching God achievement", () => {
    expect(isGodSkinUnlocked("salem", "base")).toBe(true);
    expect(isGodSkinUnlocked("salem", "chonk")).toBe(false);
    expect(isGodSkinUnlocked(
      "salem",
      "chonk",
      { "i-have-the-power": "2026-10-20T12:00:00.000Z" },
    )).toBe(false);
    for (const [godId, skins] of Object.entries(GOD_SKINS)) {
      const achievementId = GOD_ACHIEVEMENT_IDS[
        godId as keyof typeof GOD_ACHIEVEMENT_IDS
      ][0];
      expect(isGodSkinUnlocked(
        godId as keyof typeof GOD_SKINS,
        skins[1].id,
        { [achievementId]: "2026-10-20T12:00:00.000Z" },
      )).toBe(true);
    }
    expect(isGodSkinUnlocked("salem", "tightrope")).toBe(false);
  });

  it("validates that a skin belongs to its God", () => {
    expect(isGodSkinFor("salem", "chonk")).toBe(true);
    expect(isGodSkinFor("anubis", "chonk")).toBe(false);
    expect(isGodSkinSelections({ salem: "chonk" })).toBe(true);
    expect(isGodSkinSelections({ anubis: "tightrope" })).toBe(true);
    expect(isGodSkinSelections({ salem: "tightrope" })).toBe(false);
  });

  it("persists favorites but only applies them after their God achievement unlocks", () => {
    persistFavoriteGodSkins({ salem: "chonk" });
    expect(loadFavoriteGodSkins()).toEqual({ salem: "chonk" });
    expect(favoriteGodSkin(loadFavoriteGodSkins(), "salem")).toBe("base");
    expect(favoriteGodSkin(
      loadFavoriteGodSkins(),
      "salem",
      { "hex-mix": "2026-10-20T12:00:00.000Z" },
    )).toBe("chonk");

    window.localStorage.setItem(
      "god-chess-favorite-skins-v1",
      JSON.stringify({ salem: "tightrope" }),
    );
    expect(loadFavoriteGodSkins()).toEqual({});
  });
});
