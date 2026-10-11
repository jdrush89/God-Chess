import type { GodId } from "./game/types";

export type GodSkinId =
  | "base"
  | "tightrope"
  | "businessman"
  | "owl-rider"
  | "female"
  | "disrobed"
  | "genghis"
  | "playful"
  | "stone-mason"
  | "beach"
  | "pilot"
  | "chonk"
  | "performance";

export interface GodSkin {
  id: GodSkinId;
  name: string;
  src: string;
}

export type GodSkinSelections = Partial<Record<GodId, GodSkinId>>;

const FAVORITES_KEY = "god-chess-favorite-skins-v1";

const basePortraits: Record<GodId, string> = {
  quetzacoatl: new URL("./assets/gods/quetzacoatl.jpg", import.meta.url).href,
  chiron: new URL("./assets/gods/chiron.jpg", import.meta.url).href,
  anubis: new URL("./assets/gods/anubis.jpg", import.meta.url).href,
  teles: new URL("./assets/gods/teles.jpg", import.meta.url).href,
  artemis: new URL("./assets/gods/artemis.jpg", import.meta.url).href,
  kangus: new URL("./assets/gods/kangus.jpg", import.meta.url).href,
  death: new URL("./assets/gods/death.jpg", import.meta.url).href,
  leonidas: new URL("./assets/gods/leonidas.jpg", import.meta.url).href,
  medusa: new URL("./assets/gods/medusa.jpg", import.meta.url).href,
  salem: new URL("./assets/gods/salem.jpg", import.meta.url).href,
  midas: new URL("./assets/gods/midas.jpg", import.meta.url).href,
  ares: new URL("./assets/gods/ares.jpg", import.meta.url).href,
};

const customSkins: Record<GodId, GodSkin> = {
  anubis: {
    id: "tightrope",
    name: "Tightrope",
    src: new URL("./assets/skins/Anubis-Tightrope-Skin.webp", import.meta.url).href,
  },
  ares: {
    id: "businessman",
    name: "Businessman",
    src: new URL("./assets/skins/Ares-Businessman-Skin.webp", import.meta.url).href,
  },
  artemis: {
    id: "owl-rider",
    name: "Owl Rider",
    src: new URL("./assets/skins/Artemis-Owl-Rider-Skin.webp", import.meta.url).href,
  },
  chiron: {
    id: "female",
    name: "Female",
    src: new URL("./assets/skins/Chiron-Female-Skin.webp", import.meta.url).href,
  },
  death: {
    id: "disrobed",
    name: "Disrobed",
    src: new URL("./assets/skins/Death-Disrobed-Skin.webp", import.meta.url).href,
  },
  kangus: {
    id: "genghis",
    name: "Genghis",
    src: new URL("./assets/skins/Kangus-Kong-Genghis-Skin.webp", import.meta.url).href,
  },
  leonidas: {
    id: "playful",
    name: "Playful",
    src: new URL("./assets/skins/Leonidas-Playful-Skin.webp", import.meta.url).href,
  },
  medusa: {
    id: "stone-mason",
    name: "Stone Mason",
    src: new URL("./assets/skins/Medusa-Stone-Mason-Skin.webp", import.meta.url).href,
  },
  midas: {
    id: "beach",
    name: "Beach",
    src: new URL("./assets/skins/Midas-Beach-Skin.webp", import.meta.url).href,
  },
  quetzacoatl: {
    id: "pilot",
    name: "Pilot",
    src: new URL("./assets/skins/Quetzacoatl-Pilot-Skin.webp", import.meta.url).href,
  },
  salem: {
    id: "chonk",
    name: "Chonk",
    src: new URL("./assets/skins/Salem-Chonk-Skin.webp", import.meta.url).href,
  },
  teles: {
    id: "performance",
    name: "Performance",
    src: new URL("./assets/skins/Teles-Performance-Skin.webp", import.meta.url).href,
  },
};

export const GOD_SKINS = Object.fromEntries(
  (Object.keys(basePortraits) as GodId[]).map((godId) => [
    godId,
    [
      { id: "base", name: "Base", src: basePortraits[godId] },
      customSkins[godId],
    ],
  ]),
) as Record<GodId, GodSkin[]>;

export const godSkin = (godId: GodId, skinId: GodSkinId = "base") =>
  GOD_SKINS[godId].find((skin) => skin.id === skinId) ?? GOD_SKINS[godId][0];

export const isGodSkinId = (value: unknown): value is GodSkinId =>
  typeof value === "string" &&
  Object.values(GOD_SKINS).some((skins) => skins.some((skin) => skin.id === value));

export const isGodSkinFor = (
  godId: GodId,
  skinId: unknown,
): skinId is GodSkinId =>
  typeof skinId === "string" &&
  GOD_SKINS[godId].some((skin) => skin.id === skinId);

export const isGodSkinUnlocked = (godId: GodId, skinId: GodSkinId) =>
  skinId === "base" || (godId === "salem" && skinId === "chonk");

export const draftedGodSkin = (
  selections: GodSkinSelections | undefined,
  godId: GodId,
) => {
  const skinId = selections?.[godId];
  return skinId && isGodSkinFor(godId, skinId) ? skinId : "base";
};

export const isGodSkinSelections = (
  value: unknown,
  _draftedGods?: GodId[],
): value is GodSkinSelections => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([godId, skinId]) => {
    const typedGodId = godId as GodId;
    return typedGodId in GOD_SKINS &&
      isGodSkinFor(typedGodId, skinId) &&
      isGodSkinUnlocked(typedGodId, skinId);
  });
};

export const loadFavoriteGodSkins = (): GodSkinSelections => {
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return isGodSkinSelections(parsed) ? parsed : {};
  } catch (error) {
    console.error("Unable to load favorite God skins.", error);
    return {};
  }
};

export const persistFavoriteGodSkins = (favorites: GodSkinSelections) => {
  if (!isGodSkinSelections(favorites)) {
    throw new Error("Cannot persist invalid favorite God skins.");
  }
  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  } catch (error) {
    console.error("Unable to save favorite God skins.", error);
  }
};

export const favoriteGodSkin = (
  favorites: GodSkinSelections,
  godId: GodId,
) => {
  const skinId = draftedGodSkin(favorites, godId);
  return isGodSkinUnlocked(godId, skinId) ? skinId : "base";
};
