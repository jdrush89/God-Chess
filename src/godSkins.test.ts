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

  it("unlocks every base skin and only Salem's Chonk custom skin", () => {
    expect(isGodSkinUnlocked("salem", "base")).toBe(true);
    expect(isGodSkinUnlocked("salem", "chonk")).toBe(true);
    expect(isGodSkinUnlocked("anubis", "tightrope")).toBe(false);
    expect(isGodSkinUnlocked("salem", "tightrope")).toBe(false);
  });

  it("validates that a skin belongs to its God", () => {
    expect(isGodSkinFor("salem", "chonk")).toBe(true);
    expect(isGodSkinFor("anubis", "chonk")).toBe(false);
    expect(isGodSkinSelections({ salem: "chonk" })).toBe(true);
    expect(isGodSkinSelections({ anubis: "tightrope" })).toBe(false);
  });

  it("persists unlocked favorites and defaults invalid stored values to base", () => {
    persistFavoriteGodSkins({ salem: "chonk" });
    expect(loadFavoriteGodSkins()).toEqual({ salem: "chonk" });
    expect(favoriteGodSkin(loadFavoriteGodSkins(), "salem")).toBe("chonk");

    window.localStorage.setItem(
      "god-chess-favorite-skins-v1",
      JSON.stringify({ anubis: "tightrope" }),
    );
    expect(loadFavoriteGodSkins()).toEqual({});
    expect(favoriteGodSkin(loadFavoriteGodSkins(), "anubis")).toBe("base");
  });
});
