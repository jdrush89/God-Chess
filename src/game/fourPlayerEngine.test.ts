import { describe, expect, it } from "vitest";
import { GOD_BY_ID, GODS } from "./gods";
import {
  fourPlayerIsInCheck,
  fourPlayerLegalTargets,
} from "./fourPlayerChess";
import {
  createDefaultFourPlayerConfig,
  createFourPlayerDraftOrder,
  createTurnOrder,
  validateFourPlayerConfig,
} from "./fourPlayerConfig";
import {
  createFourPlayerGame,
  fourPlayerReducer,
  unsupportedFourPlayerAbilities,
} from "./fourPlayerEngine";
import { isFourPlayerState, prepareFourPlayerState } from "./fourPlayerPersistence";
import type { FourPlayerPiece, FourPlayerState, Seat } from "./fourPlayerTypes";
import type { PieceType } from "./types";

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

const readyGame = () => {
  const state = createFourPlayerGame();
  state.phase = "play";
  state.activeSeat = "north";
  state.players.north.gods = ["chiron"];
  state.players.east.gods = ["teles"];
  state.players.south.gods = ["ares"];
  state.players.west.gods = ["midas"];
  state.players.north.orbs = { light: 20, dark: 20 };
  state.board = {
    g14: piece(state, "king", "north", "north-king"),
    n8: piece(state, "king", "east", "east-king"),
    g1: piece(state, "king", "south", "south-king"),
    a7: piece(state, "king", "west", "west-king"),
    g10: piece(state, "rook", "north", "north-rook"),
  };
  return state;
};

const validPlayState = () => {
  const state = readyGame();
  state.players.north.gods = ["chiron", "kangus", "ares"];
  state.players.east.gods = ["teles", "artemis", "anubis"];
  state.players.south.gods = ["death", "leonidas", "midas"];
  state.players.west.gods = ["medusa", "salem", "quetzacoatl"];
  state.players.north.orbs = { light: 0, dark: 0 };
  state.draft.pickIndex = 12;
  state.draft.available = [];
  return state;
};

const doubleQueenMate = () => {
  const state = validPlayState();
  state.board = {
    d14: piece(state, "king", "north", "north-king"),
    e14: {
      ...piece(state, "pawn", "north", "north-blocker"),
      status: { hardened: "god" },
    },
    n8: piece(state, "king", "east", "east-king"),
    d10: piece(state, "queen", "east", "east-queen"),
    g1: piece(state, "king", "south", "south-king"),
    f12: piece(state, "queen", "south", "south-queen"),
    a7: piece(state, "king", "west", "west-king"),
  };
  state.activeSeat = "north";
  state.attackSequence = 2;
  state.kingAttackRecency = {
    north: { east: 1, south: 2 },
    east: {},
    south: {},
    west: {},
  };
  return state;
};

const captureSouthKing = (state: FourPlayerState) => {
  let next = fourPlayerReducer(state, { type: "select-god", godId: "chiron" });
  next = fourPlayerReducer(next, { type: "select-ability", abilityId: "gallop" });
  next = fourPlayerReducer(next, { type: "square", square: "g10" });
  return fourPlayerReducer(next, { type: "square", square: "g1" });
};

