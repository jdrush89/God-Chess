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
    const config = createDefaultThreePlayerConfig();
    config.seats.red.control = { kind: "ai", difficulty: 1 };
    config.seats.black.control = { kind: "ai", difficulty: 1 };
    const { container, unmount } = renderGame(createThreePlayerGame(config));

    fireEvent.click(screen.getByRole("button", { name: /^Claim Quetzacoatl$/i }));

    await waitFor(() => {
      expect(screen.getByText(/White · White picks/i)).toBeTruthy();
      expect(container.querySelectorAll(".three-draft-progress .draft-pip.done")).toHaveLength(5);
    });
    expect(container.querySelector(".three-draft-progress .draft-pip.current")?.textContent)
      .toContain("6W");
    unmount();
    expect(terminateWorker).toHaveBeenCalledTimes(1);
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
    expect(screen.getByText(state.notice)).toBeTruthy();
    expect(screen.getByText(/Round 1 · Turn 1/i)).toBeTruthy();
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

    const card = screen.getByText("Resurrect").closest(".three-ability-card");
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
});
