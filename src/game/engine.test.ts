import { describe, expect, it } from "vitest";
import {
  applyMove,
  createInitialBoard,
  flightPathSquares,
  isInCheck,
  legalTargets,
  lineOfSight,
  lineOfSightSquares,
  ordinaryAttackedPieceSquares,
  pathSquares,
} from "./chess";
import {
  availableClassicActions,
  createGame,
  gameReducer,
  hasCommittedClassicAction,
  hasCompleteClassicTurn,
} from "./engine";
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

const quetzSlitherState = (
  level: 1 | 2 | 3,
  board: Record<string, Piece>,
) => {
  const state = createGame(1);
  state.phase = "play";
  state.activeColor = "white";
  state.players.white.gods = ["quetzacoatl"];
  state.players.black.gods = ["medusa"];
  state.players.white.upgrades.flight = level;
  state.board = board;
  state.notice = "White to act.";
  return state;
};

const useClassicSlither = (
  state: ReturnType<typeof quetzSlitherState>,
  from: string,
  to: string,
) => {
  let next = gameReducer(state, { type: "select-god", godId: "quetzacoatl" });
  next = gameReducer(next, { type: "select-ability", abilityId: "flight" });
  next = gameReducer(next, { type: "square", square: from });
  return gameReducer(next, { type: "square", square: to });
};

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

  it("keeps ordinary attacks independent of Charge and blocked by pieces", () => {
    const board = {
      a1: testPiece("king", "white", "white-king"),
      h8: testPiece("king", "black", "black-king"),
      d4: {
        ...testPiece("knight", "white", "charged-knight"),
        status: { chargeUntil: "god" as const },
      },
      f5: testPiece("pawn", "black", "ordinary-target"),
      d6: testPiece("rook", "black", "charge-only-target"),
      a4: testPiece("rook", "white", "slider"),
      a5: testPiece("pawn", "white", "blocker"),
      a6: testPiece("queen", "black", "blocked-target"),
    };

    expect(ordinaryAttackedPieceSquares(board, "d4")).toContain("f5");
    expect(ordinaryAttackedPieceSquares(board, "d4")).not.toContain("d6");
    expect(ordinaryAttackedPieceSquares(board, "a4")).not.toContain("a6");
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

  it("does not offer or apply an ordinary King capture", () => {
    const board = {
      e7: testPiece("rook", "white", "white-rook"),
      e8: testPiece("king", "black", "black-king"),
      a1: testPiece("king", "white", "white-king"),
    };

    expect(legalTargets(board, "e7")).not.toContain("e8");
    expect(() => applyMove(board, { from: "e7", to: "e8" }))
      .toThrow(/cannot capture a King/);
  });

  it("lets Marked move a King while keeping King-death rules intact", () => {
    let state = createGame(1);
    (["death", "chiron", "teles", "midas", "ares", "artemis"] as const)
      .forEach((godId) => {
        state = gameReducer(state, { type: "draft", godId });
      });
    state.players.white.orbs.black = 10;
    state.players.white.upgrades.marked = 3;
    state.board = {
      d4: testPiece("king", "white", "white-king"),
      h8: testPiece("king", "black", "black-king"),
    };

    state = gameReducer(state, { type: "select-god", godId: "death" });
    state = gameReducer(state, {
      type: "select-ability",
      abilityId: "marked",
    });

    state = gameReducer(state, { type: "square", square: "d4" });
    expect(state.legalTargets).toContain("d5");
  });
});

