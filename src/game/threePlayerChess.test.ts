import { describe, expect, it } from "vitest";
import { createDefaultThreePlayerConfig } from "./threePlayerConfig";
import {
  createThreePlayerInitialCastlingRights,
  threePlayerApplyMove,
  threePlayerCheckingSeats,
  threePlayerLegalMoves,
  threePlayerPseudoTargets,
} from "./threePlayerChess";
import {
  createThreePlayerGame,
  threePlayerReducer,
} from "./threePlayerEngine";
import { getThreePlayerTopology } from "./threePlayerTopology";
import {
  THREE_PLAYER_BOARD_VARIANTS,
  type ThreePlayerBoardVariant,
  type ThreePlayerCell,
  type ThreePlayerPiece,
  type ThreePlayerSeat,
  type ThreePlayerState,
} from "./threePlayerTypes";

const piece = (
  id: string,
  type: ThreePlayerPiece["type"],
  owner: ThreePlayerSeat,
): ThreePlayerPiece => ({
  id,
  type,
  owner,
  controller: owner,
  hasMoved: false,
  status: {},
});

const stateFor = (boardVariant: ThreePlayerBoardVariant) => {
  const config = createDefaultThreePlayerConfig();
  config.boardVariant = boardVariant;
  const state = createThreePlayerGame(config);
  state.phase = "play";
  state.draft.pickIndex = 9;
  state.draft.unused = state.draft.available.slice(0, 3);
  state.draft.available = [];
  return state;
};

