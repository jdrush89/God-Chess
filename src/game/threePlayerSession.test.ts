import { describe, expect, it } from "vitest";
import { createDefaultThreePlayerConfig } from "./threePlayerConfig";
import {
  availableThreePlayerActions,
  createThreePlayerGame,
  threePlayerReducer,
} from "./threePlayerEngine";
import { threePlayerLegalMoves } from "./threePlayerChess";
import {
  applyAuthorizedThreePlayerAction,
  approveThreePlayerUndo,
  canParticipantSubmitThreePlayerAction,
  createThreePlayerStateEnvelope,
  createThreePlayerUndoProposal,
  isThreePlayerUndoUnanimous,
  normalizeThreePlayerAction,
  normalizeThreePlayerStateEnvelope,
  normalizeThreePlayerUndoProposal,
  normalizeThreePlayerUndoVote,
} from "./threePlayerSession";
import { GODS } from "./gods";
import { getThreePlayerTopology } from "./threePlayerTopology";

describe("three-player session boundaries", () => {
  it("normalizes exact action shapes and rejects extra keys", () => {
    expect(normalizeThreePlayerAction({
      type: "draft",
      godId: GODS[0].id,
    })).toEqual({ type: "draft", godId: GODS[0].id });
    expect(normalizeThreePlayerAction({
      type: "draft",
      godId: GODS[0].id,
      extra: true,
    })).toBeUndefined();
    expect(normalizeThreePlayerAction({
      type: "move",
      from: "not-a-cell",
      to: "also-not-a-cell",
    })).toBeUndefined();

    const yalta = getThreePlayerTopology("three-player");
    const circular = getThreePlayerTopology("three-circular");
    const cell = yalta.cells[0];
    const trace = yalta.rookTraces(cell)[0];
    const actions = [
      { type: "select-god", godId: GODS[0].id },
      { type: "clear-god" },
      { type: "select-ability", abilityId: GODS[0].abilities[0].id },
      { type: "confirm-ability" },
      { type: "cell", cell },
      { type: "path", pathId: trace.id },
      { type: "seat", seat: "red" },
      { type: "grave", pieceId: "piece-1" },
      { type: "choice", value: true },
      { type: "amount", amount: 2 },
      { type: "orb", orb: "dark" },
      { type: "orb" },
      { type: "pass" },
      { type: "cancel" },
      { type: "upgrade", abilityId: GODS[0].abilities[0].id },
      { type: "restart" },
    ] as const;
    for (const action of actions) {
      expect(normalizeThreePlayerAction(action), action.type).toEqual(action);
      expect(normalizeThreePlayerAction({ ...action, extra: true }), action.type)
        .toBeUndefined();
    }
    const knight = yalta.knightTraces(cell)[0];
    const pawn = yalta.cells.flatMap((origin) => {
      const advances = yalta.pawnRules("white", origin).advances;
      return [...new Set(advances.map((advance) => advance.to))]
        .flatMap((target) =>
          advances
            .filter((advance) => advance.to === target)
            .map((advance, index) =>
              `pawn:${origin}:${target}:${advance.group}:${index}`
            )
        );
    })[0];
    const stepTarget = yalta.kingNeighbors(cell)[0];
    const castling = yalta.castling("white")[0];
    for (const pathId of [
      knight.id,
      pawn,
      `step:${cell}:${stepTarget}`,
      `castle:${castling.id}`,
    ]) {
      expect(normalizeThreePlayerAction({ type: "path", pathId })).toEqual({
        type: "path",
        pathId,
      });
    }
    expect(normalizeThreePlayerAction({
      type: "move",
      from: yalta.cells[0],
      to: circular.cells[0],
    })).toBeUndefined();
    expect(normalizeThreePlayerAction({
      type: "path",
      pathId: "three-player:missing",
    })).toBeUndefined();
    expect(normalizeThreePlayerAction({ type: "amount", amount: 3 }))
      .toBeUndefined();
    expect(normalizeThreePlayerAction({ type: "orb", orb: "red" }))
      .toBeUndefined();
  });

  it("authorizes only the active online participant at the expected revision", () => {
    const config = createDefaultThreePlayerConfig();
    config.seats.white.control = {
      kind: "online",
      participantId: "white-player",
    };
    let state = createThreePlayerGame(config);
    const action = { type: "draft", godId: GODS[0].id } as const;
    expect(
      canParticipantSubmitThreePlayerAction(
        state,
        "white-player",
        "white",
        action,
      ),
    ).toBe(true);
    expect(
      canParticipantSubmitThreePlayerAction(
        state,
        "someone-else",
        "white",
        action,
      ),
    ).toBe(false);

    const envelope = applyAuthorizedThreePlayerAction(
      state,
      {
        revision: 0,
        actionId: "action-1",
        participantId: "white-player",
        seat: "white",
        action,
      },
      0,
    );
    state = envelope.state;
    expect(envelope.revision).toBe(1);
    expect(state.activeSeat).toBe("red");
    expect(() => applyAuthorizedThreePlayerAction(
      state,
      {
        revision: 0,
        actionId: "stale",
        participantId: "white-player",
        seat: "white",
        action,
      },
      0,
    )).toThrow(/revision/i);
  });

  it("rejects normalized actions outside the currently enumerated boundary", () => {
    const config = createDefaultThreePlayerConfig();
    for (const seat of ["white", "red", "black"] as const) {
      config.seats[seat].control = {
        kind: "online",
        participantId: `${seat}-player`,
      };
    }
    let state = createThreePlayerGame(config);
    while (state.phase === "draft") {
      state = threePlayerReducer(state, availableThreePlayerActions(state)[0]);
    }
    const move = threePlayerLegalMoves(state, state.activeSeat)[0];
    expect(move).toBeTruthy();
    expect(canParticipantSubmitThreePlayerAction(
      state,
      "white-player",
      "white",
      { type: "move", ...move },
    )).toBe(false);
    expect(canParticipantSubmitThreePlayerAction(
      state,
      "white-player",
      "white",
      availableThreePlayerActions(state)[0],
    )).toBe(true);
  });

  it("normalizes revisioned snapshots and requires unanimous undo consent", () => {
    const state = threePlayerReducer(createThreePlayerGame(), {
      type: "draft",
      godId: GODS[0].id,
    });
    const envelope = createThreePlayerStateEnvelope(state, "draft-1");
    expect(normalizeThreePlayerStateEnvelope(envelope)).toEqual(envelope);
    expect(normalizeThreePlayerStateEnvelope({
      ...envelope,
      revision: envelope.revision + 1,
    })).toBeUndefined();
    expect(normalizeThreePlayerStateEnvelope({
      ...envelope,
      state: {
        ...envelope.state,
        unexpected: true,
      },
    })).toBeUndefined();

    let proposal = createThreePlayerUndoProposal(
      "undo-1",
      0,
      "one",
      ["one", "two"],
    );
    expect(isThreePlayerUndoUnanimous(proposal)).toBe(false);
    proposal = approveThreePlayerUndo(proposal, "two");
    expect(isThreePlayerUndoUnanimous(proposal)).toBe(true);
    expect(normalizeThreePlayerUndoProposal(proposal)).toEqual(proposal);
    expect(normalizeThreePlayerUndoProposal({
      ...proposal,
      approvedParticipantIds: ["missing"],
    })).toBeUndefined();
    expect(normalizeThreePlayerUndoVote({
      requestId: "undo-1",
      targetRevision: 0,
      approved: false,
    })).toEqual({
      requestId: "undo-1",
      targetRevision: 0,
      approved: false,
    });
    expect(normalizeThreePlayerUndoVote({
      requestId: "undo-1",
      targetRevision: 0,
      approved: true,
      extra: true,
    })).toBeUndefined();
  });

  it("normalizes legal synthetic, unlimited, and generated-area pending states", () => {
    const finished = GODS.slice(0, 9).reduce(
      (state, god) =>
        threePlayerReducer(state, { type: "draft", godId: god.id }),
      createThreePlayerGame(),
    );
    const assignWhiteGod = (
      state: typeof finished,
      godId: (typeof GODS)[number]["id"],
    ) => {
      const remaining = GODS.map((god) => god.id).filter((id) => id !== godId);
      state.players.white.gods = [godId, remaining[0], remaining[1]];
      state.players.red.gods = remaining.slice(2, 5);
      state.players.black.gods = remaining.slice(5, 8);
      state.draft.unused = remaining.slice(8);
      state.activeSeat = "white";
    };
    const cell = Object.keys(finished.board)[0];
    const movedPieceId = finished.board[cell].id;
    const topology = getThreePlayerTopology(finished.config.boardVariant);
    const areaId = topology.cells.flatMap((origin) =>
      (["1x2", "2x1", "2x2"] as const).flatMap((kind) =>
        topology.areas(origin, kind)
      )
    )[0].id;

    const snipe = structuredClone(finished);
    assignWhiteGod(snipe, "artemis");
    snipe.pending = {
      godId: "artemis",
      abilityId: "snipe-shot",
      step: "snipe-source",
    };

    const slither = structuredClone(finished);
    assignWhiteGod(slither, "medusa");
    slither.selectedGod = "medusa";
    slither.selectedAbility = "slither";
    slither.pending = {
      godId: "medusa",
      abilityId: "slither",
      step: "slither",
      source: cell,
      movedPieceId,
      movesRemaining: -1,
    };

    const poison = structuredClone(finished);
    assignWhiteGod(poison, "salem");
    poison.selectedGod = "salem";
    poison.selectedAbility = "poison-cloud";
    poison.pending = {
      godId: "salem",
      abilityId: "poison-cloud",
      step: "poison-area",
      source: cell,
      selectedPathIds: [areaId],
    };

    for (const [index, state] of [snipe, slither, poison].entries()) {
      const envelope = createThreePlayerStateEnvelope(
        state,
        `pending-${index}`,
      );
      expect(normalizeThreePlayerStateEnvelope(envelope)).toEqual(envelope);
    }
  });
});
