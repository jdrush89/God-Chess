import { describe, expect, it } from "vitest";
import {
  createInitialBoard,
  flightPathSquares,
  isInCheck,
  legalTargets,
  lineOfSight,
  lineOfSightSquares,
  pathSquares,
} from "./chess";
import { createGame, gameReducer } from "./engine";
import { GOD_BY_ID } from "./gods";
import type { Color, Piece, PieceType } from "./types";

const testPiece = (type: PieceType, color: Color, id: string): Piece => ({
  id,
  type,
  color,
  controller: color,
  hasMoved: false,
  status: {},
});

const createPreparedShotTurn = (level: 1 | 2 | 3 = 1) => {
  let state = createGame(1);
  (["artemis", "chiron", "teles", "death", "ares", "midas"] as const).forEach((godId) => {
    state = gameReducer(state, { type: "draft", godId });
  });
  state.players.white.orbs.black = 3;
  state.players.white.upgrades.snipe = level;

  state = gameReducer(state, { type: "select-god", godId: "artemis" });
  state = gameReducer(state, { type: "select-ability", abilityId: "snipe" });
  state = gameReducer(state, { type: "square", square: "e2" });
  state = gameReducer(state, { type: "square", square: "e4" });

  state = gameReducer(state, { type: "select-god", godId: "chiron" });
  state = gameReducer(state, { type: "select-ability", abilityId: "gallop" });
  state = gameReducer(state, { type: "square", square: "d7" });
  return gameReducer(state, { type: "square", square: "d5" });
};

describe("chess movement", () => {
  it("generates standard opening pawn and knight moves", () => {
    const board = createInitialBoard();
    expect(legalTargets(board, "e2")).toEqual(expect.arrayContaining(["e3", "e4"]));
    expect(legalTargets(board, "b1")).toEqual(expect.arrayContaining(["a3", "c3"]));
    expect(legalTargets(board, "a1")).toHaveLength(0);
  });

  it("does not trace intermediate squares for a knight jump", () => {
    expect(pathSquares("b8", "c6")).toEqual([]);
    expect(pathSquares("g1", "f3")).toEqual([]);
  });

  it("traces the spaces a flying knight passes over", () => {
    expect(flightPathSquares("b8", "c6")).toEqual(["b7", "c7"]);
    expect(flightPathSquares("g1", "f3")).toEqual(["g2", "f2"]);
  });

  it("supports line of sight at non-chess angles", () => {
    const board = createInitialBoard();
    Object.keys(board).forEach((square) => delete board[square]);
    expect(lineOfSightSquares("a1", "c4").length).toBeGreaterThan(0);
    expect(lineOfSight(board, "a1", "c4")).toBe(true);
    board.b2 = {
      id: "blocker",
      type: "pawn",
      color: "white",
      controller: "white",
      hasMoved: false,
      status: {},
    };
    expect(lineOfSight(board, "a1", "c4")).toBe(false);
  });

  it("does not allow a move that exposes the king", () => {
    const board = createInitialBoard();
    delete board.e2;
    delete board.e7;
    delete board.e8;
    board.e8 = { ...board.d8, id: "black-rook-test", type: "rook" };
    board.e2 = { ...board.a2, id: "white-blocker-test", type: "rook" };
    expect(legalTargets(board, "e2")).not.toContain("d2");
  });

  it("does not treat a Stone-Gazed piece as checking the king", () => {
    const frozenRook = testPiece("rook", "black", "frozen-attacker");
    frozenRook.status.frozen = 2;
    const board = {
      e1: testPiece("king", "white", "white-king"),
      a2: testPiece("rook", "white", "white-rook"),
      e8: frozenRook,
      h8: testPiece("king", "black", "black-king"),
    };

    expect(isInCheck(board, "white")).toBe(false);
    expect(legalTargets(board, "a2")).toContain("a3");
  });
});

