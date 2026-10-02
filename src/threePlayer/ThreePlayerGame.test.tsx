// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  availableThreePlayerActions,
  createThreePlayerGame,
  threePlayerReducer,
} from "../game/threePlayerEngine";
import { createDefaultThreePlayerConfig } from "../game/threePlayerConfig";
import { GOD_BY_ID, GODS } from "../game/gods";
import { enumerateCompleteThreePlayerPlans } from "../game/threePlayerPlans";
import type {
  ThreePlayerAction,
  ThreePlayerState,
} from "../game/threePlayerTypes";
import { THREE_PLAYER_SEATS } from "../game/threePlayerTypes";
import {
  ThreePlayerGame,
  type ThreePlayerOnlineSession,
} from "./ThreePlayerGame";

const matchMedia = (reducedMotion = false) => (query: string) => ({
  matches: reducedMotion && query === "(prefers-reduced-motion: reduce)",
  media: query,
  onchange: null,
  addListener: () => undefined,
  removeListener: () => undefined,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  dispatchEvent: () => false,
});

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: matchMedia(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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

it("renders Quetzacoatl's committed Slither orb choice", () => {
  const state = completeDraft();
  state.phase = "play";
  state.activeSeat = "white";
  state.players.white.gods = ["quetzacoatl"];
  state.selectedGod = "quetzacoatl";
  state.selectedAbility = "flight";
  state.pending = {
    godId: "quetzacoatl",
    abilityId: "flight",
    step: "slither-orb",
    destination: Object.keys(state.board)[0],
    movedPieceId: Object.values(state.board)[0].id,
  };
  state.notice = "Slither: choose one extra light or dark orb.";

  renderGame(state);

  expect(screen.getByRole("button", { name: /choose light orb/i })).toBeTruthy();
  expect(screen.getByRole("button", { name: /choose dark orb/i })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^cancel$/i })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /choose dark orb/i }));
  expect(screen.getByText(/used Slither with Quetzacoatl/i)).toBeTruthy();
});

const installDeterministicAiWorker = () => {
  const terminate = vi.fn();
  class DeterministicAiWorker {
    onmessage:
      | ((event: MessageEvent<{
        revision: number;
        plan: ThreePlayerAction[];
      }>) => void)
      | null = null;

    postMessage(state: ThreePlayerState) {
      const plan = enumerateCompleteThreePlayerPlans(state, {
        maxDepth: 12,
        maxStates: 2_000,
        maxActionsPerState: 1,
        maxPlans: 1,
      })[0]?.actions ?? [];
      queueMicrotask(() => {
        this.onmessage?.({
          data: { revision: state.revision, plan },
        } as MessageEvent<{
          revision: number;
          plan: ThreePlayerAction[];
        }>);
      });
    }

    terminate() {
      terminate();
    }
  }
  vi.stubGlobal("Worker", DeterministicAiWorker);
  return terminate;
};

