import { describe, expect, it } from "vitest";
import { createDefaultThreePlayerConfig } from "./threePlayerConfig";
import { createThreePlayerGame } from "./threePlayerEngine";
import {
  isThreePlayerState,
  prepareThreePlayerState,
} from "./threePlayerPersistence";
import { GODS } from "./gods";
import type {
  ThreePlayerSeat,
  ThreePlayerState,
} from "./threePlayerTypes";

const eliminateForSnapshot = (
  state: ThreePlayerState,
  seat: ThreePlayerSeat,
  eliminatedBy?: ThreePlayerSeat,
) => {
  state.players[seat].eliminated = true;
  state.players[seat].eliminatedBy = eliminatedBy;
  for (const [cell, piece] of Object.entries(state.board)) {
    if (piece.owner !== seat || piece.type !== "king") continue;
    state.players[seat].graveyard.push({
      piece: structuredClone(piece),
      capturedOnTurn: state.turn,
    });
    delete state.board[cell];
    break;
  }
};

const setOwnerController = (
  state: ThreePlayerState,
  owner: ThreePlayerSeat,
  controller: ThreePlayerSeat | null,
) => {
  for (const piece of Object.values(state.board)) {
    if (piece.owner === owner) piece.controller = controller;
  }
};

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

  it("migrates valid schema-version-1 states with deterministic defaults", () => {
    const legacy = structuredClone(createThreePlayerGame()) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 1;
    for (const field of [
      "seatTurns",
      "hostileTurns",
      "godTurns",
      "upgradeQueue",
      "legalCells",
      "legalSeats",
      "legalPaths",
      "bananas",
      "stealth",
      "orbEvents",
      "nextOrbEventId",
      "presentationEvents",
      "nextPresentationEventId",
    ]) delete legacy[field];
    delete legacy.attackSequence;
    delete legacy.kingAttackRecency;
    delete legacy.completedTurns;
    delete legacy.revision;
    delete legacy.positionRevision;
    delete legacy.passCycle;
    const prepared = prepareThreePlayerState(legacy);
    expect(prepared.schemaVersion).toBe(2);
    expect(prepared.attackSequence).toBe(0);
    expect(prepared.completedTurns).toEqual({ white: 0, red: 0, black: 0 });
    expect(prepared.seatTurns).toEqual({ white: 0, red: 0, black: 0 });
    expect(prepared.hostileTurns).toEqual({ white: 0, red: 0, black: 0 });
    expect(prepared.godTurns).toEqual({ white: {}, red: {}, black: {} });
    expect(prepared.upgradeQueue).toEqual([]);
    expect(prepared.legalCells).toEqual([]);
    expect(prepared.legalSeats).toEqual([]);
    expect(prepared.legalPaths).toEqual([]);
    expect(prepared.bananas).toEqual([]);
    expect(prepared.stealth).toEqual({ white: [], red: [], black: [] });
    expect(prepared.orbEvents).toEqual([]);
    expect(prepared.nextOrbEventId).toBe(1);
    expect(prepared.presentationEvents).toEqual([]);
    expect(prepared.nextPresentationEventId).toBe(1);
    expect(prepared.passCycle).toEqual({
      positionRevision: 0,
      passedSeats: [],
    });
  });

  it("rejects malformed Layer 2 selections, events, and pending identifiers", () => {
    const state = createThreePlayerGame();

    const badCell = structuredClone(state);
    badCell.legalCells = ["wrong-topology:1"];
    expect(isThreePlayerState(badCell)).toBe(false);

    const badPath = structuredClone(state);
    badPath.legalPaths = ["missing-path"];
    expect(isThreePlayerState(badPath)).toBe(false);

    const badPending = structuredClone(state);
    badPending.pending = {
      godId: GODS[0].id,
      abilityId: GODS[1].abilities[0].id,
      step: "cell",
    };
    expect(isThreePlayerState(badPending)).toBe(false);

    const badOrbEvent = structuredClone(state);
    badOrbEvent.orbEvents = [{
      id: 1,
      player: "white",
      orb: "light",
      amount: 1,
      total: 1,
      source: Object.keys(state.board)[0],
    }];
    badOrbEvent.nextOrbEventId = 1;
    expect(isThreePlayerState(badOrbEvent)).toBe(false);

    const badPresentation = structuredClone(state);
    badPresentation.presentationEvents = [{
      id: 1,
      kind: "move",
      source: Object.keys(state.board)[0],
      destination: "wrong-topology:1",
    }];
    badPresentation.nextPresentationEventId = 2;
    expect(isThreePlayerState(badPresentation)).toBe(false);

    const mislabeledLegacy = structuredClone(state) as unknown as Record<string, unknown>;
    mislabeledLegacy.schemaVersion = 1;
    expect(() => prepareThreePlayerState(mislabeledLegacy)).toThrow(/invalid/i);
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

  it("requires inert eliminated pieces when takeover is disabled", () => {
    const state = createThreePlayerGame();
    eliminateForSnapshot(state, "red", "white");
    setOwnerController(state, "red", null);
    expect(isThreePlayerState(state)).toBe(true);

    const controlled = structuredClone(state);
    Object.values(controlled.board).find(
      (piece) => piece.owner === "red",
    )!.controller = "white";
    expect(isThreePlayerState(controlled)).toBe(false);
  });

  it("accepts only the living takeover successor as controller", () => {
    const direct = createThreePlayerGame();
    direct.config.takeover = true;
    eliminateForSnapshot(direct, "red", "white");
    setOwnerController(direct, "red", "white");
    expect(isThreePlayerState(direct)).toBe(true);

    const arbitrary = structuredClone(direct);
    Object.values(arbitrary.board).find(
      (piece) => piece.owner === "red",
    )!.controller = "black";
    expect(isThreePlayerState(arbitrary)).toBe(false);

    const chained = createThreePlayerGame();
    chained.config.takeover = true;
    eliminateForSnapshot(chained, "red", "black");
    eliminateForSnapshot(chained, "black", "white");
    setOwnerController(chained, "red", "white");
    setOwnerController(chained, "black", "white");
    expect(isThreePlayerState(chained)).toBe(true);
  });

  it("rejects takeover chains with missing successors or cycles", () => {
    const missing = createThreePlayerGame();
    missing.config.takeover = true;
    eliminateForSnapshot(missing, "red");
    setOwnerController(missing, "red", null);
    expect(isThreePlayerState(missing)).toBe(false);

    const cycle = createThreePlayerGame();
    cycle.config.takeover = true;
    eliminateForSnapshot(cycle, "red", "black");
    eliminateForSnapshot(cycle, "black", "red");
    setOwnerController(cycle, "red", "white");
    setOwnerController(cycle, "black", "white");
    expect(isThreePlayerState(cycle)).toBe(false);
  });
});
