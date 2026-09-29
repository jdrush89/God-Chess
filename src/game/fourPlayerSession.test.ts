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
  normalizeFourPlayerAction,
  normalizeFourPlayerActionEnvelope,
  normalizeFourPlayerStateEnvelope,
} from "./fourPlayerSession";
import type { FourPlayerAction } from "./fourPlayerTypes";

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
  it("strictly validates every decoded action variant and envelope field", () => {
    const state = onlineGame();
    const validActions: FourPlayerAction[] = [
      { type: "draft", godId: "ares" },
      { type: "select-god", godId: "ares" },
      { type: "clear-god" },
      { type: "select-ability", abilityId: "threaten" },
      { type: "confirm-ability" },
      { type: "square", square: "g14" },
      { type: "seat", seat: "east" },
      { type: "grave", pieceId: "north-pawn-1" },
      { type: "choice", value: true },
      { type: "amount", amount: 2 },
      { type: "orb", orb: "light" },
      { type: "orb" },
      { type: "pass" },
      { type: "cancel" },
      { type: "upgrade", abilityId: "threaten" },
      { type: "load", state },
      { type: "restart" },
    ];
    for (const action of validActions) {
      expect(normalizeFourPlayerAction(action)?.type).toBe(action.type);
      expect(normalizeFourPlayerAction({ ...action, unexpected: true })).toBeUndefined();
    }

    for (const action of [
      { type: "amount", amount: 3 },
      { type: "amount", amount: 1.5 },
      { type: "choice", value: "true" },
      { type: "orb", orb: "blue" },
      { type: "seat", seat: "center" },
      { type: "square", square: "z99" },
      { type: "draft", godId: "unknown" },
      { type: "select-ability", abilityId: "unknown" },
      { type: "grave", pieceId: "" },
      { type: "load", state: {} },
      { type: "unknown" },
    ]) {
      expect(normalizeFourPlayerAction(action)).toBeUndefined();
    }

    const envelope = {
      revision: 0,
      actionId: "action-1",
      participantId: "host",
      seat: "north",
      action: { type: "draft", godId: "ares" },
    };
    expect(normalizeFourPlayerActionEnvelope(envelope)).toEqual(envelope);
    expect(normalizeFourPlayerActionEnvelope({ ...envelope, revision: -1 })).toBeUndefined();
    expect(normalizeFourPlayerActionEnvelope({ ...envelope, extra: true })).toBeUndefined();
    expect(() => applyAuthorizedFourPlayerAction(
      state,
      { ...envelope, action: { type: "amount", amount: 99 } },
      0,
    )).toThrow(/envelope is invalid/i);
  });

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
