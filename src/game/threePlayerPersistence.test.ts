import { describe, expect, it } from "vitest";
import { createDefaultThreePlayerConfig } from "./threePlayerConfig";
import {
  createThreePlayerGame,
  threePlayerReducer,
} from "./threePlayerEngine";
import {
  isThreePlayerState,
  prepareThreePlayerState,
} from "./threePlayerPersistence";
import { threePlayerCellAffinity } from "./threePlayerDivineGeometry";
import { GODS } from "./gods";
import { getThreePlayerTopology } from "./threePlayerTopology";
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

const finishDraft = () => GODS.slice(0, 9).reduce(
  (state, god) =>
    threePlayerReducer(state, { type: "draft", godId: god.id }),
  createThreePlayerGame(),
);

const pendingState = (
  godId: (typeof GODS)[number]["id"],
  abilityId: string,
  step: string,
  fields: Record<string, unknown> = {},
) => {
  const state = finishDraft();
  const remaining = GODS.map((god) => god.id).filter((id) => id !== godId);
  state.players.white.gods = [godId, remaining[0], remaining[1]];
  state.players.red.gods = remaining.slice(2, 5);
  state.players.black.gods = remaining.slice(5, 8);
  state.draft.unused = remaining.slice(8);
  state.activeSeat = "white";
  const synthetic = ["snipe-shot", "harden-choice"].includes(abilityId);
  state.selectedGod = synthetic ? undefined : godId;
  state.selectedAbility = synthetic ? undefined : abilityId;
  state.pending = {
    godId,
    abilityId,
    step,
    ...fields,
  };
  return state;
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

  it("derives neutral affinity from the persisted global turn", () => {
    const config = createDefaultThreePlayerConfig();
    config.boardVariant = "triad";
    const state = createThreePlayerGame(config);
    const neutralCell = getThreePlayerTopology("triad").cellDescriptors.find(
      (cell) => cell.geometricClass === 2,
    )!.id;
    state.turn = 2;

    const prepared = prepareThreePlayerState(structuredClone(state));

    expect(threePlayerCellAffinity(prepared, neutralCell)).toBe("dark");
    expect(JSON.stringify(prepared)).not.toContain("neutralAffinity");
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
  });

  it("accepts canonical Enchant stages and rejects incomplete follow-up state", () => {
    const enemyMove = pendingState("teles", "enchant", "enchant-enemy-move");
    expect(isThreePlayerState(enemyMove)).toBe(true);

    const [source, destination] = Object.keys(enemyMove.board);
    const movedPieceId = enemyMove.board[source].id;
    const followup = pendingState(
      "teles",
      "enchant",
      "enchant-followup-move",
      { source, destination, movedPieceId },
    );
    expect(isThreePlayerState(followup)).toBe(true);
    expect(
      threePlayerReducer(followup, { type: "load", state: followup }).pending?.step,
    ).toBe("enchant-followup-move");

    const incomplete = structuredClone(followup);
    delete incomplete.pending!.destination;
    expect(isThreePlayerState(incomplete)).toBe(false);

    const wrongAbility = structuredClone(followup);
    wrongAbility.pending!.abilityId = "lure";
    wrongAbility.selectedAbility = "lure";
    expect(isThreePlayerState(wrongAbility)).toBe(false);

    const state = createThreePlayerGame();
    const mislabeledLegacy = structuredClone(state) as unknown as Record<string, unknown>;
    mislabeledLegacy.schemaVersion = 1;
    expect(() => prepareThreePlayerState(mislabeledLegacy)).toThrow(/invalid/i);
  });

  it("requires exact numeric prepared and upgrade levels", () => {
    const state = createThreePlayerGame();
    const pieceCell = Object.keys(state.board)[0];
    const abilityId = GODS[0].abilities[0].id;

    const legal = structuredClone(state);
    legal.board[pieceCell].status.prepared = { owner: "white", level: 2 };
    legal.players.white.upgrades[abilityId] = 3;
    expect(prepareThreePlayerState(legal)).toEqual(legal);

    const preparedString = structuredClone(legal) as unknown as {
      board: Record<string, {
        status: { prepared: { owner: string; level: string } };
      }>;
    };
    preparedString.board[pieceCell].status.prepared.level = "2";
    expect(isThreePlayerState(preparedString)).toBe(false);
    expect(() => prepareThreePlayerState(preparedString)).toThrow(/invalid/i);

    const upgradeString = structuredClone(legal) as unknown as {
      players: { white: { upgrades: Record<string, string> } };
    };
    upgradeString.players.white.upgrades[abilityId] = "3";
    expect(isThreePlayerState(upgradeString)).toBe(false);
    expect(() => prepareThreePlayerState(upgradeString)).toThrow(/invalid/i);

    const schemaString = structuredClone(state) as unknown as {
      schemaVersion: string;
    };
    schemaString.schemaVersion = "2";
    expect(isThreePlayerState(schemaString)).toBe(false);
    expect(() => prepareThreePlayerState(schemaString)).toThrow(/invalid/i);
  });

  it("round-trips every reducer pending-step shape", () => {
    const state = finishDraft();
    const topology = getThreePlayerTopology(state.config.boardVariant);
    const [source, destination] = topology.cells;
    const movedPieceId = Object.values(state.board)[0].id;
    const areaId = topology.cells.flatMap((cell) =>
      (["1x2", "2x1", "2x2"] as const).flatMap((kind) =>
        topology.areas(cell, kind)
      )
    )[0].id;
    const cases: Array<[
      (typeof GODS)[number]["id"],
      string,
      string,
      Record<string, unknown>?,
    ]> = [
      ["quetzacoatl", "flight", "source"],
      ["teles", "lure", "target"],
      ["artemis", "snipe-shot", "snipe-source"],
      ["artemis", "snipe-shot", "snipe-target"],
      ["anubis", "harden-choice", "harden-choice"],
      ["anubis", "harden-choice", "harden-decision", { source }],
      ["medusa", "stone-gaze", "confirm-stone-gaze"],
      ["death", "resurrect", "grave", { selected: ["revived"] }],
      ["death", "resurrect", "revive-place", { movedPieceId }],
      ["death", "resurrect", "resurrect-more", {
        movedPieceId,
        selected: ["revived"],
      }],
      ["anubis", "monument", "monument-sacrifice", { selected: [] }],
      ["anubis", "monument", "monument-base", { selected: [source] }],
      ["salem", "hex", "hex-target", { selected: [] }],
      ["leonidas", "march-home", "march-companions", {
        source,
        selected: [],
      }],
      ["leonidas", "march-home", "confirm-march-home", { source }],
      ["chiron", "mount", "mount-rider", {
        source,
        destination,
        selected: [],
      }],
      ["chiron", "mount", "mount-place", {
        source,
        destination,
        selected: [],
        movedPieceId,
      }],
      ["kangus", "banana-peel", "banana", { movedPieceId }],
      ["death", "marked", "marked-choice", { movedPieceId }],
      ["death", "siphon", "siphon-seat", { destination }],
      ["death", "siphon", "siphon-amount", {
        destination,
        targetSeat: "red",
      }],
      ["midas", "barter", "barter-seat", { destination }],
      ["midas", "barter", "barter-orb", {
        destination,
        targetSeat: "red",
      }],
      ["midas", "leverage", "hire", { movedPieceId }],
      ["ares", "cull-the-weak", "cull-choice", { movedPieceId }],
      ["medusa", "slither", "slither", {
        source,
        movedPieceId,
        movesRemaining: -1,
      }],
      ["midas", "military-funding", "funding", { selected: [movedPieceId] }],
      ["salem", "poison-cloud", "poison-area", {
        source,
        selectedPathIds: [areaId],
      }],
      ["kangus", "rage", "rage-source"],
      ["kangus", "rage", "rage-destination", { source }],
      ["kangus", "rage", "rage-choice", { source, destination }],
      ["quetzacoatl", "air-strike", "air-strike-passenger", { source }],
      ["quetzacoatl", "air-strike", "air-strike-destination", {
        source,
        selected: [destination],
      }],
      ["quetzacoatl", "air-strike", "air-strike-path", {
        source,
        destination,
        selected: [destination],
      }],
      ["quetzacoatl", "air-strike", "air-strike-drop", {
        source,
        destination,
        selected: [destination],
      }],
      ["leonidas", "escort", "escort-companions", {
        source,
        selected: [],
      }],
      ["leonidas", "escort", "escort-move", {
        source,
        selected: [movedPieceId],
      }],
      ["chiron", "gallop", "path-choice", { source, destination }],
    ];

    for (const [godId, abilityId, step, fields] of cases) {
      const candidate = pendingState(
        godId,
        abilityId,
        step,
        fields,
      );
      expect(
        prepareThreePlayerState(structuredClone(candidate)),
        `${abilityId}/${step}`,
      ).toEqual(candidate);
    }
  });

  it("rejects pending steps paired with the wrong ability or stale fields", () => {
    const state = pendingState("death", "resurrect", "grave");
    state.pending!.abilityId = "marked";
    state.selectedAbility = "marked";
    expect(isThreePlayerState(state)).toBe(false);

    const stale = pendingState("kangus", "rage", "rage-source", {
      movedPieceId: Object.values(state.board)[0].id,
    });
    expect(isThreePlayerState(stale)).toBe(false);
  });

  it("rejects malformed topology, pass-cycle, controller, and affinity data", () => {
    const state = createThreePlayerGame();

    const extraState = structuredClone(state) as unknown as Record<string, unknown>;
    extraState.unexpected = true;
    expect(isThreePlayerState(extraState)).toBe(false);

    const extraConfig = structuredClone(state) as unknown as {
      config: Record<string, unknown>;
    };
    extraConfig.config.unexpected = true;
    expect(isThreePlayerState(extraConfig)).toBe(false);

    const extraPiece = structuredClone(state) as unknown as {
      board: Record<string, Record<string, unknown>>;
    };
    Object.values(extraPiece.board)[0].unexpected = true;
    expect(isThreePlayerState(extraPiece)).toBe(false);

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
