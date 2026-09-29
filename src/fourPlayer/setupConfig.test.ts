import { describe, expect, it } from "vitest";
import { FOUR_PLAYER_SEATS } from "../game/fourPlayerTypes";
import {
  createLocalFourPlayerConfig,
  defaultFourPlayerName,
  localFourPlayerConfigErrors,
} from "./setupConfig";

describe("local four-player setup", () => {
  it("creates four named local Human seats with fixed affinities and palettes", () => {
    const config = createLocalFourPlayerConfig("Host");
    expect(config.seats.north.name).toBe("Host");
    expect(config.seats.east.name).toBe("Player 2");
    expect(FOUR_PLAYER_SEATS.map((seat) => config.seats[seat].control.kind)).toEqual([
      "human",
      "human",
      "human",
      "human",
    ]);
    expect(FOUR_PLAYER_SEATS.map((seat) => config.seats[seat].orbAffinity).sort()).toEqual([
      "dark",
      "dark",
      "light",
      "light",
    ]);
    expect(new Set(FOUR_PLAYER_SEATS.map((seat) => config.seats[seat].displayColor)).size).toBe(4);
  });
  it("requires a local Human, names, legal difficulties, and exact teams", () => {
    const config = createLocalFourPlayerConfig();
    for (const seat of FOUR_PLAYER_SEATS) {
      config.seats[seat].control = { kind: "ai", difficulty: 5 };
      config.seats[seat].name = defaultFourPlayerName(seat, config.seats[seat].control);
    }
    expect(localFourPlayerConfigErrors(config)).toContain(
      "At least one seat must be Human on this device.",
    );

    config.seats.north.control = { kind: "human", local: true };
    config.seats.north.name = "";
    expect(localFourPlayerConfigErrors(config)).toContain("North needs a player name.");

    config.seats.north.name = "Player 1";
    config.mode = "teams";
    config.teams = {
      north: "team-a",
      east: "team-a",
      south: "team-a",
      west: "team-b",
    };
    expect(localFourPlayerConfigErrors(config)).toContain(
      "Team games require exactly two seats on Team A and two on Team B.",
    );

    config.teams.south = "team-b";
    config.seats.east.control = { kind: "ai", difficulty: 11 };
    expect(localFourPlayerConfigErrors(config).join(" ")).toMatch(/difficulty.*1 to 10/i);
  });

  it("accepts arbitrary exact 2v2 layouts and alternate-team turns", () => {
    const config = createLocalFourPlayerConfig();
    config.mode = "teams";
    config.teams = {
      north: "team-a",
      east: "team-a",
      south: "team-b",
      west: "team-b",
    };
    config.turnPolicy = "alternate-teams";
    config.takeover = true;
    config.victoryMode = "first-king-captured";
    expect(localFourPlayerConfigErrors(config)).toEqual([]);
  });
});
