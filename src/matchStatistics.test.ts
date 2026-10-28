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
    expect(drafted.matchStats?.currentGame.seats.white.godPicks).toEqual([
      { godId: "ares", actorType: "player", method: "manual" },
    ]);

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
      currentGame: {
        seats: {
          white: {
            abilityUses: {
              rage: { player: 1, cpu: 0 },
            },
          },
        },
      },
    });
  });

  it("separates random and CPU picks and records both upgrade turns", () => {
    const randomBefore = createGame(1, { mode: "local" });
    const randomAfter = structuredClone(randomBefore);
    randomAfter.players.white.gods.push("salem");
    const randomlyDrafted = applyMatchStatisticsTransition(
      randomBefore,
      randomAfter,
      { type: "auto-draft" },
    );
    expect(randomlyDrafted.matchStats?.currentGame.seats.white.godPicks)
      .toEqual([{ godId: "salem", actorType: "player", method: "random" }]);

    const cpuBefore = createGame(1, { mode: "ai" });
    cpuBefore.activeColor = cpuBefore.aiColor!;
    const cpuAfter = structuredClone(cpuBefore);
    cpuAfter.players[cpuBefore.aiColor!].gods.push("midas");
    const cpuDrafted = applyMatchStatisticsTransition(
      cpuBefore,
      cpuAfter,
      { type: "draft" },
    );
    expect(
      cpuDrafted.matchStats?.currentGame.seats[cpuBefore.aiColor!].godPicks,
    ).toEqual([{ godId: "midas", actorType: "cpu", method: "cpu" }]);

    const firstUpgradeBefore = createGame(1, { mode: "local" });
    firstUpgradeBefore.phase = "upgrade";
    firstUpgradeBefore.turn = 7;
    firstUpgradeBefore.players.white.gods = ["kangus"];
    firstUpgradeBefore.players.white.upgrades.rage = 1;
    const firstUpgradeAfter = structuredClone(firstUpgradeBefore);
    firstUpgradeAfter.players.white.upgrades.rage = 2;
    const firstUpgrade = applyMatchStatisticsTransition(
      firstUpgradeBefore,
      firstUpgradeAfter,
      { type: "upgrade", abilityId: "rage" },
    );

    const secondUpgradeBefore = structuredClone(firstUpgrade);
    secondUpgradeBefore.phase = "upgrade";
    secondUpgradeBefore.turn = 14;
    const secondUpgradeAfter = structuredClone(secondUpgradeBefore);
    secondUpgradeAfter.players.white.upgrades.rage = 3;
    const secondUpgrade = applyMatchStatisticsTransition(
      secondUpgradeBefore,
      secondUpgradeAfter,
      { type: "upgrade", abilityId: "rage" },
    );
    expect(secondUpgrade.matchStats?.currentGame.seats.white.abilityUpgrades)
      .toEqual([
        {
          godId: "kangus",
          abilityId: "rage",
          actorType: "player",
          level: 2,
          turn: 7,
        },
        {
          godId: "kangus",
          abilityId: "rage",
          actorType: "player",
          level: 3,
          turn: 14,
        },
      ]);
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
      currentGame: { seats: {} },
    });

    const restored = structuredClone(finished);
    expect(restored.matchStats?.gamesPlayed).toBe(1);
    expect(restored.matchStats?.wins).toHaveLength(1);
  });
});
