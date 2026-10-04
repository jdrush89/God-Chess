import { describe, expect, it } from "vitest";
import { qualifyingSnake } from "./slither";

const neighbors = (map: Record<string, string[]>) =>
  (cell: string) => map[cell] ?? [];

describe("qualifyingSnake", () => {
  it("rejects an isolated occupied origin", () => {
    const occupied = new Set(["origin"]);

    expect(qualifyingSnake(
      "origin",
      (cell) => occupied.has(cell),
      neighbors({}),
      neighbors({}),
    )).toEqual([]);
  });

  it("returns a one-member snake when only the origin qualifies", () => {
    const occupied = new Set(["origin", "diagonal", "blocker"]);

    expect(qualifyingSnake(
      "origin",
      (cell) => occupied.has(cell),
      neighbors({
        origin: ["diagonal"],
        diagonal: ["origin"],
      }),
      neighbors({
        diagonal: ["blocker"],
        blocker: ["diagonal"],
      }),
    )).toEqual(["origin"]);
  });

  it("keeps only the qualifying diagonal component containing the origin", () => {
    const occupied = new Set([
      "origin",
      "link",
      "excluded",
      "blocker",
      "unrelated-a",
      "unrelated-b",
    ]);

    expect(qualifyingSnake(
      "origin",
      (cell) => occupied.has(cell),
      neighbors({
        origin: ["link"],
        link: ["origin", "excluded"],
        excluded: ["link"],
        "unrelated-a": ["unrelated-b"],
        "unrelated-b": ["unrelated-a"],
      }),
      neighbors({
        excluded: ["blocker"],
        blocker: ["excluded"],
      }),
    )).toEqual(["origin", "link"]);
  });
});
