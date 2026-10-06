import { describe, expect, it } from "vitest";
import {
  classicMoveFirstCandidates,
  classicMoveFirstSources,
  classicMoveFirstTargets,
  createGame,
  gameReducer,
} from "./engine";
import { allSquares } from "./chess";
import { GODS } from "./gods";
import { PUZZLES } from "./puzzles";
import type {
  GameState,
  GodId,
  Piece,
  PieceType,
} from "./types";
import { normalizeSavedGame, createSavedGame } from "../saves";

const piece = (
  type: PieceType,
  color: "white" | "black",
  id: string,
): Piece => ({
  id,
  type,
  color,
  controller: color,
  hasMoved: false,
  status: {},
});

const playableState = (
  godId: GodId,
  level: 1 | 2 | 3 = 1,
) => {
  const state = createGame(1);
  state.phase = "play";
  state.activeColor = "white";
  state.players.white.gods = [godId];
  state.players.black.gods = [godId === "ares" ? "midas" : "ares"];
  state.draft.pickIndex = 2;
  state.draft.available = GODS
    .map((god) => god.id)
    .filter((candidate) =>
      !state.players.white.gods.includes(candidate) &&
      !state.players.black.gods.includes(candidate)
    );
  const abilityId = GODS.find((god) => god.id === godId)!.abilities[0].id;
  state.players.white.upgrades[abilityId] = level;
  state.notice = "White to act.";
  if (godId === "salem") state.board.e7.status.hexedBy = "white";
  return state;
};

const moveFirst = (
  state: GameState,
  godId: GodId,
  from: string,
  to: string,
) => gameReducer(state, {
  type: "commit-move-first",
  godId,
  abilityId: GODS.find((god) => god.id === godId)!.abilities[0].id,
  move: { from, to },
  expectedActor: state.activeColor,
  expectedTurn: state.turn,
});

const godFirst = (
  state: GameState,
  godId: GodId,
  from: string,
  to: string,
) => {
  const abilityId = GODS.find((god) => god.id === godId)!.abilities[0].id;
  let next = gameReducer(state, { type: "select-god", godId });
  next = gameReducer(next, { type: "select-ability", abilityId });
  next = gameReducer(next, { type: "square", square: from });
  return gameReducer(next, { type: "square", square: to });
};

