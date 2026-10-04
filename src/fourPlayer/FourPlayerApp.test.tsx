// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import App from "../App";
import { createFourPlayerGame, fourPlayerReducer } from "../game/fourPlayerEngine";
import { GODS } from "../game/gods";
import { createSavedGame } from "../saves";
import { FourPlayerGame } from "./FourPlayerGame";
import { createFourPlayerOnlineConfig } from "../multiplayer/fourPlayerRoom";
import { createDefaultFourPlayerConfig } from "../game/fourPlayerConfig";
import {
  FOUR_PLAYER_SEATS,
  type FourPlayerState,
} from "../game/fourPlayerTypes";

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
  vi.restoreAllMocks();
});

const openPlayOption = (name: "Local" | "Load") => {
  const start = screen.queryByRole("button", { name: /^start$/i });
  if (start) fireEvent.click(start);
  fireEvent.click(screen.getByRole("button", {
    name: new RegExp(`^${name}$`, "i"),
  }));
};

const openFourPlayerSetup = () => {
  render(<App />);
  openPlayOption("Local");
  fireEvent.click(screen.getByRole("button", { name: /^4 player$/i }));
};

const completeFourPlayerDraft = (
  config = createDefaultFourPlayerConfig(),
) => {
  let state = createFourPlayerGame(config);
  for (const god of GODS) {
    state = fourPlayerReducer(state, { type: "draft", godId: god.id });
  }
  return state;
};

