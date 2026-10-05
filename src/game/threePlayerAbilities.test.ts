import { describe, expect, it } from "vitest";
import {
  availableThreePlayerActions,
  createThreePlayerGame,
  hasCompleteThreePlayerTurn,
  threePlayerReducer,
  unsupportedThreePlayerAbilities,
} from "./threePlayerEngine";
import { createDefaultThreePlayerConfig } from "./threePlayerConfig";
import { threePlayerIsInCheck } from "./threePlayerChess";
import { GODS } from "./gods";
import { prepareThreePlayerState } from "./threePlayerPersistence";
import { getThreePlayerTopology } from "./threePlayerTopology";
import type {
  ThreePlayerPiece,
  ThreePlayerSeat,
  ThreePlayerState,
} from "./threePlayerTypes";
import { THREE_PLAYER_BOARD_VARIANTS } from "./threePlayerTypes";

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

const addSafeWhiteKing = (
  state: ThreePlayerState,
  excluded = new Set<string>(),
) => {
  const topology = getThreePlayerTopology(state.config.boardVariant);
  for (const cell of topology.cells) {
    if (state.board[cell] || excluded.has(cell)) continue;
    state.board[cell] = piece("white-king", "king", "white");
    if (!threePlayerIsInCheck(state, "white")) return cell;
    delete state.board[cell];
  }
  throw new Error("No safe white King cell found for test.");
};

const abilityState = (
  godId: (typeof GODS)[number]["id"],
  level: 1 | 2 | 3,
  boardVariant: ThreePlayerState["config"]["boardVariant"] = "three-player",
) => {
  const config = createDefaultThreePlayerConfig();
  config.boardVariant = boardVariant;
  const state = createThreePlayerGame(config);
  state.phase = "play";
  state.activeSeat = "white";
  state.players.white.gods = [godId];
  state.players.red.gods = ["ares"];
  state.players.black.gods = ["midas"];
  state.players.white.orbs = { light: 50, dark: 50 };
  if (level > 1) {
    for (const ability of GODS.find((god) => god.id === godId)!.abilities) {
      state.players.white.upgrades[ability.id] = level;
    }
  }
  const gravePiece = Object.values(state.board).find(
    (piece) => piece.owner === "white" && piece.type === "pawn",
  )!;
  state.players.white.graveyard = [{
    piece: {
      ...structuredClone(gravePiece),
      id: `grave-${godId}-${level}`,
    },
    capturedOnTurn: 0,
  }];
  if (godId === "death") {
    const topology = getThreePlayerTopology(state.config.boardVariant);
    const bishopCell = Object.entries(state.board).find(([, candidate]) =>
      candidate.owner === "white" && candidate.type === "bishop"
    )?.[0];
    const opening = bishopCell
      ? topology.kingNeighbors(bishopCell).find((cell) =>
        state.board[cell]?.type !== "king"
      )
      : undefined;
    if (opening) delete state.board[opening];
  }
  return state;
};

const threePlayerSlitherSetup = (
  boardVariant: ThreePlayerState["config"]["boardVariant"],
  level: 1 | 2 | 3 = 2,
) => {
  const state = abilityState("quetzacoatl", level, boardVariant);
  const topology = getThreePlayerTopology(boardVariant);
  state.board = {};
  const destination = topology.cells.find((cell) =>
    topology.orthogonalNeighbors(cell).length > 0 &&
    topology.diagonalNeighbors(cell).length > 0
  );
  if (!destination) throw new Error(`No Slither destination for ${boardVariant}.`);
  const source = topology.orthogonalNeighbors(destination)[0];
  const darkLink = topology.diagonalNeighbors(destination)[0];
  state.board[source] = piece("slither-mover", "rook", "white");
  state.board[darkLink] = piece("slither-dark-link", "pawn", "black");
  const excluded = new Set([
    source,
    destination,
    darkLink,
    ...topology.kingNeighbors(destination),
    ...topology.kingNeighbors(darkLink),
  ]);
  addSafeWhiteKing(state, excluded);
  return { state, source, destination };
};

