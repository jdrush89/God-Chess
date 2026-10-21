import { describe, expect, it } from "vitest";
import { createGame } from "./game/engine";
import {
  applyMatchStatisticsTransition,
  createMatchStatisticsState,
} from "./matchStatistics";

describe("match statistics", () => {
  it("tracks draft picks, ability use, orb gains, captures, losses, and wins", () => {
    const draftBefore = createGame(1, { mode: "ai" });
    const draftAfter = structuredClone(draftBefore);
    draftAfter.players.white.gods.push("ares");
    const drafted = applyMatchStatisticsTransition(
      draftBefore,
      draftAfter,
      { type: "draft" },
    );
    expect(drafted.matchStats?.seats.white.godsUsed.ares).toBe(1);

    const before = structuredClone(drafted);
    before.phase = "play";
    before.activeColor = "white";
    before.selectedGod = "ares";
    before.selectedAbility = "rage";
    before.players.white.orbs.white = 1;
    const captured = before.board.a7;
    const after = structuredClone(before);
    delete after.board.a7;
    after.players.black.graveyard.push({
      piece: captured,
      capturedOnTurn: before.turn,
    });
    after.players.white.orbs.white = 3;
    after.selectedGod = undefined;
    after.selectedAbility = undefined;
    after.turn += 1;
    after.activeColor = "black";
    after.phase = "gameover";
    after.winner = "white";
    after.result = {
      kind: "winner",
      winner: "white",
      reason: "checkmate",
    };

    const tracked = applyMatchStatisticsTransition(
      before,
      after,
      { type: "square" },
    );
    expect(tracked.matchStats).toMatchObject({
      gamesPlayed: 1,
      stalemates: 0,
      wins: [{ winners: ["white"] }],
      seats: {
        white: {
          lightOrbsGained: 2,
          piecesCaptured: 1,
          abilitiesUsed: 1,
        },
        black: {
          piecesLost: 1,
        },
      },
    });
  });
  it("carries completed games across restart while undo snapshots stay exact", () => {
    const finished = createGame(1);
    finished.matchStats = {
      ...createMatchStatisticsState(),
      wins: [{ winners: ["white"] }],
    };
    const restarted = applyMatchStatisticsTransition(
      finished,
      createGame(1),
      { type: "restart" },
    );
    expect(restarted.matchStats).toMatchObject({
      gamesPlayed: 2,
      wins: [{ winners: ["white"] }],
    });

    const restored = structuredClone(finished);
    expect(restored.matchStats?.gamesPlayed).toBe(1);
    expect(restored.matchStats?.wins).toHaveLength(1);
  });
});
