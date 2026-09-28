import type { GameState } from "./game/types";

export const SAVE_KEY = "god-chess-saves-v2";
export const LEGACY_SAVE_KEY = "god-chess-save-v1";

export interface SavedGame {
  version: 3;
  id: string;
  savedAt: string;
  state: GameState;
  undoHistory: GameState[];
  turnStart?: GameState;
}

interface StoredSavedGame {
  version?: number;
  id?: string;
  savedAt?: string;
  state?: GameState;
  undoHistory?: GameState[];
  turnStart?: GameState;
}

export const prepareSavedState = (state: GameState) => {
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

const isSavedGameState = (state: GameState | undefined): state is GameState =>
  Boolean(
    state &&
    ["draft", "play", "upgrade", "gameover"].includes(state.phase) &&
    state.board &&
    state.players?.white &&
    state.players?.black,
  );

export const saveId = () => globalThis.crypto?.randomUUID?.() ??
  `save-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const normalizeSavedGame = (value: unknown): SavedGame | undefined => {
  const saved = value as StoredSavedGame;
  if (
    !saved ||
    (saved.version !== 2 && saved.version !== 3) ||
    !saved.id ||
    !saved.savedAt ||
    !isSavedGameState(saved.state)
  ) return undefined;
  return {
    version: 3,
    id: saved.id,
    savedAt: saved.savedAt,
    state: prepareSavedState(saved.state),
    undoHistory: (Array.isArray(saved.undoHistory) ? saved.undoHistory : [])
      .filter(isSavedGameState)
      .map(prepareSavedState),
    turnStart: isSavedGameState(saved.turnStart)
      ? prepareSavedState(saved.turnStart)
      : undefined,
  };
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
      const legacy = JSON.parse(legacyRaw) as {
        version?: number;
        savedAt?: string;
        state?: GameState;
      };
      if (legacy.version === 1 && legacy.savedAt && isSavedGameState(legacy.state)) {
        games.push({
          version: 3,
          id: saveId(),
          savedAt: legacy.savedAt,
          state: prepareSavedState(legacy.state),
          undoHistory: [],
          turnStart: legacy.state.phase === "play"
            ? prepareSavedState(legacy.state)
            : undefined,
        });
        migrated = true;
      }
      window.localStorage.removeItem(LEGACY_SAVE_KEY);
    }
    const sorted = sortSavedGames(games);
    if (migrated) persistLocalSavedGames(sorted);
    return sorted;
  } catch (error) {
    console.error("Unable to load saved God Chess games.", error);
    return [];
  }
};

export const createSavedGame = (
  id: string,
  state: GameState,
  undoHistory: GameState[],
  turnStart?: GameState,
): SavedGame => ({
  version: 3,
  id,
  savedAt: new Date().toISOString(),
  state: prepareSavedState(state),
  undoHistory: undoHistory.map(prepareSavedState),
  turnStart: turnStart ? prepareSavedState(turnStart) : undefined,
});

export const mergeSavedGame = (games: SavedGame[], saved: SavedGame) =>
  sortSavedGames([saved, ...games.filter((game) => game.id !== saved.id)]);
