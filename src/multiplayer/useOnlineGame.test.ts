import { describe, expect, it } from "vitest";
import {
  onlinePlayerColor,
  onlineTurnInputDisabled,
  type OnlineGameState,
} from "./useOnlineGame";

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

    expect(onlineTurnInputDisabled(whitePlayer, "white")).toBe(false);
    expect(onlineTurnInputDisabled(blackPlayer, "white")).toBe(true);
    expect(onlineTurnInputDisabled(whitePlayer, "black")).toBe(true);
    expect(onlineTurnInputDisabled(blackPlayer, "black")).toBe(false);
  });

  it("derives both seats from the synchronized host color when transient assignments are absent", () => {
    const host: OnlineGameState = {
      role: "host",
      connecting: false,
      started: true,
      awaitingSync: false,
    };
    const guest: OnlineGameState = {
      role: "peer",
      connecting: false,
      started: true,
      awaitingSync: false,
    };

    expect(onlinePlayerColor(host, "black")).toBe("black");
    expect(onlinePlayerColor(guest, "black")).toBe("white");
    expect(onlineTurnInputDisabled(host, "black", "black")).toBe(false);
    expect(onlineTurnInputDisabled(guest, "black", "black")).toBe(true);
    expect(onlineTurnInputDisabled(host, "white", "black")).toBe(true);
    expect(onlineTurnInputDisabled(guest, "white", "black")).toBe(false);
  });

  it("keeps both players locked until a seat assignment is available", () => {
    const connecting: OnlineGameState = {
      role: "peer",
      connecting: false,
      started: true,
      awaitingSync: false,
    };

    expect(onlineTurnInputDisabled(connecting, "white")).toBe(true);
    expect(onlineTurnInputDisabled(connecting, "black")).toBe(true);
  });
});
