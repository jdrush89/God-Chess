// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ThreePlayerOnlineState } from "./multiplayer/useThreePlayerOnlineGame";

const threeOnlineHarness = vi.hoisted(() => ({
  state: {
    role: "none",
    connecting: false,
  } as ThreePlayerOnlineState,
  setState: undefined as
    | ((state: ThreePlayerOnlineState) => void)
    | undefined,
  disconnects: 0,
}));

vi.mock("./multiplayer/useThreePlayerOnlineGame", async () => {
  const React = await import("react");
  return {
    threePlayerOnlineLocalSeat: (state: ThreePlayerOnlineState) =>
      state.snapshot?.participants.find((participant) => participant.local)
        ?.seat,
    useThreePlayerOnlineGame: () => {
      const [state, setState] = React.useState<ThreePlayerOnlineState>(
        threeOnlineHarness.state,
      );
      threeOnlineHarness.setState = setState;
      const disconnect = () => {
        threeOnlineHarness.disconnects += 1;
        setState({
          role: "none",
          connecting: false,
        });
      };
      return [
        state,
        {
          hostGame: async (playerName: string) => setState({
            role: "none",
            connecting: true,
            playerName,
          }),
          joinGame: async (roomCode: string, playerName: string) => setState({
            role: "none",
            connecting: true,
            roomCode,
            playerName,
          }),
          setReady: vi.fn(),
          assignSeat: vi.fn(),
          updateConfig: vi.fn(),
          startGame: vi.fn(),
          sendAction: vi.fn(),
          requestUndo: vi.fn(),
          voteUndo: vi.fn(),
          replaceWithAi: vi.fn(),
          disconnect,
        },
      ] as const;
    },
  };
});

import App, { ActionPanel } from "./App";
import { createGame, gameReducer } from "./game/engine";
import { createDefaultThreePlayerConfig } from "./game/threePlayerConfig";
import { createThreePlayerGame } from "./game/threePlayerEngine";
import { createThreePlayerStateEnvelope } from "./game/threePlayerSession";
import { PUZZLES } from "./game/puzzles";
import { createSavedGame } from "./saves";

const SAVE_KEY = "god-chess-saves-v2";
const LEGACY_SAVE_KEY = "god-chess-save-v1";

const completeClassicDraft = () => {
  let state = createGame(1);
  for (const godId of [
    "quetzacoatl",
    "chiron",
    "midas",
    "death",
    "artemis",
    "medusa",
  ] as const) {
    state = gameReducer(state, { type: "draft", godId });
  }
  return state;
};

const activeThreeOnlineState = (
  status: "playing" | "paused" = "playing",
): ThreePlayerOnlineState => {
  const config = createDefaultThreePlayerConfig();
  config.seats.white.name = "Host";
  config.seats.white.control = { kind: "online", local: true };
  config.seats.red.name = "Guest";
  config.seats.red.control = { kind: "online", local: false };
  config.seats.black.name = "Black Divine AI";
  config.seats.black.control = { kind: "ai", difficulty: 5 };
  const state = createThreePlayerGame(config);
  return {
    role: "host",
    connecting: false,
    roomCode: "ABCDE",
    participantId: "host",
    snapshot: {
      roomCode: "ABCDE",
      status,
      participants: [
        {
          participantId: "host",
          name: "Host",
          host: true,
          connected: true,
          ready: true,
          local: true,
          seat: "white",
        },
        {
          participantId: "guest",
          name: "Guest",
          host: false,
          connected: status !== "paused",
          ready: true,
          local: false,
          seat: "red",
        },
      ],
      config,
      canonical: createThreePlayerStateEnvelope(state, "start"),
      ...(status === "paused"
        ? {
          pausedSeat: "red" as const,
          pausedParticipantName: "Guest",
        }
        : {}),
      undoAvailable: false,
    },
  };
};

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
  Object.defineProperty(HTMLElement.prototype, "animate", {
    writable: true,
    value: () => ({}),
  });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

beforeEach(() => {
  threeOnlineHarness.state = {
    role: "none",
    connecting: false,
  };
  threeOnlineHarness.setState = undefined;
  threeOnlineHarness.disconnects = 0;
});