describe("three-player God catalog", () => {
  it("implements every catalog ability", () => {
    expect(unsupportedThreePlayerAbilities()).toEqual([]);
  });

  for (const god of GODS) {
    for (const ability of god.abilities) {
      it.each([1, 2, 3] as const)(
        `activates ${god.name} / ${ability.name} at level %i`,
        (level) => {
          let state: ThreePlayerState = abilityState(god.id, level);
          state = threePlayerReducer(state, {
            type: "select-god",
            godId: god.id,
          });
          const next = threePlayerReducer(state, {
            type: "select-ability",
            abilityId: ability.id,
          });
          expect(next).not.toBe(state);
          expect(
            next.selectedAbility === ability.id ||
            next.completedTurns.white > state.completedTurns.white,
          ).toBe(true);
        },
      );
    }
  }

  it.each(THREE_PLAYER_BOARD_VARIANTS)(
    "uses canonical diagonal and orthogonal adjacency for Slither on %s",
    (boardVariant) => {
      const setup = threePlayerSlitherSetup(boardVariant);
      let state = threePlayerReducer(setup.state, {
        type: "select-god",
        godId: "quetzacoatl",
      });
      state = threePlayerReducer(state, {
        type: "select-ability",
        abilityId: "flight",
      });
      state = threePlayerReducer(state, {
        type: "cell",
        cell: setup.source,
      });
      state = threePlayerReducer(state, {
        type: "cell",
        cell: setup.destination,
      });
      if (state.legalPaths.length) {
        state = threePlayerReducer(state, {
          type: "path",
          pathId: state.legalPaths[0],
        });
      }

      expect(state.players.white.orbs).toEqual({ light: 51, dark: 51 });
      expect(state.pending?.step).toBe("slither-orb");
      expect(availableThreePlayerActions(state)).toEqual([
        { type: "orb", orb: "light" },
        { type: "orb", orb: "dark" },
      ]);
      const resolved = threePlayerReducer(state, {
        type: "orb",
        orb: "dark",
      });
      expect(resolved.players.white.orbs).toEqual({ light: 51, dark: 52 });
    },
  );

  it("uses Serpentine Step in Medusa's three-player follow-up copy", () => {
    const state = abilityState("medusa", 1);
    const topology = getThreePlayerTopology(state.config.boardVariant);
    state.board = {};
    const source = topology.cells.find((cell) =>
      topology.diagonalNeighbors(cell).length > 0
    )!;
    const destination = topology.diagonalNeighbors(source)[0];
    state.board[source] = piece("medusa-queen", "queen", "white");
    addSafeWhiteKing(state, new Set([
      source,
      destination,
      ...topology.kingNeighbors(source),
      ...topology.kingNeighbors(destination),
    ]));

    let moved = threePlayerReducer(state, {
      type: "select-god",
      godId: "medusa",
    });
    moved = threePlayerReducer(moved, {
      type: "select-ability",
      abilityId: "slither",
    });
    moved = threePlayerReducer(moved, { type: "cell", cell: source });
    moved = threePlayerReducer(moved, { type: "cell", cell: destination });
    if (moved.legalPaths.length) {
      moved = threePlayerReducer(moved, {
        type: "path",
        pathId: moved.legalPaths[0],
      });
    }

    expect(moved.pending?.step).toBe("slither");
    expect(moved.notice).toMatch(/^Serpentine Step/);
    expect(moved.notice).not.toMatch(/^Slither/);
  });

  it("runs Enchant as hostile move then one ordinary controlled move", () => {
    let state = abilityState("teles", 1);
    state = threePlayerReducer(state, { type: "select-god", godId: "teles" });
    state = threePlayerReducer(state, {
      type: "select-ability",
      abilityId: "enchant",
    });

    expect(state.pending?.step).toBe("enchant-enemy-move");
    const sourceTypes = new Set(
      state.legalCells.map((cell) => state.board[cell]?.type),
    );
    expect(sourceTypes).toEqual(new Set(["pawn", "knight", "bishop"]));
    expect(state.legalCells.some((cell) => state.board[cell]?.type === "king")).toBe(false);

    const enemySource = state.legalCells.find(
      (cell) => state.board[cell]?.type === "knight",
    )!;
    const enchantedId = state.board[enemySource].id;
    const originalController = state.board[enemySource].controller;
    state = threePlayerReducer(state, { type: "cell", cell: enemySource });
    const enemyDestination = state.legalCells[0];
    state = threePlayerReducer(state, {
      type: "cell",
      cell: enemyDestination,
    });
    if (state.legalPaths.length) {
      state = threePlayerReducer(state, {
        type: "path",
        pathId: state.legalPaths[0],
      });
    }

    expect(state.pending?.step).toBe("enchant-followup-move");
    expect(hasCompleteThreePlayerTurn(state)).toBe(true);
    expect(Object.values(state.board).find((candidate) => candidate.id === enchantedId)?.controller)
      .toBe(originalController);
    expect(availableThreePlayerActions(state).every((action) => action.type === "cell"))
      .toBe(true);
    const committed = state;
    state = threePlayerReducer(state, {
      type: "select-god",
      godId: "teles",
    });
    state = threePlayerReducer(state, {
      type: "select-ability",
      abilityId: "lure",
    });
    expect(state).toEqual(committed);

    const followupSource = state.legalCells[0];
    state = threePlayerReducer(state, { type: "cell", cell: followupSource });
    const followupDestination = state.legalCells[0];
    state = threePlayerReducer(state, {
      type: "cell",
      cell: followupDestination,
    });
    if (state.legalPaths.length) {
      state = threePlayerReducer(state, {
        type: "path",
        pathId: state.legalPaths[0],
      });
    }

    expect(state.activeSeat).toBe("red");
    expect(state.rested).toContain("teles");
    expect(state.bonusTurn).toBeUndefined();
  });

  it("unlocks rook and queen Enchant sources only at levels 2 and 3", () => {
    const activate = (level: 1 | 2 | 3) => {
      let state = abilityState("teles", level);
      state = threePlayerReducer(state, {
        type: "select-god",
        godId: "teles",
      });
      return threePlayerReducer(state, {
        type: "select-ability",
        abilityId: "enchant",
      });
    };
    const types = (state: ThreePlayerState) =>
      new Set(state.legalCells.map((cell) => state.board[cell]?.type));

    expect(types(activate(1))).toEqual(new Set(["pawn", "knight", "bishop"]));
    expect(types(activate(2))).toEqual(new Set(["pawn", "knight", "bishop", "rook"]));
    expect(types(activate(3))).toEqual(new Set(["pawn", "knight", "bishop", "rook", "queen"]));
  });

  it("creates a unique Monument rook without duplicating a sacrificed pawn", () => {
    let state = createThreePlayerGame();
    for (const godId of [
      "anubis",
      "ares",
      "midas",
      "death",
      "salem",
      "chiron",
      "teles",
      "artemis",
      "medusa",
    ] as const) {
      state = threePlayerReducer(state, { type: "draft", godId });
    }
    state.players.white.orbs = { light: 50, dark: 50 };
    state = threePlayerReducer(state, {
      type: "select-god",
      godId: "anubis",
    });

    state = threePlayerReducer(state, {
      type: "select-ability",
      abilityId: "monument",
    });
    for (let index = 0; index < 3; index += 1) {
      const sacrifice = availableThreePlayerActions(state).find(
        (action) => action.type === "cell",
      );
      expect(sacrifice).toBeTruthy();
      state = threePlayerReducer(state, sacrifice!);
    }
    const base = availableThreePlayerActions(state).find(
      (action) => action.type === "cell",
    );
    expect(base).toBeTruthy();
    state = threePlayerReducer(state, base!);

    expect(() => prepareThreePlayerState(state)).not.toThrow();
    const ids = [
      ...Object.values(state.board).map((piece) => piece.id),
      ...Object.values(state.players).flatMap((player) =>
        player.graveyard.map(({ piece }) => piece.id)
      ),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    const monument = Object.values(state.board).find((piece) =>
      piece.id.startsWith("white-monument-")
    );
    expect(monument).toMatchObject({
      type: "rook",
      owner: "white",
      controller: "white",
    });
  });

  it.each([
    "three-player",
    "three-hexagonal",
    "triad",
    "three-half",
  ] as const)(
    "allows an Escort King onto a simultaneously vacated ally cell on %s",
    (boardVariant) => {
      let state = abilityState("leonidas", 1, boardVariant);
      const topology = getThreePlayerTopology(boardVariant);
      const enemyKings: ThreePlayerState["board"] = Object.fromEntries(
        Object.entries(state.board).filter(([, candidate]) =>
          candidate.type === "king" && candidate.owner !== "white"
        ),
      );
      const formation = topology.cells.flatMap((from) =>
        topology.kingTargets(from).map((to) => ({
          from,
          to,
          escortTo: topology.formationTransform(from, to, to),
        }))
      ).find(({ from, to, escortTo }) => {
        if (!escortTo || escortTo === from || escortTo === to) return false;
        const board: ThreePlayerState["board"] = {
          ...enemyKings,
          [from]: piece("white-king", "king", "white"),
          [to]: piece("white-escort", "rook", "white"),
        };
        return !board[escortTo] &&
          !threePlayerIsInCheck({ ...state, board }, "white");
      });
      expect(formation).toBeDefined();
      state.board = {
        ...enemyKings,
        [formation!.from]: piece("white-king", "king", "white"),
        [formation!.to]: piece("white-escort", "rook", "white"),
      };

      state = threePlayerReducer(state, {
        type: "select-god",
        godId: "leonidas",
      });
      state = threePlayerReducer(state, {
        type: "select-ability",
        abilityId: "escort",
      });
      state = threePlayerReducer(state, {
        type: "cell",
        cell: formation!.from,
      });
      state = threePlayerReducer(state, {
        type: "cell",
        cell: formation!.to,
      });

      expect(state.legalCells).toContain(formation!.to);
      state = threePlayerReducer(state, {
        type: "cell",
        cell: formation!.to,
      });
      expect(state.board[formation!.to]?.id).toBe("white-king");
      expect(state.board[formation!.escortTo!]?.id).toBe("white-escort");
    },
  );

  it("only offers Air Strike branches that retain a legal passenger drop", () => {
    let state = createThreePlayerGame();
    for (const godId of [
      "quetzacoatl",
      "ares",
      "midas",
      "death",
      "salem",
      "chiron",
      "teles",
      "artemis",
      "medusa",
    ] as const) {
      state = threePlayerReducer(state, { type: "draft", godId });
    }
    state.players.white.orbs = { light: 50, dark: 50 };
    state = threePlayerReducer(state, {
      type: "select-god",
      godId: "quetzacoatl",
    });
    state = threePlayerReducer(state, {
      type: "select-ability",
      abilityId: "air-strike",
    });
    const source = availableThreePlayerActions(state).find(
      (action) => action.type === "cell",
    );
    expect(source).toBeTruthy();
    state = threePlayerReducer(state, source!);
    const passenger = availableThreePlayerActions(state).find(
      (action) => action.type === "cell",
    );
    expect(passenger).toBeTruthy();
    state = threePlayerReducer(state, passenger!);
    const destinations = availableThreePlayerActions(state).filter(
      (action) => action.type === "cell",
    );
    expect(destinations.length).toBeGreaterThan(0);

    for (const destination of destinations) {
      const destinationState = threePlayerReducer(state, destination);
      const paths = availableThreePlayerActions(destinationState).filter(
        (action) => action.type === "path",
      );
      if (!paths.length) {
        expect(availableThreePlayerActions(destinationState).some(
          (action) => action.type === "cell",
        )).toBe(true);
        continue;
      }
      for (const path of paths) {
        const dropState = threePlayerReducer(destinationState, path);
        expect(availableThreePlayerActions(dropState).some(
          (action) => action.type === "cell",
        )).toBe(true);
      }
    }
  });

  it("lets Hex target hostile living Kings without allowing their capture", () => {
    for (const level of [1, 2, 3] as const) {
      let state = abilityState("salem", level);
      const topology = getThreePlayerTopology(state.config.boardVariant);
      const destination = topology.cells.find((cell) =>
        topology.rookRays(cell).filter((ray) => ray.cells.length).length >= 2
      )!;
      const rays = topology.rookRays(destination)
        .filter((ray) => ray.cells.length);
      const source = rays[0].cells[0];
      const targetKing = rays[1].cells[0];
      state.board = {
        [source]: piece("hex-mover", "rook", "white"),
        [targetKing]: piece("red-king", "king", "red"),
      };
      const whiteKing = addSafeWhiteKing(
        state,
        new Set([source, destination, targetKing]),
      );

      state = threePlayerReducer(state, {
        type: "select-god",
        godId: "salem",
      });
      state = threePlayerReducer(state, {
        type: "select-ability",
        abilityId: "hex",
      });
      expect(state.legalCells).toContain(targetKing);
      expect(state.legalCells).not.toContain(whiteKing);

      state = threePlayerReducer(state, { type: "cell", cell: targetKing });
      expect(state.board[targetKing].status.hexedBy).toBe("white");
      if (level > 1) state = threePlayerReducer(state, { type: "pass" });

      const orbsBeforeMove =
        state.players.white.orbs.light + state.players.white.orbs.dark;
      state = threePlayerReducer(state, { type: "cell", cell: source });
      expect(state.legalCells).toContain(destination);
      expect(state.legalCells).not.toContain(targetKing);
      state = threePlayerReducer(state, { type: "cell", cell: destination });
      if (state.legalPaths.length) {
        state = threePlayerReducer(state, {
          type: "path",
          pathId: state.legalPaths[0],
        });
      }

      expect(
        state.players.white.orbs.light + state.players.white.orbs.dark,
      ).toBe(orbsBeforeMove + 2);
      expect(state.board[targetKing]).toMatchObject({
        type: "king",
        status: { hexedBy: "white" },
      });
    }

    let filtered = abilityState("salem", 1);
    const inert = Object.entries(filtered.board).find(([, candidate]) =>
      candidate.controller === "red" && candidate.type === "pawn"
    )!;
    inert[1].controller = null;
    const duplicate = Object.entries(filtered.board).find(([, candidate]) =>
      candidate.controller === "black" && candidate.type === "pawn"
    )!;
    duplicate[1].status.hexedBy = "red";
    filtered.players.red.eliminated = true;
    filtered = threePlayerReducer(filtered, {
      type: "select-god",
      godId: "salem",
    });
    filtered = threePlayerReducer(filtered, {
      type: "select-ability",
      abilityId: "hex",
    });
    expect(filtered.legalCells).not.toContain(inert[0]);
    expect(filtered.legalCells).not.toContain(duplicate[0]);
    expect(filtered.legalCells).not.toEqual(expect.arrayContaining(
      Object.entries(filtered.board)
        .filter(([, candidate]) => candidate.controller === "red")
        .map(([cell]) => cell),
    ));
  });

  it("awards neutral-cell affinity rewards from the current global turn", () => {
    const neutralCell = getThreePlayerTopology("triad").cellDescriptors.find(
      (cell) => cell.geometricClass === 2,
    )!.id;

    for (const [turn, expected] of [[1, "light"], [2, "dark"]] as const) {
      const state = abilityState("midas", 2, "triad");
      state.turn = turn;
      state.selectedGod = "midas";
      state.selectedAbility = "barter";
      state.pending = {
        godId: "midas",
        abilityId: "barter",
        step: "barter-orb",
        destination: neutralCell,
        targetSeat: "red",
      };
      state.players.red.orbs.dark = 5;

      const next = threePlayerReducer(state, { type: "orb", orb: "light" });

      expect(next.orbEvents.at(-1)).toMatchObject({
        orb: expected,
        source: neutralCell,
      });
    }
  });

  it("keeps Kings out of ranged Prepared Shot targets", () => {
    const state = abilityState("artemis", 2);
    const topology = getThreePlayerTopology(state.config.boardVariant);
    const origin = topology.cells.find((cell) =>
      topology.rookRays(cell).filter((ray) => ray.cells.length).length >= 2
    )!;
    const rays = topology.rookRays(origin).filter((ray) => ray.cells.length);
    const kingCell = rays[0].cells[0];
    const pawnCell = rays[1].cells[0];
    state.board = {
      [origin]: {
        ...piece("prepared-rook", "rook", "white"),
        status: {
          prepared: { owner: "white", level: 2 },
        },
      },
      [kingCell]: piece("red-king", "king", "red"),
      [pawnCell]: piece("black-pawn", "pawn", "black"),
    };
    addSafeWhiteKing(state);
    state.pending = {
      godId: "artemis",
      abilityId: "snipe-shot",
      step: "snipe-source",
    };
    state.legalCells = [origin];

    const targeted = threePlayerReducer(state, { type: "cell", cell: origin });
    expect(targeted.legalCells).toContain(pawnCell);
    expect(targeted.legalCells).not.toContain(kingCell);
    expect(targeted.board[kingCell]?.type).toBe("king");
  });

  it("preserves adjacent Kings while Rage destroys hostile and friendly pieces", () => {
    let state = abilityState("kangus", 2);
    const topology = getThreePlayerTopology(state.config.boardVariant);
    const center = topology.cells.find((cell) =>
      topology.kingNeighbors(cell).length >= 3
    )!;
    const [kingCell, friendlyCell, hostileCell] = topology.kingNeighbors(center);
    state.board = {
      [center]: piece("center", "pawn", "black"),
      [kingCell]: piece("red-king", "king", "red"),
      [friendlyCell]: piece("white-pawn", "pawn", "white"),
      [hostileCell]: piece("black-pawn", "pawn", "black"),
    };
    addSafeWhiteKing(state);
    state = threePlayerReducer(state, {
      type: "select-god",
      godId: "kangus",
    });
    state = threePlayerReducer(state, {
      type: "select-ability",
      abilityId: "rage",
    });
    state = threePlayerReducer(state, { type: "cell", cell: center });
    state = threePlayerReducer(state, { type: "choice", value: false });

    expect(state.board[kingCell]?.type).toBe("king");
    expect(state.board[friendlyCell]).toBeUndefined();
    expect(state.board[hostileCell]).toBeUndefined();
  });

  it("excludes King squares from level-three Resurrection replacement", () => {
    let state = abilityState("death", 3);
    const topology = getThreePlayerTopology(state.config.boardVariant);
    const bishopCell = topology.cells.find((cell) =>
      topology.kingNeighbors(cell).length >= 3
    )!;
    const [kingCell, pawnCell, emptyCell] = topology.kingNeighbors(bishopCell);
    state.board = {
      [bishopCell]: piece("white-bishop", "bishop", "white"),
      [kingCell]: piece("red-king", "king", "red"),
      [pawnCell]: piece("black-pawn", "pawn", "black"),
    };
    state = threePlayerReducer(state, {
      type: "select-god",
      godId: "death",
    });
    state = threePlayerReducer(state, {
      type: "select-ability",
      abilityId: "resurrect",
    });
    const grave = availableThreePlayerActions(state).find(
      (action) => action.type === "grave",
    )!;
    state = threePlayerReducer(state, grave);

    expect(state.legalCells).toContain(pawnCell);
    expect(state.legalCells).toContain(emptyCell);
    expect(state.legalCells).not.toContain(kingCell);
  });

  it("excludes a crossed King from Air Strike drop targets", () => {
    let state = abilityState("quetzacoatl", 2);
    const topology = getThreePlayerTopology(state.config.boardVariant);
    const setup = topology.cells.flatMap((origin) =>
      topology.rookRays(origin)
        .filter((ray) => ray.cells.length >= 2)
        .map((ray) => ({ origin, ray }))
    ).find(({ origin, ray }) =>
      topology.kingNeighbors(origin).some((cell) =>
        cell !== ray.cells[0] && cell !== ray.cells.at(-1)
      )
    )!;
    const destination = setup.ray.cells.at(-1)!;
    const kingCell = setup.ray.cells[0];
    const passengerCell = topology.kingNeighbors(setup.origin).find((cell) =>
      !setup.ray.cells.includes(cell)
    )!;
    state.board = {
      [setup.origin]: piece("carrier", "rook", "white"),
      [passengerCell]: piece("passenger", "pawn", "white"),
      [kingCell]: piece("red-king", "king", "red"),
    };
    addSafeWhiteKing(state, new Set(setup.ray.cells));
    state = threePlayerReducer(state, {
      type: "select-god",
      godId: "quetzacoatl",
    });
    state = threePlayerReducer(state, {
      type: "select-ability",
      abilityId: "air-strike",
    });
    state = threePlayerReducer(state, {
      type: "cell",
      cell: setup.origin,
    });
    state = threePlayerReducer(state, {
      type: "cell",
      cell: passengerCell,
    });
    expect(state.legalCells).toContain(destination);
    state = threePlayerReducer(state, {
      type: "cell",
      cell: destination,
    });
    const path = availableThreePlayerActions(state).find(
      (action) =>
        action.type === "path" && action.pathId === setup.ray.id,
    );
    if (path) state = threePlayerReducer(state, path);

    expect(state.pending?.step).toBe("air-strike-drop");
    expect(state.legalCells).not.toContain(kingCell);
    expect(state.board[kingCell]?.type).toBe("king");
  });

  it("finishes Mount when placing a rider consumes the final destination", () => {
    const state = abilityState("chiron", 3);
    const topology = getThreePlayerTopology(state.config.boardVariant);
    const destination = topology.cells.find((cell) =>
      topology.orthogonalNeighbors(cell).length >= 2
    )!;
    const [placement, ...blocked] = topology.orthogonalNeighbors(destination);
    const source = topology.cells.find((cell) =>
      cell !== destination &&
      !topology.orthogonalNeighbors(destination).includes(cell) &&
      topology.orthogonalNeighbors(cell).length >= 2 &&
      topology.orthogonalNeighbors(cell).every((candidate) =>
        candidate !== destination &&
        candidate !== placement &&
        !blocked.includes(candidate)
      )
    )!;
    const [riderCell, remainingCell] = topology.orthogonalNeighbors(source);
    const whiteKingCell = topology.cells.find((cell) =>
      cell !== destination &&
      cell !== source &&
      cell !== placement &&
      !blocked.includes(cell) &&
      cell !== riderCell &&
      cell !== remainingCell
    )!;
    state.board = {
      [destination]: piece("mount", "knight", "white"),
      ...Object.fromEntries(blocked.map((cell, index) => [
        cell,
        piece(`destination-blocker-${index}`, "pawn", "black"),
      ])),
      [riderCell]: piece("moving-rider", "bishop", "white"),
      [remainingCell]: piece("remaining-rider", "rook", "white"),
      [whiteKingCell]: piece("white-king", "king", "white"),
    };
    state.selectedGod = "chiron";
    state.selectedAbility = "mount";
    state.pending = {
      godId: "chiron",
      abilityId: "mount",
      step: "mount-place",
      source,
      destination,
      selected: [],
      movedPieceId: "moving-rider",
    };
    state.legalCells = [placement];

    const finished = threePlayerReducer(state, {
      type: "cell",
      cell: placement,
    });
    expect(finished.pending).toBeUndefined();
    expect(finished.completedTurns.white).toBe(1);
  });

  it("rejects non-Knight Mount sources and stale non-Knight pending states", () => {
    let state = abilityState("chiron", 1);
    state = threePlayerReducer(state, { type: "select-god", godId: "chiron" });
    state = threePlayerReducer(state, { type: "select-ability", abilityId: "mount" });
    const pawnCell = Object.entries(state.board).find(([, candidate]) =>
      candidate.controller === "white" && candidate.type === "pawn"
    )![0];

    const rejected = threePlayerReducer(state, { type: "cell", cell: pawnCell });
    expect(rejected.selectedCell).toBeUndefined();
    expect(rejected.legalCells).toEqual([]);

    const topology = getThreePlayerTopology(state.config.boardVariant);
    const destination = topology.cells.find((cell) =>
      topology.orthogonalNeighbors(cell).length > 0
    )!;
    const rider = topology.orthogonalNeighbors(destination)[0];
    const forged = structuredClone(state);
    forged.board = {
      [destination]: piece("forged-primary", "pawn", "white"),
      [rider]: piece("forged-rider", "bishop", "white"),
    };
    addSafeWhiteKing(forged, new Set([destination, rider]));
    forged.pending = {
      godId: "chiron",
      abilityId: "mount",
      step: "mount-rider",
      source: pawnCell,
      destination,
      selected: [],
    };
    forged.legalCells = [rider];

    expect(threePlayerReducer(forged, { type: "cell", cell: rider })).toEqual(forged);
    expect(threePlayerReducer(forged, { type: "pass" })).toEqual(forged);
  });

  it("does not offer a second Resurrection without a legal placement", () => {
    let state = abilityState("death", 2);
    const topology = getThreePlayerTopology(state.config.boardVariant);
    const bishopCell = topology.cells.find((cell) =>
      topology.kingNeighbors(cell).length >= 2
    )!;
    const [opening, ...blocked] = topology.kingNeighbors(bishopCell);
    const whiteKingCell = topology.cells.find((cell) =>
      cell !== bishopCell &&
      cell !== opening &&
      !blocked.includes(cell)
    )!;
    state.board = {
      [bishopCell]: piece("white-bishop", "bishop", "white"),
      [whiteKingCell]: piece("white-king", "king", "white"),
      ...Object.fromEntries(blocked.map((cell, index) => [
        cell,
        piece(`blocker-${index}`, "pawn", "white"),
      ])),
    };
    state.players.white.graveyard.push({
      piece: piece("second-grave", "rook", "white"),
      capturedOnTurn: 0,
    });
    state = threePlayerReducer(state, {
      type: "select-god",
      godId: "death",
    });
    state = threePlayerReducer(state, {
      type: "select-ability",
      abilityId: "resurrect",
    });
    const grave = availableThreePlayerActions(state).find(
      (action) => action.type === "grave",
    )!;
    state = threePlayerReducer(state, grave);
    state = threePlayerReducer(state, { type: "cell", cell: opening });

    expect(state.pending).toBeUndefined();
    expect(state.completedTurns.white).toBe(1);
  });

  it("keeps God-call expiry and counters reversible until ability activation", () => {
    let artemis = abilityState("artemis", 2);
    const prepared = Object.values(artemis.board).find((candidate) =>
      candidate.controller === "white" && candidate.type !== "king"
    )!;
    prepared.status.prepared = { owner: "white", level: 2 };
    artemis.godTurns!.white.artemis = 4;
    artemis = threePlayerReducer(artemis, {
      type: "select-god",
      godId: "artemis",
    });
    expect(
      Object.values(artemis.board).find((candidate) =>
        candidate.id === prepared.id
      )?.status.prepared,
    ).toBeTruthy();
    expect(artemis.godTurns!.white.artemis).toBe(4);
    artemis = threePlayerReducer(artemis, { type: "clear-god" });
    expect(
      Object.values(artemis.board).find((candidate) =>
        candidate.id === prepared.id
      )?.status.prepared,
    ).toBeTruthy();
    expect(artemis.godTurns!.white.artemis).toBe(4);

    artemis = threePlayerReducer(artemis, {
      type: "select-god",
      godId: "artemis",
    });
    artemis = threePlayerReducer(artemis, {
      type: "select-ability",
      abilityId: "take-cover",
    });
    expect(
      Object.values(artemis.board).find((candidate) =>
        candidate.id === prepared.id
      )?.status.prepared,
    ).toBeUndefined();
    expect(artemis.godTurns!.white.artemis).toBe(5);

    let kangus = abilityState("kangus", 1);
    kangus.bananas = [{
      cell: Object.keys(kangus.board)[0],
      owner: "white",
      expires: "kangus",
    }];
    kangus.godTurns!.white.kangus = 2;
    kangus = threePlayerReducer(kangus, {
      type: "select-god",
      godId: "kangus",
    });
    kangus = threePlayerReducer(kangus, { type: "clear-god" });
    expect(kangus.bananas).toHaveLength(1);
    expect(kangus.godTurns!.white.kangus).toBe(2);
  });

  it("preserves circular route identity through blockers and bananas", () => {
    const topology = getThreePlayerTopology("three-circular");
    const setup = topology.cells.flatMap((origin) =>
      topology.cells.map((destination) => ({
        origin,
        destination,
        paths: topology.paths(origin, destination, "rook"),
      }))
    ).find(({ paths }) =>
      paths.length >= 2 &&
      paths[0].cells.slice(0, -1).some((cell) =>
        !paths[1].cells.includes(cell)
      ) &&
      paths[1].cells.slice(0, -1).some((cell) =>
        !paths[0].cells.includes(cell)
      )
    )!;
    const firstCell = setup.paths[0].cells.slice(0, -1).find((cell) =>
      !setup.paths[1].cells.includes(cell)
    )!;
    const secondCell = setup.paths[1].cells.slice(0, -1).find((cell) =>
      !setup.paths[0].cells.includes(cell)
    )!;
    const kingCell = topology.cells.find((cell) =>
      cell !== setup.origin &&
      cell !== setup.destination &&
      !setup.paths.some((path) => path.cells.includes(cell))
    )!;

    const start = (bananaCell?: string, blockerCell?: string) => {
      let state = abilityState("chiron", 1, "three-circular");
      state.board = {
        [setup.origin]: piece("route-rook", "rook", "white"),
        [kingCell]: piece("white-king", "king", "white"),
        ...(blockerCell
          ? { [blockerCell]: piece("route-blocker", "pawn", "black") }
          : {}),
      };
      state.bananas = bananaCell
        ? [{ cell: bananaCell, owner: "red", expires: "god" }]
        : [];
      state = threePlayerReducer(state, {
        type: "select-god",
        godId: "chiron",
      });
      state = threePlayerReducer(state, {
        type: "select-ability",
        abilityId: "gallop",
      });
      state = threePlayerReducer(state, {
        type: "cell",
        cell: setup.origin,
      });
      return threePlayerReducer(state, {
        type: "cell",
        cell: setup.destination,
      });
    };

    let state = start(firstCell);
    expect(state.legalPaths).toEqual(expect.arrayContaining([
      setup.paths[0].traceId,
      setup.paths[1].traceId,
    ]));
    state = threePlayerReducer(state, {
      type: "path",
      pathId: setup.paths[1].traceId,
    });
    expect(state.board[setup.destination]?.id).toBe("route-rook");
    expect(state.bananas?.some((banana) => banana.cell === firstCell)).toBe(true);

    state = start(firstCell);
    state = threePlayerReducer(state, {
      type: "path",
      pathId: setup.paths[0].traceId,
    });
    expect(state.board[firstCell]?.id).toBe("route-rook");
    expect(state.bananas?.some((banana) => banana.cell === firstCell)).toBe(false);

    state = start(firstCell, firstCell);
    expect(state.legalPaths).toEqual([]);
    expect(state.board[setup.destination]?.id).toBe("route-rook");
    expect(state.board[firstCell]?.id).toBe("route-blocker");
    expect(secondCell).toBeTruthy();
  });

  it.each(["three-player", "three-half"] as const)(
    "requires an explicit trace for ambiguous %s movement",
    (boardVariant) => {
      const topology = getThreePlayerTopology(boardVariant);
      const setup = topology.cells.flatMap((origin) =>
        topology.cells.map((destination) => ({
          origin,
          destination,
          paths: [
            ...topology.paths(origin, destination, "rook"),
            ...topology.paths(origin, destination, "bishop"),
          ],
        }))
      ).find(({ paths }) =>
        new Set(paths.map((path) => path.traceId)).size >= 2 &&
        paths.every((path) =>
          path.cells.slice(0, -1).every((cell) =>
            paths.every((candidate) =>
              candidate.traceId === path.traceId ||
              cell !== candidate.destination
            )
          )
        )
      );
      expect(setup).toBeTruthy();
      let state = abilityState("chiron", 1, boardVariant);
      state.board = {
        [setup!.origin]: piece("trace-queen", "queen", "white"),
        [topology.cells.find((cell) =>
          cell !== setup!.origin &&
          cell !== setup!.destination &&
          !setup!.paths.some((path) => path.cells.includes(cell))
        )!]: piece("white-king", "king", "white"),
      };
      state = threePlayerReducer(state, {
        type: "select-god",
        godId: "chiron",
      });
      state = threePlayerReducer(state, {
        type: "select-ability",
        abilityId: "gallop",
      });
      state = threePlayerReducer(state, {
        type: "cell",
        cell: setup!.origin,
      });
      state = threePlayerReducer(state, {
        type: "cell",
        cell: setup!.destination,
      });
      expect(state.pending?.step).toBe("path-choice");
      expect(state.legalPaths!.length).toBeGreaterThan(1);
    },
  );
});
