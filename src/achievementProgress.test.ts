// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_PROGRESS_KEY,
  loadLocalAchievementProgress,
  normalizeAchievementProgress,
  persistLocalAchievementProgress,
} from "./achievementProgress";
import { createAchievementProgress } from "./achievements";

describe("local achievement progress", () => {
  beforeEach(() => window.localStorage.clear());

  it("round-trips progress through local storage", () => {
    const progress = createAchievementProgress();
    progress.completed["it-begins"] = "2026-01-01T00:00:00.000Z";
    progress.totals.darkOrbsGained = 42;

    persistLocalAchievementProgress(progress);

    expect(loadLocalAchievementProgress()).toEqual(progress);
  });

  it("normalizes malformed stored values", () => {
    window.localStorage.setItem(
      ACHIEVEMENT_PROGRESS_KEY,
      JSON.stringify({
        completed: { unknown: "now", "it-begins": "then" },
        totals: {
          bananasDropped: -4,
          lightOrbsGained: 3.8,
          piecesCaptured: 12.9,
        },
        collections: {
          wonGods: ["salem", "invalid", "salem"],
          polymorphedPieceTypes: ["queen", "dragon"],
          wonThreePlayerVariants: [
            "three-player",
            "invalid",
            "three-player",
            "triad",
          ],
        },
      }),
    );

    const progress = loadLocalAchievementProgress();

    expect(progress.completed).toEqual({ "it-begins": "then" });
    expect(progress.totals.bananasDropped).toBe(0);
    expect(progress.totals.lightOrbsGained).toBe(3);
    expect(progress.totals.piecesCaptured).toBe(12);
    expect(progress.collections.wonGods).toEqual(["salem"]);
    expect(progress.collections.polymorphedPieceTypes).toEqual(["queen"]);
    expect(progress.collections.wonThreePlayerVariants)
      .toEqual(["three-player", "triad"]);
  });

  it("returns an empty progress object for non-object input", () => {
    expect(normalizeAchievementProgress("invalid")).toEqual(
      createAchievementProgress(),
    );
  });
});
