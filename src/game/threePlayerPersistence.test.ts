import { describe, expect, it } from "vitest";
import { createDefaultThreePlayerConfig } from "./threePlayerConfig";
import { createThreePlayerGame } from "./threePlayerEngine";
import {
  isThreePlayerState,
  prepareThreePlayerState,
} from "./threePlayerPersistence";

describe("three-player persistence", () => {
  it("round-trips canonical states for every topology", () => {
    for (const boardVariant of [
      "three-player",
      "three-hexagonal",
      "triad",
      "three-circular",
      "three-half",
    ] as const) {
      const config = createDefaultThreePlayerConfig();
      config.boardVariant = boardVariant;
      const state = createThreePlayerGame(config);
      expect(isThreePlayerState(state)).toBe(true);
      expect(prepareThreePlayerState(structuredClone(state))).toEqual(state);
    }
  });

  it("fills only intentional compatibility metadata", () => {
    const legacy = structuredClone(createThreePlayerGame()) as unknown as Record<
      string,
      unknown
    >;
    delete legacy.attackSequence;
    delete legacy.kingAttackRecency;
    delete legacy.completedTurns;
    delete legacy.revision;
    delete legacy.positionRevision;
    delete legacy.passCycle;
    const prepared = prepareThreePlayerState(legacy);
    expect(prepared.attackSequence).toBe(0);
    expect(prepared.completedTurns).toEqual({ white: 0, red: 0, black: 0 });
    expect(prepared.passCycle).toEqual({
      positionRevision: 0,
      passedSeats: [],
    });
  });

  it("rejects malformed topology, pass-cycle, controller, and affinity data", () => {
    const state = createThreePlayerGame();

    const badCell = structuredClone(state) as unknown as {
      board: Record<string, unknown>;
    };
    badCell.board.invalid = Object.values(state.board)[0];
    expect(isThreePlayerState(badCell)).toBe(false);

    const badPass = structuredClone(state);
    badPass.passCycle.positionRevision += 1;
    expect(isThreePlayerState(badPass)).toBe(false);

    const badController = structuredClone(state);
    badController.players.red.eliminated = true;
    Object.values(badController.board).find(
      (piece) => piece.controller === "red",
    )!.controller = "red";
    expect(isThreePlayerState(badController)).toBe(false);

    const staleAffinity = structuredClone(state) as unknown as {
      board: Record<string, Record<string, unknown>>;
    };
    Object.values(staleAffinity.board)[0].orbAffinity = "dark";
    expect(isThreePlayerState(staleAffinity)).toBe(false);
  });
});
