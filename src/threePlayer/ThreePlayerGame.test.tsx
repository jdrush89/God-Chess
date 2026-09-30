// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  availableThreePlayerActions,
  createThreePlayerGame,
  threePlayerReducer,
} from "../game/threePlayerEngine";
import { createDefaultThreePlayerConfig } from "../game/threePlayerConfig";
import type { ThreePlayerState } from "../game/threePlayerTypes";
import { ThreePlayerGame } from "./ThreePlayerGame";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
});

afterEach(cleanup);

const completeDraft = (state = createThreePlayerGame()) => {
  let next = state;
  while (next.phase === "draft") {
    next = threePlayerReducer(next, availableThreePlayerActions(next)[0]);
  }
  return next;
};

const renderGame = (state: ThreePlayerState) =>
  render(
    <ThreePlayerGame
      initialState={state}
      onQuit={() => undefined}
      onNewGame={() => undefined}
    />,
  );

describe("ThreePlayerGame", () => {
  it("keeps all twelve Gods inspectable while disabling claimed draft cards", () => {
    const state = threePlayerReducer(createThreePlayerGame(), {
      type: "draft",
      godId: "quetzacoatl",
    });
    const { container } = renderGame(state);

    expect(container.querySelectorAll(".three-god-card")).toHaveLength(12);
    expect((screen.getByRole("button", { name: /Claimed by White/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Quetzacoatl")).toBeTruthy();
    expect(screen.getByText("Ares")).toBeTruthy();
    expect(container.querySelectorAll(".three-draft-progress > span")).toHaveLength(9);
  });

  it("shows Red's dynamic affinity and gates interaction during AI turns", () => {
    const state = completeDraft();
    state.completedTurns.red = 1;
    state.activeSeat = "white";
    state.players.white.control = { kind: "ai", difficulty: 5 };
    renderGame(state);

    expect(screen.getByText(/Red · dark affinity/i)).toBeTruthy();
    expect(screen.getByText(/AI is choosing a divine action/i)).toBeTruthy();
    expect(document.querySelector(".three-game-page")?.classList.contains("input-gated")).toBe(true);
    expect(screen.getAllByRole("gridcell")[0].getAttribute("aria-disabled")).toBe("true");
  });

  it("reaches primitive cell gameplay through God and ability actions", () => {
    const state = completeDraft();
    const { container } = renderGame(state);
    const firstGod = state.players.white.gods[0];
    fireEvent.click(screen.getByRole("button", { name: new RegExp(firstGod, "i") }));

    const ability = screen.getAllByRole("button").find((button) =>
      button.closest(".three-ability-list") && !button.hasAttribute("disabled")
    );
    expect(ability).toBeTruthy();
    fireEvent.click(ability!);

    const legalCell = container.querySelector(".three-board-cell.legal")?.getAttribute("data-cell");
    expect(legalCell).toBeTruthy();
    fireEvent.click(screen.getByRole("gridcell", { name: new RegExp(`^${legalCell}`) }));
    expect(container.querySelector(".three-board-cell.selected, .three-board-cell.legal")).toBeTruthy();
  });

  it("undoes a Human boundary together with the following AI chain", async () => {
    const config = createDefaultThreePlayerConfig();
    config.seats.red.control = { kind: "ai", difficulty: 1 };
    config.seats.black.control = { kind: "ai", difficulty: 1 };
    const state = completeDraft(createThreePlayerGame(config));
    const { container } = renderGame(state);

    const godButton = screen.getByRole("button", {
      name: new RegExp(state.players.white.gods[0], "i"),
    });
    fireEvent.click(godButton);
    const ability = screen.getAllByRole("button").find((button) =>
      button.closest(".three-ability-list") && !button.hasAttribute("disabled")
    )!;
    fireEvent.click(ability);
    const source = container.querySelector(".three-board-cell.legal")?.getAttribute("data-cell");
    expect(source).toBeTruthy();
    fireEvent.click(screen.getByRole("gridcell", { name: new RegExp(`^${source}`) }));
    const destination = container.querySelector(".three-board-cell.legal")?.getAttribute("data-cell");
    expect(destination).toBeTruthy();
    fireEvent.click(screen.getByRole("gridcell", { name: new RegExp(`^${destination}`) }));

    await waitFor(
      () => expect(screen.getByText(/Round \d+ · Turn [4-9]\d*/i)).toBeTruthy(),
      { timeout: 5000 },
    );
    fireEvent.click(screen.getByRole("button", { name: /^Undo$/i }));
    expect(screen.getByText("Round 1 · Turn 1")).toBeTruthy();
  });

  it("does not quit when Save & quit persistence fails", async () => {
    const onQuit = vi.fn();
    render(
      <ThreePlayerGame
        initialState={createThreePlayerGame()}
        onPersist={async () => false}
        onQuit={onQuit}
        onNewGame={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Save & quit/i }));
    await waitFor(() => expect(onQuit).not.toHaveBeenCalled());
  });
});
