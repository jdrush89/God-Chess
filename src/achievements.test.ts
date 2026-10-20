import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_DEFINITIONS,
  applyAchievementTransition,
  completeCryptologistIfEligible,
  completeDailyAchievementsIfEligible,
  createAchievementProgress,
  dailyPuzzleCompletionStats,
  GOD_ABILITY_ACHIEVEMENT_IDS,
  GOD_ACHIEVEMENT_IDS,
  hasCompletedGodAchievement,
  mergeAchievementProgress,
  type AchievementId,
} from "./achievements";
import { createGame } from "./game/engine";
import { GODS } from "./game/gods";
import { createDefaultThreePlayerConfig } from "./game/threePlayerConfig";
import { createThreePlayerGame } from "./game/threePlayerEngine";
import { THREE_PLAYER_BOARD_VARIANTS } from "./game/threePlayerTypes";
import type { GameState } from "./game/types";

const playableState = (): GameState => {
  const state = createGame(1, { mode: "local" });
  state.phase = "play";
  state.activeColor = "white";
  state.players.white.gods = ["death"];
  state.players.black.gods = ["ares"];
  return state;
};

describe("achievement progress", () => {
  it("defines all 55 unique achievements", () => {
    expect(ACHIEVEMENT_DEFINITIONS).toHaveLength(55);
    expect(new Set(ACHIEVEMENT_DEFINITIONS.map(({ id }) => id)).size).toBe(55);
  });

  it("associates every God with achievement unlocks covering its three abilities", () => {
    const knownIds = new Set(ACHIEVEMENT_DEFINITIONS.map(({ id }) => id));
    const associatedIds = Object.values(GOD_ACHIEVEMENT_IDS).flat();

    expect(new Set(associatedIds).size).toBe(associatedIds.length);
    for (const god of GODS) {
      const ids = GOD_ACHIEVEMENT_IDS[god.id];
      expect(Object.keys(GOD_ABILITY_ACHIEVEMENT_IDS[god.id]).sort()).toEqual(
        god.abilities.map(({ id }) => id).sort(),
      );
      expect(ids.every((id) => knownIds.has(id as AchievementId))).toBe(true);
      expect(hasCompletedGodAchievement({
        [ids[0]]: "2026-10-20T12:00:00.000Z",
      }, god.id)).toBe(true);
    }
  });

  it("unlocks wins and records winning Gods", () => {
    const before = playableState();
    const after = structuredClone(before);
    after.phase = "gameover";
    after.winner = "white";

    const update = applyAchievementTransition(createAchievementProgress(), {
      variant: "classic",
      matchId: "win",
      localActors: ["white"],
      before,
      after,
    });

    expect(update.progress.completed["it-begins"]).toBeTruthy();
    expect(update.progress.collections.wonGods).toEqual(["death"]);
    expect(update.progress.matches.win).toBeUndefined();
  });

  it("does not award action achievements for AI turns", () => {
    const before = playableState();
    before.selectedAbility = "cull-the-weak";
    const after = structuredClone(before);
    delete after.board.d8;
    after.turn += 1;
    after.activeColor = "black";

    const update = applyAchievementTransition(createAchievementProgress(), {
      variant: "classic",
      matchId: "ai-action",
      localActors: ["black"],
      before,
      after,
    });

    expect(update.progress.totals.cullQueens).toBe(0);
    expect(update.progress.completed["bring-her-down"]).toBeUndefined();
  });

  it("tracks cumulative Cull the Weak queen captures", () => {
    let progress = createAchievementProgress();
    for (let capture = 0; capture < 5; capture += 1) {
      const before = playableState();
      before.selectedAbility = "cull-the-weak";
      const after = structuredClone(before);
      delete after.board.d8;
      after.turn += 1;
      after.activeColor = "black";
      progress = applyAchievementTransition(progress, {
        variant: "classic",
        matchId: `cull-${capture}`,
        localActors: ["white"],
        before,
        after,
      }).progress;
    }

    expect(progress.completed["bring-her-down"]).toBeTruthy();
    expect(progress.completed.widowmaker).toBeTruthy();
    expect(progress.totals.cullQueens).toBe(5);
  });

  it("tracks a single Rage across multiple reducer transitions", () => {
    const before = playableState();
    before.selectedAbility = "rage";
    for (let index = 0; index < 7; index += 1) {
      before.board[`a${index + 1}`] = {
        ...before.board.a7,
        id: `rage-target-${index}`,
      };
    }
    const middle = structuredClone(before);
    delete middle.board.a1;
    let progress = applyAchievementTransition(createAchievementProgress(), {
      variant: "classic",
      matchId: "rage",
      localActors: ["white"],
      before,
      after: middle,
    }).progress;
    const after = structuredClone(middle);
    for (let index = 2; index <= 7; index += 1) delete after.board[`a${index}`];
    after.selectedAbility = undefined;
    after.activeColor = "black";
    after.turn += 1;

    progress = applyAchievementTransition(progress, {
      variant: "classic",
      matchId: "rage",
      localActors: ["white"],
      before: middle,
      after,
    }).progress;

    expect(progress.completed["king-of-the-jungle"]).toBeTruthy();
  });

  it("counts both Queens before completing a multi-step Resurrect", () => {
    const before = playableState();
    before.selectedAbility = "resurrect";
    const queen = before.board.d1;
    const middle = structuredClone(before);
    middle.board.a4 = { ...queen, id: "revived-queen-1" };
    let progress = applyAchievementTransition(createAchievementProgress(), {
      variant: "classic",
      matchId: "twins",
      localActors: ["white"],
      before,
      after: middle,
    }).progress;
    const after = structuredClone(middle);
    after.board.b4 = { ...queen, id: "revived-queen-2" };
    after.selectedAbility = undefined;
    after.activeColor = "black";
    after.turn += 1;

    progress = applyAchievementTransition(progress, {
      variant: "classic",
      matchId: "twins",
      localActors: ["white"],
      before: middle,
      after,
    }).progress;

    expect(progress.completed.twins).toBeTruthy();
  });

  it("awards Goadess when an opponent captures the ritual Queen", () => {
    const before = playableState();
    before.activeColor = "black";
    before.board.d1.status.ritual = { owner: "white", expires: 2 };
    const after = structuredClone(before);
    delete after.board.d1;
    after.players.white.orbs.white += 1;

    const progress = applyAchievementTransition(createAchievementProgress(), {
      variant: "classic",
      matchId: "goad",
      localActors: ["white"],
      before,
      after,
    }).progress;

    expect(progress.completed.goadess).toBeTruthy();
  });

  it("requires 25 total puzzle completions, including Dailies", () => {
    const incomplete = completeCryptologistIfEligible(
      createAchievementProgress(),
      { easy: 5, medium: 10, hard: 9 },
    );
    expect(incomplete.completed.cryptologist).toBeUndefined();

    const complete = completeCryptologistIfEligible(
      incomplete,
      { easy: 5, medium: 10, hard: 9, daily: 1 },
    );
    expect(complete.completed.cryptologist).toBeTruthy();
  });

  it("unlocks Daily achievements from unique historical completion dates", () => {
    const ids = Array.from({ length: 50 }, (_, offset) => {
      const date = new Date(Date.UTC(2026, 0, 1 + offset))
        .toISOString()
        .slice(0, 10);
      return `daily-${date}`;
    });
    const stats = dailyPuzzleCompletionStats([
      ...ids,
      ids[0],
      "daily-not-a-date",
      "position-one",
    ]);
    const progress = completeDailyAchievementsIfEligible(
      createAchievementProgress(),
      ids,
    );

    expect(stats).toEqual({ completed: 50, longestStreak: 50 });
    expect(progress.completed.consistency).toBeTruthy();
    expect(progress.completed.veteran).toBeTruthy();
  });

  it("preserves the longest Daily streak after a missed day", () => {
    expect(dailyPuzzleCompletionStats([
      "daily-2026-01-01",
      "daily-2026-01-02",
      "daily-2026-01-04",
      "daily-2026-01-05",
      "daily-2026-01-06",
      "daily-2026-01-07",
      "daily-2026-01-08",
      "daily-2026-01-09",
      "daily-2026-01-10",
    ])).toEqual({ completed: 9, longestStreak: 7 });
  });

  it("counts only hostile pieces toward cumulative capture achievements", () => {
    const before = playableState();
    const after = structuredClone(before);
    delete after.board.d8;
    delete after.board.d1;
    const source = createAchievementProgress();
    source.totals.piecesCaptured = 99;

    const first = applyAchievementTransition(source, {
      variant: "classic",
      matchId: "capture-100",
      localActors: ["white"],
      before,
      after,
    }).progress;

    expect(first.totals.piecesCaptured).toBe(100);
    expect(first.completed["prisoners-of-war"]).toBeTruthy();

    first.totals.piecesCaptured = 499;
    const secondBefore = playableState();
    const secondAfter = structuredClone(secondBefore);
    delete secondAfter.board.d8;
    const second = applyAchievementTransition(first, {
      variant: "classic",
      matchId: "capture-500",
      localActors: ["white"],
      before: secondBefore,
      after: secondAfter,
    }).progress;

    expect(second.totals.piecesCaptured).toBe(500);
    expect(second.completed["war-never-changes"]).toBeTruthy();
  });

  it("unlocks Triples is best after wins on all five three-player boards", () => {
    let progress = createAchievementProgress();
    for (const boardVariant of THREE_PLAYER_BOARD_VARIANTS) {
      const config = createDefaultThreePlayerConfig();
      config.boardVariant = boardVariant;
      const before = createThreePlayerGame(config);
      before.phase = "play";
      const after = structuredClone(before);
      after.phase = "gameover";
      after.result = {
        kind: "winner",
        seat: "white",
        reason: "last-survivor",
      };
      progress = applyAchievementTransition(progress, {
        variant: "three-player",
        matchId: `win-${boardVariant}`,
        localActors: ["white"],
        before,
        after,
      }).progress;
    }

    expect(progress.collections.wonThreePlayerVariants)
      .toEqual(THREE_PLAYER_BOARD_VARIANTS);
    expect(progress.completed["triples-is-best"]).toBeTruthy();
  });

  it("merges replicas without double-counting cumulative totals", () => {
    const local = createAchievementProgress();
    local.totals.bananasDropped = 12;
    local.totals.piecesCaptured = 100;
    local.collections.wonGods = ["salem"];
    local.collections.wonThreePlayerVariants = ["three-player"];
    const cloud = createAchievementProgress();
    cloud.totals.bananasDropped = 8;
    cloud.totals.piecesCaptured = 80;
    cloud.collections.wonGods = ["death"];
    cloud.collections.wonThreePlayerVariants = ["triad"];

    const merged = mergeAchievementProgress(local, cloud);

    expect(merged.totals.bananasDropped).toBe(12);
    expect(merged.totals.piecesCaptured).toBe(100);
    expect(merged.collections.wonGods).toEqual(["salem", "death"]);
    expect(merged.collections.wonThreePlayerVariants)
      .toEqual(["three-player", "triad"]);
  });
});
