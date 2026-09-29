import { describe, expect, it } from "vitest";
import { createDefaultFourPlayerConfig } from "./fourPlayerConfig";
import { createFourPlayerGame } from "./fourPlayerEngine";
import {
  applyAuthorizedFourPlayerAction,
  approveFourPlayerUndo,
  createFourPlayerStateEnvelope,
  createFourPlayerUndoProposal,
  fourPlayerHumanParticipantIds,
  isFourPlayerUndoUnanimous,
  normalizeFourPlayerStateEnvelope,
} from "./fourPlayerSession";

const onlineGame = () => {
  const config = createDefaultFourPlayerConfig();
  config.seats.north.control = {
    kind: "online",
    participantId: "host",
    local: true,
  };
  config.seats.east.control = {
    kind: "online",
    participantId: "guest",
  };
  return createFourPlayerGame(config);
};

describe("four-player layer-three session seams", () => {
  it("authorizes only the active seat owner at the expected revision", () => {
    const state = onlineGame();
    const applied = applyAuthorizedFourPlayerAction(state, {
      revision: 4,
      actionId: "action-5",
      participantId: "host",
      seat: "north",
      action: { type: "draft", godId: "ares" },
    }, 4);
    expect(applied.revision).toBe(5);
    expect(applied.lastActionId).toBe("action-5");
    expect(applied.state.players.north.gods).toEqual(["ares"]);

    expect(() => applyAuthorizedFourPlayerAction(state, {
      revision: 4,
      actionId: "wrong-seat",
      participantId: "guest",
      seat: "east",
      action: { type: "draft", godId: "ares" },
    }, 4)).toThrow(/not authorized/i);
  });

  it("normalizes strict revisioned state snapshots", () => {
    const envelope = createFourPlayerStateEnvelope(onlineGame(), 7, "action-7");
    expect(normalizeFourPlayerStateEnvelope(JSON.parse(JSON.stringify(envelope)))).toEqual(envelope);
    expect(normalizeFourPlayerStateEnvelope({ ...envelope, revision: -1 })).toBeUndefined();
  });

  it("tracks unique Human participants and unanimous undo approval", () => {
    const participants = fourPlayerHumanParticipantIds(onlineGame());
    expect(participants).toEqual(["host", "guest"]);
    let proposal = createFourPlayerUndoProposal("undo-1", 6, "host", participants);
    expect(isFourPlayerUndoUnanimous(proposal)).toBe(false);
    proposal = approveFourPlayerUndo(proposal, "guest");
    expect(isFourPlayerUndoUnanimous(proposal)).toBe(true);
  });
});