describe("four-player configuration and flow", () => {
  it("validates distinct display colors, two affinities, and exact teams", () => {
    const config = createDefaultFourPlayerConfig();
    expect(validateFourPlayerConfig(config)).toBe(config);
    config.seats.east.orbAffinity = "light";
    expect(() => validateFourPlayerConfig(config)).toThrow(/exactly two light/);

    const teams = createDefaultFourPlayerConfig();
    teams.mode = "teams";
    teams.teams = {
      north: "team-a",
      east: "team-a",
      south: "team-b",
      west: "team-b",
    };
    teams.turnPolicy = "alternate-teams";
    expect(createTurnOrder(teams)).toEqual(["north", "south", "east", "west"]);
  });

  it("builds the 1-2-3-4, 4-3-2-1, 1-2-3-4 draft", () => {
    expect(createFourPlayerDraftOrder(["north", "east", "south", "west"])).toEqual([
      "north", "east", "south", "west",
      "west", "south", "east", "north",
      "north", "east", "south", "west",
    ]);
    let state = createFourPlayerGame();
    GODS.forEach((god) => {
      state = fourPlayerReducer(state, { type: "draft", godId: god.id });
    });
    expect(state.players.north.gods).toHaveLength(3);
    expect(state.players.east.gods).toHaveLength(3);
    expect(state.players.south.gods).toHaveLength(3);
    expect(state.players.west.gods).toHaveLength(3);
    expect(new Set(Object.values(state.players).flatMap((player) => player.gods)).size).toBe(12);
    expect(state.phase).toBe("play");
    expect(state.activeSeat).toBe("north");
  });

  it("has an explicit four-player implementation for every catalog ability", () => {
    expect(unsupportedFourPlayerAbilities()).toEqual([]);
    expect(GODS.flatMap((god) => god.abilities)).toHaveLength(36);
  });

  it("exposes a serializable state boundary for later save and network layers", () => {
    const state = createFourPlayerGame();
    const prepared = prepareFourPlayerState(state);
    expect(prepared).not.toBe(state);
    expect(isFourPlayerState(JSON.parse(JSON.stringify(prepared)))).toBe(true);
    expect(isFourPlayerState({ ...prepared, variant: "two-player" })).toBe(false);
  });

  it("rejects malformed serialized state and refuses to load it", () => {
    const state = createFourPlayerGame();
    const malformed = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
    const config = malformed.config as Record<string, unknown>;
    const seats = config.seats as Record<string, unknown>;
    delete seats.north;
    expect(isFourPlayerState(malformed)).toBe(false);
    expect(() => fourPlayerReducer(state, {
      type: "load",
      state: malformed as unknown as FourPlayerState,
    })).toThrow(/invalid four-player state/);

    const invalidBoard = JSON.parse(JSON.stringify(state)) as FourPlayerState;
    invalidBoard.board.a1 = structuredClone(invalidBoard.board.g14);
    expect(isFourPlayerState(invalidBoard)).toBe(false);

    const invalidController = JSON.parse(JSON.stringify(state)) as FourPlayerState;
    invalidController.board.g14.controller = "south";
    expect(isFourPlayerState(invalidController)).toBe(false);

    const invalidOrder = JSON.parse(JSON.stringify(state)) as FourPlayerState;
    invalidOrder.turnOrder = ["north", "north", "south", "west"];
    expect(isFourPlayerState(invalidOrder)).toBe(false);

    const invalidOrbs = JSON.parse(JSON.stringify(state)) as FourPlayerState;
    invalidOrbs.players.north.orbs.light = -1;
    expect(isFourPlayerState(invalidOrbs)).toBe(false);
  });

  it("adds attack tracking metadata when preparing older four-player saves", () => {
    const legacy = JSON.parse(JSON.stringify(validPlayState())) as FourPlayerState;
    delete legacy.attackSequence;
    delete legacy.kingAttackRecency;
    expect(isFourPlayerState(legacy)).toBe(true);
    expect(prepareFourPlayerState(legacy)).toMatchObject({
      attackSequence: 0,
      kingAttackRecency: {
        north: {},
        east: {},
        south: {},
        west: {},
      },
    });
  });

  it("records orb rewards with their source and receiving seat for animation", () => {
    const result = captureSouthKing(readyGame());

    expect(result.orbAnimations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        player: "north",
        orb: "dark",
        amount: 2,
        total: 22,
        source: "g1",
      }),
    ]));
  });

  it("eliminates a checkmated player when their turn begins and credits the latest attacker", () => {
    const state = doubleQueenMate();
    expect(fourPlayerIsInCheck(state.board, "north", state.config)).toBe(true);
    expect(fourPlayerLegalTargets(state.board, "d14", state.config)).toEqual([]);

    const result = fourPlayerReducer(state, { type: "load", state });

    expect(result.players.north).toMatchObject({
      eliminated: true,
      eliminatedBy: "south",
    });
    expect(result.players.north.graveyard.at(-1)?.piece.id).toBe("north-king");
    expect(result.board.d14).toBeUndefined();
    expect(result.activeSeat).toBe("east");
    expect(result.history).toContain("North was checkmated by South.");
  });

  it("records the player who adds the final checking attack before mate is resolved", () => {
    let state = readyGame();
    state.turnOrder = ["south", "north", "east", "west"];
    state.activeSeat = "south";
    state.players.south.gods = ["ares"];
    state.players.south.orbs = { light: 0, dark: 0 };
    state.board = {
      d14: piece(state, "king", "north", "north-king"),
      e14: {
        ...piece(state, "pawn", "north", "north-blocker"),
        status: { hardened: "god" },
      },
      n8: piece(state, "king", "east", "east-king"),
      d10: piece(state, "queen", "east", "east-queen"),
      g1: piece(state, "king", "south", "south-king"),
      f10: piece(state, "queen", "south", "south-queen"),
      a7: piece(state, "king", "west", "west-king"),
    };

    state = fourPlayerReducer(state, { type: "select-god", godId: "ares" });
    state = fourPlayerReducer(state, { type: "select-ability", abilityId: "threaten" });
    state = fourPlayerReducer(state, { type: "square", square: "f10" });
    state = fourPlayerReducer(state, { type: "square", square: "f12" });

    expect(state.players.north).toMatchObject({
      eliminated: true,
      eliminatedBy: "south",
    });
    expect(state.activeSeat).toBe("east");
  });

  it("does not eliminate a checked player when a legal escape remains", () => {
    const state = doubleQueenMate();
    delete state.board.e14;

    const result = fourPlayerReducer(state, { type: "load", state });

    expect(fourPlayerLegalTargets(state.board, "d14", state.config)).toContain("e14");
    expect(result.players.north.eliminated).toBe(false);
    expect(result.activeSeat).toBe("north");
  });

  it("counts a divine King escape when deciding whether the active player is checkmated", () => {
    const state = doubleQueenMate();
    state.players.north.gods = ["quetzacoatl", "kangus", "ares"];
    state.players.west.gods = ["medusa", "salem", "chiron"];
    state.players.north.orbs.light = 3;

    const result = fourPlayerReducer(state, { type: "load", state });

    expect(fourPlayerLegalTargets(state.board, "d14", state.config)).toEqual([]);
    expect(result.players.north.eliminated).toBe(false);
    expect(result.activeSeat).toBe("north");
  });

  it("applies first-King victory and takeover through start-of-turn checkmate", () => {
    const state = doubleQueenMate();
    state.config.victoryMode = "first-king-captured";
    state.config.takeover = true;
    state.board.h13 = {
      ...piece(state, "rook", "north", "north-rook"),
      status: { frozen: "god" },
    };

    const result = fourPlayerReducer(state, { type: "load", state });

    expect(result.board.h13.controller).toBe("south");
    expect(result.winner).toEqual({
      seat: "south",
      team: undefined,
      reason: "first-king-captured",
    });
  });

  it("waits for the checked player's turn so an intervening player can disrupt the mate", () => {
    const state = doubleQueenMate();
    state.activeSeat = "east";

    const result = fourPlayerReducer(state, { type: "select-god", godId: "teles" });

    expect(result.players.north.eliminated).toBe(false);
    expect(result.activeSeat).toBe("east");
  });

  it("skips eliminated seats in clockwise turn order", () => {
    let state = readyGame();
    state.players.east.eliminated = true;
    state = fourPlayerReducer(state, { type: "select-god", godId: "chiron" });
    state = fourPlayerReducer(state, { type: "select-ability", abilityId: "gallop" });
    state = fourPlayerReducer(state, { type: "square", square: "g10" });
    state = fourPlayerReducer(state, { type: "square", square: "g11" });
    expect(state.activeSeat).toBe("south");
  });

  it("leaves eliminated pieces inert when takeover is disabled", () => {
    const state = readyGame();
    state.board.h2 = piece(state, "pawn", "south", "south-pawn");
    const result = captureSouthKing(state);
    expect(result.players.south.eliminated).toBe(true);
    expect(result.board.h2.controller).toBeNull();
    expect(result.activeSeat).toBe("east");
  });

  it("transfers remaining pieces but not the eliminated pantheon during takeover", () => {
    const config = createDefaultFourPlayerConfig();
    config.takeover = true;
    const state = readyGame();
    state.config = config;
    state.players.south.gods = ["ares", "midas", "death"];
    state.board.h2 = piece(state, "pawn", "south", "south-pawn");
    const result = captureSouthKing(state);
    expect(result.board.h2).toMatchObject({ owner: "south", controller: "north" });
    expect(result.players.south.gods).toEqual(["ares", "midas", "death"]);
    expect(result.players.south.eliminated).toBe(true);
    expect(result.upgradeQueue).not.toContain("south");
  });

  it("transfers stealthed pieces to the captor instead of deadlocking their return", () => {
    const config = createDefaultFourPlayerConfig();
    config.takeover = true;
    const state = readyGame();
    state.config = config;
    state.stealth.south.push({
      piece: piece(state, "rook", "south", "stealthed-rook"),
      destination: "h8",
      returnOnTurn: 99,
    });
    const result = captureSouthKing(state);
    expect(result.stealth.south).toEqual([]);
    expect(result.stealth.north[0]).toMatchObject({
      destination: "h8",
      piece: { id: "stealthed-rook", owner: "south", controller: "north" },
    });
  });

  it("reverts pieces controlled by an eliminated seat to a living original owner", () => {
    const state = readyGame();
    state.board.h8 = piece(state, "rook", "east", "hired-rook", "south");
    state.board.h8.status.hired = true;
    state.stealth.south.push({
      piece: piece(state, "bishop", "east", "hired-stealth", "south"),
      destination: "h9",
      returnOnTurn: 99,
    });
    const result = captureSouthKing(state);
    expect(result.board.h8).toMatchObject({ owner: "east", controller: "east" });
    expect(result.board.h8.status.hired).toBeUndefined();
    expect(result.stealth.south).toEqual([]);
    expect(result.stealth.east[0]).toMatchObject({
      piece: { id: "hired-stealth", owner: "east", controller: "east" },
    });
  });

  it("chains control of pieces whose original owner was already eliminated", () => {
    const config = createDefaultFourPlayerConfig();
    config.takeover = true;
    const state = readyGame();
    state.config = config;
    state.players.west.eliminated = true;
    delete state.board.a7;
    state.board.h8 = piece(state, "rook", "west", "inherited-rook", "south");
    state.stealth.south.push({
      piece: piece(state, "bishop", "west", "inherited-stealth", "south"),
      destination: "h9",
      returnOnTurn: 99,
    });
    const result = captureSouthKing(state);
    expect(result.board.h8.controller).toBe("north");
    expect(result.stealth.north[0].piece).toMatchObject({
      id: "inherited-stealth",
      owner: "west",
      controller: "north",
    });
  });

  it("ends immediately on the first captured King when configured", () => {
    const state = readyGame();
    state.config.victoryMode = "first-king-captured";
    const result = captureSouthKing(state);
    expect(result.phase).toBe("gameover");
    expect(result.winner).toEqual({ seat: "north", team: undefined, reason: "first-king-captured" });
  });

  it("does not award first-King victory when Rage destroys the acting King's own King", () => {
    let state = readyGame();
    state.config.victoryMode = "first-king-captured";
    state.players.north.gods = ["kangus"];
    state.players.north.orbs.dark = 10;
    state.board = {
      g9: piece(state, "king", "north", "north-king"),
      n8: piece(state, "king", "east", "east-king"),
      g1: piece(state, "king", "south", "south-king"),
      a7: piece(state, "king", "west", "west-king"),
      g8: piece(state, "rook", "north", "rage-center"),
    };
    state = fourPlayerReducer(state, { type: "select-god", godId: "kangus" });
    state = fourPlayerReducer(state, { type: "select-ability", abilityId: "rage" });
    state = fourPlayerReducer(state, { type: "square", square: "g8" });
    expect(state.players.north.eliminated).toBe(true);
    expect(state.winner).toBeUndefined();
    expect(state.phase).toBe("play");
    expect(state.activeSeat).toBe("east");
  });

  it("stops friendly fire after self-elimination and does not leave takeover ghost controllers", () => {
    let state = readyGame();
    state.config.victoryMode = "first-king-captured";
    state.config.takeover = true;
    state.players.north.gods = ["kangus"];
    state.players.north.orbs.dark = 10;
    state.board = {
      g9: piece(state, "king", "north", "north-king"),
      h9: piece(state, "king", "east", "east-king"),
      g1: piece(state, "king", "south", "south-king"),
      a7: piece(state, "king", "west", "west-king"),
      g8: piece(state, "rook", "north", "rage-center"),
    };
    state = fourPlayerReducer(state, { type: "select-god", godId: "kangus" });
    state = fourPlayerReducer(state, { type: "select-ability", abilityId: "rage" });
    state = fourPlayerReducer(state, { type: "square", square: "g8" });
    expect(state.players.north.eliminated).toBe(true);
    expect(state.players.east.eliminated).toBe(false);
    expect(state.winner).toBeUndefined();
    expect(Object.values(state.board).every((candidate) => candidate.controller !== "north")).toBe(true);
  });

  it("does not award first-King victory for destroying a teammate King", () => {
    const config = createDefaultFourPlayerConfig();
    config.mode = "teams";
    config.teams = {
      north: "team-a",
      east: "team-a",
      south: "team-b",
      west: "team-b",
    };
    config.victoryMode = "first-king-captured";
    let state = createFourPlayerGame(config);
    state.phase = "play";
    state.activeSeat = "north";
    state.players.north.gods = ["kangus"];
    state.players.east.gods = ["teles"];
    state.players.south.gods = ["ares"];
    state.players.west.gods = ["midas"];
    state.players.north.orbs.dark = 10;
    state.board = {
      g14: piece(state, "king", "north", "north-king"),
      m9: piece(state, "king", "east", "east-king"),
      n8: piece(state, "king", "south", "south-king"),
      a7: piece(state, "king", "west", "west-king"),
      m8: piece(state, "rook", "north", "rage-center"),
    };
    state = fourPlayerReducer(state, { type: "select-god", godId: "kangus" });
    state = fourPlayerReducer(state, { type: "select-ability", abilityId: "rage" });
    state = fourPlayerReducer(state, { type: "square", square: "m8" });
    expect(state.players.east.eliminated).toBe(true);
    expect(state.players.south.eliminated).toBe(true);
    expect(state.winner).toBeUndefined();
    expect(state.phase).toBe("play");
    expect(state.activeSeat).toBe("west");
  });

  it("wins FFA only when one player remains", () => {
    const state = readyGame();
    state.players.east.eliminated = true;
    state.players.west.eliminated = true;
    const result = captureSouthKing(state);
    expect(result.winner).toEqual({ seat: "north", team: undefined, reason: "last-player" });
  });

  it("wins team mode when only one team has a surviving seat", () => {
    const config = createDefaultFourPlayerConfig();
    config.mode = "teams";
    config.teams = {
      north: "team-a",
      east: "team-a",
      south: "team-b",
      west: "team-b",
    };
    const state = readyGame();
    state.config = config;
    state.players.west.eliminated = true;
    const result = captureSouthKing(state);
    expect(result.winner).toEqual({ seat: undefined, team: "team-a", reason: "last-team" });
  });

  it("allows Rage to capture teammate pieces even though ordinary captures are blocked", () => {
    const config = createDefaultFourPlayerConfig();
    config.mode = "teams";
    config.teams = {
      north: "team-a",
      east: "team-a",
      south: "team-b",
      west: "team-b",
    };
    let state = createFourPlayerGame(config);
    state.phase = "play";
    state.activeSeat = "north";
    state.players.north.gods = ["kangus"];
    state.players.north.orbs.dark = 10;
    state.board = {
      g14: piece(state, "king", "north", "north-king"),
      n8: piece(state, "king", "east", "east-king"),
      h1: piece(state, "king", "south", "south-king"),
      a7: piece(state, "king", "west", "west-king"),
      g8: piece(state, "rook", "north", "center"),
      g9: piece(state, "pawn", "east", "teammate"),
      h8: piece(state, "pawn", "south", "enemy"),
    };
    state = fourPlayerReducer(state, { type: "select-god", godId: "kangus" });
    state = fourPlayerReducer(state, { type: "select-ability", abilityId: "rage" });
    state = fourPlayerReducer(state, { type: "square", square: "g8" });
    expect(state.board.g9).toBeUndefined();
    expect(state.board.h8).toBeUndefined();
    expect(state.players.east.graveyard.at(-1)?.piece.id).toBe("teammate");
  });

  it("removes eliminated pantheons from rest and upgrade accounting", () => {
    let state = readyGame();
    state.players.north.gods = ["chiron"];
    state.players.east.gods = ["teles"];
    state.players.south.gods = ["ares"];
    state.players.west.gods = ["midas"];
    state.players.south.eliminated = true;
    state.rested = ["teles", "midas"];
    state = fourPlayerReducer(state, { type: "select-god", godId: "chiron" });
    state = fourPlayerReducer(state, { type: "select-ability", abilityId: "gallop" });
    state = fourPlayerReducer(state, { type: "square", square: "g10" });
    state = fourPlayerReducer(state, { type: "square", square: "g11" });
    expect(state.phase).toBe("upgrade");
    expect(state.upgradeQueue).toEqual(["north", "east", "west"]);
  });

  it("keeps opponent-next-turn effects through allied turns and expires them after a hostile turn", () => {
    const config = createDefaultFourPlayerConfig();
    config.mode = "teams";
    config.teams = {
      north: "team-a",
      east: "team-a",
      south: "team-b",
      west: "team-b",
    };
    let state = createFourPlayerGame(config);
    state.phase = "play";
    state.activeSeat = "east";
    state.players.north.gods = ["kangus"];
    state.players.east.gods = ["chiron"];
    state.players.south.gods = ["ares"];
    state.players.west.gods = ["midas"];
    state.board = {
      g14: piece(state, "king", "north", "north-king"),
      n8: piece(state, "king", "east", "east-king"),
      g1: piece(state, "king", "south", "south-king"),
      a7: piece(state, "king", "west", "west-king"),
      g8: piece(state, "pawn", "north", "ritual-piece"),
      h8: piece(state, "rook", "east", "east-rook"),
      h10: piece(state, "rook", "south", "south-rook"),
    };
    state.board.g8.status.ritual = { owner: "north", expires: 1 };
    state.bananas = [{ square: "f8", owner: "north", expires: 1 }];

    state = fourPlayerReducer(state, { type: "select-god", godId: "chiron" });
    state = fourPlayerReducer(state, { type: "select-ability", abilityId: "gallop" });
    state = fourPlayerReducer(state, { type: "square", square: "h8" });
    state = fourPlayerReducer(state, { type: "square", square: "h9" });
    expect(state.board.g8.status.ritual).toBeDefined();
    expect(state.bananas).toHaveLength(1);
    expect(state.hostileTurns.north).toBe(0);

    state = fourPlayerReducer(state, { type: "select-god", godId: "ares" });
    state = fourPlayerReducer(state, { type: "select-ability", abilityId: "threaten" });
    state = fourPlayerReducer(state, { type: "square", square: "h10" });
    state = fourPlayerReducer(state, { type: "square", square: "h11" });
    expect(state.board.g8.status.ritual).toBeUndefined();
    expect(state.bananas).toEqual([]);
    expect(state.hostileTurns.north).toBe(1);
  });

  it("starts the next round instead of deadlocking when every pantheon is maxed", () => {
    let state = readyGame();
    for (const player of Object.values(state.players)) {
      for (const godId of player.gods) {
        for (const ability of GOD_BY_ID[godId].abilities) {
          player.upgrades[ability.id] = 3;
        }
      }
    }
    state.rested = ["teles", "ares", "midas"];
    state = fourPlayerReducer(state, { type: "select-god", godId: "chiron" });
    state = fourPlayerReducer(state, { type: "select-ability", abilityId: "gallop" });
    state = fourPlayerReducer(state, { type: "square", square: "g10" });
    state = fourPlayerReducer(state, { type: "square", square: "g11" });
    expect(state.phase).toBe("play");
    expect(state.round).toBe(2);
    expect(state.rested).toEqual([]);
    expect(state.upgradeQueue).toEqual([]);
    expect(state.activeSeat).toBe("north");
  });
});