describe("four-player app integration", () => {
  it("offers four-player mode and validates that one seat remains Human", () => {
    const { container } = render(<App />);
    openPlayOption("Local");
    expect(screen.getByRole("button", { name: /^4 player$/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^4 player$/i }));
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

  it("opens New setup in the shared shell and backs out to the Local chooser", () => {
    const state = completeFourPlayerDraft();
    window.localStorage.setItem(SAVE_KEY, JSON.stringify([
      createSavedGame("four-new-setup", state, [], state),
    ]));
    render(<App />);
    openPlayOption("Load");
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));
    fireEvent.click(screen.getByRole("button", { name: /^new setup$/i }));
    expect(screen.getByRole("heading", { name: /gather four pantheons/i })).toBeTruthy();
    expect(document.querySelectorAll(".setup-navigation-header")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /close four-player setup/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /back to local/i }));
    expect(screen.getByRole("button", { name: /^4 player$/i })).toBeTruthy();
  });

  it("previews level two and three ability rules during the four-player draft", () => {
    openFourPlayerSetup();
    fireEvent.click(screen.getByRole("button", { name: /begin four-player draft/i }));

    expect(screen.queryByText(/snake is 2 or more pieces/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /lv 2/i }));
    expect(screen.getByText(/snake is 2 or more pieces/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /lv 3/i }));
    expect(screen.getByText(/1 orb per piece in the snake/i)).toBeTruthy();
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

  it("quick-drafts every remaining four-player pick through the reducer", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.75);
    const config = createDefaultFourPlayerConfig();
    config.seats.east.control = { kind: "ai", difficulty: 5 };
    config.seats.west.control = { kind: "ai", difficulty: 5 };
    const initial = createFourPlayerGame(config);
    const onPersist = vi.fn(async (_: FourPlayerState) => true);
    const { container } = render(
      <FourPlayerGame
        initialState={initial}
        undoPreferred={false}
        onUndoPreferenceChange={vi.fn()}
        onPersist={onPersist}
        onQuit={vi.fn()}
        onNewGame={vi.fn()}
      />,
    );

    const draftActions = container.querySelector(".draft-auto-actions") as HTMLElement;
    expect(within(draftActions).getAllByRole("button").map((button) =>
      button.textContent?.replace(/\s+/g, " ").trim()
    )).toEqual(["Auto-pick a God", "Quick Draft"]);

    fireEvent.click(screen.getByRole("button", { name: /ares conflict/i }));
    fireEvent.click(screen.getByRole("button", { name: /claim ares/i }));
    let expected = fourPlayerReducer(initial, { type: "draft", godId: "ares" });
    while (expected.phase === "draft") {
      const index = Math.floor(expected.draft.available.length * 0.75);
      expected = fourPlayerReducer(expected, {
        type: "draft",
        godId: expected.draft.available[index],
      });
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
    expect(completed.players.north.gods[0]).toBe("ares");
    expect(FOUR_PLAYER_SEATS.map((seat) => completed.players[seat].gods))
      .toEqual(FOUR_PLAYER_SEATS.map((seat) => expected.players[seat].gods));
    expect(new Set(drafted).size).toBe(12);
  });

  it("does not expose Quick Draft to a four-player online participant", () => {
    const config = createFourPlayerOnlineConfig();
    const state = createFourPlayerGame(config);
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
          onAction: vi.fn(),
          onUndo: vi.fn(),
          onUndoConsentChange: vi.fn(),
        }}
      />,
    );
    expect(screen.queryByRole("button", { name: /^quick draft$/i })).toBeNull();
  });

  it("uses per-seat AI difficulty and advances chained AI draft seats", async () => {
    const { container } = render(<App />);
    openPlayOption("Local");
    fireEvent.click(screen.getByRole("button", { name: /^4 player$/i }));
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
    openPlayOption("Local");
    fireEvent.click(screen.getByRole("button", { name: /^4 player$/i }));
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
    openPlayOption("Load");
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

  it("stacks side-seat identity above a complete resource row for long team names", () => {
    const config = createDefaultFourPlayerConfig();
    config.mode = "teams";
    config.teams = {
      north: "team-a",
      east: "team-a",
      south: "team-b",
      west: "team-b",
    };
    config.seats.east.name = "Red Commander Longname";
    config.seats.west.name = "Blue Strategist Longname";
    const state = completeFourPlayerDraft(config);
    state.activeSeat = "east";
    state.players.east.orbs = { light: 123, dark: 456 };
    state.players.west.orbs = { light: 789, dark: 987 };

    const { container } = render(
      <FourPlayerGame
        initialState={state}
        undoPreferred={false}
        onUndoPreferenceChange={() => undefined}
        onPersist={async () => true}
        onQuit={() => undefined}
        onNewGame={() => undefined}
      />,
    );

    for (const seat of ["east", "west"]) {
      const panel = container.querySelector(`.four-player-panel.seat-${seat}`) as HTMLElement;
      const summary = panel.querySelector(".four-seat-summary") as HTMLElement;
      const resources = panel.querySelector(".four-panel-resources") as HTMLElement;
      expect(panel.children[0]).toBe(summary);
      expect(panel.children[1]).toBe(resources);
      expect(resources.querySelectorAll(".orb-count")).toHaveLength(2);
      expect(resources.querySelector(".graveyard-button")).toBeTruthy();
      expect(resources.querySelector(".four-panel-menu")).toBeTruthy();
    }
    expect(container.querySelector(".four-player-panel.seat-east.active")).toBeTruthy();
    expect(screen.getByText(/East · Human · Team A/i)).toBeTruthy();
    expect(screen.getByText(/West · Human · Team B/i)).toBeTruthy();
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

    const { container } = render(<App />);
    openPlayOption("Load");
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));

    expect(container.querySelector(".four-player-panel.seat-east.eliminated")).toBeTruthy();
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
    openPlayOption("Load");
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));

    const finish = screen.getByRole("button", { name: /pass \/ finish/i });
    fireEvent.click(finish);
    expect(screen.queryByRole("button", { name: /pass \/ finish/i })).toBeNull();
    expect(screen.getAllByText(/skipped the prepared shot/i).length).toBeGreaterThan(0);
  });

  it("matches the classic upgrade hierarchy, previews, selection, and legal dispatch", () => {
    let state = createFourPlayerGame();
    for (const god of GODS) state = fourPlayerReducer(state, { type: "draft", godId: god.id });
    state.phase = "upgrade";
    state.activeSeat = "north";
    state.upgradeQueue = ["north", "east"];

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

    const panel = screen.getByText("DIVINE UPGRADE").closest(".upgrade-panel") as HTMLElement;
    expect(panel).toBeTruthy();
    expect(within(panel).getByText(/round 1.*north seat/i)).toBeTruthy();
    expect(within(panel).getByRole("heading", { name: /choose an ability to strengthen/i })).toBeTruthy();
    expect(within(panel).getByText(/compare every ability in your pantheon/i)).toBeTruthy();
    expect(panel.querySelectorAll(".four-upgrade-list .ability-card")).toHaveLength(9);
    expect(screen.queryByText(/snake is 2 or more pieces/i)).toBeNull();

    const allAbilities = within(panel).getByLabelText(/all abilities levels/i);
    const levelTwo = within(allAbilities).getByRole("button", { name: /lv 2/i });
    const levelThree = within(allAbilities).getByRole("button", { name: /lv 3/i });
    expect(levelTwo.getAttribute("aria-pressed")).toBe("false");
    expect(levelThree.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(levelTwo);
    expect(levelTwo.classList.contains("active")).toBe(true);
    expect(levelTwo.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/snake is 2 or more pieces/i)).toBeTruthy();
    fireEvent.click(levelThree);
    expect(levelThree.classList.contains("active")).toBe(true);
    expect(levelThree.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/1 orb per piece in the snake/i)).toBeTruthy();
    fireEvent.click(levelThree);
    expect(levelThree.classList.contains("active")).toBe(false);
    expect(levelThree.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByText(/1 orb per piece in the snake/i)).toBeNull();

    const slitherCard = within(panel).getByText("Slither").closest(".ability-card") as HTMLElement;
    fireEvent.click(within(slitherCard).getByRole("button", { name: /^slither/i }));
    expect(slitherCard.classList.contains("active")).toBe(true);
    const confirm = within(panel).getByRole("button", { name: /confirm slither.*lv 2/i });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirm);
    expect(screen.getByText(/east upgrades one ability/i)).toBeTruthy();
    expect(within(panel).getByText(/round 1.*east seat/i)).toBeTruthy();
  });

  it("disables maxed and unavailable four-player upgrades", () => {
    let state = createFourPlayerGame();
    for (const god of GODS) state = fourPlayerReducer(state, { type: "draft", godId: god.id });
    state.phase = "upgrade";
    state.activeSeat = "north";
    state.upgradeQueue = ["north"];
    state.players.north.upgrades.flight = 3;

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

    const slitherCard = screen.getByText("Slither").closest(".ability-card") as HTMLElement;
    const slitherControl = within(slitherCard).getByRole("button", { name: /^slither/i });
    expect(slitherCard.classList.contains("disabled")).toBe(true);
    expect(slitherControl.getAttribute("aria-disabled")).toBe("true");
    expect(within(slitherCard).getByText("MAX LEVEL")).toBeTruthy();
    fireEvent.click(slitherControl);
    expect(slitherCard.classList.contains("active")).toBe(false);
    expect(
      (screen.getByRole("button", { name: /select an ability to upgrade/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("routes authorized online upgrades and gates remote-seat and AI input", () => {
    const createUpgradeState = (
      config = createDefaultFourPlayerConfig(),
    ) => {
      let state = createFourPlayerGame(config);
      for (const god of GODS) state = fourPlayerReducer(state, { type: "draft", godId: god.id });
      state.phase = "upgrade";
      state.activeSeat = "north";
      state.upgradeQueue = ["north"];
      return state;
    };
    const createOnlineUpgradeState = () => {
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
        local: false,
      };
      return createUpgradeState(config);
    };
    const onAction = vi.fn();
    const authorized = render(
      <FourPlayerGame
        initialState={createOnlineUpgradeState()}
        undoPreferred={false}
        onUndoPreferenceChange={vi.fn()}
        onPersist={vi.fn(async () => false)}
        onQuit={vi.fn()}
        onNewGame={vi.fn()}
        onlineSession={{
          roomCode: "ABCDE",
          role: "peer",
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
    const authorizedSlither = screen.getByText("Slither").closest(".ability-card") as HTMLElement;
    fireEvent.click(within(authorizedSlither).getByRole("button", { name: /^slither/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm slither.*lv 2/i }));
    expect(onAction).toHaveBeenCalledWith({ type: "upgrade", abilityId: "flight" });
    authorized.unmount();

    const remoteAction = vi.fn();
    const remote = render(
      <FourPlayerGame
        initialState={createOnlineUpgradeState()}
        undoPreferred={false}
        onUndoPreferenceChange={vi.fn()}
        onPersist={vi.fn(async () => false)}
        onQuit={vi.fn()}
        onNewGame={vi.fn()}
        onlineSession={{
          roomCode: "ABCDE",
          role: "host",
          participantSeat: "east",
          status: "playing",
          awaitingSync: false,
          undoConsent: false,
          undoAvailable: false,
          onAction: remoteAction,
          onUndo: vi.fn(),
          onUndoConsentChange: vi.fn(),
        }}
      />,
    );
    const remoteSlither = screen.getByText("Slither").closest(".ability-card") as HTMLElement;
    expect(within(remoteSlither).getByRole("button", { name: /^slither/i }).getAttribute("aria-disabled"))
      .toBe("true");
    expect(
      (screen.getByRole("button", { name: /select an ability to upgrade/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(remoteAction).not.toHaveBeenCalled();
    remote.unmount();

    const aiState = createUpgradeState();
    aiState.players.north.control = { kind: "ai", difficulty: 3 };
    aiState.config.seats.north.control = { kind: "ai", difficulty: 3 };
    render(
      <FourPlayerGame
        initialState={aiState}
        undoPreferred={false}
        onUndoPreferenceChange={vi.fn()}
        onPersist={vi.fn(async () => false)}
        onQuit={vi.fn()}
        onNewGame={vi.fn()}
      />,
    );
    const aiSlither = screen.getByText("Slither").closest(".ability-card") as HTMLElement;
    expect(within(aiSlither).getByRole("button", { name: /^slither/i }).getAttribute("aria-disabled"))
      .toBe("true");
  });

  it("confirms a level 2 to 3 upgrade in the second cycle on a mobile viewport", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    window.dispatchEvent(new Event("resize"));
    const state = completeFourPlayerDraft();
    state.phase = "upgrade";
    state.round = 2;
    state.activeSeat = "north";
    state.upgradeQueue = ["north", "east"];
    state.players.north.upgrades.flight = 2;
    const onPersist = vi.fn(async (_: FourPlayerState) => true);
    render(
      <FourPlayerGame
        initialState={state}
        undoPreferred={false}
        onUndoPreferenceChange={vi.fn()}
        onPersist={onPersist}
        onQuit={vi.fn()}
        onNewGame={vi.fn()}
      />,
    );

    const slitherCard = screen.getByText("Slither").closest(".ability-card") as HTMLElement;
    fireEvent.click(within(slitherCard).getByRole("button", { name: /^slither/i }));
    const confirm = screen.getByRole("button", { name: /confirm slither.*lv 3/i });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirm);

    expect(screen.getByText(/East seat/i)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /select an ability to upgrade/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await waitFor(() => {
      const persisted = onPersist.mock.calls.at(-1)?.[0];
      expect(persisted?.players.north.upgrades.flight).toBe(3);
      expect(persisted?.activeSeat).toBe("east");
      expect(persisted?.upgradeQueue).toEqual(["east"]);
    });
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
    openPlayOption("Load");
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));

    expect(
      (screen.getByRole("button", { name: /choose a different god/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.queryByRole("button", { name: /cancel ability/i })).toBeNull();
    expect(
      (screen.getByRole("button", { name: /barter/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
    const fundingCard = screen.getByRole("button", { name: /military funding/i })
      .closest(".four-ability-card");
    expect(fundingCard).toBeTruthy();
    expect(within(fundingCard as HTMLElement).getByText("Move another pawn or finish.")).toBeTruthy();
    expect(within(fundingCard as HTMLElement).getByRole("button", { name: /pass \/ finish/i }))
      .toBeTruthy();
  });

  it("renders Quetzacoatl's committed Slither orb choice", () => {
    let state = createFourPlayerGame();
    const draftOrder = [
      GODS.find((god) => god.id === "quetzacoatl")!,
      ...GODS.filter((god) => god.id !== "quetzacoatl"),
    ];
    for (const god of draftOrder) {
      state = fourPlayerReducer(state, { type: "draft", godId: god.id });
    }
    state.activeSeat = "north";
    state.selectedGod = "quetzacoatl";
    state.selectedAbility = "flight";
    const movedPieceId = Object.values(state.board).find(
      (piece) => piece.controller === "north" && piece.type === "rook",
    )!.id;
    state.pending = {
      godId: "quetzacoatl",
      abilityId: "flight",
      step: "slither-orb",
      destination: "g9",
      movedPieceId,
    };
    state.notice = "Slither: choose one extra light or dark orb.";

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

    expect(screen.getByRole("button", { name: /gain light/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /gain dark/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /cancel ability/i })).toBeNull();
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

    openPlayOption("Load");
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

    openPlayOption("Load");
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

  it("keeps a finished four-player board view-only and restores play through undo", () => {
    const playable = completeFourPlayerDraft();
    const finished = structuredClone(playable);
    finished.phase = "gameover";
    finished.winner = {
      seat: "north",
      reason: "last-player",
    };
    finished.notice = "North wins.";
    const { container } = render(
      <FourPlayerGame
        initialState={finished}
        initialUndoHistory={[playable]}
        undoPreferred
        onUndoPreferenceChange={vi.fn()}
        onPersist={vi.fn(async () => false)}
        onQuit={vi.fn()}
        onNewGame={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /see board/i }));
    expect(screen.getByRole("button", { name: /view result/i })).toBeTruthy();
    expect(container.querySelector(".finished-view")).toBeTruthy();
    fireEvent.click(screen.getAllByTitle(/ares/i)[0]);
    expect(screen.getByRole("button", { name: /view result/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /view result/i }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", {
      name: /^undo$/i,
    }));
    expect(screen.queryByText(/match finished/i)).toBeNull();
    expect(container.querySelector(".finished-view")).toBeNull();
    expect(screen.getByText(playable.notice)).toBeTruthy();
  });

  it("highlights a hostile King for 2v2 Salem Hex and advances after marking it", () => {
    const config = createDefaultFourPlayerConfig();
    config.mode = "teams";
    config.teams = {
      north: "team-a",
      east: "team-b",
      south: "team-a",
      west: "team-b",
    };
    let state = createFourPlayerGame(config);
    const salem = GODS.find((god) => god.id === "salem")!;
    for (const god of [salem, ...GODS.filter((candidate) => candidate.id !== "salem")]) {
      state = fourPlayerReducer(state, { type: "draft", godId: god.id });
    }
    state.phase = "play";
    state.activeSeat = "north";
    state.players.north.orbs = { light: 50, dark: 50 };
    state.players.north.team = "team-a";
    state.players.east.team = "team-b";
    state.players.south.team = "team-a";
    state.players.west.team = "team-b";
    const northRook = structuredClone(state.board.d13);
    const westPawn = structuredClone(state.board.b10);
    const kings = Object.fromEntries(
      Object.entries(state.board).filter(([, piece]) => piece.type === "king"),
    );
    expect(northRook).toBeTruthy();
    expect(westPawn).toBeTruthy();
    northRook.id = "hex-mover";
    northRook.type = "rook";
    northRook.owner = "north";
    northRook.controller = "north";
    westPawn.id = "west-enemy";
    westPawn.owner = "west";
    westPawn.controller = "west";
    state.board = {
      ...kings,
      g8: northRook,
      b11: westPawn,
    };
    state = fourPlayerReducer(state, { type: "select-god", godId: "salem" });
    state = fourPlayerReducer(state, { type: "select-ability", abilityId: "hex" });
    expect(state.legalTargets).toContain("a7");
    expect(state.legalTargets).not.toContain("g1");

    const { container } = render(
      <FourPlayerGame
        initialState={state}
        undoPreferred={false}
        onUndoPreferenceChange={vi.fn()}
        onPersist={vi.fn(async () => false)}
        onQuit={vi.fn()}
        onNewGame={vi.fn()}
      />,
    );

    expect(container.querySelector('[data-square="a7"].legal-destination')).toBeTruthy();
    expect(container.querySelector('[data-square="g1"].legal-destination')).toBeNull();
    fireEvent.click(screen.getByRole("gridcell", { name: /a7.*west.*king/i }));
    expect(
      within(screen.getByRole("gridcell", { name: /a7.*west.*king/i }))
        .getByLabelText(/hexed/i),
    ).toBeTruthy();
    expect(screen.getAllByText(/choose a piece to move/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("gridcell", { name: /g8.*north.*rook.*legal target/i }))
      .toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: /game paused locally/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^resume$/i }));
    expect(screen.getAllByText(/choose a piece to move/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("gridcell", { name: /g8.*north.*rook.*legal target/i }))
      .toBeTruthy();
    fireEvent.click(screen.getByRole("gridcell", { name: /g8.*north.*rook/i }));
    expect(screen.getAllByText(/choose a destination for the rook/i).length)
      .toBeGreaterThan(0);
  });

  it("shows Enchant source and follow-up highlights beneath the selected ability", () => {
    let state = createFourPlayerGame();
    const orderedGods = [
      GODS.find((god) => god.id === "teles")!,
      ...GODS.filter((god) => god.id !== "teles"),
    ];
    for (const god of orderedGods) {
      state = fourPlayerReducer(state, { type: "draft", godId: god.id });
    }
    state.players.north.orbs = { light: 50, dark: 50 };
    const kings = Object.fromEntries(
      Object.entries(state.board).filter(([, piece]) => piece.type === "king"),
    );
    const enemy = structuredClone(state.board.b10);
    enemy.id = "enchanted-pawn";
    enemy.type = "pawn";
    enemy.owner = "west";
    enemy.controller = "west";
    enemy.status = {};
    const followup = structuredClone(state.board.d13);
    followup.id = "followup-pawn";
    followup.type = "pawn";
    followup.owner = "north";
    followup.controller = "north";
    followup.status = {};
    state.board = { ...kings, g8: enemy, g12: followup };
    state = fourPlayerReducer(state, { type: "select-god", godId: "teles" });
    state = fourPlayerReducer(state, {
      type: "select-ability",
      abilityId: "enchant",
    });

    const { container } = render(
      <FourPlayerGame
        initialState={state}
        undoPreferred={false}
        onUndoPreferenceChange={vi.fn()}
        onPersist={vi.fn(async () => false)}
        onQuit={vi.fn()}
        onNewGame={vi.fn()}
      />,
    );
    const enchantCard = screen.getByText("Enchant").closest(".four-ability-card");
    expect(enchantCard).toBeTruthy();
    expect(within(enchantCard as HTMLElement).getByText(/choose a highlighted hostile piece/i))
      .toBeTruthy();
    expect(container.querySelector('[data-square="g8"].legal-source')).toBeTruthy();

    fireEvent.click(screen.getByRole("gridcell", { name: /g8.*west.*pawn/i }));
    const destination = container.querySelector<HTMLButtonElement>(
      ".four-board-square.legal-destination",
    );
    expect(destination).toBeTruthy();
    fireEvent.click(destination!);

    expect(within(enchantCard as HTMLElement).getByText(/make one ordinary legal move/i))
      .toBeTruthy();
    expect(container.querySelectorAll(".four-board-square.legal-source").length)
      .toBeGreaterThan(0);
  });
});
