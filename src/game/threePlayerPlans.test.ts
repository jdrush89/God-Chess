import { describe, expect, it } from "vitest";
import { createDefaultThreePlayerConfig } from "./threePlayerConfig";
import {
  availableThreePlayerActions,
  createThreePlayerGame,
  threePlayerReducer,
} from "./threePlayerEngine";
import {
  enumerateCompleteThreePlayerPlans,
  isCompleteThreePlayerPlan,
} from "./threePlayerPlans";
import { GODS } from "./gods";
import { getThreePlayerTopology } from "./threePlayerTopology";
import type {
  ThreePlayerPiece,
  ThreePlayerSeat,
} from "./threePlayerTypes";

const piece = (
  id: string,
  type: ThreePlayerPiece["type"],
  owner: ThreePlayerSeat,
): ThreePlayerPiece => ({
  id,
  type,
  owner,
  controller: owner,
  hasMoved: false,
  status: {},
});

const finishDraft = (state: ReturnType<typeof createThreePlayerGame>) =>
  GODS.slice(0, 9).reduce(
    (current, god) =>
      threePlayerReducer(current, { type: "draft", godId: god.id }),
    state,
  );

describe("three-player complete plans", () => {
  it("returns progressing, reducer-legal plans on every topology", () => {
    for (const boardVariant of [
      "three-player",
      "three-hexagonal",
      "triad",
      "three-circular",
      "three-half",
    ] as const) {
      const config = createDefaultThreePlayerConfig();
      config.boardVariant = boardVariant;
      const state = finishDraft(createThreePlayerGame(config));
      const plans = enumerateCompleteThreePlayerPlans(state, {
        maxPlans: 6,
        maxStates: 8_000,
      });
      expect(plans.length).toBeGreaterThan(0);
      for (const plan of plans) {
        let replay = state;
        for (const action of plan.actions) {
          const next = threePlayerReducer(replay, action);
          expect(next).not.toBe(replay);
          replay = next;
        }
        expect(isCompleteThreePlayerPlan(state, replay)).toBe(true);
      }
    }
  });

  it("terminates committed Mount and Resurrection states with no continuation", () => {
    const mount = finishDraft(createThreePlayerGame());
    const remaining = GODS.map((god) => god.id).filter((id) => id !== "chiron");
    mount.players.white.gods = ["chiron", remaining[0], remaining[1]];
    mount.players.red.gods = remaining.slice(2, 5);
    mount.players.black.gods = remaining.slice(5, 8);
    mount.draft.unused = remaining.slice(8);
    const topology = getThreePlayerTopology(mount.config.boardVariant);
    const destination = topology.cells.find((cell) =>
      topology.orthogonalNeighbors(cell).length >= 2
    )!;
    const source = topology.cells.find((cell) =>
      cell !== destination &&
      !topology.orthogonalNeighbors(destination).includes(cell) &&
      topology.orthogonalNeighbors(cell).length >= 1
    )!;
    const rider = topology.orthogonalNeighbors(source)[0];
    mount.board = {
      [destination]: piece("mount", "knight", "white"),
      [rider]: piece("rider", "pawn", "white"),
      ...Object.fromEntries(
        topology.orthogonalNeighbors(destination).map((cell, index) => [
          cell,
          piece(`blocked-${index}`, "pawn", "white"),
        ]),
      ),
      [topology.cells.find((cell) =>
        cell !== destination &&
        cell !== source &&
        cell !== rider &&
        !topology.orthogonalNeighbors(destination).includes(cell)
      )!]: piece("white-king", "king", "white"),
    };
    mount.selectedGod = "chiron";
    mount.selectedAbility = "mount";
    mount.pending = {
      godId: "chiron",
      abilityId: "mount",
      step: "mount-rider",
      source,
      destination,
      selected: [],
    };
    mount.legalCells = [rider];
    expect(threePlayerReducer(mount, { type: "cell", cell: rider }).pending)
      .toBeUndefined();

    const mountPlans = enumerateCompleteThreePlayerPlans(mount, {
      maxPlans: 8,
      maxStates: 100,
    });
    expect(mountPlans.length).toBeGreaterThan(0);
    expect(mountPlans.every((plan) => plan.actions.length <= 1)).toBe(true);

    const resurrect = finishDraft(createThreePlayerGame());
    for (const [cell, candidate] of Object.entries(resurrect.board)) {
      if (candidate.controller === "white" && candidate.type === "bishop") {
        delete resurrect.board[cell];
      }
    }
    resurrect.players.white.orbs.light = 2;
    resurrect.selectedGod = "death";
    resurrect.selectedAbility = "resurrect";
    resurrect.pending = {
      godId: "death",
      abilityId: "resurrect",
      step: "resurrect-more",
      movedPieceId: Object.values(resurrect.board)[0].id,
      selected: ["revived"],
    };
    expect(availableThreePlayerActions(resurrect)).toEqual([
      { type: "choice", value: true },
      { type: "choice", value: false },
    ]);
    const resurrectPlans = enumerateCompleteThreePlayerPlans(resurrect, {
      maxPlans: 8,
      maxStates: 100,
    });
    expect(resurrectPlans.length).toBeGreaterThan(0);
    expect(resurrectPlans.every((plan) => plan.actions.length === 1)).toBe(true);
  });
});
