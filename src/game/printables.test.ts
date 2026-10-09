import { describe, expect, it } from "vitest";
import generator from "../../scripts/generate-printables.mjs?raw";
import { GOD_BY_ID } from "./gods";

describe("printable God boards", () => {
  it("renders current Quetzacoatl and Medusa movement names and level rules", () => {
    expect(generator).toContain('const sourcePath = path.join(root, "src/game/gods.ts")');
    expect(generator.match(/maxSize: 8\.5/g)).toHaveLength(3);
    expect(generator).toContain("const panelHeight = 116");

    const quetzSlither = GOD_BY_ID.quetzacoatl.abilities.find(
      (ability) => ability.id === "flight",
    )!;
    expect(quetzSlither.name).toBe("Slither");
    expect(quetzSlither.summary).toContain("form a snake");
    expect(quetzSlither.details).toEqual([
      "Gain 1 white orb if the snake contains a white piece and 1 black orb if it contains a black piece.",
      "If the snake is 2 or more pieces, gain an extra orb of your choice.",
      "Gain 1 orb per piece in the snake in addition to the extra from level 2. The orbs gained match the piece colors.",
    ]);

    const medusaStep = GOD_BY_ID.medusa.abilities.find(
      (ability) => ability.id === "slither",
    )!;
    expect(medusaStep.name).toBe("Serpentine Step");
    expect(GOD_BY_ID.quetzacoatl.abilities.some((ability) => ability.name === "Flight"))
      .toBe(false);
    expect(GOD_BY_ID.medusa.abilities.some((ability) => ability.name === "Slither"))
      .toBe(false);

    const pickAFight = GOD_BY_ID.ares.abilities.find(
      (ability) => ability.id === "pick-a-fight",
    )!;
    expect(pickAFight.kind).toBe("move");
    expect(pickAFight.summary).toContain("ordinarily legal empty space");

    const marked = GOD_BY_ID.death.abilities.find(
      (ability) => ability.id === "marked",
    )!;
    expect(marked.summary).toContain(
      "If the piece is captured or dies from another effect first, gain no Mark reward.",
    );
    expect(marked.summary).toContain(
      "A King cannot be killed by the Mark and grants no reward when it clears.",
    );
    expect(marked.details[2]).toContain(
      "it does not also grant the delayed 3",
    );
  });
});
