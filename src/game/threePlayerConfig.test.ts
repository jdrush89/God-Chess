import { describe, expect, it } from "vitest";
import {
  createDefaultThreePlayerConfig,
  createThreePlayerDraftOrder,
  createThreePlayerTurnOrder,
  nextThreePlayerSeat,
  threePlayerOwnerAffinity,
  validateThreePlayerConfig,
} from "./threePlayerConfig";

describe("three-player configuration", () => {
  it("uses the fixed White, Red, Black turn order", () => {
    expect(createThreePlayerTurnOrder()).toEqual(["white", "red", "black"]);
    expect(nextThreePlayerSeat("white")).toBe("red");
    expect(nextThreePlayerSeat("red")).toBe("black");
    expect(nextThreePlayerSeat("black")).toBe("white");
    expect(nextThreePlayerSeat("white", ["white", "black"])).toBe("black");
  });

  it("uses the documented nine-claim snake-like draft", () => {
    expect(createThreePlayerDraftOrder()).toEqual([
      "white",
      "red",
      "black",
      "black",
      "red",
      "white",
      "white",
      "red",
      "black",
    ]);
  });

  it("validates controller metadata and distinct display colors", () => {
    const config = createDefaultThreePlayerConfig();
    expect(validateThreePlayerConfig(config)).toBe(config);

    config.seats.red.control = { kind: "ai", difficulty: 11 };
    expect(() => validateThreePlayerConfig(config)).toThrow(/difficulty/i);

    config.seats.red.control = { kind: "human", local: true };
    config.seats.red.displayColor = config.seats.white.displayColor;
    expect(() => validateThreePlayerConfig(config)).toThrow(/distinct/i);
  });

  it("derives Red affinity only from completed Red turns", () => {
    expect(threePlayerOwnerAffinity("white", 99)).toBe("light");
    expect(threePlayerOwnerAffinity("black", 0)).toBe("dark");
    expect(threePlayerOwnerAffinity("red", 0)).toBe("light");
    expect(threePlayerOwnerAffinity("red", 1)).toBe("dark");
    expect(threePlayerOwnerAffinity("red", 2)).toBe("light");
  });
});
