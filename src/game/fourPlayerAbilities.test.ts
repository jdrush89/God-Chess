import { describe, expect, it } from "vitest";
import { GODS } from "./gods";
import { createFourPlayerGame, fourPlayerReducer } from "./fourPlayerEngine";
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

describe("four-player God abilities", () => {
  it("generalizes Quetzacoatl's Flight, Air Lift, and Air Strike", () => {
    let state = gameFor("quetzacoatl");
    state.board.g8 = piece(state, "rook", "north", "carrier");
    state.board.g9 = piece(state, "pawn", "south", "crossed");
    let result = move(state, "quetzacoatl", "flight", "g8", "g10");
    expect(result.board.g10?.id).toBe("carrier");
    expect(result.players.north.orbs.light).toBe(51);

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
    state.board.g8 = piece(state, "pawn", "south", "enchanted");
    result = move(state, "teles", "enchant", "g8", "g9");
    expect(result.board.g9).toMatchObject({ id: "enchanted", controller: "south" });
    expect(result.activeSeat).toBe("north");
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
