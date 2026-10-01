import { allSquares } from "./game/chess";
import {
  isFourPlayerState,
  prepareFourPlayerState,
} from "./game/fourPlayerPersistence";
import type { FourPlayerState } from "./game/fourPlayerTypes";
import {
  isThreePlayerState,
  prepareThreePlayerState,
} from "./game/threePlayerPersistence";
import type { ThreePlayerState } from "./game/threePlayerTypes";
import { GOD_BY_ID, GODS } from "./game/gods";
import type {
  ActionPresentation,
  Banana,
  CaptureAnimation,
  Color,
  GameState,
  GodId,
  OrbAnimation,
  PendingAction,
  Piece,
  PieceStatus,
  PlayerState,
  StealthMove,
  UpgradePreview,
} from "./game/types";

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

export interface ThreePlayerSavedGame {
  version: 3;
  id: string;
  savedAt: string;
  state: ThreePlayerState;
  undoHistory: ThreePlayerState[];
  turnStart?: ThreePlayerState;
}

export type SavedGame =
  | TwoPlayerSavedGame
  | FourPlayerSavedGame
  | ThreePlayerSavedGame;
export type SavedGameState = GameState | FourPlayerState | ThreePlayerState;

export const isFourPlayerSavedGame = (
  game: SavedGame,
): game is FourPlayerSavedGame => isFourPlayerState(game.state);

export const isThreePlayerSavedGame = (
  game: SavedGame,
): game is ThreePlayerSavedGame => isThreePlayerState(game.state);

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

const COLORS = ["white", "black"] as const;
const GAME_MODES = new Set(["local", "ai", "online", "puzzle"]);
const PHASES = new Set(["draft", "play", "upgrade", "gameover"]);
const PIECE_TYPES = new Set(["king", "queen", "rook", "bishop", "knight", "pawn"]);
const GOD_IDS = new Set(GODS.map((god) => god.id));
const ABILITY_IDS = new Set(
  GODS.flatMap((god) => god.abilities.map((ability) => ability.id)),
);
const SQUARES = new Set(allSquares);
const STRICT_TWO_PLAYER_FIELDS = [
  "phase",
  "gameMode",
  "aiDifficulty",
  "board",
  "players",
  "activeColor",
  "whitePlayer",
  "draft",
  "rested",
  "round",
  "turn",
  "upgradeQueue",
  "legalTargets",
  "bananas",
  "stealth",
  "orbAnimations",
  "nextOrbAnimationId",
  "captureAnimations",
  "nextCaptureAnimationId",
  "nextPresentationId",
  "history",
  "notice",
] as const;

const isColor = (value: unknown): value is Color =>
  value === "white" || value === "black";
const isGodId = (value: unknown): value is GodId =>
  typeof value === "string" && GOD_IDS.has(value as GodId);
const isSquare = (value: unknown): value is string =>
  typeof value === "string" && SQUARES.has(value);
const isInteger = (
  value: unknown,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= minimum &&
  value <= maximum;
const isUnique = <T>(values: T[]) => new Set(values).size === values.length;
const hasOnlyKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
) => Object.keys(value).every((key) => keys.includes(key));
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");
const isColorArray = (value: unknown): value is Color[] =>
  Array.isArray(value) && value.every(isColor);
const isGodArray = (value: unknown): value is GodId[] =>
  Array.isArray(value) && value.every(isGodId) && isUnique(value);
const isDuration = (value: unknown, strings: string[]) =>
  isInteger(value) || (typeof value === "string" && strings.includes(value));

