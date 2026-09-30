import { describe, expect, it } from "vitest";
import {
  createDefaultThreePlayerConfig,
  threePlayerPieceAffinity,
} from "./threePlayerConfig";
import {
  availableThreePlayerActions,
  createThreePlayerGame,
  threePlayerReducer,
} from "./threePlayerEngine";
import { GODS } from "./gods";

const finishDraft = () => {
  let state = createThreePlayerGame();
  for (const god of GODS.slice(0, 9)) {
    state = threePlayerReducer(state, { type: "draft", godId: god.id });
  }
  return state;
};

describe("three-player deterministic lifecycle", () => {
  it("drafts nine Gods in the documented order and leaves three unused", () => {
    const state = finishDraft();
    expect(state.phase).toBe("play");
    expect(state.players.white.gods).toEqual([
      GODS[0].id,
      GODS[5].id,
      GODS[6].id,
    ]);
    expect(state.players.red.gods).toEqual([
      GODS[1].id,
      GODS[4].id,
      GODS[7].id,
    ]);
    expect(state.players.black.gods).toEqual([
      GODS[2].id,
      GODS[3].id,
      GODS[8].id,
    ]);
    expect(state.draft.unused).toEqual(GODS.slice(9).map((god) => god.id));
    expect(state.draft.available).toEqual([]);
    expect(state.activeSeat).toBe("white");
  });

  it("enumerates actions deterministically and rejects no-op inputs", () => {
    const state = createThreePlayerGame();
    expect(availableThreePlayerActions(state)).toEqual(
      GODS.map((god) => ({ type: "draft", godId: god.id })),
    );
    expect(availableThreePlayerActions(state)).toEqual(
      availableThreePlayerActions(structuredClone(state)),
    );
    expect(
      threePlayerReducer(state, { type: "draft", godId: "ares" }),
    ).not.toBe(state);
    const changed = threePlayerReducer(state, {
      type: "draft",
      godId: GODS[0].id,
    });
    expect(
      threePlayerReducer(changed, { type: "draft", godId: GODS[0].id }),
    ).toBe(changed);
  });

  it("toggles Red-owned piece affinity only after a completed Red move", () => {
    let state = finishDraft();
    const redPiece = Object.values(state.board).find(
      (piece) => piece.owner === "red",
    )!;
    expect(threePlayerPieceAffinity(state, redPiece)).toBe("light");

    const whiteMove = availableThreePlayerActions(state)[0];
    expect(whiteMove?.type).toBe("move");
    state = threePlayerReducer(state, whiteMove);
    expect(state.completedTurns.red).toBe(0);
    expect(threePlayerPieceAffinity(state, redPiece)).toBe("light");

    const redMove = availableThreePlayerActions(state)[0];
    expect(redMove?.type).toBe("move");
    state = threePlayerReducer(state, redMove);
    expect(state.completedTurns.red).toBe(1);
    expect(threePlayerPieceAffinity(state, redPiece)).toBe("dark");
  });

  it("enumerates stable ordinary actions on all five topologies", () => {
    for (const boardVariant of [
      "three-player",
      "three-hexagonal",
      "triad",
      "three-circular",
      "three-half",
    ] as const) {
      const config = createDefaultThreePlayerConfig();
      config.boardVariant = boardVariant;
      let state = createThreePlayerGame(config);
      for (const god of GODS.slice(0, 9)) {
        state = threePlayerReducer(state, {
          type: "draft",
          godId: god.id,
        });
      }
      const actions = availableThreePlayerActions(state);
      expect(actions.length).toBeGreaterThan(0);
      expect(actions).toEqual(
        availableThreePlayerActions(structuredClone(state)),
      );
      expect(actions.every((action) =>
        action.type === "move" &&
        threePlayerReducer(state, action) !== state
      )).toBe(true);
    }
  });

  it("preserves durable attack recency when loading a canonical snapshot", () => {
    const state = createThreePlayerGame();
    state.attackSequence = 7;
    state.kingAttackRecency.white.red = 4;
    state.kingAttackRecency.white.black = 7;
    const loaded = threePlayerReducer(state, {
      type: "load",
      state: structuredClone(state),
    });
    expect(loaded.attackSequence).toBe(7);
    expect(loaded.kingAttackRecency.white).toEqual({
      red: 4,
      black: 7,
    });
  });
});
