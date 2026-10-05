// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameAction } from "./game/engine";
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

const aiHarness = vi.hoisted(() => ({
  plan: undefined as GameAction[] | undefined,
  calls: 0,
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

vi.mock("./game/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./game/ai")>();
  return {
    ...actual,
    chooseAiPlan: (...args: Parameters<typeof actual.chooseAiPlan>) => {
      aiHarness.calls += 1;
      return aiHarness.plan ?? actual.chooseAiPlan(...args);
    },
  };
});

import App, { ActionPanel, ChessBoard, GameScreen } from "./App";
import { chooseAiPlan } from "./game/ai";
import {
  classicMoveFirstCandidates,
  createGame,
  gameReducer,
} from "./game/engine";
import { GODS } from "./game/gods";
import { createDefaultThreePlayerConfig } from "./game/threePlayerConfig";
import { createThreePlayerGame, threePlayerReducer } from "./game/threePlayerEngine";
import { createThreePlayerStateEnvelope } from "./game/threePlayerSession";
import { PUZZLES } from "./game/puzzles";
import { createSavedGame, prepareSavedState } from "./saves";

const SAVE_KEY = "god-chess-saves-v2";
const LEGACY_SAVE_KEY = "god-chess-save-v1";

interface ClassicAiWorkerRequest {
  requestId: number;
  state: ReturnType<typeof createGame>;
}

interface ClassicAiWorkerResponse {
  requestId: number;
  actions: GameAction[];
}

class FakeClassicAiWorker {
  static instances: FakeClassicAiWorker[] = [];
  onmessage: ((event: MessageEvent<ClassicAiWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  message?: ClassicAiWorkerRequest;
  terminated = false;

  constructor() {
    FakeClassicAiWorker.instances.push(this);
  }

  postMessage(message: ClassicAiWorkerRequest) {
    this.message = message;
  }

  terminate() {
    this.terminated = true;
  }
}

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

const openPlayMenu = () => {
  const start = screen.queryByRole("button", { name: /^start$/i });
  if (start) fireEvent.click(start);
};

const openPlayOption = (name: "Local" | "Online" | "Puzzles" | "Load") => {
  openPlayMenu();
  fireEvent.click(screen.getByRole("button", {
    name: new RegExp(`^${name}$`, "i"),
  }));
};

const commitMissedPuzzleMove = () => {
  const { container } = render(<App />);
  openPlayOption("Puzzles");
  fireEvent.click(screen.getByRole("button", { name: /^easy/i }));
  fireEvent.click(screen.getByRole("button", { name: /puzzle 1/i }));
  fireEvent.click(screen.getByTitle("Use Chiron"));
  fireEvent.click(screen.getByRole("button", { name: /Charge/ }));
  fireEvent.click(container.querySelector('[data-square="e2"]')!);
  fireEvent.click(container.querySelector('[data-square="e3"]')!);
  return container;
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
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
  aiHarness.plan = undefined;
  aiHarness.calls = 0;
  FakeClassicAiWorker.instances = [];
});

describe("game startup", () => {
  it("keeps Load visible and disabled until cloud save hydration completes", async () => {
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

    openPlayMenu();
    const load = screen.getByRole("button", { name: /^load$/i }) as HTMLButtonElement;
    expect(load.disabled).toBe(true);
    expect(screen.getByText(/loading saved games/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: /^local$/i }) as HTMLButtonElement).disabled)
      .toBe(false);
    expect(cloudSaveHarness.upsert).not.toHaveBeenCalled();

    await act(async () => {
      resolveSaves([existing]);
      await Promise.resolve();
    });

    await waitFor(() => expect(load.disabled).toBe(false));
    fireEvent.click(load);
    expect(screen.getByRole("button", {
      name: new RegExp(`load saved game from ${new Date(existing.savedAt).toLocaleString()}`, "i"),
    })).toBeTruthy();
  });

  it("keeps Load visible and disabled when the save library is empty", () => {
    render(<App />);
    openPlayMenu();

    const load = screen.getByRole("button", { name: /^load$/i }) as HTMLButtonElement;
    expect(load.disabled).toBe(true);
    expect(screen.getByText(/no saved games available/i)).toBeTruthy();
  });

  it("always opens Local at the player-count chooser despite stale online room state", () => {
    threeOnlineHarness.state = {
      role: "none",
      connecting: false,
      roomCode: "ABCDE",
    };

    render(<App />);
    openPlayOption("Local");

    expect(screen.getByRole("heading", { name: /choose player count/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^2 player$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^3 player$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^4 player$/i })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /choose opponent/i })).toBeNull();
  });

  it("shows one title action and the ordered Play menu with coherent back paths", () => {
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
    expect(screen.getByRole("button", { name: /^start$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^local$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^online$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^puzzles$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^load$/i })).toBeNull();

    openPlayMenu();
    expect(
      within(screen.getByRole("group", { name: /play options/i }))
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label") ?? button.textContent?.trim()),
    ).toEqual(["Local", "Online", "Puzzles", "Load"]);
    fireEvent.click(screen.getByRole("button", { name: /^load$/i }));
    expect(screen.getByRole("heading", { name: /load game/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /back to play/i }));
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
    fireEvent.click(screen.getByRole("button", { name: /back to play/i }));
    expect(screen.getByRole("button", { name: /^local$/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /back to title/i }));
    expect(screen.getByRole("button", { name: /^start$/i })).toBeTruthy();
  });

  it("routes Online player counts to Host/Join and Puzzles directly", () => {
    render(<App />);
    openPlayOption("Online");
    for (const playerCount of [2, 3, 4]) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${playerCount} player$`, "i") }));
      expect(screen.getByText(`ONLINE · ${playerCount} PLAYER`)).toBeTruthy();
      expect(screen.getByRole("button", { name: /^host$/i })).toBeTruthy();
      expect(screen.getByRole("button", { name: /^join$/i })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: /back to online/i }));
    }
    fireEvent.click(screen.getByRole("button", { name: /back to play/i }));
    fireEvent.click(screen.getByRole("button", { name: /^puzzles$/i }));
    expect(screen.getByRole("heading", { name: /choose a difficulty/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /play menu/i }));
    expect(screen.getByRole("button", { name: /^puzzles$/i })).toBeTruthy();
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
      openPlayOption("Load");
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
      openPlayOption("Load");
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
    openPlayOption("Local");
    fireEvent.click(screen.getByRole("button", { name: /^3 player$/i }));

    expect(screen.getByRole("heading", { name: /choose the battlefield/i })).toBeTruthy();
    expect(container.querySelectorAll(".three-variant-card")).toHaveLength(5);
    expect(screen.queryByText(/room code/i)).toBeNull();
    expect(container.querySelectorAll(".setup-navigation-header")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /close three-player setup/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /back to local/i }));
    expect(screen.getByRole("button", { name: /^3 player$/i })).toBeTruthy();
  });

  it("autosaves the active three-player state without overwriting it with the hidden duel", async () => {
    render(<App />);
    openPlayOption("Local");
    fireEvent.click(screen.getByRole("button", { name: /^3 player$/i }));
    fireEvent.click(screen.getByRole("button", { name: /begin three-player draft/i }));

    await waitFor(() => {
      const saves = JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? "[]");
      expect(saves[0]?.state?.variant).toBe("three-player");
    });
  });

  it("opens three-player New setup inside the shared shell and backs to Local", () => {
    let state = createThreePlayerGame(createDefaultThreePlayerConfig());
    for (const god of GODS.slice(0, 9)) {
      state = threePlayerReducer(state, { type: "draft", godId: god.id });
    }
    window.localStorage.setItem(SAVE_KEY, JSON.stringify([
      createSavedGame("three-new-setup", state, [], state),
    ]));

    const { container } = render(<App />);
    openPlayOption("Load");
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));
    fireEvent.click(screen.getByRole("button", { name: /open match menu/i }));
    fireEvent.click(screen.getByRole("button", { name: /^new setup$/i }));

    expect(screen.getByRole("heading", { name: /choose the battlefield/i })).toBeTruthy();
    expect(container.querySelectorAll(".setup-navigation-header")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /close three-player setup/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /back to local/i }));
    expect(screen.getByRole("button", { name: /^3 player$/i })).toBeTruthy();
  });

  it("leaves an existing local save untouched throughout online hosting and reconnect", async () => {
    render(<App />);
    openPlayOption("Local");
    fireEvent.click(screen.getByRole("button", { name: /^2 player$/i }));
    fireEvent.click(screen.getByRole("button", { name: /begin local duel/i }));
    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? "[]"))
        .toHaveLength(1);
    });
    fireEvent.click(screen.getByRole("button", { name: /save & quit/i }));
    await screen.findByRole("button", { name: /^start$/i });
    const existingSave = window.localStorage.getItem(SAVE_KEY);

    openPlayOption("Online");
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
    openPlayOption("Online");
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
    openPlayOption("Online");
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
    openPlayOption("Puzzles");

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

  it("paints a committed puzzle move before AI planning and ignores a stale worker result after restart", async () => {
    vi.stubGlobal("Worker", FakeClassicAiWorker);
    const persist = vi.spyOn(Storage.prototype, "setItem");

    const container = commitMissedPuzzleMove();

    expect(container.querySelector('[data-square="e3"]')?.textContent).toContain("♘");
    await waitFor(() => {
      expect(FakeClassicAiWorker.instances).toHaveLength(1);
    });
    expect(FakeClassicAiWorker.instances[0].message?.state.activeColor).toBe("black");
    expect(persist.mock.calls.some(([key]) =>
      key === SAVE_KEY || key === LEGACY_SAVE_KEY
    )).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /Restart/ }));
    const staleWorker = FakeClassicAiWorker.instances[0];
    const staleRequestId = staleWorker.message!.requestId;
    expect(staleWorker.terminated).toBe(true);
    staleWorker.onmessage?.({
      data: {
        requestId: staleRequestId,
        actions: [{ type: "select-god", godId: "chiron" }],
      },
    } as MessageEvent<ClassicAiWorkerResponse>);

    await waitFor(() => {
      expect(container.querySelector('[data-square="e2"]')?.textContent).toContain("♘");
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
    });
    expect(screen.queryByText(/Chiron answers/i)).toBeNull();
  });

  it("falls back exactly once when the classic AI worker constructor throws", async () => {
    aiHarness.plan = [];
    class ThrowingWorker {
      constructor() {
        throw new Error("Worker blocked");
      }
    }
    vi.stubGlobal("Worker", ThrowingWorker);

    commitMissedPuzzleMove();

    await waitFor(() => {
      expect(aiHarness.calls).toBe(1);
    });
    expect((await screen.findAllByText(
      /Black was stalemated/i,
      {},
      { timeout: 2500 },
    )).length).toBeGreaterThan(0);
  });

  it("falls back once after an asynchronous worker error and ignores a late result", async () => {
    aiHarness.plan = [];
    vi.stubGlobal("Worker", FakeClassicAiWorker);
    commitMissedPuzzleMove();
    await waitFor(() => {
      expect(FakeClassicAiWorker.instances).toHaveLength(1);
    });
    const worker = FakeClassicAiWorker.instances[0];

    act(() => {
      worker.onerror?.({
        type: "error",
        preventDefault: vi.fn(),
      } as unknown as ErrorEvent);
      worker.onmessage?.({
        data: {
          requestId: worker.message!.requestId,
          actions: [{ type: "select-god", godId: "chiron" }],
        },
      } as MessageEvent<ClassicAiWorkerResponse>);
    });

    expect(aiHarness.calls).toBe(1);
    expect((await screen.findAllByText(
      /Black was stalemated/i,
      {},
      { timeout: 2500 },
    )).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Chiron answers/i)).toBeNull();
  });

  it("adjudicates an empty puzzle AI plan instead of leaving the turn locked", async () => {
    vi.stubGlobal("Worker", FakeClassicAiWorker);
    commitMissedPuzzleMove();
    await waitFor(() => {
      expect(FakeClassicAiWorker.instances).toHaveLength(1);
    });
    const worker = FakeClassicAiWorker.instances[0];

    act(() => {
      worker.onmessage?.({
        data: {
          requestId: worker.message!.requestId,
          actions: [],
        },
      } as unknown as MessageEvent<ClassicAiWorkerResponse>);
    });

    expect((await screen.findAllByText(/Black was stalemated/i)).length)
      .toBeGreaterThan(0);
  });

  it("marks locally completed puzzles in the difficulty browser", () => {
    window.localStorage.setItem("god-chess-puzzle-progress-v1", JSON.stringify(["centaurs-lance"]));

    const { container } = render(<App />);
    openPlayOption("Puzzles");

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
    openPlayOption("Load");
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
    expect(within(resurrectCard as HTMLElement).getByText("Resurrect")
      .classList.contains("ability-card-title")).toBe(true);
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
    openPlayOption("Load");
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

  it("renders empty legal destinations as dots while preserving occupied capture markers", () => {
    const state = createGame(1);
    state.phase = "play";
    state.legalTargets = ["e4", "e7"];
    const { container } = render(
      <ChessBoard
        state={state}
        dispatch={vi.fn()}
        onInspectSquare={vi.fn()}
      />,
    );

    const emptyTarget = container.querySelector('[data-square="e4"]');
    const occupiedTarget = container.querySelector('[data-square="e7"]');
    expect(emptyTarget?.classList.contains("legal-destination")).toBe(true);
    expect(emptyTarget?.querySelector(".move-target-dot")).toBeTruthy();
    expect(occupiedTarget?.classList.contains("legal-occupied")).toBe(true);
    expect(occupiedTarget?.querySelector(".move-target-dot")).toBeNull();
  });

  it("renders provisional move-first board state without dispatching an engine move", () => {
    const state = completeClassicDraft();
    const dispatch = vi.fn();
    const onMoveFirstSquare = vi.fn();
    const { container } = render(
      <ChessBoard
        state={state}
        dispatch={dispatch}
        onInspectSquare={vi.fn()}
        moveFirstDraft={{ source: "e2", destination: "e4" }}
        moveFirstTargets={["e3", "e4"]}
        onMoveFirstSquare={onMoveFirstSquare}
      />,
    );

    expect(container.querySelector('[data-square="e2"].provisional-source')).toBeTruthy();
    expect(container.querySelector('[data-square="e4"].provisional-destination')).toBeTruthy();
    expect(screen.getByRole("gridcell", {
      name: /e4, provisional move destination, not committed/i,
    })).toBeTruthy();
    fireEvent.click(container.querySelector('[data-square="e4"]')!);
    expect(onMoveFirstSquare).toHaveBeenCalledWith("e4");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("shows full first-ability cards with explicit light and dark previews", () => {
    const state = completeClassicDraft();
    const candidates = classicMoveFirstCandidates(state, {
      from: "e2",
      to: "e4",
    });
    const commit = vi.fn();
    render(
      <ActionPanel
        state={state}
        dispatch={vi.fn()}
        onInspectGod={vi.fn()}
        onCloseInspection={vi.fn()}
        moveFirstDraft={{ source: "e2", destination: "e4" }}
        moveFirstCandidates={candidates}
        onCancelMoveFirst={vi.fn()}
        onCommitMoveFirst={commit}
      />,
    );

    expect(screen.getByText(/not committed/i)).toBeTruthy();
    expect(screen.getByText("Slither").classList.contains("ability-card-title")).toBe(true);
    expect(screen.getAllByText(/Light 0/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Dark 0/i).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("Slither"));
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        godId: "quetzacoatl",
        abilityId: "flight",
        move: { from: "e2", to: "e4" },
      }),
    );
  });

  it("cancels, reselects, and commits a local move-first draft as one divine action", () => {
    const state = completeClassicDraft();
    window.localStorage.setItem(SAVE_KEY, JSON.stringify([
      createSavedGame("move-first-ui", state, []),
    ]));

    const { container } = render(<App />);
    openPlayOption("Load");
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));

    fireEvent.click(container.querySelector('[data-square="e2"]')!);
    expect(container.querySelector('[data-square="e2"].provisional-source')).toBeTruthy();
    fireEvent.click(container.querySelector('[data-square="e2"]')!);
    expect(container.querySelector(".provisional-source")).toBeNull();
    fireEvent.click(container.querySelector('[data-square="e2"]')!);
    fireEvent.click(container.querySelector('[data-square="g1"]')!);
    expect(container.querySelector('[data-square="g1"].provisional-source')).toBeTruthy();
    expect(container.querySelector('[data-square="e2"].provisional-source')).toBeNull();
    fireEvent.click(container.querySelector('[data-square="f3"]')!);
    expect(container.querySelector('[data-square="f3"].provisional-destination')).toBeTruthy();
    expect(container.querySelector('[data-square="g1"] [data-piece-id]')).toBeTruthy();
    expect(container.querySelector('[data-square="f3"] [data-piece-id]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /back \/ cancel/i }));
    expect(container.querySelector(".provisional-source")).toBeNull();
    expect(container.querySelector(".provisional-destination")).toBeNull();

    fireEvent.click(container.querySelector('[data-square="g1"]')!);
    fireEvent.click(container.querySelector('[data-square="f3"]')!);
    fireEvent.click(screen.getByText("Slither"));

    expect(container.querySelector('[data-square="g1"] [data-piece-id]')).toBeNull();
    expect(container.querySelector('[data-square="f3"] [data-piece-id]')).toBeTruthy();
    expect(screen.getByText(/black to act/i)).toBeTruthy();
  });

  it("renders Position Thirteen's occupied Escort destination as a legal target", () => {
    const puzzle = PUZZLES.find((candidate) => candidate.id === "royal-landing")!;
    let state = puzzle.createState();
    for (const action of puzzle.solutionTurns[0]) state = gameReducer(state, action);
    const response = chooseAiPlan(state, () => 0);
    for (const action of response) state = gameReducer(state, action);
    for (const action of puzzle.solutionTurns[1].slice(0, -1)) {
      state = gameReducer(state, action);
    }
    const dispatch = vi.fn();
    const { container } = render(
      <ChessBoard
        state={state}
        dispatch={dispatch}
        onInspectSquare={vi.fn()}
      />,
    );

    const escortDestination = container.querySelector<HTMLElement>('[data-square="f6"]');
    expect(escortDestination?.classList.contains("legal-destination")).toBe(true);
    expect(escortDestination?.classList.contains("legal-occupied")).toBe(true);
    expect(escortDestination?.querySelector(".move-target-dot")).toBeNull();

    fireEvent.click(escortDestination!);
    expect(dispatch).toHaveBeenCalledWith({ type: "square", square: "f6" });
  });

  it("keeps committed Rage active without exposing cancellation or ability switching", () => {
    let state = createGame(1);
    state.phase = "play";
    state.players.white.gods = ["kangus"];
    state.players.white.orbs.black = 3;
    state.players.white.upgrades.rage = 2;
    state = gameReducer(state, { type: "select-god", godId: "kangus" });
    state = gameReducer(state, { type: "select-ability", abilityId: "rage" });
    state = gameReducer(state, { type: "square", square: "e2" });
    expect(state.pending?.step).toBe("rage-choice");

    const dispatch = vi.fn();
    render(
      <ActionPanel
        state={state}
        dispatch={dispatch}
        onInspectGod={vi.fn()}
        onCloseInspection={vi.fn()}
      />,
    );

    const rageCard = screen.getByText("Rage").closest(".ability-card") as HTMLElement;
    const goadCard = screen.getByText("Goad").closest(".ability-card") as HTMLElement;
    expect(rageCard.classList.contains("active")).toBe(true);
    expect(rageCard.classList.contains("disabled")).toBe(false);
    expect(rageCard.querySelector(".ability-card-main")?.getAttribute("aria-disabled")).toBeNull();
    expect(goadCard.classList.contains("disabled")).toBe(true);
    expect((screen.getByRole("button", {
      name: /choose a different god/i,
    }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: /cancel ability/i })).toBeNull();

    fireEvent.click(screen.getByText("Rage"));
    expect(dispatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /spare allies/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "rage-resolve", spareFriendly: true });
  });

  it("keeps the classic inspector in a distinct wide rail with a stacked fallback", () => {
    const state = completeClassicDraft();
    state.board.e2.status.hardened = "god";
    window.localStorage.setItem(SAVE_KEY, JSON.stringify([
      createSavedGame("classic-layout", state, []),
    ]));

    const { container } = render(<App />);
    openPlayOption("Load");
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));
    fireEvent.click(screen.getByRole("gridcell", { name: /e2, white pawn/i }));

    const layout = container.querySelector(".game-layout");
    const inspectorRail = layout?.querySelector(
      ':scope > [data-layout-area="piece-inspector"]',
    );
    const stackedFallback = layout?.querySelector(
      ':scope > .side-column [data-layout-fallback="piece-inspector"]',
    );
    expect(inspectorRail?.querySelector(".square-info-panel")).toBeTruthy();
    expect(stackedFallback?.querySelector(".square-info-panel")).toBeTruthy();
    expect(layout?.children[0]).toBe(inspectorRail);
    expect(layout?.children[1]?.classList.contains("board-column")).toBe(true);
    expect(layout?.children[2]?.classList.contains("side-column")).toBe(true);
  });

  it("uses player-bar container space to switch between inline Gods and overflow controls", () => {
    const state = completeClassicDraft();
    window.localStorage.setItem(SAVE_KEY, JSON.stringify([
      createSavedGame("classic-player-bars", state, []),
    ]));
    const { container } = render(<App />);
    openPlayOption("Load");
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));

    const playerBars = [...container.querySelectorAll(".player-bar")];
    expect(playerBars).toHaveLength(2);
    for (const playerBar of playerBars) {
      expect(playerBar.getAttribute("data-player-tools-layout")).toBe("container-responsive");
      expect(playerBar.querySelectorAll("[data-overflow-toggle]")).toHaveLength(1);
      expect(playerBar.querySelectorAll("[data-inline-when-roomy]")).toHaveLength(1);
      expect(playerBar.querySelectorAll(".mini-pantheon")).toHaveLength(1);
      expect(playerBar.querySelectorAll(".mini-pantheon button")).toHaveLength(3);
    }

    const firstToggle = playerBars[0].querySelector<HTMLButtonElement>("[data-overflow-toggle]")!;
    fireEvent.click(firstToggle);
    expect(firstToggle.getAttribute("aria-expanded")).toBe("true");
    expect(playerBars[0].classList.contains("tools-open")).toBe(true);
    expect(playerBars[0].querySelectorAll(".mini-pantheon")).toHaveLength(1);
    expect(playerBars[0].querySelectorAll(".mini-pantheon button")).toHaveLength(3);
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
    openPlayOption("Load");
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
    openPlayOption("Load");
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));

    expect(screen.getByText(/black picks/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /quetzacoatl sky w/i })).toBeTruthy();
  });

  it("saves and quits a new game back to the main menu", async () => {
    render(<App />);
    openPlayOption("Local");
    fireEvent.click(screen.getByRole("button", { name: /^2 player$/i }));
    fireEvent.click(screen.getByRole("button", { name: /begin local duel/i }));
    fireEvent.click(screen.getByRole("button", { name: /save & quit/i }));

    expect(await screen.findByRole("img", { name: /god chess/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^start$/i })).toBeTruthy();
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
    openPlayOption("Local");
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

  it("randomly quick-drafts the remaining two-player picks without changing prior ownership", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.75);
    render(<App />);
    openPlayOption("Local");
    fireEvent.click(screen.getByRole("button", { name: /^2 player$/i }));
    fireEvent.click(screen.getByRole("button", { name: /begin local duel/i }));

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
    await waitFor(() => expect(screen.getByRole("button", { name: /^start$/i })).toBeTruthy());
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
    const expectedRemaining: typeof remaining = [];
    while (remaining.length && expectedRemaining.length < chronological.length - existingPickCount) {
      expectedRemaining.push(remaining.splice(Math.floor(remaining.length * 0.75), 1)[0]);
    }
    expect(chronological.slice(existingPickCount)).toEqual(
      expectedRemaining,
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
    openPlayOption("Load");
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
    openPlayOption("Load");
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));

    const airLiftCard = screen.getByText("Air Lift").closest(".ability-card");
    expect(airLiftCard).toBeTruthy();
    expect(within(airLiftCard as HTMLElement).getByText("Air Lift")
      .classList.contains("ability-card-title")).toBe(true);
    expect(within(airLiftCard as HTMLElement).getByLabelText("3 white orbs")).toBeTruthy();
    expect(document.querySelectorAll(".upgrade-panel .ability-card")).toHaveLength(9);
    const upgradeList = document.querySelector(".classic-upgrade-list");
    expect(upgradeList).toBeTruthy();
    expect(upgradeList?.getAttribute("data-upgrade-layout")).toBe("single-column");
    expect(upgradeList?.classList.contains("four-upgrade-list")).toBe(false);
    expect(upgradeList?.querySelectorAll(":scope > section")).toHaveLength(3);
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

  it("clears an AI upgrade presentation lock when a prepared save replaces the live state", async () => {
    let liveState = createGame(2, { mode: "ai" });
    for (const godId of ["ares", "medusa", "midas", "death", "artemis", "chiron"] as const) {
      liveState = gameReducer(liveState, { type: "draft", godId });
    }
    liveState.phase = "upgrade";
    liveState.activeColor = "white";
    liveState.upgradeQueue = ["white", "black"];
    liveState = gameReducer(liveState, {
      type: "preview-upgrade",
      godId: "ares",
      abilityId: "threaten",
    });
    liveState = gameReducer(liveState, { type: "upgrade", abilityId: "threaten" });
    const dispatch = vi.fn();
    const gameProps = {
      dispatch,
      onSaveAndQuit: vi.fn(),
      onRestart: vi.fn(),
      onRestartPuzzle: vi.fn(),
      onNextPuzzle: vi.fn(),
      opponentColor: "white" as const,
      undoEnabled: false,
      canUndo: false,
      onUndo: vi.fn(),
      onOpenSettings: vi.fn(),
    };
    const { container, rerender } = render(
      <GameScreen state={liveState} {...gameProps} />,
    );

    await waitFor(() =>
      expect(container.querySelector(".game-page")?.classList.contains("input-locked"))
        .toBe(true)
    );

    const resumedState = prepareSavedState(liveState);
    rerender(<GameScreen state={resumedState} {...gameProps} />);

    await waitFor(() =>
      expect(container.querySelector(".game-page")?.classList.contains("input-locked"))
        .toBe(false)
    );
    fireEvent.click(screen.getByRole("button", { name: /use chiron/i }));
    expect(screen.getByText("Gallop").closest(".ability-card")?.classList.contains("read-only"))
      .toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /^gallop/i }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "preview-upgrade",
      godId: "chiron",
      abilityId: "gallop",
    });
  });

  it("autosaves the human-to-AI upgrade handoff without exposing the prior move", async () => {
    vi.useFakeTimers();
    let savedState = createGame(1, { mode: "ai" });
    for (const godId of ["ares", "medusa", "midas", "death", "artemis", "chiron"] as const) {
      savedState = gameReducer(savedState, { type: "draft", godId });
    }
    savedState.phase = "upgrade";
    savedState.activeColor = "white";
    savedState.upgradeQueue = ["white", "black"];
    window.localStorage.setItem(SAVE_KEY, JSON.stringify([
      createSavedGame("immediate-upgrade-save", savedState, []),
    ]));

    render(<App />);
    openPlayOption("Load");
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));
    fireEvent.click(screen.getByRole("button", { name: /use ares/i }));
    fireEvent.click(screen.getByRole("button", { name: /^threaten/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm threaten/i }));
    await act(async () => undefined);

    const [stored] = JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? "[]");
    expect(stored.state.activeColor).toBe("black");
    expect(stored.state.upgradeQueue).toEqual(["black"]);
    expect(stored.state.presentation).toBeUndefined();
    expect(stored.state.upgradePreview).toBeUndefined();
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
    openPlayOption("Load");
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
    openPlayOption("Local");
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
    openPlayOption("Load");
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));

    const undo = screen.getByRole("button", { name: /^undo$/i });
    expect((undo as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(undo);

    expect(screen.getByRole("gridcell", { name: "e2, white pawn" })).toBeTruthy();
    expect(screen.getByRole("gridcell", { name: "e4" })).toBeTruthy();
    expect((screen.getByRole("button", { name: /^undo$/i }) as HTMLButtonElement).disabled).toBe(true);
  }, 15_000);

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
    openPlayOption("Load");
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /quetzacoatl/i }).at(-1)!);
    fireEvent.click(screen.getByRole("button", { name: /^slither/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm slither/i }));

    expect(screen.getByText(/black upgrades one ability/i)).toBeTruthy();
    const undo = screen.getByRole("button", { name: /^undo$/i });
    expect((undo as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(undo);

    expect(screen.getByText(/white upgrades one ability/i)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /quetzacoatl/i }).at(-1)!);
    const slitherCard = screen.getByText("Slither").closest(".ability-card");
    expect(slitherCard).toBeTruthy();
    expect(within(slitherCard as HTMLElement).getByText("CURRENT LVL 1")).toBeTruthy();
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
    openPlayOption("Load");
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));
    fireEvent.click(screen.getByRole("button", { name: /medusa sight/i }));
    fireEvent.click(screen.getByRole("button", { name: /stone gaze/i }));

    expect(screen.getByRole("button", { name: /confirm stone gaze/i })).toBeTruthy();
    expect(screen.getByRole("gridcell", {
      name: /e2, white pawn, affected by selected ability/i,
    })).toBeTruthy();
    const preview = container.querySelector('[data-square="e2"]');
    expect(preview?.classList.contains("effect-preview")).toBe(true);
    expect(preview?.classList.contains("legal-destination")).toBe(false);
    expect(preview?.querySelector(".move-target-dot")).toBeNull();
    expect(container.querySelector('[data-piece-id="white-pawn-4"] [data-status="frozen"]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /confirm stone gaze/i }));

    expect(container.querySelector('[data-piece-id="white-pawn-4"] [data-status="frozen"]')).toBeTruthy();
  });

  it("renders Slither's committed orb choice without a cancel control", () => {
    const savedState = createGame(1);
    savedState.phase = "play";
    savedState.activeColor = "white";
    savedState.players.white.gods = ["quetzacoatl"];
    savedState.players.black.gods = ["medusa"];
    savedState.selectedGod = "quetzacoatl";
    savedState.selectedAbility = "flight";
    savedState.pending = {
      godId: "quetzacoatl",
      abilityId: "flight",
      step: "slither-orb",
      destination: "c3",
      movedPieceId: "white-rook",
    };
    savedState.notice = "Slither: choose one extra white or black orb.";
    window.localStorage.setItem(LEGACY_SAVE_KEY, JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      state: savedState,
    }));

    render(<App />);
    openPlayOption("Load");
    fireEvent.click(screen.getByRole("button", { name: /load saved game/i }));

    expect(screen.getByRole("button", { name: /gain white/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /gain black/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /cancel ability/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /gain black/i }));
    expect(screen.getByText(/black to act/i)).toBeTruthy();
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
    openPlayOption("Load");

    expect(screen.getAllByRole("button", { name: /load saved game/i })).toHaveLength(2);
    expect(screen.getByLabelText("Ares")).toBeTruthy();
    expect(screen.getByLabelText("Artemis")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: /delete saved game/i })[0]);
    expect(screen.getAllByRole("button", { name: /load saved game/i })).toHaveLength(1);
    expect(JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? "[]")).toHaveLength(1);
  });
});
