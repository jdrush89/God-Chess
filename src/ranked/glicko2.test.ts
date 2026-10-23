import { describe, expect, it } from "vitest";
import { updateGlicko2 } from "./glicko2";
import { DEFAULT_RANKED_RATING } from "./types";

describe("Glicko-2", () => {
  it("matches the single-opponent reference calculation within rounding tolerance", () => {
    const result = updateGlicko2(
      {
        ...DEFAULT_RANKED_RATING,
        rating: 1500,
        deviation: 200,
        volatility: 0.06,
      },
      { rating: 1400, deviation: 30 },
      1,
    );

    expect(result.rating).toBeCloseTo(1563.6, 0);
    expect(result.deviation).toBeCloseTo(175.4, 0);
    expect(result.volatility).toBeCloseTo(0.06, 3);
    expect(result).toMatchObject({
      gamesPlayed: 1,
      wins: 1,
      losses: 0,
      draws: 0,
    });
  });

  it("moves equal new players symmetrically after a decisive result", () => {
    const winner = updateGlicko2(
      DEFAULT_RANKED_RATING,
      DEFAULT_RANKED_RATING,
      1,
    );
    const loser = updateGlicko2(
      DEFAULT_RANKED_RATING,
      DEFAULT_RANKED_RATING,
      0,
    );

    expect(winner.rating - 1500).toBeCloseTo(1500 - loser.rating, 8);
    expect(winner.deviation).toBeCloseTo(loser.deviation, 8);
  });

  it("records a draw without changing equal players' ratings", () => {
    const result = updateGlicko2(
      DEFAULT_RANKED_RATING,
      DEFAULT_RANKED_RATING,
      0.5,
    );

    expect(result.rating).toBeCloseTo(1500, 8);
    expect(result.gamesPlayed).toBe(1);
    expect(result.draws).toBe(1);
  });
});
