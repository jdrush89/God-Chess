// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  availableThreePlayerActions,
  createThreePlayerGame,
  threePlayerReducer,
} from "../game/threePlayerEngine";
import { createDefaultThreePlayerConfig } from "../game/threePlayerConfig";
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
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: /game paused locally/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^resume$/i }));
    expect((screen.getByRole("button", { name: /Claimed by White/i }) as HTMLButtonElement).disabled).toBe(true);
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

  it("routes online actions to the host and waits for canonical acknowledgement", () => {
    const config = createDefaultThreePlayerConfig();
    config.seats.white.control = { kind: "online", local: true };
    config.seats.red.control = { kind: "online", local: false };
    config.seats.black.control = { kind: "ai", difficulty: 5 };
    const state = createThreePlayerGame(config);
    const onAction = vi.fn();
    const onlineSession: ThreePlayerOnlineSession = {
      roomCode: "ABCDE",
      role: "peer",
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
    const enchantCard = screen.getByText("Enchant").closest(".three-ability-card");
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
    const followupCard = screen.getByText("Enchant").closest(".three-ability-card");
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
