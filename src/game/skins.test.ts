import { describe, expect, it } from "vitest";
import { createGame, gameReducer } from "./engine";
import { createFourPlayerGame, fourPlayerReducer } from "./fourPlayerEngine";
import { prepareFourPlayerState } from "./fourPlayerPersistence";
import { createThreePlayerGame, threePlayerReducer } from "./threePlayerEngine";
import { prepareThreePlayerState } from "./threePlayerPersistence";
import { prepareTwoPlayerState } from "../saves";

describe("drafted God skins", () => {
  it("stores Salem's unlocked Chonk skin in a classic draft", () => {
    const state = createGame(1);
    const next = gameReducer(state, {
      type: "draft",
      godId: "salem",
      skinId: "chonk",
    });

    expect(next.players.white.gods).toContain("salem");
    expect(next.players.white.godSkins?.salem).toBe("chonk");
  });

  it("rejects locked and mismatched skins in a classic draft", () => {
    const state = createGame(1);
    const locked = gameReducer(state, {
      type: "draft",
      godId: "anubis",
      skinId: "tightrope",
    });
    const mismatched = gameReducer(state, {
      type: "draft",
      godId: "salem",
      skinId: "tightrope",
    });

    expect(locked.draft.pickIndex).toBe(0);
    expect(locked.players.white.gods).toEqual([]);
    expect(mismatched.draft.pickIndex).toBe(0);
    expect(mismatched.players.white.gods).toEqual([]);
  });

  it("stores Salem's unlocked Chonk skin in three-player drafts", () => {
    const state = createThreePlayerGame();
    const next = threePlayerReducer(state, {
      type: "draft",
      godId: "salem",
      skinId: "chonk",
    });

    expect(next.players.white.gods).toContain("salem");
    expect(next.players.white.godSkins?.salem).toBe("chonk");
  });

  it("rejects locked skins in three-player drafts", () => {
    const state = createThreePlayerGame();
    const next = threePlayerReducer(state, {
      type: "draft",
      godId: "anubis",
      skinId: "tightrope",
    });

    expect(next.draft.pickIndex).toBe(0);
    expect(next.players.white.gods).toEqual([]);
  });

  it("stores Salem's unlocked Chonk skin in four-player drafts", () => {
    const state = createFourPlayerGame();
    const firstSeat = state.activeSeat;
    const next = fourPlayerReducer(state, {
      type: "draft",
      godId: "salem",
      skinId: "chonk",
    });

    expect(next.players[firstSeat].gods).toContain("salem");
    expect(next.players[firstSeat].godSkins?.salem).toBe("chonk");
  });

  it("rejects locked skins in four-player drafts", () => {
    const state = createFourPlayerGame();
    const firstSeat = state.activeSeat;
    const next = fourPlayerReducer(state, {
      type: "draft",
      godId: "anubis",
      skinId: "tightrope",
    });

    expect(next.draft.pickIndex).toBe(0);
    expect(next.players[firstSeat].gods).toEqual([]);
  });

  it("migrates old states without skin selections", () => {
    const classic = createGame(1);
    delete classic.players.white.godSkins;
    delete classic.players.black.godSkins;
    expect(prepareTwoPlayerState(classic).players.white.godSkins).toEqual({});

    const threePlayer = createThreePlayerGame();
    delete threePlayer.players.white.godSkins;
    delete threePlayer.players.red.godSkins;
    delete threePlayer.players.black.godSkins;
    expect(prepareThreePlayerState(threePlayer).players.red.godSkins).toEqual({});

    const fourPlayer = createFourPlayerGame();
    delete fourPlayer.players.north.godSkins;
    delete fourPlayer.players.east.godSkins;
    delete fourPlayer.players.south.godSkins;
    delete fourPlayer.players.west.godSkins;
    expect(prepareFourPlayerState(fourPlayer).players.south.godSkins).toEqual({});
  });
});