const isPieceStatus = (value: unknown): value is PieceStatus => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "hardened",
      "frozen",
      "frozenBy",
      "gazing",
      "poisoned",
      "poisonedBy",
      "polymorphed",
      "luredBy",
      "hexedBy",
      "prepared",
      "ritual",
      "markedForDeath",
      "hired",
      "movedThisTurn",
      "chargeUntil",
    ])
  ) return false;
  if (value.hardened !== undefined && !isDuration(value.hardened, ["choice", "god"])) return false;
  if (value.frozen !== undefined && !isDuration(value.frozen, ["god"])) return false;
  if (value.frozenBy !== undefined && !isColor(value.frozenBy)) return false;
  if (value.gazing !== undefined && typeof value.gazing !== "boolean") return false;
  if (value.poisoned !== undefined && !isDuration(value.poisoned, ["god"])) return false;
  if (value.poisonedBy !== undefined && !isColor(value.poisonedBy)) return false;
  if (value.polymorphed !== undefined && !isDuration(value.polymorphed, ["god"])) return false;
  if (value.luredBy !== undefined && !isColor(value.luredBy)) return false;
  if (value.hexedBy !== undefined && !isColor(value.hexedBy)) return false;
  if (
    value.prepared !== undefined &&
    typeof value.prepared !== "boolean" &&
    !(
      isRecord(value.prepared) &&
      hasOnlyKeys(value.prepared, ["owner", "level"]) &&
      isColor(value.prepared.owner) &&
      typeof value.prepared.level === "number" &&
      Number.isInteger(value.prepared.level) &&
      [1, 2, 3].includes(value.prepared.level)
    )
  ) return false;
  if (
    value.ritual !== undefined &&
    !(
      isRecord(value.ritual) &&
      hasOnlyKeys(value.ritual, ["owner", "expires"]) &&
      isColor(value.ritual.owner) &&
      isDuration(value.ritual.expires, ["kangus"])
    )
  ) return false;
  if (
    value.markedForDeath !== undefined &&
    !(
      isRecord(value.markedForDeath) &&
      hasOnlyKeys(value.markedForDeath, ["owner", "round", "immediate"]) &&
      isColor(value.markedForDeath.owner) &&
      isInteger(value.markedForDeath.round, 1) &&
      (
        value.markedForDeath.immediate === undefined ||
        typeof value.markedForDeath.immediate === "boolean"
      )
    )
  ) return false;
  if (value.hired !== undefined && typeof value.hired !== "boolean") return false;
  if (value.movedThisTurn !== undefined && typeof value.movedThisTurn !== "boolean") return false;
  if (value.chargeUntil !== undefined && !isDuration(value.chargeUntil, ["god"])) return false;
  return true;
};

const isPiece = (value: unknown): value is Piece =>
  isRecord(value) &&
  hasOnlyKeys(value, [
    "id",
    "type",
    "color",
    "controller",
    "hasMoved",
    "status",
  ]) &&
  typeof value.id === "string" &&
  Boolean(value.id) &&
  PIECE_TYPES.has(String(value.type)) &&
  isColor(value.color) &&
  isColor(value.controller) &&
  typeof value.hasMoved === "boolean" &&
  isPieceStatus(value.status);

const isUpgrades = (value: unknown) =>
  isRecord(value) &&
  Object.entries(value).every(([abilityId, level]) =>
    ABILITY_IDS.has(abilityId) &&
    typeof level === "number" &&
    Number.isInteger(level) &&
    [1, 2, 3].includes(level)
  );

const isPlayerState = (
  value: unknown,
  color: Color,
): value is PlayerState =>
  isRecord(value) &&
  hasOnlyKeys(value, [
    "name",
    "color",
    "gods",
    "orbs",
    "graveyard",
    "upgrades",
  ]) &&
  typeof value.name === "string" &&
  Boolean(value.name.trim()) &&
  value.color === color &&
  isGodArray(value.gods) &&
  value.gods.length <= 3 &&
  isRecord(value.orbs) &&
  hasOnlyKeys(value.orbs, COLORS) &&
  isInteger(value.orbs.white) &&
  isInteger(value.orbs.black) &&
  Array.isArray(value.graveyard) &&
  value.graveyard.every((entry) =>
    isRecord(entry) &&
    hasOnlyKeys(entry, ["piece", "capturedOnTurn"]) &&
    isPiece(entry.piece) &&
    isInteger(entry.capturedOnTurn, 1)
  ) &&
  isUpgrades(value.upgrades);

const pendingAbilityIsValid = (
  godId: GodId,
  abilityId: string,
) =>
  GOD_BY_ID[godId].abilities.some((ability) => ability.id === abilityId) ||
  (godId === "artemis" && abilityId === "snipe-shot") ||
  (godId === "anubis" && abilityId === "harden-choice");

const isPending = (value: unknown): value is PendingAction => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "godId",
      "abilityId",
      "step",
      "source",
      "destination",
      "selected",
      "movedPieceId",
      "movesRemaining",
    ]) ||
    !isGodId(value.godId) ||
    typeof value.abilityId !== "string" ||
    !pendingAbilityIsValid(value.godId, value.abilityId) ||
    typeof value.step !== "string" ||
    !value.step
  ) return false;
  return (
    (value.source === undefined || isSquare(value.source)) &&
    (value.destination === undefined || isSquare(value.destination)) &&
    (
      value.selected === undefined ||
      (
        Array.isArray(value.selected) &&
        value.selected.every(isSquare) &&
        isUnique(value.selected)
      )
    ) &&
    (value.movedPieceId === undefined || typeof value.movedPieceId === "string") &&
    (value.movesRemaining === undefined || isInteger(value.movesRemaining))
  );
};

