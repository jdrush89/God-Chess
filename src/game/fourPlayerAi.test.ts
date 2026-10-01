import { describe, expect, it } from "vitest";
import {
  chooseFourPlayerAiPlan,
  evaluateFourPlayerState,
} from "./fourPlayerAi";
import { createDefaultFourPlayerConfig } from "./fourPlayerConfig";
import {
  availableFourPlayerActions,
  createFourPlayerGame,
  fourPlayerReducer,
} from "./fourPlayerEngine";
import {
  FOUR_PLAYER_SEATS,
  type FourPlayerPiece,
  type FourPlayerState,
  type Seat,
} from "./fourPlayerTypes";
import { GODS } from "./gods";
import type { PieceType } from "./types";

const allAiGame = (difficulty = 2) => {
  const config = createDefaultFourPlayerConfig();
  for (const seat of FOUR_PLAYER_SEATS) {
    config.seats[seat].control = { kind: "ai", difficulty };
  }
  return createFourPlayerGame(config);
};

const testPiece = (
  state: FourPlayerState,
  type: PieceType,
  owner: Seat,
  id: string,
): FourPlayerPiece => ({
  id,
  type,
  owner,
  controller: owner,
  displayColor: state.config.seats[owner].displayColor,
  orbAffinity: state.config.seats[owner].orbAffinity,
  hasMoved: false,
  status: {},
});

