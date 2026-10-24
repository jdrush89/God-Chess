// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RankedLeaderboardPanel } from "./RankedLeaderboardPanel";

const leaderboardHarness = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock("./useRankedLeaderboard", () => ({
  useRankedLeaderboard: () => [
    {
      loading: false,
      entries: [
        {
          publicId: "gc-athena",
          displayName: "Athena",
          portraitId: "artemis",
          rating: 1724.4,
          deviation: 82,
          volatility: 0.058,
          gamesPlayed: 18,
          wins: 11,
          losses: 5,
          draws: 2,
        },
        {
          publicId: "gc-ares",
          displayName: "Ares",
          portraitId: "ares",
          rating: 1688.1,
          deviation: 95,
          volatility: 0.061,
          gamesPlayed: 12,
          wins: 7,
          losses: 4,
          draws: 1,
        },
      ],
    },
    { refresh: leaderboardHarness.refresh },
  ],
}));

afterEach(cleanup);

describe("RankedLeaderboardPanel", () => {
  it("shows ordered player ratings, deviations, and records", () => {
    render(<RankedLeaderboardPanel />);

    expect(screen.getByRole("table", { name: /ranked leaderboard/i }))
      .toBeTruthy();
    const athena = screen.getByText("Athena").closest("article")!;
    expect(within(athena).getByText("1")).toBeTruthy();
    expect(within(athena).getByText("1724")).toBeTruthy();
    expect(within(athena).getByText("RD 82")).toBeTruthy();
    expect(within(athena).getByText("11W · 5L · 2D")).toBeTruthy();

    const ares = screen.getByText("Ares").closest("article")!;
    expect(within(ares).getByText("2")).toBeTruthy();
    expect(within(ares).getByText("1688")).toBeTruthy();
    expect(within(ares).getByText("7W · 4L · 1D")).toBeTruthy();
  });
});
