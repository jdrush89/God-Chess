import { describe, expect, it } from "vitest";
import { GODS } from "./gods";
import {
  availableFourPlayerActions,
  createFourPlayerGame,
  fourPlayerReducer,
  hasCommittedFourPlayerAction,
  hasCompleteFourPlayerTurn,
} from "./fourPlayerEngine";
import type { FourPlayerPiece, FourPlayerState, Seat } from "./fourPlayerTypes";
import type { GodId, PieceType, Square } from "./types";

const piece = (
  state: FourPlayerState,
  type: PieceType,
  owner: Seat,
  id: string,
  controller: Seat | null = owner,
): FourPlayerPiece => ({
  id,
  type,
  owner,
  controller,
  displayColor: state.config.seats[owner].displayColor,
  orbAffinity: state.config.seats[owner].orbAffinity,
  hasMoved: false,
  status: {},
});

const gameFor = (godId: GodId, level: 1 | 2 | 3 = 1) => {
  const state = createFourPlayerGame();
  state.phase = "play";
  state.activeSeat = "north";
  state.players.north.gods = [godId];
  const otherGods = GODS.map((god) => god.id).filter((candidate) => candidate !== godId);
  state.players.east.gods = [otherGods[0]];
  state.players.south.gods = [otherGods[1]];
  state.players.west.gods = [otherGods[2]];
  state.players.north.orbs = { light: 50, dark: 50 };
  if (level > 1) {
    const god = GODS.find((candidate) => candidate.id === godId)!;
    for (const ability of god.abilities) state.players.north.upgrades[ability.id] = level;
  }
  state.board = {
    g14: piece(state, "king", "north", "north-king"),
    n8: piece(state, "king", "east", "east-king"),
    g1: piece(state, "king", "south", "south-king"),
    a7: piece(state, "king", "west", "west-king"),
  };
  return state;
};

const activate = (state: FourPlayerState, godId: GodId, abilityId: string) => {
  let next = fourPlayerReducer(state, { type: "select-god", godId });
  return fourPlayerReducer(next, { type: "select-ability", abilityId });
};

const move = (
  state: FourPlayerState,
  godId: GodId,
  abilityId: string,
  from: Square,
  to: Square,
) => {
  let next = activate(state, godId, abilityId);
  next = fourPlayerReducer(next, { type: "square", square: from });
  return fourPlayerReducer(next, { type: "square", square: to });
};

const teamHexGame = (level: 1 | 2 | 3 = 1) => {
  const state = gameFor("salem", level);
  state.config.mode = "teams";
  state.config.teams = {
    north: "team-a",
    east: "team-b",
    south: "team-a",
    west: "team-b",
  };
  state.players.north.team = "team-a";
  state.players.east.team = "team-b";
  state.players.south.team = "team-a";
  state.players.west.team = "team-b";
  state.board.g8 = piece(state, "rook", "north", "hex-mover");
  state.board.b11 = piece(state, "pawn", "west", "west-enemy");
  return state;
};