const isBanana = (value: unknown): value is Banana =>
  isRecord(value) &&
  hasOnlyKeys(value, ["square", "owner", "expires"]) &&
  isSquare(value.square) &&
  isColor(value.owner) &&
  (
    isInteger(value.expires, 1) ||
    value.expires === "kangus" ||
    value.expires === "god"
  );

const isStealthMove = (value: unknown): value is StealthMove =>
  isRecord(value) &&
  hasOnlyKeys(value, ["piece", "destination", "returnOnTurn"]) &&
  isPiece(value.piece) &&
  isSquare(value.destination) &&
  isInteger(value.returnOnTurn, 1);

const isStealthRecord = (
  value: unknown,
): value is Record<Color, StealthMove[]> =>
  isRecord(value) &&
  COLORS.every((color) =>
    Array.isArray(value[color]) &&
    value[color].every(isStealthMove)
  );

const isOptionalArrayOf = <T>(
  value: unknown,
  predicate: (entry: unknown) => entry is T,
) =>
  value === undefined ||
  (Array.isArray(value) && value.every(predicate));

const isOrbAnimation = (value: unknown): value is OrbAnimation =>
  isRecord(value) &&
  hasOnlyKeys(value, ["id", "player", "orb", "amount", "total", "source"]) &&
  isInteger(value.id, 1) &&
  isColor(value.player) &&
  isColor(value.orb) &&
  isInteger(value.amount) &&
  isInteger(value.total) &&
  isSquare(value.source);

const isCaptureAnimation = (value: unknown): value is CaptureAnimation =>
  isRecord(value) &&
  hasOnlyKeys(value, ["id", "player", "piece", "source", "total"]) &&
  isInteger(value.id, 1) &&
  isColor(value.player) &&
  isPiece(value.piece) &&
  isSquare(value.source) &&
  isInteger(value.total);

const isPresentation = (value: unknown): value is ActionPresentation => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "id",
      "kind",
      "color",
      "godId",
      "abilityId",
      "piece",
      "from",
      "to",
    ]) ||
    !isInteger(value.id, 1) ||
    !["god", "ability", "move", "upgrade-preview", "upgrade"].includes(String(value.kind)) ||
    !isColor(value.color) ||
    !isGodId(value.godId) ||
    (value.abilityId !== undefined && typeof value.abilityId !== "string") ||
    (value.piece !== undefined && !isPiece(value.piece)) ||
    (value.from !== undefined && !isSquare(value.from)) ||
    (value.to !== undefined && !isSquare(value.to))
  ) return false;
  return value.abilityId === undefined ||
    pendingAbilityIsValid(value.godId, value.abilityId) ||
    value.abilityId === "escort";
};

const isUpgradePreview = (value: unknown): value is UpgradePreview =>
  isRecord(value) &&
  hasOnlyKeys(value, ["color", "godId", "abilityId"]) &&
  isColor(value.color) &&
  isGodId(value.godId) &&
  (
    value.abilityId === undefined ||
    (
      typeof value.abilityId === "string" &&
      GOD_BY_ID[value.godId].abilities.some(
        (ability) => ability.id === value.abilityId,
      )
    )
  );

