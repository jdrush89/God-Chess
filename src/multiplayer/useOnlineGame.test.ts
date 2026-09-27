import { describe, expect, it } from "vitest";
import { onlineInputDisabled, type OnlineGameState } from "./useOnlineGame";

describe("online player input", () => {
  it("unlocks exactly the assigned player during the draft", () => {
    const whitePlayer: OnlineGameState = {
      role: "host",
      connecting: false,
      started: true,
      awaitingSync: false,
      localColor: "white",
    };
    const blackPlayer: OnlineGameState = {
      role: "peer",
      connecting: false,
      started: true,
      awaitingSync: false,
      localColor: "black",
    };

    expect(onlineInputDisabled(whitePlayer, "white")).toBe(false);
    expect(onlineInputDisabled(blackPlayer, "white")).toBe(true);
    expect(onlineInputDisabled(whitePlayer, "black")).toBe(true);
    expect(onlineInputDisabled(blackPlayer, "black")).toBe(false);
  });

  it("keeps both players locked until their explicit seat assignment arrives", () => {
    const connecting: OnlineGameState = {
      role: "peer",
      connecting: false,
      started: true,
      awaitingSync: false,
    };

    expect(onlineInputDisabled(connecting, "white")).toBe(true);
    expect(onlineInputDisabled(connecting, "black")).toBe(true);
  });
});
