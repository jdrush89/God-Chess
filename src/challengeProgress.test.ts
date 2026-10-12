// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  CHALLENGE_PROGRESS_KEY,
  loadLocalCompletedChallenges,
  normalizeCompletedChallenges,
  persistLocalCompletedChallenges,
} from "./challengeProgress";

beforeEach(() => window.localStorage.clear());

describe("challenge progress", () => {
  it("keeps unique known challenge identifiers", () => {
    expect(normalizeCompletedChallenges([
      "phalanx",
      "phalanx",
      "gang-up",
      "unknown",
    ])).toEqual(["phalanx", "gang-up"]);
  });

  it("persists completed challenges locally", () => {
    persistLocalCompletedChallenges(["phalanx", "jumped"]);
    expect(loadLocalCompletedChallenges()).toEqual(["phalanx", "jumped"]);
    expect(window.localStorage.getItem(CHALLENGE_PROGRESS_KEY)).toBeTruthy();
  });
});
