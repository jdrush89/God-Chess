import { afterEach, describe, expect, it, vi } from "vitest";
import { createGame, gameReducer } from "./engine";
import { createFourPlayerGame, fourPlayerReducer } from "./fourPlayerEngine";
import { createThreePlayerGame, threePlayerReducer } from "./threePlayerEngine";
import { FOUR_PLAYER_SEATS } from "./fourPlayerTypes";
import { randomItem } from "./random";
import { THREE_PLAYER_SEATS } from "./threePlayerTypes";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("random draft selection", () => {
  it("produces different legal two-player pantheons while preserving an existing pick", () => {
    const partial = gameReducer(createGame(1), { type: "draft", godId: "ares" });
    const finish = (sequence: number[]) => {
      const values = [...sequence];
      vi.spyOn(Math, "random").mockImplementation(() => values.shift() ?? 0);
      let state = structuredClone(partial);
      while (state.phase === "draft") {
        const godId = randomItem(state.draft.available);
        if (!godId) break;
        state = gameReducer(state, { type: "draft", godId });
      }
      vi.restoreAllMocks();
      return state;
    };

    const first = finish([0, 0.25, 0.5, 0.75, 0.1]);
    const second = finish([0.999999, 0.8, 0.6, 0.4, 0.2]);
    expect(first.players.white.gods[0]).toBe("ares");
    expect(second.players.white.gods[0]).toBe("ares");
    expect(first.players.white.gods).toHaveLength(3);
    expect(first.players.black.gods).toHaveLength(3);
    expect(new Set([...first.players.white.gods, ...first.players.black.gods]).size).toBe(6);
    expect([first.players.white.gods, first.players.black.gods])
      .not.toEqual([second.players.white.gods, second.players.black.gods]);
  });

  it("produces different legal three-player pantheons while preserving an existing pick", () => {
    const partial = threePlayerReducer(createThreePlayerGame(), {
      type: "draft",
      godId: "ares",
    });
    const finish = (sequence: number[]) => {
      const values = [...sequence];
      vi.spyOn(Math, "random").mockImplementation(() => values.shift() ?? 0);
      let state = structuredClone(partial);
      while (state.phase === "draft") {
        const godId = randomItem(state.draft.available);
        if (!godId) break;
        state = threePlayerReducer(state, { type: "draft", godId });
      }
      vi.restoreAllMocks();
      return state;
    };

    const first = finish([0, 0.2, 0.4, 0.6, 0.8, 0.1, 0.3, 0.5]);
    const second = finish([0.999999, 0.85, 0.7, 0.55, 0.4, 0.25, 0.1, 0.9]);
    expect(first.players.white.gods[0]).toBe("ares");
    expect(second.players.white.gods[0]).toBe("ares");
    expect(THREE_PLAYER_SEATS.map((seat) => first.players[seat].gods)).not.toEqual(
      THREE_PLAYER_SEATS.map((seat) => second.players[seat].gods),
    );
    expect(THREE_PLAYER_SEATS.flatMap((seat) => first.players[seat].gods)).toHaveLength(9);
    expect(new Set(THREE_PLAYER_SEATS.flatMap((seat) => first.players[seat].gods)).size)
      .toBe(9);
  });

  it("redistributes all twelve Gods between four-player seats while preserving an existing pick", () => {
    const partial = fourPlayerReducer(createFourPlayerGame(), {
      type: "draft",
      godId: "ares",
    });
    const finish = (sequence: number[]) => {
      const values = [...sequence];
      vi.spyOn(Math, "random").mockImplementation(() => values.shift() ?? 0);
      let state = structuredClone(partial);
      while (state.phase === "draft") {
        const godId = randomItem(state.draft.available);
        if (!godId) break;
        state = fourPlayerReducer(state, { type: "draft", godId });
      }
      vi.restoreAllMocks();
      return state;
    };

    const first = finish([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.25]);
    const second = finish([0.999999, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.75]);
    expect(first.players.north.gods[0]).toBe("ares");
    expect(second.players.north.gods[0]).toBe("ares");
    expect(FOUR_PLAYER_SEATS.map((seat) => first.players[seat].gods)).not.toEqual(
      FOUR_PLAYER_SEATS.map((seat) => second.players[seat].gods),
    );
    expect(FOUR_PLAYER_SEATS.flatMap((seat) => first.players[seat].gods)).toHaveLength(12);
    expect(new Set(FOUR_PLAYER_SEATS.flatMap((seat) => first.players[seat].gods)).size)
      .toBe(12);
  });
});
