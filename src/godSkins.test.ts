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
import { GOD_ABILITY_ACHIEVEMENT_IDS } from "./achievements";

describe("God skins", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defines the supplied custom skin names for every God", () => {
    expect(Object.fromEntries(
      Object.entries(GOD_SKINS).map(([godId, skins]) => [
        godId,
        skins.slice(1).map(({ name }) => name),
      ]),
    )).toEqual({
      anubis: ["Tightrope"],
      ares: ["Businessman", "Limbo"],
      artemis: ["Owl Rider"],
      chiron: ["Female", "Robot"],
      death: ["Disrobed", "Throne"],
      kangus: ["Genghis", "Heaven"],
      leonidas: ["Playful", "Pride"],
      medusa: ["Stone Mason", "Ring"],
      midas: ["Beach", "Painter"],
      quetzacoatl: ["Pilot", "Child"],
      salem: ["Chonk", "Gas Mask"],
      teles: ["Performance", "Narwhal"],
    });
  });

  it("unlocks original skins after any ability achievement and new skins after all three", () => {
    expect(isGodSkinUnlocked("salem", "base")).toBe(true);
    expect(isGodSkinUnlocked("salem", "chonk")).toBe(false);
    expect(isGodSkinUnlocked("salem", "gas-mask")).toBe(false);
    for (const [godId, skins] of Object.entries(GOD_SKINS)) {
      const typedGodId = godId as keyof typeof GOD_SKINS;
      const achievementIds = Object.values(
        GOD_ABILITY_ACHIEVEMENT_IDS[typedGodId],
      ).map(([achievementId]) => achievementId);
      const oneAchievement = {
        [achievementIds[0]]: "2026-10-20T12:00:00.000Z",
      };
      expect(isGodSkinUnlocked(
        typedGodId,
        skins[1].id,
        oneAchievement,
      )).toBe(true);
      if (skins[2]) {
        expect(isGodSkinUnlocked(
          typedGodId,
          skins[2].id,
          oneAchievement,
        )).toBe(false);
        expect(isGodSkinUnlocked(
          typedGodId,
          skins[2].id,
          Object.fromEntries(achievementIds.map((achievementId) => [
            achievementId,
            "2026-10-20T12:00:00.000Z",
          ])),
        )).toBe(true);
      }
    }
    expect(isGodSkinUnlocked("salem", "tightrope")).toBe(false);
  });

  it("validates that a skin belongs to its God", () => {
    expect(isGodSkinFor("salem", "chonk")).toBe(true);
    expect(isGodSkinFor("salem", "gas-mask")).toBe(true);
    expect(isGodSkinFor("anubis", "chonk")).toBe(false);
    expect(isGodSkinSelections({ salem: "chonk" })).toBe(true);
    expect(isGodSkinSelections({ anubis: "tightrope" })).toBe(true);
    expect(isGodSkinSelections({ salem: "tightrope" })).toBe(false);
  });

  it("applies favorite skins only after their achievement tier is complete", () => {
    persistFavoriteGodSkins({ salem: "chonk" });
    expect(loadFavoriteGodSkins()).toEqual({ salem: "chonk" });
    expect(favoriteGodSkin(loadFavoriteGodSkins(), "salem")).toBe("base");
    expect(favoriteGodSkin(
      loadFavoriteGodSkins(),
      "salem",
      {
        "hex-mix": "2026-10-20T12:00:00.000Z",
      },
    )).toBe("chonk");

    persistFavoriteGodSkins({ salem: "gas-mask" });
    expect(favoriteGodSkin(
      loadFavoriteGodSkins(),
      "salem",
      { "hex-mix": "2026-10-20T12:00:00.000Z" },
    )).toBe("base");
    expect(favoriteGodSkin(
      loadFavoriteGodSkins(),
      "salem",
      {
        "hex-mix": "2026-10-20T12:00:00.000Z",
        "choking-hazard": "2026-10-20T12:00:00.000Z",
        "all-sheep": "2026-10-20T12:00:00.000Z",
      },
    )).toBe("gas-mask");

    window.localStorage.setItem(
      "god-chess-favorite-skins-v1",
      JSON.stringify({ salem: "tightrope" }),
    );
    expect(loadFavoriteGodSkins()).toEqual({});
  });
});