describe("three-player ordinary chess", () => {
  it("creates exact source-sized armies and legal opening moves on every topology", () => {
    const expected = {
      "three-player": { cells: 96, pieces: 48 },
      "three-hexagonal": { cells: 217, pieces: 84 },
      triad: { cells: 144, pieces: 72 },
      "three-circular": { cells: 96, pieces: 48 },
      "three-half": { cells: 96, pieces: 48 },
    } as const;
    for (const variant of THREE_PLAYER_BOARD_VARIANTS) {
      const state = stateFor(variant);
      expect(getThreePlayerTopology(variant).cells).toHaveLength(
        expected[variant].cells,
      );
      expect(Object.keys(state.board)).toHaveLength(expected[variant].pieces);
      expect(threePlayerLegalMoves(state, "white").length).toBeGreaterThan(0);
    }
  });

  it("uses topology rays for blockers and alternative movement families", () => {
    for (const variant of THREE_PLAYER_BOARD_VARIANTS) {
      const topology = getThreePlayerTopology(variant);
      const rookOrigin = topology.cells.find((cell) =>
        topology.rookRays(cell).some((ray) => ray.cells.length >= 2)
      )!;
      const rookRay = topology.rookRays(rookOrigin).find(
        (ray) => ray.cells.length >= 2,
      )!;
      const bishopOrigin = topology.cells.find((cell) =>
        topology.bishopRays(cell).some((ray) => ray.cells.length >= 1)
      )!;
      const knightOrigin = topology.cells.find(
        (cell) => topology.knightTargets(cell).length,
      )!;
      const kingOrigin = topology.cells.find(
        (cell) => topology.kingTargets(cell).length,
      )!;
      const rookState = stateFor(variant);
      rookState.board = {
        [rookOrigin]: piece("rook", "rook", "white"),
        [rookRay.cells[0]]: piece("blocker", "pawn", "white"),
        [rookRay.cells[1]]: piece("target", "pawn", "red"),
      };
      expect(threePlayerPseudoTargets(rookState, rookOrigin)).not.toContain(
        rookRay.cells[1],
      );

      const bishopState = stateFor(variant);
      bishopState.board = {
        [bishopOrigin]: piece("bishop", "bishop", "red"),
      };
      expect(threePlayerPseudoTargets(bishopState, bishopOrigin).length)
        .toBeGreaterThan(0);

      const knightState = stateFor(variant);
      knightState.board = {
        [knightOrigin]: piece("knight", "knight", "black"),
      };
      expect(threePlayerPseudoTargets(knightState, knightOrigin)).toEqual(
        expect.arrayContaining([...topology.knightTargets(knightOrigin)]),
      );

      const kingState = stateFor(variant);
      kingState.board = {
        [kingOrigin]: piece("king", "king", "white"),
      };
      expect(threePlayerPseudoTargets(kingState, kingOrigin)).toEqual(
        expect.arrayContaining(
          topology.kingTargets(kingOrigin).filter(
            (cell) => !kingState.board[cell],
          ),
        ),
      );
    }
  });

  it("treats enemy Kings as attacked but never as ordinary capture targets", () => {
    const topology = getThreePlayerTopology("three-player");
    const cell = (sourceIndex: number) =>
      topology.cellFromSourceIndex(sourceIndex)!;
    const cases = [
      { attacker: piece("rook", "rook", "white"), from: cell(9), king: cell(1) },
      {
        attacker: piece("knight", "knight", "white"),
        from: cell(10),
        king: cell(0),
      },
      { attacker: piece("pawn", "pawn", "white"), from: cell(17), king: cell(8) },
    ];

    for (const testCase of cases) {
      const state = stateFor("three-player");
      state.board = {
        [testCase.from]: testCase.attacker,
        [testCase.king]: piece("red-king", "king", "red"),
      };
      expect(threePlayerPseudoTargets(state, testCase.from))
        .not.toContain(testCase.king);
      expect(threePlayerPseudoTargets(state, testCase.from, {
        attacksOnly: true,
      })).toContain(testCase.king);
      expect(threePlayerCheckingSeats(state, "red")).toContain("white");
      expect(() =>
        threePlayerApplyMove(state, {
          from: testCase.from,
          to: testCase.king,
        })
      ).toThrow("Ordinary moves cannot capture a King.");
    }

    const reducerState = stateFor("three-player");
    reducerState.board = {
      [cell(9)]: piece("rook", "rook", "white"),
      [cell(31)]: piece("white-king", "king", "white"),
      [cell(1)]: piece("red-king", "king", "red"),
    };
    const rejected = threePlayerReducer(reducerState, {
      type: "move",
      from: cell(9),
      to: cell(1),
    });
    expect(rejected).toBe(reducerState);
    expect(rejected.players.red.eliminated).toBe(false);
    expect(rejected.board[cell(1)]?.type).toBe("king");
  });

  it("applies pawn blocking, double moves, en passant, and promotion metadata", () => {
    for (const variant of THREE_PLAYER_BOARD_VARIANTS) {
      const topology = getThreePlayerTopology(variant);
      const doubleSource = topology.cells.find((cell) =>
        topology.pawnRules("white", cell).advances.some(
          (advance) => advance.double,
        )
      );
      if (!doubleSource) continue;
      const double = topology.pawnRules("white", doubleSource).advances.find(
        (advance) => advance.double,
      )!;
      const state = stateFor(variant);
      state.board = {
        [doubleSource]: piece("white-pawn", "pawn", "white"),
      };
      expect(threePlayerPseudoTargets(state, doubleSource)).toContain(double.to);

      state.board[double.path[0]] = piece("blocker", "pawn", "red");
      expect(threePlayerPseudoTargets(state, doubleSource)).not.toContain(
        double.to,
      );
      delete state.board[double.path[0]];

      const applied = threePlayerApplyMove(state, {
        from: doubleSource,
        to: double.to,
      });
      expect(applied.enPassant).toMatchObject({
        capturedCell: double.to,
        pawnId: "white-pawn",
      });

      if (applied.enPassant) {
        const captureSource = topology.cells.find((cell) =>
          ["red", "black"].some((seat) =>
            topology.pawnRules(seat as ThreePlayerSeat, cell).captures.some(
              (capture) => capture.to === applied.enPassant!.target,
            )
          )
        );
        if (captureSource) {
          const captor = (["red", "black"] as const).find((seat) =>
            topology.pawnRules(seat, captureSource).captures.some(
              (capture) => capture.to === applied.enPassant!.target,
            )
          )!;
          const enPassantState = stateFor(variant);
          enPassantState.turn = applied.enPassant.expiresOnTurn;
          enPassantState.enPassant = applied.enPassant;
          enPassantState.board = {
            [double.to]: { ...piece("white-pawn", "pawn", "white"), hasMoved: true },
            [captureSource]: piece("captor", "pawn", captor),
          };
          expect(threePlayerPseudoTargets(enPassantState, captureSource))
            .toContain(applied.enPassant.target);
          const captured = threePlayerApplyMove(enPassantState, {
            from: captureSource,
            to: applied.enPassant.target,
          });
          expect(captured.captured?.id).toBe("white-pawn");
          expect(captured.board[double.to]).toBeUndefined();
        }
      }

      const promotionSource = topology.cells.find((cell) =>
        topology.pawnRules("white", cell).advances.some(
          (advance) => advance.promotes,
        )
      );
      if (promotionSource) {
        const promotion = topology.pawnRules("white", promotionSource)
          .advances.find((advance) => advance.promotes)!;
        const promotionState = stateFor(variant);
        const kingCell = topology.cells.find(
          (cell) =>
            cell !== promotionSource &&
            cell !== promotion.to,
        )!;
        promotionState.board = {
          [promotionSource]: piece("promoting", "pawn", "white"),
          [kingCell]: piece("white-king", "king", "white"),
        };
        expect(threePlayerApplyMove(promotionState, {
          from: promotionSource,
          to: promotion.to,
          promotion: "knight",
        }).board[promotion.to].type).toBe("knight");
        expect(
          threePlayerLegalMoves(promotionState, "white")
            .filter((move) =>
              move.from === promotionSource && move.to === promotion.to
            )
            .map((move) => move.promotion),
        ).toEqual(["queen", "rook", "bishop", "knight"]);
      }
    }
  });

  it("supports only topology-declared castling and moves both pieces", () => {
    const expectedCastling = {
      "three-player": 2,
      "three-hexagonal": 2,
      triad: 0,
      "three-circular": 0,
      "three-half": 2,
    } as const;
    for (const variant of THREE_PLAYER_BOARD_VARIANTS) {
      const topology = getThreePlayerTopology(variant);
      expect(topology.castling("white")).toHaveLength(
        expectedCastling[variant],
      );
      const rights = createThreePlayerInitialCastlingRights(variant);
      expect(rights.white.king).toBe(
        topology.castling("white").some((entry) => entry.side === "king"),
      );
      expect(rights.white.queen).toBe(
        topology.castling("white").some((entry) => entry.side === "queen"),
      );
      const descriptor = topology.castling("white")[0];
      if (!descriptor) continue;
      const state = stateFor(variant);
      state.board = {
        [descriptor.kingFrom]: piece("king", "king", "white"),
        [descriptor.rookFrom]: piece("rook", "rook", "white"),
      };
      expect(threePlayerPseudoTargets(state, descriptor.kingFrom)).toContain(
        descriptor.kingTo,
      );
      const applied = threePlayerApplyMove(state, {
        from: descriptor.kingFrom,
        to: descriptor.kingTo,
      });
      expect(applied.board[descriptor.kingTo].type).toBe("king");
      expect(applied.board[descriptor.rookTo].type).toBe("rook");
      expect(applied.castlingRights.white).toEqual({
        king: false,
        queen: false,
      });

      const transit = descriptor.kingPath[0];
      const attacker = topology.cells.find((origin) =>
        origin !== descriptor.kingFrom &&
        origin !== descriptor.rookFrom &&
        !descriptor.empty.includes(origin) &&
        topology.rookRays(origin).some(
          (ray) => ray.cells[0] === transit,
        )
      );
      if (attacker) {
        state.board[attacker] = piece("attacker", "rook", "red");
        expect(threePlayerPseudoTargets(state, descriptor.kingFrom))
          .not.toContain(descriptor.kingTo);
      }
    }
    expect(createThreePlayerInitialCastlingRights("triad")).toEqual({
      white: { king: false, queen: false },
      red: { king: false, queen: false },
      black: { king: false, queen: false },
    });
    expect(createThreePlayerInitialCastlingRights("three-circular")).toEqual({
      white: { king: false, queen: false },
      red: { king: false, queen: false },
      black: { king: false, queen: false },
    });
  });

  it("detects simultaneous checks and rejects moves that expose either enemy attack", () => {
    const topology = getThreePlayerTopology("three-player");
    const incoming = new Map<ThreePlayerCell, ThreePlayerCell[]>();
    for (const origin of topology.cells) {
      for (const ray of topology.rookRays(origin)) {
        for (const target of ray.cells) {
          const origins = incoming.get(target) ?? [];
          if (!origins.includes(origin)) origins.push(origin);
          incoming.set(target, origins);
        }
      }
    }
    const kingCell = [...incoming].find(([, origins]) => origins.length >= 2)![0];
    const [redOrigin, blackOrigin] = incoming.get(kingCell)!;
    const checked = stateFor("three-player");
    checked.board = {
      [kingCell]: piece("white-king", "king", "white"),
      [redOrigin]: piece("red-rook", "rook", "red"),
      [blackOrigin]: piece("black-rook", "rook", "black"),
    };
    expect(threePlayerCheckingSeats(checked, "white")).toEqual(
      expect.arrayContaining(["red", "black"]),
    );

    const pin = topology.cells
      .flatMap((origin) =>
        topology.rookRays(origin).map((ray) => ({ origin, ray }))
      )
      .find(({ ray }) => ray.cells.length >= 3)!;
    const blockerCell = pin.ray.cells[0];
    const pinnedKing = pin.ray.cells[2];
    const pinned = stateFor("three-player");
    pinned.board = {
      [pin.origin]: piece("attacker", "rook", "red"),
      [blockerCell]: piece("blocker", "rook", "white"),
      [pinnedKing]: piece("king", "king", "white"),
    };
    const pseudo = threePlayerPseudoTargets(pinned, blockerCell);
    const legal = threePlayerLegalMoves(pinned, "white")
      .filter((move) => move.from === blockerCell)
      .map((move) => move.to);
    expect(pseudo.some((target) => !legal.includes(target))).toBe(true);
  });
});