describe("game flow", () => {
  it("assigns AI and online players to their randomized colors", () => {
    const aiGame = createGame(2, { mode: "ai", aiDifficulty: 8, playerName: "Athena" });
    expect(aiGame.aiColor).toBe("white");
    expect(aiGame.players.white.name).toBe("Divine AI");
    expect(aiGame.players.black.name).toBe("Athena");
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

  it("adjudicates checkmate at turn start without a King-capture move", () => {
    const state = createGame(1);
    state.phase = "play";
    state.activeColor = "white";
    state.board = {
      e1: {
        ...testPiece("king", "white", "white-king"),
        status: { hexedBy: "black" },
      },
      e8: testPiece("rook", "black", "black-rook"),
      a8: testPiece("king", "black", "black-king"),
    };

    const result = gameReducer(state, { type: "load-game", state });

    expect(result.phase).toBe("gameover");
    expect(result.winner).toBe("black");
    expect(result.result).toEqual({
      kind: "winner",
      winner: "black",
      reason: "checkmate",
    });
    expect(result.board.e1).toBeUndefined();
    expect(result.players.white.graveyard.at(-1)?.piece).toMatchObject({
      id: "white-king",
      status: { hexedBy: "black" },
    });
    expect(result.history[0]).toBe("White was checkmated by Black.");
  });

  it("adjudicates a safe no-turn position as a stalemate draw", () => {
    const state = createGame(1);
    state.phase = "play";
    state.activeColor = "white";
    state.board = {
      e1: testPiece("king", "white", "white-king"),
      e8: testPiece("king", "black", "black-king"),
    };

    const result = gameReducer(state, { type: "load-game", state });

    expect(result.phase).toBe("gameover");
    expect(result.winner).toBeUndefined();
    expect(result.result).toEqual({
      kind: "draw",
      reason: "stalemate",
    });
    expect(result.board.e1?.type).toBe("king");
    expect(result.history[0]).toBe(
      "White was stalemated. The match is a draw.",
    );
  });

  it("does not falsely mate a checked King with a complete divine escape", () => {
    const state = createGame(1);
    state.phase = "play";
    state.activeColor = "white";
    state.players.white.gods = ["quetzacoatl"];
    state.players.white.orbs.white = 3;
    state.board = {
      e1: testPiece("king", "white", "white-king"),
      e8: testPiece("rook", "black", "black-rook"),
      a8: testPiece("king", "black", "black-king"),
    };

    const result = gameReducer(state, { type: "load-game", state });

    expect(result.phase).toBe("play");
    expect(result.result).toBeUndefined();
    expect(result.board.e1?.type).toBe("king");
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

  it("allows Position Thirteen's King to Escort onto the carried rook's occupied square", () => {
    let state = createGame(1);
    state.phase = "play";
    state.gameMode = "puzzle";
    state.players.white.gods = ["leonidas"];
    state.players.white.orbs.black = 1;
    state.board = {
      g7: testPiece("king", "black", "black-king"),
      e5: testPiece("king", "white", "white-king"),
      f6: testPiece("rook", "white", "white-escort"),
    };

    expect(legalTargets(state.board, "e5")).not.toContain("f6");

    state = gameReducer(state, { type: "select-god", godId: "leonidas" });
    state = gameReducer(state, { type: "select-ability", abilityId: "escort" });
    state = gameReducer(state, { type: "square", square: "e5" });
    state = gameReducer(state, { type: "square", square: "f6" });

    expect(state.pending?.step).toBe("escort-move");
    expect(state.legalTargets).toContain("f6");

    state = gameReducer(state, { type: "square", square: "f6" });

    expect(state.board.f6).toMatchObject({ id: "white-king", type: "king" });
    expect(state.board.g7).toMatchObject({ id: "white-escort", type: "rook" });
    expect(state.players.black.graveyard.at(-1)?.piece.id).toBe("black-king");
    expect(state.phase).toBe("gameover");
    expect(state.winner).toBe("white");
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

  it("does not treat a two-file King teleport as castling", () => {
    let state = createGame(1);
    state.phase = "play";
    state.players.white.gods = ["quetzacoatl"];
    state.players.white.orbs.white = 3;
    state.board = {
      b1: testPiece("king", "white", "white-king"),
      a1: testPiece("rook", "white", "white-rook"),
      h8: testPiece("king", "black", "black-king"),
    };

    state = gameReducer(state, { type: "select-god", godId: "quetzacoatl" });
    state = gameReducer(state, { type: "select-ability", abilityId: "air-lift" });
    state = gameReducer(state, { type: "square", square: "b1" });
    state = gameReducer(state, { type: "square", square: "d3" });

    expect(state.board.d3?.id).toBe("white-king");
    expect(state.board.a1?.id).toBe("white-rook");
    expect(state.board.c1).toBeUndefined();
  });

  it("rejects Escort formations that would capture a non-moving friendly piece", () => {
    let state = createGame(1);
    state.phase = "play";
    state.players.white.gods = ["leonidas"];
    state.players.white.orbs.black = 1;
    state.board = {
      a8: testPiece("king", "black", "black-king"),
      e4: testPiece("king", "white", "white-king"),
      f4: testPiece("rook", "white", "white-escort"),
      g4: testPiece("bishop", "white", "white-blocker"),
    };

    state = gameReducer(state, { type: "select-god", godId: "leonidas" });
    state = gameReducer(state, { type: "select-ability", abilityId: "escort" });
    state = gameReducer(state, { type: "square", square: "e4" });
    state = gameReducer(state, { type: "square", square: "f4" });

    expect(state.legalTargets).not.toContain("f4");
  });

  it("moves every selected Escort piece from its simultaneously vacated source", () => {
    let state = createGame(1);
    state.phase = "play";
    state.players.white.gods = ["leonidas"];
    state.players.white.orbs.black = 1;
    state.players.white.upgrades.escort = 2;
    state.board = {
      a8: testPiece("king", "black", "black-king"),
      e4: testPiece("king", "white", "white-king"),
      f4: testPiece("rook", "white", "white-rook"),
      e5: testPiece("bishop", "white", "white-bishop"),
    };

    state = gameReducer(state, { type: "select-god", godId: "leonidas" });
    state = gameReducer(state, { type: "select-ability", abilityId: "escort" });
    state = gameReducer(state, { type: "square", square: "e4" });
    state = gameReducer(state, { type: "square", square: "f4" });
    state = gameReducer(state, { type: "square", square: "e5" });
    state = gameReducer(state, { type: "pass" });

    expect(state.legalTargets).toContain("f4");
    state = gameReducer(state, { type: "square", square: "f4" });

    expect(state.board.f4?.id).toBe("white-king");
    expect(state.board.g4?.id).toBe("white-rook");
    expect(state.board.f5?.id).toBe("white-bishop");
    expect(new Set(Object.values(state.board).map((piece) => piece.id)).size)
      .toBe(Object.keys(state.board).length);
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

  it("skips players with no legal upgrades and normalizes resumed upgrade queues", () => {
    let state = createGame(1);
    (["ares", "medusa", "midas", "death", "artemis", "chiron"] as const).forEach((godId) => {
      state = gameReducer(state, { type: "draft", godId });
    });
    state.phase = "upgrade";
    state.activeColor = "white";
    state.upgradeQueue = ["white", "black"];
    for (const godId of state.players.black.gods) {
      for (const ability of GOD_BY_ID[godId].abilities) {
        state.players.black.upgrades[ability.id] = 3;
      }
    }

    state = gameReducer(state, { type: "upgrade", abilityId: "threaten" });
    expect(state.phase).toBe("play");
    expect(state.round).toBe(2);
    expect(state.upgradeQueue).toEqual([]);

    const resumed = structuredClone(state);
    resumed.phase = "upgrade";
    resumed.activeColor = "white";
    resumed.upgradeQueue = ["white", "black"];
    for (const godId of resumed.players.white.gods) {
      for (const ability of GOD_BY_ID[godId].abilities) {
        resumed.players.white.upgrades[ability.id] = 3;
      }
    }
    const blackAbilityId = GOD_BY_ID[resumed.players.black.gods[0]].abilities[0].id;
    delete resumed.players.black.upgrades[blackAbilityId];

    const normalized = gameReducer(resumed, {
      type: "load-game",
      state: resumed,
    });
    expect(normalized.phase).toBe("upgrade");
    expect(normalized.activeColor).toBe("black");
    expect(normalized.upgradeQueue).toEqual(["black"]);
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

  it("does not offer or consume a prepared shot against a King", () => {
    let state = createPreparedShotTurn();
    const blackKing = state.board.e8;
    delete state.board.e8;
    state.board.d5 = blackKing;

    state = gameReducer(state, { type: "square", square: "e4" });
    expect(state.pending?.step).toBe("snipe-target");
    expect(state.legalTargets).not.toContain("d5");

    const manualAttempt = structuredClone(state);
    manualAttempt.legalTargets.push("d5");
    state = gameReducer(manualAttempt, { type: "square", square: "d5" });

    expect(state.board.d5).toMatchObject({ type: "king", color: "black" });
    expect(state.board.e4?.status.prepared).toBeTruthy();
    expect(state.pending?.step).toBe("snipe-target");
    expect(state.selectedSquare).toBe("e4");
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

  it("keeps Quetzacoatl's flight ID while displaying Slither and renames Medusa's ability", () => {
    expect(GOD_BY_ID.quetzacoatl.abilities[0]).toMatchObject({
      id: "flight",
      name: "Slither",
    });
    expect(GOD_BY_ID.medusa.abilities.find((ability) => ability.id === "slither")?.name)
      .toBe("Serpentine Step");
  });

  it("does not reward an isolated moved piece and uses ordinary blockers and captures", () => {
    let state = quetzSlitherState(1, {
      a1: testPiece("king", "white", "white-king"),
      h8: testPiece("king", "black", "black-king"),
      a2: testPiece("rook", "white", "mover"),
      a3: testPiece("pawn", "black", "blocker"),
    });
    state = gameReducer(state, { type: "select-god", godId: "quetzacoatl" });
    state = gameReducer(state, { type: "select-ability", abilityId: "flight" });
    state = gameReducer(state, { type: "square", square: "a2" });
    expect(state.legalTargets).toContain("a3");
    expect(state.legalTargets).not.toContain("a4");
    state = gameReducer(state, { type: "square", square: "a3" });
    expect(state.board.a3?.id).toBe("mover");
    expect(state.players.black.graveyard.at(-1)?.piece.id).toBe("blocker");
    expect(state.players.white.orbs).toEqual({ white: 0, black: 0 });
  });

  it("rewards a one-member snake established by a nonqualifying diagonal neighbor", () => {
    const state = useClassicSlither(quetzSlitherState(2, {
      a1: testPiece("king", "white", "white-king"),
      h8: testPiece("king", "black", "black-king"),
      c2: testPiece("rook", "white", "mover"),
      d4: testPiece("bishop", "black", "diagonal-neighbor"),
      e4: testPiece("pawn", "black", "orthogonal-blocker"),
    }), "c2", "c3");
    expect(state.players.white.orbs).toEqual({ white: 1, black: 0 });
    expect(state.pending).toBeUndefined();
    expect(state.activeColor).toBe("black");
  });

  it("caps level 1 at one orb per affinity for a mixed diagonal chain", () => {
    const state = useClassicSlither(quetzSlitherState(1, {
      a1: testPiece("king", "white", "white-king"),
      h8: testPiece("king", "black", "black-king"),
      c2: testPiece("rook", "white", "mover"),
      d4: testPiece("bishop", "white", "white-link"),
      e5: testPiece("bishop", "black", "black-link"),
    }), "c2", "c3");
    expect(state.players.white.orbs).toEqual({ white: 1, black: 1 });
    expect(state.activeColor).toBe("black");
  });

  it("excludes an orthogonally touched piece without invalidating qualifying members", () => {
    const state = useClassicSlither(quetzSlitherState(1, {
      a1: testPiece("king", "white", "white-king"),
      h8: testPiece("king", "black", "black-king"),
      c2: testPiece("rook", "white", "mover"),
      d4: testPiece("bishop", "white", "white-link"),
      e4: testPiece("pawn", "black", "orthogonal-to-link"),
      f2: testPiece("pawn", "white", "unrelated-snake-a"),
      g3: testPiece("pawn", "black", "unrelated-snake-b"),
    }), "c2", "c3");
    expect(state.players.white.orbs).toEqual({ white: 1, black: 0 });
  });

  it("commits level 2 to an extra orb choice before ending the turn", () => {
    const moved = useClassicSlither(quetzSlitherState(2, {
      a1: testPiece("king", "white", "white-king"),
      h8: testPiece("king", "black", "black-king"),
      c2: testPiece("rook", "white", "mover"),
      d4: testPiece("bishop", "black", "dark-link"),
    }), "c2", "c3");
    expect(moved.players.white.orbs).toEqual({ white: 1, black: 1 });
    expect(moved.pending?.step).toBe("slither-orb");
    expect(moved.notice).toMatch(/^Slither:/);
    expect(moved.notice).not.toMatch(/Serpentine Step/);
    expect(availableClassicActions(moved)).toEqual([
      { type: "orb", orb: "white" },
      { type: "orb", orb: "black" },
    ]);
    expect(gameReducer(moved, { type: "cancel" })).toBe(moved);
    expect(gameReducer(moved, { type: "pass" })).toBe(moved);
    expect(gameReducer(moved, { type: "clear-god" })).toBe(moved);
    expect(gameReducer(moved, { type: "select-god", godId: "quetzacoatl" })).toBe(moved);
    expect(gameReducer(moved, { type: "select-ability", abilityId: "air-lift" })).toBe(moved);

    const resolved = gameReducer(moved, { type: "orb", orb: "black" });
    expect(resolved.players.white.orbs).toEqual({ white: 1, black: 2 });
    expect(resolved.activeColor).toBe("black");
  });

  it("grants level 3 per-piece affinity rewards plus the level 2 choice", () => {
    let state = useClassicSlither(quetzSlitherState(3, {
      a1: testPiece("king", "white", "white-king"),
      h8: testPiece("king", "black", "black-king"),
      c2: testPiece("rook", "white", "mover"),
      d4: testPiece("bishop", "white", "white-link"),
      e5: testPiece("bishop", "black", "black-link"),
      f6: testPiece("pawn", "black", "black-tail"),
      f5: testPiece("pawn", "black", "orthogonal-blocker"),
    }), "c2", "c3");
    expect(state.players.white.orbs).toEqual({ white: 2, black: 0 });
    state = gameReducer(state, { type: "orb", orb: "white" });
    expect(state.players.white.orbs).toEqual({ white: 3, black: 0 });
  });

  it("keeps every classic post-move pending step committed", () => {
    const committedSteps = [
      "banana",
      "barter-choice",
      "cull-choice",
      "enchant-followup-move",
      "funding",
      "hire",
      "marked-choice",
      "mount-place",
      "mount-rider",
      "rage-choice",
      "resurrect-more",
      "siphon-choice",
      "slither",
      "slither-orb",
    ];
    for (const step of committedSteps) {
      const state = quetzSlitherState(1, {
        a1: testPiece("king", "white", "white-king"),
        h8: testPiece("king", "black", "black-king"),
      });
      state.selectedGod = "quetzacoatl";
      state.selectedAbility = "flight";
      state.pending = {
        godId: "quetzacoatl",
        abilityId: "flight",
        step,
      };
      expect(hasCommittedClassicAction(state), step).toBe(true);
      expect(availableClassicActions(state), step).not.toContainEqual({ type: "cancel" });
    }

    const preCommit = quetzSlitherState(1, {
      a1: testPiece("king", "white", "white-king"),
      h8: testPiece("king", "black", "black-king"),
    });
    preCommit.selectedGod = "quetzacoatl";
    preCommit.selectedAbility = "flight";
    preCommit.pending = {
      godId: "quetzacoatl",
      abilityId: "flight",
      step: "source",
    };
    expect(hasCommittedClassicAction(preCommit)).toBe(false);
    expect(availableClassicActions(preCommit)).toContainEqual({ type: "cancel" });
  });

  it("rejects cancellation and ability switching after a Mount move", () => {
    let state = createGame(2);
    state.phase = "play";
    state.activeColor = "black";
    state.players.black.gods = ["chiron", "kangus"];
    state.players.black.orbs.white = 1;
    state = gameReducer(state, { type: "select-god", godId: "chiron" });
    state = gameReducer(state, { type: "select-ability", abilityId: "mount" });
    state = gameReducer(state, { type: "square", square: "b8" });
    state = gameReducer(state, { type: "square", square: "c6" });

    expect(state.board.c6?.type).toBe("knight");
    expect(state.board.b8).toBeUndefined();
    expect(state.pending?.step).toBe("mount-rider");
    expect(availableClassicActions(state)).toEqual(expect.arrayContaining([
      { type: "square", square: "b7" },
      { type: "pass" },
    ]));
    for (const forbidden of [
      { type: "cancel" },
      { type: "clear-god" },
      { type: "select-god", godId: "kangus" },
      { type: "select-ability", abilityId: "ritual-sacrifice" },
    ] as const) {
      expect(availableClassicActions(state)).not.toContainEqual(forbidden);
    }

    for (const action of [
      { type: "cancel" },
      { type: "clear-god" },
      { type: "select-god", godId: "kangus" },
      { type: "select-ability", abilityId: "ritual-sacrifice" },
    ] as const) {
      expect(gameReducer(state, action)).toBe(state);
    }

    const completed = gameReducer(state, { type: "pass" });
    expect(completed.board.c6?.type).toBe("knight");
    expect(completed.activeColor).toBe("white");
    expect(completed.pending).toBeUndefined();
  });

  it("only allows a Knight to begin or continue Mount", () => {
    let state = createGame(1);
    state.phase = "play";
    state.activeColor = "white";
    state.players.white.gods = ["chiron"];
    state.players.black.gods = ["ares"];
    state.players.white.orbs.white = 1;
    state.board = {
      f1: testPiece("king", "white", "white-king"),
      b2: testPiece("pawn", "white", "white-pawn"),
      b1: testPiece("rook", "white", "white-rider"),
      h8: testPiece("king", "black", "black-king"),
    };
    state = gameReducer(state, { type: "select-god", godId: "chiron" });
    state = gameReducer(state, { type: "select-ability", abilityId: "mount" });

    const rejectedSource = gameReducer(state, { type: "square", square: "b2" });
    expect(rejectedSource.selectedSquare).toBeUndefined();
    expect(rejectedSource.legalTargets).toEqual([]);

    const forgedMove = structuredClone(state);
    forgedMove.selectedSquare = "b2";
    forgedMove.legalTargets = ["b3"];
    const afterForgedMove = gameReducer(forgedMove, { type: "square", square: "b3" });
    expect(afterForgedMove.board.b2?.id).toBe("white-pawn");
    expect(afterForgedMove.board.b3).toBeUndefined();

    const forgedPending = structuredClone(state);
    forgedPending.board.c3 = forgedPending.board.b2;
    delete forgedPending.board.b2;
    forgedPending.pending = {
      godId: "chiron",
      abilityId: "mount",
      step: "mount-rider",
      source: "b2",
      destination: "c3",
      selected: [],
    };
    forgedPending.legalTargets = ["b1"];
    expect(gameReducer(forgedPending, { type: "square", square: "b1" })).toBe(forgedPending);
    expect(gameReducer(forgedPending, { type: "pass" })).toBe(forgedPending);
  });

  it("records exact Mount routes for zero, one, and multiple riders", () => {
    const mountState = (level: 1 | 2 | 3 = 1) => {
      let state = createGame(1);
      state.phase = "play";
      state.activeColor = "white";
      state.players.white.gods = ["chiron"];
      state.players.black.gods = ["ares"];
      state.players.white.orbs.white = 1;
      state.players.white.upgrades.mount = level;
      state.board = {
        f1: testPiece("king", "white", "white-king"),
        b1: testPiece("knight", "white", "white-knight"),
        a1: testPiece("rook", "white", "white-rook"),
        b2: testPiece("bishop", "white", "white-bishop"),
        c3: testPiece("pawn", "black", "black-pawn"),
        h8: testPiece("king", "black", "black-king"),
      };
      state = gameReducer(state, { type: "select-god", godId: "chiron" });
      state = gameReducer(state, { type: "select-ability", abilityId: "mount" });
      state = gameReducer(state, { type: "square", square: "b1" });
      return gameReducer(state, { type: "square", square: "c3" });
    };

    const noRiders = gameReducer(mountState(), { type: "pass" });
    expect(noRiders.lastAction).toBe(
      "White used Mount with Chiron: Knight b1 -> c3, capturing Pawn on c3; 0 riders.",
    );

    let oneRider = mountState();
    oneRider = gameReducer(oneRider, { type: "square", square: "b2" });
    oneRider = gameReducer(oneRider, { type: "square", square: "c2" });
    expect(oneRider.lastAction).toBe(
      "White used Mount with Chiron: Knight b1 -> c3, capturing Pawn on c3; Bishop b2 -> c2; 1 rider.",
    );

    let multipleRiders = mountState(2);
    multipleRiders = gameReducer(multipleRiders, { type: "square", square: "b2" });
    multipleRiders = gameReducer(multipleRiders, { type: "square", square: "c2" });
    multipleRiders = gameReducer(multipleRiders, { type: "square", square: "a1" });
    multipleRiders = gameReducer(multipleRiders, { type: "square", square: "b3" });
    expect(multipleRiders.lastAction).toBe(
      "White used Mount with Chiron: Knight b1 -> c3, capturing Pawn on c3; Bishop b2 -> c2; Rook a1 -> b3; 2 riders.",
    );
  });

  it("uses Serpentine Step in Medusa's multi-move follow-up copy", () => {
    const state = createGame(1);
    state.phase = "play";
    state.activeColor = "white";
    state.players.white.gods = ["medusa"];
    state.players.black.gods = ["quetzacoatl"];
    state.players.white.upgrades.slither = 1;
    state.players.white.orbs.white = 1;
    state.board = {
      a1: testPiece("king", "white", "white-king"),
      h8: testPiece("king", "black", "black-king"),
      c2: testPiece("queen", "white", "medusa-queen"),
    };

    let moved = gameReducer(state, { type: "select-god", godId: "medusa" });
    moved = gameReducer(moved, { type: "select-ability", abilityId: "slither" });
    moved = gameReducer(moved, { type: "square", square: "c2" });
    expect(moved.legalTargets).toContain("d3");
    moved = gameReducer(moved, { type: "square", square: "d3" });

    expect(moved.pending?.step).toBe("slither");
    expect(moved.notice).toMatch(/^Serpentine Step/);
    expect(moved.notice).not.toMatch(/^Slither/);
  });

  it("limits Pick a Fight to ordinary moves with real combat pressure", () => {
    const targets = (board: Record<string, Piece>) => {
      let state = createGame(1);
      state.phase = "play";
      state.activeColor = "white";
      state.players.white.gods = ["ares"];
      state.players.black.gods = ["medusa"];
      state.players.white.orbs.white = 2;
      state.players.white.upgrades["pick-a-fight"] = 2;
      state.board = board;
      state = gameReducer(state, { type: "select-god", godId: "ares" });
      state = gameReducer(state, { type: "select-ability", abilityId: "pick-a-fight" });
      state = gameReducer(state, { type: "square", square: "e5" });
      return state.legalTargets;
    };
    const base = {
      a1: testPiece("king", "white", "white-king"),
      b8: testPiece("king", "black", "black-king"),
      e5: {
        ...testPiece("knight", "white", "fighter"),
        status: { chargeUntil: "god" as const },
      },
      e7: testPiece("pawn", "black", "first-target"),
    };

    expect(targets(base)).not.toContain("g6");

    const attackingTwo = {
      ...base,
      h8: testPiece("rook", "black", "second-target"),
      f8: testPiece("pawn", "white", "friendly-non-target"),
    };
    const pressureTargets = targets(attackingTwo);
    expect(pressureTargets).toContain("g6");
    expect(pressureTargets).not.toContain("e6");

    const attackedAfterLanding = {
      ...base,
      f7: testPiece("bishop", "black", "attacker"),
    };
    expect(targets(attackedAfterLanding)).toContain("g6");
  });

  it("requires a level 1 Air Strike passenger to land on an empty crossed space", () => {
    let state = createGame(1);
    (["quetzacoatl", "chiron", "teles", "death", "artemis", "midas"] as const).forEach((godId) => {
      state = gameReducer(state, { type: "draft", godId });
    });
    state.board = {
      a1: testPiece("king", "white", "white-king"),
      h8: testPiece("king", "black", "black-king"),
      a2: testPiece("rook", "white", "carrier"),
      b2: testPiece("pawn", "white", "passenger"),
      a4: testPiece("bishop", "black", "target"),
    };
    state.players.white.orbs.black = 3;

    state = gameReducer(state, { type: "select-god", godId: "quetzacoatl" });
    state = gameReducer(state, { type: "select-ability", abilityId: "air-strike" });
    state = gameReducer(state, { type: "square", square: "a2" });
    state = gameReducer(state, { type: "square", square: "b2" });
    state = gameReducer(state, { type: "square", square: "a5" });

    expect(state.legalTargets).toEqual(["a3"]);
    state = gameReducer(state, { type: "square", square: "a3" });
    expect(state.board.a5?.id).toBe("carrier");
    expect(state.board.a3?.id).toBe("passenger");
    expect(state.board.a4?.id).toBe("target");
  });

  it("lets level 2 Air Strike capture only the first enemy flown over", () => {
    let state = createGame(1);
    (["quetzacoatl", "chiron", "teles", "death", "artemis", "midas"] as const).forEach((godId) => {
      state = gameReducer(state, { type: "draft", godId });
    });
    state.board = {
      a1: testPiece("king", "white", "white-king"),
      h8: testPiece("king", "black", "black-king"),
      a2: testPiece("rook", "white", "carrier"),
      b2: testPiece("pawn", "white", "passenger"),
      a4: testPiece("bishop", "black", "first-target"),
      a5: testPiece("knight", "black", "second-target"),
    };
    state.players.white.upgrades["air-strike"] = 2;
    state.players.white.orbs.black = 3;

    state = gameReducer(state, { type: "select-god", godId: "quetzacoatl" });
    state = gameReducer(state, { type: "select-ability", abilityId: "air-strike" });
    state = gameReducer(state, { type: "square", square: "a2" });
    state = gameReducer(state, { type: "square", square: "b2" });
    state = gameReducer(state, { type: "square", square: "a6" });

    expect(state.legalTargets).toEqual(["a3", "a4"]);
    expect(state.legalTargets).not.toContain("a5");
    state = gameReducer(state, { type: "square", square: "a4" });
    expect(state.board.a6?.id).toBe("carrier");
    expect(state.board.a4?.id).toBe("passenger");
    expect(state.board.a5?.id).toBe("second-target");
    expect(state.players.black.graveyard.at(-1)?.piece.id).toBe("first-target");
  });

  it("adds knight and bishop passengers only at Air Strike level 3", () => {
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
    expect(setup(2, "knight").pending?.step).toBe("source");
    expect(setup(3, "knight").legalTargets).toContain("e4");
    expect(setup(3, "bishop").legalTargets).toContain("e4");
    expect(setup(3, "queen").pending?.step).toBe("source");
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

  it("requires one ordinary friendly move after Enchant instead of granting another divine turn", () => {
    let state = createGame(1);
    (["teles", "chiron", "midas", "death", "artemis", "medusa"] as const).forEach((godId) => {
      state = gameReducer(state, { type: "draft", godId });
    });
    state.players.white.orbs.black = 4;
    state = gameReducer(state, { type: "select-god", godId: "teles" });
    state = gameReducer(state, { type: "select-ability", abilityId: "enchant" });
    expect(state.pending?.step).toBe("enchant-enemy-move");
    expect(state.legalTargets).toEqual(expect.arrayContaining([
      "a7", "b7", "c7", "d7", "e7", "f7", "g7", "h7",
      "b8", "c8", "f8", "g8",
    ]));
    expect(state.legalTargets).not.toEqual(expect.arrayContaining(["a8", "d8", "e8", "h8"]));

    state = gameReducer(state, { type: "square", square: "b8" });
    state = gameReducer(state, { type: "square", square: "c6" });
    expect(state.pending?.step).toBe("enchant-followup-move");
    expect(hasCompleteClassicTurn(state)).toBe(true);
    expect(state.activeColor).toBe("white");
    expect(state.board.c6).toMatchObject({ color: "black", controller: "black" });
    expect(state.legalTargets).toContain("e2");

    const committed = state;
    state = gameReducer(state, { type: "select-god", godId: "chiron" });
    state = gameReducer(state, { type: "select-ability", abilityId: "charge" });
    expect(state).toEqual(committed);

    state = gameReducer(state, { type: "square", square: "e2" });
    expect(state.legalTargets).toContain("e4");
    state = gameReducer(state, { type: "square", square: "e4" });
    expect(state.activeColor).toBe("black");
    expect(state.board.e4).toMatchObject({ color: "white", controller: "white" });
    expect(state.rested).toContain("teles");
    expect(state.bonusTurn).toBeUndefined();
  });

  it("adds rook and queen Enchant sources only at levels 2 and 3", () => {
    const activate = (level: 1 | 2 | 3) => {
      let state = createGame(1);
      (["teles", "chiron", "midas", "death", "artemis", "medusa"] as const).forEach((godId) => {
        state = gameReducer(state, { type: "draft", godId });
      });
      state.players.white.orbs.black = 4;
      state.players.white.upgrades.enchant = level;
      state = gameReducer(state, { type: "select-god", godId: "teles" });
      return gameReducer(state, { type: "select-ability", abilityId: "enchant" });
    };

    const levelOne = activate(1);
    expect(levelOne.legalTargets).not.toEqual(expect.arrayContaining(["a8", "d8", "h8"]));
    expect(activate(2).legalTargets).toEqual(expect.arrayContaining(["a8", "h8"]));
    expect(activate(2).legalTargets).not.toContain("d8");
    expect(activate(3).legalTargets).toContain("d8");
    expect(activate(3).legalTargets).not.toContain("e8");
  });

  it("rejects Enchant when every hostile move would leave no ordinary follow-up", () => {
    let state = createGame(1);
    (["teles", "chiron", "midas", "death", "artemis", "medusa"] as const).forEach((godId) => {
      state = gameReducer(state, { type: "draft", godId });
    });
    state.board = {
      a1: { ...testPiece("king", "white", "white-king"), status: { movedThisTurn: true } },
      h8: testPiece("king", "black", "black-king"),
      h7: testPiece("pawn", "black", "black-pawn"),
    };
    state.players.white.orbs.black = 4;
    state = gameReducer(state, { type: "select-god", godId: "teles" });
    state = gameReducer(state, { type: "select-ability", abilityId: "enchant" });

    expect(state.selectedAbility).toBeUndefined();
    expect(state.pending).toBeUndefined();
    expect(state.notice).toMatch(/no hostile piece/i);
  });

  it("lets Salem Hex hostile Kings at every level and preserves them through the reward move", () => {
    for (const level of [1, 2, 3] as const) {
      let state = createGame(1);
      state.phase = "play";
      state.activeColor = "white";
      state.players.white.gods = ["salem"];
      state.players.black.gods = ["ares"];
      state.players.white.orbs = { white: 50, black: 50 };
      state.players.white.upgrades.hex = level;
      state.board = {
        e1: testPiece("king", "white", "white-king"),
        e2: testPiece("rook", "white", "hex-mover"),
        e8: testPiece("king", "black", "black-king"),
      };

      state = gameReducer(state, { type: "select-god", godId: "salem" });
      state = gameReducer(state, { type: "select-ability", abilityId: "hex" });
      expect(state.legalTargets).toContain("e8");
      expect(state.legalTargets).not.toContain("e1");

      state = gameReducer(state, { type: "square", square: "e8" });
      expect(state.board.e8.status.hexedBy).toBe("white");
      if (level > 1) state = gameReducer(state, { type: "pass" });

      const orbsBeforeMove =
        state.players.white.orbs.white + state.players.white.orbs.black;
      state = gameReducer(state, { type: "square", square: "e2" });
      expect(state.legalTargets).toContain("e3");
      state = gameReducer(state, { type: "square", square: "e3" });

      expect(state.board.e8).toMatchObject({
        id: "black-king",
        type: "king",
        status: { hexedBy: "white" },
      });
      expect(
        state.players.white.orbs.white + state.players.white.orbs.black,
      ).toBe(orbsBeforeMove + 2);
    }
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