describe("game flow", () => {
  it("assigns AI and online players to their randomized colors", () => {
    const aiGame = createGame(2, { mode: "ai", aiDifficulty: 8 });
    expect(aiGame.aiColor).toBe("white");
    expect(aiGame.players.white.name).toBe("Divine AI");
    expect(aiGame.players.black.name).toBe("Player 1");
    expect(aiGame.aiDifficulty).toBe(8);

    const onlineGame = createGame(2, {
      mode: "online",
      hostName: "Athena",
      guestName: "Hermes",
    });
    expect(onlineGame.onlineHostColor).toBe("black");
    expect(onlineGame.players.white.name).toBe("Hermes");
    expect(onlineGame.players.black.name).toBe("Athena");
  });

  it("uses the 1-2-2-1 snake draft and begins with white", () => {
    let state = createGame(1);
    const picks = ["ares", "medusa", "midas", "death", "artemis", "chiron"] as const;
    picks.forEach((godId) => {
      state = gameReducer(state, { type: "draft", godId });
    });
    expect(state.players.white.gods).toEqual(["ares", "death", "artemis"]);
    expect(state.players.black.gods).toEqual(["medusa", "midas", "chiron"]);
    expect(state.phase).toBe("play");
    expect(state.activeColor).toBe("white");
  });

  it("auto-drafts only one god for the current player", () => {
    const state = gameReducer(createGame(1), {
      type: "auto-draft",
      godId: "ares",
    });

    expect(state.phase).toBe("draft");
    expect(state.draft.pickIndex).toBe(1);
    expect(state.activeColor).toBe("black");
    expect(state.players.white.gods).toEqual(["ares"]);
    expect(state.players.black.gods).toEqual([]);
  });

  it("rests a god after its action and passes the turn", () => {
    let state = createGame(1);
    (["ares", "medusa", "midas", "death", "artemis", "chiron"] as const).forEach((godId) => {
      state = gameReducer(state, { type: "draft", godId });
    });
    state = gameReducer(state, { type: "select-god", godId: "ares" });
    state = gameReducer(state, { type: "select-ability", abilityId: "threaten" });
    state = gameReducer(state, { type: "square", square: "e2" });
    state = gameReducer(state, { type: "square", square: "e4" });
    expect(state.rested).toContain("ares");
    expect(state.activeColor).toBe("black");
    expect(state.board.e4?.type).toBe("pawn");
    expect(state.lastAction).toBe("White used Threaten with Ares: Pawn at e2 -> e4.");
    expect(state.history[0]).toBe(state.lastAction);
    expect(state.presentation).toMatchObject({
      kind: "move",
      color: "white",
      godId: "ares",
      abilityId: "threaten",
      from: "e2",
      to: "e4",
      piece: { type: "pawn" },
    });
  });

  it("resolves Escort simultaneously before checking the King's final safety", () => {
    let state = createGame(1);
    state.phase = "play";
    state.players.white.gods = ["leonidas"];
    state.players.white.orbs.black = 1;
    state.board = {
      a8: testPiece("king", "black", "black-king"),
      e4: testPiece("king", "white", "white-king"),
      f4: testPiece("rook", "white", "white-escort"),
      g4: testPiece("rook", "black", "black-attacker"),
    };

    state = gameReducer(state, { type: "select-god", godId: "leonidas" });
    state = gameReducer(state, { type: "select-ability", abilityId: "escort" });
    state = gameReducer(state, { type: "square", square: "e4" });
    state = gameReducer(state, { type: "square", square: "f4" });

    expect(state.legalTargets).toContain("f4");

    state = gameReducer(state, { type: "square", square: "f4" });

    expect(state.board.f4).toMatchObject({ id: "white-king", type: "king" });
    expect(state.board.g4).toMatchObject({ id: "white-escort", type: "rook" });
    expect(state.players.black.graveyard.at(-1)?.piece.id).toBe("black-attacker");
    expect(isInCheck(state.board, "white", state.bananas)).toBe(false);
    expect(state.activeColor).toBe("black");
  });

  it("rejects an Escort destination when the completed formation leaves the King in check", () => {
    let state = createGame(1);
    state.phase = "play";
    state.players.white.gods = ["leonidas"];
    state.players.white.orbs.black = 1;
    state.board = {
      a8: testPiece("king", "black", "black-king"),
      e4: testPiece("king", "white", "white-king"),
      f4: testPiece("rook", "white", "white-escort"),
      f8: testPiece("rook", "black", "black-attacker"),
    };

    state = gameReducer(state, { type: "select-god", godId: "leonidas" });
    state = gameReducer(state, { type: "select-ability", abilityId: "escort" });
    state = gameReducer(state, { type: "square", square: "e4" });
    state = gameReducer(state, { type: "square", square: "f4" });

    expect(state.legalTargets).not.toContain("f4");
  });

  it("previews and records an opponent upgrade with its god and ability names", () => {
    let state = createGame(1);
    (["ares", "medusa", "midas", "death", "artemis", "chiron"] as const).forEach((godId) => {
      state = gameReducer(state, { type: "draft", godId });
    });
    state.phase = "upgrade";
    state.activeColor = "white";
    state.upgradeQueue = ["white", "black"];

    state = gameReducer(state, {
      type: "preview-upgrade",
      godId: "ares",
      abilityId: "threaten",
    });
    expect(state.upgradePreview).toEqual({
      color: "white",
      godId: "ares",
      abilityId: "threaten",
    });
    expect(state.presentation).toMatchObject({
      kind: "upgrade-preview",
      color: "white",
      godId: "ares",
      abilityId: "threaten",
    });

    state = gameReducer(state, { type: "upgrade", abilityId: "threaten" });
    expect(state.lastAction).toBe("White upgraded Threaten with Ares to level 2.");
    expect(state.presentation).toMatchObject({
      kind: "upgrade",
      color: "white",
      godId: "ares",
      abilityId: "threaten",
    });
  });

  it("allows Construction moves at any normal distance and rewards only one-square moves", () => {
    const newAnubisGame = () => {
      let game = createGame(1);
      (["anubis", "medusa", "midas", "death", "artemis", "chiron"] as const).forEach((godId) => {
        game = gameReducer(game, { type: "draft", godId });
      });
      game = gameReducer(game, { type: "select-god", godId: "anubis" });
      return gameReducer(game, { type: "select-ability", abilityId: "construction" });
    };

    let longMove = newAnubisGame();
    longMove = gameReducer(longMove, { type: "square", square: "e2" });
    expect(longMove.legalTargets).toEqual(expect.arrayContaining(["e3", "e4"]));
    longMove = gameReducer(longMove, { type: "square", square: "e4" });
    expect(longMove.board.e4?.type).toBe("pawn");
    expect(longMove.players.white.orbs.black).toBe(0);

    let shortMove = newAnubisGame();
    shortMove = gameReducer(shortMove, { type: "square", square: "e2" });
    shortMove = gameReducer(shortMove, { type: "square", square: "e3" });
    expect(shortMove.board.e3?.type).toBe("pawn");
    expect(shortMove.players.white.orbs.black).toBe(1);
  });

  it("scales Sing rewards from orthogonal pairs to all neighbors plus pair bonuses", () => {
    const singAtLevel = (level: 1 | 2 | 3) => {
      let state = createGame(1);
      state.phase = "play";
      state.players.white.gods = ["teles"];
      state.players.white.upgrades.resonance = level;
      state.board = {
        a1: testPiece("king", "white", "white-king"),
        h8: testPiece("king", "black", "black-king"),
        c3: testPiece("knight", "white", "singer"),
        e5: testPiece("pawn", "white", "white-orthogonal-1"),
        e3: testPiece("bishop", "white", "white-orthogonal-2"),
        d4: testPiece("rook", "white", "white-orthogonal-3"),
        f4: testPiece("pawn", "black", "black-orthogonal"),
        d3: testPiece("pawn", "white", "white-diagonal"),
        f5: testPiece("bishop", "black", "black-diagonal"),
      };

      state = gameReducer(state, { type: "select-god", godId: "teles" });
      state = gameReducer(state, { type: "select-ability", abilityId: "resonance" });
      state = gameReducer(state, { type: "square", square: "c3" });
      return gameReducer(state, { type: "square", square: "e4" });
    };

    const levelOne = singAtLevel(1);
    expect(levelOne.players.white.orbs).toEqual({ white: 1, black: 0 });

    const levelTwo = singAtLevel(2);
    expect(levelTwo.players.white.orbs).toEqual({ white: 4, black: 2 });

    const levelThree = singAtLevel(3);
    expect(levelThree.players.white.orbs).toEqual({ white: 5, black: 2 });
  });

  it("applies Stone Gaze to every friendly and enemy piece in the Queen's line of sight", () => {
    const gazeAtLevel = (level: 1 | 2 | 3) => {
      let state = createGame(1);
      state.phase = "play";
      state.players.white.gods = ["medusa"];
      state.players.white.orbs.black = 3;
      state.players.white.upgrades["stone-gaze"] = level;
      state.board = {
        a1: testPiece("king", "white", "white-king"),
        h8: testPiece("king", "black", "black-king"),
        d4: testPiece("queen", "white", "white-queen"),
        d6: testPiece("rook", "white", "visible-friendly"),
        f4: testPiece("bishop", "black", "visible-enemy"),
        d8: testPiece("pawn", "black", "blocked-enemy"),
      };

      state = gameReducer(state, { type: "select-god", godId: "medusa" });
      state = gameReducer(state, { type: "select-ability", abilityId: "stone-gaze" });
      expect(state.board.d6.status.frozen).toBeUndefined();
      expect(state.board.f4.status.frozen).toBeUndefined();
      expect(state.legalTargets).toEqual(expect.arrayContaining(["d6", "f4"]));
      expect(state.legalTargets).not.toContain("d8");
      return gameReducer(state, { type: "confirm-ability" });
    };

    const levelOne = gazeAtLevel(1);
    expect(levelOne.board.d6.status.frozen).toBe(2);
    expect(levelOne.board.f4.status.frozen).toBe(2);
    expect(levelOne.board.d8.status.frozen).toBeUndefined();
    expect(levelOne.board.d4.status.gazing).toBe(true);
    expect(levelOne.activeColor).toBe("black");
    expect(levelOne.legalTargets).toEqual([]);

    const levelTwo = gazeAtLevel(2);
    expect(levelTwo.board.d6.status.frozen).toBe(3);
    expect(levelTwo.board.f4.status.frozen).toBe(3);

    const levelThree = gazeAtLevel(3);
    expect(levelThree.board.d6.status.frozen).toBe("god");
    expect(levelThree.board.f4.status.frozen).toBe("god");
  });

  it("refunds Stone Gaze when its preview is cancelled", () => {
    let state = createGame(1);
    state.phase = "play";
    state.players.white.gods = ["medusa"];
    state.players.white.orbs.black = 3;

    state = gameReducer(state, { type: "select-god", godId: "medusa" });
    state = gameReducer(state, { type: "select-ability", abilityId: "stone-gaze" });
    expect(state.pending?.step).toBe("confirm-stone-gaze");
    expect(state.players.white.orbs.black).toBe(0);

    state = gameReducer(state, { type: "cancel" });

    expect(state.selectedAbility).toBeUndefined();
    expect(state.players.white.orbs.black).toBe(3);
    expect(Object.values(state.board).some((piece) => piece.status.frozen)).toBe(false);
  });

  it("previews and confirms level-one March Home before teleporting the King", () => {
    let state = createGame(1);
    state.phase = "play";
    state.players.white.gods = ["leonidas"];
    state.players.white.orbs.white = 2;
    state.board = {
      d4: testPiece("king", "white", "white-king"),
      h8: testPiece("king", "black", "black-king"),
    };

    state = gameReducer(state, { type: "select-god", godId: "leonidas" });
    state = gameReducer(state, { type: "select-ability", abilityId: "march-home" });

    expect(state.pending?.step).toBe("confirm-march-home");
    expect(state.selectedSquare).toBe("d4");
    expect(state.legalTargets).toEqual(["e1"]);
    expect(state.board.d4?.id).toBe("white-king");

    state = gameReducer(state, { type: "confirm-ability" });

    expect(state.board.d4).toBeUndefined();
    expect(state.board.e1?.id).toBe("white-king");
    expect(state.activeColor).toBe("black");
  });

  it("records a captured piece flight to its owner's graveyard", () => {
    let state = createGame(1);
    (["ares", "chiron", "teles", "death", "artemis", "midas"] as const).forEach((godId) => {
      state = gameReducer(state, { type: "draft", godId });
    });

    state = gameReducer(state, { type: "select-god", godId: "ares" });
    state = gameReducer(state, { type: "select-ability", abilityId: "threaten" });
    state = gameReducer(state, { type: "square", square: "e2" });
    state = gameReducer(state, { type: "square", square: "e4" });

    state = gameReducer(state, { type: "select-god", godId: "chiron" });
    state = gameReducer(state, { type: "select-ability", abilityId: "gallop" });
    state = gameReducer(state, { type: "square", square: "d7" });
    state = gameReducer(state, { type: "square", square: "d5" });

    state = gameReducer(state, { type: "select-god", godId: "death" });
    state = gameReducer(state, { type: "select-ability", abilityId: "marked" });
    state = gameReducer(state, { type: "square", square: "e4" });
    state = gameReducer(state, { type: "square", square: "d5" });

    expect(state.players.black.graveyard).toHaveLength(1);
    expect(state.captureAnimations.at(-1)).toMatchObject({
      player: "black",
      source: "d5",
      total: 1,
      piece: { type: "pawn", color: "black" },
    });
  });

  it("executes marked pieces only after Death completes a turn", () => {
    let state = createGame(1);
    (["death", "ares", "midas", "chiron", "artemis", "teles"] as const).forEach((godId) => {
      state = gameReducer(state, { type: "draft", godId });
    });
    state.board.e7.status.markedForDeath = { owner: "white", round: state.round };

    state = gameReducer(state, { type: "select-god", godId: "death" });
    expect(state.board.e7?.status.markedForDeath).toBeDefined();
    expect(state.players.white.orbs.black).toBe(0);

    state = gameReducer(state, { type: "clear-god" });
    expect(state.board.e7?.status.markedForDeath).toBeDefined();

    state = gameReducer(state, { type: "select-god", godId: "death" });
    state = gameReducer(state, { type: "select-ability", abilityId: "marked" });
    state = gameReducer(state, { type: "pass" });

    expect(state.board.e7).toBeUndefined();
    expect(state.players.black.graveyard.at(-1)?.piece.id).toBe("black-pawn-4");
    expect(state.players.white.orbs.black).toBe(3);
  });

  it("chooses the Monument rook square after selecting every sacrificed pawn", () => {
    let state = createGame(1);
    (["anubis", "ares", "midas", "chiron", "artemis", "teles"] as const).forEach((godId) => {
      state = gameReducer(state, { type: "draft", godId });
    });
    state.players.white.orbs.black = 4;

    state = gameReducer(state, { type: "select-god", godId: "anubis" });
    state = gameReducer(state, { type: "select-ability", abilityId: "monument" });
    expect(state.pending?.step).toBe("monument-sacrifice");

    state = gameReducer(state, { type: "square", square: "a2" });
    state = gameReducer(state, { type: "square", square: "b2" });
    state = gameReducer(state, { type: "square", square: "c2" });

    expect(state.pending?.step).toBe("monument-base");
    expect(state.legalTargets).toEqual(["a2", "b2", "c2"]);
    expect(state.board.a2?.type).toBe("pawn");
    expect(state.board.b2?.type).toBe("pawn");
    expect(state.board.c2?.type).toBe("pawn");

    state = gameReducer(state, { type: "square", square: "c2" });

    expect(state.board.a2).toBeUndefined();
    expect(state.board.b2).toBeUndefined();
    expect(state.board.c2).toMatchObject({ type: "rook", controller: "white" });
    expect(state.players.white.graveyard.slice(-3).map((entry) => entry.piece.type)).toEqual([
      "pawn",
      "pawn",
      "pawn",
    ]);
  });

  it("does not allow Lure without a controlled Queen", () => {
    let state = createGame(1);
    (["teles", "chiron", "midas", "death", "artemis", "medusa"] as const).forEach((godId) => {
      state = gameReducer(state, { type: "draft", godId });
    });
    delete state.board.d1;
    state.players.white.orbs.white = 2;

    state = gameReducer(state, { type: "select-god", godId: "teles" });
    state = gameReducer(state, { type: "select-ability", abilityId: "lure" });

    expect(state.selectedAbility).toBeUndefined();
    expect(state.players.white.orbs.white).toBe(2);
    expect(state.notice).toBe("Lure requires you to control a Queen.");
  });

  it("allows Banana Peel to block a line attack on the King", () => {
    let state = createGame(1);
    (["kangus", "chiron", "teles", "death", "artemis", "midas"] as const).forEach((godId) => {
      state = gameReducer(state, { type: "draft", godId });
    });
    const whiteKing = state.board.e1;
    const whiteBishop = state.board.c1;
    const blackKing = state.board.e8;
    const blackRook = state.board.a8;
    state.board = {
      e1: whiteKing,
      c1: whiteBishop,
      a8: blackKing,
      e8: blackRook,
    };
    state.players.white.orbs.white = 1;
    expect(isInCheck(state.board, "white", state.bananas)).toBe(true);

    state = gameReducer(state, { type: "select-god", godId: "kangus" });
    state = gameReducer(state, { type: "select-ability", abilityId: "banana-peel" });
    state = gameReducer(state, { type: "square", square: "c1" });
    expect(state.legalTargets).toContain("d2");

    state = gameReducer(state, { type: "square", square: "d2" });
    expect(state.legalTargets).toEqual(["e2"]);
    state = gameReducer(state, { type: "square", square: "e2" });

    expect(state.bananas).toEqual(expect.arrayContaining([
      expect.objectContaining({ square: "e2", owner: "white" }),
    ]));
    expect(isInCheck(state.board, "white", state.bananas)).toBe(false);
  });

  it("offers and resolves a prepared Snipe shot at the start of the next turn", () => {
    let state = createPreparedShotTurn();
    expect(state.pending).toMatchObject({ abilityId: "snipe-shot", step: "snipe-source" });
    expect(state.legalTargets).toContain("e4");

    state = gameReducer(state, { type: "square", square: "e4" });
    expect(state.pending?.step).toBe("snipe-target");
    expect(state.legalTargets).toContain("d5");

    state = gameReducer(state, { type: "square", square: "d5" });
    expect(state.board.d5).toBeUndefined();
    expect(state.board.e4?.status.prepared).toBeUndefined();
    expect(state.players.black.graveyard.at(-1)?.piece.type).toBe("pawn");
  });

  it("applies the prepared-shot expiration rules for each Snipe level", () => {
    let levelOne = createPreparedShotTurn(1);
    levelOne = gameReducer(levelOne, { type: "pass" });
    expect(levelOne.board.e4?.status.prepared).toBeUndefined();

    let levelTwo = createPreparedShotTurn(2);
    levelTwo = gameReducer(levelTwo, { type: "pass" });
    expect(levelTwo.board.e4?.status.prepared).toMatchObject({ level: 2 });
    levelTwo.rested = levelTwo.rested.filter((godId) => godId !== "artemis");
    levelTwo = gameReducer(levelTwo, { type: "select-god", godId: "artemis" });
    expect(levelTwo.board.e4?.status.prepared).toBeUndefined();

    let levelThree = createPreparedShotTurn(3);
    levelThree = gameReducer(levelThree, { type: "pass" });
    levelThree.rested = levelThree.rested.filter((godId) => godId !== "artemis");
    levelThree = gameReducer(levelThree, { type: "select-god", godId: "artemis" });
    expect(levelThree.board.e4?.status.prepared).toMatchObject({ level: 3 });
  });

  it("refunds an unused paid ability when cancelled", () => {
    let state = createGame(1);
    (["ares", "medusa", "midas", "death", "artemis", "chiron"] as const).forEach((godId) => {
      state = gameReducer(state, { type: "draft", godId });
    });
    state.players.white.orbs.white = 2;
    state = gameReducer(state, { type: "select-god", godId: "artemis" });
    state = gameReducer(state, { type: "select-ability", abilityId: "stealth" });
    expect(state.players.white.orbs.white).toBe(0);
    state = gameReducer(state, { type: "cancel" });
    expect(state.players.white.orbs.white).toBe(2);
  });

  it("refunds an unused paid ability when switching gods", () => {
    let state = createGame(1);
    (["artemis", "medusa", "midas", "death", "ares", "chiron"] as const).forEach((godId) => {
      state = gameReducer(state, { type: "draft", godId });
    });
    state.players.white.orbs.white = 2;
    state = gameReducer(state, { type: "select-god", godId: "artemis" });
    state = gameReducer(state, { type: "select-ability", abilityId: "stealth" });
    expect(state.players.white.orbs.white).toBe(0);

    state = gameReducer(state, { type: "select-god", godId: "ares" });

    expect(state.players.white.orbs.white).toBe(2);
    expect(state.selectedGod).toBe("ares");
    expect(state.selectedAbility).toBeUndefined();
  });

  it("allows inspecting a god and returning to god selection", () => {
    let state = createGame(1);
    (["ares", "medusa", "midas", "death", "artemis", "chiron"] as const).forEach((godId) => {
      state = gameReducer(state, { type: "draft", godId });
    });
    state = gameReducer(state, { type: "select-god", godId: "ares" });
    expect(state.selectedGod).toBe("ares");
    state = gameReducer(state, { type: "clear-god" });
    expect(state.selectedGod).toBeUndefined();
    expect(state.rested).not.toContain("ares");
    expect(state.activeColor).toBe("white");
  });

  it("completes a normal black pawn move", () => {
    let state = createGame(1);
    (["ares", "medusa", "midas", "death", "artemis", "chiron"] as const).forEach((godId) => {
      state = gameReducer(state, { type: "draft", godId });
    });
    state = gameReducer(state, { type: "select-god", godId: "ares" });
    state = gameReducer(state, { type: "select-ability", abilityId: "threaten" });
    state = gameReducer(state, { type: "square", square: "e2" });
    state = gameReducer(state, { type: "square", square: "e4" });
    state = gameReducer(state, { type: "select-god", godId: "medusa" });
    state = gameReducer(state, { type: "select-ability", abilityId: "captivate" });
    state = gameReducer(state, { type: "square", square: "e7" });
    state = gameReducer(state, { type: "square", square: "e5" });
    expect(state.board.e5?.color).toBe("black");
    expect(state.activeColor).toBe("white");
    expect(state.rested).toEqual(expect.arrayContaining(["ares", "medusa"]));
  });

  it("counts a non-capturing knight as flying for Quetzacoatl", () => {
    let state = createGame(1);
    (["ares", "quetzacoatl", "midas", "death", "artemis", "medusa"] as const).forEach((godId) => {
      state = gameReducer(state, { type: "draft", godId });
    });
    state = gameReducer(state, { type: "select-god", godId: "ares" });
    state = gameReducer(state, { type: "select-ability", abilityId: "threaten" });
    state = gameReducer(state, { type: "square", square: "e2" });
    state = gameReducer(state, { type: "square", square: "e4" });
    state = gameReducer(state, { type: "select-god", godId: "quetzacoatl" });
    state = gameReducer(state, { type: "select-ability", abilityId: "flight" });
    state = gameReducer(state, { type: "square", square: "b8" });
    state = gameReducer(state, { type: "square", square: "c6" });
    expect(state.players.black.orbs.black).toBe(1);
    expect(state.orbAnimations).toEqual(expect.arrayContaining([
      expect.objectContaining({ player: "black", orb: "black", amount: 1, total: 1, source: "c6" }),
    ]));
    expect(state.board.c6?.type).toBe("knight");
  });

  it("caps Flight level 1 at one orb of each crossed piece color", () => {
    let state = createGame(1);
    (["ares", "quetzacoatl", "midas", "death", "artemis", "medusa"] as const).forEach((godId) => {
      state = gameReducer(state, { type: "draft", godId });
    });
    state = gameReducer(state, { type: "select-god", godId: "ares" });
    state = gameReducer(state, { type: "select-ability", abilityId: "threaten" });
    state = gameReducer(state, { type: "square", square: "e2" });
    state = gameReducer(state, { type: "square", square: "e4" });
    state = gameReducer(state, { type: "select-god", godId: "quetzacoatl" });
    state = gameReducer(state, { type: "select-ability", abilityId: "flight" });
    state = gameReducer(state, { type: "square", square: "b8" });
    state = gameReducer(state, { type: "square", square: "c6" });
    expect(state.players.black.orbs).toEqual({ white: 0, black: 1 });
  });

  it("grants Flight level 3's full benefit to a knight moving two files and one rank", () => {
    let state = createGame(1);
    (["quetzacoatl", "chiron", "midas", "death", "artemis", "medusa"] as const).forEach((godId) => {
      state = gameReducer(state, { type: "draft", godId });
    });
    state.players.white.upgrades.flight = 3;
    delete state.board.d2;
    state = gameReducer(state, { type: "select-god", godId: "quetzacoatl" });
    state = gameReducer(state, { type: "select-ability", abilityId: "flight" });
    state = gameReducer(state, { type: "square", square: "b1" });
    state = gameReducer(state, { type: "square", square: "d2" });
    expect(state.players.white.orbs.white).toBe(3);
  });

  it("documents Flight's capped level 1 reward explicitly", () => {
    expect(GOD_BY_ID.quetzacoatl.abilities[0].summary).toContain(
      "Gain 1 white orb if you fly over any number of white pieces",
    );
    expect(GOD_BY_ID.quetzacoatl.abilities[0].summary).toContain(
      "1 black orb if you fly over any number of black pieces",
    );
  });

  it("flies a carrier over blockers and drops a friendly pawn to capture", () => {
    let state = createGame(1);
    (["quetzacoatl", "chiron", "teles", "death", "artemis", "midas"] as const).forEach((godId) => {
      state = gameReducer(state, { type: "draft", godId });
    });
    state.board = {
      a1: testPiece("king", "white", "white-king"),
      h8: testPiece("king", "black", "black-king"),
      a2: testPiece("rook", "white", "carrier"),
      b2: testPiece("pawn", "white", "passenger"),
      a3: testPiece("knight", "white", "blocker"),
      a4: testPiece("bishop", "black", "target"),
    };
    state.players.white.orbs.black = 3;

    state = gameReducer(state, { type: "select-god", godId: "quetzacoatl" });
    state = gameReducer(state, { type: "select-ability", abilityId: "air-strike" });
    state = gameReducer(state, { type: "square", square: "a2" });
    expect(state.legalTargets).toEqual(["b2"]);
    state = gameReducer(state, { type: "square", square: "b2" });
    expect(state.legalTargets).toContain("a5");
    expect(state.legalTargets).not.toContain("a4");
    state = gameReducer(state, { type: "square", square: "a5" });
    expect(state.legalTargets).toEqual(["a4"]);
    state = gameReducer(state, { type: "square", square: "a4" });

    expect(state.board.a5?.id).toBe("carrier");
    expect(state.board.a4?.id).toBe("passenger");
    expect(state.board.b2).toBeUndefined();
    expect(state.players.black.graveyard.at(-1)?.piece.id).toBe("target");
    expect(state.players.white.orbs.black).toBe(0);
    expect(state.activeColor).toBe("black");
  });

  it("expands Air Strike passenger types at levels 2 and 3", () => {
    const setup = (level: 1 | 2 | 3, passengerType: PieceType) => {
      let state = createGame(1);
      (["quetzacoatl", "chiron", "teles", "death", "artemis", "midas"] as const).forEach((godId) => {
        state = gameReducer(state, { type: "draft", godId });
      });
      state.board = {
        a1: testPiece("king", "white", "white-king"),
        h8: testPiece("king", "black", "black-king"),
        d4: testPiece("rook", "white", "carrier"),
        e4: testPiece(passengerType, "white", "passenger"),
      };
      state.players.white.upgrades["air-strike"] = level;
      state.players.white.orbs.black = 3;
      state = gameReducer(state, { type: "select-god", godId: "quetzacoatl" });
      state = gameReducer(state, { type: "select-ability", abilityId: "air-strike" });
      return gameReducer(state, { type: "square", square: "d4" });
    };

    expect(setup(1, "knight").pending?.step).toBe("source");
    expect(setup(2, "knight").legalTargets).toContain("e4");
    expect(setup(2, "queen").pending?.step).toBe("source");
    expect(setup(3, "queen").legalTargets).toContain("e4");
  });

  it("rejects Air Strike routes whose carried piece would expose its King", () => {
    let state = createGame(1);
    (["quetzacoatl", "chiron", "teles", "death", "artemis", "midas"] as const).forEach((godId) => {
      state = gameReducer(state, { type: "draft", godId });
    });
    state.board = {
      e1: testPiece("king", "white", "white-king"),
      h8: testPiece("king", "black", "black-king"),
      d1: testPiece("rook", "white", "carrier"),
      e2: testPiece("pawn", "white", "passenger"),
      e8: testPiece("rook", "black", "attacker"),
    };
    state.players.white.orbs.black = 3;
    state = gameReducer(state, { type: "select-god", godId: "quetzacoatl" });
    state = gameReducer(state, { type: "select-ability", abilityId: "air-strike" });
    state = gameReducer(state, { type: "square", square: "d1" });

    expect(state.pending?.step).toBe("source");
    expect(state.legalTargets).toEqual([]);
  });

  it("grants the caster another turn after Enchant", () => {
    let state = createGame(1);
    (["teles", "chiron", "midas", "death", "artemis", "medusa"] as const).forEach((godId) => {
      state = gameReducer(state, { type: "draft", godId });
    });
    state.players.white.orbs.black = 4;
    state = gameReducer(state, { type: "select-god", godId: "teles" });
    state = gameReducer(state, { type: "select-ability", abilityId: "enchant" });
    state = gameReducer(state, { type: "square", square: "b8" });
    state = gameReducer(state, { type: "square", square: "c6" });
    expect(state.activeColor).toBe("white");
    expect(state.board.c6?.color).toBe("black");
    expect(state.rested).toContain("teles");
  });

  it("does not leave a persistent Charge buff at level 1", () => {
    let state = createGame(1);
    (["chiron", "teles", "midas", "death", "artemis", "medusa"] as const).forEach((godId) => {
      state = gameReducer(state, { type: "draft", godId });
    });
    delete state.board.b2;
    state.players.white.orbs.black = 4;
    state = gameReducer(state, { type: "select-god", godId: "chiron" });
    state = gameReducer(state, { type: "select-ability", abilityId: "charge" });
    state = gameReducer(state, { type: "square", square: "b1" });
    state = gameReducer(state, { type: "square", square: "b3" });
    expect(state.board.b3?.type).toBe("knight");
    expect(Object.values(state.board).some((piece) => piece.status.chargeUntil)).toBe(false);
  });

  it("completes a black knight move without path traversal", () => {
    let state = createGame(1);
    (["ares", "chiron", "midas", "death", "artemis", "medusa"] as const).forEach((godId) => {
      state = gameReducer(state, { type: "draft", godId });
    });
    state = gameReducer(state, { type: "select-god", godId: "ares" });
    state = gameReducer(state, { type: "select-ability", abilityId: "threaten" });
    state = gameReducer(state, { type: "square", square: "e2" });
    state = gameReducer(state, { type: "square", square: "e4" });
    state = gameReducer(state, { type: "select-god", godId: "chiron" });
    state = gameReducer(state, { type: "select-ability", abilityId: "gallop" });
    state = gameReducer(state, { type: "square", square: "b8" });
    state = gameReducer(state, { type: "square", square: "c6" });
    expect(state.board.c6?.type).toBe("knight");
    expect(state.board.b8).toBeUndefined();
    expect(state.activeColor).toBe("white");
  });
});