describe("four-player AI", () => {
  it("drafts all twelve unique Gods without stalling", () => {
    let state = allAiGame(1);
    let steps = 0;
    while (state.phase === "draft" && steps < 20) {
      const plan = chooseFourPlayerAiPlan(state, () => 1);
      expect(plan).toHaveLength(1);
      expect(plan[0].type).toBe("draft");
      state = fourPlayerReducer(state, plan[0]);
      steps += 1;
    }
    expect(steps).toBe(12);
    expect(state.phase).toBe("play");
    expect(new Set(FOUR_PLAYER_SEATS.flatMap((seat) => state.players[seat].gods)).size).toBe(12);
  });

  it("uses the strongest evaluated draft at level 10", () => {
    const state = allAiGame(10);
    const plan = chooseFourPlayerAiPlan(state, () => 0);
    expect(plan).toEqual([{ type: "draft", godId: "quetzacoatl" }]);
  });

  it("offers every catalog ability through the deterministic action boundary", () => {
    const offered = new Set<string>();
    for (const god of GODS) {
      const state = createFourPlayerGame();
      state.phase = "play";
      state.activeSeat = "north";
      state.players.north.gods = [god.id];
      state.players.north.orbs = { light: 100, dark: 100 };
      state.selectedGod = god.id;
      for (const action of availableFourPlayerActions(state)) {
        if (action.type === "select-ability") offered.add(action.abilityId);
      }
    }
    expect(offered).toEqual(new Set(GODS.flatMap((god) =>
      god.abilities.map((ability) => ability.id)
    )));
    expect(offered.size).toBe(36);
  });

  it("enumerates seat, amount, orb, choice, graveyard, and confirmation actions", () => {
    const state = createFourPlayerGame();
    state.phase = "play";
    state.activeSeat = "north";
    state.players.north.gods = ["midas", "death", "medusa"];
    state.players.north.orbs = { light: 5, dark: 5 };

    state.pending = {
      godId: "death",
      abilityId: "siphon",
      step: "siphon-seat",
    };
    state.legalSeats = ["east", "south"];
    expect(availableFourPlayerActions(state)).toEqual([
      { type: "seat", seat: "east" },
      { type: "seat", seat: "south" },
    ]);

    state.pending.step = "siphon-amount";
    state.pending.targetSeat = "east";
    state.legalSeats = [];
    expect(availableFourPlayerActions(state).map((action) => action.type)).toEqual([
      "amount",
      "amount",
      "amount",
    ]);

    state.pending = {
      godId: "midas",
      abilityId: "barter",
      step: "barter-orb",
      targetSeat: "east",
    };
    expect(availableFourPlayerActions(state)).toEqual([
      { type: "orb", orb: "light" },
      { type: "orb", orb: "dark" },
      { type: "orb" },
    ]);

    state.pending = {
      godId: "death",
      abilityId: "marked",
      step: "marked-choice",
      movedPieceId: "north-pawn-0",
    };
    expect(availableFourPlayerActions(state)).toEqual([
      { type: "choice", value: true },
      { type: "choice", value: false },
    ]);

    state.pending = {
      godId: "medusa",
      abilityId: "stone-gaze",
      step: "confirm-stone-gaze",
    };
    expect(availableFourPlayerActions(state)).toEqual([{ type: "confirm-ability" }]);
  });

  it("scores allies as friendly and enemies as hostile in team games", () => {
    const config = createDefaultFourPlayerConfig();
    config.mode = "teams";
    config.teams = {
      north: "team-a",
      east: "team-b",
      south: "team-a",
      west: "team-b",
    };
    const base = createFourPlayerGame(config);
    base.phase = "play";
    const allyLoss = structuredClone(base);
    delete allyLoss.board.g1;
    allyLoss.players.south.eliminated = true;
    for (const piece of Object.values(allyLoss.board)) {
      if (piece.owner === "south") piece.controller = null;
    }
    const enemyLoss = structuredClone(base);
    delete enemyLoss.board.n8;
    enemyLoss.players.east.eliminated = true;
    for (const piece of Object.values(enemyLoss.board)) {
      if (piece.owner === "east") piece.controller = null;
    }
    expect(evaluateFourPlayerState(enemyLoss, "north")).toBeGreaterThan(
      evaluateFourPlayerState(allyLoss, "north"),
    );
  });

  it("returns a progressing complete plan for a normal AI turn", () => {
    let state = allAiGame(1);
    GODS.forEach((god) => {
      state = fourPlayerReducer(state, { type: "draft", godId: god.id });
    });

    const initialTurn = state.turn;
    const initialSeat = state.activeSeat;
    const plan = chooseFourPlayerAiPlan(state, () => 1);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.length).toBeLessThanOrEqual(12);
    for (const action of plan) state = fourPlayerReducer(state, action);
    expect(state.turn !== initialTurn || state.activeSeat !== initialSeat || state.phase === "gameover").toBe(true);
  });

  it("builds a progressing plan through the 2v2 Salem Hex continuation", () => {
    const config = createDefaultFourPlayerConfig();
    config.mode = "teams";
    config.teams = {
      north: "team-a",
      east: "team-b",
      south: "team-a",
      west: "team-b",
    };
    config.seats.north.control = { kind: "ai", difficulty: 5 };
    let state = createFourPlayerGame(config);
    state.phase = "play";
    state.activeSeat = "north";
    state.players.north.gods = ["salem"];
    state.players.north.orbs = { light: 50, dark: 50 };
    state.players.north.team = "team-a";
    state.players.east.team = "team-b";
    state.players.south.team = "team-a";
    state.players.west.team = "team-b";
    state.board = {
      g14: testPiece(state, "king", "north", "north-king"),
      n8: testPiece(state, "king", "east", "east-king"),
      g1: testPiece(state, "king", "south", "south-king"),
      a7: testPiece(state, "king", "west", "west-king"),
      g8: testPiece(state, "rook", "north", "hex-mover"),
      b11: testPiece(state, "pawn", "west", "west-enemy"),
    };

    const plan = chooseFourPlayerAiPlan(state, () => 0);
    expect(plan).toContainEqual({ type: "select-ability", abilityId: "hex" });
    let current = state;
    for (const action of plan) {
      const next = fourPlayerReducer(current, action);
      expect(JSON.stringify(next)).not.toBe(JSON.stringify(current));
      current = next;
    }
    expect(current.pending).toBeUndefined();
    expect(current.board.b11.status.hexedBy).toBe("north");
  });
});
