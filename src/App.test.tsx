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

const accountHarness = vi.hoisted(() => ({
  account: undefined as
    | { userId: string; email: string; displayName: string }
    | undefined,
  configured: false,
  loading: false,
  working: false,
  error: undefined as string | undefined,
  signIn: vi.fn(async () => "Signed in."),
  signUp: vi.fn(async () => "Account created."),
  signOut: vi.fn(async () => undefined),
  updateDisplayName: vi.fn(async () => "Display name updated."),
}));

const cloudSaveHarness = vi.hoisted(() => ({
  load: vi.fn(),
  upsert: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
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

vi.mock("./account/useAccount", () => ({
  useAccount: () => ({
    account: accountHarness.account,
    configured: accountHarness.configured,
    loading: accountHarness.loading,
    working: accountHarness.working,
    error: accountHarness.error,
    signIn: accountHarness.signIn,
    signUp: accountHarness.signUp,
    signOut: accountHarness.signOut,
    updateDisplayName: accountHarness.updateDisplayName,
  }),
}));

vi.mock("./account/cloudSaves", () => ({
  loadCloudSavedGames: cloudSaveHarness.load,
  upsertCloudSavedGame: cloudSaveHarness.upsert,
  deleteCloudSavedGame: cloudSaveHarness.remove,
}));

vi.mock("./account/cloudPuzzleProgress", () => ({
  loadCloudCompletedPuzzles: vi.fn(async () => []),
  upsertCloudCompletedPuzzles: vi.fn(async () => undefined),
}));

import App, { ActionPanel } from "./App";
import { createGame, gameReducer } from "./game/engine";
import { GODS } from "./game/gods";
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
  accountHarness.account = undefined;
  accountHarness.configured = false;
  accountHarness.loading = false;
  accountHarness.working = false;
  accountHarness.error = undefined;
  accountHarness.signIn.mockClear();
  accountHarness.signUp.mockClear();
  accountHarness.signOut.mockClear();
  accountHarness.updateDisplayName.mockClear();
  cloudSaveHarness.load.mockReset();
  cloudSaveHarness.load.mockResolvedValue([]);
  cloudSaveHarness.upsert.mockClear();
  cloudSaveHarness.remove.mockClear();
  threeOnlineHarness.state = {
    role: "none",
    connecting: false,
  };
  threeOnlineHarness.setState = undefined;
  threeOnlineHarness.disconnects = 0;
});

describe("game startup", () => {
  it("gates Local until cloud save hydration preserves the existing library", async () => {
    accountHarness.account = {
      userId: "account-1",
      email: "player@example.com",
      displayName: "Player",
    };
    accountHarness.configured = true;
    const existing = createSavedGame("cloud-existing", createGame(1), []);
    let resolveSaves!: (games: typeof existing[]) => void;
    cloudSaveHarness.load.mockImplementation(() =>
      new Promise((resolve) => {
        resolveSaves = resolve;
      })
    );

    render(<App />);

    const local = screen.getByRole("button", { name: /^local$/i }) as HTMLButtonElement;
    expect(local.disabled).toBe(true);
    fireEvent.click(local);
    expect(screen.queryByRole("heading", { name: /choose player count/i })).toBeNull();
    expect(cloudSaveHarness.upsert).not.toHaveBeenCalled();

    await act(async () => {
      resolveSaves([existing]);
      await Promise.resolve();
    });

    await waitFor(() => expect(local.disabled).toBe(false));
    expect(screen.getByRole("button", { name: /load game/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /load game/i }));
    expect(screen.getByRole("button", {
      name: new RegExp(`load saved game from ${new Date(existing.savedAt).toLocaleString()}`, "i"),
    })).toBeTruthy();
  });

  it("always opens Local at the player-count chooser despite stale online room state", () => {
    threeOnlineHarness.state = {
      role: "none",
      connecting: false,
      roomCode: "ABCDE",
    };

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^local$/i }));

    expect(screen.getByRole("heading", { name: /choose player count/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^2 player$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^3 player$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^4 player$/i })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /choose opponent/i })).toBeNull();
  });

  it("shows the title choices and staged Local navigation with coherent back paths", () => {
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
    expect(screen.getByRole("button", { name: /^local$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^online$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^puzzles$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /load game/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^local$/i }));
    expect(screen.getByRole("button", { name: /^2 player$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^3 player$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^4 player$/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^2 player$/i }));

    expect(screen.getByRole("button", { name: /^local duel two players/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^divine ai challenge/i }));
    expect((screen.getByRole("slider", { name: /ai difficulty/i }) as HTMLInputElement).value)
      .toBe("7");
    fireEvent.click(screen.getByRole("button", { name: /back to local/i }));
    expect(screen.getByRole("button", { name: /^3 player$/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /back to title/i }));
    expect(screen.getByRole("button", { name: /^local$/i })).toBeTruthy();
  });

  it("routes Online player counts to Host/Join and Puzzles directly", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^online$/i }));
    for (const playerCount of [2, 3, 4]) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${playerCount} player$`, "i") }));
      expect(screen.getByText(`ONLINE · ${playerCount} PLAYER`)).toBeTruthy();
      expect(screen.getByRole("button", { name: /^host$/i })).toBeTruthy();
      expect(screen.getByRole("button", { name: /^join$/i })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: /back to online/i }));
    }
    fireEvent.click(screen.getByRole("button", { name: /back to title/i }));
    fireEvent.click(screen.getByRole("button", { name: /^puzzles$/i }));
    expect(screen.getByRole("heading", { name: /choose a difficulty/i })).toBeTruthy();
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

    it("shows an explicit stalemate draw, reveals the board, and undoes it", () => {
      const playable = completeClassicDraft();
      const finished = structuredClone(playable);
      finished.phase = "gameover";
      finished.winner = undefined;
      finished.result = { kind: "draw", reason: "stalemate" };
      finished.lastAction = "Black was stalemated. The match is a draw.";
      finished.notice = finished.lastAction;
      window.localStorage.setItem(SAVE_KEY, JSON.stringify([
        createSavedGame("stalemate-classic", finished, [playable], playable),
      ]));

      const { container } = render(<App />);
      fireEvent.click(screen.getByRole("button", { name: /load game/i }));
      fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));

      expect(screen.getByRole("dialog", { name: /draw by stalemate/i }))
        .toBeTruthy();
      expect(screen.getByText(/no complete legal turn while its King is safe/i))
        .toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: /see board/i }));
      expect(container.querySelector(".finished-view")).toBeTruthy();
      expect(screen.getAllByText(finished.lastAction).length).toBeGreaterThan(0);

      fireEvent.click(screen.getByRole("button", { name: /enable undo/i }));
      fireEvent.click(screen.getByRole("switch", { name: /allow undo/i }));
      fireEvent.click(screen.getByRole("button", { name: /close settings/i }));
      fireEvent.click(screen.getByTitle(/undo the latest completed turn/i));

      expect(container.querySelector(".finished-view")).toBeNull();
      expect(screen.getByText(playable.notice)).toBeTruthy();
    });
  });

  it("opens the local three-player setup without exposing an online room mode", () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^local$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^3 player$/i }));

    expect(screen.getByRole("heading", { name: /choose the battlefield/i })).toBeTruthy();
    expect(container.querySelectorAll(".three-variant-card")).toHaveLength(5);
    expect(screen.queryByText(/room code/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /close three-player setup/i }));
    expect(screen.getByRole("button", { name: /^3 player$/i })).toBeTruthy();
  });

  it("autosaves the active three-player state without overwriting it with the hidden duel", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^local$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^3 player$/i }));
    fireEvent.click(screen.getByRole("button", { name: /begin three-player draft/i }));

    await waitFor(() => {
      const saves = JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? "[]");
      expect(saves[0]?.state?.variant).toBe("three-player");
    });
  });

  it("leaves an existing local save untouched throughout online hosting and reconnect", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^local$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^2 player$/i }));
    fireEvent.click(screen.getByRole("button", { name: /begin local duel/i }));
    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? "[]"))
        .toHaveLength(1);
    });
    fireEvent.click(screen.getByRole("button", { name: /save & quit/i }));
    await screen.findByRole("button", { name: /^local$/i });
    const existingSave = window.localStorage.getItem(SAVE_KEY);

    fireEvent.click(screen.getByRole("button", { name: /^online$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^3 player$/i }));
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
    fireEvent.click(screen.getByRole("button", { name: /^online$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^3 player$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^join$/i }));
    fireEvent.change(screen.getByLabelText(/room code/i), { target: { value: "ABCDE" } });
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

  it("disconnects a pending three-player attempt before selecting another player count", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^online$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^3 player$/i }));
    fireEvent.click(screen.getByRole("button", { name: /create room/i }));
    expect(screen.getByRole("button", { name: /connecting/i })).toBeTruthy();

    const beforeSwitch = threeOnlineHarness.disconnects;
    fireEvent.click(screen.getByRole("button", { name: /back to online/i }));
    expect(threeOnlineHarness.disconnects).toBe(beforeSwitch + 1);
    fireEvent.click(screen.getByRole("button", { name: /^4 player$/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create room/i })).toBeTruthy();
    });
  });

  it("browses puzzle difficulties and starts a selected position", () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^puzzles$/i }));

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
    fireEvent.click(screen.getByRole("button", { name: /^puzzles$/i }));

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

  it("highlights Position Six Enchant sources and attaches both stage prompts to Enchant", () => {
    let state = PUZZLES.find((puzzle) => puzzle.id === "opened-file")!.createState();
    state = gameReducer(state, { type: "select-god", godId: "teles" });
    state = gameReducer(state, { type: "select-ability", abilityId: "enchant" });
    window.localStorage.setItem(LEGACY_SAVE_KEY, JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      state,
    }));

    const { container } = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /load game/i }));
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));

    const enchantCard = screen.getByText("Enchant").closest(".ability-card");
    expect(enchantCard).toBeTruthy();
    expect(within(enchantCard as HTMLElement).getByText(/choose a highlighted hostile piece/i))
      .toBeTruthy();
    expect(container.querySelector('[data-square="e6"].legal-source')).toBeTruthy();
    expect(container.querySelectorAll(".board-square.legal-source")).toHaveLength(1);

    fireEvent.click(screen.getByRole("gridcell", { name: /e6, black bishop/i }));
    const destination = container.querySelector<HTMLButtonElement>(
      ".board-square.legal-destination",
    );
    expect(destination).toBeTruthy();
    fireEvent.click(destination!);

    expect(within(enchantCard as HTMLElement).getByText(/make one ordinary legal move/i))
      .toBeTruthy();
    expect(container.querySelectorAll(".board-square.legal-source").length)
      .toBeGreaterThan(0);
    expect(screen.queryByText(/choose an available god/i)).toBeNull();
  });

  it("highlights and applies Salem Hex to a hostile King", () => {
    let state = createGame(1);
    for (const godId of [
      "salem",
      "chiron",
      "midas",
      "death",
      "artemis",
      "medusa",
    ] as const) {
      state = gameReducer(state, { type: "draft", godId });
    }
    state.players.white.orbs = { white: 50, black: 50 };
    state = gameReducer(state, { type: "select-god", godId: "salem" });
    state = gameReducer(state, { type: "select-ability", abilityId: "hex" });
    window.localStorage.setItem(SAVE_KEY, JSON.stringify([
      createSavedGame("hex-king-classic", state, []),
    ]));

    const { container } = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /load game/i }));
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));

    const hostileKing = container.querySelector<HTMLElement>(
      '[data-square="e8"].legal-destination',
    );
    expect(hostileKing).toBeTruthy();
    expect(container.querySelector('[data-square="e1"].legal-destination')).toBeNull();
    fireEvent.click(hostileKing!);
    expect(
      within(screen.getByRole("gridcell", { name: /e8.*black king/i }))
        .getByLabelText(/hexed/i),
    ).toBeTruthy();
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
    fireEvent.click(screen.getByRole("button", { name: /^local$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^2 player$/i }));
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
    fireEvent.click(screen.getByRole("button", { name: /^local$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^2 player$/i }));
    fireEvent.click(screen.getByRole("button", { name: /begin local duel/i }));
    fireEvent.click(screen.getByRole("button", { name: /auto-pick random god/i }));

    expect(screen.getByText(/black picks/i)).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: /game paused locally/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^resume$/i }));
    expect(screen.getByText(/black picks/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /auto-pick random god/i })).toBeTruthy();
  });

  it("quick-drafts the remaining two-player AI picks in canonical order", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^local$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^2 player$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^divine ai challenge/i }));
    fireEvent.click(screen.getByRole("button", { name: /challenge the ai/i }));

    const draftActions = document.querySelector(".draft-auto-actions") as HTMLElement;
    expect(within(draftActions).getAllByRole("button").map((button) =>
      button.textContent?.replace(/\s+/g, " ").trim()
    )).toEqual(["Auto-pick random god", "Quick Draft"]);

    let claimButton: HTMLButtonElement | undefined;
    await waitFor(() => {
      claimButton = document.querySelector<HTMLButtonElement>(
        ".god-inspector .primary-button",
      ) ?? undefined;
      expect(claimButton).toBeTruthy();
      expect(claimButton?.disabled).toBe(false);
    });
    const manuallyClaimedGod = GODS.find((god) =>
      claimButton?.textContent?.includes(god.name)
    )?.id;
    expect(manuallyClaimedGod).toBeTruthy();
    fireEvent.click(claimButton!);
    const quickDraft = screen.getByRole("button", { name: /^quick draft$/i });
    fireEvent.click(quickDraft);
    fireEvent.click(quickDraft);

    fireEvent.click(screen.getByRole("button", { name: /save & quit/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^local$/i })).toBeTruthy());
    const saved = JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? "[]")[0].state;
    const drafted = [...saved.players.white.gods, ...saved.players.black.gods];
    expect(saved.phase).toBe("play");
    expect(saved.draft.pickIndex).toBe(saved.draft.order.length);
    expect(saved.players.white.gods).toHaveLength(3);
    expect(saved.players.black.gods).toHaveLength(3);
    const playerPickIndexes = { white: 0, black: 0 };
    const chronological = saved.draft.order.map((color: "white" | "black") =>
      saved.players[color].gods[playerPickIndexes[color]++]
    );
    const existingPickCount = chronological.indexOf(manuallyClaimedGod!) + 1;
    expect(existingPickCount).toBeGreaterThan(0);
    const remaining = GODS.map((god) => god.id).filter(
      (godId) => !chronological.slice(0, existingPickCount).includes(godId),
    );
    expect(chronological.slice(existingPickCount)).toEqual(
      remaining.slice(0, chronological.length - existingPickCount),
    );
    expect(new Set(drafted).size).toBe(6);
  });

  it("never exposes Quick Draft for a classic online draft", () => {
    const onlineDraft = createGame(1, { mode: "online" });
    window.localStorage.setItem(LEGACY_SAVE_KEY, JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      state: onlineDraft,
    }));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /load game/i }));
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));
    expect(screen.queryByRole("button", { name: /^quick draft$/i })).toBeNull();
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
    expect(screen.getByText("DIVINE UPGRADE").closest(".panel-heading")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /choose an ability to strengthen/i })).toBeTruthy();
    expect(screen.queryByText(/King may teleport within 4 spaces/i)).toBeNull();
    const allAbilities = screen.getByLabelText(/all abilities levels/i);
    const levelTwo = within(allAbilities).getByRole("button", { name: /lv 2/i });
    const levelThree = within(allAbilities).getByRole("button", { name: /lv 3/i });
    expect(levelTwo.getAttribute("aria-pressed")).toBe("false");
    expect(levelThree.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(levelTwo);
    expect(levelTwo.classList.contains("active")).toBe(true);
    expect(levelTwo.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/King may teleport within 4 spaces/i)).toBeTruthy();
    fireEvent.click(levelThree);
    expect(levelThree.classList.contains("active")).toBe(true);
    expect(levelThree.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(levelThree);
    expect(levelThree.classList.contains("active")).toBe(false);
    expect(levelThree.getAttribute("aria-pressed")).toBe("false");
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
    fireEvent.click(screen.getByRole("button", { name: /^local$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^2 player$/i }));
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
    await waitFor(() => {
      const storedGames = JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? "[]");
      expect(storedGames[0].version).toBe(3);
      expect(storedGames[0].undoHistory).toHaveLength(1);
    }, { timeout: 5000 });

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
