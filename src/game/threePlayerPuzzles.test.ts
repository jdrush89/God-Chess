import { describe, expect, it } from "vitest";
import { chooseThreePlayerAiPlan } from "./threePlayerAi";
import {
  threePlayerIsInCheck,
  threePlayerLegalMoves,
} from "./threePlayerChess";
import { threePlayerReducer } from "./threePlayerEngine";
import {
  THREE_PLAYER_BOARD_VARIANTS,
  THREE_PLAYER_SEATS,
} from "./threePlayerTypes";
import {
  THREE_PLAYER_PUZZLES,
} from "./threePlayerPuzzles";
import {
  getThreePlayerTopology,
  threePlayerCellCoordinate,
} from "./threePlayerTopology";

describe("three-player puzzles", () => {
  it("includes ten positions with two on every board variant", () => {
    expect(THREE_PLAYER_PUZZLES).toHaveLength(10);
    for (const variant of THREE_PLAYER_BOARD_VARIANTS) {
      expect(
        THREE_PLAYER_PUZZLES.filter(
          (puzzle) => puzzle.boardVariant === variant,
        ),
      ).toHaveLength(2);
    }
  });

  it("starts every position safe, unique, and free of artificial statuses", () => {
    const signatures = new Set<string>();
    for (const puzzle of THREE_PLAYER_PUZZLES) {
      const state = puzzle.createState();
      expect(state.config.victoryMode).toBe("last-survivor");
      expect(state.activeSeat).toBe("white");
      expect(state.phase).toBe("play");
      const draftedGods = THREE_PLAYER_SEATS.flatMap(
        (seat) => state.players[seat].gods,
      );
      expect(draftedGods).toHaveLength(9);
      expect(new Set(draftedGods)).toHaveLength(9);
      expect(Object.values(state.board).some((piece) =>
        piece.status.frozen ||
        piece.status.frozenBy ||
        piece.status.gazing ||
        piece.status.stunned
      )).toBe(false);
      if (puzzle.boardVariant === "three-player") {
        const topology = getThreePlayerTopology(puzzle.boardVariant);
        for (const [cell, piece] of Object.entries(state.board)) {
          if (piece.type === "pawn") {
            expect(
              topology.isPromotionCell(piece.owner, cell),
              `${puzzle.id}:${piece.id}`,
            ).toBe(false);
          }
        }
      }
      for (const seat of THREE_PLAYER_SEATS) {
        expect(threePlayerIsInCheck(state, seat)).toBe(false);
      }
      const signature = Object.entries(state.board)
        .map(([cell, piece]) => `${cell}:${piece.owner}:${piece.type}`)
        .sort()
        .join("|");
      expect(signatures.has(signature)).toBe(false);
      signatures.add(signature);
    }
  });

  it("mirrors the first Yalta rivals and uses a different tactical order in the second", () => {
    const [first, second] = THREE_PLAYER_PUZZLES;
    const firstState = first.createState();
    const redKingCell = Object.entries(firstState.board).find(
      ([, piece]) => piece.owner === "red" && piece.type === "king",
    )![0];
    const blackKingCell = Object.entries(firstState.board).find(
      ([, piece]) => piece.owner === "black" && piece.type === "king",
    )![0];

    expect(threePlayerCellCoordinate("three-player", redKingCell)?.square)
      .toBe("a1");
    expect(threePlayerCellCoordinate("three-player", blackKingCell)?.square)
      .toBe("h1");

    const abilities = (puzzle: typeof first) =>
      puzzle.solutionTurns.map((turn) =>
        turn.find((action) => action.type === "select-ability")?.abilityId
      );
    expect(abilities(first)).toEqual(["mount", "air-lift"]);
    expect(abilities(second)).toEqual(["air-lift", "charge"]);
  });

  it("uses varied advanced ability sequences instead of ordinary mating moves", () => {
    const sequences = THREE_PLAYER_PUZZLES.map((puzzle) =>
      puzzle.solutionTurns.map((turn) =>
        turn.find((action) => action.type === "select-ability")?.abilityId
      )
    );
    const abilityIds = new Set(sequences.flat());
    const sequenceIds = new Set(sequences.map((sequence) => sequence.join(">")));

    expect(abilityIds).toEqual(
      new Set([
        "air-lift",
        "charge",
        "march-home",
        "mount",
        "pick-a-fight",
      ]),
    );
    expect(sequenceIds).toEqual(
      new Set([
        "air-lift>charge",
        "march-home>charge",
        "mount>air-lift",
        "pick-a-fight>air-lift",
      ]),
    );
    expect(sequenceIds.size).toBe(4);
    expect(abilityIds.size).toBe(5);

    const whiteRosters = THREE_PLAYER_PUZZLES.map((puzzle) =>
      puzzle.createState().players.white.gods.join(",")
    );
    const whiteGods = new Set(
      THREE_PLAYER_PUZZLES.flatMap((puzzle) =>
        puzzle.createState().players.white.gods
      ),
    );
    expect(new Set(whiteRosters).size).toBeGreaterThanOrEqual(5);
    expect(whiteGods.size).toBeGreaterThanOrEqual(7);
  });

  it("requires each advanced ability's special movement", () => {
    for (const puzzle of THREE_PLAYER_PUZZLES) {
      const state = puzzle.createState();
      const topology = getThreePlayerTopology(puzzle.boardVariant);
      for (const turn of puzzle.solutionTurns) {
        const ability = turn.find(
          (action) => action.type === "select-ability",
        );
        expect(ability?.type, puzzle.id).toBe("select-ability");
        if (ability?.type !== "select-ability") continue;
        const cells = turn.filter((action) => action.type === "cell");

        if (ability.abilityId === "charge") {
          const [source, destination] = cells;
          expect(state.board[source.cell]?.type, puzzle.id).toBe("knight");
          expect(
            topology.knightTargets(source.cell).includes(destination.cell),
            puzzle.id,
          ).toBe(false);
          expect(
            topology.rookTraces(source.cell).some((trace) =>
              trace.cells.includes(destination.cell)
            ),
            puzzle.id,
          ).toBe(true);
        } else if (ability.abilityId === "air-lift") {
          const [source, destination] = cells;
          expect(state.board[source.cell]?.type, puzzle.id).toBe("king");
          expect(
            topology.kingNeighbors(source.cell).includes(destination.cell),
            puzzle.id,
          ).toBe(false);
          expect(
            topology.distance(source.cell, destination.cell),
            puzzle.id,
          ).toBeLessThanOrEqual(3);
        } else if (ability.abilityId === "march-home") {
          const kingCell = Object.entries(state.board).find(
            ([, piece]) =>
              piece.owner === "white" && piece.type === "king",
          )?.[0];
          expect(kingCell, puzzle.id).toBeDefined();
          expect(kingCell, puzzle.id).not.toBe(
            topology.homeCell("white"),
          );
        } else if (ability.abilityId === "pick-a-fight") {
          const [source, destination] = cells;
          expect(state.board[source.cell]?.type, puzzle.id).toBe("knight");
          expect(
            topology.knightTargets(source.cell).includes(destination.cell),
            puzzle.id,
          ).toBe(false);
        } else if (ability.abilityId === "mount") {
          const [carrier, destination, rider, landing] = cells;
          expect(state.board[carrier.cell]?.type, puzzle.id).toBe("knight");
          expect(state.board[rider.cell]?.type, puzzle.id).toBe("knight");
          expect(
            topology.knightTargets(carrier.cell).includes(destination.cell),
            puzzle.id,
          ).toBe(true);
          expect(
            topology.knightTargets(rider.cell).includes(landing.cell),
            puzzle.id,
          ).toBe(false);
        }
      }
    }
  });

  it("recognizes the red pawn capture that answers a knight check on White f3", () => {
    const state = THREE_PLAYER_PUZZLES[0].createState();
    delete state.board["three-player:4"];
    state.board["three-player:13"] = {
      id: "checking-knight",
      type: "knight",
      owner: "white",
      controller: "white",
      hasMoved: true,
      status: {},
    };
    state.board["three-player:6"] = {
      id: "red-answering-pawn",
      type: "pawn",
      owner: "red",
      controller: "red",
      hasMoved: true,
      status: {},
    };
    state.activeSeat = "red";

    expect(
      threePlayerLegalMoves(state, "red").some(
        (move) =>
          move.from === "three-player:6" &&
          move.to === "three-player:13",
      ),
    ).toBe(true);
  });

  it("wins against the strongest CPU response within the turn budget", () => {
    for (const puzzle of THREE_PLAYER_PUZZLES) {
      let state = puzzle.createState();
      expect(puzzle.solutionTurns).toHaveLength(puzzle.playerTurns);

      for (const [turnIndex, turn] of puzzle.solutionTurns.entries()) {
        state = turn.reduce(threePlayerReducer, state);
        expect(state.completedTurns.white, puzzle.id).toBe(turnIndex + 1);
        if (turnIndex < puzzle.solutionTurns.length - 1) {
          expect(state.result, puzzle.id).toBeUndefined();
          const cpuTurn = chooseThreePlayerAiPlan(state, 1);
          expect(cpuTurn.length, puzzle.id).toBeGreaterThan(0);
          state = cpuTurn.reduce(threePlayerReducer, state);
          expect(state.activeSeat, puzzle.id).toBe("white");
        }
      }

      expect(state.players.red.eliminated, puzzle.id).toBe(true);
      expect(state.players.black.eliminated, puzzle.id).toBe(true);
      expect(state.result, puzzle.id).toEqual({
        kind: "winner",
        seat: "white",
        reason: "last-survivor",
      });
    }
  });

  it("makes an active defensive move in Circular Convergence", () => {
    const puzzle = THREE_PLAYER_PUZZLES.find(
      ({ id }) => id === "circular-convergence",
    )!;
    let state = puzzle.solutionTurns[0].reduce(
      threePlayerReducer,
      puzzle.createState(),
    );
    const boardBefore = JSON.stringify(state.board);
    const cpuTurn = chooseThreePlayerAiPlan(state, 1);

    expect(cpuTurn).not.toContainEqual({ type: "pass" });
    state = cpuTurn.reduce(threePlayerReducer, state);
    expect(JSON.stringify(state.board)).not.toBe(boardBefore);
    expect(state.lastAction).toMatch(/used Sing with Teles/i);
  });
});
