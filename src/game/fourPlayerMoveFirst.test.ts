import { describe, expect, it } from "vitest";
import { createDefaultFourPlayerConfig } from "./fourPlayerConfig";
import { fourPlayerLegalTargets } from "./fourPlayerChess";
import {
  availableFourPlayerActions,
  canStartFourPlayerMoveFirst,
  createFourPlayerGame,
  fourPlayerMoveFirstBoardIdentity,
  fourPlayerMoveFirstCandidates,
  fourPlayerMoveFirstSources,
  fourPlayerMoveFirstTargets,
  fourPlayerReducer,
} from "./fourPlayerEngine";
import {
  isFourPlayerState,
  prepareFourPlayerState,
} from "./fourPlayerPersistence";
import { GODS } from "./gods";
import type {
  FourPlayerAction,
  FourPlayerConfig,
  FourPlayerPiece,
  FourPlayerState,
  Seat,
} from "./fourPlayerTypes";

const piece = (
  state: FourPlayerState,
  id: string,
  type: FourPlayerPiece["type"],
  owner: Seat,
  controller: Seat | null = owner,
): FourPlayerPiece => ({
  id,
  type,
  owner,
  controller,
  displayColor: state.config.seats[owner].displayColor,
  orbAffinity: state.config.seats[owner].orbAffinity,
  hasMoved: false,
  status: {},
});

const playableState = (
  godId: (typeof GODS)[number]["id"],
  level: 1 | 2 | 3 = 1,
  config: FourPlayerConfig = createDefaultFourPlayerConfig(),
) => {
  const state = createFourPlayerGame(config);
  state.phase = "play";
  state.activeSeat = config.startingSeat;
  state.players[state.activeSeat].gods = [godId];
  state.players[state.activeSeat].orbs = { light: 50, dark: 50 };
  const abilityId = GODS.find((god) => god.id === godId)!.abilities[0].id;
  state.players[state.activeSeat].upgrades[abilityId] = level;
  if (godId === "salem") {
    const hostile = Object.values(state.board).find(
      (candidate) =>
        candidate.controller &&
        candidate.controller !== state.activeSeat,
    );
    if (hostile) hostile.status.hexedBy = state.activeSeat;
  }
  return state;
};

const firstMove = (state: FourPlayerState) => {
  const from = fourPlayerMoveFirstSources(state)[0];
  const to = from ? fourPlayerMoveFirstTargets(state, from)[0] : undefined;
  if (!from || !to) throw new Error("Expected an ordinary move-first move.");
  return { from, to };
};

const moveFirst = (
  state: FourPlayerState,
  godId: (typeof GODS)[number]["id"],
  move = firstMove(state),
) => fourPlayerReducer(state, {
  type: "commit-move-first",
  godId,
  abilityId: GODS.find((god) => god.id === godId)!.abilities[0].id,
  move,
  expectedSeat: state.activeSeat,
  expectedTurn: state.turn,
  expectedRound: state.round,
  expectedBoardIdentity: fourPlayerMoveFirstBoardIdentity(state),
});

const godFirst = (
  state: FourPlayerState,
  godId: (typeof GODS)[number]["id"],
  move = firstMove(state),
) => {
  let next = fourPlayerReducer(state, { type: "select-god", godId });
  next = fourPlayerReducer(next, {
    type: "select-ability",
    abilityId: GODS.find((god) => god.id === godId)!.abilities[0].id,
  });
  next = fourPlayerReducer(next, { type: "square", square: move.from });
  return fourPlayerReducer(next, { type: "square", square: move.to });
};

