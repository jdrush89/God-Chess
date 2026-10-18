import {
  ACHIEVEMENT_BY_ID,
  createAchievementProgress,
  mergeAchievementProgress,
  type AchievementId,
  type AchievementProgress,
  type MatchAchievementProgress,
} from "./achievements";
import { GODS } from "./game/gods";
import {
  THREE_PLAYER_BOARD_VARIANTS,
  type ThreePlayerBoardVariant,
} from "./game/threePlayerTypes";
import type { GodId, PieceType } from "./game/types";

export const ACHIEVEMENT_PROGRESS_KEY = "god-chess-achievements-v1";

const nonNegativeInteger = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;

const numberRecord = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      nonNegativeInteger(entry),
    ]),
  );
};

const stringArrayRecord = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      Array.isArray(entry)
        ? [...new Set(entry.filter((item): item is string =>
          typeof item === "string"
        ))]
        : [],
    ]),
  );
};

const normalizeMatch = (value: unknown): MatchAchievementProgress => {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<MatchAchievementProgress>
    : {};
  const luredQueens = source.luredQueens &&
      typeof source.luredQueens === "object" &&
      !Array.isArray(source.luredQueens)
    ? Object.fromEntries(
      Object.entries(source.luredQueens).flatMap(([id, entry]) => {
        if (
          !entry ||
          typeof entry !== "object" ||
          typeof entry.actor !== "string"
        ) return [];
        return [[id, {
          actor: entry.actor,
          localTurn: nonNegativeInteger(entry.localTurn),
        }]];
      }),
    )
    : {};
  return {
    localTurns: numberRecord(source.localTurns),
    kingCaptureTurns: Object.fromEntries(
      Object.entries(source.kingCaptureTurns ?? {}).map(([key, entry]) => [
        key,
        Array.isArray(entry) ? entry.map(nonNegativeInteger) : [],
      ]),
    ),
    snipeCaptures: numberRecord(source.snipeCaptures),
    bananasDropped: numberRecord(source.bananasDropped),
    siphonedLight: numberRecord(source.siphonedLight),
    gallopOrbs: numberRecord(source.gallopOrbs),
    constructionLight: numberRecord(source.constructionLight),
    abilityMovedPieces: stringArrayRecord(source.abilityMovedPieces),
    abilityCapturedPieces: stringArrayRecord(source.abilityCapturedPieces),
    resurrectedQueens: stringArrayRecord(source.resurrectedQueens),
    luredQueens,
    markedQueens: stringArrayRecord(source.markedQueens),
  };
};

const knownGods = new Set(GODS.map((god) => god.id));
const knownAbilities = new Set(
  GODS.flatMap((god) => god.abilities.map((ability) => ability.id)),
);
const pieceTypes = new Set<PieceType>([
  "king",
  "queen",
  "rook",
  "bishop",
  "knight",
  "pawn",
]);
const threePlayerBoardVariants = new Set<ThreePlayerBoardVariant>(
  THREE_PLAYER_BOARD_VARIANTS,
);

export const normalizeAchievementProgress = (
  value: unknown,
): AchievementProgress => {
  const empty = createAchievementProgress();
  if (!value || typeof value !== "object" || Array.isArray(value)) return empty;
  const source = value as Partial<AchievementProgress>;
  const completed = Object.fromEntries(
    Object.entries(source.completed ?? {}).filter(([id, completedAt]) =>
      Object.hasOwn(ACHIEVEMENT_BY_ID, id) && typeof completedAt === "string"
    ),
  ) as AchievementProgress["completed"];
  const totals = source.totals ?? empty.totals;
  const collections = source.collections ?? empty.collections;
  const matches = source.matches &&
      typeof source.matches === "object" &&
      !Array.isArray(source.matches)
    ? Object.fromEntries(
      Object.entries(source.matches)
        .slice(-20)
        .map(([id, match]) => [id, normalizeMatch(match)]),
    )
    : {};
  return {
    version: 1,
    completed,
    totals: {
      cullQueens: nonNegativeInteger(totals.cullQueens),
      bananasDropped: nonNegativeInteger(totals.bananasDropped),
      siphonedLight: nonNegativeInteger(totals.siphonedLight),
      poisonedPieces: nonNegativeInteger(totals.poisonedPieces),
      leveragedQueens: nonNegativeInteger(totals.leveragedQueens),
      lightOrbsGained: nonNegativeInteger(totals.lightOrbsGained),
      darkOrbsGained: nonNegativeInteger(totals.darkOrbsGained),
      piecesCaptured: nonNegativeInteger(totals.piecesCaptured),
    },
    collections: {
      wonGods: [...new Set(
        (collections.wonGods ?? []).filter(
          (godId): godId is GodId =>
            typeof godId === "string" && knownGods.has(godId as GodId),
        ),
      )],
      usedAbilities: [...new Set(
        (collections.usedAbilities ?? []).filter(
          (abilityId): abilityId is string =>
            typeof abilityId === "string" &&
            knownAbilities.has(abilityId),
        ),
      )],
      polymorphedPieceTypes: [...new Set(
        (collections.polymorphedPieceTypes ?? []).filter(
          (pieceType): pieceType is PieceType =>
            typeof pieceType === "string" &&
            pieceTypes.has(pieceType as PieceType),
        ),
      )],
      wonThreePlayerVariants: [...new Set(
        (collections.wonThreePlayerVariants ?? []).filter(
          (variant): variant is ThreePlayerBoardVariant =>
            typeof variant === "string" &&
            threePlayerBoardVariants.has(variant as ThreePlayerBoardVariant),
        ),
      )],
    },
    matches,
  };
};

export const loadLocalAchievementProgress = (): AchievementProgress => {
  try {
    const raw = window.localStorage.getItem(ACHIEVEMENT_PROGRESS_KEY);
    return normalizeAchievementProgress(raw ? JSON.parse(raw) : undefined);
  } catch (error) {
    console.error("Unable to load local achievement progress.", error);
    return createAchievementProgress();
  }
};

export const persistLocalAchievementProgress = (
  progress: AchievementProgress,
) => {
  const normalized = normalizeAchievementProgress(progress);
  window.localStorage.setItem(
    ACHIEVEMENT_PROGRESS_KEY,
    JSON.stringify(normalized),
  );
};

export const mergeNormalizedAchievementProgress = (
  first: unknown,
  second: unknown,
) => mergeAchievementProgress(
  normalizeAchievementProgress(first),
  normalizeAchievementProgress(second),
);

export const completedAchievementIds = (
  progress: AchievementProgress,
): AchievementId[] => Object.keys(progress.completed)
  .filter((id): id is AchievementId => Object.hasOwn(ACHIEVEMENT_BY_ID, id));
