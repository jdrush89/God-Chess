import { describe, expect, it } from "vitest";
import { createDefaultThreePlayerConfig } from "./threePlayerConfig";
import { threePlayerIsInCheck } from "./threePlayerChess";
import {
  canStartThreePlayerMoveFirst,
  createThreePlayerGame,
  threePlayerMoveFirstCandidates,
  threePlayerMoveFirstSources,
  threePlayerMoveFirstTargets,
  threePlayerReducer,
} from "./threePlayerEngine";
import { prepareThreePlayerState } from "./threePlayerPersistence";
import { GODS } from "./gods";
import { getThreePlayerTopology } from "./threePlayerTopology";
import {
  THREE_PLAYER_BOARD_VARIANTS,
  type ThreePlayerAction,
  type ThreePlayerBoardVariant,
  type ThreePlayerPiece,
  type ThreePlayerState,
} from "./threePlayerTypes";

const piece = (
  id: string,
  type: ThreePlayerPiece["type"],
  owner: ThreePlayerPiece["owner"],
  controller: ThreePlayerPiece["controller"] = owner,
): ThreePlayerPiece => ({
  id,
  type,
  owner,
  controller,
  hasMoved: false,
  status: {},
});

const addSafeKing = (
  state: ThreePlayerState,
  seat: ThreePlayerPiece["owner"],
  excluded = new Set<string>(),
) => {
  const topology = getThreePlayerTopology(state.config.boardVariant);
  for (const cell of topology.cells) {
    if (state.board[cell] || excluded.has(cell)) continue;
    state.board[cell] = piece(`${seat}-king`, "king", seat);
    if (!threePlayerIsInCheck(state, seat)) return cell;
    delete state.board[cell];
  }
  throw new Error(`No safe ${seat} King cell found.`);
};

const playableState = (
  godId: (typeof GODS)[number]["id"],
  level: 1 | 2 | 3 = 1,
  boardVariant: ThreePlayerBoardVariant = "three-player",
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
  const abilityId = GODS.find((god) => god.id === godId)!.abilities[0].id;
  state.players.white.upgrades[abilityId] = level;
  if (godId === "salem") {
    const hostile = Object.values(state.board).find(
      (piece) => piece.controller === "red",
    );
    if (hostile) hostile.status.hexedBy = "white";
  }
  return state;
};

const firstMove = (state: ThreePlayerState) => {
  const from = threePlayerMoveFirstSources(state)[0];
  const to = from
    ? threePlayerMoveFirstTargets(state, from)[0]
    : undefined;
  if (!from || !to) throw new Error("Expected an ordinary move-first move.");
  return { from, to };
};

const finishPathChoice = (state: ThreePlayerState) =>
  state.pending?.step === "path-choice" && state.legalPaths[0]
    ? threePlayerReducer(state, {
      type: "path",
      pathId: state.legalPaths[0],
    })
    : state;

const moveFirst = (
  state: ThreePlayerState,
  godId: (typeof GODS)[number]["id"],
  move = firstMove(state),
) => finishPathChoice(threePlayerReducer(state, {
  type: "commit-move-first",
  godId,
  abilityId: GODS.find((god) => god.id === godId)!.abilities[0].id,
  move,
  expectedSeat: state.activeSeat,
  expectedTurn: state.turn,
  expectedRevision: state.revision,
}));

const godFirst = (
  state: ThreePlayerState,
  godId: (typeof GODS)[number]["id"],
  move = firstMove(state),
) => {
  let next = threePlayerReducer(state, { type: "select-god", godId });
  next = threePlayerReducer(next, {
    type: "select-ability",
    abilityId: GODS.find((god) => god.id === godId)!.abilities[0].id,
  });
  next = threePlayerReducer(next, { type: "cell", cell: move.from });
  next = threePlayerReducer(next, { type: "cell", cell: move.to });
  return finishPathChoice(next);
};

const semanticState = (state: ThreePlayerState) => {
  const snapshot = structuredClone(state);
  snapshot.revision = 0;
  return snapshot;
};

