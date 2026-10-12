import { describe, expect, it } from "vitest";
import { gameReducer, isClassicGodResting } from "./engine";
import {
  CHALLENGES,
  createClassicChallenge,
  createGangUpChallenge,
  createJumpedChallenge,
} from "./challenges";
import { GOD_BY_ID } from "./gods";
import type { Piece } from "./types";

const piece = (
  id: string,
  type: Piece["type"],
  color: Piece["color"],
): Piece => ({
  id,
  type,
  color,
  controller: color,
  hasMoved: false,
  status: {},
});

const useBasicMove = (
  state: ReturnType<typeof createClassicChallenge>,
  godId: "kangus" | "ares",
  abilityId: "ritual-sacrifice" | "threaten",
  from: string,
  to: string,
) => {
  let next = gameReducer(state, { type: "select-god", godId });
  next = gameReducer(next, { type: "select-ability", abilityId });
  next = gameReducer(next, { type: "square", square: from });
  return gameReducer(next, { type: "square", square: to });
};

describe("special challenges", () => {
  it("defines all eight challenges and level 10 AI opponents", () => {
    expect(CHALLENGES).toHaveLength(8);
    for (const challengeId of [
      "phalanx",
      "there-can-only-be-one",
      "underdog",
      "underest-dog",
      "regicide",
      "littering-and",
    ] as const) {
      expect(createClassicChallenge(challengeId).aiDifficulty).toBe(10);
    }
    const gangUp = createGangUpChallenge();
    expect(gangUp.players.red.control).toEqual({ kind: "ai", difficulty: 10 });
    expect(gangUp.players.black.control).toEqual({ kind: "ai", difficulty: 10 });
    const jumped = createJumpedChallenge();
    for (const seat of ["east", "south", "west"] as const) {
      expect(jumped.players[seat].control).toEqual({
        kind: "ai",
        difficulty: 10,
      });
    }
  });

  it("sets fixed pantheons, upgrades, and banana peels", () => {
    expect(createClassicChallenge("phalanx").players.black.gods)
      .toEqual(["ares", "ares", "ares"]);
    expect(createClassicChallenge("regicide").players.black.gods)
      .toEqual(["medusa", "medusa", "medusa"]);

    for (const [id, level] of [
      ["underdog", 2],
      ["underest-dog", 3],
    ] as const) {
      const state = createClassicChallenge(id);
      for (const godId of state.players.black.gods) {
        for (const ability of GOD_BY_ID[godId].abilities) {
          expect(state.players.black.upgrades[ability.id]).toBe(level);
        }
      }
    }

    const littering = createClassicChallenge("littering-and");
    expect(littering.bananas).toHaveLength(10);
    expect(new Set(littering.bananas.map((banana) => banana.square)).size)
      .toBe(10);
  });

  it("tracks duplicate God uses independently for each color", () => {
    const state = createClassicChallenge("phalanx");
    state.phase = "play";
    state.players.white.gods = ["kangus"];
    state.activeColor = "black";
    state.challengeGodUses = {
      white: {},
      black: { ares: 1 },
    };

    expect(isClassicGodResting(state, "black", "ares")).toBe(false);
    expect(isClassicGodResting(state, "white", "kangus")).toBe(false);
    state.challengeGodUses.black.ares = 3;
    expect(isClassicGodResting(state, "black", "ares")).toBe(true);
  });

  it("upgrades Kangus after every turn and makes Kangus available again", () => {
    let state = createClassicChallenge("there-can-only-be-one");
    state = useBasicMove(
      state,
      "kangus",
      "ritual-sacrifice",
      "e2",
      "e4",
    );

    expect(state.phase).toBe("upgrade");
    expect(state.activeColor).toBe("white");
    state = gameReducer(state, {
      type: "upgrade",
      abilityId: "ritual-sacrifice",
    });

    expect(state.phase).toBe("play");
    expect(state.activeColor).toBe("black");
    expect(state.players.white.upgrades["ritual-sacrifice"]).toBe(2);
    expect(isClassicGodResting(state, "black", "kangus")).toBe(false);
  });

  it("passes the Regicide crown to the second Queen, then ends the game", () => {
    let state = createClassicChallenge("regicide");
    state.phase = "play";
    state.activeColor = "white";
    state.players.white.gods = ["ares"];
    state.players.black.gods = ["medusa", "medusa", "medusa"];
    state.board = {
      e1: piece("white-king", "king", "white"),
      a1: piece("white-rook", "rook", "white"),
      a8: {
        ...piece("black-royal-queen", "queen", "black"),
        status: { challengeRoyal: true },
      },
      h8: piece("black-second-queen", "queen", "black"),
    };

    state = useBasicMove(state, "ares", "threaten", "a1", "a8");
    expect(state.phase).toBe("play");
    expect(state.board.h8.status.challengeRoyal).toBe(true);

    state.activeColor = "white";
    state.rested = [];
    state.challengeGodUses = { white: {}, black: {} };
    state = useBasicMove(state, "ares", "threaten", "a8", "h8");
    expect(state.phase).toBe("gameover");
    expect(state.winner).toBe("white");
  });

  it("configures allied Gang Up and uneven Jumped teams", () => {
    const gangUp = createGangUpChallenge("Hero");
    expect(gangUp.config.boardVariant).toBe("three-hexagonal");
    expect(gangUp.config.teams).toEqual({
      white: "player",
      red: "allied-ai",
      black: "allied-ai",
    });

    const jumped = createJumpedChallenge("Hero");
    expect(jumped.config.mode).toBe("teams");
    expect(jumped.config.allowUnevenTeams).toBe(true);
    expect(jumped.config.teams).toEqual({
      north: "team-a",
      east: "team-b",
      south: "team-b",
      west: "team-b",
    });
  });
});