describe("classic move-first contracts", () => {
  it.each(GODS.map((god) => [god.name, god.id] as const))(
    "uses the same ordinary source and target set for %s first ability",
    (_name, godId) => {
      const state = playableState(godId);
      const abilityId = GODS.find((god) => god.id === godId)!.abilities[0].id;
      let selected = gameReducer(state, { type: "select-god", godId });
      selected = gameReducer(selected, { type: "select-ability", abilityId });

      expect(classicMoveFirstSources(state).sort()).toEqual(
        allSquares.filter((source) =>
          classicMoveFirstTargets(state, source).length > 0
        ).sort(),
      );
      for (const source of allSquares) {
        const godFirstSource = gameReducer(selected, {
          type: "square",
          square: source,
        });
        expect([...godFirstSource.legalTargets].sort()).toEqual(
          [...classicMoveFirstTargets(state, source)].sort(),
        );
      }
    },
  );

  it.each(
    GODS.flatMap((god) =>
      ([1, 2, 3] as const).map((level) => [
        god.name,
        god.id,
        level,
      ] as const)
    ),
  )(
    "matches the canonical %s (%s) level %i result",
    (_name, godId, level) => {
      const state = playableState(godId, level);
      expect(moveFirst(state, godId, "e2", "e4")).toEqual(
        godFirst(state, godId, "e2", "e4"),
      );
    },
  );

  it("previews immediate rewards without mutating the state", () => {
    const state = playableState("anubis", 3);
    state.board = {
      a1: piece("king", "white", "white-king"),
      h8: piece("king", "black", "black-king"),
      d4: piece("rook", "white", "white-rook"),
    };
    state.players.white.gods = ["anubis", "death", "kangus"];
    const snapshot = structuredClone(state);

    const candidates = classicMoveFirstCandidates(state, {
      from: "d4",
      to: "d5",
    });

    expect(state).toEqual(snapshot);
    expect(candidates.map((candidate) => candidate.godId)).toEqual([
      "anubis",
      "kangus",
      "death",
    ]);
    expect(candidates.find((candidate) => candidate.godId === "anubis"))
      .toMatchObject({
        immediateOrbDelta: { white: 0, black: 2 },
        valid: true,
      });
    expect(candidates.find((candidate) => candidate.godId === "kangus"))
      .toMatchObject({
        immediateOrbDelta: { white: 0, black: 0 },
      });
    expect(candidates.find((candidate) => candidate.godId === "death")!
      .conditionalOutcome).toContain("Marked");
  });

  it("excludes resting Gods from the canonical chooser order", () => {
    const state = playableState("anubis");
    state.players.white.gods = ["death", "anubis", "kangus"];
    state.rested = ["anubis"];
    expect(classicMoveFirstCandidates(state, { from: "e2", to: "e4" })
      .map((candidate) => candidate.godId)).toEqual(["kangus", "death"]);
  });

  it("keeps Construction hold and Marked do-nothing God-first only", () => {
    const construction = playableState("anubis");
    let held = gameReducer(construction, {
      type: "select-god",
      godId: "anubis",
    });
    held = gameReducer(held, {
      type: "select-ability",
      abilityId: "construction",
    });
    held = gameReducer(held, { type: "pass" });
    expect(held.players.white.orbs.white).toBe(2);

    const marked = playableState("death", 2);
    let waited = gameReducer(marked, {
      type: "select-god",
      godId: "death",
    });
    waited = gameReducer(waited, {
      type: "select-ability",
      abilityId: "marked",
    });
    waited = gameReducer(waited, { type: "pass" });
    expect(waited.players.white.orbs.white).toBe(1);
  });

  it("allows Marked to make an ordinary King move without ever killing the King", () => {
    const state = playableState("death", 3);
    state.board = {
      d4: piece("king", "white", "white-king"),
      h8: piece("king", "black", "black-king"),
    };
    const next = moveFirst(state, "death", "d4", "d5");
    expect(next.board.d5?.type).toBe("king");
    expect(next.board.d5?.status.markedForDeath).toBeDefined();
    const finished = gameReducer(next, { type: "pass" });
    expect(finished.board.d5?.type).toBe("king");
  });

  it("queues Hex setup in serializable reducer state and then executes the exact move", () => {
    const state = playableState("salem", 2);
    delete state.board.e7.status.hexedBy;
    const queued = moveFirst(state, "salem", "e2", "e4");
    expect(queued.board.e2?.id).toBe(state.board.e2.id);
    expect(queued.board.e4).toBeUndefined();
    expect(queued.pending).toMatchObject({
      abilityId: "hex",
      step: "hex-target",
      queuedMove: {
        from: "e2",
        to: "e4",
        actor: "white",
        turn: state.turn,
        pieceId: state.board.e2.id,
      },
    });
    queued.players.white.gods = ["salem", "anubis", "kangus"];
    queued.players.black.gods = ["ares", "midas", "death"];
    queued.draft.pickIndex = 6;
    queued.draft.available = GODS
      .map((god) => god.id)
      .filter((godId) =>
        !queued.players.white.gods.includes(godId) &&
        !queued.players.black.gods.includes(godId)
      );
    const saved = JSON.parse(JSON.stringify(
      createSavedGame("queued-hex", queued, []),
    ));
    const normalized = normalizeSavedGame(saved);
    expect(
      normalized && !("variant" in normalized.state)
        ? normalized.state.pending?.queuedMove
        : undefined,
    ).toEqual(queued.pending?.queuedMove);
    saved.state.pending.queuedMove.actor = "black";
    expect(normalizeSavedGame(saved)).toBeUndefined();

    const firstTarget = queued.legalTargets[0];
    const afterOne = gameReducer(queued, {
      type: "square",
      square: firstTarget,
    });
    const completed = gameReducer(afterOne, { type: "pass" });
    expect(completed.board.e2).toBeUndefined();
    expect(completed.board.e4?.id).toBe(state.board.e2.id);
  });

  it("rejects stale, wrong-actor, and mismatched first-ability commits", () => {
    const state = playableState("anubis");
    const base = {
      type: "commit-move-first" as const,
      godId: "anubis" as const,
      abilityId: "construction",
      move: { from: "e2", to: "e4" },
      expectedActor: "white" as const,
      expectedTurn: state.turn,
    };
    expect(gameReducer(state, {
      ...base,
      expectedTurn: state.turn + 1,
    })).toBe(state);
    expect(gameReducer(state, {
      ...base,
      expectedActor: "black",
    })).toBe(state);
    expect(gameReducer(state, {
      ...base,
      abilityId: "harden",
    })).toBe(state);
  });

  it("preserves the mandatory Lure source restriction", () => {
    const state = playableState("anubis");
    state.board = {
      a1: piece("king", "white", "white-king"),
      h8: piece("king", "black", "black-king"),
      a2: piece("rook", "white", "white-rook"),
      g2: {
        ...piece("pawn", "white", "lured-pawn"),
        status: { luredBy: "black" },
      },
      h4: piece("queen", "black", "black-queen"),
    };
    expect(classicMoveFirstSources(state)).toContain("g2");
    expect(classicMoveFirstSources(state)).not.toContain("a2");
    expect(classicMoveFirstTargets(state, "a2")).toEqual([]);
  });

  it("does not apply divine movement modifiers to the ordinary draft", () => {
    const state = playableState("chiron");
    state.board = {
      a1: piece("king", "white", "white-king"),
      h8: piece("king", "black", "black-king"),
      d4: {
        ...piece("knight", "white", "charged-knight"),
        status: { chargeUntil: "god" },
      },
    };
    expect(classicMoveFirstTargets(state, "d4")).not.toContain("d8");
    expect(classicMoveFirstTargets(state, "d4")).toContain("f5");
  });

  it("adjudicates a puzzle move exactly like its God-first solution", () => {
    const puzzle = PUZZLES.find((candidate) =>
      candidate.id === "skyward-charge"
    )!;
    const initial = puzzle.createState();
    const expected = puzzle.solutionTurns[0].slice(0, 4)
      .reduce(gameReducer, initial);
    const actual = moveFirst(initial, "quetzacoatl", "g3", "g7");
    expect(actual).toEqual(expected);
    expect(actual.pending?.step).toBe("slither-orb");
  });
});
