import type { GodId } from "./game/types";

export const GOD_ABILITY_ACHIEVEMENT_IDS = {
  quetzacoatl: {
    flight: ["snakes"],
    "air-lift": ["get-outta-there"],
    "air-strike": ["bombs-away"],
  },
  chiron: {
    gallop: ["yeehaw"],
    mount: ["giddy-up"],
    charge: ["horsing-around"],
  },
  anubis: {
    construction: ["anoobus"],
    harden: ["turtle-turtle"],
    monument: ["industry"],
  },
  teles: {
    resonance: ["lullaby"],
    lure: ["seduction"],
    enchant: ["irresistible"],
  },
  artemis: {
    "take-cover": ["get-down"],
    stealth: ["ambush"],
    snipe: ["multikill"],
  },
  kangus: {
    "ritual-sacrifice": ["goadess"],
    "banana-peel": ["oooo-banana", "banana-junkie"],
    rage: ["king-of-the-jungle"],
  },
  death: {
    marked: ["bring-her-back"],
    resurrect: ["twins", "bring-her-back"],
    siphon: ["lifesucker", "mega-drain"],
  },
  leonidas: {
    "royal-step": ["king-in-the-castle"],
    "march-home": ["guess-whos-back"],
    escort: ["posse"],
  },
  medusa: {
    captivate: ["look-at-me"],
    slither: ["queen-cobra"],
    "stone-gaze": ["everybody-chill"],
  },
  salem: {
    hex: ["hex-mix"],
    "poison-cloud": ["choking-hazard"],
    polymorph: ["all-sheep"],
  },
  midas: {
    barter: ["charity"],
    "military-funding": ["pawn-shop"],
    leverage: ["queen-for-hire"],
  },
  ares: {
    threaten: ["threatening-me"],
    "pick-a-fight": ["take-you-all-on"],
    "cull-the-weak": ["widowmaker", "bring-her-down"],
  },
} as const satisfies Record<
  GodId,
  Record<string, readonly string[]>
>;

export const GOD_ACHIEVEMENT_IDS = Object.fromEntries(
  Object.entries(GOD_ABILITY_ACHIEVEMENT_IDS).map(([godId, abilities]) => [
    godId,
    [...new Set(Object.values(abilities).flat())],
  ]),
) as Record<GodId, string[]>;

export const GOD_ACHIEVEMENT_SKIN_IDS = {
  anubis: "tightrope",
  ares: "businessman",
  artemis: "owl-rider",
  chiron: "female",
  death: "disrobed",
  kangus: "genghis",
  leonidas: "playful",
  medusa: "stone-mason",
  midas: "beach",
  quetzacoatl: "pilot",
  salem: "chonk",
  teles: "performance",
} as const satisfies Record<GodId, string>;

export const hasCompletedGodAchievement = (
  completed: Partial<Record<string, string>>,
  godId: GodId,
) => GOD_ACHIEVEMENT_IDS[godId].some((id) => Boolean(completed[id]));

export const isAchievementUnlockedGodSkin = (
  completed: Partial<Record<string, string>>,
  godId: GodId,
  skinId: string,
) =>
  GOD_ACHIEVEMENT_SKIN_IDS[godId] === skinId &&
  hasCompletedGodAchievement(completed, godId);
