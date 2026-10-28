import { describe, expect, it } from "vitest";
import { createGame } from "../game/engine";
import { createThreePlayerGame } from "../game/threePlayerEngine";
import { createMatchStatisticsState } from "../matchStatistics";
import {
  balanceBoardForState,
  createBalanceMatchReport,
} from "./balanceAnalytics";

describe("balance analytics", () => {
  it("builds anonymous completed-match reports with per-actor balance events", () => {
    const state = createGame(1, { mode: "ai" });
    state.phase = "gameover";
    state.turn = 18;
    state.winner = "white";
    state.result = {
      kind: "winner",
      winner: "white",
      reason: "checkmate",
    };
    state.matchStats = {
      ...createMatchStatisticsState(),
      currentGame: {
        seats: {
          white: {
            godPicks: [{
              godId: "kangus",
              actorType: "player",
              method: "manual",
            }],
            abilityUses: {
              rage: { player: 3, cpu: 0 },
            },
            abilityUpgrades: [{
              godId: "kangus",
              abilityId: "rage",
              actorType: "player",
              level: 2,
              turn: 7,
            }],
          },
          black: {
            godPicks: [{
              godId: "midas",
              actorType: "cpu",
              method: "cpu",
            }],
            abilityUses: {
              leverage: { player: 0, cpu: 2 },
            },
            abilityUpgrades: [],
          },
        },
      },
    };

    expect(createBalanceMatchReport(state)).toEqual({
      version: 1,
      turns: 18,
      outcome: "win",
      winners: ["white"],
      seats: [
        {
          seat: "white",
          won: true,
          godPicks: [{
            godId: "kangus",
            actorType: "player",
            method: "manual",
          }],
          abilityUses: [{
            godId: "kangus",
            abilityId: "rage",
            actorType: "player",
            count: 3,
          }],
          abilityUpgrades: [{
            godId: "kangus",
            abilityId: "rage",
            actorType: "player",
            level: 2,
            turn: 7,
          }],
        },
        {
          seat: "black",
          won: false,
          godPicks: [{
            godId: "midas",
            actorType: "cpu",
            method: "cpu",
          }],
          abilityUses: [{
            godId: "midas",
            abilityId: "leverage",
            actorType: "cpu",
            count: 2,
          }],
          abilityUpgrades: [],
        },
      ],
    });
  });

  it("reports the configured board independently from the game mode", () => {
    const state = createThreePlayerGame();
    state.config.boardVariant = "three-circular";
    expect(balanceBoardForState(state)).toBe("three-circular");
  });
});
