import { describe, expect, it } from "vitest";
import { appPathForRoute, appRouteFromPath } from "./navigation";

describe("app navigation", () => {
  it("maps direct Daily links separately from the Daily archive", () => {
    expect(appRouteFromPath("/daily")).toMatchObject({
      startView: "puzzles",
      puzzleCategory: "daily",
    });
    expect(appRouteFromPath("/daily/play")).toMatchObject({
      startView: "puzzles",
      puzzleCategory: "daily",
    });
    expect(appPathForRoute({
      startView: "puzzles",
      setupCategory: "local",
      puzzleCategory: "daily",
    })).toBe("/puzzles/daily");
  });

  it("maps major screens and setup paths in both directions", () => {
    expect(appRouteFromPath("/puzzles/hard")).toMatchObject({
      startView: "puzzles",
      puzzleCategory: "hard",
    });
    expect(appRouteFromPath("/local/3").startView).toBe("three-setup");
    expect(appRouteFromPath("/online/4")).toMatchObject({
      startView: "setup",
      setupCategory: "online",
      setupPlayerCount: 4,
    });
    expect(appPathForRoute({
      startView: "achievements",
      setupCategory: "local",
    })).toBe("/achievements");
    expect(appRouteFromPath("/stats").startView).toBe("stats");
    expect(appPathForRoute({
      startView: "stats",
      setupCategory: "local",
    })).toBe("/stats");
    expect(appRouteFromPath("/friends/gc-athena22")).toMatchObject({
      startView: "friend-profile",
      friendPublicId: "gc-athena22",
    });
    expect(appPathForRoute({
      startView: "friend-profile",
      setupCategory: "local",
      friendPublicId: "gc-athena22",
    })).toBe("/friends/gc-athena22");
    expect(appRouteFromPath("/puzzles/custom")).toMatchObject({
      startView: "puzzles",
      puzzleCategory: "custom",
    });
    expect(appRouteFromPath("/puzzles/marketplace")).toMatchObject({
      startView: "puzzles",
      puzzleCategory: "marketplace",
    });
  });
});
