import { describe, expect, it } from "vitest";
import {
  DEFAULT_RANKED_RATING,
  normalizeRankedQueueState,
  roundedRankedRating,
} from "./types";

describe("ranked response normalization", () => {
  it("normalizes queued ratings and clamps count fields", () => {
    expect(normalizeRankedQueueState({
      phase: "queued",
      rating: {
        rating: 1512.7,
        deviation: 184.2,
        volatility: 0.057,
        gamesPlayed: 12.9,
        wins: 7.4,
        losses: -2,
        draws: 3.8,
      },
    })).toEqual({
      phase: "queued",
      loading: false,
      rating: {
        rating: 1512.7,
        deviation: 184.2,
        volatility: 0.057,
        gamesPlayed: 12,
        wins: 7,
        losses: 0,
        draws: 3,
      },
    });
  });

  it("drops malformed participants while preserving valid match metadata", () => {
    const state = normalizeRankedQueueState({
      phase: "playing",
      rating: DEFAULT_RANKED_RATING,
      match: {
        id: "match-1",
        roomCode: "ABCDE",
        joinToken: "south-token",
        seatTokens: {
          north: "north-token",
          south: "south-token",
          center: "invalid-token",
        },
        seat: "south",
        team: "team-a",
        host: true,
        participants: [
          {
            publicId: "gc-player1",
            displayName: "  Athena  ",
            portraitId: "artemis",
            seat: "south",
            team: "team-a",
            host: false,
            connected: true,
            rating: 1604.4,
          },
          {
            publicId: "gc-invalid",
            displayName: "Invalid",
            seat: "center",
            team: "team-a",
          },
        ],
      },
    });

    expect(state).toMatchObject({
      phase: "playing",
      match: {
        id: "match-1",
        roomCode: "ABCDE",
        seat: "south",
        team: "team-a",
        joinToken: "south-token",
        seatTokens: {
          north: "north-token",
          south: "south-token",
        },
        participants: [
          {
            publicId: "gc-player1",
            displayName: "Athena",
            portraitId: "artemis",
            rating: 1604.4,
          },
        ],
      },
    });
  });

  it("normalizes completed results and rejects incomplete match identities", () => {
    expect(normalizeRankedQueueState({
      phase: "completed",
      rating: { ...DEFAULT_RANKED_RATING, rating: 1540 },
      match: {
        id: "match-2",
        joinToken: "west-token",
        seat: "west",
        team: "team-b",
        host: false,
        participants: [],
        winnerTeam: "team-b",
        resultReason: "disconnect",
        ratingChange: 40,
      },
    })).toMatchObject({
      phase: "completed",
      match: {
        winnerTeam: "team-b",
        resultReason: "disconnect",
        ratingChange: 40,
        rating: { rating: 1540 },
      },
    });

    expect(normalizeRankedQueueState({
      phase: "matched",
      rating: DEFAULT_RANKED_RATING,
      match: { id: "missing-seat" },
    })).toEqual({
      phase: "idle",
      loading: false,
      rating: DEFAULT_RANKED_RATING,
    });
  });

  it("rounds rating values for display", () => {
    expect(roundedRankedRating(1499.5)).toBe(1500);
    expect(roundedRankedRating({ rating: 1601.49 })).toBe(1601);
  });
});
