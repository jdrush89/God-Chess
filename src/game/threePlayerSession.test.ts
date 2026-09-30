import { describe, expect, it } from "vitest";
import { createDefaultThreePlayerConfig } from "./threePlayerConfig";
import {
  createThreePlayerGame,
  threePlayerReducer,
} from "./threePlayerEngine";
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
