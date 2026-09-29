import type { GameState } from "./game/types";
import {
  isFourPlayerState,
  prepareFourPlayerState,
} from "./game/fourPlayerPersistence";
import type { FourPlayerState } from "./game/fourPlayerTypes";

export const SAVE_KEY = "god-chess-saves-v2";
export const LEGACY_SAVE_KEY = "god-chess-save-v1";

export interface TwoPlayerSavedGame {
  version: 3;
  id: string;
  savedAt: string;
  state: GameState;
  undoHistory: GameState[];
  turnStart?: GameState;
}

export interface FourPlayerSavedGame {
  version: 3;
  id: string;
  savedAt: string;
  state: FourPlayerState;
  undoHistory: FourPlayerState[];
  turnStart?: FourPlayerState;
}

export type SavedGame = TwoPlayerSavedGame | FourPlayerSavedGame;
export type SavedGameState = GameState | FourPlayerState;

export const isFourPlayerSavedGame = (
  game: SavedGame,
): game is FourPlayerSavedGame => isFourPlayerState(game.state);

interface StoredSavedGame {
  version?: number;
  id?: string;
  savedAt?: string;
  state?: unknown;
  undoHistory?: unknown[];
  turnStart?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const prepareTwoPlayerState = (state: GameState) => {
  const savedState = structuredClone(state);
  savedState.orbAnimations = [];
  savedState.nextOrbAnimationId ??= 1;
  savedState.captureAnimations = [];
  savedState.nextCaptureAnimationId ??= 1;
  savedState.presentation = undefined;
  savedState.upgradePreview = undefined;
  savedState.nextPresentationId ??= 1;
  savedState.gameMode ??= "local";
  savedState.aiDifficulty ??= 5;
  return savedState;
};

export function prepareSavedState(state: GameState): GameState;
export function prepareSavedState(state: FourPlayerState): FourPlayerState;
export function prepareSavedState(state: SavedGameState): SavedGameState {
  return isFourPlayerState(state)
    ? prepareFourPlayerState(state)
    : prepareTwoPlayerState(state);
}

const isTwoPlayerGameState = (state: unknown): state is GameState => {
  if (!isRecord(state)) return false;
  const candidate = state as unknown as GameState;
  return Boolean(
    !("variant" in candidate) &&
    ["draft", "play", "upgrade", "gameover"].includes(candidate.phase) &&
    candidate.board &&
    candidate.players?.white &&
    candidate.players?.black,
  );
};

const isSavedGameState = (state: unknown): state is SavedGameState =>
  Boolean(
    isFourPlayerState(state) || isTwoPlayerGameState(state),
  );

export const saveId = () => globalThis.crypto?.randomUUID?.() ??
  `save-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const normalizeSavedGameValue = (value: unknown): SavedGame | undefined => {
  if (!isRecord(value)) return undefined;
  const saved = value as StoredSavedGame;
  if (
    (saved.version !== 2 && saved.version !== 3) ||
    typeof saved.id !== "string" ||
    !saved.id ||
    typeof saved.savedAt !== "string" ||
    !saved.savedAt ||
    !isSavedGameState(saved.state)
  ) return undefined;
  if (isFourPlayerState(saved.state)) {
    const undoHistory = (Array.isArray(saved.undoHistory) ? saved.undoHistory : []);
    if (undoHistory.some((state) => !isFourPlayerState(state))) return undefined;
    if (saved.turnStart !== undefined && !isFourPlayerState(saved.turnStart)) return undefined;
    return {
      version: 3,
      id: saved.id,
      savedAt: saved.savedAt,
      state: prepareFourPlayerState(saved.state),
      undoHistory: undoHistory.map((state) => prepareFourPlayerState(state as FourPlayerState)),
      turnStart: saved.turnStart
        ? prepareFourPlayerState(saved.turnStart as FourPlayerState)
        : undefined,
    };
  }
  const undoHistory = (Array.isArray(saved.undoHistory) ? saved.undoHistory : []);
  if (undoHistory.some((state) => !isTwoPlayerGameState(state))) return undefined;
  if (saved.turnStart !== undefined && !isTwoPlayerGameState(saved.turnStart)) return undefined;
  return {
    version: 3,
    id: saved.id,
    savedAt: saved.savedAt,
    state: prepareTwoPlayerState(saved.state),
    undoHistory: undoHistory.map((state) => prepareTwoPlayerState(state as GameState)),
    turnStart: isTwoPlayerGameState(saved.turnStart)
      ? prepareTwoPlayerState(saved.turnStart)
      : undefined,
  };
};

export const normalizeSavedGame = (value: unknown): SavedGame | undefined => {
  try {
    return normalizeSavedGameValue(value);
  } catch {
    return undefined;
  }
};

export const sortSavedGames = (games: SavedGame[]) =>
  [...games].sort((a, b) => b.savedAt.localeCompare(a.savedAt));

export const persistLocalSavedGames = (games: SavedGame[]) => {
  window.localStorage.setItem(SAVE_KEY, JSON.stringify(games));
};

export const loadLocalSavedGames = (): SavedGame[] => {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    const decoded = raw ? JSON.parse(raw) as unknown : [];
    const storedGames = Array.isArray(decoded) ? decoded : [];
    let migrated = false;
    const games = storedGames.flatMap((stored): SavedGame[] => {
      const normalized = normalizeSavedGame(stored);
      if (!normalized) return [];
      if ((stored as StoredSavedGame).version !== 3) migrated = true;
      return [normalized];
    });
    const legacyRaw = window.localStorage.getItem(LEGACY_SAVE_KEY);
    if (legacyRaw) {
      try {
        const legacy = JSON.parse(legacyRaw) as {
          version?: number;
          savedAt?: string;
          state?: unknown;
        };
        if (legacy.version === 1 && legacy.savedAt && isTwoPlayerGameState(legacy.state)) {
          games.push({
            version: 3,
            id: saveId(),
            savedAt: legacy.savedAt,
            state: prepareTwoPlayerState(legacy.state),
            undoHistory: [],
            turnStart: legacy.state.phase === "play"
              ? prepareTwoPlayerState(legacy.state)
              : undefined,
          });
          migrated = true;
        }
      } catch {
        migrated = true;
      } finally {
        window.localStorage.removeItem(LEGACY_SAVE_KEY);
      }
    }
    const sorted = sortSavedGames(games);
    if (migrated) persistLocalSavedGames(sorted);
    return sorted;
  } catch (error) {
    console.error("Unable to load saved God Chess games.", error);
    return [];
  }
};

export function createSavedGame(
  id: string,
  state: GameState,
  undoHistory: GameState[],
  turnStart?: GameState,
): TwoPlayerSavedGame;
export function createSavedGame(
  id: string,
  state: FourPlayerState,
  undoHistory: FourPlayerState[],
  turnStart?: FourPlayerState,
): FourPlayerSavedGame;
export function createSavedGame(
  id: string,
  state: SavedGameState,
  undoHistory: SavedGameState[],
  turnStart?: SavedGameState,
): SavedGame {
  if (isFourPlayerState(state)) {
    if (
      undoHistory.some((snapshot) => !isFourPlayerState(snapshot)) ||
      (turnStart !== undefined && !isFourPlayerState(turnStart))
    ) {
      throw new Error("Four-player saves require four-player undo snapshots.");
    }
    return {
      version: 3,
      id,
      savedAt: new Date().toISOString(),
      state: prepareFourPlayerState(state),
      undoHistory: undoHistory.map((snapshot) =>
        prepareFourPlayerState(snapshot as FourPlayerState)
      ),
      turnStart: turnStart
        ? prepareFourPlayerState(turnStart as FourPlayerState)
        : undefined,
    };
  }
  if (
    undoHistory.some((snapshot) => !isTwoPlayerGameState(snapshot)) ||
    (turnStart !== undefined && !isTwoPlayerGameState(turnStart))
  ) {
    throw new Error("Two-player saves require two-player undo snapshots.");
  }
  return {
    version: 3,
    id,
    savedAt: new Date().toISOString(),
    state: prepareTwoPlayerState(state),
    undoHistory: undoHistory.map((snapshot) => prepareTwoPlayerState(snapshot as GameState)),
    turnStart: turnStart ? prepareTwoPlayerState(turnStart as GameState) : undefined,
  };
}

export const mergeSavedGame = (games: SavedGame[], saved: SavedGame) =>
  sortSavedGames([saved, ...games.filter((game) => game.id !== saved.id)]);
