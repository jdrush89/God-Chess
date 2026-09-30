// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import App from "../App";
import { createFourPlayerGame, fourPlayerReducer } from "../game/fourPlayerEngine";
import { GODS } from "../game/gods";
import { createSavedGame } from "../saves";
import { FourPlayerGame } from "./FourPlayerGame";
import { createFourPlayerOnlineConfig } from "../multiplayer/fourPlayerRoom";

const SAVE_KEY = "god-chess-saves-v2";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
  Object.defineProperty(HTMLElement.prototype, "animate", {
    writable: true,
    value: () => ({}),
  });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const openFourPlayerSetup = () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /^new game$/i }));
  fireEvent.click(screen.getByRole("button", { name: /four-player local/i }));
};

describe("four-player app integration", () => {
  it("offers four-player mode and validates that one seat remains Human", () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^new game$/i }));
    expect(screen.getByRole("button", { name: /four-player local/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /four-player local/i }));
    expect(screen.getByRole("heading", { name: /gather four pantheons/i })).toBeTruthy();

    for (const card of container.querySelectorAll(".four-seat-setup-card")) {
      fireEvent.click(within(card as HTMLElement).getByRole("button", { name: /^ai$/i }));
    }
    expect(screen.getByRole("alert").textContent).toMatch(/at least one seat must be human/i);
    expect((screen.getByRole("button", { name: /begin four-player draft/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("starts an all-Human snake draft with twelve unique picks", () => {
    openFourPlayerSetup();
    fireEvent.click(screen.getByRole("button", { name: /begin four-player draft/i }));
    expect(screen.getByText(/player 1.*north picks/i)).toBeTruthy();
    expect(screen.getAllByText(/choose your gods/i).length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".four-draft-progress .draft-pip")).toHaveLength(12);
  });

  it("previews level two and three ability rules during the four-player draft", () => {
    openFourPlayerSetup();
    fireEvent.click(screen.getByRole("button", { name: /begin four-player draft/i }));

    expect(screen.queryByText(/enemy piece you fly over/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /lv 2/i }));
    expect(screen.getByText(/enemy piece you fly over/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /lv 3/i }));
    expect(screen.getByText(/friendly piece you fly over/i)).toBeTruthy();
  });

  it("keeps drafted Gods inspectable while preventing them from being claimed again", () => {
    openFourPlayerSetup();
    fireEvent.click(screen.getByRole("button", { name: /begin four-player draft/i }));
    fireEvent.click(screen.getByRole("button", { name: /ares conflict/i }));
    fireEvent.click(screen.getByRole("button", { name: /claim ares/i }));

    const claimedAres = screen.getByRole("button", { name: /ares conflict/i });
    fireEvent.click(claimedAres);

    expect(screen.getByRole("heading", { name: "Ares" })).toBeTruthy();
    expect(screen.getByText("Threaten")).toBeTruthy();
    expect((screen.getByRole("button", { name: /claim ares/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("uses per-seat AI difficulty and advances chained AI draft seats", async () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^new game$/i }));
    fireEvent.click(screen.getByRole("button", { name: /four-player local/i }));
    for (const seat of ["east", "west"]) {
      const card = container.querySelector(`.four-seat-setup-card.seat-${seat}`) as HTMLElement;
      fireEvent.click(within(card).getByRole("button", { name: /^ai$/i }));
      fireEvent.change(within(card).getByRole("slider"), { target: { value: "3" } });
      expect(within(card).getByText("3")).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("button", { name: /begin four-player draft/i }));
    fireEvent.click(screen.getByRole("button", { name: /ares conflict/i }));
    fireEvent.click(screen.getByRole("button", { name: /claim ares/i }));
    expect(await screen.findByText(/player 3.*south picks/i, {}, { timeout: 3000 })).toBeTruthy();
  });

  it("persists team layout, alternating turns, victory, and takeover options", async () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^new game$/i }));
    fireEvent.click(screen.getByRole("button", { name: /four-player local/i }));
    fireEvent.click(screen.getByRole("button", { name: /2v2 teams/i }));
    fireEvent.click(
      within(container.querySelector(".four-seat-setup-card.seat-east") as HTMLElement)
        .getByRole("button", { name: /team a/i }),
    );
    fireEvent.click(
      within(container.querySelector(".four-seat-setup-card.seat-south") as HTMLElement)
        .getByRole("button", { name: /team b/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /first king captured/i }));
    fireEvent.click(screen.getByLabelText(/piece takeover/i));
    fireEvent.click(screen.getByLabelText(/alternate teams/i));
    fireEvent.click(screen.getByRole("button", { name: /begin four-player draft/i }));
    fireEvent.click(screen.getByRole("button", { name: /save & quit/i }));
    await waitFor(() => expect(screen.getByRole("img", { name: /god chess/i })).toBeTruthy());

    const stored = JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? "[]");
    expect(stored[0].state.config).toMatchObject({
      mode: "teams",
      teams: {
        north: "team-a",
        east: "team-a",
        south: "team-b",
        west: "team-b",
      },
      turnPolicy: "alternate-teams",
      victoryMode: "first-king-captured",
      takeover: true,
    });
  });

  it("renders the 160-square cross-board with void corners and four seat panels", () => {
    let state = createFourPlayerGame();
    for (const god of GODS) state = fourPlayerReducer(state, { type: "draft", godId: god.id });
    window.localStorage.setItem(SAVE_KEY, JSON.stringify([
      createSavedGame("four-board", state, []),
    ]));

    const { container } = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /load game/i }));
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));

    expect(screen.getAllByRole("gridcell")).toHaveLength(160);
    expect(container.querySelectorAll(".four-board-outside")).toHaveLength(36);
    expect(container.querySelectorAll(".four-player-panel")).toHaveLength(4);
    expect(screen.getByRole("gridcell", { name: /g14, north king/i })).toBeTruthy();
    const northPanel = container.querySelector(".four-player-panel.seat-north") as HTMLElement;
    expect(
      northPanel.querySelector(".four-panel-resources > .four-panel-menu"),
    ).toBeTruthy();
    expect(container.querySelectorAll("[data-orb-target]")).toHaveLength(8);
    expect(
      container.querySelector('[data-orb-target="north-light"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-orb-target="west-dark"]'),
    ).toBeTruthy();
  });

  it("labels inert and takeover-controlled pieces accessibly", () => {
    let state = createFourPlayerGame();
    for (const god of GODS) state = fourPlayerReducer(state, { type: "draft", godId: god.id });
    delete state.board.n8;
    state.players.east.eliminated = true;
    state.players.east.eliminatedBy = "north";
    for (const piece of Object.values(state.board)) {
      if (piece.owner === "east") piece.controller = null;
    }
    state.board.m7.controller = null;
    state.board.m8.controller = "north";
    window.localStorage.setItem(SAVE_KEY, JSON.stringify([
      createSavedGame("four-control", state, []),
    ]));

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /load game/i }));
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));

    expect(screen.getByRole("gridcell", { name: /m7.*inert/i })).toBeTruthy();
    expect(screen.getByRole("img", { name: /m8.*controlled by north/i })).toBeTruthy();
  });

  it("shows a finish control for automatic prepared Snipe Shot prompts", () => {
    let state = createFourPlayerGame();
    for (const god of GODS) state = fourPlayerReducer(state, { type: "draft", godId: god.id });
    const preparedSquare = Object.entries(state.board)
      .find(([, piece]) => piece.controller === state.activeSeat)?.[0];
    expect(preparedSquare).toBeTruthy();
    state.board[preparedSquare!].status.prepared = {
      owner: state.activeSeat,
      level: 1,
    };
    state.pending = {
      godId: "artemis",
      abilityId: "snipe-shot",
      step: "snipe-source",
    };
    state.legalTargets = [preparedSquare!];
    state.notice = "Prepared Shot: choose a prepared piece or pass.";
    window.localStorage.setItem(SAVE_KEY, JSON.stringify([
      createSavedGame("prepared-shot", state, []),
    ]));

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /load game/i }));
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));

    const finish = screen.getByRole("button", { name: /pass \/ finish/i });
    fireEvent.click(finish);
    expect(screen.queryByRole("button", { name: /pass \/ finish/i })).toBeNull();
    expect(screen.getAllByText(/skipped the prepared shot/i).length).toBeGreaterThan(0);
  });

  it("previews higher levels while listing every four-player upgrade", () => {
    let state = createFourPlayerGame();
    for (const god of GODS) state = fourPlayerReducer(state, { type: "draft", godId: god.id });
    state.phase = "upgrade";
    state.activeSeat = "north";
    state.upgradeQueue = ["north"];

    render(
      <FourPlayerGame
        initialState={state}
        undoPreferred={false}
        onUndoPreferenceChange={vi.fn()}
        onPersist={vi.fn(async () => false)}
        onQuit={vi.fn()}
        onNewGame={vi.fn()}
      />,
    );

    expect(document.querySelectorAll(".four-upgrade-list .four-ability-card")).toHaveLength(9);
    expect(screen.queryByText(/enemy piece you fly over/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /lv 2/i }));
    expect(screen.getByText(/enemy piece you fly over/i)).toBeTruthy();
  });

  it("disables back, cancellation, and ability switching after committed progress", () => {
    let state = createFourPlayerGame();
    const draftOrder = [
      GODS.find((god) => god.id === "midas")!,
      ...GODS.filter((god) => god.id !== "midas"),
    ];
    for (const god of draftOrder) {
      state = fourPlayerReducer(state, { type: "draft", godId: god.id });
    }
    state.selectedGod = "midas";
    state.selectedAbility = "military-funding";
    const movedPawn = Object.values(state.board)
      .find((piece) => piece.controller === state.activeSeat && piece.type === "pawn")!;
    state.pending = {
      godId: "midas",
      abilityId: "military-funding",
      step: "funding",
      selected: [movedPawn.id],
    };
    state.notice = "Move another pawn or finish.";
    window.localStorage.setItem(SAVE_KEY, JSON.stringify([
      createSavedGame("committed-action", state, []),
    ]));

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /load game/i }));
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));

    expect(
      (screen.getByRole("button", { name: /choose a different god/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.queryByRole("button", { name: /cancel ability/i })).toBeNull();
    expect(
      (screen.getByRole("button", { name: /barter/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("saves and reloads four-player draft state without misclassifying it", async () => {
    openFourPlayerSetup();
    fireEvent.click(screen.getByRole("button", { name: /begin four-player draft/i }));
    fireEvent.click(screen.getByRole("button", { name: /ares conflict/i }));
    fireEvent.click(screen.getByRole("button", { name: /claim ares/i }));
    fireEvent.click(screen.getByRole("button", { name: /save & quit/i }));

    await waitFor(() => expect(screen.getByRole("img", { name: /god chess/i })).toBeTruthy());
    const stored = JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? "[]");
    expect(stored[0].state.variant).toBe("four-player");
    expect(stored[0].state.players.north.gods).toEqual(["ares"]);

    fireEvent.click(screen.getByRole("button", { name: /load game/i }));
    expect(screen.getByText(/four-player ffa/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));
    expect(screen.getByText(/player 2.*east picks/i)).toBeTruthy();
  });

  it("restores saved four-player undo history to the prior stable draft pick", async () => {
    openFourPlayerSetup();
    fireEvent.click(screen.getByRole("button", { name: /begin four-player draft/i }));
    fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    fireEvent.click(screen.getByRole("switch", { name: /allow undo/i }));
    fireEvent.click(screen.getByRole("button", { name: /close settings/i }));
    fireEvent.click(screen.getByRole("button", { name: /ares conflict/i }));
    fireEvent.click(screen.getByRole("button", { name: /claim ares/i }));
    expect(screen.getByText(/player 2.*east picks/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /save & quit/i }));
    await waitFor(() => expect(screen.getByRole("img", { name: /god chess/i })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /load game/i }));
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));
    const undo = screen.getByRole("button", { name: /^undo$/i });
    expect((undo as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(undo);
    expect(screen.getByText(/player 1.*north picks/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /ares conflict/i }));
    expect((screen.getByRole("button", { name: /claim ares/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("gates online draft input to the assigned synchronized seat and hides Save & Quit", () => {
    const config = createFourPlayerOnlineConfig();
    config.seats.north.name = "Host";
    config.seats.north.control = {
      kind: "online",
      participantId: "host",
      local: true,
    };
    const state = createFourPlayerGame(config);
    const onAction = vi.fn();
    render(
      <FourPlayerGame
        initialState={state}
        undoPreferred={false}
        onUndoPreferenceChange={vi.fn()}
        onPersist={vi.fn(async () => false)}
        onQuit={vi.fn()}
        onNewGame={vi.fn()}
        onlineSession={{
          roomCode: "ABCDE",
          role: "host",
          participantSeat: "north",
          status: "playing",
          awaitingSync: false,
          undoConsent: false,
          undoAvailable: false,
          onAction,
          onUndo: vi.fn(),
          onUndoConsentChange: vi.fn(),
        }}
      />,
    );

    expect(screen.queryByRole("button", { name: /save & quit/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /ares conflict/i }));
    fireEvent.click(screen.getByRole("button", { name: /claim ares/i }));
    expect(onAction).toHaveBeenCalledWith({ type: "draft", godId: "ares" });
  });

  it("shows host replacement controls while a disconnected online seat is paused", () => {
    const config = createFourPlayerOnlineConfig();
    config.seats.north.name = "Host";
    config.seats.north.control = {
      kind: "online",
      participantId: "host",
      local: true,
    };
    config.seats.east.name = "Guest";
    config.seats.east.control = {
      kind: "online",
      participantId: "guest",
    };
    const replace = vi.fn();
    render(
      <FourPlayerGame
        initialState={createFourPlayerGame(config)}
        undoPreferred={false}
        onUndoPreferenceChange={vi.fn()}
        onPersist={vi.fn(async () => false)}
        onQuit={vi.fn()}
        onNewGame={vi.fn()}
        onlineSession={{
          roomCode: "ABCDE",
          role: "host",
          participantSeat: "north",
          status: "paused",
          awaitingSync: false,
          undoConsent: false,
          undoAvailable: false,
          pausedSeat: "east",
          pausedParticipantName: "Guest",
          onAction: vi.fn(),
          onUndo: vi.fn(),
          onUndoConsentChange: vi.fn(),
          onReplaceWithAi: replace,
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: /guest disconnected/i })).toBeTruthy();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: /replace permanently with ai/i }));
    expect(replace).toHaveBeenCalledWith(8);
  });
});