describe("four-player move-first contracts", () => {
  it.each(["ffa", "teams"] as const)(
    "uses the same ordinary reach for all first abilities in %s",
    (mode) => {
      const config = createDefaultFourPlayerConfig();
      config.mode = mode;
      if (mode === "teams") {
        config.teams = {
          north: "team-a",
          east: "team-b",
          south: "team-a",
          west: "team-b",
        };
      }
      const state = playableState("quetzacoatl", 1, config);
      state.players[state.activeSeat].gods = GODS.map((god) => god.id);
      const hostile = Object.values(state.board).find(
        (candidate) =>
          candidate.controller &&
          candidate.controller !== state.activeSeat,
      );
      if (hostile) hostile.status.hexedBy = state.activeSeat;
      for (const god of GODS) {
        let selected = fourPlayerReducer(state, {
          type: "select-god",
          godId: god.id,
        });
        selected = fourPlayerReducer(selected, {
          type: "select-ability",
          abilityId: god.abilities[0].id,
        });
        expect(selected.pending?.step, god.name).toBe("source");
        const godFirstSources = availableFourPlayerActions(selected)
          .filter((action): action is Extract<FourPlayerAction, { type: "square" }> =>
            action.type === "square"
          )
          .map((action) => action.square);
        expect(godFirstSources.sort(), god.name)
          .toEqual([...fourPlayerMoveFirstSources(state)].sort());
        for (const source of fourPlayerMoveFirstSources(state)) {
          const selectedSource = fourPlayerReducer(selected, {
            type: "square",
            square: source,
          });
          expect([...selectedSource.legalTargets].sort(), `${god.name} ${source}`)
            .toEqual([...fourPlayerMoveFirstTargets(state, source)].sort());
        }
      }
    },
  );

  it.each(GODS.flatMap((god) =>
    ([1, 2, 3] as const).map((level) => [
      god.name,
      god.id,
      level,
    ] as const)
  ))(
    "matches canonical %s (%s) first-ability behavior at level %i",
    (_name, godId, level) => {
      const state = playableState(godId, level);
      const move = firstMove(state);
      expect(moveFirst(state, godId, move)).toEqual(
        godFirst(state, godId, move),
      );
    },
  );

  it.each(["north", "east", "south", "west"] as const)(
    "previews exact immediate affinity deltas for the acting %s seat",
    (seat) => {
      const config = createDefaultFourPlayerConfig();
      config.startingSeat = seat;
      const state = playableState("quetzacoatl", 3, config);
      state.players[seat].gods = GODS.map((god) => god.id);
      state.players[seat].orbs = { light: 7, dark: 9 };
      const move = firstMove(state);
      const snapshot = structuredClone(state);
      const candidates = fourPlayerMoveFirstCandidates(state, move);

      expect(state).toEqual(snapshot);
      expect(candidates).toHaveLength(GODS.length);
      for (const candidate of candidates) {
        const next = fourPlayerReducer(state, {
          type: "commit-move-first",
          godId: candidate.godId,
          abilityId: candidate.abilityId,
          move,
          expectedSeat: seat,
          expectedTurn: state.turn,
          expectedRound: state.round,
          expectedBoardIdentity: fourPlayerMoveFirstBoardIdentity(state),
        });
        expect(candidate.immediateOrbDelta).toEqual({
          light: next.players[seat].orbs.light - state.players[seat].orbs.light,
          dark: next.players[seat].orbs.dark - state.players[seat].orbs.dark,
        });
      }
    },
  );

  it("uses canonical God order, excludes resting Gods, and ignores Charge reach", () => {
    const state = playableState("chiron");
    state.players.north.gods = ["death", "anubis", "chiron"];
    state.rested = ["anubis"];
    const knight = Object.entries(state.board).find(([, candidate]) =>
      candidate.controller === "north" && candidate.type === "knight"
    )!;
    knight[1].status.chargeUntil = "god";
    const ordinary = fourPlayerMoveFirstTargets(state, knight[0]);

    expect(fourPlayerMoveFirstCandidates(state, firstMove(state))
      .map((candidate) => candidate.godId)).toEqual(["chiron", "death"]);
    let selected = fourPlayerReducer(state, {
      type: "select-god",
      godId: "chiron",
    });
    selected = fourPlayerReducer(selected, {
      type: "select-ability",
      abilityId: "gallop",
    });
    selected = fourPlayerReducer(selected, {
      type: "square",
      square: knight[0],
    });
    expect(selected.legalTargets.sort()).toEqual(ordinary.sort());
  });

  it("keeps controlled allied pieces eligible in teams and hostile pieces ineligible", () => {
    const config = createDefaultFourPlayerConfig();
    config.mode = "teams";
    config.teams = {
      north: "team-a",
      east: "team-b",
      south: "team-a",
      west: "team-b",
    };
    const state = playableState("anubis", 1, config);
    state.board = {
      g14: piece(state, "north-king", "king", "north"),
      n8: piece(state, "east-king", "king", "east"),
      g1: piece(state, "south-king", "king", "south"),
      a7: piece(state, "west-king", "king", "west"),
      g8: piece(state, "south-rook", "rook", "south", "north"),
      h8: piece(state, "east-rook", "rook", "east"),
    };
    expect(fourPlayerMoveFirstSources(state)).toContain("g8");
    expect(fourPlayerMoveFirstSources(state)).not.toContain("h8");
  });

  it("inherits canonical check safety, captures, and status restrictions", () => {
    const state = playableState("anubis");
    state.board = {
      g14: piece(state, "north-king", "king", "north"),
      n8: piece(state, "east-king", "king", "east"),
      g1: piece(state, "south-king", "king", "south"),
      a7: piece(state, "west-king", "king", "west"),
      g10: piece(state, "north-rook", "rook", "north"),
      g8: piece(state, "east-rook", "rook", "east"),
      h10: {
        ...piece(state, "north-frozen", "bishop", "north"),
        status: { frozen: 1, frozenBy: "east" },
      },
    };
    expect(fourPlayerMoveFirstTargets(state, "g10").sort()).toEqual(
      fourPlayerLegalTargets(state.board, "g10", state.config, {
        enPassant: state.enPassant,
        bananas: state.bananas,
      }).sort(),
    );
    expect(fourPlayerMoveFirstTargets(state, "g10")).toContain("g8");
    expect(fourPlayerMoveFirstSources(state)).not.toContain("h10");

    state.board.g8 = piece(state, "east-queen", "queen", "east");
    state.board.g10 = piece(state, "east-checker", "rook", "east");
    state.board.h8 = piece(state, "north-bishop", "bishop", "north");
    expect(fourPlayerMoveFirstSources(state)).not.toContain("h8");
  });

  it("does not add move-first actions to AI enumeration", () => {
    const state = playableState("anubis");
    expect(availableFourPlayerActions(state)
      .some((action) => action.type === "commit-move-first")).toBe(false);
  });

  it("queues, serializes, and completes the exact Hex move", () => {
    const state = playableState("salem", 2);
    for (const candidate of Object.values(state.board)) {
      delete candidate.status.hexedBy;
    }
    const move = firstMove(state);
    const board = structuredClone(state.board);
    const queued = moveFirst(state, "salem", move);

    expect(queued.board).toEqual(board);
    expect(queued.pending).toMatchObject({
      abilityId: "hex",
      step: "hex-target",
      queuedMove: {
        ...move,
        actor: state.activeSeat,
        turn: state.turn,
        round: state.round,
        pieceId: state.board[move.from].id,
      },
    });
    queued.players.north.gods = ["salem", "quetzacoatl", "chiron"];
    queued.players.east.gods = ["anubis", "teles", "artemis"];
    queued.players.south.gods = ["kangus", "death", "leonidas"];
    queued.players.west.gods = ["medusa", "midas", "ares"];
    queued.draft.pickIndex = 12;
    queued.draft.available = [];
    expect(isFourPlayerState(queued)).toBe(true);
    expect(isFourPlayerState({
      ...queued,
      pending: {
        ...queued.pending!,
        queuedMove: {
          ...queued.pending!.queuedMove!,
          actor: "east",
        },
      },
    })).toBe(false);
    expect(isFourPlayerState({
      ...queued,
      pending: {
        ...queued.pending!,
        queuedMove: {
          ...queued.pending!.queuedMove!,
          boardIdentity: "forged",
        },
      },
    })).toBe(false);
    const loaded = prepareFourPlayerState(structuredClone(queued));
    const firstTarget = loaded.legalTargets[0];
    const afterFirst = fourPlayerReducer(loaded, {
      type: "square",
      square: firstTarget,
    });
    const completed = fourPlayerReducer(afterFirst, { type: "pass" });
    expect(completed.board[move.from]?.id).not.toBe(state.board[move.from].id);
    expect(completed.board[move.to]?.id).toBe(state.board[move.from].id);
    expect(completed.pending?.queuedMove).toBeUndefined();
  });

  it("returns explicitly to legal movement when a queued Hex move is invalidated", () => {
    const state = playableState("salem", 1);
    for (const candidate of Object.values(state.board)) {
      delete candidate.status.hexedBy;
    }
    const move = firstMove(state);
    const queued = moveFirst(state, "salem", move);
    delete queued.board[move.from];
    const target = queued.legalTargets[0];
    const next = fourPlayerReducer(queued, { type: "square", square: target });
    expect(next.notice).toMatch(/no longer legal/i);
    expect(next.pending?.step).toBe("source");
    expect(next.legalTargets.length).toBeGreaterThan(0);
  });

  it("rejects stale actor, turn, round, board, ability, and resting commits", () => {
    const state = playableState("anubis");
    const move = firstMove(state);
    const base: Extract<
      FourPlayerAction,
      { type: "commit-move-first" }
    > = {
      type: "commit-move-first",
      godId: "anubis",
      abilityId: "construction",
      move,
      expectedSeat: state.activeSeat,
      expectedTurn: state.turn,
      expectedRound: state.round,
      expectedBoardIdentity: fourPlayerMoveFirstBoardIdentity(state),
    };
    for (const action of [
      { ...base, expectedSeat: "east" as const },
      { ...base, expectedTurn: state.turn + 1 },
      { ...base, expectedRound: state.round + 1 },
      { ...base, expectedBoardIdentity: "stale" },
      { ...base, abilityId: "harden" },
    ]) {
      expect(fourPlayerReducer(state, action)).toBe(state);
    }
    state.rested = ["anubis"];
    expect(fourPlayerReducer(state, base)).toBe(state);
  });

  it("preserves Marked King movement and Construction/Marked God-first holds", () => {
    const marked = playableState("death", 3);
    marked.board = {
      g8: piece(marked, "north-king", "king", "north"),
      n8: piece(marked, "east-king", "king", "east"),
      g1: piece(marked, "south-king", "king", "south"),
      a7: piece(marked, "west-king", "king", "west"),
    };
    const destination = fourPlayerMoveFirstTargets(marked, "g8")[0];
    const moved = moveFirst(marked, "death", {
      from: "g8",
      to: destination,
    });
    expect(moved.board[destination]?.type).toBe("king");
    expect(moved.board[destination]?.status.markedForDeath).toBeDefined();
    const finished = fourPlayerReducer(moved, { type: "pass" });
    expect(finished.board[destination]?.type).toBe("king");

    let godFirstMarked = fourPlayerReducer(marked, {
      type: "select-god",
      godId: "death",
    });
    godFirstMarked = fourPlayerReducer(godFirstMarked, {
      type: "select-ability",
      abilityId: "marked",
    });
    expect(availableFourPlayerActions(godFirstMarked)).toContainEqual({
      type: "square",
      square: "g8",
    });
    godFirstMarked = fourPlayerReducer(godFirstMarked, {
      type: "square",
      square: "g8",
    });
    expect([...godFirstMarked.legalTargets].sort())
      .toEqual([...fourPlayerMoveFirstTargets(marked, "g8")].sort());

    const construction = playableState("anubis");
    let held = fourPlayerReducer(construction, {
      type: "select-god",
      godId: "anubis",
    });
    held = fourPlayerReducer(held, {
      type: "select-ability",
      abilityId: "construction",
    });
    held = fourPlayerReducer(held, { type: "pass" });
    expect(held.players.north.orbs.light).toBe(52);

    let markedHeld = fourPlayerReducer(marked, {
      type: "select-god",
      godId: "death",
    });
    markedHeld = fourPlayerReducer(markedHeld, {
      type: "select-ability",
      abilityId: "marked",
    });
    markedHeld = fourPlayerReducer(markedHeld, { type: "pass" });
    expect(markedHeld.players.north.orbs.light).toBe(51);
  });

  it("preserves canonical promotion and capture results", () => {
    const state = playableState("anubis");
    state.board = {
      g14: piece(state, "north-king", "king", "north"),
      n8: piece(state, "east-king", "king", "east"),
      d1: piece(state, "south-king", "king", "south"),
      a7: piece(state, "west-king", "king", "west"),
      g2: piece(state, "north-pawn", "pawn", "north"),
      f1: piece(state, "east-rook", "rook", "east"),
    };
    const promoted = moveFirst(state, "anubis", { from: "g2", to: "g1" });
    expect(promoted.board.g1?.type).toBe("queen");

    const captureState = playableState("anubis");
    captureState.board = {
      g14: piece(captureState, "north-king", "king", "north"),
      n8: piece(captureState, "east-king", "king", "east"),
      d1: piece(captureState, "south-king", "king", "south"),
      a7: piece(captureState, "west-king", "king", "west"),
      g8: piece(captureState, "north-rook", "rook", "north"),
      g6: piece(captureState, "east-rook", "rook", "east"),
    };
    const captured = moveFirst(captureState, "anubis", {
      from: "g8",
      to: "g6",
    });
    expect(captured.board.g6?.id).toBe("north-rook");
    expect(captured.players.east.graveyard.at(-1)?.piece.id).toBe("east-rook");
  });

  it("only starts at a stable play boundary", () => {
    const state = playableState("anubis");
    expect(canStartFourPlayerMoveFirst(state)).toBe(true);
    state.selectedGod = "anubis";
    expect(canStartFourPlayerMoveFirst(state)).toBe(false);
  });
});