describe("three-player move-first contracts", () => {
  it.each(THREE_PLAYER_BOARD_VARIANTS)(
    "uses topology-aware ordinary sources and targets on %s",
    (boardVariant) => {
      const state = playableState("quetzacoatl", 1, boardVariant);
      expect(canStartThreePlayerMoveFirst(state)).toBe(true);
      const sources = threePlayerMoveFirstSources(state);
      expect(sources.length).toBeGreaterThan(0);
      expect(sources.every((source) =>
        threePlayerMoveFirstTargets(state, source).length > 0
      )).toBe(true);
    },
  );

  it.each(THREE_PLAYER_BOARD_VARIANTS)(
    "gives all 12 first abilities the same ordinary reach on %s",
    (boardVariant) => {
      const state = playableState("quetzacoatl", 1, boardVariant);
      state.players.white.gods = GODS.map((god) => god.id);
      const hostile = Object.values(state.board).find(
        (piece) => piece.controller === "red",
      );
      if (hostile) hostile.status.hexedBy = "white";
      const source = firstMove(state).from;
      const expected = threePlayerMoveFirstTargets(state, source).sort();
      for (const god of GODS) {
        let selected = threePlayerReducer(state, {
          type: "select-god",
          godId: god.id,
        });
        selected = threePlayerReducer(selected, {
          type: "select-ability",
          abilityId: god.abilities[0].id,
        });
        expect(selected.pending?.step).toBe("source");
        selected = threePlayerReducer(selected, {
          type: "cell",
          cell: source,
        });
        expect([...selected.legalCells].sort(), god.name).toEqual(expected);
      }
    },
  );

  it.each(GODS.map((god, index) => [
    god.name,
    god.id,
    (index % 3 + 1) as 1 | 2 | 3,
  ] as const))(
    "matches the canonical %s (%s) first ability at level %i",
    (_name, godId, level) => {
      const state = playableState(godId, level);
      const move = firstMove(state);
      expect(semanticState(moveFirst(state, godId, move))).toEqual(
        semanticState(godFirst(state, godId, move)),
      );
    },
  );

  it("previews exact immediate deltas without mutating state", () => {
    const state = playableState("quetzacoatl", 3);
    state.players.white.gods = GODS.map((god) => god.id);
    state.players.white.orbs = { light: 7, dark: 9 };
    const move = firstMove(state);
    const snapshot = structuredClone(state);
    const candidates = threePlayerMoveFirstCandidates(state, move);

    expect(state).toEqual(snapshot);
    expect(candidates).toHaveLength(GODS.length);
    for (const candidate of candidates) {
      const next = threePlayerReducer(state, {
        type: "commit-move-first",
        godId: candidate.godId,
        abilityId: candidate.abilityId,
        move,
        expectedSeat: state.activeSeat,
        expectedTurn: state.turn,
        expectedRevision: state.revision,
      });
      expect(candidate.immediateOrbDelta).toEqual({
        light: next.players.white.orbs.light - state.players.white.orbs.light,
        dark: next.players.white.orbs.dark - state.players.white.orbs.dark,
      });
    }
  });

  it("uses each snake piece's owner affinity with mixed controllers and Red alternation", () => {
    const state = playableState("quetzacoatl", 3, "triad");
    state.activeSeat = "red";
    state.players.red.gods = ["quetzacoatl"];
    state.players.red.upgrades.flight = 3;
    state.board = {};
    const topology = getThreePlayerTopology("triad");
    const destination = topology.cells.find((cell) =>
      topology.orthogonalNeighbors(cell).length > 0 &&
      topology.diagonalNeighbors(cell).length > 0
    )!;
    const source = topology.orthogonalNeighbors(destination)[0];
    const darkLink = topology.diagonalNeighbors(destination)[0];
    state.board[source] = piece("red-mover", "rook", "red");
    state.board[darkLink] = piece(
      "black-owned-red-controlled",
      "pawn",
      "black",
      "red",
    );
    addSafeKing(state, "red", new Set([
      source,
      destination,
      darkLink,
      ...topology.kingNeighbors(destination),
      ...topology.kingNeighbors(darkLink),
    ]));

    const lightRed = threePlayerMoveFirstCandidates(state, {
      from: source,
      to: destination,
    }).find((candidate) => candidate.godId === "quetzacoatl");
    expect(lightRed?.immediateOrbDelta).toEqual({ light: 1, dark: 1 });

    state.completedTurns.red = 1;
    const darkRed = threePlayerMoveFirstCandidates(state, {
      from: source,
      to: destination,
    }).find((candidate) => candidate.godId === "quetzacoatl");
    expect(darkRed?.immediateOrbDelta).toEqual({ light: 0, dark: 2 });
  });

  it("previews Hex rewards with the live alternating neutral-cell affinity", () => {
    const state = playableState("salem", 1, "triad");
    state.activeSeat = "red";
    state.players.red.gods = ["salem"];
    state.board = {};
    const topology = getThreePlayerTopology("triad");
    const destination = topology.cellDescriptors.find((descriptor) =>
      descriptor.geometricClass === 2 &&
      topology.orthogonalNeighbors(descriptor.id).length >= 2
    )!.id;
    const [source, hexCell] = topology.orthogonalNeighbors(destination);
    state.board[source] = piece("red-mover", "rook", "red");
    state.board[hexCell] = {
      ...piece("white-hex", "pawn", "white"),
      status: { hexedBy: "red" },
    };
    addSafeKing(state, "red", new Set([
      source,
      destination,
      hexCell,
      ...topology.kingNeighbors(hexCell),
    ]));

    const lightCell = threePlayerMoveFirstCandidates(state, {
      from: source,
      to: destination,
    }).find((candidate) => candidate.godId === "salem");
    expect(lightCell?.immediateOrbDelta).toEqual({ light: 2, dark: 0 });

    state.turn = 2;
    const darkCell = threePlayerMoveFirstCandidates(state, {
      from: source,
      to: destination,
    }).find((candidate) => candidate.godId === "salem");
    expect(darkCell?.immediateOrbDelta).toEqual({ light: 0, dark: 2 });
  });

  it("uses canonical God order and excludes resting Gods", () => {
    const state = playableState("death");
    state.players.white.gods = ["death", "anubis", "kangus"];
    state.rested = ["anubis"];
    expect(threePlayerMoveFirstCandidates(state, firstMove(state))
      .map((candidate) => candidate.godId)).toEqual(["kangus", "death"]);
  });

  it("ignores Charge movement modifiers in provisional ordinary reach", () => {
    const state = playableState("chiron");
    const knight = Object.entries(state.board).find(([, piece]) =>
      piece.controller === "white" && piece.type === "knight"
    );
    expect(knight).toBeTruthy();
    knight![1].status.chargeUntil = "god";
    const ordinary = threePlayerMoveFirstTargets(state, knight![0]);
    const selected = threePlayerReducer(
      threePlayerReducer(state, { type: "select-god", godId: "chiron" }),
      { type: "select-ability", abilityId: "gallop" },
    );
    const withAbility = threePlayerReducer(selected, {
      type: "cell",
      cell: knight![0],
    });
    expect(withAbility.legalCells.sort()).toEqual(ordinary.sort());
  });

  it("queues Hex setup canonically, survives load, and executes the exact move", () => {
    let state = createThreePlayerGame();
    for (const god of GODS.slice(0, 9)) {
      state = threePlayerReducer(state, { type: "draft", godId: god.id });
    }
    state.players.white.gods = ["salem", "quetzacoatl", "chiron"];
    state.players.red.gods = ["anubis", "teles", "artemis"];
    state.players.black.gods = ["kangus", "death", "leonidas"];
    state.draft.unused = ["medusa", "midas", "ares"];
    for (const piece of Object.values(state.board)) {
      delete piece.status.hexedBy;
    }
    const move = firstMove(state);
    const board = structuredClone(state.board);
    const queued = threePlayerReducer(state, {
      type: "commit-move-first",
      godId: "salem",
      abilityId: "hex",
      move,
      expectedSeat: "white",
      expectedTurn: state.turn,
      expectedRevision: state.revision,
    });

    expect(queued.board).toEqual(board);
    expect(queued.pending).toMatchObject({
      godId: "salem",
      abilityId: "hex",
      step: "hex-target",
      queuedMove: {
        ...move,
        actor: "white",
        turn: state.turn,
        revision: state.revision,
        pieceId: state.board[move.from].id,
      },
    });
    const loaded = prepareThreePlayerState(structuredClone(queued));
    const target = loaded.legalCells[0];
    const completed = threePlayerReducer(loaded, { type: "cell", cell: target });
    expect(completed.board[move.from]?.id).not.toBe(
      state.board[move.from].id,
    );
    expect(completed.board[move.to]?.id).toBe(state.board[move.from].id);
    expect(completed.pending?.queuedMove).toBeUndefined();
  });

  it("rejects stale, wrong-seat, mismatched, and unavailable commits", () => {
    const state = playableState("anubis");
    const move = firstMove(state);
    const base: Extract<
      ThreePlayerAction,
      { type: "commit-move-first" }
    > = {
      type: "commit-move-first",
      godId: "anubis",
      abilityId: "construction",
      move,
      expectedSeat: "white",
      expectedTurn: state.turn,
      expectedRevision: state.revision,
    };
    expect(threePlayerReducer(state, {
      ...base,
      expectedSeat: "red",
    })).toBe(state);
    expect(threePlayerReducer(state, {
      ...base,
      expectedRevision: state.revision + 1,
    })).toBe(state);
    expect(threePlayerReducer(state, {
      ...base,
      abilityId: "hex",
    })).toBe(state);
    const resting = structuredClone(state);
    resting.rested = ["anubis"];
    expect(threePlayerReducer(resting, base)).toBe(resting);
  });
});
