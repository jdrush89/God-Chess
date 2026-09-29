import { describe, expect, it } from "vitest";
import {
  createFourPlayerInitialBoard,
  fourPlayerApplyMove,
  fourPlayerCanCastle,
  fourPlayerCoords,
  fourPlayerIsInCheck,
  fourPlayerLegalTargets,
  fourPlayerLineOfSight,
  fourPlayerLineOfSightSquares,
  fourPlayerPathSquares,
  fourPlayerSquares,
  forwardDirection,
  homeSquares,
  leftDirection,
  pawnSquares,
  promotionSquares,
  rightDirection,
} from "./fourPlayerChess";
import { createDefaultFourPlayerConfig } from "./fourPlayerConfig";
import type { FourPlayerPiece, Seat } from "./fourPlayerTypes";
import type { PieceType } from "./types";

const config = createDefaultFourPlayerConfig();

const piece = (
  type: PieceType,
  owner: Seat,
  id: string,
  controller: Seat | null = owner,
): FourPlayerPiece => ({
  id,
  type,
  owner,
  controller,
  displayColor: config.seats[owner].displayColor,
  orbAffinity: config.seats[owner].orbAffinity,
  hasMoved: false,
  status: {},
});

describe("four-player cross geometry", () => {
  it("enumerates the central board and four arms but excludes all corners", () => {
    expect(fourPlayerSquares).toHaveLength(160);
    expect(fourPlayerSquares).toEqual(expect.arrayContaining(["d1", "k14", "a4", "n11", "g7"]));
    expect(fourPlayerSquares).not.toEqual(expect.arrayContaining(["a1", "c3", "l12", "n14"]));
    expect(fourPlayerCoords("n14")).toEqual([13, 13]);
  });

  it("stops paths and line-of-sight sampling at invalid corner space", () => {
    expect(fourPlayerPathSquares("d4", "a1")).toEqual([]);
    expect(fourPlayerPathSquares("d4", "d1")).toEqual(["d3", "d2"]);
    expect(fourPlayerLineOfSightSquares("d4", "a1")).toEqual([]);
    expect(fourPlayerLineOfSight({}, "d1", "a4")).toBe(false);
  });

  it("defines forward, left, and right from every seat", () => {
    expect(forwardDirection("north")).toEqual([0, -1]);
    expect(forwardDirection("east")).toEqual([-1, 0]);
    expect(forwardDirection("south")).toEqual([0, 1]);
    expect(forwardDirection("west")).toEqual([1, 0]);
    expect(leftDirection("north")).toEqual([1, 0]);
    expect(rightDirection("north")).toEqual([-1, 0]);
    expect(leftDirection("east")).toEqual([0, -1]);
    expect(rightDirection("west")).toEqual([0, -1]);
  });

  it("lays out every army relative to its own perspective", () => {
    const board = createFourPlayerInitialBoard(config);
    expect(Object.keys(board)).toHaveLength(64);
    expect(homeSquares("north")).toEqual(["k14", "j14", "i14", "h14", "g14", "f14", "e14", "d14"]);
    expect(homeSquares("east")).toEqual(["n4", "n5", "n6", "n7", "n8", "n9", "n10", "n11"]);
    expect(homeSquares("south")).toEqual(["d1", "e1", "f1", "g1", "h1", "i1", "j1", "k1"]);
    expect(homeSquares("west")).toEqual(["a11", "a10", "a9", "a8", "a7", "a6", "a5", "a4"]);
    expect(board.g14).toMatchObject({ owner: "north", type: "king", controller: "north" });
    expect(board.n8).toMatchObject({ owner: "east", type: "king", controller: "east" });
    expect(board.h1).toMatchObject({ owner: "south", type: "king", controller: "south" });
    expect(board.a7).toMatchObject({ owner: "west", type: "king", controller: "west" });
    expect(pawnSquares("north")).toContain("g13");
    expect(pawnSquares("east")).toContain("m8");
  });

  it("moves pawns inward from every arm", () => {
    const board = createFourPlayerInitialBoard(config);
    expect(fourPlayerLegalTargets(board, "g13", config)).toEqual(expect.arrayContaining(["g12", "g11"]));
    expect(fourPlayerLegalTargets(board, "m8", config)).toEqual(expect.arrayContaining(["l8", "k8"]));
    expect(fourPlayerLegalTargets(board, "h2", config)).toEqual(expect.arrayContaining(["h3", "h4"]));
    expect(fourPlayerLegalTargets(board, "b7", config)).toEqual(expect.arrayContaining(["c7", "d7"]));
  });

  it("promotes pawns on the opposite outer edge", () => {
    expect(promotionSquares("north").has("g1")).toBe(true);
    expect(promotionSquares("east").has("a7")).toBe(true);
    expect(promotionSquares("south").has("h14")).toBe(true);
    expect(promotionSquares("west").has("n8")).toBe(true);

    const board = {
      g2: piece("pawn", "north", "north-pawn"),
      b7: piece("pawn", "east", "east-pawn"),
      h13: piece("pawn", "south", "south-pawn"),
      m8: piece("pawn", "west", "west-pawn"),
    };
    expect(fourPlayerApplyMove(board, { from: "g2", to: "g1" }).board.g1.type).toBe("queen");
    expect(fourPlayerApplyMove(board, { from: "b7", to: "a7" }).board.a7.type).toBe("queen");
    expect(fourPlayerApplyMove(board, { from: "h13", to: "h14" }).board.h14.type).toBe("queen");
    expect(fourPlayerApplyMove(board, { from: "m8", to: "n8" }).board.n8.type).toBe("queen");
  });

  it("supports castling relative to all four home rows", () => {
    const board = createFourPlayerInitialBoard(config);
    for (const seat of ["north", "east", "south", "west"] as Seat[]) {
      const homes = homeSquares(seat);
      for (const index of [1, 2, 3, 5, 6]) delete board[homes[index]];
      expect(fourPlayerCanCastle(board, seat, "king", config)).toBe(true);
      expect(fourPlayerCanCastle(board, seat, "queen", config)).toBe(true);
      expect(fourPlayerLegalTargets(board, homes[4], config)).toEqual(
        expect.arrayContaining([homes[2], homes[6]]),
      );
    }
    const eastHomes = homeSquares("east");
    const castled = fourPlayerApplyMove(board, {
      from: eastHomes[4],
      to: eastHomes[6],
    }).board;
    expect(castled[eastHomes[6]]?.type).toBe("king");
    expect(castled[eastHomes[5]]?.type).toBe("rook");
    expect(castled[eastHomes[7]]).toBeUndefined();
  });

  it("creates and resolves seat-relative en passant targets", () => {
    const board = {
      g14: piece("king", "north", "north-king"),
      g1: piece("king", "south", "south-king"),
      g4: piece("pawn", "south", "double-pawn"),
      h6: piece("pawn", "north", "capturer"),
    };
    const doubled = fourPlayerApplyMove(board, { from: "g4", to: "g6" });
    expect(doubled.enPassant).toEqual({
      target: "g5",
      capturedSquare: "g6",
      pawnId: "double-pawn",
    });
    const enPassant = { ...doubled.enPassant!, expiresOnTurn: 2 };
    expect(fourPlayerLegalTargets(doubled.board, "h6", config, { enPassant })).toContain("g5");
    const captured = fourPlayerApplyMove(doubled.board, { from: "h6", to: "g5" }, enPassant);
    expect(captured.board.g5?.id).toBe("capturer");
    expect(captured.board.g6).toBeUndefined();
  });

  it("blocks ordinary teammate captures while hostile and inert pieces remain capturable", () => {
    const teamConfig = createDefaultFourPlayerConfig();
    teamConfig.mode = "teams";
    teamConfig.teams = {
      north: "team-a",
      east: "team-a",
      south: "team-b",
      west: "team-b",
    };
    const board = {
      g14: piece("king", "north", "north-king"),
      n8: piece("king", "east", "east-king"),
      h1: piece("king", "south", "south-king"),
      a7: piece("king", "west", "west-king"),
      g8: piece("rook", "north", "rook"),
      g10: piece("pawn", "east", "ally"),
      h8: piece("pawn", "south", "enemy"),
      f8: piece("pawn", "west", "inert", null),
    };
    expect(fourPlayerLegalTargets(board, "g8", teamConfig)).not.toContain("g10");
    expect(fourPlayerLegalTargets(board, "g8", teamConfig)).toContain("h8");
    expect(fourPlayerLegalTargets(board, "g8", teamConfig)).toContain("f8");
  });

  it("checks a King against every hostile seat but not a teammate", () => {
    const teamConfig = createDefaultFourPlayerConfig();
    teamConfig.mode = "teams";
    teamConfig.teams = {
      north: "team-a",
      east: "team-a",
      south: "team-b",
      west: "team-b",
    };
    const board = {
      g8: piece("king", "north", "north-king"),
      g11: piece("rook", "east", "ally-rook"),
      h1: piece("king", "south", "south-king"),
      a7: piece("king", "west", "west-king"),
    };
    expect(fourPlayerIsInCheck(board, "north", teamConfig)).toBe(false);
    board.g11.controller = "south";
    expect(fourPlayerIsInCheck(board, "north", teamConfig)).toBe(true);
  });
});