describe("game startup", () => {
  it("shows local, AI, online, and puzzle choices when starting a new game", () => {
    const savedState = createGame(1);
    window.localStorage.setItem(LEGACY_SAVE_KEY, JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      state: savedState,
    }));

    render(<App />);
    expect(screen.getByRole("img", { name: /god chess/i })).toBeTruthy();
    expect(screen.getByText("Version dev")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /settings/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^new game$/i }));

    expect(screen.getByRole("button", { name: /two players share this device/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /divine ai/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /three-player local/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /online versus/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /divine puzzles/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /online versus/i }));
    expect(screen.getByRole("button", { name: /^two-player$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^four-player$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^three-player$/i })).toBeTruthy();
  });

  describe("finished classic matches", () => {
    it("reveals the final board, reopens the result, enables undo, and resumes play", () => {
      const playable = completeClassicDraft();
      const finished = structuredClone(playable);
      finished.phase = "gameover";
      finished.winner = "white";
      finished.lastAction = "White captured the Black King.";
      finished.notice = "White wins.";
      window.localStorage.setItem(SAVE_KEY, JSON.stringify([
        createSavedGame("finished-classic", finished, [playable], playable),
      ]));

      const { container } = render(<App />);
      fireEvent.click(screen.getByRole("button", { name: /load game/i }));
      fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));

      expect(screen.getByRole("dialog", { name: /white is victorious/i })).toBeTruthy();
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      expect(screen.queryByRole("dialog", { name: /white is victorious/i })).toBeNull();
      expect(screen.getByRole("button", { name: /view result/i })).toBeTruthy();
      expect(container.querySelector(".finished-view")).toBeTruthy();
      expect(screen.getByText("White captured the Black King.")).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: /view result/i }));
      fireEvent.click(screen.getByRole("button", { name: /enable undo/i }));
      fireEvent.click(screen.getByRole("switch", { name: /allow undo/i }));
      fireEvent.click(screen.getByRole("button", { name: /close settings/i }));
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", {
        name: /^undo$/i,
      }));

      expect(screen.queryByText(/match finished/i)).toBeNull();
      expect(container.querySelector(".finished-view")).toBeNull();
      expect(screen.getByText(playable.notice)).toBeTruthy();
    });
  });

  it("opens the local three-player setup without exposing an online room mode", () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^new game$/i }));
    fireEvent.click(screen.getByRole("button", { name: /three-player local/i }));

    expect(screen.getByRole("heading", { name: /choose the battlefield/i })).toBeTruthy();
    expect(container.querySelectorAll(".three-variant-card")).toHaveLength(5);
    expect(screen.queryByText(/room code/i)).toBeNull();
  });

  it("autosaves the active three-player state without overwriting it with the hidden duel", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^new game$/i }));
    fireEvent.click(screen.getByRole("button", { name: /three-player local/i }));
    fireEvent.click(screen.getByRole("button", { name: /begin three-player draft/i }));

    await waitFor(() => {
      const saves = JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? "[]");
      expect(saves[0]?.state?.variant).toBe("three-player");
    });
  });

  it("leaves an existing local save untouched throughout online hosting and reconnect", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^new game$/i }));
    fireEvent.click(screen.getByRole("button", { name: /begin local duel/i }));
    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? "[]"))
        .toHaveLength(1);
    });
    fireEvent.click(screen.getByRole("button", { name: /save & quit/i }));
    await screen.findByRole("button", { name: /^new game$/i });
    const existingSave = window.localStorage.getItem(SAVE_KEY);

    fireEvent.click(screen.getByRole("button", { name: /^new game$/i }));
    fireEvent.click(screen.getByRole("button", { name: /online versus/i }));
    fireEvent.click(screen.getByRole("button", { name: /^three-player$/i }));
    fireEvent.click(screen.getByRole("button", { name: /create room/i }));
    act(() => {
      threeOnlineHarness.setState?.(activeThreeOnlineState());
    });
    await waitFor(() => {
      expect(screen.getByText(/three-player draft/i)).toBeTruthy();
    });

    act(() => {
      threeOnlineHarness.setState?.({
        ...activeThreeOnlineState("paused"),
        connecting: true,
      });
    });
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    expect(window.localStorage.getItem(SAVE_KEY)).toBe(existingSave);
  });

  it("does not create a hidden local save while joining an online room", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^new game$/i }));
    fireEvent.click(screen.getByRole("button", { name: /online versus/i }));
    fireEvent.click(screen.getByRole("button", { name: /^three-player$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^join$/i }));
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[1], { target: { value: "ABCDE" } });
    fireEvent.click(screen.getByRole("button", { name: /join room/i }));
    act(() => {
      threeOnlineHarness.setState?.({
        ...activeThreeOnlineState(),
        role: "peer",
      });
    });
    await waitFor(() => {
      expect(screen.getByText(/three-player draft/i)).toBeTruthy();
    });
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    expect(window.localStorage.getItem(SAVE_KEY)).toBeNull();
  });

  it("disconnects a pending three-player attempt when switching online variants", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^new game$/i }));
    fireEvent.click(screen.getByRole("button", { name: /online versus/i }));
    fireEvent.click(screen.getByRole("button", { name: /^three-player$/i }));
    fireEvent.click(screen.getByRole("button", { name: /create room/i }));
    expect(screen.getByRole("button", { name: /connecting/i })).toBeTruthy();

    const beforeSwitch = threeOnlineHarness.disconnects;
    fireEvent.click(screen.getByRole("button", { name: /^four-player$/i }));
    expect(threeOnlineHarness.disconnects).toBe(beforeSwitch + 1);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create room/i })).toBeTruthy();
    });
  });

  it("browses puzzle difficulties and starts a selected position", () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^new game$/i }));
    fireEvent.click(screen.getByRole("button", { name: /divine puzzles/i }));

    expect(screen.getByRole("heading", { name: /choose a difficulty/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^easy/i }));
    expect(screen.getAllByRole("button", { name: /puzzle \d/i })).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: /difficulties/i }));
    fireEvent.click(screen.getByRole("button", { name: /^medium/i }));
    expect(screen.getAllByRole("button", { name: /puzzle \d/i })).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: /difficulties/i }));
    fireEvent.click(screen.getByRole("button", { name: /^easy/i }));

    const puzzleLibrary = container.querySelector(".puzzle-select-grid");
    expect(puzzleLibrary).toBeTruthy();
    expect(puzzleLibrary?.querySelector(".god-sigil")).toBeNull();
    expect(within(puzzleLibrary as HTMLElement).queryByText(/chiron|charge/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /puzzle 1.*position one/i }));

    expect(screen.getByText("Position One")).toBeTruthy();
    expect(screen.getAllByText(/capture the black king in one divine turn/i)).toHaveLength(2);
    expect(screen.getByRole("gridcell", { name: "e2, white knight" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /save & quit/i })).toBeNull();
  });

  it("marks locally completed puzzles in the difficulty browser", () => {
    window.localStorage.setItem("god-chess-puzzle-progress-v1", JSON.stringify(["centaurs-lance"]));

    const { container } = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^new game$/i }));
    fireEvent.click(screen.getByRole("button", { name: /divine puzzles/i }));

    expect(screen.getByRole("button", { name: /^easy.*1 of 5 completed/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^easy/i }));
    expect(screen.getByRole("button", { name: /puzzle 1.*completed/i })).toBeTruthy();
    expect(container.querySelector(".puzzle-complete-badge svg")).toBeTruthy();
  });

  it("waits for the captured King animation before showing puzzle victory", async () => {
    const puzzle = PUZZLES[0];
    let solvedState = puzzle.createState("Solver");
    for (const action of puzzle.solutionTurns[0]) solvedState = gameReducer(solvedState, action);
    window.localStorage.setItem(LEGACY_SAVE_KEY, JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      state: solvedState,
    }));

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /load game/i }));
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));

    expect(screen.queryByText("PUZZLE SOLVED")).toBeNull();
    expect(await screen.findByText("PUZZLE SOLVED", {}, { timeout: 1400 })).toBeTruthy();
    expect(screen.getByText(/you found a winning line/i)).toBeTruthy();
    expect(screen.queryByText(puzzle.solutionSummary)).toBeNull();
    expect(JSON.parse(window.localStorage.getItem("god-chess-puzzle-progress-v1") ?? "[]")).toContain(puzzle.id);
  });

  it("attaches pending graveyard choices to the selected ability card", () => {
    let state = PUZZLES.find((puzzle) => puzzle.id === "hidden-reserve")!.createState();
    state = gameReducer(state, { type: "select-god", godId: "death" });
    state = gameReducer(state, { type: "select-ability", abilityId: "resurrect" });

    render(
      <ActionPanel
        state={state}
        dispatch={vi.fn()}
        onInspectGod={vi.fn()}
        onCloseInspection={vi.fn()}
      />,
    );

    const resurrectCard = screen.getByText("Resurrect").closest(".ability-card");
    expect(resurrectCard).toBeTruthy();
    expect(within(resurrectCard as HTMLElement).getByText(/choose a piece from your graveyard/i)).toBeTruthy();
    expect(within(resurrectCard as HTMLElement).getByText("YOUR GRAVEYARD")).toBeTruthy();
    expect((resurrectCard as HTMLElement).querySelector(".grave-picker")).toBeTruthy();
    expect(document.querySelector(".action-panel > .grave-picker")).toBeNull();
  });

  it("restores the saved position instead of the fresh initial game", () => {
    const savedState = gameReducer(createGame(1), {
      type: "draft",
      godId: "quetzacoatl",
    });
    window.localStorage.setItem(LEGACY_SAVE_KEY, JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      state: savedState,
    }));

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /load game/i }));
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));

    expect(screen.getByText(/black picks/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /quetzacoatl sky w/i })).toBeTruthy();
  });

  it("saves and quits a new game back to the main menu", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^new game$/i }));
    fireEvent.click(screen.getByRole("button", { name: /begin local duel/i }));
    fireEvent.click(screen.getByRole("button", { name: /save & quit/i }));

    expect(await screen.findByRole("img", { name: /god chess/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /load game/i })).toBeTruthy();
    expect(window.localStorage.getItem(SAVE_KEY)).toBeTruthy();
  });

  it("explains when account services have not been configured", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(screen.getByText(/account setup required/i)).toBeTruthy();
    expect(screen.getByText(/local games remain available/i)).toBeTruthy();
  });

  it("auto-picks one god at a time from the draft screen", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^new game$/i }));
    fireEvent.click(screen.getByRole("button", { name: /begin local duel/i }));
    fireEvent.click(screen.getByRole("button", { name: /auto-pick random god/i }));

    expect(screen.getByText(/black picks/i)).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: /game paused locally/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^resume$/i }));
    expect(screen.getByText(/black picks/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /auto-pick random god/i })).toBeTruthy();
  });

  it("lists every ability with costs and level previews while choosing an upgrade", () => {
    let savedState = createGame(1);
    (["quetzacoatl", "chiron", "midas", "death", "artemis", "medusa"] as const).forEach((godId) => {
      savedState = gameReducer(savedState, { type: "draft", godId });
    });
    savedState.phase = "upgrade";
    savedState.activeColor = "white";
    savedState.upgradeQueue = ["white", "black"];
    window.localStorage.setItem(LEGACY_SAVE_KEY, JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      state: savedState,
    }));

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /load game/i }));
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));

    const airLiftCard = screen.getByText("Air Lift").closest(".ability-card");
    expect(airLiftCard).toBeTruthy();
    expect(within(airLiftCard as HTMLElement).getByLabelText("3 white orbs")).toBeTruthy();
    expect(document.querySelectorAll(".upgrade-panel .ability-card")).toHaveLength(9);
    expect(screen.queryByText(/King may teleport within 4 spaces/i)).toBeNull();
    const allAbilities = screen.getByLabelText(/all abilities levels/i);
    fireEvent.click(within(allAbilities).getByRole("button", { name: /lv 2/i }));
    expect(screen.getByText(/King may teleport within 4 spaces/i)).toBeTruthy();
  });

  it("renders distinct artwork for each active piece marker", () => {
    const savedState = createGame(1);
    savedState.phase = "play";
    savedState.board.e2.status = {
      hardened: 2,
      poisoned: 2,
      markedForDeath: { owner: "black", round: 1 },
    };
    window.localStorage.setItem(LEGACY_SAVE_KEY, JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      state: savedState,
    }));

    const { container } = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /load game/i }));
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));

    const pawn = container.querySelector('[data-piece-id="white-pawn-4"]');
    expect(pawn?.querySelector('[data-status="hardened"] svg')).toBeTruthy();
    expect(pawn?.querySelector('[data-status="poisoned"] svg')).toBeTruthy();
    expect(pawn?.querySelector('[data-status="markedForDeath"] svg')).toBeTruthy();
    expect(pawn?.querySelector(".status-markers")?.getAttribute("title")).toBe(
      "Hardened, Poisoned, Marked",
    );
  });

  it("enables undo from Settings and restores the previous completed turn", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^new game$/i }));
    fireEvent.click(screen.getByRole("button", { name: /begin local duel/i }));
    fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    fireEvent.click(screen.getByRole("switch", { name: /allow undo/i }));
    expect(window.localStorage.getItem("god-chess-undo-enabled")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /close settings/i }));

    const draft = (god: string, domain: string) => {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`${god} ${domain}`, "i") }));
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`claim ${god}`, "i") }));
    };
    draft("Ares", "Conflict");
    draft("Medusa", "Sight");
    draft("Midas", "Commerce");
    draft("Chiron", "Momentum");
    draft("Artemis", "Ambush");
    draft("Death", "Mortality");

    fireEvent.click(screen.getByRole("button", { name: /ares conflict/i }));
    fireEvent.click(screen.getByRole("button", { name: /threaten/i }));
    fireEvent.click(screen.getByRole("gridcell", { name: "e2, white pawn" }));
    fireEvent.click(screen.getByRole("gridcell", { name: "e4" }));

    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: /^undo$/i }) as HTMLButtonElement).disabled,
      ).toBe(false)
    );
    fireEvent.click(screen.getByRole("button", { name: /save & quit/i }));
    await waitFor(() => expect(screen.getByRole("img", { name: /god chess/i })).toBeTruthy());
    const storedGames = JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? "[]");
    expect(storedGames[0].version).toBe(3);
    expect(storedGames[0].undoHistory).toHaveLength(1);

    cleanup();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /load game/i }));
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));

    const undo = screen.getByRole("button", { name: /^undo$/i });
    expect((undo as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(undo);

    expect(screen.getByRole("gridcell", { name: "e2, white pawn" })).toBeTruthy();
    expect(screen.getByRole("gridcell", { name: "e4" })).toBeTruthy();
    expect((screen.getByRole("button", { name: /^undo$/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("undoes a completed upgrade", () => {
    const savedState = createGame(1);
    savedState.phase = "upgrade";
    savedState.activeColor = "white";
    savedState.players.white.gods = ["quetzacoatl"];
    savedState.players.black.gods = ["medusa"];
    savedState.upgradeQueue = ["white", "black"];
    savedState.notice = "White upgrades one ability.";
    window.localStorage.setItem("god-chess-undo-enabled", "true");
    window.localStorage.setItem(SAVE_KEY, JSON.stringify([{
      version: 3,
      id: "upgrade-save",
      savedAt: new Date().toISOString(),
      state: savedState,
      undoHistory: [],
    }]));

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /load game/i }));
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /quetzacoatl/i }).at(-1)!);
    fireEvent.click(screen.getByRole("button", { name: /^flight/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm flight/i }));

    expect(screen.getByText(/black upgrades one ability/i)).toBeTruthy();
    const undo = screen.getByRole("button", { name: /^undo$/i });
    expect((undo as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(undo);

    expect(screen.getByText(/white upgrades one ability/i)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /quetzacoatl/i }).at(-1)!);
    const flightCard = screen.getByText("Flight").closest(".ability-card");
    expect(flightCard).toBeTruthy();
    expect(within(flightCard as HTMLElement).getByText("CURRENT LVL 1")).toBeTruthy();
  });

  it("previews instant ability targets before confirming the effect", () => {
    const savedState = createGame(1);
    savedState.phase = "play";
    savedState.players.white.gods = ["medusa"];
    savedState.players.white.orbs.black = 3;
    window.localStorage.setItem(LEGACY_SAVE_KEY, JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      state: savedState,
    }));

    const { container } = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /load game/i }));
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));
    fireEvent.click(screen.getByRole("button", { name: /medusa sight/i }));
    fireEvent.click(screen.getByRole("button", { name: /stone gaze/i }));

    expect(screen.getByRole("button", { name: /confirm stone gaze/i })).toBeTruthy();
    expect(screen.getByRole("gridcell", {
      name: /e2, white pawn, affected by selected ability/i,
    })).toBeTruthy();
    expect(container.querySelector('[data-piece-id="white-pawn-4"] [data-status="frozen"]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /confirm stone gaze/i }));

    expect(container.querySelector('[data-piece-id="white-pawn-4"] [data-status="frozen"]')).toBeTruthy();
  });

  it("lists multiple saved games with pantheons and allows deletion", () => {
    let firstState = createGame(1);
    firstState = gameReducer(firstState, { type: "draft", godId: "ares" });
    let secondState = createGame(2, { mode: "ai" });
    secondState = gameReducer(secondState, { type: "draft", godId: "artemis" });
    window.localStorage.setItem(SAVE_KEY, JSON.stringify([
      {
        version: 2,
        id: "save-one",
        savedAt: "2026-09-27T12:00:00.000Z",
        state: firstState,
      },
      {
        version: 2,
        id: "save-two",
        savedAt: "2026-09-27T13:00:00.000Z",
        state: secondState,
      },
    ]));

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /load game/i }));

    expect(screen.getAllByRole("button", { name: /load saved game/i })).toHaveLength(2);
    expect(screen.getByLabelText("Ares")).toBeTruthy();
    expect(screen.getByLabelText("Artemis")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: /delete saved game/i })[0]);
    expect(screen.getAllByRole("button", { name: /load saved game/i })).toHaveLength(1);
    expect(JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? "[]")).toHaveLength(1);
  });
});