export const prepareTwoPlayerState = (state: GameState) => {
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
export function prepareSavedState(state: ThreePlayerState): ThreePlayerState;
export function prepareSavedState(state: SavedGameState): SavedGameState {
  if (isFourPlayerState(state)) return prepareFourPlayerState(state);
  if (isThreePlayerState(state)) return prepareThreePlayerState(state);
  return prepareTwoPlayerState(state);
}

export const isTwoPlayerGameState = (state: unknown): state is GameState => {
  if (
    !isRecord(state) ||
    "variant" in state ||
    !PHASES.has(String(state.phase)) ||
    (
      state.gameMode !== undefined &&
      !GAME_MODES.has(String(state.gameMode))
    ) ||
    (
      state.aiDifficulty !== undefined &&
      !isInteger(state.aiDifficulty, 1, 10)
    ) ||
    (state.aiColor !== undefined && !isColor(state.aiColor)) ||
    (state.onlineHostColor !== undefined && !isColor(state.onlineHostColor)) ||
    (state.puzzleId !== undefined && typeof state.puzzleId !== "string") ||
    (
      state.puzzlePlayerTurnsRemaining !== undefined &&
      !isInteger(state.puzzlePlayerTurnsRemaining)
    ) ||
    (state.puzzleFailed !== undefined && typeof state.puzzleFailed !== "boolean") ||
    !isRecord(state.board) ||
    !isRecord(state.players) ||
    !isPlayerState(state.players.white, "white") ||
    !isPlayerState(state.players.black, "black") ||
    !isColor(state.activeColor) ||
    typeof state.whitePlayer !== "number" ||
    !Number.isInteger(state.whitePlayer) ||
    ![1, 2].includes(state.whitePlayer) ||
    !isRecord(state.draft) ||
    !hasOnlyKeys(state.draft, ["order", "pickIndex", "available"]) ||
    !isColorArray(state.draft.order) ||
    state.draft.order.length !== 6 ||
    !isInteger(state.draft.pickIndex, 0, 6) ||
    !isGodArray(state.draft.available) ||
    !isGodArray(state.rested) ||
    !isInteger(state.round, 1) ||
    !isInteger(state.turn, 1) ||
    !isColorArray(state.upgradeQueue) ||
    !isUnique(state.upgradeQueue) ||
    !Array.isArray(state.legalTargets) ||
    !state.legalTargets.every(isSquare) ||
    !isUnique(state.legalTargets) ||
    !Array.isArray(state.bananas) ||
    !state.bananas.every(isBanana) ||
    !isStealthRecord(state.stealth) ||
    !isOptionalArrayOf(state.orbAnimations, isOrbAnimation) ||
    (
      state.nextOrbAnimationId !== undefined &&
      !isInteger(state.nextOrbAnimationId, 1)
    ) ||
    !isOptionalArrayOf(state.captureAnimations, isCaptureAnimation) ||
    (
      state.nextCaptureAnimationId !== undefined &&
      !isInteger(state.nextCaptureAnimationId, 1)
    ) ||
    (
      state.presentation !== undefined &&
      !isPresentation(state.presentation)
    ) ||
    (
      state.nextPresentationId !== undefined &&
      !isInteger(state.nextPresentationId, 1)
    ) ||
    (
      state.upgradePreview !== undefined &&
      !isUpgradePreview(state.upgradePreview)
    ) ||
    !isStringArray(state.history) ||
    typeof state.notice !== "string" ||
    (state.lastAction !== undefined && typeof state.lastAction !== "string") ||
    (state.enPassant !== undefined && !isSquare(state.enPassant)) ||
    (state.selectedGod !== undefined && !isGodId(state.selectedGod)) ||
    (
      state.selectedAbility !== undefined &&
      typeof state.selectedAbility !== "string"
    ) ||
    (state.selectedSquare !== undefined && !isSquare(state.selectedSquare)) ||
    (state.pending !== undefined && !isPending(state.pending)) ||
    (state.bonusTurn !== undefined && !isColor(state.bonusTurn)) ||
    (state.winner !== undefined && !isColor(state.winner))
  ) return false;

  const boardPieceIds: string[] = [];
  for (const [square, piece] of Object.entries(state.board)) {
    if (!isSquare(square) || !isPiece(piece)) return false;
    boardPieceIds.push(piece.id);
  }
  const players = state.players as unknown as GameState["players"];
  if (
    state.selectedGod !== undefined &&
    !players[state.activeColor as Color].gods.includes(state.selectedGod as GodId)
  ) return false;
  if (
    state.selectedAbility !== undefined &&
    (
      state.selectedGod === undefined ||
      !GOD_BY_ID[state.selectedGod as GodId].abilities.some(
        (ability) => ability.id === state.selectedAbility,
      )
    )
  ) return false;

  const allPieceIds = [...boardPieceIds];
  for (const color of COLORS) {
    for (const entry of players[color].graveyard) {
      allPieceIds.push(entry.piece.id);
    }
    for (const move of state.stealth[color] as StealthMove[]) {
      if (move.piece.controller !== color) return false;
      allPieceIds.push(move.piece.id);
    }
  }
  return isUnique(allPieceIds);
};

const hasConsistentTwoPlayerState = (state: GameState) => {
  const draftedGods = [
    ...state.players.white.gods,
    ...state.players.black.gods,
  ];
  const availableGods = state.draft.available;
  return (
    isUnique(draftedGods) &&
    isUnique([...draftedGods, ...availableGods]) &&
    draftedGods.length + availableGods.length === GODS.length &&
    state.draft.pickIndex === draftedGods.length &&
    (state.phase === "draft" || draftedGods.length === 6) &&
    state.rested.every((godId) => draftedGods.includes(godId)) &&
    (state.phase === "gameover") === Boolean(state.winner) &&
    (
      state.phase === "upgrade"
        ? (
          state.upgradeQueue.length > 0 &&
          state.activeColor === state.upgradeQueue[0]
        )
        : state.upgradeQueue.length === 0
    )
  );
};

export const isStrictTwoPlayerGameState = (
  state: unknown,
): state is GameState =>
  isRecord(state) &&
  STRICT_TWO_PLAYER_FIELDS.every((field) => field in state) &&
  isTwoPlayerGameState(state) &&
  hasConsistentTwoPlayerState(state);

export const isStrictOnlineTwoPlayerGameState = (
  state: unknown,
): state is GameState =>
  isStrictTwoPlayerGameState(state) &&
  state.gameMode === "online" &&
  isColor(state.onlineHostColor) &&
  state.aiColor === undefined &&
  state.puzzleId === undefined &&
  state.puzzlePlayerTurnsRemaining === undefined &&
  state.puzzleFailed === undefined;

const prepareSavedGameState = (
  state: unknown,
): SavedGameState | undefined => {
  if (isFourPlayerState(state)) return prepareFourPlayerState(state);
  if (isRecord(state) && state.variant === "three-player") {
    try {
      return prepareThreePlayerState(state);
    } catch {
      return undefined;
    }
  }
  if (isTwoPlayerGameState(state)) return prepareTwoPlayerState(state);
  return undefined;
};

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
    !saved.savedAt
  ) return undefined;
  const state = prepareSavedGameState(saved.state);
  if (!state) return undefined;
  if (isFourPlayerState(state)) {
    const undoHistory = (Array.isArray(saved.undoHistory) ? saved.undoHistory : []);
    if (undoHistory.some((state) => !isFourPlayerState(state))) return undefined;
    if (saved.turnStart !== undefined && !isFourPlayerState(saved.turnStart)) return undefined;
    return {
      version: 3,
      id: saved.id,
      savedAt: saved.savedAt,
      state,
      undoHistory: undoHistory.map((state) => prepareFourPlayerState(state as FourPlayerState)),
      turnStart: saved.turnStart
        ? prepareFourPlayerState(saved.turnStart as FourPlayerState)
        : undefined,
    };
  }
  if (isThreePlayerState(state)) {
    const undoHistory = (Array.isArray(saved.undoHistory) ? saved.undoHistory : [])
      .map((snapshot) => prepareSavedGameState(snapshot));
    if (
      undoHistory.some((snapshot) => !snapshot || !isThreePlayerState(snapshot))
    ) return undefined;
    const turnStart = saved.turnStart === undefined
      ? undefined
      : prepareSavedGameState(saved.turnStart);
    if (turnStart !== undefined && !isThreePlayerState(turnStart)) {
      return undefined;
    }
    return {
      version: 3,
      id: saved.id,
      savedAt: saved.savedAt,
      state,
      undoHistory: undoHistory as ThreePlayerState[],
      turnStart,
    };
  }
  if (!isTwoPlayerGameState(state)) return undefined;
  const undoHistory = (Array.isArray(saved.undoHistory) ? saved.undoHistory : []);
  if (undoHistory.some((state) => !isTwoPlayerGameState(state))) return undefined;
  if (saved.turnStart !== undefined && !isTwoPlayerGameState(saved.turnStart)) return undefined;
  return {
    version: 3,
    id: saved.id,
    savedAt: saved.savedAt,
    state: prepareTwoPlayerState(state),
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
  state: ThreePlayerState,
  undoHistory: ThreePlayerState[],
  turnStart?: ThreePlayerState,
): ThreePlayerSavedGame;
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
  if (isThreePlayerState(state)) {
    if (
      undoHistory.some((snapshot) => !isThreePlayerState(snapshot)) ||
      (turnStart !== undefined && !isThreePlayerState(turnStart))
    ) {
      throw new Error("Three-player saves require three-player undo snapshots.");
    }
    return {
      version: 3,
      id,
      savedAt: new Date().toISOString(),
      state: prepareThreePlayerState(state),
      undoHistory: undoHistory.map((snapshot) =>
        prepareThreePlayerState(snapshot as ThreePlayerState)
      ),
      turnStart: turnStart
        ? prepareThreePlayerState(turnStart as ThreePlayerState)
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
