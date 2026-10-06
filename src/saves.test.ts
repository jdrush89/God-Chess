// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { createFourPlayerGame, fourPlayerReducer } from "./game/fourPlayerEngine";
import { createThreePlayerGame, threePlayerReducer } from "./game/threePlayerEngine";
import { createGame, gameReducer } from "./game/engine";
import { GODS } from "./game/gods";
import {
  createSavedGame,
  isFourPlayerSavedGame,
  isThreePlayerSavedGame,
  LEGACY_SAVE_KEY,
  loadLocalSavedGames,
  normalizeSavedGame,
  SAVE_KEY,
} from "./saves";

describe("saved-game variants", () => {
  it("round-trips completed Mount route history", () => {
    let state = createGame(2);
    state.phase = "play";
    state.activeColor = "black";
    state.players.black.gods = ["chiron"];
    state.players.white.gods = ["ares"];
    state.players.black.orbs.white = 1;
    state = gameReducer(state, { type: "select-god", godId: "chiron" });
    state = gameReducer(state, { type: "select-ability", abilityId: "mount" });
    state = gameReducer(state, { type: "square", square: "b8" });
    state = gameReducer(state, { type: "square", square: "c6" });
    state = gameReducer(state, { type: "square", square: "b7" });
    state = gameReducer(state, { type: "square", square: "b6" });

    const normalized = normalizeSavedGame(JSON.parse(JSON.stringify(
      createSavedGame("mount-history", state, []),
    )));
    expect(normalized?.state.lastAction).toBe(
      "Black used Mount with Chiron: Knight b8 -> c6; Pawn b7 -> b6; 1 rider.",
    );
  });

  it("round-trips in-progress Mount route metadata", () => {
    let state = createGame(2);
    state.phase = "play";
    state.activeColor = "black";
    state.players.black.gods = ["chiron"];
    state.players.white.gods = ["ares"];
    state.players.black.orbs.white = 1;
    state.players.black.upgrades.mount = 2;
    state = gameReducer(state, { type: "select-god", godId: "chiron" });
    state = gameReducer(state, { type: "select-ability", abilityId: "mount" });
    state = gameReducer(state, { type: "square", square: "b8" });
    state = gameReducer(state, { type: "square", square: "c6" });
    state = gameReducer(state, { type: "square", square: "b7" });
    state = gameReducer(state, { type: "square", square: "b6" });

    const normalized = normalizeSavedGame(JSON.parse(JSON.stringify(
      createSavedGame("mount-pending", state, []),
    )));
    expect(normalized?.state.pending).toMatchObject({
      abilityId: "mount",
      step: "mount-rider",
      selected: [state.board.b6?.id],
      mountHistory: [
        "Knight b8 -> c6",
        "Pawn b7 -> b6",
      ],
    });
  });

  it("normalizes a strict four-player state and matching undo snapshots", () => {
    const state = fourPlayerReducer(createFourPlayerGame(), {
      type: "draft",
      godId: "ares",
    });
    const saved = createSavedGame("four", state, [createFourPlayerGame()]);
    const normalized = normalizeSavedGame(JSON.parse(JSON.stringify(saved)));
    expect(normalized && isFourPlayerSavedGame(normalized)).toBe(true);
    if (!normalized || !isFourPlayerSavedGame(normalized)) return;
    expect(normalized.state.variant).toBe("four-player");
    expect(normalized.state.players.north.gods).toEqual(["ares"]);
    expect(normalized.undoHistory).toHaveLength(1);
  });

  it("rejects coercible nested numeric strings in four-player saves", () => {
    const base = createFourPlayerGame();
    const pieceId = Object.keys(base.board)[0];
    const prepared = structuredClone(base) as unknown as {
      board: Record<string, { status: { prepared?: { owner: string; level: string } } }>;
    };
    prepared.board[pieceId].status.prepared = { owner: "north", level: "2" };
    expect(normalizeSavedGame(createSavedGame("four", prepared as never, []))).toBeUndefined();

    const upgrades = structuredClone(base) as unknown as {
      players: { north: { upgrades: Record<string, string> } };
    };
    upgrades.players.north.upgrades[GODS[0].abilities[0].id] = "2";
    expect(normalizeSavedGame(createSavedGame("four", upgrades as never, []))).toBeUndefined();
  });
  it("rejects mixed-variant undo histories", () => {
    const state = createFourPlayerGame();
    const malformed = {
      version: 3,
      id: "mixed",
      savedAt: new Date().toISOString(),
      state,
      undoHistory: [createGame(1)],
    };
    expect(normalizeSavedGame(malformed)).toBeUndefined();
  });

  it("normalizes strict three-player states and matching undo snapshots", () => {
    const initial = createThreePlayerGame();
    const state = threePlayerReducer(initial, {
      type: "draft",
      godId: "ares",
    });
    const saved = createSavedGame("three", state, [initial], initial);
    const normalized = normalizeSavedGame(JSON.parse(JSON.stringify(saved)));
    expect(normalized && isThreePlayerSavedGame(normalized)).toBe(true);
    if (!normalized || !isThreePlayerSavedGame(normalized)) return;
    expect(normalized.state.variant).toBe("three-player");
    expect(normalized.state.players.white.gods).toEqual(["ares"]);
    expect(normalized.undoHistory).toHaveLength(1);
    expect(normalized.turnStart?.variant).toBe("three-player");
  });

  it("rejects mixed three-player undo histories", () => {
    const state = createThreePlayerGame();
    expect(normalizeSavedGame({
      version: 3,
      id: "mixed-three",
      savedAt: new Date().toISOString(),
      state,
      undoHistory: [createFourPlayerGame()],
    })).toBeUndefined();
  });

  it("continues normalizing existing two-player saves", () => {
    const state = createGame(1);
    const normalized = normalizeSavedGame({
      version: 3,
      id: "two",
      savedAt: new Date().toISOString(),
      state,
      undoHistory: [state],
    });
    expect(normalized && !isFourPlayerSavedGame(normalized)).toBe(true);
  });

  it("persists the human upgrade handoff without transient AI presentation state", () => {
    let state = createGame(2, { mode: "ai" });
    for (const godId of ["ares", "medusa", "midas", "death", "artemis", "chiron"] as const) {
      state = gameReducer(state, { type: "draft", godId });
    }
    state.phase = "upgrade";
    state.activeColor = "white";
    state.upgradeQueue = ["white", "black"];
    state = gameReducer(state, {
      type: "preview-upgrade",
      godId: "ares",
      abilityId: "threaten",
    });
    state = gameReducer(state, { type: "upgrade", abilityId: "threaten" });

    const saved = createSavedGame("ai-upgrade-handoff", state, []);
    expect(saved.state.activeColor).toBe("black");
    expect(saved.state.upgradeQueue).toEqual(["black"]);
    expect(saved.state.presentation).toBeUndefined();
    expect(saved.state.upgradePreview).toBeUndefined();
  });

  it("round-trips Hex status on hostile Kings in every saved-game variant", () => {
    const classic = createGame(1);
    const classicKing = Object.values(classic.board).find((piece) =>
      piece.type === "king" && piece.controller === "black"
    )!;
    classicKing.status.hexedBy = "white";
    const normalizedClassic = normalizeSavedGame(
      JSON.parse(JSON.stringify(createSavedGame("classic-hex-king", classic, []))),
    );
    expect(normalizedClassic?.state.board.e8?.status.hexedBy).toBe("white");

    const four = createFourPlayerGame();
    const fourKing = Object.values(four.board).find((piece) =>
      piece.type === "king" && piece.controller === "east"
    )!;
    fourKing.status.hexedBy = "north";
    const normalizedFour = normalizeSavedGame(
      JSON.parse(JSON.stringify(createSavedGame("four-hex-king", four, []))),
    );
    expect(
      normalizedFour && isFourPlayerSavedGame(normalizedFour) &&
        Object.values(normalizedFour.state.board).some((piece) =>
          piece.type === "king" && piece.status.hexedBy === "north"
        ),
    ).toBe(true);

    const three = createThreePlayerGame();
    const threeKing = Object.values(three.board).find((piece) =>
      piece.type === "king" && piece.controller === "red"
    )!;
    threeKing.status.hexedBy = "white";
    const normalizedThree = normalizeSavedGame(
      JSON.parse(JSON.stringify(createSavedGame("three-hex-king", three, []))),
    );
    expect(
      normalizedThree && isThreePlayerSavedGame(normalizedThree) &&
        Object.values(normalizedThree.state.board).some((piece) =>
          piece.type === "king" && piece.status.hexedBy === "white"
        ),
    ).toBe(true);
  });

  it("validates canonical Enchant pending stages for classic and four-player saves", () => {
    let classic = createGame(1);
    for (const godId of ["teles", "chiron", "midas", "death", "artemis", "medusa"] as const) {
      classic = gameReducer(classic, { type: "draft", godId });
    }
    classic.selectedGod = "teles";
    classic.selectedAbility = "enchant";
    classic.pending = {
      godId: "teles",
      abilityId: "enchant",
      step: "enchant-followup-move",
      source: "b8",
      destination: "c6",
      movedPieceId: classic.board.b8.id,
    };
    expect(normalizeSavedGame(createSavedGame("classic-enchant", classic, [])))
      .toBeTruthy();
    expect(gameReducer(classic, { type: "load-game", state: classic }).pending?.step)
      .toBe("enchant-followup-move");
    const invalidClassic = structuredClone(classic);
    delete invalidClassic.pending!.destination;
    expect(normalizeSavedGame(createSavedGame("bad-classic-enchant", invalidClassic, [])))
      .toBeUndefined();

    const orderedGods = [
      GODS.find((god) => god.id === "teles")!,
      ...GODS.filter((god) => god.id !== "teles"),
    ];
    let four = createFourPlayerGame();
    for (const god of orderedGods) {
      four = fourPlayerReducer(four, { type: "draft", godId: god.id });
    }
    four.selectedGod = "teles";
    four.selectedAbility = "enchant";
    four.pending = {
      godId: "teles",
      abilityId: "enchant",
      step: "enchant-followup-move",
      source: "d13",
      destination: "d12",
      movedPieceId: four.board.d13.id,
    };
    expect(normalizeSavedGame(createSavedGame("four-enchant", four, [])))
      .toBeTruthy();
    expect(fourPlayerReducer(four, { type: "load", state: four }).pending?.step)
      .toBe("enchant-followup-move");
    const invalidFour = structuredClone(four);
    delete invalidFour.pending!.movedPieceId;
    expect(normalizeSavedGame(createSavedGame("bad-four-enchant", invalidFour, [])))
      .toBeUndefined();
  });

  it("round-trips a classic stalemate result and its post-game undo state", () => {
    let state = createGame(1);
    for (const god of GODS.slice(0, 6)) {
      state = gameReducer(state, { type: "draft", godId: god.id });
    }
    const undo = structuredClone(state);
    state.phase = "gameover";
    state.winner = undefined;
    state.result = { kind: "draw", reason: "stalemate" };
    state.notice = "White was stalemated. The match is a draw.";

    const normalized = normalizeSavedGame(JSON.parse(JSON.stringify(
      createSavedGame("classic-stalemate", state, [undo], undo),
    )));

    expect(normalized && !isFourPlayerSavedGame(normalized) &&
      !isThreePlayerSavedGame(normalized)).toBe(true);
    if (
      !normalized ||
      isFourPlayerSavedGame(normalized) ||
      isThreePlayerSavedGame(normalized)
    ) return;
    expect(normalized.state.result).toEqual({
      kind: "draw",
      reason: "stalemate",
    });
    expect(normalized.undoHistory[0].phase).toBe("play");
    expect(normalized.turnStart?.phase).toBe("play");
  });

  it("rejects primitive state values without throwing", () => {
    expect(() => normalizeSavedGame({
      version: 3,
      id: "malformed",
      savedAt: new Date().toISOString(),
      state: 42,
      undoHistory: [],
    })).not.toThrow();
    expect(normalizeSavedGame({
      version: 3,
      id: "malformed",
      savedAt: new Date().toISOString(),
      state: 42,
      undoHistory: [],
    })).toBeUndefined();
  });

  it("discards malformed local records without losing valid saves", () => {
    const valid = createSavedGame("valid", createGame(1), []);
    window.localStorage.setItem(SAVE_KEY, JSON.stringify([
      42,
      { version: 3, id: "bad", savedAt: valid.savedAt, state: null },
      valid,
    ]));
    expect(loadLocalSavedGames()).toEqual([valid]);
  });

  it("discards a malformed legacy record without losing current saves", () => {
    const valid = createSavedGame("valid", createGame(1), []);
    window.localStorage.setItem(SAVE_KEY, JSON.stringify([valid]));
    window.localStorage.setItem(LEGACY_SAVE_KEY, "{not-json");
    expect(loadLocalSavedGames()).toEqual([valid]);
    expect(window.localStorage.getItem(LEGACY_SAVE_KEY)).toBeNull();
  });
});
