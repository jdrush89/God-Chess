import { describe, expect, it } from "vitest";
import { createGame } from "./game/engine";
import {
  createPlayerStatisticsProgress,
  createPlayerStatisticsSnapshot,
  mergePlayerStatisticsProgress,
  updatePlayerMatchStatistics,
} from "./playerStatistics";

describe("player statistics", () => {
  it("derives aggregate totals and stable God pick rates from local actors", () => {
    const state = createGame(1, { mode: "ai" });
    state.matchStats = {
      version: 1,
      gamesPlayed: 2,
      stalemates: 1,
      wins: [
        { winners: ["white"] },
        { winners: ["black"] },
      ],
      seats: {
        white: {
          lightOrbsGained: 6,
          darkOrbsGained: 4,
          piecesCaptured: 3,
          piecesLost: 2,
          abilitiesUsed: 5,
          godsUsed: { ares: 2, medusa: 1 },
        },
        black: {
          lightOrbsGained: 20,
          darkOrbsGained: 20,
          piecesCaptured: 20,
          piecesLost: 20,
          abilitiesUsed: 20,
          godsUsed: { death: 20 },
        },
      },
    };
    const progress = updatePlayerMatchStatistics(
      createPlayerStatisticsProgress(),
      "match-1",
      state,
      ["white"],
      "2026-10-20T12:00:00.000Z",
    );
    const snapshot = createPlayerStatisticsSnapshot(progress, [
      "centaurs-lance",
      "daily-2026-10-20",
    ]);

    expect(snapshot).toMatchObject({
      gamesPlayed: 2,
      gamesWon: 1,
      stalemates: 1,
      boardsPlayed: { classic: 2 },
      lightOrbsGained: 6,
      darkOrbsGained: 4,
      piecesCaptured: 3,
      piecesLost: 2,
      abilitiesUsed: 5,
      godPickDenominator: 3,
      dailyPuzzlesCompleted: 1,
      totalPuzzlesCompleted: 2,
    });
    expect(snapshot.godsUsed).toMatchObject({ ares: 2, medusa: 1, death: 0 });
  });
  it("replaces a match contribution after undo instead of inflating totals", () => {
    const state = createGame(1);
    state.matchStats!.seats.white = {
      lightOrbsGained: 3,
      darkOrbsGained: 0,
      piecesCaptured: 1,
      piecesLost: 0,
      abilitiesUsed: 1,
      godsUsed: {},
    };
    const inflated = updatePlayerMatchStatistics(
      createPlayerStatisticsProgress(),
      "match-1",
      state,
      ["white"],
      "2026-10-20T12:00:00.000Z",
    );
    const undoneState = createGame(1);
    const undone = updatePlayerMatchStatistics(
      inflated,
      "match-1",
      undoneState,
      ["white"],
      "2026-10-20T12:01:00.000Z",
    );
    expect(createPlayerStatisticsSnapshot(undone)).toMatchObject({
      gamesPlayed: 1,
      lightOrbsGained: 0,
      piecesCaptured: 0,
      abilitiesUsed: 0,
    });
  });

  it("merges imported progress by the newest per-match snapshot", () => {
    const older = updatePlayerMatchStatistics(
      createPlayerStatisticsProgress(),
      "shared",
      createGame(1),
      ["white"],
      "2026-10-20T10:00:00.000Z",
    );
    const newerState = createGame(1);
    newerState.matchStats!.gamesPlayed = 2;
    const newer = updatePlayerMatchStatistics(
      createPlayerStatisticsProgress(),
      "shared",
      newerState,
      ["white"],
      "2026-10-20T11:00:00.000Z",
    );
    expect(
      createPlayerStatisticsSnapshot(
        mergePlayerStatisticsProgress(older, newer),
      ).gamesPlayed,
    ).toBe(2);
  });
});