describe("four-player God abilities", () => {
  it("generalizes Quetzacoatl's Slither, Air Lift, and Air Strike", () => {
    let state = gameFor("quetzacoatl");
    state.board.g8 = piece(state, "rook", "north", "carrier");
    state.board.h10 = piece(state, "pawn", "east", "dark-link", "north");
    let result = move(state, "quetzacoatl", "flight", "g8", "g9");
    expect(result.board.g9?.id).toBe("carrier");
    expect(result.players.north.orbs.light).toBe(51);
    expect(result.players.north.orbs.dark).toBe(51);

    state = gameFor("quetzacoatl");
    delete state.board.g14;
    state.board.g8 = piece(state, "king", "north", "north-king");
    result = move(state, "quetzacoatl", "air-lift", "g8", "g11");
    expect(result.board.g11?.type).toBe("king");

    state = gameFor("quetzacoatl");
    state.board.g8 = piece(state, "rook", "north", "air-carrier");
    state.board.h8 = piece(state, "pawn", "north", "passenger");
    result = activate(state, "quetzacoatl", "air-strike");
    result = fourPlayerReducer(result, { type: "square", square: "g8" });
    result = fourPlayerReducer(result, { type: "square", square: "h8" });
    result = fourPlayerReducer(result, { type: "square", square: "g10" });
    result = fourPlayerReducer(result, { type: "square", square: "g9" });
    expect(result.board.g10?.id).toBe("air-carrier");
    expect(result.board.g9?.id).toBe("passenger");
  });

  it("commits Slither's extra choice and uses piece affinity rather than controller", () => {
    const state = gameFor("quetzacoatl", 2);
    state.board.g8 = piece(state, "rook", "north", "carrier");
    state.board.h10 = piece(state, "pawn", "east", "dark-link", "north");

    const moved = move(state, "quetzacoatl", "flight", "g8", "g9");
    expect(moved.players.north.orbs).toEqual({ light: 51, dark: 51 });
    expect(moved.pending?.step).toBe("slither-orb");
    expect(hasCommittedFourPlayerAction(moved)).toBe(true);
    expect(availableFourPlayerActions(moved)).toEqual([
      { type: "orb", orb: "light" },
      { type: "orb", orb: "dark" },
    ]);

    const resolved = fourPlayerReducer(moved, { type: "orb", orb: "dark" });
    expect(resolved.players.north.orbs).toEqual({ light: 51, dark: 52 });
    expect(resolved.activeSeat).toBe("east");
  });

  it("grants level 3 per-piece affinity rewards and rejects orthogonally touched chains", () => {
    let state = gameFor("quetzacoatl", 3);
    state.board.g8 = piece(state, "rook", "north", "carrier");
    state.board.h10 = piece(state, "pawn", "east", "dark-link");
    state.board.i11 = piece(state, "bishop", "south", "light-tail");

    let moved = move(state, "quetzacoatl", "flight", "g8", "g9");
    expect(moved.players.north.orbs).toEqual({ light: 52, dark: 51 });
    moved = fourPlayerReducer(moved, { type: "orb", orb: "light" });
    expect(moved.players.north.orbs).toEqual({ light: 53, dark: 51 });

    state = gameFor("quetzacoatl");
    state.board.g8 = piece(state, "rook", "north", "carrier");
    state.board.h10 = piece(state, "pawn", "east", "dark-link");
    state.board.i10 = piece(state, "pawn", "west", "orthogonal-blocker");
    const disqualified = move(state, "quetzacoatl", "flight", "g8", "g9");
    expect(disqualified.players.north.orbs).toEqual({ light: 50, dark: 50 });
  });

  it("generalizes Chiron's Gallop, Mount, and Charge", () => {
    let state = gameFor("chiron");
    state.board.g8 = piece(state, "knight", "north", "knight");
    let result = move(state, "chiron", "gallop", "g8", "h10");
    expect(result.players.north.orbs.light).toBe(51);

    state = gameFor("chiron");
    state.board.g8 = piece(state, "knight", "north", "mount");
    state.board.h8 = piece(state, "pawn", "north", "rider");
    result = move(state, "chiron", "mount", "g8", "h10");
    result = fourPlayerReducer(result, { type: "square", square: "h8" });
    result = fourPlayerReducer(result, { type: "square", square: "h9" });
    expect(result.board.h10?.id).toBe("mount");
    expect(result.board.h9?.id).toBe("rider");

    state = gameFor("chiron");
    state.board.g8 = piece(state, "knight", "north", "charger");
    result = move(state, "chiron", "charge", "g8", "g10");
    expect(result.board.g10?.id).toBe("charger");
  });

  it("generalizes Anubis's Construction, Harden, and Monument", () => {
    let state = gameFor("anubis");
    state.board.g8 = piece(state, "rook", "north", "builder");
    let result = move(state, "anubis", "construction", "g8", "g9");
    expect(result.players.north.orbs.dark).toBe(51);

    state = gameFor("anubis");
    state.board.g8 = piece(state, "rook", "north", "hardened");
    result = move(state, "anubis", "harden", "g8", "g9");
    expect(result.board.g9?.status.hardened).toBe(2);

    state = gameFor("anubis");
    state.board.f8 = piece(state, "pawn", "north", "pawn-1");
    state.board.g8 = piece(state, "pawn", "north", "pawn-2");
    state.board.h8 = piece(state, "pawn", "north", "pawn-3");
    result = activate(state, "anubis", "monument");
    for (const square of ["f8", "g8", "h8"] as Square[]) {
      result = fourPlayerReducer(result, { type: "square", square });
    }
    result = fourPlayerReducer(result, { type: "square", square: "g8" });
    expect(result.board.g8).toMatchObject({ type: "rook", owner: "north" });
  });

  it("generalizes Teles's Sing, Lure, and Enchant", () => {
    let state = gameFor("teles");
    state.board.g8 = piece(state, "rook", "north", "singer");
    state.board.f9 = piece(state, "pawn", "south", "light-1");
    state.board.h9 = piece(state, "pawn", "south", "light-2");
    let result = move(state, "teles", "resonance", "g8", "g9");
    expect(result.players.north.orbs.light).toBe(51);

    state = gameFor("teles");
    state.board.g8 = piece(state, "queen", "north", "queen");
    state.board.g10 = piece(state, "pawn", "south", "lured");
    result = activate(state, "teles", "lure");
    result = fourPlayerReducer(result, { type: "square", square: "g10" });
    expect(result.board.g10?.status.luredBy).toBe("north");

    state = gameFor("teles");
    state.players.north.gods.push("chiron");
    state.board.g8 = piece(state, "pawn", "south", "enchanted");
    state.board.g12 = piece(state, "pawn", "north", "follow-up");
    result = activate(state, "teles", "enchant");
    expect(result.pending?.step).toBe("enchant-enemy-move");
    expect(result.legalTargets).toContain("g8");
    result = fourPlayerReducer(result, { type: "square", square: "g8" });
    result = fourPlayerReducer(result, { type: "square", square: "g9" });
    expect(result.board.g9).toMatchObject({ id: "enchanted", controller: "south" });
    expect(result.pending?.step).toBe("enchant-followup-move");
    expect(hasCompleteFourPlayerTurn(result)).toBe(true);
    expect(result.legalTargets).toContain("g12");
    expect(hasCommittedFourPlayerAction(result)).toBe(true);
    expect(availableFourPlayerActions(result).every((action) => action.type === "square"))
      .toBe(true);
    result = fourPlayerReducer(result, { type: "square", square: "g12" });
    const followupDestination = result.legalTargets[0];
    expect(followupDestination).toBeTruthy();
    result = fourPlayerReducer(result, {
      type: "square",
      square: followupDestination,
    });
    expect(result.activeSeat).toBe("east");
    expect(result.rested).toContain("teles");
    expect(result.bonusTurn).toBeUndefined();
  });

  it("limits Enchant to hostile teams and unlocks rook and queen sources by level", () => {
    const setup = (level: 1 | 2 | 3) => {
      const state = gameFor("teles", level);
      state.config.mode = "teams";
      state.config.teams = {
        north: "team-a",
        east: "team-b",
        south: "team-a",
        west: "team-b",
      };
      state.players.north.team = "team-a";
      state.players.east.team = "team-b";
      state.players.south.team = "team-a";
      state.players.west.team = "team-b";
      state.board.g12 = piece(state, "pawn", "north", "follow-up");
      state.board.f8 = piece(state, "pawn", "east", "enemy-pawn");
      state.board.g8 = piece(state, "knight", "west", "enemy-knight");
      state.board.h8 = piece(state, "bishop", "east", "enemy-bishop");
      state.board.f9 = piece(state, "rook", "west", "enemy-rook");
      state.board.h9 = piece(state, "queen", "east", "enemy-queen");
      state.board.g10 = piece(state, "pawn", "south", "teammate-pawn");
      return activate(state, "teles", "enchant");
    };

    const levelOne = setup(1);
    expect(levelOne.legalTargets).toEqual(expect.arrayContaining(["f8", "g8", "h8"]));
    expect(levelOne.legalTargets).not.toEqual(expect.arrayContaining(["f9", "h9", "g10"]));
    expect(setup(2).legalTargets).toContain("f9");
    expect(setup(2).legalTargets).not.toContain("h9");
    expect(setup(3).legalTargets).toContain("h9");
  });

  it("generalizes Artemis's Take Cover, Stealth, and Snipe", () => {
    let state = gameFor("artemis");
    state.board.g8 = piece(state, "pawn", "north", "covered");
    state.board.g6 = piece(state, "pawn", "north", "cover");
    let result = move(state, "artemis", "take-cover", "g8", "g7");
    expect(result.players.north.orbs.light).toBe(51);

    state = gameFor("artemis");
    state.board.g8 = piece(state, "rook", "north", "stealth");
    result = move(state, "artemis", "stealth", "g8", "g9");
    expect(result.board.g8).toBeUndefined();
    expect(result.stealth.north[0]).toMatchObject({ destination: "g9" });

    state = gameFor("artemis");
    state.board.g8 = piece(state, "rook", "north", "sniper");
    result = move(state, "artemis", "snipe", "g8", "g9");
    expect(result.board.g9?.status.prepared).toMatchObject({ owner: "north", level: 1 });
  });

  it("does not offer or consume a prepared shot against a King", () => {
    let state = gameFor("artemis");
    state.board = {
      g14: piece(state, "king", "north", "north-king"),
      n8: piece(state, "king", "east", "east-king"),
      g1: piece(state, "king", "south", "south-king"),
      a7: piece(state, "king", "west", "west-king"),
      g8: {
        ...piece(state, "rook", "north", "prepared-rook"),
        status: { prepared: { owner: "north", level: 1 } },
      },
    };
    state.selectedGod = undefined;
    state.selectedAbility = undefined;
    state.pending = {
      godId: "artemis",
      abilityId: "snipe-shot",
      step: "snipe-source",
    };
    state.legalTargets = ["g8"];

    state = fourPlayerReducer(state, { type: "square", square: "g8" });
    expect(state.pending?.step).toBe("snipe-target");
    expect(state.legalTargets).not.toContain("n8");

    const manualAttempt = structuredClone(state);
    manualAttempt.legalTargets.push("n8");
    state = fourPlayerReducer(manualAttempt, { type: "square", square: "n8" });

    expect(state.board.n8).toMatchObject({ type: "king", owner: "east" });
    expect(state.board.g8?.status.prepared).toBeTruthy();
    expect(state.pending?.step).toBe("snipe-target");
    expect(state.selectedSquare).toBe("g8");
  });

  it("generalizes Kangus Kong's Ritual, Banana Peel, and Rage", () => {
    let state = gameFor("kangus");
    state.board.g8 = piece(state, "rook", "north", "ritual");
    let result = move(state, "kangus", "ritual-sacrifice", "g8", "g9");
    expect(result.board.g9?.status.ritual?.owner).toBe("north");

    state = gameFor("kangus");
    state.board.g8 = piece(state, "rook", "north", "banana");
    result = move(state, "kangus", "banana-peel", "g8", "g9");
    result = fourPlayerReducer(result, { type: "square", square: "f9" });
    expect(result.bananas).toContainEqual(expect.objectContaining({ square: "f9", owner: "north" }));

    state = gameFor("kangus");
    state.board.g8 = piece(state, "rook", "north", "center");
    state.board.f8 = piece(state, "pawn", "north", "friendly");
    state.board.h8 = piece(state, "pawn", "south", "hostile");
    result = activate(state, "kangus", "rage");
    result = fourPlayerReducer(result, { type: "square", square: "g8" });
    expect(result.board.f8).toBeUndefined();
    expect(result.board.h8).toBeUndefined();
  });

  it("generalizes Death's Marked, Resurrect, and Siphon", () => {
    let state = gameFor("death");
    state.board.g8 = piece(state, "rook", "north", "marked");
    let result = move(state, "death", "marked", "g8", "g9");
    expect(result.board.g9?.status.markedForDeath?.owner).toBe("north");

    state = gameFor("death");
    state.board.g8 = piece(state, "bishop", "north", "bishop");
    state.players.north.graveyard.push({
      piece: piece(state, "pawn", "north", "dead-pawn"),
      capturedOnTurn: 0,
    });
    result = activate(state, "death", "resurrect");
    result = fourPlayerReducer(result, { type: "grave", pieceId: "dead-pawn" });
    result = fourPlayerReducer(result, { type: "square", square: "g9" });
    expect(result.board.g9?.id).toBe("dead-pawn");

    state = gameFor("death");
    state.board.g8 = piece(state, "rook", "north", "siphon");
    state.board.h9 = piece(state, "pawn", "south", "victim");
    state.players.south.orbs.light = 3;
    result = move(state, "death", "siphon", "g8", "g9");
    result = fourPlayerReducer(result, { type: "seat", seat: "south" });
    result = fourPlayerReducer(result, { type: "amount", amount: 2 });
    expect(result.players.south.orbs.light).toBe(1);
    expect(result.players.north.orbs.light).toBe(52);
  });

  it("generalizes Leonidas's Royal Step, March Home, and Escort", () => {
    let state = gameFor("leonidas");
    delete state.board.g14;
    state.board.g8 = piece(state, "king", "north", "royal");
    let result = move(state, "leonidas", "royal-step", "g8", "g7");
    expect(result.players.north.orbs.dark).toBe(51);

    state = gameFor("leonidas");
    delete state.board.g14;
    state.board.g8 = piece(state, "king", "north", "marching");
    result = activate(state, "leonidas", "march-home");
    result = fourPlayerReducer(result, { type: "confirm-ability" });
    expect(result.board.g14?.id).toBe("marching");

    state = gameFor("leonidas");
    delete state.board.g14;
    state.board.g8 = piece(state, "king", "north", "escorted");
    state.board.h8 = piece(state, "rook", "north", "escort");
    result = activate(state, "leonidas", "escort");
    result = fourPlayerReducer(result, { type: "square", square: "g8" });
    result = fourPlayerReducer(result, { type: "square", square: "h8" });
    result = fourPlayerReducer(result, { type: "square", square: "g7" });
    expect(result.board.g7?.id).toBe("escorted");
    expect(result.board.h7?.id).toBe("escort");
  });

  it("allows an Escort King onto a simultaneously vacated ally square", () => {
    const state = gameFor("leonidas");
    delete state.board.g14;
    state.board.g8 = piece(state, "king", "north", "escort-king");
    state.board.h8 = piece(state, "rook", "north", "escort-rook");

    let result = activate(state, "leonidas", "escort");
    result = fourPlayerReducer(result, { type: "square", square: "g8" });
    result = fourPlayerReducer(result, { type: "square", square: "h8" });

    expect(result.legalTargets).toContain("h8");
    result = fourPlayerReducer(result, { type: "square", square: "h8" });
    expect(result.board.h8?.id).toBe("escort-king");
    expect(result.board.i8?.id).toBe("escort-rook");
  });

  it("rejects an Escort that would land on a non-moving ally", () => {
    const state = gameFor("leonidas");
    delete state.board.g14;
    state.board.g8 = piece(state, "king", "north", "escort-king");
    state.board.h8 = piece(state, "rook", "north", "escort-rook");
    state.board.i8 = piece(state, "bishop", "north", "escort-blocker");

    let result = activate(state, "leonidas", "escort");
    result = fourPlayerReducer(result, { type: "square", square: "g8" });
    result = fourPlayerReducer(result, { type: "square", square: "h8" });

    expect(result.legalTargets).not.toContain("h8");
  });

  it("generalizes Medusa's Captivate, Slither, and Stone Gaze", () => {
    let state = gameFor("medusa");
    state.board.g10 = piece(state, "queen", "north", "visible-queen");
    state.board.g8 = piece(state, "rook", "north", "captivated");
    let result = move(state, "medusa", "captivate", "g8", "g9");
    expect(result.players.north.orbs.light).toBe(51);

    state = gameFor("medusa");
    state.board.g8 = piece(state, "queen", "north", "slither");
    result = activate(state, "medusa", "slither");
    result = fourPlayerReducer(result, { type: "square", square: "g8" });
    result = fourPlayerReducer(result, { type: "square", square: "h9" });
    result = fourPlayerReducer(result, { type: "square", square: "g10" });
    expect(result.board.g10?.id).toBe("slither");

    state = gameFor("medusa");
    state.board.g8 = piece(state, "queen", "north", "gorgon");
    state.board.g10 = piece(state, "pawn", "south", "gazed");
    result = activate(state, "medusa", "stone-gaze");
    result = fourPlayerReducer(result, { type: "confirm-ability" });
    expect(result.board.g10?.status.frozenBy).toBe("north");
  });

  it("generalizes Salem's Hex, Poison Cloud, and Polymorph", () => {
    let state = gameFor("salem");
    state.board.g8 = piece(state, "rook", "north", "hex-mover");
    state.board.g10 = piece(state, "pawn", "south", "hexed");
    let result = activate(state, "salem", "hex");
    result = fourPlayerReducer(result, { type: "square", square: "g10" });
    result = fourPlayerReducer(result, { type: "square", square: "g8" });
    result = fourPlayerReducer(result, { type: "square", square: "g9" });
    expect(result.players.north.orbs.dark).toBe(52);

    state = gameFor("salem");
    state.board.g10 = piece(state, "pawn", "south", "poisoned");
    result = activate(state, "salem", "poison-cloud");
    result = fourPlayerReducer(result, { type: "square", square: "g10" });
    expect(result.board.g10?.status.poisonedBy).toBe("north");

    state = gameFor("salem");
    state.board.g10 = piece(state, "rook", "south", "polymorphed");
    result = activate(state, "salem", "polymorph");
    result = fourPlayerReducer(result, { type: "square", square: "g10" });
    expect(result.board.g10?.status.polymorphed).toBe(2);
  });

  it("advances Salem level 1 Hex against an enemy West pawn in 2v2 teams", () => {
    let state = activate(teamHexGame(), "salem", "hex");
    expect(state.legalTargets).toContain("b11");

    state = fourPlayerReducer(state, { type: "square", square: "b11" });
    expect(state.board.b11.status.hexedBy).toBe("north");
    expect(state.pending?.step).toBe("source");
    expect(state.legalTargets).toContain("g8");
    const sourceActions = availableFourPlayerActions(state);
    expect(sourceActions).toContainEqual({ type: "square", square: "g8" });
    expect(sourceActions.every((action) =>
      JSON.stringify(fourPlayerReducer(state, action)) !== JSON.stringify(state)
    )).toBe(true);

    state = fourPlayerReducer(state, { type: "square", square: "g8" });
    expect(state.selectedSquare).toBe("g8");
    const destination = state.legalTargets[0];
    expect(destination).toBeTruthy();
    state = fourPlayerReducer(state, { type: "square", square: destination });
    expect(state.pending).toBeUndefined();
    expect(state.activeSeat).not.toBe("north");
  });

  it("filters Hex targets by controller/team/status and cannot strand any level", () => {
    let state = teamHexGame(3);
    state.board.c11 = piece(state, "pawn", "south", "teammate");
    state.board.d11 = piece(state, "pawn", "west", "inert", null);
    state.board.e11 = piece(state, "pawn", "south", "taken-by-enemy", "west");
    state.board.f11 = piece(state, "pawn", "west", "taken-by-ally", "south");
    state.board.h11 = piece(state, "pawn", "east", "already-hexed");
    state.board.h11.status.hexedBy = "east";
    state = activate(state, "salem", "hex");

    expect(state.legalTargets).toContain("b11");
    expect(state.legalTargets).toContain("e11");
    expect(state.legalTargets).not.toContain("c11");
    expect(state.legalTargets).not.toContain("d11");
    expect(state.legalTargets).not.toContain("f11");
    expect(state.legalTargets).not.toContain("h11");

    state = fourPlayerReducer(state, { type: "square", square: "b11" });
    expect(state.pending?.step).toBe("hex-target");
    expect(availableFourPlayerActions(state).length).toBeGreaterThan(0);

    for (const level of [1, 2, 3] as const) {
      let leveled = activate(teamHexGame(level), "salem", "hex");
      leveled = fourPlayerReducer(leveled, { type: "square", square: "b11" });
      if (level > 1) {
        expect(leveled.pending?.step).toBe("hex-target");
        expect(availableFourPlayerActions(leveled)).toContainEqual({ type: "pass" });
        leveled = fourPlayerReducer(leveled, { type: "pass" });
      }
      expect(leveled.pending?.step).toBe("source");
      expect(availableFourPlayerActions(leveled).length).toBeGreaterThan(0);
    }
  });

  it("lets Hex target hostile living Kings and preserves them through the reward move", () => {
    for (const level of [1, 2, 3] as const) {
      let state = activate(teamHexGame(level), "salem", "hex");
      expect(state.legalTargets).toEqual(expect.arrayContaining(["a7", "n8"]));
      expect(state.legalTargets).not.toEqual(expect.arrayContaining(["g14", "g1"]));

      state = fourPlayerReducer(state, { type: "square", square: "a7" });
      expect(state.board.a7.status.hexedBy).toBe("north");
      if (level > 1) state = fourPlayerReducer(state, { type: "pass" });
      expect(state.board.a7).toMatchObject({
        type: "king",
        controller: "west",
        status: { hexedBy: "north" },
      });
    }

    let rewarded = gameFor("salem");
    delete rewarded.board.g1;
    rewarded.board.g10 = piece(rewarded, "king", "south", "hexed-king");
    rewarded.board.g8 = piece(rewarded, "rook", "north", "hex-mover");
    rewarded = activate(rewarded, "salem", "hex");
    rewarded = fourPlayerReducer(rewarded, { type: "square", square: "g10" });
    const orbsBeforeMove =
      rewarded.players.north.orbs.light + rewarded.players.north.orbs.dark;
    rewarded = fourPlayerReducer(rewarded, { type: "square", square: "g8" });
    expect(rewarded.legalTargets).toContain("g9");
    rewarded = fourPlayerReducer(rewarded, { type: "square", square: "g9" });

    expect(rewarded.board.g10).toMatchObject({
      id: "hexed-king",
      type: "king",
      status: { hexedBy: "north" },
    });
    expect(
      rewarded.players.north.orbs.light + rewarded.players.north.orbs.dark,
    ).toBe(orbsBeforeMove + 2);
  });

  it("finishes Hex cleanly when no controlled piece has a legal movement", () => {
    let state = teamHexGame();
    delete state.board.g8;
    state.board.g14.status.gazing = true;
    state = activate(state, "salem", "hex");
    state = fourPlayerReducer(state, { type: "square", square: "b11" });

    expect(state.board.b11.status.hexedBy).toBe("north");
    expect(state.pending).toBeUndefined();
    expect(state.selectedAbility).toBeUndefined();
    expect(state.activeSeat).not.toBe("north");
  });

  it("generalizes Midas's Barter, Military Funding, and Leverage", () => {
    let state = gameFor("midas");
    state.board.g8 = piece(state, "rook", "north", "barter");
    state.board.h9 = piece(state, "pawn", "south", "trader");
    state.players.south.orbs.dark = 3;
    let result = move(state, "midas", "barter", "g8", "g9");
    result = fourPlayerReducer(result, { type: "seat", seat: "south" });
    result = fourPlayerReducer(result, { type: "orb", orb: "light" });
    expect(result.players.south.orbs.light).toBe(1);
    expect(result.players.north.orbs.dark).toBe(52);

    state = gameFor("midas");
    state.board.f8 = piece(state, "pawn", "north", "funded-1");
    state.board.g8 = piece(state, "pawn", "north", "funded-2");
    result = activate(state, "midas", "military-funding");
    result = fourPlayerReducer(result, { type: "square", square: "f8" });
    result = fourPlayerReducer(result, { type: "square", square: "f7" });
    result = fourPlayerReducer(result, { type: "square", square: "g8" });
    result = fourPlayerReducer(result, { type: "square", square: "g7" });
    expect(result.board.f7?.id).toBe("funded-1");
    expect(result.board.g7?.id).toBe("funded-2");

    state = gameFor("midas");
    state.board.g8 = piece(state, "rook", "north", "lever");
    state.board.h9 = piece(state, "pawn", "south", "hire");
    result = move(state, "midas", "leverage", "g8", "g9");
    result = fourPlayerReducer(result, { type: "square", square: "h9" });
    expect(result.board.h9).toMatchObject({ controller: "north", owner: "south" });
    expect(result.players.south.orbs.dark).toBe(4);
  });

  it("generalizes Ares's Threaten, Pick a Fight, and Cull the Weak", () => {
    let state = gameFor("ares");
    state.board.g8 = piece(state, "rook", "north", "threat");
    state.board.g11 = piece(state, "pawn", "south", "threatened");
    let result = move(state, "ares", "threaten", "g8", "g9");
    expect(result.players.north.orbs.dark).toBe(51);

    state = gameFor("ares");
    state.board.g8 = piece(state, "knight", "north", "fighter");
    state.board.f11 = piece(state, "rook", "south", "attacker");
    result = move(state, "ares", "pick-a-fight", "g8", "f9");
    expect(result.board.f9?.id).toBe("fighter");

    state = gameFor("ares");
    state.board.g8 = piece(state, "rook", "north", "culler");
    state.board.g11 = piece(state, "pawn", "south", "weak-1");
    state.board.h9 = piece(state, "pawn", "west", "weak-2");
    result = move(state, "ares", "cull-the-weak", "g8", "g9");
    expect([
      result.board.g11?.id,
      result.board.h9?.id,
    ].filter(Boolean)).toHaveLength(1);
  });
});