describe("ThreePlayerGame", () => {
  it("auto-picks one deterministic available God for the local Human seat", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { container } = renderGame(createThreePlayerGame());
    const autoPick = screen.getByRole("button", {
      name: /^Auto-pick random god$/i,
    });

    expect((autoPick as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(autoPick);

    const expectedGod = GODS[Math.floor(GODS.length * 0.5)];
    expect(container.querySelectorAll(".three-draft-progress .draft-pip.done")).toHaveLength(1);
    expect(screen.getByRole("button", {
      name: new RegExp(`Inspect ${expectedGod.name}, claimed by White`, "i"),
    })).toBeTruthy();
    expect(screen.getByText(/Red · Red picks/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Claim Quetzacoatl$/i })).toBeTruthy();
  });

  it("ignores rapid repeated local auto-picks from the same draft revision", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { container } = renderGame(createThreePlayerGame());
    const autoPick = screen.getByRole("button", {
      name: /^Auto-pick random god$/i,
    });

    fireEvent.click(autoPick);
    fireEvent.click(autoPick);

    expect(container.querySelectorAll(".three-draft-progress .draft-pip.done")).toHaveLength(1);
    expect(screen.getByText(/Red · Red picks/i)).toBeTruthy();
    expect(screen.getByRole("button", {
      name: /Inspect Quetzacoatl, claimed by White/i,
    })).toBeTruthy();
  });

  it("quick-drafts every remaining local pick without changing prior ownership", async () => {
    const config = createDefaultThreePlayerConfig();
    config.seats.red.control = { kind: "ai", difficulty: 5 };
    config.seats.black.control = { kind: "ai", difficulty: 5 };
    const initial = createThreePlayerGame(config);
    const onPersist = vi.fn((_: ThreePlayerState) => true);
    const { container } = render(
      <ThreePlayerGame
        initialState={initial}
        onPersist={onPersist}
        onQuit={() => undefined}
        onNewGame={() => undefined}
      />,
    );

    const draftActions = container.querySelector(".draft-auto-actions") as HTMLElement;
    expect(within(draftActions).getAllByRole("button").map((button) =>
      button.textContent?.replace(/\s+/g, " ").trim()
    )).toEqual(["Auto-pick random god", "Quick Draft"]);

    fireEvent.click(screen.getByRole("button", { name: /^Inspect Ares$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Claim Ares$/i }));
    let expected = threePlayerReducer(initial, { type: "draft", godId: "ares" });
    while (expected.phase === "draft") {
      expected = threePlayerReducer(expected, availableThreePlayerActions(expected)[0]);
    }

    const quickDraft = screen.getByRole("button", { name: /^quick draft$/i });
    fireEvent.click(quickDraft);
    fireEvent.click(quickDraft);

    await waitFor(() => {
      const persisted = onPersist.mock.calls.at(-1)?.[0];
      expect(persisted?.phase).toBe("play");
    });
    const completed = onPersist.mock.calls.at(-1)![0];
    const drafted = Object.values(completed.players).flatMap((player) => player.gods);
    expect(completed.draft.pickIndex).toBe(completed.draft.order.length);
    expect(completed.players.white.gods[0]).toBe("ares");
    expect(THREE_PLAYER_SEATS.map((seat) => completed.players[seat].gods))
      .toEqual(THREE_PLAYER_SEATS.map((seat) => expected.players[seat].gods));
    expect(new Set(drafted).size).toBe(9);
  });

  it("moves full history to the keyboard-focusable top bar control", () => {
    const state = completeDraft();
    state.history = ["White moved.", "Red captured.", "Black upgraded."];
    renderGame(state);

    expect(screen.queryByText("Unused Gods")).toBeNull();
    expect(screen.queryByText("Full history")).toBeNull();
    const history = screen.getByRole("button", { name: /^history$/i });
    history.focus();
    expect(document.activeElement).toBe(history);
    fireEvent.click(history);

    const drawer = screen.getByLabelText("Full history");
    expect(within(drawer).getByText("Chronicle")).toBeTruthy();
    expect(Array.from(drawer.querySelectorAll("p")).map(
      (entry) => entry.lastChild?.textContent,
    )).toEqual(["White moved.", "Red captured.", "Black upgraded."]);
    expect(screen.getByRole("button", { name: /^help$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^settings$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^undo$/i })).toBeTruthy();
    fireEvent.click(within(drawer).getByRole("button", { name: /close history/i }));
    expect(screen.queryByLabelText("Full history")).toBeNull();
  });

  it("keeps long history entries in a dedicated keyboard-scrollable body", () => {
    const state = completeDraft();
    state.history = Array.from(
      { length: 80 },
      (_, index) => `Chronicle entry ${index + 1}`,
    );
    renderGame(state);

    fireEvent.click(screen.getByRole("button", { name: /^history$/i }));

    const drawer = screen.getByLabelText("Full history");
    const body = screen.getByLabelText("Chronicle entries");
    const close = screen.getByRole("button", { name: /close history/i });
    expect(body.className).toBe("history-drawer-body");
    expect((body as HTMLElement).tabIndex).toBe(0);
    expect(body.contains(screen.getByText("Chronicle entry 80"))).toBe(true);
    expect(body.contains(close)).toBe(false);
    expect(drawer.firstElementChild?.className).toBe("history-drawer-header");
  });

  it("inspects an unclaimed God and advances exactly one draft pick", () => {
    const { container } = renderGame(createThreePlayerGame());

    fireEvent.click(screen.getByRole("button", { name: /^Inspect Ares$/i }));
    const claim = screen.getByRole("button", { name: /^Claim Ares$/i });
    expect((claim as HTMLButtonElement).disabled).toBe(false);
    expect(container.querySelectorAll(".three-draft-progress .draft-pip.done")).toHaveLength(0);

    fireEvent.click(claim);

    expect(screen.getByText(/Red · Red picks/i)).toBeTruthy();
    expect(container.querySelectorAll(".three-draft-progress .draft-pip.done")).toHaveLength(1);
    expect(container.querySelector(".three-draft-progress .draft-pip.current")?.textContent)
      .toContain("2R");
    expect((screen.getByRole("button", { name: /^Claimed by White$/i }) as HTMLButtonElement).disabled)
      .toBe(true);
  });

  it("keeps all twelve Gods inspectable and labels a claimed God with its owner", () => {
    const state = threePlayerReducer(createThreePlayerGame(), {
      type: "draft",
      godId: "quetzacoatl",
    });
    const { container } = renderGame(state);

    expect(container.querySelectorAll(".pantheon-grid .draft-card")).toHaveLength(12);
    fireEvent.click(screen.getByRole("button", {
      name: /Inspect Quetzacoatl, claimed by White/i,
    }));
    expect((screen.getByRole("button", { name: /^Claimed by White$/i }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect(screen.getByRole("button", { name: /^Inspect Ares$/i })).toBeTruthy();
    expect(container.querySelectorAll(".three-draft-progress .draft-pip")).toHaveLength(9);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: /game paused locally/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^resume$/i }));
    expect((screen.getByRole("button", { name: /^Claimed by White$/i }) as HTMLButtonElement).disabled)
      .toBe(true);
  });

  it("previews Level 2 and Level 3 ability rules in the God inspector", () => {
    renderGame(createThreePlayerGame());
    const god = GOD_BY_ID.quetzacoatl;

    expect(screen.queryByText(god.abilities[0].details[1])).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Lv 2/i }));
    expect(screen.getByText(god.abilities[0].details[1])).toBeTruthy();
    expect(screen.queryByText(god.abilities[0].details[2])).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Lv 3/i }));
    expect(screen.getByText(god.abilities[0].details[2])).toBeTruthy();
  });

  it("uses the compact draft layout without nested controls and exposes all roster slots", () => {
    const { container } = renderGame(createThreePlayerGame());

    expect(container.querySelector(".three-draft-layout > .pantheon-grid")).toBeTruthy();
    expect(container.querySelector(".three-draft-layout > .god-inspector")).toBeTruthy();
    const abilityRegion = screen.getByRole("region", { name: /Quetzacoatl ability details/i });
    const inspector = abilityRegion.closest(".three-god-inspector");
    const claim = screen.getByRole("button", { name: /^Claim Quetzacoatl$/i });
    expect(abilityRegion.classList.contains("three-draft-abilities")).toBe(true);
    expect(abilityRegion.getAttribute("tabindex")).toBe("0");
    expect(inspector?.children[2]).toBe(abilityRegion);
    expect(inspector?.lastElementChild).toBe(claim);
    expect(abilityRegion.contains(container.querySelector(".mini-cost"))).toBe(true);
    expect(container.querySelectorAll(".pantheon-grid > .draft-card")).toHaveLength(12);
    expect(container.querySelectorAll(".three-draft-claim")).toHaveLength(1);
    expect(container.querySelectorAll(".three-draft-rosters .draft-roster")).toHaveLength(3);
    expect(container.querySelectorAll(".three-draft-rosters .empty-sigil")).toHaveLength(9);
    expect(container.querySelectorAll(".escape-menu-trigger[data-placement='top-right']")).toHaveLength(1);
    expect(container.querySelector("button button")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /open match menu/i }));
    expect(screen.queryByRole("button", { name: /^restart$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^new setup$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^new online room$/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^resume$/i }));
  });

  it("preserves the nine-pick order, three Gods per seat, and three unused Gods", () => {
    const order = [
      "white",
      "red",
      "black",
      "black",
      "red",
      "white",
      "white",
      "red",
      "black",
    ] as const;
    const picks = GODS.slice(0, 9).map((god) => god.id);
    let state = createThreePlayerGame();

    order.forEach((seat, index) => {
      expect(state.activeSeat).toBe(seat);
      state = threePlayerReducer(state, { type: "draft", godId: picks[index] });
      expect(state.draft.pickIndex).toBe(index + 1);
    });

    expect(state.phase).toBe("play");
    expect(state.players.white.gods).toEqual([picks[0], picks[5], picks[6]]);
    expect(state.players.red.gods).toEqual([picks[1], picks[4], picks[7]]);
    expect(state.players.black.gods).toEqual([picks[2], picks[3], picks[8]]);
    expect(state.draft.unused).toEqual(GODS.slice(9).map((god) => god.id));
  });

  it("auto-drafts consecutive AI seats one pick at a time until the next Human turn", async () => {
    const terminateWorker = installDeterministicAiWorker();
    vi.spyOn(window, "matchMedia").mockImplementation(matchMedia(true));
    vi.spyOn(Math, "random").mockReturnValue(0);
    const config = createDefaultThreePlayerConfig();
    config.seats.red.control = { kind: "ai", difficulty: 1 };
    config.seats.black.control = { kind: "ai", difficulty: 1 };
    const { container, unmount } = renderGame(createThreePlayerGame(config));

    fireEvent.click(screen.getByRole("button", {
      name: /^Auto-pick random god$/i,
    }));

    await waitFor(() => {
      expect(screen.getByText(/White · White picks/i)).toBeTruthy();
      expect(container.querySelectorAll(".three-draft-progress .draft-pip.done")).toHaveLength(5);
    });
    expect(container.querySelector(".three-draft-progress .draft-pip.current")?.textContent)
      .toContain("6W");
    unmount();
    expect(terminateWorker).toHaveBeenCalledTimes(1);
  });

  it("disables or hides auto-pick when draft input is not authorized", () => {
    const localAiConfig = createDefaultThreePlayerConfig();
    localAiConfig.seats.white.control = { kind: "ai", difficulty: 1 };
    const { rerender } = render(
      <ThreePlayerGame
        initialState={createThreePlayerGame(localAiConfig)}
        onQuit={() => undefined}
        onNewGame={() => undefined}
      />,
    );
    expect((screen.getByRole("button", {
      name: /^Auto-pick random god$/i,
    }) as HTMLButtonElement).disabled).toBe(true);

    const onlineConfig = createDefaultThreePlayerConfig();
    onlineConfig.seats.white.control = { kind: "online", local: false };
    onlineConfig.seats.red.control = { kind: "online", local: true };
    onlineConfig.seats.black.control = { kind: "ai", difficulty: 1 };
    const onlineState = createThreePlayerGame(onlineConfig);
    const onlineSession: ThreePlayerOnlineSession = {
      roomCode: "ABCDE",
      role: "peer",
      participantSeat: "red",
      status: "playing",
      awaitingSync: false,
      undoAvailable: false,
      onAction: vi.fn(),
      onUndoRequest: vi.fn(),
      onUndoVote: vi.fn(),
    };
    rerender(
      <ThreePlayerGame
        initialState={onlineState}
        onQuit={() => undefined}
        onNewGame={() => undefined}
        onlineSession={onlineSession}
      />,
    );
    expect((screen.getByRole("button", {
      name: /^Auto-pick random god$/i,
    }) as HTMLButtonElement).disabled).toBe(true);

    rerender(
      <ThreePlayerGame
        initialState={onlineState}
        onQuit={() => undefined}
        onNewGame={() => undefined}
        onlineSession={{
          ...onlineSession,
          participantSeat: "white",
          awaitingSync: true,
        }}
      />,
    );
    expect((screen.getByRole("button", {
      name: /^Auto-pick random god$/i,
    }) as HTMLButtonElement).disabled).toBe(true);

    rerender(
      <ThreePlayerGame
        initialState={onlineState}
        onQuit={() => undefined}
        onNewGame={() => undefined}
        onlineSession={{
          ...onlineSession,
          participantSeat: "white",
          status: "paused",
        }}
      />,
    );
    expect((screen.getByRole("button", {
      name: /^Auto-pick random god$/i,
    }) as HTMLButtonElement).disabled).toBe(true);

    cleanup();
    renderGame(completeDraft());
    expect(screen.queryByRole("button", {
      name: /^Auto-pick random god$/i,
    })).toBeNull();
  });

  it("shows live neutral affinity for hex boards across online snapshots", async () => {
    const config = createDefaultThreePlayerConfig();
    config.boardVariant = "triad";
    config.seats.white.control = { kind: "online", local: true };
    config.seats.red.control = { kind: "online", local: false };
    config.seats.black.control = { kind: "ai", difficulty: 1 };
    const lightState = completeDraft(createThreePlayerGame(config));
    const onlineSession: ThreePlayerOnlineSession = {
      roomCode: "ABCDE",
      role: "host",
      participantSeat: "white",
      status: "playing",
      awaitingSync: false,
      undoAvailable: false,
      onAction: vi.fn(),
      onUndoRequest: vi.fn(),
      onUndoVote: vi.fn(),
    };
    const { rerender } = render(
      <ThreePlayerGame
        initialState={lightState}
        onQuit={() => undefined}
        onNewGame={() => undefined}
        onlineSession={onlineSession}
      />,
    );

    expect(screen.getByRole("status").textContent)
      .toMatch(/Gray spaces count as Light this turn/i);

    const darkState = structuredClone(lightState);
    darkState.turn = 2;
    darkState.revision += 1;
    rerender(
      <ThreePlayerGame
        initialState={darkState}
        onQuit={() => undefined}
        onNewGame={() => undefined}
        onlineSession={onlineSession}
      />,
    );

    await waitFor(() => expect(screen.getByRole("status").textContent)
      .toMatch(/Gray spaces count as Dark this turn/i));
  });

  it("updates neutral affinity after local undo and hides it on other boards", () => {
    const config = createDefaultThreePlayerConfig();
    config.boardVariant = "three-hexagonal";
    const lightState = completeDraft(createThreePlayerGame(config));
    const darkState = structuredClone(lightState);
    darkState.turn = 2;
    darkState.revision += 1;
    const rendered = render(
      <ThreePlayerGame
        initialState={darkState}
        initialUndoHistory={[lightState]}
        onQuit={() => undefined}
        onNewGame={() => undefined}
      />,
    );
    expect(screen.getByRole("status").textContent)
      .toMatch(/Gray spaces count as Dark this turn/i);
    fireEvent.click(screen.getByRole("button", { name: /^Undo$/i }));
    expect(screen.getByRole("status").textContent)
      .toMatch(/Gray spaces count as Light this turn/i);

    rendered.unmount();
    renderGame(completeDraft());
    expect(screen.queryByText(/Gray spaces count as/i)).toBeNull();
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
    expect(screen.getAllByRole("button", { name: /open match menu/i })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /game menu/i })).toBeNull();
    expect(screen.getAllByRole("gridcell")[0].getAttribute("aria-disabled")).toBe("true");
  });

  it("offers local Restart and New setup from the single top-right menu", () => {
    const onNewGame = vi.fn();
    const { container } = render(
      <ThreePlayerGame
        initialState={completeDraft()}
        onQuit={() => undefined}
        onNewGame={onNewGame}
      />,
    );

    expect(container.querySelectorAll(".escape-menu-trigger")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /open match menu/i }));
    expect(screen.getByRole("button", { name: /^restart$/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^new setup$/i }));
    expect(onNewGame).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /open match menu/i }));
    fireEvent.click(screen.getByRole("button", { name: /^restart$/i }));

    expect(screen.getByRole("button", { name: /^Claim Quetzacoatl$/i })).toBeTruthy();
    expect(container.querySelectorAll(".three-draft-progress .draft-pip.done")).toHaveLength(0);
    expect(container.querySelectorAll(".three-draft-rosters .god-sigil")).toHaveLength(0);
  });

  it("offers New online room but never canonical Restart to online players", () => {
    const config = createDefaultThreePlayerConfig();
    config.seats.white.control = { kind: "online", local: true };
    config.seats.red.control = { kind: "online", local: false };
    config.seats.black.control = { kind: "ai", difficulty: 5 };
    const onNewGame = vi.fn();
    const { container } = render(
      <ThreePlayerGame
        initialState={completeDraft(createThreePlayerGame(config))}
        onQuit={() => undefined}
        onNewGame={onNewGame}
        onlineSession={{
          roomCode: "ABCDE",
          role: "peer",
          participantSeat: "white",
          status: "playing",
          awaitingSync: false,
          undoAvailable: false,
          onAction: vi.fn(),
          onUndoRequest: vi.fn(),
          onUndoVote: vi.fn(),
        }}
      />,
    );

    expect(container.querySelectorAll(".escape-menu-trigger")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /open match menu/i }));
    expect(screen.queryByRole("button", { name: /^restart$/i })).toBeNull();
    expect(screen.getByRole("button", { name: /^leave room$/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^new online room$/i }));
    expect(onNewGame).toHaveBeenCalledTimes(1);
  });

  it("opens the Escape menu without changing an in-progress match", () => {
    const state = completeDraft();
    renderGame(state);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: /game paused locally/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^resume$/i }));
    expect(screen.getAllByText(state.notice).length).toBeGreaterThan(0);
    expect(screen.getByText(/Round 1 · Turn 1/i)).toBeTruthy();
  });

  it("reaches primitive cell gameplay through God and ability actions", () => {
    const state = completeDraft();
    const { container } = renderGame(state);
    const firstGod = state.players.white.gods[0];
    fireEvent.click(screen.getByRole("button", { name: new RegExp(firstGod, "i") }));

    const ability = screen.getAllByRole("button").find((button) =>
      button.closest(".ability-list") && !button.hasAttribute("aria-disabled")
    );
    expect(ability).toBeTruthy();
    fireEvent.click(ability!);

    const legalCell = container.querySelector(".three-board-cell.legal")?.getAttribute("data-cell");
    expect(legalCell).toBeTruthy();
    fireEvent.click(screen.getByRole("gridcell", { name: new RegExp(`^${legalCell}`) }));
    expect(container.querySelector(".three-board-cell.selected, .three-board-cell.legal")).toBeTruthy();
  });

  it("uses the shared God rows, chosen-God header, and ability cards", () => {
    const state = completeDraft();
    const godId = state.players.white.gods[0];
    const god = GOD_BY_ID[godId];
    const { container } = renderGame(state);

    const godRow = screen.getByRole("button", { name: new RegExp(god.name, "i") });
    expect(godRow.classList.contains("god-row")).toBe(true);
    fireEvent.click(godRow);

    expect(container.querySelector(".chosen-god")).toBeTruthy();
    expect(container.querySelectorAll(".ability-list > .ability-card")).toHaveLength(
      god.abilities.length,
    );
    expect(container.querySelector(".three-pantheon-list")).toBeNull();
    expect(container.querySelector(".three-ability-card")).toBeNull();
  });

  it("inspects resting Gods read-only without bypassing action authorization", () => {
    const state = completeDraft();
    state.players.white.gods = ["teles"];
    state.rested = ["teles"];
    const { container } = renderGame(state);

    const resting = screen.getByRole("button", { name: /Teles/i });
    expect(resting.classList.contains("resting")).toBe(true);
    fireEvent.click(resting);

    expect(screen.getByText(/Teles is resting · abilities are unavailable/i)).toBeTruthy();
    expect(container.querySelectorAll(".ability-card.read-only")).toHaveLength(
      GOD_BY_ID.teles.abilities.length,
    );
    expect(container.querySelectorAll(".ability-card [role='button']")).toHaveLength(0);
  });

  it("routes shared-panel selections only for the authorized online seat", () => {
    const config = createDefaultThreePlayerConfig();
    config.seats.white.control = { kind: "online", local: true };
    config.seats.red.control = { kind: "online", local: false };
    config.seats.black.control = { kind: "ai", difficulty: 5 };
    const state = completeDraft(createThreePlayerGame(config));
    const onAction = vi.fn();
    const session: ThreePlayerOnlineSession = {
      roomCode: "ABCDE",
      role: "host",
      participantSeat: "white",
      status: "playing",
      awaitingSync: false,
      undoAvailable: false,
      onAction,
      onUndoRequest: vi.fn(),
      onUndoVote: vi.fn(),
    };
    const { rerender } = render(
      <ThreePlayerGame
        initialState={state}
        onQuit={() => undefined}
        onNewGame={() => undefined}
        onlineSession={session}
      />,
    );

    const god = GOD_BY_ID[state.players.white.gods[0]];
    fireEvent.click(screen.getByRole("button", { name: new RegExp(god.name, "i") }));
    expect(onAction).toHaveBeenCalledWith({ type: "select-god", godId: god.id });

    rerender(
      <ThreePlayerGame
        initialState={state}
        onQuit={() => undefined}
        onNewGame={() => undefined}
        onlineSession={{ ...session, participantSeat: "red" }}
      />,
    );
    const unauthorized = screen.getByRole("button", { name: new RegExp(god.name, "i") });
    expect((unauthorized as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(unauthorized);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("attaches pending follow-up choices to the initiating ability", () => {
    const state = completeDraft();
    state.players.white.gods = ["death"];
    state.selectedGod = "death";
    state.selectedAbility = "resurrect";
    state.pending = {
      godId: "death",
      abilityId: "resurrect",
      step: "resurrect-more",
    };
    state.notice = "Revive another piece?";
    renderGame(state);

    const card = screen.getByText("Resurrect").closest(".ability-card");
    expect(card).toBeTruthy();
    expect(within(card as HTMLElement).getByRole("status").textContent)
      .toContain("Revive another piece");
    expect(within(card as HTMLElement).getByRole("button", { name: /yes, continue/i }))
      .toBeTruthy();
    expect(within(card as HTMLElement).getByRole("button", { name: /no, finish/i }))
      .toBeTruthy();
    expect(screen.queryByRole("group", { name: /available actions/i })).toBeNull();
  });

  it("undoes a Human boundary together with the following AI chain", async () => {
    const terminateWorker = installDeterministicAiWorker();
    vi.spyOn(window, "matchMedia").mockImplementation(matchMedia(true));
    const config = createDefaultThreePlayerConfig();
    config.seats.red.control = { kind: "ai", difficulty: 1 };
    config.seats.black.control = { kind: "ai", difficulty: 1 };
    const state = completeDraft(createThreePlayerGame(config));
    const { container, unmount } = renderGame(state);

    const godButton = screen.getByRole("button", {
      name: new RegExp(state.players.white.gods[0], "i"),
    });
    fireEvent.click(godButton);
    const ability = screen.getAllByRole("button").find((button) =>
      button.closest(".ability-list") && !button.hasAttribute("aria-disabled")
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
    unmount();
    expect(terminateWorker).toHaveBeenCalledTimes(1);
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

  it("routes authorized online host draft actions and waits for canonical acknowledgement", () => {
    const config = createDefaultThreePlayerConfig();
    config.seats.white.control = { kind: "online", local: true };
    config.seats.red.control = { kind: "online", local: false };
    config.seats.black.control = { kind: "ai", difficulty: 5 };
    const state = createThreePlayerGame(config);
    const onAction = vi.fn();
    const onlineSession: ThreePlayerOnlineSession = {
      roomCode: "ABCDE",
      role: "host",
      participantSeat: "white",
      status: "playing",
      awaitingSync: false,
      undoAvailable: false,
      onAction,
      onUndoRequest: vi.fn(),
      onUndoVote: vi.fn(),
    };
    const { rerender } = render(
      <ThreePlayerGame
        initialState={state}
        onQuit={() => undefined}
        onNewGame={() => undefined}
        onlineSession={onlineSession}
      />,
    );

    fireEvent.click(screen.getByRole("button", {
      name: /Claim Quetzacoatl/i,
    }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/White picks/i)).toBeTruthy();

    const next = threePlayerReducer(
      state,
      onAction.mock.calls[0][0],
    );
    rerender(
      <ThreePlayerGame
        initialState={next}
        onQuit={() => undefined}
        onNewGame={() => undefined}
        onlineSession={{
          ...onlineSession,
          awaitingSync: true,
        }}
      />,
    );
    expect(screen.getByText(/Red picks/i)).toBeTruthy();
    expect(screen.queryByText(/Save & quit/i)).toBeNull();
    expect(screen.getByText(/Leave room/i)).toBeTruthy();
  });

  it("routes one authorized online auto-pick and locks repeated submissions until acknowledgement", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.25);
    const config = createDefaultThreePlayerConfig();
    config.seats.white.control = { kind: "online", local: true };
    config.seats.red.control = { kind: "online", local: false };
    config.seats.black.control = { kind: "ai", difficulty: 5 };
    const state = createThreePlayerGame(config);
    const onAction = vi.fn();
    render(
      <ThreePlayerGame
        initialState={state}
        onQuit={() => undefined}
        onNewGame={() => undefined}
        onlineSession={{
          roomCode: "ABCDE",
          role: "host",
          participantSeat: "white",
          status: "playing",
          awaitingSync: false,
          undoAvailable: false,
          onAction,
          onUndoRequest: vi.fn(),
          onUndoVote: vi.fn(),
        }}
      />,
    );
    const autoPick = screen.getByRole("button", {
      name: /^Auto-pick random god$/i,
    });

    fireEvent.click(autoPick);
    fireEvent.click(autoPick);

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({
      type: "draft",
      godId: GODS[Math.floor(GODS.length * 0.25)].id,
    });
    expect(screen.queryByRole("button", { name: /^quick draft$/i })).toBeNull();
    expect((screen.getByRole("button", {
      name: /^Auto-pick random god$/i,
    }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("gates an inactive online guest from confirming a draft pick", () => {
    const config = createDefaultThreePlayerConfig();
    config.seats.white.control = { kind: "online", local: false };
    config.seats.red.control = { kind: "online", local: true };
    config.seats.black.control = { kind: "ai", difficulty: 5 };
    const onAction = vi.fn();
    const state = createThreePlayerGame(config);

    render(
      <ThreePlayerGame
        initialState={state}
        onQuit={() => undefined}
        onNewGame={() => undefined}
        onlineSession={{
          roomCode: "ABCDE",
          role: "peer",
          participantSeat: "red",
          status: "playing",
          awaitingSync: false,
          undoAvailable: false,
          onAction,
          onUndoRequest: vi.fn(),
          onUndoVote: vi.fn(),
        }}
      />,
    );

    const claim = screen.getByRole("button", { name: /^Claim Quetzacoatl$/i });
    expect((claim as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(claim);
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByText(/White · White picks/i)).toBeTruthy();
  });

  it("locks online input during pause and unanimous undo voting", () => {
    const config = createDefaultThreePlayerConfig();
    config.seats.white.control = { kind: "online", local: true };
    config.seats.red.control = { kind: "online", local: false };
    config.seats.black.control = { kind: "ai", difficulty: 5 };
    const state = createThreePlayerGame(config);
    const onVote = vi.fn();
    const onlineSession: ThreePlayerOnlineSession = {
      roomCode: "ABCDE",
      role: "peer",
      participantSeat: "white",
      status: "playing",
      awaitingSync: false,
      undoAvailable: true,
      undoProposal: {
        requestId: "undo-1",
        targetRevision: 0,
        requestedByName: "Host",
        eligibleCount: 2,
        approvedCount: 1,
        localEligible: true,
        localApproved: false,
      },
      onAction: vi.fn(),
      onUndoRequest: vi.fn(),
      onUndoVote: onVote,
    };
    const { rerender } = render(
      <ThreePlayerGame
        initialState={state}
        onQuit={() => undefined}
        onNewGame={() => undefined}
        onlineSession={onlineSession}
      />,
    );

    expect(screen.getByRole("heading", {
      name: /requested a rollback/i,
    })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /approve undo/i }));
    expect(onVote).toHaveBeenCalledWith(true);

    rerender(
      <ThreePlayerGame
        initialState={state}
        onQuit={() => undefined}
        onNewGame={() => undefined}
        onlineSession={{
          ...onlineSession,
          undoProposal: undefined,
          status: "paused",
          pausedSeat: "red",
          pausedParticipantName: "Guest",
        }}
      />,
    );
    expect(screen.getByRole("heading", {
      name: /waiting for guest/i,
    })).toBeTruthy();
  });

  it("supports result inspection, post-game undo enablement, and local rollback", () => {
    const playable = completeDraft();
    const finished = structuredClone(playable);
    finished.phase = "gameover";
    finished.result = { kind: "draw", reason: "stalemate-cycle" };
    finished.passCycle = {
      positionRevision: finished.positionRevision,
      passedSeats: ["white", "red", "black"],
    };
    finished.notice = "White wins.";
    const { container } = render(
      <ThreePlayerGame
        initialState={finished}
        initialUndoHistory={[playable]}
        undoPreferred={false}
        onUndoPreferenceChange={vi.fn()}
        onQuit={vi.fn()}
        onNewGame={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /see board/i }));
    expect(screen.getByRole("button", { name: /view result/i })).toBeTruthy();
    expect(screen.getAllByRole("gridcell")[0].getAttribute("aria-disabled")).toBe("true");
    expect(container.querySelector(".finished-view")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /view result/i }));
    fireEvent.click(screen.getByRole("button", { name: /enable undo/i }));
    fireEvent.click(screen.getByRole("switch", { name: /allow undo/i }));
    fireEvent.click(screen.getByRole("button", { name: /close settings/i }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", {
      name: /^undo$/i,
    }));

    expect(screen.queryByText(/match finished/i)).toBeNull();
    expect(container.querySelector(".finished-view")).toBeNull();
    expect(screen.getAllByRole("gridcell").some(
      (cell) => cell.getAttribute("aria-disabled") === "false",
    )).toBe(true);
  });

  it("keeps authoritative result viewing local and preserves online undo authorization", async () => {
    const config = createDefaultThreePlayerConfig();
    config.seats.white.control = { kind: "online", local: true };
    config.seats.red.control = { kind: "online", local: false };
    config.seats.black.control = { kind: "ai", difficulty: 5 };
    const playable = completeDraft(createThreePlayerGame(config));
    const finished = structuredClone(playable);
    finished.phase = "gameover";
    finished.result = { kind: "draw", reason: "stalemate-cycle" };
    finished.passCycle = {
      positionRevision: finished.positionRevision,
      passedSeats: ["white", "red", "black"],
    };
    finished.revision += 1;
    const onUndoRequest = vi.fn();
    const guestSession: ThreePlayerOnlineSession = {
      roomCode: "ABCDE",
      role: "peer",
      participantSeat: "red",
      status: "finished",
      awaitingSync: false,
      undoAvailable: false,
      onAction: vi.fn(),
      onUndoRequest,
      onUndoVote: vi.fn(),
    };
    const { rerender } = render(
      <ThreePlayerGame
        initialState={finished}
        onQuit={vi.fn()}
        onNewGame={vi.fn()}
        onlineSession={guestSession}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /see board/i }));
    expect(screen.getAllByRole("gridcell")[0].getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /view result/i }));
    expect((screen.getByRole("button", { name: /undo unavailable/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(onUndoRequest).not.toHaveBeenCalled();

    const replacedFinished = structuredClone(finished);
    replacedFinished.revision += 1;
    rerender(
      <ThreePlayerGame
        initialState={replacedFinished}
        onQuit={vi.fn()}
        onNewGame={vi.fn()}
        onlineSession={guestSession}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: /^draw$/i })).toBeTruthy()
    );

    const hostSession: ThreePlayerOnlineSession = {
      ...guestSession,
      role: "host",
      participantSeat: "white",
      undoAvailable: true,
    };
    rerender(
      <ThreePlayerGame
        initialState={replacedFinished}
        onQuit={vi.fn()}
        onNewGame={vi.fn()}
        onlineSession={hostSession}
      />,
    );
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", {
      name: /^undo$/i,
    }));
    expect(onUndoRequest).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /view result/i })).toBeTruthy();

    rerender(
      <ThreePlayerGame
        initialState={playable}
        onQuit={vi.fn()}
        onNewGame={vi.fn()}
        onlineSession={{
          ...hostSession,
          status: "playing",
          undoAvailable: false,
        }}
      />,
    );
    await waitFor(() => expect(screen.queryByText(/match finished/i)).toBeNull());
    expect(screen.getAllByRole("gridcell").some(
      (cell) => cell.getAttribute("aria-disabled") === "false",
    )).toBe(true);
  });

  it("shows both Enchant stages beneath the ability with source highlights", async () => {
    let enemyMove = completeDraft();
    enemyMove.activeSeat = "white";
    enemyMove.rested = [];
    enemyMove.players.white.gods = ["teles"];
    enemyMove.players.red.gods = ["ares"];
    enemyMove.players.black.gods = ["midas"];
    enemyMove.players.white.orbs = { light: 50, dark: 50 };
    enemyMove = threePlayerReducer(enemyMove, {
      type: "select-god",
      godId: "teles",
    });
    enemyMove = threePlayerReducer(enemyMove, {
      type: "select-ability",
      abilityId: "enchant",
    });
    const firstRender = renderGame(enemyMove);
    const { container } = firstRender;
    const enchantCard = screen.getByText("Enchant").closest(".ability-card");
    expect(enchantCard).toBeTruthy();
    expect(within(enchantCard as HTMLElement).getByText(/choose a highlighted hostile piece/i))
      .toBeTruthy();
    expect(container.querySelectorAll(".three-board-cell.legal-source").length)
      .toBeGreaterThan(0);

    let followup = enemyMove;
    const source = followup.legalCells[0];
    followup = threePlayerReducer(followup, { type: "cell", cell: source });
    followup = threePlayerReducer(followup, {
      type: "cell",
      cell: followup.legalCells[0],
    });
    if (followup.legalPaths.length) {
      followup = threePlayerReducer(followup, {
        type: "path",
        pathId: followup.legalPaths[0],
      });
    }
    expect(followup.pending?.step).toBe("enchant-followup-move");

    firstRender.unmount();
    const followupRender = renderGame(followup);
    const followupCard = screen.getByText("Enchant").closest(".ability-card");
    expect(followupCard).toBeTruthy();
    expect(within(followupCard as HTMLElement).getByText(/make one ordinary legal move/i))
      .toBeTruthy();
    expect(followupRender.container.querySelectorAll(".three-board-cell.legal-source").length)
      .toBeGreaterThan(0);
  });

  it("highlights and selects a hostile King for Salem Hex", () => {
    let state = completeDraft();
    state.activeSeat = "white";
    state.rested = [];
    state.players.white.gods = ["salem"];
    state.players.red.gods = ["ares"];
    state.players.black.gods = ["midas"];
    state.players.white.orbs = { light: 50, dark: 50 };
    const whiteKing = Object.entries(state.board).find(([, piece]) =>
      piece.type === "king" && piece.controller === "white"
    )![0];
    const redKing = Object.entries(state.board).find(([, piece]) =>
      piece.type === "king" && piece.controller === "red"
    )![0];
    state = threePlayerReducer(state, {
      type: "select-god",
      godId: "salem",
    });
    state = threePlayerReducer(state, {
      type: "select-ability",
      abilityId: "hex",
    });

    const { container } = renderGame(state);
    expect(container.querySelector(
      `[data-cell="${redKing}"].legal-destination`,
    )).toBeTruthy();
    expect(container.querySelector(
      `[data-cell="${whiteKing}"].legal-destination`,
    )).toBeNull();
    fireEvent.click(screen.getByRole("gridcell", { name: new RegExp(redKing) }));
    expect(screen.getAllByText(/choose a piece to move/i).length)
      .toBeGreaterThan(0);
    expect(screen.getByRole("gridcell", { name: new RegExp(redKing) }))
      .toBeTruthy();
  });
});
