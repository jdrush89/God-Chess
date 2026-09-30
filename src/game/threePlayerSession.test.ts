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

    let proposal = createThreePlayerUndoProposal(
      "undo-1",
      0,
      "one",
      ["one", "two"],
    );
    expect(isThreePlayerUndoUnanimous(proposal)).toBe(false);
    proposal = approveThreePlayerUndo(proposal, "two");
    expect(isThreePlayerUndoUnanimous(proposal)).toBe(true);
  });
});