describe("four-player ability safety regressions", () => {
  const expectCommittedActionLocked = (state: FourPlayerState) => {
    expect(hasCommittedFourPlayerAction(state)).toBe(true);
    expect(fourPlayerReducer(state, { type: "cancel" })).toEqual(state);
    expect(fourPlayerReducer(state, { type: "clear-god" })).toEqual(state);
    const alternateAbility = GODS.find((god) => god.id === state.selectedGod)!
      .abilities.find((ability) => ability.id !== state.selectedAbility)!;
    expect(fourPlayerReducer(state, {
      type: "select-ability",
      abilityId: alternateAbility.id,
    })).toEqual(state);
  };

  it("locks cancellation and ability switching after irreversible pending progress", () => {
    let state = gameFor("death");
    state.board.g8 = piece(state, "rook", "north", "siphon");
    state.board.h9 = piece(state, "pawn", "south", "siphon-target");
    state.players.south.orbs.light = 3;
    expectCommittedActionLocked(move(state, "death", "siphon", "g8", "g9"));

    state = gameFor("chiron");
    state.board.g8 = piece(state, "knight", "north", "mount");
    state.board.h8 = piece(state, "pawn", "north", "rider");
    expectCommittedActionLocked(move(state, "chiron", "mount", "g8", "h10"));

    state = gameFor("midas");
    state.board.g8 = piece(state, "rook", "north", "barter");
    state.board.h9 = piece(state, "pawn", "south", "barter-target");
    expectCommittedActionLocked(move(state, "midas", "barter", "g8", "g9"));

    state = gameFor("death", 3);
    state.board.g8 = piece(state, "rook", "north", "marked");
    expectCommittedActionLocked(move(state, "death", "marked", "g8", "g9"));
  });

  it("locks multi-Resurrect, Hex, and moved Rage progress until completion", () => {
    let state = gameFor("death", 2);
    state.board.g8 = piece(state, "bishop", "north", "bishop");
    state.players.north.graveyard.push(
      {
        piece: piece(state, "pawn", "north", "dead-pawn-1"),
        capturedOnTurn: 0,
      },
      {
        piece: piece(state, "rook", "north", "dead-rook-2"),
        capturedOnTurn: 0,
      },
    );
    state = activate(state, "death", "resurrect");
    state = fourPlayerReducer(state, { type: "grave", pieceId: "dead-pawn-1" });
    state = fourPlayerReducer(state, { type: "square", square: "g9" });
    expect(state.pending?.step).toBe("resurrect-more");
    expectCommittedActionLocked(state);
    state = fourPlayerReducer(state, { type: "choice", value: true });
    expect(state.pending?.step).toBe("grave");
    expectCommittedActionLocked(state);

    state = gameFor("salem", 2);
    state.board.g8 = piece(state, "rook", "north", "hex-mover");
    state.board.g10 = piece(state, "pawn", "south", "hex-target");
    state = activate(state, "salem", "hex");
    state = fourPlayerReducer(state, { type: "square", square: "g10" });
    expect(state.board.g10?.status.hexedBy).toBe("north");
    expectCommittedActionLocked(state);

    state = gameFor("kangus", 3);
    state.board.g8 = piece(state, "rook", "north", "rage-mover");
    state = activate(state, "kangus", "rage");
    state = fourPlayerReducer(state, { type: "square", square: "g8" });
    state = fourPlayerReducer(state, { type: "square", square: "g9" });
    expect(state.board.g9?.id).toBe("rage-mover");
    expect(state.pending?.step).toBe("rage-choice");
    expectCommittedActionLocked(state);
  });

  it("rejects hardened March Home destinations for the King and companions", () => {
    let state = gameFor("leonidas");
    delete state.board.g14;
    state.board.g8 = piece(state, "king", "north", "marching-king");
    state.board.g14 = piece(state, "rook", "south", "hardened-home");
    state.board.g14.status.hardened = 2;
    let result = activate(state, "leonidas", "march-home");
    result = fourPlayerReducer(result, { type: "confirm-ability" });
    expect(result.board.g8?.id).toBe("marching-king");
    expect(result.board.g14?.id).toBe("hardened-home");
    expect(result.notice).toMatch(/hardened/);

    state = gameFor("leonidas", 2);
    delete state.board.g14;
    state.board.g8 = piece(state, "king", "north", "marching-king");
    state.board.h8 = piece(state, "rook", "north", "companion");
    state.board.h14 = piece(state, "rook", "south", "hardened-companion-target");
    state.board.h14.status.hardened = 2;
    result = activate(state, "leonidas", "march-home");
    result = fourPlayerReducer(result, { type: "square", square: "h8" });
    result = fourPlayerReducer(result, { type: "pass" });
    expect(result.board.g8?.id).toBe("marching-king");
    expect(result.board.h8?.id).toBe("companion");
    expect(result.board.h14?.id).toBe("hardened-companion-target");
    expect(result.notice).toMatch(/hardened/);
  });

  it("does not offer a hardened piece as a level-three Resurrect destination", () => {
    let state = gameFor("death", 3);
    state.board.g8 = piece(state, "bishop", "north", "bishop");
    state.board.g9 = piece(state, "rook", "south", "hardened-target");
    state.board.g9.status.hardened = 2;
    state.players.north.graveyard.push({
      piece: piece(state, "pawn", "north", "dead-pawn"),
      capturedOnTurn: 0,
    });
    state = activate(state, "death", "resurrect");
    state = fourPlayerReducer(state, { type: "grave", pieceId: "dead-pawn" });
    expect(state.legalTargets).not.toContain("g9");
    state = fourPlayerReducer(state, { type: "square", square: "g9" });
    expect(state.board.g9?.id).toBe("hardened-target");
    expect(state.players.north.graveyard).toHaveLength(1);
  });

  it("checks King safety on every Slither leg", () => {
    let state = gameFor("medusa");
    state.board.g8 = piece(state, "rook", "south", "line-rook");
    state.board.h11 = piece(state, "queen", "north", "slithering-queen");
    state = activate(state, "medusa", "slither");
    state = fourPlayerReducer(state, { type: "square", square: "h11" });
    expect(state.legalTargets).toContain("g12");
    state = fourPlayerReducer(state, { type: "square", square: "g12" });
    expect(state.pending?.step).toBe("slither");
    expect(state.notice).toMatch(/^Serpentine Step/);
    expect(state.notice).not.toMatch(/^Slither/);
    expect(state.legalTargets).toEqual([]);
    expect(state.board.g12?.id).toBe("slithering-queen");
  });
});
