import { describe, expect, it } from "vitest";
import {
  availableThreePlayerActions,
  createThreePlayerGame,
  threePlayerReducer,
  unsupportedThreePlayerAbilities,
} from "./threePlayerEngine";
import { GODS } from "./gods";
import { prepareThreePlayerState } from "./threePlayerPersistence";
import type { ThreePlayerState } from "./threePlayerTypes";

const abilityState = (
  godId: (typeof GODS)[number]["id"],
  level: 1 | 2 | 3,
) => {
  const state = createThreePlayerGame();
  state.phase = "play";
  state.activeSeat = "white";
  state.players.white.gods = [godId];
  state.players.red.gods = ["ares"];
  state.players.black.gods = ["midas"];
  state.players.white.orbs = { light: 50, dark: 50 };
  if (level > 1) {
    for (const ability of GODS.find((god) => god.id === godId)!.abilities) {
      state.players.white.upgrades[ability.id] = level;
    }
  }
  const gravePiece = Object.values(state.board).find(
    (piece) => piece.owner === "white" && piece.type === "pawn",
  )!;
  state.players.white.graveyard = [{
    piece: {
      ...structuredClone(gravePiece),
      id: `grave-${godId}-${level}`,
    },
    capturedOnTurn: 0,
  }];
  return state;
};

describe("three-player God catalog", () => {
  it("implements every catalog ability", () => {
    expect(unsupportedThreePlayerAbilities()).toEqual([]);
  });

  for (const god of GODS) {
    for (const ability of god.abilities) {
      it.each([1, 2, 3] as const)(
        `activates ${god.name} / ${ability.name} at level %i`,
        (level) => {
          let state: ThreePlayerState = abilityState(god.id, level);
          state = threePlayerReducer(state, {
            type: "select-god",
            godId: god.id,
          });
          const next = threePlayerReducer(state, {
            type: "select-ability",
            abilityId: ability.id,
          });
          expect(next).not.toBe(state);
          expect(
            next.selectedAbility === ability.id ||
            next.completedTurns.white > state.completedTurns.white,
          ).toBe(true);
        },
      );
    }
  }

  it("creates a unique Monument rook without duplicating a sacrificed pawn", () => {
    let state = createThreePlayerGame();
    for (const godId of [
      "anubis",
      "ares",
      "midas",
      "death",
      "salem",
      "chiron",
      "teles",
      "artemis",
      "medusa",
    ] as const) {
      state = threePlayerReducer(state, { type: "draft", godId });
    }
    state.players.white.orbs = { light: 50, dark: 50 };
    state = threePlayerReducer(state, {
      type: "select-god",
      godId: "anubis",
    });
    state = threePlayerReducer(state, {
      type: "select-ability",
      abilityId: "monument",
    });
    for (let index = 0; index < 3; index += 1) {
      const sacrifice = availableThreePlayerActions(state).find(
        (action) => action.type === "cell",
      );
      expect(sacrifice).toBeTruthy();
      state = threePlayerReducer(state, sacrifice!);
    }
    const base = availableThreePlayerActions(state).find(
      (action) => action.type === "cell",
    );
    expect(base).toBeTruthy();
    state = threePlayerReducer(state, base!);

    expect(() => prepareThreePlayerState(state)).not.toThrow();
    const ids = [
      ...Object.values(state.board).map((piece) => piece.id),
      ...Object.values(state.players).flatMap((player) =>
        player.graveyard.map(({ piece }) => piece.id)
      ),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    const monument = Object.values(state.board).find((piece) =>
      piece.id.startsWith("white-monument-")
    );
    expect(monument).toMatchObject({
      type: "rook",
      owner: "white",
      controller: "white",
    });
  });

  it("only offers Air Strike branches that retain a legal passenger drop", () => {
    let state = createThreePlayerGame();
    for (const godId of [
      "quetzacoatl",
      "ares",
      "midas",
      "death",
      "salem",
      "chiron",
      "teles",
      "artemis",
      "medusa",
    ] as const) {
      state = threePlayerReducer(state, { type: "draft", godId });
    }
    state.players.white.orbs = { light: 50, dark: 50 };
    state = threePlayerReducer(state, {
      type: "select-god",
      godId: "quetzacoatl",
    });
    state = threePlayerReducer(state, {
      type: "select-ability",
      abilityId: "air-strike",
    });
    const source = availableThreePlayerActions(state).find(
      (action) => action.type === "cell",
    );
    expect(source).toBeTruthy();
    state = threePlayerReducer(state, source!);
    const passenger = availableThreePlayerActions(state).find(
      (action) => action.type === "cell",
    );
    expect(passenger).toBeTruthy();
    state = threePlayerReducer(state, passenger!);
    const destinations = availableThreePlayerActions(state).filter(
      (action) => action.type === "cell",
    );
    expect(destinations.length).toBeGreaterThan(0);

    for (const destination of destinations) {
      const destinationState = threePlayerReducer(state, destination);
      const paths = availableThreePlayerActions(destinationState).filter(
        (action) => action.type === "path",
      );
      if (!paths.length) {
        expect(availableThreePlayerActions(destinationState).some(
          (action) => action.type === "cell",
        )).toBe(true);
        continue;
      }
      for (const path of paths) {
        const dropState = threePlayerReducer(destinationState, path);
        expect(availableThreePlayerActions(dropState).some(
          (action) => action.type === "cell",
        )).toBe(true);
      }
    }
  });
});
