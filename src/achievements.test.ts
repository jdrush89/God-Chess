import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_DEFINITIONS,
  applyAchievementTransition,
  completeCryptologistIfEligible,
  createAchievementProgress,
  mergeAchievementProgress,
} from "./achievements";
import { createGame } from "./game/engine";
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
  it("defines all 50 unique achievements", () => {
    expect(ACHIEVEMENT_DEFINITIONS).toHaveLength(50);
    expect(new Set(ACHIEVEMENT_DEFINITIONS.map(({ id }) => id)).size).toBe(50);
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

  it("requires 25 total classic puzzle completions", () => {
    const incomplete = completeCryptologistIfEligible(
      createAchievementProgress(),
      { easy: 5, medium: 10, hard: 9 },
    );
    expect(incomplete.completed.cryptologist).toBeUndefined();

    const complete = completeCryptologistIfEligible(
      incomplete,
      { easy: 5, medium: 10, hard: 10 },
    );
    expect(complete.completed.cryptologist).toBeTruthy();
  });

  it("merges replicas without double-counting cumulative totals", () => {
    const local = createAchievementProgress();
    local.totals.bananasDropped = 12;
    local.collections.wonGods = ["salem"];
    const cloud = createAchievementProgress();
    cloud.totals.bananasDropped = 8;
    cloud.collections.wonGods = ["death"];

    const merged = mergeAchievementProgress(local, cloud);

    expect(merged.totals.bananasDropped).toBe(12);
    expect(merged.collections.wonGods).toEqual(["salem", "death"]);
  });
});
