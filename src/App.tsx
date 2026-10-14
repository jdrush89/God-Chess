import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  Bot,
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  Crown,
  Crosshair,
  Download,
  Eye,
  Flame,
  FlaskConical,
  GraduationCap,
  Hexagon,
  History,
  Info,
  LoaderCircle,
  LogOut,
  Magnet,
  Menu,
  Pencil,
  Coins,
  Rabbit,
  RotateCcw,
  Settings,
  Shield,
  Skull,
  Snowflake,
  Sparkles,
  Swords,
  Trophy,
  Trash2,
  Undo2,
  UserRound,
  Users,
  Wifi,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { allSquares, isInCheck } from "./game/chess";
import {
  classicSimulationPlanStrategy,
  chooseAiPlan,
  chooseFallbackAiPlan,
  chooseRandomAiPlan,
  isAiTurn,
  type ClassicAiPlanStrategy,
  type ClassicAiWorkerResponse,
} from "./game/ai";
import {
  canStartClassicMoveFirst,
  classicMoveFirstCandidates,
  classicMoveFirstSources,
  classicMoveFirstTargets,
  createGame,
  gameReducer,
  hasCommittedClassicAction,
  isClassicGodResting,
  type GameAction,
} from "./game/engine";
import { createFourPlayerGame } from "./game/fourPlayerEngine";
import {
  CHALLENGE_BY_ID,
  CHALLENGES,
  createClassicChallenge,
  createGangUpChallenge,
  createJumpedChallenge,
} from "./game/challenges";
import {
  FOUR_PLAYER_SEATS,
  type FourPlayerConfig,
  type FourPlayerState,
} from "./game/fourPlayerTypes";
import { abilityLevel, GOD_BY_ID, GODS } from "./game/gods";
import {
  createPuzzleGame,
  PUZZLE_BY_ID,
  PUZZLES,
  type PuzzleDifficulty,
} from "./game/puzzles";
import {
  createDailyPuzzleGame,
  currentDailyPuzzle,
  DAILY_PUZZLE_BY_ID,
  dailyPuzzleResultMatches,
  isDailyPuzzleId,
} from "./game/dailyPuzzles";
import {
  isThreePlayerPuzzleId,
  THREE_PLAYER_PUZZLE_BY_ID,
  THREE_PLAYER_PUZZLES,
} from "./game/threePlayerPuzzles";
import { randomItem } from "./game/random";
import type { Ability, ActionPresentation, CaptureAnimation, ChallengeId, ClassicMoveFirstCandidate, ClassicMoveFirstMove, Color, GameMode, GameState, GodId, OrbAnimation, OrbColor, Piece, PuzzleId, Square, ThreePlayerPuzzleId } from "./game/types";
import { AccountModal } from "./account/AccountModal";
import {
  deleteAllCloudSavedGames,
  deleteCloudSavedGame,
  loadCloudSavedGames,
  upsertCloudSavedGame,
} from "./account/cloudSaves";
import {
  loadCloudCompletedPuzzles,
  upsertCloudCompletedPuzzles,
} from "./account/cloudPuzzleProgress";
import {
  loadCloudCompletedChallenges,
  upsertCloudCompletedChallenges,
} from "./account/cloudChallengeProgress";
import { useAccount, type AccountProfile } from "./account/useAccount";
import {
  loadLocalCompletedChallenges,
  persistLocalCompletedChallenges,
} from "./challengeProgress";
import {
  loadCloudAchievementProgress,
  upsertCloudAchievementProgress,
} from "./account/cloudAchievementProgress";
import {
  completedAchievementIds,
  loadLocalAchievementProgress,
  mergeNormalizedAchievementProgress,
  persistLocalAchievementProgress,
} from "./achievementProgress";
import {
  ACHIEVEMENT_DEFINITIONS,
  achievementProgressValue,
  applyAchievementTransition,
  completeCryptologistIfEligible,
  createAchievementProgress,
  type AchievementProgress,
  type AchievementTransition,
} from "./achievements";
import {
  onlinePlayerColor,
  onlineTurnInputDisabled,
  onlineUndoEnabled,
  useOnlineGame,
  type OnlineGameState,
} from "./multiplayer/useOnlineGame";
import {
  fourPlayerOnlineLocalSeat,
  useFourPlayerOnlineGame,
  type FourPlayerOnlineState,
} from "./multiplayer/useFourPlayerOnlineGame";
import {
  threePlayerOnlineLocalSeat,
  useThreePlayerOnlineGame,
  type ThreePlayerOnlineState,
} from "./multiplayer/useThreePlayerOnlineGame";
import { GameResultPresentation } from "./GameResultPresentation";
import { MatchEscapeMenu } from "./MatchEscapeMenu";
import {
  TutorialOverlay,
  TutorialPracticeOverlay,
  type TutorialPracticePrompt,
  type TutorialStep,
} from "./TutorialOverlay";
import {
  GodPortrait,
  PlayerAbilityCard as AbilityCard,
} from "./PlayerGodPanel";
import { GodSkinPicker } from "./GodSkinPicker";
import {
  draftedGodSkin,
  favoriteGodSkin,
  isGodSkinUnlocked,
  loadFavoriteGodSkins,
  persistFavoriteGodSkins,
  type GodSkinId,
  type GodSkinSelections,
} from "./godSkins";
import {
  installGlobalDiagnostics,
  recordActionTransition,
  recordDiagnostic,
} from "./diagnostics";
import {
  createSavedGame,
  loadLocalSavedGames,
  mergeSavedGame,
  persistLocalSavedGames,
  prepareSavedState,
  saveId,
  sortSavedGames,
  isFourPlayerSavedGame,
  isThreePlayerSavedGame,
  type SavedGame,
  type TwoPlayerSavedGame,
} from "./saves";
import {
  loadLocalCompletedPuzzles,
  persistLocalCompletedPuzzles,
} from "./puzzleProgress";
import { FourPlayerGame } from "./fourPlayer/FourPlayerGame";
import { FourPlayerOnlineLobby } from "./fourPlayer/FourPlayerOnlineLobby";
import { FourPlayerSetup } from "./fourPlayer/FourPlayerSetup";
import { createThreePlayerGame } from "./game/threePlayerEngine";
import type {
  ThreePlayerConfig,
  ThreePlayerState,
} from "./game/threePlayerTypes";
import { THREE_PLAYER_SEATS } from "./game/threePlayerTypes";
import { ThreePlayerGame } from "./threePlayer/ThreePlayerGame";
import { ThreePlayerOnlineLobby } from "./threePlayer/ThreePlayerOnlineLobby";
import { ThreePlayerSetup } from "./threePlayer/ThreePlayerSetup";
import { SetupNavigationShell } from "./SetupNavigationShell";
import { AbilityRules, LevelSelector } from "./UpgradePreview";

type GameDispatch = (action: GameAction) => void;
type MoveFirstDraft = {
  source: Square;
  destination?: Square;
};
type StartCategory = "local" | "online";
type PlayerCount = 2 | 3 | 4;

export interface SimulationExportData {
  resultSummary: string;
  completedTurns: number;
  rewindRounds: number;
  requestedUndoActions: number;
  appliedUndoActions: number;
  terminalResult?: GameState["result"];
  save: TwoPlayerSavedGame;
}

interface SimulationRewindResult {
  state: GameState;
  undoHistory: GameState[];
  turnStart?: GameState;
  exportData: SimulationExportData;
}

const simulationSaveState = (state: GameState) => {
  const saved = prepareSavedState(state);
  saved.gameMode = "local";
  saved.aiColor = undefined;
  saved.onlineHostColor = undefined;
  return saved;
};

const simulationResultSummary = (
  terminal: GameState,
  completedTurns: number,
) => {
  const turns = `${completedTurns} turn${completedTurns === 1 ? "" : "s"}`;
  if (terminal.result?.kind === "winner") {
    const winner = terminal.result.winner === "white" ? "White" : "Black";
    return terminal.result.reason === "checkmate"
      ? `${winner} checkmated in ${turns}.`
      : `${winner} won by king capture in ${turns}.`;
  }
  const stalemated = terminal.activeColor === "white" ? "White" : "Black";
  return `${stalemated} was stalemated after ${turns}.`;
};

export const rewindSimulationForExport = (
  terminal: GameState,
  undoHistory: GameState[],
  completedTurns: number,
  random: () => number = Math.random,
): SimulationRewindResult => {
  const rewindRounds = 3 + Math.floor(random() * 3);
  const requestedUndoActions = rewindRounds * 2 - 1;
  const remainingUndoHistory = undoHistory.map((snapshot) =>
    prepareSavedState(snapshot)
  );
  let state = prepareSavedState(terminal);
  let appliedUndoActions = 0;

  while (
    appliedUndoActions < requestedUndoActions &&
    remainingUndoHistory.length
  ) {
    state = prepareSavedState(remainingUndoHistory.pop()!);
    appliedUndoActions += 1;
  }

  const turnStart = state.phase === "play"
    ? prepareSavedState(state)
    : undefined;
  const save = createSavedGame(
    `simulation-${Date.now()}`,
    simulationSaveState(state),
    remainingUndoHistory.map(simulationSaveState),
    turnStart ? simulationSaveState(turnStart) : undefined,
  );

  return {
    state,
    undoHistory: remainingUndoHistory,
    turnStart,
    exportData: {
      resultSummary: simulationResultSummary(terminal, completedTurns),
      completedTurns,
      rewindRounds,
      requestedUndoActions,
      appliedUndoActions,
      terminalResult: terminal.result
        ? structuredClone(terminal.result)
        : undefined,
      save,
    },
  };
};

interface FourPlayerSession {
  key: string;
  state: FourPlayerState;
  undoHistory: FourPlayerState[];
  turnStart?: FourPlayerState;
  challengeId?: ChallengeId;
}

interface ThreePlayerSession {
  key: string;
  state: ThreePlayerState;
  undoHistory: ThreePlayerState[];
  turnStart?: ThreePlayerState;
  puzzleId?: ThreePlayerPuzzleId;
  challengeId?: ChallengeId;
}

const PIECES: Record<Color, Record<Piece["type"], string>> = {
  white: { king: "♔", queen: "♕", rook: "♖", bishop: "♗", knight: "♘", pawn: "♙" },
  black: { king: "♚", queen: "♛", rook: "♜", bishop: "♝", knight: "♞", pawn: "♟" },
};

const TITLE_ART_AVIF = `${import.meta.env.BASE_URL}god-chess-title.avif`;
const TITLE_ART_WEBP = `${import.meta.env.BASE_URL}god-chess-title.webp`;
const GAME_VERSION = import.meta.env.VITE_GAME_VERSION || "dev";

type OrbTotals = Record<Color, Record<OrbColor, number>>;

interface OrbFlight extends OrbAnimation {
  startX: number;
  startY: number;
  deltaX: number;
  deltaY: number;
}

interface CaptureFlight extends CaptureAnimation {
  startX: number;
  startY: number;
  deltaX: number;
  deltaY: number;
}

const orbTotals = (state: GameState): OrbTotals => ({
  white: { ...state.players.white.orbs },
  black: { ...state.players.black.orbs },
});

const orbTargetKey = (player: Color, orb: OrbColor) => `${player}-${orb}`;

const UNDO_SETTING_KEY = "god-chess-undo-enabled";

const loadUndoSetting = () => {
  try {
    return window.localStorage.getItem(UNDO_SETTING_KEY) === "true";
  } catch (error) {
    console.error("Unable to load the undo setting.", error);
    return false;
  }
};

const persistUndoSetting = (enabled: boolean) => {
  try {
    window.localStorage.setItem(UNDO_SETTING_KEY, String(enabled));
  } catch (error) {
    console.error("Unable to save the undo setting.", error);
  }
};

const shuffled = <T,>(items: T[]) => {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
};

const aiActionDelay = (action: GameAction) => {
  if (action.type === "select-god") return 1100;
  if (action.type === "select-ability") return 1500;
  if (action.type === "preview-upgrade") return 900;
  if (action.type === "upgrade") return 2200;
  if (action.type === "square") return 950;
  return 750;
};

const AI_NON_PLAY_PLAN_TIMEOUT_MS = 2000;

const statusMarkers: {
  key: keyof Piece["status"];
  label: string;
  icon: LucideIcon;
}[] = [
  { key: "hardened", label: "Hardened", icon: Shield },
  { key: "frozen", label: "Stone", icon: Snowflake },
  { key: "stunned", label: "Stunned", icon: X },
  { key: "poisoned", label: "Poisoned", icon: FlaskConical },
  { key: "polymorphed", label: "Polymorphed", icon: Rabbit },
  { key: "luredBy", label: "Lured", icon: Magnet },
  { key: "hexedBy", label: "Hexed", icon: Hexagon },
  { key: "prepared", label: "Prepared", icon: Crosshair },
  { key: "ritual", label: "Ritual", icon: Flame },
  { key: "markedForDeath", label: "Marked", icon: Skull },
  { key: "hired", label: "Hired", icon: Coins },
  { key: "gazing", label: "Gazing", icon: Eye },
  { key: "chargeUntil", label: "Charged", icon: Zap },
];

const PIECE_NAMES: Record<Piece["type"], string> = {
  king: "King",
  queen: "Queen",
  rook: "Rook",
  bishop: "Bishop",
  knight: "Knight",
  pawn: "Pawn",
};

const statusDuration = (value: number | "god" | "choice" | undefined, godName: string) => {
  if (value === "god") return `until ${godName}’s next turn`;
  if (value === "choice") return "until its controller resolves the pending choice";
  if (typeof value === "number") return `for ${value} more turn${value === 1 ? "" : "s"}`;
  return "";
};

const pieceMarkerDetails = (piece: Piece, state: GameState) => {
  const markers: { name: string; description: string }[] = [];
  if (piece.status.hardened) {
    markers.push({
      name: "Hardened",
      description: `Cannot move or be captured ${statusDuration(piece.status.hardened, "Anubis")}.`,
    });
  }
  if (piece.status.frozen) {
    markers.push({
      name: "Stone Gaze",
      description: `Cannot move ${statusDuration(piece.status.frozen, "Medusa")}.`,
    });
  }
  if (piece.status.gazing) {
    markers.push({
      name: "Gazing",
      description: "This Queen cannot move while any piece affected by Stone Gaze remains frozen.",
    });
  }
  if (piece.status.stunned) {
    markers.push({
      name: "Stunned",
      description: "Cannot move or be moved by abilities until the end of its controller’s turn.",
    });
  }
  if (piece.status.poisoned) {
    markers.push({
      name: "Poisoned",
      description: `Cannot move more than 3 spaces in one turn ${statusDuration(piece.status.poisoned, "Salem")}.`,
    });
  }
  if (piece.status.polymorphed) {
    markers.push({
      name: "Polymorphed",
      description: `Moves like a pawn instead of its normal piece type ${statusDuration(piece.status.polymorphed, "Salem")}.`,
    });
  }
  if (piece.status.luredBy) {
    markers.push({
      name: "Lured",
      description: `Must move closer to ${colorLabel(piece.status.luredBy)}’s Queen on its next turn if a closer legal move exists.`,
    });
  }
  if (piece.status.hexedBy) {
    markers.push({
      name: "Hexed",
      description: `${colorLabel(piece.status.hexedBy)} gains orbs when one of their pieces ends a move in this piece’s row or column.`,
    });
  }
  if (piece.status.prepared) {
    const prepared = typeof piece.status.prepared === "boolean"
      ? { owner: piece.controller, level: abilityLevel(state.players[piece.controller].upgrades, "snipe") }
      : piece.status.prepared;
    const duration = prepared.level >= 3
      ? "It remains until the shot is used."
      : prepared.level === 2
        ? "It remains until its owner next calls Artemis."
        : "It expires if the shot is skipped on its owner’s next turn.";
    markers.push({
      name: "Prepared",
      description: `At the beginning of ${colorLabel(prepared.owner)}’s turn, this piece may capture an enemy it attacks without moving. ${duration}`,
    });
  }
  if (piece.status.ritual) {
    const ritualLevel = piece.status.ritual.level ??
      abilityLevel(state.players[piece.status.ritual.owner].upgrades, "ritual-sacrifice");
    const reward = ritualLevel >= 3 ? 3 : 2;
    markers.push({
      name: "Goad",
      description: `If captured before Kangus’ next turn, ${colorLabel(piece.status.ritual.owner)} gains ${reward} white and ${reward} black orbs.`,
    });
  }
  if (piece.status.markedForDeath) {
    markers.push({
      name: "Marked for Death",
      description: piece.type === "king"
        ? `The Mark cannot kill a King. It clears at the end of ${colorLabel(piece.status.markedForDeath.owner)}’s next Death action without granting a reward.`
        : `If still alive at the end of ${colorLabel(piece.status.markedForDeath.owner)}’s next Death action, the Mark kills it and grants that player 3 black orbs. If it dies first, there is no Mark reward.`,
    });
  }
  if (piece.status.hired) {
    markers.push({
      name: "Hired",
      description: `Originally a ${piece.color} piece; it is currently controlled by ${colorLabel(piece.controller)}.`,
    });
  }
  if (piece.status.chargeUntil) {
    markers.push({
      name: "Charged",
      description: `May move like a Rook ${statusDuration(piece.status.chargeUntil, "Chiron")}.`,
    });
  }
  return markers;
};

function Orb({
  color,
  count,
  small = false,
  targetPlayer,
  arriving = false,
}: {
  color: Color;
  count: number;
  small?: boolean;
  targetPlayer?: Color;
  arriving?: boolean;
}) {
  return (
    <span
      className={`orb-count ${small ? "small" : ""} ${arriving ? "arriving" : ""}`}
      data-orb-target={targetPlayer ? `${targetPlayer}-${color}` : undefined}
      aria-label={`${count} ${color} orb${count === 1 ? "" : "s"}`}
    >
      <i className={`orb ${color}`} />
      <strong>{count}</strong>
    </span>
  );
}

function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark"><Crown size={23} strokeWidth={1.5} /></div>
      <div>
        <div className="brand-name">GOD CHESS</div>
        <div className="brand-subtitle">THE DIVINE GAME</div>
      </div>
    </div>
  );
}

function GodSigil({
  godId,
  skinId = "base",
  size = "normal",
}: {
  godId: GodId;
  skinId?: GodSkinId;
  size?: "small" | "normal" | "large";
}) {
  const god = GOD_BY_ID[godId];
  return (
    <span
      className={`god-sigil ${size}`}
      style={{ "--accent": god.accent } as React.CSSProperties}
      aria-hidden="true"
    >
      <GodPortrait godId={godId} skinId={skinId} />
    </span>
  );
}

function DraftScreen({
  state,
  dispatch,
  onQuickDraft,
  inputDisabled = false,
}: {
  state: GameState;
  dispatch: GameDispatch;
  onQuickDraft?: () => void;
  inputDisabled?: boolean;
}) {
  const [inspected, setInspected] = useState<GodId>(state.draft.available[0]);
  const [godPreviewLevel, setGodPreviewLevel] = useState<number>();
  const [favorites] = useState<GodSkinSelections>(loadFavoriteGodSkins);
  const [selectedSkinId, setSelectedSkinId] = useState<GodSkinId>(() =>
    favoriteGodSkin(favorites, state.draft.available[0])
  );
  const activePlayer = state.players[state.activeColor];
  const currentGod = GOD_BY_ID[inspected];
  const selectedSkinUnlocked = isGodSkinUnlocked(currentGod.id, selectedSkinId);

  useEffect(() => {
    setGodPreviewLevel(undefined);
    setSelectedSkinId(favoriteGodSkin(favorites, inspected));
  }, [inspected]);

  useEffect(() => {
    if (!state.draft.available.includes(inspected) && state.draft.available[0]) {
      setInspected(state.draft.available[0]);
    }
  }, [state.draft.pickIndex]);

  return (
    <main className="draft-page">
      <header className="topbar draft-topbar">
        <Brand />
        <div className="draft-turn">
          <span className={`turn-dot ${state.activeColor}`} />
          {activePlayer.name} · {state.activeColor} picks
        </div>
        <div className="header-actions" aria-hidden="true" />
      </header>

      <section className="draft-hero">
        <p className="eyebrow">THE PANTHEON AWAITS</p>
        <h1>Choose your gods.</h1>
        <p>Each player claims three divine allies in a 1–2–2–1 snake draft.</p>
        <div className="draft-auto-actions">
          <button
            className="auto-draft-button"
            disabled={inputDisabled || state.draft.pickIndex >= state.draft.order.length}
            onClick={() => {
              const godId = shuffled(state.draft.available)[0];
              if (!godId) return;
              dispatch({
                type: "auto-draft",
                godId,
                skinId: favoriteGodSkin(favorites, godId),
              });
            }}
          >
            <Sparkles size={15} />
            Auto-pick random god
          </button>
          {onQuickDraft && (
            <button
              className="auto-draft-button"
              disabled={state.draft.pickIndex >= state.draft.order.length}
              onClick={onQuickDraft}
            >
              <Zap size={15} />
              Quick Draft
            </button>
          )}
        </div>
        <div className="draft-progress">
          {state.draft.order.map((color, index) => (
            <div className={`draft-pip ${index < state.draft.pickIndex ? "done" : ""} ${index === state.draft.pickIndex ? "current" : ""}`} key={index}>
              <span>{index + 1}</span>
              <small>{color === "white" ? "W" : "B"}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="draft-layout">
        <div className="pantheon-grid">
          {GODS.map((god) => {
            const owner = state.players.white.gods.includes(god.id)
              ? "white"
              : state.players.black.gods.includes(god.id)
                ? "black"
                : undefined;
            const skinId = owner
              ? draftedGodSkin(state.players[owner].godSkins, god.id)
              : favoriteGodSkin(favorites, god.id);
            return (
              <button
                className={`draft-card ${inspected === god.id ? "inspected" : ""} ${owner ? "claimed" : ""}`}
                key={god.id}
                onClick={() => setInspected(god.id)}
                style={{ "--accent": god.accent } as React.CSSProperties}
              >
                <GodPortrait godId={god.id} skinId={skinId} className="god-card-portrait" />
                <span className="draft-card-copy">
                  <strong>{god.name}</strong>
                  <small>{god.domain}</small>
                </span>
                {owner && <span className={`claimed-by ${owner}`}>{owner[0].toUpperCase()}</span>}
              </button>
            );
          })}
        </div>

        <aside className="god-inspector" style={{ "--accent": currentGod.accent } as React.CSSProperties}>
          <div className="inspector-heading">
            <GodPortrait
              godId={currentGod.id}
              skinId={selectedSkinId}
              className="god-hero-portrait"
            />
            <div>
              <p>{currentGod.domain}</p>
              <h2>{currentGod.name}</h2>
              <span>{currentGod.epithet}</span>
            </div>
          </div>
          <GodSkinPicker
            godId={currentGod.id}
            selectedSkinId={selectedSkinId}
            onSelect={setSelectedSkinId}
          />
          <LevelSelector
            level={godPreviewLevel ?? 1}
            onChange={setGodPreviewLevel}
            label="All abilities"
            className="god-level-selector"
          />
          <div className="draft-abilities">
            {currentGod.abilities.map((item, index) => (
              <div className="draft-ability" key={item.id}>
                <span>0{index + 1}</span>
                <div>
                  <strong>{item.name}</strong>
                  <AbilityRules ability={item} level={1} previewLevelOverride={godPreviewLevel} compact />
                </div>
                {item.cost && (
                  <div className="mini-cost">
                    {item.cost.white ? <Orb color="white" count={item.cost.white} small /> : null}
                    {item.cost.black ? <Orb color="black" count={item.cost.black} small /> : null}
                  </div>
                )}
              </div>
            ))}
          </div>
          <button
            className="primary-button"
            onClick={() => dispatch({
              type: "draft",
              godId: currentGod.id,
              skinId: selectedSkinId,
            })}
            disabled={
              inputDisabled ||
              !state.draft.available.includes(currentGod.id) ||
              !selectedSkinUnlocked
            }
          >
            {selectedSkinUnlocked
              ? `Claim ${currentGod.name}`
              : `${currentGod.name} skin locked`}
            {selectedSkinUnlocked && <ChevronRight size={17} />}
          </button>
        </aside>
      </section>

      <footer className="draft-rosters">
        {(["white", "black"] as Color[]).map((color) => (
          <div className="draft-roster" key={color}>
            <span className={`player-crest ${color}`}><Crown size={14} /></span>
            <strong>{state.players[color].name}</strong>
            <small>{color}</small>
            <div>
              {state.players[color].gods.map((godId, index) => (
                <GodSigil
                  godId={godId}
                  skinId={draftedGodSkin(state.players[color].godSkins, godId)}
                  size="small"
                  key={`${godId}-${index}`}
                />
              ))}
              {Array.from({ length: 3 - state.players[color].gods.length }).map((_, index) => <i className="empty-sigil" key={index} />)}
            </div>
          </div>
        ))}
      </footer>
    </main>
  );
}

function RosterScreen({
  accountControl,
  onBack,
}: {
  accountControl: ReactNode;
  onBack: () => void;
}) {
  const [inspected, setInspected] = useState<GodId>(GODS[0].id);
  const [previewLevel, setPreviewLevel] = useState(1);
  const [favorites, setFavorites] = useState<GodSkinSelections>(loadFavoriteGodSkins);
  const [selectedSkinId, setSelectedSkinId] = useState<GodSkinId>(() =>
    favoriteGodSkin(favorites, GODS[0].id)
  );
  const currentGod = GOD_BY_ID[inspected];

  useEffect(() => {
    setPreviewLevel(1);
    setSelectedSkinId(favoriteGodSkin(favorites, inspected));
  }, [inspected]);

  const toggleFavorite = (skinId: GodSkinId) => {
    if (!isGodSkinUnlocked(inspected, skinId)) return;
    const next = { ...favorites };
    if (next[inspected] === skinId) delete next[inspected];
    else next[inspected] = skinId;
    persistFavoriteGodSkins(next);
    setFavorites(next);
  };

  return (
    <main className="draft-page roster-page">
      <header className="topbar draft-topbar roster-topbar">
        <button className="setup-navigation-back" onClick={onBack}>
          <ArrowLeft size={18} />
          <span>Back to play</span>
        </button>
        <div className="draft-turn">
          <BookOpen size={16} />
          Divine roster
        </div>
        {accountControl}
      </header>

      <section className="draft-hero">
        <p className="eyebrow">THE DIVINE ROSTER</p>
        <h1>Know your gods.</h1>
        <p>Explore every god and preview how each ability changes at levels 1, 2, and 3.</p>
      </section>

      <section className="draft-layout">
        <div className="pantheon-grid">
          {GODS.map((god) => (
            <button
              className={`draft-card ${inspected === god.id ? "inspected" : ""}`}
              key={god.id}
              onClick={() => setInspected(god.id)}
              style={{ "--accent": god.accent } as React.CSSProperties}
              aria-pressed={inspected === god.id}
            >
              <GodPortrait
                godId={god.id}
                skinId={favoriteGodSkin(favorites, god.id)}
                className="god-card-portrait"
              />
              <span className="draft-card-copy">
                <strong>{god.name}</strong>
                <small>{god.domain}</small>
              </span>
            </button>
          ))}
        </div>

        <aside className="god-inspector" style={{ "--accent": currentGod.accent } as React.CSSProperties}>
          <div className="inspector-heading">
            <GodPortrait
              godId={currentGod.id}
              skinId={selectedSkinId}
              className="god-hero-portrait"
            />
            <div>
              <p>{currentGod.domain}</p>
              <h2>{currentGod.name}</h2>
              <span>{currentGod.epithet}</span>
            </div>
          </div>
          <GodSkinPicker
            godId={currentGod.id}
            selectedSkinId={selectedSkinId}
            favoriteSkinId={favorites[currentGod.id]}
            onSelect={setSelectedSkinId}
            onFavorite={toggleFavorite}
          />
          <LevelSelector
            level={previewLevel}
            onChange={setPreviewLevel}
            label="All abilities"
            className="god-level-selector"
          />
          <div className="draft-abilities">
            {currentGod.abilities.map((item, index) => (
              <div className="draft-ability" key={item.id}>
                <span>0{index + 1}</span>
                <div>
                  <strong>{item.name}</strong>
                  <AbilityRules ability={item} level={1} previewLevelOverride={previewLevel} compact />
                </div>
                {item.cost && (
                  <div className="mini-cost">
                    {item.cost.white ? <Orb color="white" count={item.cost.white} small /> : null}
                    {item.cost.black ? <Orb color="black" count={item.cost.black} small /> : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}

function PlayerBar({
  state,
  color,
  onGodClick,
  onGraveyardClick,
  displayedOrbs,
  arrivingOrbs,
  displayedGraveyardCount,
  graveyardArriving,
}: {
  state: GameState;
  color: Color;
  onGodClick: (godId: GodId, color: Color) => void;
  onGraveyardClick: (color: Color) => void;
  displayedOrbs: Record<OrbColor, number>;
  arrivingOrbs: Set<string>;
  displayedGraveyardCount: number;
  graveyardArriving: boolean;
}) {
  const player = state.players[color];
  const isActive = state.activeColor === color && state.phase !== "gameover";
  const [toolsOpen, setToolsOpen] = useState(false);
  return (
    <section
      className={`player-bar ${color} ${isActive ? "active" : ""} ${toolsOpen ? "tools-open" : ""}`}
      data-player-tools-layout="container-responsive"
      data-tutorial={color === "white" ? "player-status" : "opponent-status"}
    >
      <div className={`player-avatar ${color}`}><Crown size={19} /></div>
      <div className="player-copy">
        <strong>{player.name}</strong>
        <span>{isActive ? "DIVINE TURN" : color.toUpperCase()}</span>
      </div>
      <div className="player-orbs">
        <Orb
          color="white"
          count={displayedOrbs.white}
          targetPlayer={color}
          arriving={arrivingOrbs.has(`${color}-white`)}
        />
        <Orb
          color="black"
          count={displayedOrbs.black}
          targetPlayer={color}
          arriving={arrivingOrbs.has(`${color}-black`)}
        />
      </div>
      <div className={`player-tools ${toolsOpen ? "open" : ""}`}>
        <button
          className="player-tools-toggle"
          onClick={() => setToolsOpen((open) => !open)}
          aria-label={`${toolsOpen ? "Close" : "Open"} ${player.name} controls`}
          aria-expanded={toolsOpen}
          data-overflow-toggle
        >
          {toolsOpen ? <X size={16} /> : <Menu size={16} />}
        </button>
        <div className="player-tools-content" data-inline-when-roomy>
          <button
            className={`graveyard-button ${graveyardArriving ? "arriving" : ""}`}
            onClick={() => {
              setToolsOpen(false);
              onGraveyardClick(color);
            }}
            title={`View ${player.name}'s graveyard`}
            aria-label={`View ${player.name}'s graveyard, ${displayedGraveyardCount} captured pieces`}
            data-graveyard-target={color}
          >
            <Skull size={15} />
            <b>{displayedGraveyardCount}</b>
          </button>
          <div className="mini-pantheon">
            {player.gods.map((godId, index) => {
              const resting = isClassicGodResting(state, color, godId);
              const interactive = isActive && !resting;
              return (
                <button
                  className={resting ? "resting" : ""}
                  title={`${interactive ? "Use" : "View"} ${GOD_BY_ID[godId].name}${resting ? " · resting" : ""}`}
                  onClick={() => {
                    setToolsOpen(false);
                    onGodClick(godId, color);
                  }}
                  key={`${godId}-${index}`}
                >
                  <GodSigil
                    godId={godId}
                    skinId={draftedGodSkin(player.godSkins, godId)}
                    size="small"
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function PieceView({ piece }: { piece: Piece }) {
  const displayType = piece.status.challengeRoyal ? "queen" : piece.type;
  const statuses = statusMarkers.filter(({ key }) => Boolean(piece.status[key]));
  return (
    <span
      className={`chess-piece ${piece.color} ${piece.status.hired ? "hired" : ""}`}
      data-piece-id={piece.id}
    >
      {PIECES[piece.color][displayType]}
      {statuses.length > 0 && (
        <span className="status-markers" title={statuses.map(({ label }) => label).join(", ")}>
          {statuses.map(({ key, label, icon: Icon }) => (
            <i className="status-marker" data-status={key} aria-label={label} key={key}>
              <Icon aria-hidden="true" />
            </i>
          ))}
        </span>
      )}
    </span>
  );
}

export function ChessBoard({
  state,
  dispatch,
  onInspectSquare,
  moveFirstDraft,
  moveFirstTargets = [],
  onMoveFirstSquare,
}: {
  state: GameState;
  dispatch: GameDispatch;
  onInspectSquare: (square: Square) => void;
  moveFirstDraft?: MoveFirstDraft;
  moveFirstTargets?: Square[];
  onMoveFirstSquare?: (square: Square) => void;
}) {
  const displaySquares = useMemo(() => [...allSquares].sort((a, b) => Number(b[1]) - Number(a[1]) || a.localeCompare(b)), []);
  const previewingEffect = state.pending?.step === "confirm-stone-gaze" ||
    state.pending?.step === "confirm-march-home";
  const enchantSourceChoice = (
    state.pending?.step === "enchant-enemy-move" ||
    state.pending?.step === "enchant-followup-move"
  ) && !state.selectedSquare;
  return (
    <div className="board-shell" data-tutorial="board">
      <div className="board-frame">
        <div className="chess-board" role="grid" aria-label="God Chess board">
          {displaySquares.map((square) => {
            const [file, rank] = [square[0], square[1]];
            const piece = state.board[square];
            const selected = state.selectedSquare === square;
            const provisionalSource = moveFirstDraft?.source === square;
            const provisionalDestination = moveFirstDraft?.destination === square;
            const effectPreview = previewingEffect && state.legalTargets.includes(square);
            const legal = !previewingEffect && (
              state.legalTargets.includes(square) ||
              moveFirstTargets.includes(square)
            );
            const banana = state.bananas.find((item) => item.square === square);
            return (
              <button
                role="gridcell"
                aria-label={`${square}${piece ? `, ${piece.color} ${piece.type}` : ""}${effectPreview ? ", affected by selected ability" : ""}${provisionalSource ? ", provisional move source" : ""}${provisionalDestination ? ", provisional move destination, not committed" : ""}`}
                data-square={square}
                className={`board-square ${(file.charCodeAt(0) + Number(rank)) % 2 ? "light" : "dark"} ${selected ? "selected" : ""} ${provisionalSource ? "provisional-source" : ""} ${provisionalDestination ? "provisional-destination" : ""} ${legal ? "legal" : ""} ${legal && piece ? "legal-occupied" : ""} ${legal && enchantSourceChoice ? "legal-source" : ""} ${legal && !enchantSourceChoice ? "legal-destination" : ""} ${effectPreview ? "effect-preview" : ""}`}
                key={square}
                onClick={() => {
                  onInspectSquare(square);
                  if (onMoveFirstSquare) onMoveFirstSquare(square);
                  else dispatch({ type: "square", square });
                }}
              >
                {file === "a" && <span className="rank-label">{rank}</span>}
                {rank === "1" && <span className="file-label">{file}</span>}
                {legal && !piece && <span className="move-target-dot" aria-hidden="true" />}
                {effectPreview && (
                  <span className="effect-preview-icon">
                    {state.selectedAbility === "stone-gaze" ? <Eye /> : <Crown />}
                  </span>
                )}
                {banana && <span className="banana" title="Banana peel">⌁</span>}
                {piece && <PieceView piece={piece} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MoveFirstChooser({
  state,
  draft,
  candidates,
  onCancel,
  onCommit,
}: {
  state: GameState;
  draft: MoveFirstDraft;
  candidates: ClassicMoveFirstCandidate[];
  onCancel: () => void;
  onCommit: (candidate: ClassicMoveFirstCandidate) => void;
}) {
  const selectedMoveGod = state.selectedGod
    ? GOD_BY_ID[state.selectedGod]
    : undefined;
  if (!draft.destination) {
    return (
      <div className="move-first-prompt" role="status">
        <strong>Ordinary move selected from {draft.source}</strong>
        <p>Choose a highlighted destination. The board has not changed.</p>
        <button className="secondary-button" onClick={onCancel}>Back / cancel</button>
      </div>
    );
  }
  return (
    <div className="move-first-chooser">
      <div className="move-first-heading" role="status" aria-live="polite">
        <span>PROVISIONAL MOVE</span>
        <strong>{draft.source} → {draft.destination}</strong>
        <p>
          {selectedMoveGod
            ? `Not committed. Review ${selectedMoveGod.name}'s ${selectedMoveGod.abilities[0].name} reward, then confirm the move.`
            : "Not committed. Choose which God’s first ability applies this move."}
        </p>
        <button className="secondary-button" onClick={onCancel}>
          <ArrowLeft size={15} /> Back / cancel
        </button>
      </div>
      <div className="ability-list move-first-ability-list">
        {candidates.map((candidate) => {
          const god = GOD_BY_ID[candidate.godId];
          const ability = god.abilities[0];
          const level = abilityLevel(
            state.players[state.activeColor].upgrades,
            ability.id,
          );
          return (
            <AbilityCard
              ability={ability}
              level={level}
              active={false}
              selectable={candidate.valid}
              disabled={!candidate.valid}
              showCost={false}
              footerLabel={god.name}
              footerAction={candidate.requiresPreMoveChoice ? "PRE-MOVE CHOICE" : "CONFIRM MOVE"}
              onClick={() => onCommit(candidate)}
              key={candidate.godId}
            >
              <div className="move-first-reward" aria-label={`${god.name} ${ability.name}: ${candidate.immediateOrbDelta.white} light orbs now and ${candidate.immediateOrbDelta.black} dark orbs now`}>
                <span>IMMEDIATE ORBS</span>
                <div>
                  <b><i className="orb white" /> Light {candidate.immediateOrbDelta.white}</b>
                  <b><i className="orb black" /> Dark {candidate.immediateOrbDelta.black}</b>
                </div>
                {candidate.conditionalOutcome && <p>{candidate.conditionalOutcome}</p>}
                {candidate.followUp && <small>{candidate.followUp.label}</small>}
                {candidate.error && <p className="move-first-error">{candidate.error}</p>}
              </div>
            </AbilityCard>
          );
        })}
      </div>
    </div>
  );
}

function SquareInfoPanel({
  state,
  square,
  onClose,
}: {
  state: GameState;
  square?: Square;
  onClose: () => void;
}) {
  if (!square) return null;
  const piece = state.board[square];
  const banana = state.bananas.find((item) => item.square === square);
  if (!piece && !banana) return null;
  const markers = piece ? pieceMarkerDetails(piece, state) : [];
  if (!markers.length && !banana) return null;

  return (
    <section className="square-info-panel">
      <button className="square-info-close" onClick={onClose} aria-label="Close square details"><X size={15} /></button>
      {piece && markers.length > 0 && (
        <>
          <div className="square-info-heading">
            <span className={`piece-info-symbol ${piece.color}`}>{PIECES[piece.color][piece.type]}</span>
            <div>
              <small>{square.toUpperCase()} · {colorLabel(piece.controller)}</small>
              <h3>{PIECE_NAMES[piece.type]}</h3>
              {piece.controller !== piece.color && <p>Originally {piece.color}</p>}
            </div>
          </div>
          <div className="marker-info">
            <span>Markers</span>
            {markers.map((marker) => (
              <article key={marker.name}>
                <strong>{marker.name}</strong>
                <p>{marker.description}</p>
              </article>
            ))}
          </div>
        </>
      )}
      {banana && (
        <div className="board-marker-info">
          <span className="banana-info-icon">⌁</span>
          <div>
            <small>{square.toUpperCase()} · BOARD MARKER</small>
            <h3>Banana Peel</h3>
            <p>An opposing piece that moves across this square must stop here.</p>
            <p>
              {banana.expires === "god"
                ? "It remains until an opposing piece steps on it."
                : banana.expires === "kangus"
                  ? `It remains until ${colorLabel(banana.owner)} next calls Kangus.`
                  : `It expires at the end of turn ${banana.expires}.`}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function PendingAbilityChoices({
  state,
  dispatch,
  canPass,
  committed,
}: {
  state: GameState;
  dispatch: GameDispatch;
  canPass: boolean;
  committed: boolean;
}) {
  const player = state.players[state.activeColor];
  return (
    <>
      <p className="ability-pending-prompt" role="status">{state.notice}</p>
      {state.pending?.step === "grave" && (
        <div className="grave-picker">
          <span>YOUR GRAVEYARD</span>
          <div>
            {player.graveyard.map(({ piece }) => (
              <button key={piece.id} onClick={() => dispatch({ type: "grave", pieceId: piece.id })}>
                <PieceView piece={piece} /><small>{piece.type}</small>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="action-buttons ability-pending-actions">
        {(state.pending?.step === "confirm-stone-gaze" ||
          state.pending?.step === "confirm-march-home") && (
          <button className="primary-button" onClick={() => dispatch({ type: "confirm-ability" })}>
            Confirm {GOD_BY_ID[state.selectedGod!].abilities.find(
              (ability) => ability.id === state.selectedAbility,
            )?.name ?? "ability"}
          </button>
        )}
        {state.pending?.step === "marked-choice" && (
          <button className="danger-button" onClick={() => dispatch({ type: "marked-execute" })}>
            Execute now
          </button>
        )}
        {state.pending?.step === "rage-choice" && (
          <>
            <button className="danger-button" onClick={() => dispatch({ type: "rage-resolve", spareFriendly: false })}>
              Capture all
            </button>
            <button className="secondary-button" onClick={() => dispatch({ type: "rage-resolve", spareFriendly: true })}>
              Spare allies
            </button>
          </>
        )}
        {state.pending?.step === "barter-choice" && (
          <>
            <button
              className="secondary-button"
              disabled={player.orbs.white < 1}
              onClick={() => dispatch({ type: "barter", give: "white" })}
            >
              Give white
            </button>
            <button
              className="secondary-button"
              disabled={player.orbs.black < 1}
              onClick={() => dispatch({ type: "barter", give: "black" })}
            >
              Give black
            </button>
            <button className="text-button" onClick={() => dispatch({ type: "barter" })}>
              Decline
            </button>
          </>
        )}
        {state.pending?.step === "slither-orb" && (
          <>
            <button className="secondary-button" onClick={() => dispatch({ type: "orb", orb: "white" })}>
              Gain white
            </button>
            <button className="secondary-button" onClick={() => dispatch({ type: "orb", orb: "black" })}>
              Gain black
            </button>
          </>
        )}
        {state.pending?.step === "resurrect-more" && (
          <>
            <button
              className="secondary-button"
              disabled={player.orbs.white < 2}
              onClick={() => dispatch({ type: "resurrect-more", revive: true })}
            >
              Revive second · 2 white
            </button>
            <button className="text-button" onClick={() => dispatch({ type: "resurrect-more", revive: false })}>
              Finish
            </button>
          </>
        )}
        {state.pending?.step === "siphon-choice" && (
          <>
            <button
              className="secondary-button"
              disabled={state.players[state.activeColor === "white" ? "black" : "white"].orbs.white < 2}
              onClick={() => dispatch({ type: "siphon", amount: 2 })}
            >
              Steal 2
            </button>
            <button
              className="secondary-button"
              disabled={state.players[state.activeColor === "white" ? "black" : "white"].orbs.white < 1}
              onClick={() => dispatch({ type: "siphon", amount: 1 })}
            >
              Steal 1
            </button>
            <button className="text-button" onClick={() => dispatch({ type: "siphon", amount: 0 })}>
              Steal none
            </button>
          </>
        )}
        {canPass && (
          <button className="secondary-button" onClick={() => dispatch({ type: "pass" })}>
            Pass / finish
          </button>
        )}
        {!committed && state.pending?.step !== "slither-orb" && (
          <button
            className="text-button cancel-ability-button"
            onClick={() => dispatch({ type: "cancel" })}
          >
            Cancel ability
          </button>
        )}
      </div>
    </>
  );
}

export function ActionPanel({
  state,
  dispatch,
  inspectedGodId,
  presentation,
  onInspectGod,
  onCloseInspection,
  moveFirstDraft,
  moveFirstCandidates,
  onCancelMoveFirst,
  onCommitMoveFirst,
}: {
  state: GameState;
  dispatch: GameDispatch;
  inspectedGodId?: GodId;
  presentation?: ActionPresentation;
  onInspectGod: (godId: GodId) => void;
  onCloseInspection: () => void;
  moveFirstDraft?: MoveFirstDraft;
  moveFirstCandidates?: ClassicMoveFirstCandidate[];
  onCancelMoveFirst?: () => void;
  onCommitMoveFirst?: (candidate: ClassicMoveFirstCandidate) => void;
}) {
  const player = state.players[state.activeColor];
  const presentedGodId = inspectedGodId ?? presentation?.godId ?? state.selectedGod;
  const selectedGod = presentedGodId ? GOD_BY_ID[presentedGodId] : undefined;
  const inspectedOwner: Color = presentation?.color ??
    (inspectedGodId && state.players.black.gods.includes(inspectedGodId) ? "black" : "white");
  const presentedPlayer = inspectedGodId || presentation ? state.players[inspectedOwner] : player;
  const readOnly = Boolean(inspectedGodId || presentation);
  const presentedGodResting = Boolean(
    selectedGod &&
    isClassicGodResting(state, inspectedOwner, selectedGod.id),
  );
  const inspectingOwnGod = readOnly && inspectedOwner === state.activeColor;
  const [godPreviewLevel, setGodPreviewLevel] = useState<number>();
  const defaultGodPreviewLevel = selectedGod
    ? Math.min(...selectedGod.abilities.map((item) => abilityLevel(presentedPlayer.upgrades, item.id)))
    : 1;
  const canAfford = (ability: Ability) =>
    player.orbs.white >= (ability.cost?.white ?? 0) && player.orbs.black >= (ability.cost?.black ?? 0);
  const hasQueen = Object.values(state.board)
    .some((piece) => piece.controller === state.activeColor && piece.type === "queen");
  const committed = hasCommittedClassicAction(state);
  const canPass =
    (state.selectedAbility === "construction") ||
    state.selectedAbility === "marked" ||
    state.pending?.step === "slither" ||
    state.pending?.step === "mount-rider" ||
    state.pending?.step === "funding" ||
    state.pending?.step === "siphon-targets" ||
    state.pending?.step === "march-companions" ||
    (state.pending?.step === "escort-companions" && Boolean(state.pending.selected?.length)) ||
    (state.pending?.step === "hex-target" && Boolean(state.pending.selected?.length));

  useEffect(() => {
    setGodPreviewLevel(undefined);
  }, [presentedGodId]);

  return (
    <aside className={`action-panel ${!selectedGod ? "god-selection-panel" : ""}`}>
      <div className="panel-heading">
        <span>DIVINE ACTION</span>
        <small>ROUND {state.round}</small>
      </div>
      {state.pending?.abilityId === "stealth-return" ? (
        <div className="prepared-shot-panel">
          <span>ARTEMIS · STEALTH</span>
          <h3>Choose where the piece returns</h3>
          <p>
            Select the planned destination or its original space. Returning to
            the original space captures any piece currently there.
          </p>
        </div>
      ) : state.pending?.abilityId === "snipe-shot" ? (
        <>
          <div className="prepared-shot-panel">
            <Swords size={28} />
            <span>ARTEMIS · SNIPE</span>
            <h3>Prepared Shot available</h3>
            <p>
              {state.pending.step === "snipe-source"
                ? "Select a highlighted prepared piece on the board."
                : "Select an attacked enemy piece. The prepared piece will be stunned for the rest of this turn."}
            </p>
          </div>
          <div className="action-buttons">
            <button className="secondary-button" onClick={() => dispatch({ type: "pass" })}>
              Skip prepared shot
            </button>
          </div>
        </>
      ) : moveFirstDraft && !readOnly && onCancelMoveFirst && onCommitMoveFirst ? (
        <MoveFirstChooser
          state={state}
          draft={moveFirstDraft}
          candidates={moveFirstCandidates ?? []}
          onCancel={onCancelMoveFirst}
          onCommit={onCommitMoveFirst}
        />
      ) : !selectedGod ? (
        <>
          <div className="god-list">
            {player.gods.map((godId, index) => {
              const god = GOD_BY_ID[godId];
              const resting = isClassicGodResting(
                state,
                player.color,
                godId,
              );
              return (
                <button
                  className={`god-row ${resting ? "resting" : ""}`}
                  key={`${godId}-${index}`}
                  data-god-id={godId}
                  onClick={() => resting ? onInspectGod(godId) : dispatch({ type: "select-god", godId })}
                  style={{ "--accent": god.accent } as React.CSSProperties}
                >
                  <GodPortrait
                    godId={godId}
                    skinId={draftedGodSkin(player.godSkins, godId)}
                    className="god-row-portrait"
                  />
                  <span className="god-row-copy"><strong>{god.name}</strong><small>{resting ? "RESTING · VIEW" : god.domain}</small></span>
                  <ChevronRight size={17} />
                </button>
              );
            })}
          </div>
          {state.pending?.step === "harden-decision" && (
            <div className="action-buttons">
              <button className="secondary-button" onClick={() => dispatch({ type: "harden-choice", keep: true })}>
                Keep hardened
              </button>
              <button className="text-button" onClick={() => dispatch({ type: "harden-choice", keep: false })}>
                Remove marker
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div
            className={`chosen-god ${presentation?.kind === "god" ? "opponent-selecting" : ""}`}
            style={{ "--accent": selectedGod.accent } as React.CSSProperties}
          >
            <GodPortrait
              godId={selectedGod.id}
              skinId={draftedGodSkin(presentedPlayer.godSkins, selectedGod.id)}
              className="god-hero-portrait"
            />
            <div><span>{selectedGod.domain}</span><h3>{selectedGod.name}</h3><p>{selectedGod.epithet}</p></div>
            <button
              className="god-back-button"
              disabled={!readOnly && committed}
              onClick={() => readOnly ? onCloseInspection() : dispatch({ type: "clear-god" })}
              aria-label={readOnly ? "Close god details" : "Choose a different god"}
              title={readOnly ? "Close god details" : "Choose a different god"}
            >
              <ArrowLeft size={17} />
            </button>
          </div>
          {readOnly && (
            <div className={`inspection-banner ${presentedGodResting ? "resting" : ""}`}>
              {presentation ? <Swords size={14} /> : <BookOpen size={14} />}
              {presentation
                ? `${colorLabel(presentation.color)} selected ${presentation.abilityId
                  ? selectedGod.abilities.find((ability) => ability.id === presentation.abilityId)?.name ?? "an ability"
                  : selectedGod.name}`
                : presentedGodResting && inspectingOwnGod
                ? `${selectedGod.name} is resting · abilities are unavailable`
                : `Viewing ${colorLabel(inspectedOwner)}’s god · abilities are read-only${presentedGodResting ? " · resting" : ""}`}
            </div>
          )}
          <LevelSelector
            level={godPreviewLevel ?? defaultGodPreviewLevel}
            onChange={setGodPreviewLevel}
            label="All abilities"
            className="god-level-selector"
          />
          <div className="ability-list">
            {selectedGod.abilities.map((item) => {
              const active = (!readOnly && state.selectedAbility === item.id) ||
                presentation?.abilityId === item.id;
              const unavailable = !canAfford(item) || (item.id === "lure" && !hasQueen);
              return (
                <AbilityCard
                  ability={item}
                  level={abilityLevel(presentedPlayer.upgrades, item.id)}
                  previewLevel={godPreviewLevel}
                  active={active}
                  highlighted={presentation?.abilityId === item.id}
                  selectable={!readOnly && !committed && !unavailable}
                  disabled={presentedGodResting || (!readOnly && (
                    (unavailable && !(committed && active)) ||
                    (committed && !active)
                  ))}
                  footerAction={!readOnly && item.id === "lure" && !hasQueen ? "REQUIRES QUEEN" : undefined}
                  onClick={() => {
                    if (!readOnly) dispatch({ type: "select-ability", abilityId: item.id });
                  }}
                  key={item.id}
                >
                  {!readOnly && active && state.selectedAbility && (
                    <PendingAbilityChoices
                      state={state}
                      dispatch={dispatch}
                      canPass={canPass}
                      committed={committed}
                    />
                  )}
                </AbilityCard>
              );
            })}
          </div>
        </>
      )}
    </aside>
  );
}

function UpgradePanel({
  state,
  dispatch,
  selectedGodId,
  presentation,
  onCloseGod,
}: {
  state: GameState;
  dispatch: GameDispatch;
  selectedGodId?: GodId;
  presentation?: ActionPresentation;
  onCloseGod: () => void;
}) {
  const [godPreviewLevel, setGodPreviewLevel] = useState<number>();
  const [selectedAbilityId, setSelectedAbilityId] = useState<string>();
  const presentedGodId = presentation?.godId ?? selectedGodId;
  const selectedGod = presentedGodId ? GOD_BY_ID[presentedGodId] : undefined;
  const selectedOwner: Color = presentation?.color ??
    (presentedGodId && state.players.black.gods.includes(presentedGodId) ? "black" : "white");
  const selectedPlayer = state.players[selectedOwner];
  const readOnly = Boolean(presentation) || selectedOwner !== state.activeColor;
  const defaultGodPreviewLevel = selectedGod
    ? Math.min(...selectedGod.abilities.map((ability) => abilityLevel(selectedPlayer.upgrades, ability.id)))
    : 1;

  useEffect(() => {
    setGodPreviewLevel(undefined);
    setSelectedAbilityId(undefined);
  }, [
    presentedGodId,
    state.activeColor,
    state.phase,
    state.round,
    state.upgradeQueue[0],
  ]);

  const presentedAbilityId = presentation?.abilityId ??
    (state.upgradePreview?.godId === presentedGodId ? state.upgradePreview?.abilityId : undefined) ??
    selectedAbilityId;
  const activePlayer = state.players[state.activeColor];
  const queuedAbilityId = state.upgradePreview?.abilityId ?? selectedAbilityId;
  const defaultUpgradePreviewLevel = Math.min(
    ...activePlayer.gods.flatMap((godId) =>
      GOD_BY_ID[godId].abilities.map((ability) =>
        abilityLevel(activePlayer.upgrades, ability.id)
      )
    ),
  );

  return (
    <aside className="action-panel upgrade-panel">
      <div className="panel-heading">
        <span>DIVINE UPGRADE</span>
        <small>ROUND {state.round}</small>
      </div>
      {!selectedGod ? (
        <>
          <div className="panel-empty">
            <Zap size={25} />
            <h3>Choose an ability to strengthen</h3>
            <p>Compare every ability in your pantheon, preview its higher levels, then confirm one upgrade.</p>
          </div>
          <LevelSelector
            level={godPreviewLevel ?? defaultUpgradePreviewLevel}
            onChange={setGodPreviewLevel}
            label="All abilities"
            className="god-level-selector"
          />
          <div className="classic-upgrade-list" data-upgrade-layout="single-column">
            {activePlayer.gods.map((godId, index) => {
              const god = GOD_BY_ID[godId];
              return (
                <section key={`${godId}-${index}`}>
                  <div className="four-panel-god-heading">
                    <GodPortrait
                      godId={godId}
                      skinId={draftedGodSkin(activePlayer.godSkins, godId)}
                    />
                    <strong>{god.name}</strong>
                    <small>{god.domain}</small>
                  </div>
                  {god.abilities.map((ability) => {
                    const level = abilityLevel(activePlayer.upgrades, ability.id);
                    const selected = queuedAbilityId === ability.id;
                    return (
                      <AbilityCard
                        ability={ability}
                        level={level}
                        previewLevel={godPreviewLevel}
                        active={selected}
                        selectable={level < 3}
                        disabled={level >= 3}
                        footerLabel={`CURRENT LVL ${level}`}
                        footerAction={level >= 3 ? "MAX LEVEL" : `SELECT LVL ${level + 1}`}
                        onClick={() => {
                          setGodPreviewLevel(Math.min(3, level + 1));
                          setSelectedAbilityId(ability.id);
                          dispatch({
                            type: "preview-upgrade",
                            godId: god.id,
                            abilityId: ability.id,
                          });
                        }}
                        onDoubleClick={() => {
                          dispatch({ type: "upgrade", abilityId: ability.id });
                        }}
                        key={ability.id}
                      >
                        {selected && (
                          <div className="upgrade-confirmation">
                            <button
                              className="primary-button"
                              onClick={() => dispatch({ type: "upgrade", abilityId: ability.id })}
                            >
                              Confirm {ability.name} · Lv {level + 1}
                            </button>
                          </div>
                        )}
                      </AbilityCard>
                    );
                  })}
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div
            className={`chosen-god ${presentation && !presentation.abilityId ? "opponent-selecting" : ""}`}
            style={{ "--accent": selectedGod.accent } as React.CSSProperties}
          >
            <GodPortrait
              godId={selectedGod.id}
              skinId={draftedGodSkin(selectedPlayer.godSkins, selectedGod.id)}
              className="god-hero-portrait"
            />
            <div><span>{selectedGod.domain}</span><h3>{selectedGod.name}</h3><p>{selectedGod.epithet}</p></div>
            <button
              className="god-back-button"
              onClick={onCloseGod}
              aria-label="Choose a different god"
              title="Choose a different god"
            >
              <ArrowLeft size={17} />
            </button>
          </div>
          <div className={`inspection-banner ${readOnly ? "" : "upgrade-ready"}`}>
            {readOnly ? <BookOpen size={14} /> : <Zap size={14} />}
            {presentation
              ? `${colorLabel(presentation.color)} ${presentation.kind === "upgrade" ? "upgraded" : "selected"} ${
                presentation.abilityId
                  ? selectedGod.abilities.find((ability) => ability.id === presentation.abilityId)?.name ?? "an ability"
                  : selectedGod.name
              }`
              : readOnly
              ? `Viewing ${state.players[selectedOwner].name}’s god · abilities are read-only`
              : "Select an ability, review its levels, then confirm the upgrade"}
          </div>
          <LevelSelector
            level={godPreviewLevel ?? defaultGodPreviewLevel}
            onChange={setGodPreviewLevel}
            label="All abilities"
            className="god-level-selector"
          />
          <div className="ability-list">
            {selectedGod.abilities.map((ability) => {
              const level = abilityLevel(selectedPlayer.upgrades, ability.id);
              const canUpgrade = !readOnly && level < 3;
              const selected = presentedAbilityId === ability.id;
              return (
                <AbilityCard
                  ability={ability}
                  level={level}
                  previewLevel={godPreviewLevel}
                  active={selected}
                  highlighted={presentation?.abilityId === ability.id}
                  selectable={canUpgrade}
                  disabled={!readOnly && level >= 3}
                  footerLabel={`CURRENT LVL ${level}`}
                  footerAction={readOnly ? "VIEW ONLY" : level >= 3 ? "MAX LEVEL" : `SELECT LVL ${level + 1}`}
                  onClick={() => {
                    setGodPreviewLevel(Math.min(3, level + 1));
                    setSelectedAbilityId(ability.id);
                    dispatch({
                      type: "preview-upgrade",
                      godId: selectedGod.id,
                      abilityId: ability.id,
                    });
                  }}
                  onDoubleClick={() => {
                    dispatch({ type: "upgrade", abilityId: ability.id });
                  }}
                  key={ability.id}
                >
                  {!readOnly && selected && (
                    <div className="upgrade-confirmation">
                      <button
                        className="primary-button"
                        onClick={() => dispatch({ type: "upgrade", abilityId: ability.id })}
                      >
                        Confirm {ability.name} · Lv {level + 1}
                      </button>
                    </div>
                  )}
                </AbilityCard>
              );
            })}
          </div>
        </>
      )}
    </aside>
  );
}

const colorLabel = (color: Color) => color[0].toUpperCase() + color.slice(1);

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop rules-backdrop" onMouseDown={onClose}>
      <section className="rules-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="close-button" onClick={onClose} aria-label="Close rules"><X size={20} /></button>
        <p className="eyebrow">HOW TO PLAY</p>
        <h2>The laws of God Chess</h2>
        <div className="rule-columns">
          <article>
            <span>01</span><h3>Draft your pantheon</h3>
            <p>Colors are assigned at random. White drafts first in a 1–2–2–1 snake order until each player commands three gods.</p>
          </article>
          <article>
            <span>02</span><h3>Take divine turns</h3>
            <p>Call one un-rested god and use one of their three abilities. Free powers generate resources; stronger powers consume them.</p>
          </article>
          <article>
            <span>03</span><h3>Master the orbs</h3>
            <p>White orbs fuel protection and movement. Black orbs fuel attacks and control. Your whole pantheon shares one reserve.</p>
          </article>
          <article>
            <span>04</span><h3>Awaken and ascend</h3>
            <p>When all six gods are resting, every rest token clears and both players upgrade one ability. Each ability reaches level 3.</p>
          </article>
        </div>
        <div className="rules-note"><Shield size={18} /><p>Unless a power says <strong>teleport</strong>, every move must obey that piece’s legal chess movement. Capture the enemy king to win.</p></div>
        <div className="printable-links">
          <a href="./printables/god-chess-god-boards.pdf" target="_blank" rel="noreferrer">
            <Download size={16} /> God boards
          </a>
          <a href="./printables/god-chess-marker-tokens.pdf" target="_blank" rel="noreferrer">
            <Download size={16} /> Marker tokens
          </a>
        </div>
      </section>
    </div>
  );
}

function SettingsModal({
  undoPreferred,
  onlineSession,
  localConsent,
  remoteConsent,
  onUndoPreferenceChange,
  onClose,
}: {
  undoPreferred: boolean;
  onlineSession: boolean;
  localConsent: boolean;
  remoteConsent: boolean;
  onUndoPreferenceChange: (enabled: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="settings-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="close-button" onClick={onClose} aria-label="Close settings"><X size={20} /></button>
        <div className="settings-icon"><Settings size={25} /></div>
        <p className="eyebrow">GAME OPTIONS</p>
        <h2>Settings</h2>
        <div className="setting-row">
          <div>
            <strong>Allow undo</strong>
            <p>
              {onlineSession
                ? "Both players must enable this setting. Either player can then rewind the latest completed turn or upgrade."
                : "Adds an Undo button that rewinds the latest completed turn or upgrade."}
            </p>
          </div>
          <button
            className={`setting-switch ${undoPreferred ? "enabled" : ""}`}
            role="switch"
            aria-checked={undoPreferred}
            aria-label="Allow undo"
            onClick={() => onUndoPreferenceChange(!undoPreferred)}
          >
            <span />
          </button>
        </div>
        {onlineSession && (
          <div className="undo-consent-status">
            <span className={localConsent ? "enabled" : ""}>
              <i>{localConsent ? "✓" : "—"}</i>
              You
            </span>
            <span className={remoteConsent ? "enabled" : ""}>
              <i>{remoteConsent ? "✓" : "—"}</i>
              Opponent
            </span>
            <p>
              {localConsent && remoteConsent
                ? "Undo is enabled for this online game."
                : localConsent
                  ? "Waiting for your opponent to enable undo."
                  : "Enable undo to give your consent."}
            </p>
          </div>
        )}
        {!onlineSession && (
          <p className="settings-note">
            Against the Divine AI, undo rewinds the AI response and your preceding turn together.
          </p>
        )}
      </section>
    </div>
  );
}

export function SimulationExportDialog({
  data,
  onQuit,
}: {
  data: SimulationExportData;
  onQuit: () => void;
}) {
  const [copyStatus, setCopyStatus] = useState<
    "idle" | "copying" | "copied" | "failed"
  >("idle");
  const exportText = useMemo(() =>
    JSON.stringify({
      result: {
        summary: data.resultSummary,
        completedTurns: data.completedTurns,
        terminalResult: data.terminalResult,
      },
      rewind: {
        rounds: data.rewindRounds,
        requestedUndoActions: data.requestedUndoActions,
        appliedUndoActions: data.appliedUndoActions,
      },
      save: data.save,
    }, null, 2), [data]);

  const copyExport = async () => {
    setCopyStatus("copying");
    try {
      if (typeof navigator.clipboard?.writeText !== "function") {
        throw new Error("Clipboard unavailable.");
      }
      await navigator.clipboard.writeText(exportText);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };

  return (
    <div className="modal-backdrop simulation-export-backdrop">
      <section
        className="gameover-modal simulation-export-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="simulation-export-title"
      >
        <p className="eyebrow">SIMULATION CHECKPOINT</p>
        <h2 id="simulation-export-title">Rewound game state</h2>
        <p className="simulation-result-summary">{data.resultSummary}</p>
        <p>
          Rewound {data.appliedUndoActions} of {data.requestedUndoActions} undo
          actions for a {data.rewindRounds}-turn Daily window.
        </p>
        <pre
          className="simulation-export-data"
          tabIndex={0}
          aria-label="Simulation game state and result"
        >
          {exportText}
        </pre>
        <div className="simulation-export-actions">
          <button
            className="primary-button"
            onClick={() => void copyExport()}
          >
            <Copy size={16} /> Copy game state and result
          </button>
          <button className="secondary-button" onClick={onQuit}>
            Quit simulation
          </button>
        </div>
        {copyStatus === "copying" && (
          <p role="status">Copying game state...</p>
        )}
        {copyStatus === "copied" && (
          <p role="status">Game state and result copied.</p>
        )}
        {copyStatus === "failed" && (
          <p role="alert">
            Clipboard access failed. Select and copy the game state above.
          </p>
        )}
      </section>
    </div>
  );
}

function LocalDataImportModal({
  loading,
  working,
  error,
  onImport,
  onStartFresh,
}: {
  loading: boolean;
  working: boolean;
  error?: string;
  onImport: () => Promise<void>;
  onStartFresh: () => Promise<void>;
}) {
  return (
    <div className="modal-backdrop">
      <section className="account-modal" aria-modal="true" role="dialog">
        <p className="eyebrow">NEW ACCOUNT</p>
        <Download className="account-hero-icon" size={32} />
        <h2>Import this device's progress?</h2>
        <p>
          You can copy local saved games, puzzle progress, achievements, and
          completed challenges into your new account.
        </p>
        <p className="settings-note">
          This choice is only offered once. While signed in, account data always
          takes priority over data stored locally on this device.
        </p>
        <div className="account-import-actions">
          <button
            className="primary-button"
            disabled={loading || working}
            onClick={() => void onImport()}
          >
            {loading || working
              ? <LoaderCircle className="spin" size={17} />
              : <Download size={17} />}
            {loading ? "Loading account data" : "Import local data"}
          </button>
          <button
            className="secondary-button"
            disabled={loading || working}
            onClick={() => void onStartFresh()}
          >
            Start fresh
          </button>
        </div>
        {error && <p className="account-error" role="alert">{error}</p>}
      </section>
    </div>
  );
}

interface AccountControlProps {
  account?: AccountProfile;
  accountConfigured: boolean;
  accountLoading: boolean;
  accountWorking: boolean;
  accountError?: string;
  accountDataLoading: boolean;
  accountImportWorking: boolean;
  accountImportError?: string;
  onSignIn: (email: string, password: string) => Promise<string>;
  onSignUp: (email: string, password: string, displayName: string) => Promise<string>;
  onSignOut: () => Promise<void>;
  onUpdateDisplayName: (displayName: string) => Promise<string>;
  onImportLocalData: () => Promise<void>;
  onStartAccountFresh: () => Promise<void>;
  className?: string;
}

function AccountControl({
  account,
  accountConfigured,
  accountLoading,
  accountWorking,
  accountError,
  accountDataLoading,
  accountImportWorking,
  accountImportError,
  onSignIn,
  onSignUp,
  onSignOut,
  onUpdateDisplayName,
  onImportLocalData,
  onStartAccountFresh,
  className = "",
}: AccountControlProps) {
  const [accountModalMode, setAccountModalMode] =
    useState<"auth" | "name" | "import">();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!account) {
      setAccountMenuOpen(false);
      return;
    }
    if (account.needsDisplayName) {
      setAccountModalMode("name");
    } else if (account.needsLocalDataImport) {
      setAccountModalMode("import");
    } else if (
      accountModalMode === "auth" ||
      accountModalMode === "import"
    ) {
      setAccountModalMode(undefined);
    }
  }, [account, accountModalMode]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        accountAreaRef.current?.contains(event.target)
      ) return;
      setAccountMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [accountMenuOpen]);

  const signOut = async () => {
    setAccountMenuOpen(false);
    try {
      await onSignOut();
    } catch (error) {
      console.error("God Chess sign-out failed.", error);
    }
  };

  const updateDisplayName = async (displayName: string) => {
    const message = await onUpdateDisplayName(displayName);
    setAccountModalMode(undefined);
    return message;
  };

  return (
    <>
      <div
        className={`main-account-area ${className}`.trim()}
        ref={accountAreaRef}
      >
        <button
          className="main-account-button"
          disabled={accountLoading}
          aria-haspopup={account ? "menu" : "dialog"}
          aria-expanded={account ? accountMenuOpen : undefined}
          onClick={() => {
            if (account) setAccountMenuOpen((open) => !open);
            else setAccountModalMode("auth");
          }}
        >
          <UserRound size={16} />
          {accountLoading ? "Account" : account?.displayName ?? "Sign in"}
        </button>
        {account && accountMenuOpen && (
          <div className="main-account-menu" role="menu" aria-label="Account options">
            <button
              role="menuitem"
              onClick={() => {
                setAccountMenuOpen(false);
                setAccountModalMode("name");
              }}
            >
              <Pencil size={15} />
              Change name
            </button>
            <button role="menuitem" disabled={accountWorking} onClick={() => void signOut()}>
              <LogOut size={15} />
              Sign out
            </button>
          </div>
        )}
      </div>
      {accountModalMode === "import" && (
        <LocalDataImportModal
          loading={accountDataLoading}
          working={accountImportWorking || accountWorking}
          error={accountImportError}
          onImport={onImportLocalData}
          onStartFresh={onStartAccountFresh}
        />
      )}
      {accountModalMode && accountModalMode !== "import" && (
        <AccountModal
          account={account}
          configured={accountConfigured}
          loading={accountLoading}
          working={accountWorking}
          serviceError={accountError}
          onClose={() => setAccountModalMode(undefined)}
          onSignIn={onSignIn}
          onSignUp={onSignUp}
          onSignOut={onSignOut}
          onUpdateDisplayName={updateDisplayName}
        />
      )}
    </>
  );
}

function MainMenu({
  saveError,
  onStart,
  ...accountProps
}: AccountControlProps & {
  saveError?: string;
  onStart: () => void;
}) {
  return (
    <section className="main-menu-screen">
      <img
        className="main-menu-art"
        src={TITLE_ART_AVIF}
        alt="God Chess"
        decoding="async"
        fetchPriority="high"
        onError={(event) => {
          if (!event.currentTarget.src.endsWith("god-chess-title.webp")) {
            event.currentTarget.src = TITLE_ART_WEBP;
          }
        }}
      />
      <div className="main-menu-shade" />
      <span className="game-version">Version {GAME_VERSION}</span>
      <AccountControl {...accountProps} />
      <div className="main-menu-actions">
        <p className="eyebrow">THE DIVINE GAME</p>
        <button className="primary-button main-start-button" onClick={onStart}>
          Start
        </button>
        {saveError && <p className="main-menu-error" role="alert">{saveError}</p>}
      </div>
    </section>
  );
}

function PlayMenu({
  savedGames,
  savesLoading,
  saveError,
  account,
  accountControl,
  onBack,
  onOpenLocal,
  onOpenOnline,
  onOpenPuzzles,
  onOpenTutorial,
  onOpenRoster,
  onOpenAchievements,
  onOpenLoad,
}: {
  savedGames: SavedGame[];
  savesLoading: boolean;
  saveError?: string;
  account?: AccountProfile;
  accountControl: ReactNode;
  onBack: () => void;
  onOpenLocal: () => void;
  onOpenOnline: () => void;
  onOpenPuzzles: () => void;
  onOpenTutorial: () => void;
  onOpenRoster: () => void;
  onOpenAchievements: () => void;
  onOpenLoad: () => void;
}) {
  const loadDescription = savesLoading
    ? "Loading saved games."
    : savedGames.length === 0
      ? "No saved games available."
      : `${savedGames.length} ${account ? "cloud " : ""}saved game${savedGames.length === 1 ? "" : "s"} available.`;
  return (
    <SetupNavigationShell
      backLabel="Back to title"
      onBack={onBack}
      headerAction={accountControl}
    >
      <div className="play-menu-heading">
        <p className="eyebrow">PLAY</p>
        <h1>Choose your path.</h1>
        <p>Learn the game, browse the divine roster, begin a match, solve a puzzle, or continue a saved game.</p>
      </div>
      <div className="play-menu-grid" role="group" aria-label="Play options">
        <button onClick={onOpenLocal}>
          <Users size={30} />
          <strong>Local</strong>
        </button>
        <button onClick={onOpenOnline}>
          <Wifi size={30} />
          <strong>Online</strong>
        </button>
        <button onClick={onOpenPuzzles}>
          <Crosshair size={30} />
          <strong>Puzzles</strong>
        </button>
        <button onClick={onOpenTutorial}>
          <GraduationCap size={30} />
          <strong>Tutorial</strong>
        </button>
        <button onClick={onOpenRoster}>
          <BookOpen size={30} />
          <strong>Roster</strong>
        </button>
        <button onClick={onOpenAchievements}>
          <Trophy size={30} />
          <strong>Achievements</strong>
        </button>
        <button
          onClick={onOpenLoad}
          disabled={savesLoading || savedGames.length === 0}
          aria-label="Load"
          aria-describedby="play-load-status"
        >
          {savesLoading ? <LoaderCircle className="spin" size={30} /> : <History size={30} />}
          <strong>Load</strong>
        </button>
      </div>
      <p className="play-load-status" id="play-load-status" role="status">
        {loadDescription}
      </p>
      {saveError && <p className="main-menu-error" role="alert">{saveError}</p>}
    </SetupNavigationShell>
  );
}

function AchievementsScreen({
  progress,
  account,
  accountControl,
  loading,
  puzzleCounts,
  onBack,
}: {
  progress: AchievementProgress;
  account?: AccountProfile;
  accountControl: ReactNode;
  loading: boolean;
  puzzleCounts: {
    easy: number;
    medium: number;
    hard: number;
    daily: number;
  };
  onBack: () => void;
}) {
  const completed = new Set(completedAchievementIds(progress));
  return (
    <SetupNavigationShell
      backLabel="Back to Play"
      onBack={onBack}
      headerAction={accountControl}
    >
      <section className="achievements-page">
        <header className="achievements-heading">
          <div>
            <p className="eyebrow">ACHIEVEMENTS</p>
            <h1>Chronicle of legends</h1>
            <p>
              {account
                ? "Progress is saved to your account."
                : "Progress is saved on this device until you sign in."}
            </p>
          </div>
          <strong>{completed.size} / {ACHIEVEMENT_DEFINITIONS.length}</strong>
        </header>
        {loading ? (
          <div className="achievements-loading">
            <LoaderCircle className="spin" size={24} />
            <span>Restoring achievement progress</span>
          </div>
        ) : (
          <div className="achievement-grid">
            {ACHIEVEMENT_DEFINITIONS.map((achievement, index) => {
              const done = completed.has(achievement.id);
              const value = achievementProgressValue(
                progress,
                achievement.id,
                puzzleCounts,
              );
              return (
                <article
                  className={`achievement-card${done ? " completed" : ""}`}
                  key={achievement.id}
                >
                  <span className="achievement-number">{index + 1}</span>
                  <div className="achievement-icon" aria-hidden="true">
                    {done ? <Check size={20} /> : <Trophy size={20} />}
                  </div>
                  <div>
                    <h2>{achievement.title}</h2>
                    <p>{achievement.description}</p>
                    {achievement.goal && (
                      <div className="achievement-progress">
                        <div>
                          <i
                            style={{
                              width: `${
                                Math.min(100, Math.round(
                                  (Math.min(value ?? 0, achievement.goal) /
                                    achievement.goal) * 100,
                                ))
                              }%`,
                            }}
                          />
                        </div>
                        <span>{Math.min(value ?? 0, achievement.goal)} / {achievement.goal}</span>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </SetupNavigationShell>
  );
}

function SavedGameLibrary({
  savedGames,
  savesLoading,
  onLoad,
  onDelete,
  onDeleteAll,
}: {
  savedGames: SavedGame[];
  savesLoading: boolean;
  onLoad: (game: SavedGame) => void;
  onDelete: (id: string) => void;
  onDeleteAll: () => Promise<boolean>;
}) {
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  const deleteAll = async () => {
    setDeletingAll(true);
    const deleted = await onDeleteAll();
    setDeletingAll(false);
    if (deleted) setConfirmDeleteAll(false);
  };

  return (
    <section className="load-game-library shell-library">
      <p className="eyebrow">SAVED PANTHEONS</p>
      <h2>Load game</h2>
      {!savesLoading && savedGames.length > 0 && (
        <div className="saved-game-toolbar">
          <button
            type="button"
            className="danger-button delete-all-saves-button"
            onClick={() => setConfirmDeleteAll(true)}
          >
            <Trash2 size={15} />
            Delete all
          </button>
        </div>
      )}
      <div className="saved-game-list">
        {savesLoading && (
          <div className="saved-games-loading">
            <LoaderCircle className="spin" size={22} />
            Loading cloud saves
          </div>
        )}
        {!savesLoading && savedGames.map((game) => (
          <article className="saved-game-card" key={game.id}>
            <button
              className="saved-game-load"
              onClick={() => onLoad(game)}
              aria-label={`Load saved game from ${new Date(game.savedAt).toLocaleString()}`}
            >
              <div className="saved-game-meta">
                <strong>{new Date(game.savedAt).toLocaleString()}</strong>
                <span>
                  {isFourPlayerSavedGame(game)
                    ? `Four-player ${game.state.config.mode === "teams" ? "2v2" : "FFA"} · ${game.state.players[game.state.activeSeat].name} to act`
                    : isThreePlayerSavedGame(game)
                      ? `Three-player ${game.state.config.boardVariant} · ${game.state.players[game.state.activeSeat].name} to act`
                      : `${game.state.gameMode === "ai" ? "Divine AI" : "Local duel"} · Round ${game.state.round} · Turn ${game.state.turn}`}
                </span>
              </div>
              {isFourPlayerSavedGame(game)
                ? FOUR_PLAYER_SEATS.map((seat) => {
                  const player = game.state.players[seat];
                  return (
                    <div className="saved-pantheon four-saved-pantheon" key={seat}>
                      <span
                        className="four-player-crest"
                        style={{ "--seat-color": player.displayColor } as React.CSSProperties}
                      >
                        {seat[0].toUpperCase()}
                      </span>
                      <div>
                        <strong>{player.name}</strong>
                        <small>
                          {seat} · {player.control.kind === "ai"
                            ? `AI ${player.control.difficulty ?? 5}`
                            : "Human"}
                          {player.team ? ` · ${player.team === "team-a" ? "Team A" : "Team B"}` : ""}
                        </small>
                      </div>
                      <div className="saved-gods">
                        {player.gods.length
                          ? player.gods.map((godId) => (
                            <span
                              className="saved-god"
                              title={GOD_BY_ID[godId].name}
                              aria-label={GOD_BY_ID[godId].name}
                              key={godId}
                            >
                              <GodSigil
                                godId={godId}
                                skinId={draftedGodSkin(player.godSkins, godId)}
                                size="small"
                              />
                            </span>
                          ))
                          : <em>No gods drafted</em>}
                      </div>
                    </div>
                  );
                })
                : isThreePlayerSavedGame(game)
                  ? THREE_PLAYER_SEATS.map((seat) => {
                    const player = game.state.players[seat];
                    return (
                      <div className="saved-pantheon four-saved-pantheon" key={seat}>
                        <span
                          className="four-player-crest"
                          style={{ "--seat-color": player.displayColor } as React.CSSProperties}
                        >
                          {seat[0].toUpperCase()}
                        </span>
                        <div>
                          <strong>{player.name}</strong>
                          <small>{seat} · {player.control.kind === "ai" ? `AI ${player.control.difficulty ?? 5}` : "Human"}</small>
                        </div>
                        <div className="saved-gods">
                          {player.gods.length
                            ? player.gods.map((godId) => (
                              <span className="saved-god" title={GOD_BY_ID[godId].name} key={godId}>
                                <GodSigil
                                  godId={godId}
                                  skinId={draftedGodSkin(player.godSkins, godId)}
                                  size="small"
                                />
                              </span>
                            ))
                            : <em>No gods drafted</em>}
                        </div>
                      </div>
                    );
                  })
                  : (["white", "black"] as const).map((color) => (
                <div className="saved-pantheon" key={color}>
                  <span className={`player-crest ${color}`}>{color[0].toUpperCase()}</span>
                  <div>
                    <strong>{game.state.players[color].name}</strong>
                    <small>{color}</small>
                  </div>
                  <div className="saved-gods">
                    {game.state.players[color].gods.length
                      ? game.state.players[color].gods.map((godId) => (
                        <span
                          className="saved-god"
                          title={GOD_BY_ID[godId].name}
                          aria-label={GOD_BY_ID[godId].name}
                          key={godId}
                        >
                          <GodSigil
                            godId={godId}
                            skinId={draftedGodSkin(game.state.players[color].godSkins, godId)}
                            size="small"
                          />
                        </span>
                      ))
                      : <em>No gods drafted</em>}
                  </div>
                </div>
                  ))}
            </button>
            <button
              className="delete-save-button"
              onClick={() => onDelete(game.id)}
              aria-label={`Delete saved game from ${new Date(game.savedAt).toLocaleString()}`}
              title="Delete saved game"
            >
              <Trash2 size={16} />
            </button>
          </article>
        ))}
        {!savesLoading && savedGames.length === 0 && (
          <p className="saved-games-empty">No saved games are stored in this account yet.</p>
        )}
      </div>
      {confirmDeleteAll && (
        <div
          className="delete-all-saves-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-all-saves-title"
        >
          <div className="delete-all-saves-confirmation">
            <Trash2 size={28} />
            <h3 id="delete-all-saves-title">Delete all saved games?</h3>
            <p>
              This permanently deletes all {savedGames.length} saved game
              {savedGames.length === 1 ? "" : "s"} in this library.
            </p>
            <div>
              <button
                type="button"
                className="secondary-button"
                disabled={deletingAll}
                onClick={() => setConfirmDeleteAll(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={deletingAll}
                onClick={() => void deleteAll()}
              >
                {deletingAll
                  ? <LoaderCircle className="spin" size={15} />
                  : <Trash2 size={15} />}
                Delete all
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function PlayerCountChooser({
  category,
  onSelect,
}: {
  category: StartCategory;
  onSelect: (playerCount: PlayerCount) => void;
}) {
  return (
    <>
      <div className="start-game-heading">
        <p className="eyebrow">{category === "local" ? "LOCAL PLAY" : "ONLINE PLAY"}</p>
        <h1>Choose player count</h1>
        <p>
          {category === "local"
            ? "Share this device or challenge the Divine AI."
            : "Host or join a room for the exact board you want to play."}
        </p>
      </div>
      <div className="player-count-grid" aria-label={`${category} player count`}>
        {([2, 3, 4] as const).map((playerCount) => (
          <button onClick={() => onSelect(playerCount)} key={playerCount}>
            <Users size={34} />
            <strong>{playerCount} Player</strong>
          </button>
        ))}
      </div>
    </>
  );
}

function StartGamePrompt({
  online,
  fourOnline,
  threeOnline,
  defaultPlayerName,
  accountControl,
  category,
  initialPlayerCount,
  onStart,
  onStartSimulation,
  onOpenFourPlayer,
  onOpenThreePlayer,
  onHost,
  onJoin,
  onStartOnline,
  onHostFourOnline,
  onJoinFourOnline,
  onFourReady,
  onFourAssignSeat,
  onFourUpdateConfig,
  onStartFourOnline,
  onHostThreeOnline,
  onJoinThreeOnline,
  onThreeReady,
  onThreeAssignSeat,
  onThreeUpdateConfig,
  onStartThreeOnline,
  onCancel,
  onDisconnect,
}: {
  online: OnlineGameState;
  fourOnline: FourPlayerOnlineState;
  threeOnline: ThreePlayerOnlineState;
  defaultPlayerName?: string;
  accountControl: ReactNode;
  category: StartCategory;
  initialPlayerCount?: PlayerCount;
  onStart: (
    mode: Exclude<GameMode, "online" | "puzzle" | "simulation">,
    difficulty: number,
  ) => void;
  onStartSimulation: () => void;
  onOpenFourPlayer: () => void;
  onOpenThreePlayer: () => void;
  onHost: (name: string) => void;
  onJoin: (code: string, name: string) => void;
  onStartOnline: () => void;
  onHostFourOnline: (name: string) => void;
  onJoinFourOnline: (code: string, name: string) => void;
  onFourReady: (ready: boolean) => void;
  onFourAssignSeat: (participantId: string, seat?: (typeof FOUR_PLAYER_SEATS)[number]) => void;
  onFourUpdateConfig: (config: FourPlayerConfig) => void;
  onStartFourOnline: () => void;
  onHostThreeOnline: (name: string) => void;
  onJoinThreeOnline: (code: string, name: string) => void;
  onThreeReady: (ready: boolean) => void;
  onThreeAssignSeat: (
    participantId: string,
    seat?: (typeof THREE_PLAYER_SEATS)[number],
  ) => void;
  onThreeUpdateConfig: (config: ThreePlayerConfig) => void;
  onStartThreeOnline: () => void;
  onCancel: () => void;
  onDisconnect: () => void;
}) {
  const [playerCount, setPlayerCount] = useState<PlayerCount | undefined>(
    initialPlayerCount ??
      (category === "online"
        ? threeOnline.roomCode
          ? 3
          : fourOnline.roomCode
            ? 4
            : online.roomCode
              ? 2
              : undefined
        : undefined),
  );
  const [localMode, setLocalMode] = useState<"local" | "ai">("local");
  const [difficulty, setDifficulty] = useState(7);
  const [onlineAction, setOnlineAction] = useState<"host" | "join">("host");
  const [playerName, setPlayerName] = useState(defaultPlayerName || "Player");
  const [roomCode, setRoomCode] = useState("");
  const simulationKeyCount = useRef(0);

  const back = () => {
    if (playerCount) {
      onDisconnect();
      setPlayerCount(undefined);
      return;
    }
    onDisconnect();
    onCancel();
  };

  return (
    <SetupNavigationShell
      backLabel={playerCount ? `Back to ${category}` : "Back to Play"}
      onBack={back}
      headerAction={accountControl}
      contentClassName={category === "online" && playerCount ? "online-stage" : ""}
    >
      <section className={`start-game-content ${category === "online" && playerCount ? "online-stage" : ""}`}>
        {!playerCount ? (
          <PlayerCountChooser category={category} onSelect={(count) => {
            onDisconnect();
            if (category === "local" && count === 3) {
              onOpenThreePlayer();
              return;
            }
            if (category === "local" && count === 4) {
              onOpenFourPlayer();
              return;
            }
            setPlayerCount(count);
          }} />
        ) : category === "local" ? (
          playerCount === 2 ? (
            <>
              <div className="start-game-heading">
                <p className="eyebrow">LOCAL · 2 PLAYER</p>
                <h1>Choose opponent</h1>
                <p>Play together on one device or face the Divine AI.</p>
              </div>
              <div className="two-player-mode-grid" aria-label="Two-player local mode">
                <button
                  className={localMode === "local" ? "active" : ""}
                  onClick={() => setLocalMode("local")}
                >
                  <Users size={30} />
                  <strong>Local duel</strong>
                  <span>Two players share this device.</span>
                </button>
                <button
                  className={localMode === "ai" ? "active" : ""}
                  onClick={() => setLocalMode("ai")}
                >
                  <Bot size={30} />
                  <strong>Divine AI</strong>
                  <span>Challenge a computer opponent.</span>
                </button>
              </div>
              {localMode === "ai" && (
                <div className="difficulty-control">
                  <div>
                    <span>AI difficulty</span>
                    <strong>{difficulty}</strong>
                  </div>
                  <input
                    aria-label="AI difficulty"
                    type="range"
                    min="1"
                    max="10"
                    value={difficulty}
                    onChange={(event) => setDifficulty(Number(event.target.value))}
                  />
                  <small>{difficulty * 10}% chance to choose its highest-scoring turn</small>
                </div>
              )}
              <button
                className="primary-button start-match-button"
                onClick={() => onStart(localMode, difficulty)}
                onBlur={() => {
                  simulationKeyCount.current = 0;
                }}
                onKeyDown={(event) => {
                  if (localMode !== "local" || event.repeat) return;
                  if (event.key.toLowerCase() !== "n") {
                    simulationKeyCount.current = 0;
                    return;
                  }
                  simulationKeyCount.current += 1;
                  if (simulationKeyCount.current < 5) return;
                  simulationKeyCount.current = 0;
                  event.preventDefault();
                  onStartSimulation();
                }}
              >
                {localMode === "ai" ? "Challenge the AI" : "Begin local duel"}
              </button>
            </>
          ) : (
            <></>
          )
        ) : (
          <div className="online-setup">
            {playerCount === 3 && threeOnline.role !== "none" ? (
              <ThreePlayerOnlineLobby
                online={threeOnline}
                onReady={onThreeReady}
                onAssignSeat={onThreeAssignSeat}
                onUpdateConfig={onThreeUpdateConfig}
                onStart={onStartThreeOnline}
                onLeave={back}
              />
            ) : playerCount === 4 && fourOnline.role !== "none" ? (
              <FourPlayerOnlineLobby
                online={fourOnline}
                onReady={onFourReady}
                onAssignSeat={onFourAssignSeat}
                onUpdateConfig={onFourUpdateConfig}
                onStart={onStartFourOnline}
                onLeave={back}
              />
            ) : playerCount === 2 && online.role !== "none" ? (
              online.role === "host" ? (
                <div className="online-lobby">
                  <Wifi size={24} />
                  <span>ROOM CODE</span>
                  <button
                    className="room-code"
                    onClick={() => online.roomCode && navigator.clipboard.writeText(online.roomCode)}
                    title="Copy room code"
                  >
                    {online.roomCode}<Copy size={15} />
                  </button>
                  <p>{online.guest ? `${online.guest.name} joined the room.` : "Waiting for another player to join..."}</p>
                  <button className="primary-button" disabled={!online.guest} onClick={onStartOnline}>
                    Start online game
                  </button>
                </div>
              ) : (
                <div className="online-lobby">
                  <Wifi size={24} />
                  <span>JOINED ROOM {online.roomCode}</span>
                  <h3>Waiting for the host</h3>
                  <p>The game will begin when the host starts the match.</p>
                </div>
              )
            ) : (
              <>
                <div className="start-game-heading compact">
                  <p className="eyebrow">ONLINE · {playerCount} PLAYER</p>
                  <h1>Host or join</h1>
                  <p>Use a five-character room code to meet at the same board.</p>
                </div>
                <div className="online-tabs">
                  <button className={onlineAction === "host" ? "active" : ""} onClick={() => setOnlineAction("host")}>
                    Host
                  </button>
                  <button className={onlineAction === "join" ? "active" : ""} onClick={() => setOnlineAction("join")}>
                    Join
                  </button>
                </div>
                <label>
                  Display name
                  <input maxLength={24} value={playerName} onChange={(event) => setPlayerName(event.target.value)} />
                </label>
                {onlineAction === "join" && (
                  <label>
                    Room code
                    <input
                      className="room-code-input"
                      maxLength={5}
                      value={roomCode}
                      onChange={(event) => setRoomCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""))}
                    />
                  </label>
                )}
                <button
                  className="primary-button"
                  disabled={
                    online.connecting ||
                    fourOnline.connecting ||
                    threeOnline.connecting ||
                    !playerName.trim() ||
                    (onlineAction === "join" && roomCode.length !== 5)
                  }
                  onClick={() => {
                    if (playerCount === 3) {
                      if (onlineAction === "host") onHostThreeOnline(playerName);
                      else onJoinThreeOnline(roomCode, playerName);
                    } else if (playerCount === 4) {
                      if (onlineAction === "host") onHostFourOnline(playerName);
                      else onJoinFourOnline(roomCode, playerName);
                    } else if (onlineAction === "host") onHost(playerName);
                    else onJoin(roomCode, playerName);
                  }}
                >
                  {online.connecting || fourOnline.connecting || threeOnline.connecting
                    ? <><LoaderCircle className="spin" size={17} /> Connecting</>
                    : onlineAction === "host"
                      ? "Create room"
                      : "Join room"}
                </button>
              </>
            )}
            {(online.error || fourOnline.error || threeOnline.error) && (
              <p className="online-error">
                {online.error ?? fourOnline.error ?? threeOnline.error}
              </p>
            )}
            {(online.role !== "none" ||
              fourOnline.role !== "none" ||
              threeOnline.role !== "none") &&
              !(playerCount === 4 && fourOnline.role !== "none") &&
              !(playerCount === 3 && threeOnline.role !== "none") && (
              <button className="text-button leave-room-button" onClick={back}>Leave room</button>
            )}
          </div>
        )}
      </section>
    </SetupNavigationShell>
  );
}

function PuzzleSelectScreen({
  completedPuzzles,
  completedChallenges,
  accountControl,
  progressLoading,
  progressError,
  onStartPuzzle,
  onStartChallenge,
  onBack,
  onDismissError,
}: {
  completedPuzzles: Set<PuzzleId>;
  completedChallenges: Set<ChallengeId>;
  accountControl: ReactNode;
  progressLoading: boolean;
  progressError?: string;
  onStartPuzzle: (puzzleId: PuzzleId) => void;
  onStartChallenge: (challengeId: ChallengeId) => void;
  onBack: () => void;
  onDismissError: () => void;
}) {
  type PuzzleCategory =
    | PuzzleDifficulty
    | "daily"
    | "three-player"
    | "challenges";
  const [difficulty, setDifficulty] = useState<PuzzleCategory>();
  const dailyPuzzle = currentDailyPuzzle();
  const visiblePuzzles = difficulty === "daily"
    ? dailyPuzzle ? [dailyPuzzle] : []
    : difficulty === "three-player"
      ? THREE_PLAYER_PUZZLES
      : difficulty && difficulty !== "challenges"
        ? PUZZLES.filter((puzzle) => puzzle.difficulty === difficulty)
        : [];
  const completedInDifficulty = visiblePuzzles.filter((puzzle) => completedPuzzles.has(puzzle.id)).length;

  return (
    <div className="puzzle-select-view">
      {progressError && (
        <div className="save-error-banner" role="alert">
          <span>{progressError}</span>
          <button onClick={onDismissError} aria-label="Dismiss save error"><X size={15} /></button>
        </div>
      )}
      <section className="puzzle-select-screen">
        {accountControl}
        <button
          className="puzzle-select-back"
          onClick={() => difficulty ? setDifficulty(undefined) : onBack()}
        >
          <ArrowLeft size={17} />
          {difficulty ? "Difficulties" : "Play menu"}
        </button>
        <p className="eyebrow">DIVINE PUZZLES</p>
        {!difficulty ? (
          <>
            <h1>Choose a difficulty</h1>
            <p className="puzzle-select-intro">
              Solve Divine tactics, face unusual rule-bending challenges, or checkmate two rivals on the three-player boards.
            </p>
            <div className="puzzle-difficulty-grid">
              {([
                {
                  id: "daily",
                  title: "Daily",
                  description: "Recreate the finish found by a level 10 simulation.",
                  icon: Sparkles,
                },
                {
                  id: "easy",
                  title: "Easy",
                  description: "Win in one divine turn.",
                  icon: Crosshair,
                },
                {
                  id: "medium",
                  title: "Medium",
                  description: "Build a winning line across two divine turns.",
                  icon: Crosshair,
                },
                {
                  id: "hard",
                  title: "Hard",
                  description: "Build a winning line across three divine turns.",
                  icon: Crosshair,
                },
                {
                  id: "three-player",
                  title: "Three Player",
                  description: "Checkmate both rivals in two divine turns.",
                  icon: Users,
                },
                {
                  id: "challenges",
                  title: "Challenges",
                  description: "Bend the normal rules against level 10 Divine AI.",
                  icon: Trophy,
                },
              ] as const).map((option) => {
                const puzzles = option.id === "challenges"
                  ? CHALLENGES
                  : option.id === "daily"
                    ? dailyPuzzle ? [dailyPuzzle] : []
                  : option.id === "three-player"
                  ? THREE_PLAYER_PUZZLES
                  : PUZZLES.filter((puzzle) => puzzle.difficulty === option.id);
                const completed = option.id === "challenges"
                  ? CHALLENGES.filter((challenge) =>
                    completedChallenges.has(challenge.id)
                  ).length
                  : puzzles.filter((puzzle) =>
                    completedPuzzles.has(puzzle.id as PuzzleId)
                  ).length;
                const Icon = option.icon;
                return (
                  <button
                    className="puzzle-difficulty-card"
                    key={option.id}
                    onClick={() => setDifficulty(option.id)}
                  >
                    <Icon size={28} />
                    <strong>{option.title}</strong>
                    <span>{option.description}</span>
                    <small>{progressLoading ? "Loading progress" : `${completed} of ${puzzles.length} completed`}</small>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <h1>
              {difficulty === "easy"
                ? "Easy puzzles"
                : difficulty === "medium"
                  ? "Medium puzzles"
                  : difficulty === "hard"
                    ? "Hard puzzles"
                      : difficulty === "daily"
                        ? "Daily puzzle"
                      : difficulty === "three-player"
                        ? "Three Player puzzles"
                        : "Special challenges"}
            </h1>
            <p className="puzzle-select-intro">
              {progressLoading
                ? "Loading completion history..."
                : difficulty === "challenges"
                    ? `${completedChallenges.size} of ${CHALLENGES.length} challenges completed`
                    : difficulty === "daily"
                      ? dailyPuzzle
                        ? completedPuzzles.has(dailyPuzzle.id)
                          ? "The current Daily is complete"
                          : "Recreate the current Daily simulation finish"
                        : "No daily puzzle is available yet"
                    : `${completedInDifficulty} of ${visiblePuzzles.length} positions completed`}
            </p>
            <div className="puzzle-select-grid">
              {difficulty === "challenges"
                ? CHALLENGES.map((challenge, index) => {
                    const completed = completedChallenges.has(challenge.id);
                    return (
                      <button
                        className={`puzzle-select-card challenge-select-card${completed ? " completed" : ""}`}
                        key={challenge.id}
                        onClick={() => onStartChallenge(challenge.id)}
                        aria-label={`Challenge ${index + 1}, ${challenge.title}${completed ? ", completed" : ""}`}
                      >
                        {completed && (
                          <span className="puzzle-complete-badge" aria-hidden="true">
                            <Check size={22} strokeWidth={3} />
                          </span>
                        )}
                        <span>CHALLENGE {index + 1}</span>
                        <strong>{challenge.title}</strong>
                        <small>{challenge.description}</small>
                      </button>
                    );
                })
                : visiblePuzzles.map((puzzle) => {
                const index = difficulty === "daily"
                  ? 0
                  : difficulty === "three-player"
                  ? visiblePuzzles.findIndex((candidate) => candidate.id === puzzle.id)
                  : PUZZLES.findIndex((candidate) => candidate.id === puzzle.id);
                const completed = completedPuzzles.has(puzzle.id);
                return (
                  <button
                    className={`puzzle-select-card${completed ? " completed" : ""}`}
                    key={puzzle.id}
                    onClick={() => onStartPuzzle(puzzle.id)}
                    aria-label={difficulty === "daily"
                      ? `Daily puzzle, ${puzzle.title}${completed ? ", completed" : ""}`
                      : `Puzzle ${index + 1}, ${puzzle.title}${completed ? ", completed" : ""}`}
                  >
                    {completed && (
                      <span className="puzzle-complete-badge" aria-hidden="true">
                        <Check size={22} strokeWidth={3} />
                      </span>
                    )}
                    <span>{difficulty === "daily" ? "DAILY" : `PUZZLE ${index + 1}`}</span>
                    <strong>{puzzle.title}</strong>
                    <small>
                      {difficulty === "daily"
                        ? puzzle.objective
                        : difficulty === "three-player"
                        ? "Checkmate both rivals in two divine turns"
                        : `Win in ${puzzle.playerTurns === 1 ? "one" : puzzle.playerTurns === 2 ? "two" : "three"} divine turn${puzzle.playerTurns === 1 ? "" : "s"}`}
                    </small>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function GraveyardModal({
  state,
  color,
  onClose,
}: {
  state: GameState;
  color: Color;
  onClose: () => void;
}) {
  const player = state.players[color];
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="graveyard-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="close-button" onClick={onClose} aria-label="Close graveyard"><X size={20} /></button>
        <div className="graveyard-icon"><Skull size={27} /></div>
        <p className="eyebrow">{colorLabel(color)} PANTHEON</p>
        <h2>{player.name}’s graveyard</h2>
        <p>{player.graveyard.length
          ? `${player.graveyard.length} piece${player.graveyard.length === 1 ? "" : "s"} lost from the board.`
          : "No pieces have entered this graveyard."}</p>
        {player.graveyard.length > 0 && (
          <div className="graveyard-grid">
            {player.graveyard.map(({ piece, capturedOnTurn }) => (
              <article className="graveyard-piece" key={piece.id}>
                <PieceView piece={piece} />
                <strong>{PIECE_NAMES[piece.type]}</strong>
                <small>Captured turn {capturedOnTurn}</small>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function GameScreen({
  state,
  dispatch,
  onRestart,
  onRestartPuzzle,
  onNextPuzzle,
  inputDisabled = false,
  opponentColor,
  onlineRoomCode,
  onlineError,
  undoEnabled,
  canUndo,
  onUndo,
  onOpenSettings,
  onLeave,
  leaveLabel,
  onQuitWithoutSaving,
  moveFirstDisabled = false,
}: {
  state: GameState;
  dispatch: GameDispatch;
  onRestart: () => void;
  onRestartPuzzle: () => void;
  onNextPuzzle: () => void;
  inputDisabled?: boolean;
  opponentColor?: Color;
  onlineRoomCode?: string;
  onlineError?: string;
  undoEnabled: boolean;
  canUndo: boolean;
  onUndo: () => void;
  onOpenSettings: () => void;
  onLeave?: () => void;
  leaveLabel?: string;
  onQuitWithoutSaving?: () => void;
  moveFirstDisabled?: boolean;
}) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [puzzleHintOpen, setPuzzleHintOpen] = useState(false);
  const [inspectedGodId, setInspectedGodId] = useState<GodId>();
  const [inspectedSquare, setInspectedSquare] = useState<Square>();
  const [moveFirstDraft, setMoveFirstDraft] = useState<MoveFirstDraft>();
  const [graveyardColor, setGraveyardColor] = useState<Color>();
  const gameFinished = !state.puzzleId && state.phase === "gameover";
  const showGameResult =
    gameFinished && state.gameMode !== "simulation";
  const [resultOpen, setResultOpen] = useState(showGameResult);
  const kingInCheck = state.phase === "play" && isInCheck(state.board, state.activeColor, state.bananas);
  const dailyPuzzle = state.puzzleId
    ? DAILY_PUZZLE_BY_ID[state.puzzleId as keyof typeof DAILY_PUZZLE_BY_ID]
    : undefined;
  const puzzle = dailyPuzzle ??
    (state.puzzleId
      ? PUZZLE_BY_ID[state.puzzleId as keyof typeof PUZZLE_BY_ID]
      : undefined);
  const challenge = state.challengeId
    ? CHALLENGE_BY_ID[state.challengeId]
    : undefined;
  const difficultyPuzzles = puzzle && !dailyPuzzle
    ? PUZZLES.filter((candidate) => candidate.difficulty === puzzle.difficulty)
    : [];
  const puzzleIndex = puzzle
    ? difficultyPuzzles.findIndex((candidate) => candidate.id === puzzle.id)
    : -1;
  const puzzleSolved = dailyPuzzle
    ? dailyPuzzleResultMatches(dailyPuzzle, state)
    : Boolean(
      puzzle &&
      state.phase === "gameover" &&
      state.winner &&
      state.winner !== state.aiColor,
    );
  const puzzleFailed = Boolean(
    puzzle &&
    (
      state.puzzleFailed ||
      (dailyPuzzle && state.phase === "gameover" && !puzzleSolved)
    ) &&
    (
      state.phase === "gameover" ||
      state.activeColor !== state.aiColor
    ),
  );
  const winningKingCaptureId = puzzleSolved
    ? [...(state.captureAnimations ?? [])]
      .reverse()
      .find((event) => event.piece.type === "king" && event.player === state.aiColor)?.id
    : undefined;
  const [puzzleVictoryReady, setPuzzleVictoryReady] = useState(false);
  const [displayedOrbs, setDisplayedOrbs] = useState<OrbTotals>(() => orbTotals(state));
  const [orbFlights, setOrbFlights] = useState<OrbFlight[]>([]);
  const [arrivingOrbs, setArrivingOrbs] = useState<Set<string>>(() => new Set());
  const [displayedGraveyards, setDisplayedGraveyards] = useState<Record<Color, number>>(() => ({
    white: state.players.white.graveyard.length,
    black: state.players.black.graveyard.length,
  }));
  const [captureFlights, setCaptureFlights] = useState<CaptureFlight[]>([]);
  const [arrivingGraveyards, setArrivingGraveyards] = useState<Set<Color>>(() => new Set());
  const [opponentPresentation, setOpponentPresentation] = useState<ActionPresentation>();
  const processedOrbAnimations = useRef(new Set((state.orbAnimations ?? []).map((event) => event.id)));
  const processedCaptureAnimations = useRef(new Set((state.captureAnimations ?? []).map((event) => event.id)));
  const pendingOrbArrivals = useRef<Record<string, number>>({});
  const pendingCaptureArrivals = useRef<Record<Color, Set<number>>>({
    white: new Set(),
    black: new Set(),
  });
  const latestOrbTotals = useRef(orbTotals(state));
  const latestGraveyardTotals = useRef<Record<Color, number>>({
    white: state.players.white.graveyard.length,
    black: state.players.black.graveyard.length,
  });
  const animationTimers = useRef<number[]>([]);
  const previousPieceSquares = useRef(new Map(
    Object.entries(state.board).map(([square, piece]) => [piece.id, square]),
  ));
  const orbAnimationKey = (state.orbAnimations ?? []).map((event) => event.id).join(",");
  const captureAnimationKey = (state.captureAnimations ?? []).map((event) => event.id).join(",");
  const boardPositionKey = Object.entries(state.board)
    .map(([square, piece]) => `${piece.id}:${square}`)
    .sort()
    .join(",");
  const moveFirstEnabled =
    !moveFirstDisabled &&
    !inputDisabled &&
    !gameFinished &&
    !opponentPresentation &&
    canStartClassicMoveFirst(state);
  const moveFirstSources = useMemo(
    () => new Set(moveFirstEnabled ? classicMoveFirstSources(state) : []),
    [moveFirstEnabled, state],
  );
  const moveFirstTargets = useMemo(
    () => moveFirstDraft && moveFirstEnabled
      ? classicMoveFirstTargets(state, moveFirstDraft.source)
      : [],
    [moveFirstDraft, moveFirstEnabled, state],
  );
  const moveFirstAbilityCandidates = useMemo(
    () => moveFirstDraft?.destination && moveFirstEnabled
      ? classicMoveFirstCandidates(state, {
        from: moveFirstDraft.source,
        to: moveFirstDraft.destination,
      })
      : [],
    [moveFirstDraft, moveFirstEnabled, state],
  );

  useEffect(() => () => {
    animationTimers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    if (state.phase === "upgrade") setInspectedGodId(undefined);
  }, [state.activeColor, state.phase]);

  useEffect(() => {
    if (!moveFirstEnabled) setMoveFirstDraft(undefined);
  }, [
    moveFirstEnabled,
    state.activeColor,
    state.board,
    state.phase,
    state.turn,
  ]);

  useEffect(() => {
    setPuzzleHintOpen(false);
  }, [state.puzzleId]);

  useEffect(() => {
    setResultOpen(showGameResult);
  }, [showGameResult]);

  useEffect(() => {
    setPuzzleVictoryReady(false);
    if (!puzzleSolved) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPuzzleVictoryReady(true);
      return;
    }
    const timer = window.setTimeout(() => setPuzzleVictoryReady(true), 1050);
    return () => window.clearTimeout(timer);
  }, [puzzleSolved, state.puzzleId, winningKingCaptureId]);

  useEffect(() => {
    const event = state.presentation;
    if (!event || event.color !== opponentColor) {
      setOpponentPresentation(undefined);
      return;
    }
    setInspectedGodId(undefined);
    setOpponentPresentation(event);
    const duration = event.kind === "upgrade"
      ? 2400
      : event.kind === "upgrade-preview"
        ? 2000
        : event.kind === "ability"
          ? 1600
          : event.kind === "god"
            ? 1300
            : 1000;
    const timer = window.setTimeout(() => {
      setOpponentPresentation((current) => current?.id === event.id ? undefined : current);
    }, duration);
    return () => window.clearTimeout(timer);
  }, [opponentColor, state.presentation?.id]);

  useLayoutEffect(() => {
    const current = new Map(Object.entries(state.board).map(([square, piece]) => [piece.id, square]));
    const previous = previousPieceSquares.current;
    previousPieceSquares.current = current;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    for (const [pieceId, destination] of current) {
      const source = previous.get(pieceId);
      if (!source || source === destination) continue;
      const sourceElement = document.querySelector<HTMLElement>(`[data-square="${source}"]`);
      const destinationElement = document.querySelector<HTMLElement>(`[data-square="${destination}"]`);
      const pieceElement = destinationElement?.querySelector<HTMLElement>(`[data-piece-id="${pieceId}"]`);
      if (!sourceElement || !destinationElement || !pieceElement) continue;
      const sourceRect = sourceElement.getBoundingClientRect();
      const destinationRect = destinationElement.getBoundingClientRect();
      const deltaX = sourceRect.left + sourceRect.width / 2 -
        (destinationRect.left + destinationRect.width / 2);
      const deltaY = sourceRect.top + sourceRect.height / 2 -
        (destinationRect.top + destinationRect.height / 2);
      const travel = Math.hypot(deltaX, deltaY);
      pieceElement.animate(
        [
          { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
          { transform: "translate3d(0, 0, 0)" },
        ],
        {
          duration: Math.min(700, 360 + travel * .35),
          easing: "cubic-bezier(.22, .8, .2, 1)",
        },
      );
    }
  }, [boardPositionKey]);

  useLayoutEffect(() => {
    const actualTotals = orbTotals(state);
    latestOrbTotals.current = actualTotals;
    const newEvents = (state.orbAnimations ?? []).filter((event) => !processedOrbAnimations.current.has(event.id));
    newEvents.forEach((event) => processedOrbAnimations.current.add(event.id));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplayedOrbs(actualTotals);
      return;
    }

    const flights = newEvents.flatMap((event): OrbFlight[] => {
      const source = document.querySelector<HTMLElement>(`[data-square="${event.source}"]`);
      const target = document.querySelector<HTMLElement>(`[data-orb-target="${orbTargetKey(event.player, event.orb)}"]`);
      if (!source || !target) return [];
      const sourceRect = source.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const startX = sourceRect.left + sourceRect.width / 2;
      const startY = sourceRect.top + sourceRect.height / 2;
      const deltaX = targetRect.left + targetRect.width / 2 - startX;
      const deltaY = targetRect.top + targetRect.height / 2 - startY;
      return [{
        ...event,
        startX,
        startY,
        deltaX,
        deltaY,
      }];
    });
    const animatedIds = new Set(flights.map((flight) => flight.id));

    setDisplayedOrbs((current) => {
      const next = {
        white: { ...current.white },
        black: { ...current.black },
      };
      for (const player of ["white", "black"] as const) {
        for (const orb of ["white", "black"] as const) {
          const key = orbTargetKey(player, orb);
          if (!pendingOrbArrivals.current[key]) next[player][orb] = actualTotals[player][orb];
        }
      }
      for (const event of newEvents) {
        if (!animatedIds.has(event.id)) continue;
        const key = orbTargetKey(event.player, event.orb);
        pendingOrbArrivals.current[key] = event.id;
        next[event.player][event.orb] = event.total - event.amount;
      }
      return next;
    });

    if (!flights.length) return;
    setOrbFlights((current) => [...current, ...flights]);

    const arrivalTimer = window.setTimeout(() => {
      const arriving = new Set<string>();
      setDisplayedOrbs((current) => {
        const next = {
          white: { ...current.white },
          black: { ...current.black },
        };
        for (const event of flights) {
          const key = orbTargetKey(event.player, event.orb);
          if (pendingOrbArrivals.current[key] !== event.id) continue;
          next[event.player][event.orb] = latestOrbTotals.current[event.player][event.orb];
          delete pendingOrbArrivals.current[key];
          arriving.add(key);
        }
        return next;
      });
      if (arriving.size) setArrivingOrbs((current) => new Set([...current, ...arriving]));
    }, 780);

    const cleanupTimer = window.setTimeout(() => {
      const ids = new Set(flights.map((flight) => flight.id));
      const keys = new Set(flights.map((flight) => orbTargetKey(flight.player, flight.orb)));
      setOrbFlights((current) => current.filter((flight) => !ids.has(flight.id)));
      setArrivingOrbs((current) => new Set([...current].filter((key) => !keys.has(key))));
    }, 1050);

    animationTimers.current.push(arrivalTimer, cleanupTimer);
  }, [
    orbAnimationKey,
    state.players.white.orbs.white,
    state.players.white.orbs.black,
    state.players.black.orbs.white,
    state.players.black.orbs.black,
  ]);

  useLayoutEffect(() => {
    const actualTotals = {
      white: state.players.white.graveyard.length,
      black: state.players.black.graveyard.length,
    };
    latestGraveyardTotals.current = actualTotals;
    const newEvents = (state.captureAnimations ?? [])
      .filter((event) => !processedCaptureAnimations.current.has(event.id));
    newEvents.forEach((event) => processedCaptureAnimations.current.add(event.id));

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplayedGraveyards(actualTotals);
      return;
    }

    const flights = newEvents.flatMap((event): CaptureFlight[] => {
      const source = document.querySelector<HTMLElement>(`[data-square="${event.source}"]`);
      const target = document.querySelector<HTMLElement>(`[data-graveyard-target="${event.player}"]`);
      if (!source || !target) return [];
      const sourceRect = source.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const startX = sourceRect.left + sourceRect.width / 2;
      const startY = sourceRect.top + sourceRect.height / 2;
      return [{
        ...event,
        startX,
        startY,
        deltaX: targetRect.left + targetRect.width / 2 - startX,
        deltaY: targetRect.top + targetRect.height / 2 - startY,
      }];
    });
    const animatedIds = new Set(flights.map((flight) => flight.id));

    setDisplayedGraveyards((current) => {
      const next = { ...current };
      for (const color of ["white", "black"] as const) {
        if (!pendingCaptureArrivals.current[color].size) next[color] = actualTotals[color];
      }
      for (const event of newEvents) {
        if (!animatedIds.has(event.id)) continue;
        pendingCaptureArrivals.current[event.player].add(event.id);
        next[event.player] = Math.min(next[event.player], event.total - 1);
      }
      return next;
    });

    if (!flights.length) return;
    setCaptureFlights((current) => [...current, ...flights]);

    const arrivalTimer = window.setTimeout(() => {
      const arriving = new Set<Color>();
      setDisplayedGraveyards((current) => {
        const next = { ...current };
        for (const event of flights) {
          pendingCaptureArrivals.current[event.player].delete(event.id);
          if (pendingCaptureArrivals.current[event.player].size) continue;
          next[event.player] = latestGraveyardTotals.current[event.player];
          arriving.add(event.player);
        }
        return next;
      });
      if (arriving.size) setArrivingGraveyards((current) => new Set([...current, ...arriving]));
    }, 760);

    const cleanupTimer = window.setTimeout(() => {
      const ids = new Set(flights.map((flight) => flight.id));
      const players = new Set(flights.map((flight) => flight.player));
      setCaptureFlights((current) => current.filter((flight) => !ids.has(flight.id)));
      setArrivingGraveyards((current) => new Set([...current].filter((color) => !players.has(color))));
    }, 1000);

    animationTimers.current.push(arrivalTimer, cleanupTimer);
  }, [
    captureAnimationKey,
    state.players.white.graveyard.length,
    state.players.black.graveyard.length,
  ]);

  const gameDispatch: GameDispatch = (action) => {
    if (gameFinished) return;
    setMoveFirstDraft(undefined);
    dispatch(action);
  };
  const handleGodClick = (godId: GodId, color: Color) => {
    if (gameFinished) {
      setInspectedGodId(godId);
      return;
    }
    if (state.phase === "upgrade") {
      setInspectedGodId(godId);
      return;
    }
    if (
      color === state.activeColor &&
      !isClassicGodResting(state, color, godId)
    ) {
      setInspectedGodId(undefined);
      gameDispatch({ type: "select-god", godId });
      return;
    }
    setInspectedGodId(godId);
  };
  const handleMoveFirstSquare = (square: Square) => {
    if (!moveFirstEnabled) return;
    setInspectedGodId(undefined);
    setOpponentPresentation(undefined);
    setMoveFirstDraft((current) => {
      if (!current) {
        return moveFirstSources.has(square) ? { source: square } : undefined;
      }
      if (square === current.source) return undefined;
      if (moveFirstTargets.includes(square)) {
        return { source: current.source, destination: square };
      }
      return moveFirstSources.has(square) ? { source: square } : current;
    });
  };
  const commitMoveFirst = (candidate: ClassicMoveFirstCandidate) => {
    if (!candidate.valid) return;
    setMoveFirstDraft(undefined);
    dispatch({
      type: "commit-move-first",
      godId: candidate.godId,
      abilityId: candidate.abilityId,
      move: candidate.move,
      expectedActor: state.activeColor,
      expectedTurn: state.turn,
    });
  };
  return (
    <main className={`game-page ${puzzle ? "puzzle-mode" : ""} ${challenge ? "challenge-mode" : ""} ${state.lastAction ? "has-last-action" : ""} ${gameFinished ? "finished-view" : ""} ${inputDisabled || opponentPresentation ? "input-locked" : ""}`}>
      <header className="topbar">
        <Brand />
        <div className="game-meta" data-tutorial="round-and-turn">
          <span>ROUND <strong>{state.round}</strong></span>
          <i />
          <span>TURN <strong>{state.turn}</strong></span>
          {onlineRoomCode && <><i /><span>ROOM <strong>{onlineRoomCode}</strong></span></>}
        </div>
        <div className="header-actions" data-tutorial="match-controls">
          {state.gameMode !== "puzzle" && (
            <button
              onClick={onUndo}
              disabled={!canUndo}
              title={undoEnabled ? "Undo the latest completed turn or upgrade" : "Enable undo in Settings"}
            >
              <Undo2 size={18} />
              <span>Undo</span>
            </button>
          )}
          <button onClick={() => setHistoryOpen(!historyOpen)}><History size={18} /><span>History</span></button>
          <button onClick={onRestart}>
            <RotateCcw size={18} />
            <span>{puzzle ? "Puzzles" : challenge ? "Restart" : "New game"}</span>
          </button>
        </div>
      </header>

      {puzzle && (
        <section className="puzzle-banner">
          <div className="puzzle-banner-title">
            <Crosshair size={18} />
            <span>
              {dailyPuzzle
                ? `DAILY · ${dailyPuzzle.playerTurns} TURN${dailyPuzzle.playerTurns === 1 ? "" : "S"}`
                : `PUZZLE ${puzzleIndex + 1} OF ${difficultyPuzzles.length}`}
            </span>
            <strong>{puzzle.title}</strong>
          </div>
          <p>{puzzle.objective}</p>
          <div className="puzzle-banner-actions">
            <button onClick={() => setPuzzleHintOpen((open) => !open)}>
              <Info size={15} />
              {puzzleHintOpen ? "Hide hint" : "Show hint"}
            </button>
            <button onClick={onRestartPuzzle}><RotateCcw size={15} />Restart</button>
          </div>
          {puzzleHintOpen && <small>{puzzle.hint}</small>}
        </section>
      )}
      {challenge && (
        <section className="puzzle-banner challenge-banner">
          <div className="puzzle-banner-title">
            <Trophy size={18} />
            <span>SPECIAL CHALLENGE</span>
            <strong>{challenge.title}</strong>
          </div>
          <p>{challenge.description}</p>
          <div className="puzzle-banner-actions">
            <button onClick={onRestart}>
              <RotateCcw size={15} />
              Restart
            </button>
          </div>
        </section>
      )}

      {onlineError && (
        <div className="connection-warning">
          <Wifi size={16} />
          <strong>Connection lost.</strong>
          <span>{onlineError}</span>
          <button onClick={onRestart}>Return to game setup</button>
        </div>
      )}
      <div
        className={`turn-notice ${kingInCheck ? "check" : ""}`}
        data-tutorial="turn-guidance"
      >
        <span className={`turn-dot ${state.activeColor}`} />
        <strong>{colorLabel(state.activeColor)}</strong>
        <p>
          {kingInCheck
            ? `Your King is in check. Move the King, capture the attacker, or block the attack. ${state.notice}`
            : inputDisabled
              ? `${state.players[state.activeColor].name} is choosing...`
              : state.notice}
        </p>
      </div>
      {state.lastAction && (
        <div className="last-action-notice" aria-live="polite">
          <Swords size={15} />
          <span>Last action</span>
          <strong>{state.lastAction}</strong>
        </div>
      )}

      <div className="game-layout">
        <div className="piece-info-column" data-layout-area="piece-inspector">
          <SquareInfoPanel
            state={state}
            square={inspectedSquare}
            onClose={() => setInspectedSquare(undefined)}
          />
        </div>
        <section className="board-column">
          <PlayerBar
            state={state}
            color="black"
            onGodClick={handleGodClick}
            onGraveyardClick={setGraveyardColor}
            displayedOrbs={displayedOrbs.black}
            arrivingOrbs={arrivingOrbs}
            displayedGraveyardCount={displayedGraveyards.black}
            graveyardArriving={arrivingGraveyards.has("black")}
          />
          <ChessBoard
            state={state}
            dispatch={gameDispatch}
            onInspectSquare={setInspectedSquare}
            moveFirstDraft={moveFirstDraft}
            moveFirstTargets={moveFirstDraft ? moveFirstTargets : []}
            onMoveFirstSquare={moveFirstEnabled ? handleMoveFirstSquare : undefined}
          />
          <PlayerBar
            state={state}
            color="white"
            onGodClick={handleGodClick}
            onGraveyardClick={setGraveyardColor}
            displayedOrbs={displayedOrbs.white}
            arrivingOrbs={arrivingOrbs}
            displayedGraveyardCount={displayedGraveyards.white}
            graveyardArriving={arrivingGraveyards.has("white")}
          />
        </section>
        <div className="side-column" data-tutorial="divine-actions">
          {state.phase === "upgrade" ? (
            <UpgradePanel
              state={state}
              dispatch={gameDispatch}
              selectedGodId={inspectedGodId}
              presentation={opponentPresentation}
              onCloseGod={() => {
                setInspectedGodId(undefined);
                gameDispatch({ type: "preview-upgrade" });
              }}
            />
          ) : (
            <ActionPanel
              state={state}
              dispatch={gameDispatch}
              inspectedGodId={inspectedGodId}
              presentation={opponentPresentation}
              onInspectGod={setInspectedGodId}
              onCloseInspection={() => setInspectedGodId(undefined)}
              moveFirstDraft={moveFirstDraft}
              moveFirstCandidates={moveFirstAbilityCandidates}
              onCancelMoveFirst={() => setMoveFirstDraft(undefined)}
              onCommitMoveFirst={commitMoveFirst}
            />
          )}
          <div className="side-square-info" data-layout-fallback="piece-inspector">
            <SquareInfoPanel
              state={state}
              square={inspectedSquare}
              onClose={() => setInspectedSquare(undefined)}
            />
          </div>
        </div>
      </div>

      {orbFlights.map((flight) => (
        <div
          className={`orb-flight ${flight.orb}`}
          style={{
            left: `${flight.startX}px`,
            top: `${flight.startY}px`,
            "--orb-flight-x": `${flight.deltaX}px`,
            "--orb-flight-y": `${flight.deltaY}px`,
          } as React.CSSProperties}
          key={flight.id}
          aria-hidden="true"
        >
          <span className="orb-flight-path">
            <span className="orb-flight-badge">
              <span className={`orb ${flight.orb}`} />
              <b>+{flight.amount}</b>
            </span>
          </span>
        </div>
      ))}
      {captureFlights.map((flight) => (
        <div
          className="capture-flight"
          style={{
            left: `${flight.startX}px`,
            top: `${flight.startY}px`,
            "--capture-flight-x": `${flight.deltaX}px`,
            "--capture-flight-y": `${flight.deltaY}px`,
          } as React.CSSProperties}
          key={flight.id}
          aria-hidden="true"
        >
          <span className="capture-flight-path">
            <span className={`capture-flight-piece ${flight.piece.color}`}>
              {PIECES[flight.piece.color][flight.piece.type]}
            </span>
          </span>
        </div>
      ))}
      {historyOpen && (
        <aside className="history-drawer">
          <div><h3><History size={18} /> Chronicle</h3><button onClick={() => setHistoryOpen(false)}><X size={18} /></button></div>
          {state.history.map((entry, index) => (
            <p key={`${entry}-${index}`}><span>{index + 1}</span>{entry}</p>
          ))}
        </aside>
      )}
      {graveyardColor && (
        <GraveyardModal state={state} color={graveyardColor} onClose={() => setGraveyardColor(undefined)} />
      )}
      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
      <MatchEscapeMenu
        onOpenRules={() => setRulesOpen(true)}
        onOpenSettings={state.gameMode === "puzzle"
          ? undefined
          : onOpenSettings}
        onLeave={onLeave}
        leaveLabel={leaveLabel}
        onQuitWithoutSaving={onQuitWithoutSaving}
      />
      {puzzleSolved && puzzleVictoryReady && puzzle && (
        <div className="modal-backdrop">
          <section className="gameover-modal">
            <div className="victory-crown"><Crown size={38} /></div>
            <p className="eyebrow">PUZZLE SOLVED</p>
            <h2>{puzzle.title}</h2>
            <p>
              {dailyPuzzle
                ? dailyPuzzle.completionText
                : "You found a winning line and captured the opposing King."}
            </p>
            <div className="puzzle-result-actions">
              <button className="primary-button" onClick={onNextPuzzle}>
                {dailyPuzzle || puzzleIndex === difficultyPuzzles.length - 1
                  ? "Choose another puzzle"
                  : "Next puzzle"}
              </button>
              <button className="secondary-button" onClick={onRestartPuzzle}>Play again</button>
            </div>
          </section>
        </div>
      )}
      {puzzleFailed && puzzle && (
        <div className="modal-backdrop">
          <section className="gameover-modal">
            <div className="victory-crown"><Crosshair size={38} /></div>
            <p className="eyebrow">WINNING LINE MISSED</p>
            <h2>Try the position again</h2>
            <p>
              {dailyPuzzle
                ? "The required simulation result was not reached within the turn limit. Retry from the checkpoint and look for a stronger continuation."
                : "The level 10 Divine AI found its best response. Use the hint or restart from the original position."}
            </p>
            <div className="puzzle-result-actions">
              <button className="primary-button" onClick={onRestartPuzzle}>Retry puzzle</button>
              <button className="secondary-button" onClick={onRestart}>Choose another puzzle</button>
            </div>
          </section>
        </div>
      )}
      {showGameResult && (
        <GameResultPresentation
          open={resultOpen}
          eyebrow="THE DIVINE GAME ENDS"
          title={state.result?.kind === "draw"
            ? "Draw by stalemate"
            : state.winner
              ? `${colorLabel(state.winner)} is victorious`
              : "The battle is over"}
          description={state.result?.kind === "winner" &&
              state.result.reason === "checkmate"
            ? `${state.players[state.result.winner].name} delivered checkmate.`
            : state.winner
              ? `${state.players[state.winner].name} has conquered the opposing pantheon.`
              : "The active pantheon has no complete legal turn while its King is safe."}
          newGameLabel={
            state.challengeId ? "Retry challenge" : "Begin a new game"
          }
          undoEnabled={undoEnabled}
          canUndo={canUndo}
          onOpenChange={setResultOpen}
          onUndo={onUndo}
          onOpenUndoSettings={onOpenSettings}
          onNewGame={onRestart}
        />
      )}
    </main>
  );
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: "Welcome to God Chess",
    body: "Every turn combines familiar chess movement with one divine ability. This short tour shows where to find the information you need before you make your first move.",
  },
  {
    title: "Follow the turn prompt",
    body: "This banner names the active side and tells you what the game is waiting for. If your King is in check or an ability needs another choice, the instruction appears here.",
    target: "turn-guidance",
  },
  {
    title: "Track rounds and turns",
    body: "A round ends only after all six drafted gods—three for each side—have each completed one action. Then both players upgrade one ability before the next round begins.",
    target: "round-and-turn",
    cardSide: "left",
  },
  {
    title: "Read your opponent",
    body: "The upper player bar shows your opponent’s orb supply, captured pieces, and drafted gods. After a god acts, that god rests for the remainder of the round and returns when the next round begins.",
    target: "opponent-status",
  },
  {
    title: "Move on the board",
    body: "Pieces follow normal chess movement. Select a piece and then a highlighted destination. Capturing the opposing King wins immediately—there is no checkmate requirement.",
    target: "board",
    cardSide: "left",
  },
  {
    title: "Watch your resources",
    body: "Your lower player bar tracks light and dark orbs. Moving and capturing pieces earns orbs based on the squares involved, and abilities spend the amounts shown on their cards.",
    target: "player-status",
    cardSide: "left",
  },
  {
    title: "Choose a god and ability",
    body: "The Divine Action panel contains your available gods and their abilities. Select a non-resting god, review its cards and costs, then follow the highlighted board choices. You may back out before committing.",
    target: "divine-actions",
    cardSide: "left",
  },
  {
    title: "Use the match controls",
    body: "History reviews completed actions, Settings controls options such as undo, and Save & quit preserves local matches so you can continue later. Open the pause menu for Rules or to leave the match.",
    target: "match-controls",
    cardSide: "left",
  },
  {
    title: "Now take a practice round",
    body: "Next, you will use each of your three gods once while the Divine Rival responds automatically. Your guided moves will earn the exact orbs needed to upgrade and unleash Chiron’s Charge.",
  },
];

const createTutorialState = () => {
  let tutorialState = createGame(1, { mode: "local" });
  for (const godId of [
    "ares",
    "medusa",
    "midas",
    "anubis",
    "chiron",
    "artemis",
  ] as const) {
    tutorialState = gameReducer(tutorialState, { type: "draft", godId });
  }
  tutorialState = {
    ...tutorialState,
    players: {
      ...tutorialState.players,
      white: {
        ...tutorialState.players.white,
        name: "You",
        orbs: { white: 0, black: 3 },
      },
      black: {
        ...tutorialState.players.black,
        name: "Divine Rival",
        orbs: { white: 3, black: 3 },
      },
    },
  };
  return tutorialState;
};

type TutorialPracticeStep = TutorialPracticePrompt & {
  expected?: Partial<GameAction>;
  autoActions?: GameAction[];
  progress: number;
};

const TUTORIAL_PRACTICE_STEPS: TutorialPracticeStep[] = [
  {
    title: "Call Ares",
    body: "Start the round with Ares. Calling him opens his ability cards; he will rest after the action is complete.",
    instruction: "Select Ares in the Divine Action panel.",
    targetSelector: '[data-god-id="ares"]',
    targetName: "ares",
    cardSide: "left",
    expected: { type: "select-god", godId: "ares" },
    progress: 1,
  },
  {
    title: "Choose Threaten",
    body: "Threaten makes one legal chess move and rewards aggressive positioning. Its card has no orb cost.",
    instruction: "Select Ares’s Threaten ability.",
    targetSelector: '[data-ability-id="threaten"]',
    targetName: "threaten",
    cardSide: "left",
    expected: { type: "select-ability", abilityId: "threaten" },
    progress: 2,
  },
  {
    title: "Choose the pawn",
    body: "The game now highlights pieces that Threaten can move. We will advance the King pawn.",
    instruction: "Select your pawn on e2.",
    targetSelector: '[data-square="e2"]',
    targetName: "e2",
    cardSide: "left",
    expected: { type: "square", square: "e2" },
    progress: 3,
  },
  {
    title: "Advance and earn",
    body: "Landing on e4 makes this pawn your sole farthest-advanced piece, so Threaten generates a light orb.",
    instruction: "Move the pawn to e4.",
    targetSelector: '[data-square="e4"]',
    targetName: "e4",
    cardSide: "left",
    expected: { type: "square", square: "e4" },
    progress: 4,
  },
  {
    title: "The rival answers",
    body: "Ares is now resting for the remainder of round 1. The Divine Rival calls Medusa and advances a pawn with Captivate.",
    blocking: true,
    autoActions: [
      { type: "select-god", godId: "medusa" },
      { type: "select-ability", abilityId: "captivate" },
      { type: "square", square: "e7" },
      { type: "square", square: "e5" },
    ],
    progress: 4,
  },
  {
    title: "Call Anubis",
    body: "Your second action must use a different god because Ares is resting. Anubis can generate the dark orb needed for Charge.",
    instruction: "Select Anubis.",
    targetSelector: '[data-god-id="anubis"]',
    targetName: "anubis",
    cardSide: "left",
    expected: { type: "select-god", godId: "anubis" },
    progress: 5,
  },
  {
    title: "Choose Construction",
    body: "Construction grants one dark orb when its piece moves exactly one square.",
    instruction: "Select Construction.",
    targetSelector: '[data-ability-id="construction"]',
    targetName: "construction",
    cardSide: "left",
    expected: { type: "select-ability", abilityId: "construction" },
    progress: 6,
  },
  {
    title: "Choose the Queen pawn",
    body: "A one-square pawn move will demonstrate Construction’s resource reward.",
    instruction: "Select your pawn on d2.",
    targetSelector: '[data-square="d2"]',
    targetName: "d2",
    cardSide: "left",
    expected: { type: "square", square: "d2" },
    progress: 7,
  },
  {
    title: "Build one square forward",
    body: "Moving to d3 completes Construction and generates your fourth dark orb—the full cost of Charge.",
    instruction: "Move the pawn to d3.",
    targetSelector: '[data-square="d3"]',
    targetName: "d3",
    cardSide: "left",
    expected: { type: "square", square: "d3" },
    progress: 8,
  },
  {
    title: "The rival answers",
    body: "Anubis joins Ares at rest. The Divine Rival uses Midas, leaving Chiron as your final available god this round.",
    blocking: true,
    autoActions: [
      { type: "select-god", godId: "midas" },
      { type: "select-ability", abilityId: "barter" },
      { type: "square", square: "a7" },
      { type: "square", square: "a6" },
    ],
    progress: 8,
  },
  {
    title: "Call Chiron",
    body: "Chiron is your only non-resting god. His free Gallop ability rewards knight movement.",
    instruction: "Select Chiron.",
    targetSelector: '[data-god-id="chiron"]',
    targetName: "chiron",
    cardSide: "left",
    expected: { type: "select-god", godId: "chiron" },
    progress: 9,
  },
  {
    title: "Choose Gallop",
    body: "Gallop moves any piece normally, and moving a knight generates a light orb.",
    instruction: "Select Gallop.",
    targetSelector: '[data-ability-id="gallop"]',
    targetName: "gallop",
    cardSide: "left",
    expected: { type: "select-ability", abilityId: "gallop" },
    progress: 10,
  },
  {
    title: "Choose the knight",
    body: "The knight on g1 has a clear path into the battle.",
    instruction: "Select your knight on g1.",
    targetSelector: '[data-square="g1"]',
    targetName: "g1",
    cardSide: "left",
    expected: { type: "square", square: "g1" },
    progress: 11,
  },
  {
    title: "Gallop to f3",
    body: "This legal knight move completes Chiron’s action and generates another light orb.",
    instruction: "Move the knight to f3.",
    targetSelector: '[data-square="f3"]',
    targetName: "f3",
    cardSide: "left",
    expected: { type: "square", square: "f3" },
    progress: 12,
  },
  {
    title: "The round closes",
    body: "The Divine Rival calls its third and final god. Once Artemis acts, all six drafted gods have acted and round 1 enters the upgrade phase.",
    blocking: true,
    autoActions: [
      { type: "select-god", godId: "artemis" },
      { type: "select-ability", abilityId: "take-cover" },
      { type: "square", square: "b8" },
      { type: "square", square: "c6" },
    ],
    progress: 12,
  },
  {
    title: "Preview Charge’s upgrade",
    body: "Each side upgrades one ability between rounds. Charge level 2 lets a knight retain rook-like movement for two turns.",
    instruction: "Select Chiron’s Charge card.",
    targetSelector: '[data-ability-id="charge"]',
    targetName: "charge-upgrade",
    cardSide: "left",
    expected: { type: "preview-upgrade", godId: "chiron", abilityId: "charge" },
    progress: 13,
  },
  {
    title: "Confirm the upgrade",
    body: "The preview shows the next level before anything is committed.",
    instruction: "Confirm Charge at level 2.",
    targetSelector: ".upgrade-confirmation .primary-button",
    targetName: "confirm-upgrade",
    cardSide: "left",
    expected: { type: "upgrade", abilityId: "charge" },
    progress: 14,
  },
  {
    title: "The gods awaken",
    body: "The rival completes its upgrade. Round 2 begins, every god returns from rest, and your four dark orbs are ready to spend.",
    blocking: true,
    autoActions: [
      { type: "upgrade", abilityId: "captivate" },
    ],
    progress: 14,
  },
  {
    title: "Call Chiron again",
    body: "Rest lasts only until the current round ends, so Chiron is available again immediately in round 2.",
    instruction: "Select Chiron.",
    targetSelector: '[data-god-id="chiron"]',
    targetName: "chiron-round-two",
    cardSide: "left",
    expected: { type: "select-god", godId: "chiron" },
    progress: 15,
  },
  {
    title: "Unleash Charge",
    body: "Charge costs four dark orbs—the amount you assembled during round 1—and lets a knight move like a rook.",
    instruction: "Select the upgraded Charge ability.",
    targetSelector: '[data-ability-id="charge"]',
    targetName: "charge",
    cardSide: "left",
    expected: { type: "select-ability", abilityId: "charge" },
    progress: 16,
  },
  {
    title: "Choose your knight",
    body: "The knight you moved with Gallop is now positioned for a straight-line Charge.",
    instruction: "Select the knight on f3.",
    targetSelector: '[data-square="f3"]',
    targetName: "charge-source",
    cardSide: "left",
    expected: { type: "square", square: "f3" },
    progress: 17,
  },
  {
    title: "Capture with divine movement",
    body: "A normal knight cannot travel straight up the file. Charge changes its movement and allows this capture.",
    instruction: "Charge to f7 and capture the pawn.",
    targetSelector: '[data-square="f7"]',
    targetName: "charge-destination",
    cardSide: "left",
    expected: { type: "square", square: "f7" },
    progress: 18,
  },
  {
    title: "Practice complete",
    body: "You used all three gods, watched them rest until the round ended, generated both orb colors, upgraded an ability, and spent dark orbs on a special power. You are ready to draft your own pantheon.",
    blocking: true,
    complete: true,
    progress: 18,
  },
];

const actionMatchesTutorialExpectation = (
  action: GameAction,
  expected: Partial<GameAction>,
) => Object.entries(expected).every(([key, value]) =>
  (action as unknown as Record<string, unknown>)[key] === value
);

function TutorialScreen({ onExit }: { onExit: () => void }) {
  const [tutorialState, setTutorialState] = useState(createTutorialState);
  const [mode, setMode] = useState<"tour" | "practice">("tour");
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [feedback, setFeedback] = useState<string>();
  const practiceStep = TUTORIAL_PRACTICE_STEPS[practiceIndex];

  useEffect(() => {
    if (mode !== "practice" || !practiceStep.autoActions) return;
    const timer = window.setTimeout(() => {
      setTutorialState((current) =>
        practiceStep.autoActions!.reduce(gameReducer, current)
      );
      setPracticeIndex((current) => current + 1);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [mode, practiceIndex, practiceStep.autoActions]);

  const practiceDispatch: GameDispatch = (action) => {
    const expected = practiceStep.expected;
    if (!expected || !actionMatchesTutorialExpectation(action, expected)) {
      setFeedback(practiceStep.instruction ?? "Follow the highlighted instruction.");
      return;
    }
    setTutorialState((current) => gameReducer(current, action));
    setFeedback(undefined);
    setPracticeIndex((current) => current + 1);
  };

  return (
    <div className="tutorial-stage">
      <GameScreen
        state={tutorialState}
        dispatch={mode === "practice" ? practiceDispatch : () => undefined}
        inputDisabled={mode === "practice" && Boolean(practiceStep.autoActions)}
        moveFirstDisabled
        undoEnabled={false}
        canUndo={false}
        onUndo={() => undefined}
        onOpenSettings={() => undefined}
        onLeave={onExit}
        leaveLabel="Exit tutorial"
        onRestart={onExit}
        onRestartPuzzle={() => undefined}
        onNextPuzzle={() => undefined}
      />
      {mode === "tour" ? (
        <TutorialOverlay
          steps={TUTORIAL_STEPS}
          onExit={onExit}
          onComplete={() => setMode("practice")}
          completeLabel="Start guided practice"
        />
      ) : (
        <TutorialPracticeOverlay
          prompt={practiceStep}
          step={practiceStep.progress}
          totalSteps={18}
          feedback={feedback}
          onExit={onExit}
        />
      )}
    </div>
  );
}

export default function App() {
  const accountService = useAccount();
  useEffect(() => installGlobalDiagnostics(), []);
  const [localSavedGames, setLocalSavedGames] = useState(loadLocalSavedGames);
  const [cloudSavedGames, setCloudSavedGames] = useState<SavedGame[]>([]);
  const [cloudSavesLoadedFor, setCloudSavesLoadedFor] = useState<string>();
  const [savesLoading, setSavesLoading] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [localCompletedPuzzles, setLocalCompletedPuzzles] = useState(loadLocalCompletedPuzzles);
  const [cloudPuzzleProgress, setCloudPuzzleProgress] = useState<{
    userId?: string;
    completed: PuzzleId[];
  }>({ completed: [] });
  const [puzzleProgressLoading, setPuzzleProgressLoading] = useState(false);
  const [localCompletedChallenges, setLocalCompletedChallenges] = useState(
    loadLocalCompletedChallenges,
  );
  const [cloudChallengeProgress, setCloudChallengeProgress] = useState<{
    userId?: string;
    completed: ChallengeId[];
  }>({ completed: [] });
  const [challengeProgressLoading, setChallengeProgressLoading] =
    useState(false);
  const [achievementProgress, setAchievementProgress] = useState(
    loadLocalAchievementProgress,
  );
  const [achievementProgressLoadedFor, setAchievementProgressLoadedFor] =
    useState<string>();
  const [achievementProgressLoading, setAchievementProgressLoading] =
    useState(false);
  const [accountImportWorking, setAccountImportWorking] = useState(false);
  const [accountImportError, setAccountImportError] = useState<string>();
  const savedGames = accountService.account
    ? cloudSavesLoadedFor === accountService.account.userId
      ? cloudSavedGames
      : []
    : localSavedGames;
  const savesHydrating = Boolean(
    accountService.account &&
    cloudSavesLoadedFor !== accountService.account.userId
  );
  const completedPuzzleIds = accountService.account
    ? cloudPuzzleProgress.userId === accountService.account.userId
      ? cloudPuzzleProgress.completed
      : []
    : localCompletedPuzzles;
  const completedPuzzles = new Set(completedPuzzleIds);
  const completedChallengeIds = accountService.account
    ? cloudChallengeProgress.userId === accountService.account.userId
      ? cloudChallengeProgress.completed
      : []
    : localCompletedChallenges;
  const completedChallenges = new Set(completedChallengeIds);
  const accountDataLoading = Boolean(
    accountService.account &&
    (
      cloudSavesLoadedFor !== accountService.account.userId ||
      cloudPuzzleProgress.userId !== accountService.account.userId ||
      cloudChallengeProgress.userId !== accountService.account.userId ||
      achievementProgressLoadedFor !== accountService.account.userId
    )
  );
  const visibleAchievementProgress =
    accountService.account &&
      achievementProgressLoadedFor !== accountService.account.userId
      ? createAchievementProgress()
      : achievementProgress;
  const completedPuzzleCounts = useMemo(
    () =>
      completedPuzzleIds.reduce(
        (result, puzzleId) => {
          const puzzle = PUZZLE_BY_ID[puzzleId as keyof typeof PUZZLE_BY_ID];
          if (puzzle) result[puzzle.difficulty] += 1;
          else if (puzzleId in DAILY_PUZZLE_BY_ID) result.daily += 1;
          return result;
        },
        { easy: 0, medium: 0, hard: 0, daily: 0 },
      ),
    [completedPuzzleIds],
  );
  const savedGamesRef = useRef(savedGames);
  savedGamesRef.current = savedGames;
  const activeSaveId = useRef<string | undefined>(undefined);
  const [startView, setStartView] = useState<"menu" | "roster" | "achievements" | "play" | "load" | "setup" | "three-setup" | "four-setup" | "puzzles" | "tutorial" | "none">("menu");
  const [setupReturnView, setSetupReturnView] = useState<"menu" | "play" | "none">("menu");
  const [setupCategory, setSetupCategory] = useState<StartCategory>("local");
  const [setupPlayerCount, setSetupPlayerCount] = useState<PlayerCount>();
  const [fourPlayerSession, setFourPlayerSession] = useState<FourPlayerSession>();
  const [threePlayerSession, setThreePlayerSession] = useState<ThreePlayerSession>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [undoPreferred, setUndoPreferred] = useState(loadUndoSetting);
  const [undoDepth, setUndoDepth] = useState(0);
  const [state, baseDispatch] = useReducer(gameReducer, undefined, () => createGame());
  const stateRef = useRef(state);
  stateRef.current = state;
  const aiPlan = useRef<GameAction[]>([]);
  const aiNoPlanState = useRef<GameState | undefined>(undefined);
  const aiRequestId = useRef(0);
  const [aiPlanReady, setAiPlanReady] = useState(0);
  const simulationCompletedTurns = useRef<Record<Color, number>>({
    white: 0,
    black: 0,
  });
  const [simulationExport, setSimulationExport] =
    useState<SimulationExportData>();
  const quickDraftPending = useRef(false);
  const undoStack = useRef<GameState[]>([]);
  const undoDepthRef = useRef(0);
  const turnStart = useRef<GameState | undefined>(undefined);
  const cloudSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const cloudAchievementQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    activeSaveId.current = undefined;
    setSaveError(undefined);
    if (!accountService.account) {
      setCloudSavedGames([]);
      setCloudSavesLoadedFor(undefined);
      setSavesLoading(false);
      return;
    }
    let active = true;
    setSavesLoading(true);
    void loadCloudSavedGames(accountService.account.userId)
      .then((games) => {
        if (active) setCloudSavedGames(games);
      })
      .catch((error) => {
        console.error("Unable to load cloud God Chess saves.", error);
        if (active) setSaveError(error instanceof Error ? error.message : "Unable to load cloud saves.");
      })
      .finally(() => {
        if (active) {
          setCloudSavesLoadedFor(accountService.account?.userId);
          setSavesLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [accountService.account?.userId]);

  useEffect(() => {
    const account = accountService.account;
    if (!account) {
      setAchievementProgressLoadedFor(undefined);
      setAchievementProgressLoading(false);
      setAchievementProgress(loadLocalAchievementProgress());
      return;
    }
    let active = true;
    setAchievementProgressLoadedFor(undefined);
    setAchievementProgressLoading(true);
    setAchievementProgress(createAchievementProgress());
    void loadCloudAchievementProgress(account.userId)
      .then((cloudProgress) => {
        if (!active) return;
        setAchievementProgress(cloudProgress);
        setAchievementProgressLoadedFor(account.userId);
      })
      .catch((error) => {
        console.error("Unable to load cloud achievement progress.", error);
        if (active) {
          setAchievementProgress(createAchievementProgress());
          setAchievementProgressLoadedFor(account.userId);
          setSaveError(
            error instanceof Error
              ? error.message
              : "Unable to load achievement progress.",
          );
        }
      })
      .finally(() => {
        if (active) {
          setAchievementProgressLoadedFor(account.userId);
          setAchievementProgressLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [accountService.account?.userId]);

  const saveAchievementProgress = useCallback((
    update: (current: AchievementProgress) => AchievementProgress,
  ) => {
    setAchievementProgress((current) => {
      const next = update(current);
      if (next === current) return current;
      const account = accountService.account;
      if (
        account &&
        achievementProgressLoadedFor === account.userId &&
        !achievementProgressLoading
      ) {
        cloudAchievementQueue.current = cloudAchievementQueue.current
          .then(() => upsertCloudAchievementProgress(account.userId, next))
          .catch((error) => {
            console.error("Unable to save cloud achievement progress.", error);
            setSaveError(
              error instanceof Error
                ? error.message
                : "Unable to save achievement progress.",
            );
          });
      } else if (!account) {
        try {
          persistLocalAchievementProgress(next);
        } catch (error) {
          console.error("Unable to save local achievement progress.", error);
          setSaveError(
            error instanceof Error
              ? error.message
              : "Unable to save achievement progress.",
          );
        }
      }
      return next;
    });
  }, [
    accountService.account,
    achievementProgressLoadedFor,
    achievementProgressLoading,
  ]);

  useEffect(() => {
    const account = accountService.account;
    if (!account) {
      setCloudPuzzleProgress({ completed: [] });
      setPuzzleProgressLoading(false);
      return;
    }
    let active = true;
    setPuzzleProgressLoading(true);
    void loadCloudCompletedPuzzles(account.userId)
      .then((completed) => {
        if (active) setCloudPuzzleProgress({ userId: account.userId, completed });
      })
      .catch((error) => {
        console.error("Unable to load cloud puzzle progress.", error);
        if (active) {
          setSaveError(error instanceof Error ? error.message : "Unable to load puzzle progress.");
          setCloudPuzzleProgress({
            userId: account.userId,
            completed: [],
          });
        }
      })
      .finally(() => {
        if (active) setPuzzleProgressLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accountService.account?.userId]);

  useEffect(() => {
    const account = accountService.account;
    if (!account) {
      setCloudChallengeProgress({ completed: [] });
      setChallengeProgressLoading(false);
      return;
    }
    let active = true;
    setChallengeProgressLoading(true);
    void loadCloudCompletedChallenges(account.userId)
      .then((completed) => {
        if (active) {
          setCloudChallengeProgress({
            userId: account.userId,
            completed,
          });
        }
      })
      .catch((error) => {
        console.error("Unable to load cloud challenge progress.", error);
        if (active) {
          setSaveError(
            error instanceof Error
              ? error.message
              : "Unable to load challenge progress.",
          );
          setCloudChallengeProgress({
            userId: account.userId,
            completed: [],
          });
        }
      })
      .finally(() => {
        if (active) setChallengeProgressLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accountService.account?.userId]);

  useEffect(() => {
    setAccountImportError(undefined);
  }, [accountService.account?.userId]);

  const finishLocalDataImportDecision = useCallback(async (
    importLocalData: boolean,
  ) => {
    const account = accountService.account;
    if (!account || accountImportWorking) return;
    if (accountDataLoading) {
      setAccountImportError(
        "Wait for the account data to finish loading, then try again.",
      );
      return;
    }
    setAccountImportWorking(true);
    setAccountImportError(undefined);
    try {
      if (importLocalData) {
        const cloudSaveIds = new Set(cloudSavedGames.map((game) => game.id));
        const importedSaves = sortSavedGames([
          ...loadLocalSavedGames().filter((game) => !cloudSaveIds.has(game.id)),
          ...cloudSavedGames,
        ]);
        const importedPuzzles = [...new Set([
          ...cloudPuzzleProgress.completed,
          ...loadLocalCompletedPuzzles(),
        ])];
        const importedChallenges = [...new Set([
          ...cloudChallengeProgress.completed,
          ...loadLocalCompletedChallenges(),
        ])];
        const importedAchievements = mergeNormalizedAchievementProgress(
          achievementProgress,
          loadLocalAchievementProgress(),
        );

        await Promise.all([
          ...importedSaves.map((game) =>
            upsertCloudSavedGame(account.userId, game)
          ),
          upsertCloudCompletedPuzzles(account.userId, importedPuzzles),
          upsertCloudCompletedChallenges(account.userId, importedChallenges),
          upsertCloudAchievementProgress(
            account.userId,
            importedAchievements,
          ),
        ]);

        setCloudSavedGames(importedSaves);
        setCloudSavesLoadedFor(account.userId);
        setCloudPuzzleProgress({
          userId: account.userId,
          completed: importedPuzzles,
        });
        setCloudChallengeProgress({
          userId: account.userId,
          completed: importedChallenges,
        });
        setAchievementProgress(importedAchievements);
        setAchievementProgressLoadedFor(account.userId);
      }
      await accountService.completeLocalDataImportDecision();
    } catch (error) {
      console.error("Unable to finish local data import.", error);
      setAccountImportError(
        error instanceof Error
          ? error.message
          : "Unable to finish account setup.",
      );
    } finally {
      setAccountImportWorking(false);
    }
  }, [
    accountDataLoading,
    accountImportWorking,
    accountService,
    achievementProgress,
    cloudChallengeProgress.completed,
    cloudPuzzleProgress.completed,
    cloudSavedGames,
  ]);

  const recordChallengeCompletion = useCallback((challengeId: ChallengeId) => {
    const account = accountService.account;
    if (account) {
      if (
        cloudChallengeProgress.userId !== account.userId ||
        challengeProgressLoading
      ) return false;
      if (cloudChallengeProgress.completed.includes(challengeId)) return true;
      const previous = cloudChallengeProgress.completed;
      const completed = [...previous, challengeId];
      setCloudChallengeProgress({ userId: account.userId, completed });
      void upsertCloudCompletedChallenges(account.userId, completed).catch(
        (error) => {
          console.error("Unable to save cloud challenge progress.", error);
          setCloudChallengeProgress({
            userId: account.userId,
            completed: previous,
          });
          setSaveError(
            error instanceof Error
              ? error.message
              : "Unable to save challenge progress.",
          );
        },
      );
      return true;
    }
    if (localCompletedChallenges.includes(challengeId)) return true;
    const completed = [...localCompletedChallenges, challengeId];
    try {
      persistLocalCompletedChallenges(completed);
      setLocalCompletedChallenges(completed);
    } catch (error) {
      console.error("Unable to save local challenge progress.", error);
      setSaveError(
        error instanceof Error
          ? error.message
          : "Unable to save challenge progress.",
      );
    }
    return true;
  }, [
    accountService.account,
    challengeProgressLoading,
    cloudChallengeProgress,
    localCompletedChallenges,
  ]);

  const recordPuzzleCompletion = useCallback((puzzleId: PuzzleId) => {
    const account = accountService.account;
    if (account) {
      if (cloudPuzzleProgress.userId !== account.userId || puzzleProgressLoading) {
        return false;
      }
      if (cloudPuzzleProgress.completed.includes(puzzleId)) return true;
      const previous = cloudPuzzleProgress.completed;
      const completed = [...previous, puzzleId];
      setCloudPuzzleProgress({ userId: account.userId, completed });
      void upsertCloudCompletedPuzzles(account.userId, completed).catch((error) => {
        console.error("Unable to save cloud puzzle progress.", error);
        setCloudPuzzleProgress({ userId: account.userId, completed: previous });
        setSaveError(error instanceof Error ? error.message : "Unable to save puzzle progress.");
      });
      return true;
    }

    if (localCompletedPuzzles.includes(puzzleId)) return true;
    const completed = [...localCompletedPuzzles, puzzleId];
    try {
      persistLocalCompletedPuzzles(completed);
      setLocalCompletedPuzzles(completed);
    } catch (error) {
      console.error("Unable to save local puzzle progress.", error);
      setSaveError(error instanceof Error ? error.message : "Unable to save puzzle progress.");
    }
    return true;
  }, [
    accountService.account,
    cloudPuzzleProgress,
    localCompletedPuzzles,
    puzzleProgressLoading,
  ]);

  useEffect(() => {
    if (
      state.challengeId &&
      state.phase === "gameover" &&
      state.winner &&
      state.winner !== state.aiColor
    ) {
      recordChallengeCompletion(state.challengeId);
    }
  }, [
    recordChallengeCompletion,
    state.aiColor,
    state.challengeId,
    state.phase,
    state.winner,
  ]);

  useEffect(() => {
    const puzzleId = state.puzzleId;
    const dailyPuzzle = puzzleId
      ? DAILY_PUZZLE_BY_ID[puzzleId as keyof typeof DAILY_PUZZLE_BY_ID]
      : undefined;
    const solved = Boolean(
      puzzleId &&
      state.gameMode === "puzzle" &&
      (
        dailyPuzzle
          ? dailyPuzzleResultMatches(dailyPuzzle, state)
          : state.phase === "gameover" &&
            state.winner &&
            state.winner !== state.aiColor
      )
    );
    if (!solved || !puzzleId) return;
    recordPuzzleCompletion(puzzleId);
  }, [
    recordPuzzleCompletion,
    state.activeColor,
    state.aiColor,
    state.gameMode,
    state.phase,
    state.puzzleId,
    state.result,
    state.winner,
  ]);

  useEffect(() => {
    saveAchievementProgress((current) =>
      completeCryptologistIfEligible(current, completedPuzzleCounts)
    );
  }, [completedPuzzleCounts, saveAchievementProgress]);

  const recordAchievementTransition = (
    transition: AchievementTransition,
  ) => {
    saveAchievementProgress((current) =>
      applyAchievementTransition(current, transition).progress
    );
  };

  const classicLocalActors = (current: GameState): Color[] => {
    if (current.gameMode === "simulation") return [];
    if (current.gameMode === "local") return ["white", "black"];
    if (current.gameMode === "online") {
      const localColor = onlinePlayerColor(online, current.onlineHostColor);
      return localColor ? [localColor] : [];
    }
    return [current.aiColor === "white" ? "black" : "white"];
  };

  const receiveState = (next: GameState) => {
    stateRef.current = next;
    baseDispatch({ type: "load-game", state: next });
  };
  const updateUndoDepth = () => {
    undoDepthRef.current = undoStack.current.length;
    setUndoDepth(undoStack.current.length);
  };
  const clearUndoHistory = () => {
    undoStack.current = [];
    updateUndoDepth();
  };
  const resetUndoTracking = (next: GameState) => {
    clearUndoHistory();
    turnStart.current = next.phase === "play" ? prepareSavedState(next) : undefined;
  };
  const restoreUndoTracking = (
    undoHistory: GameState[],
    savedTurnStart: GameState | undefined,
    current: GameState,
  ) => {
    undoStack.current = undoHistory.map((snapshot) => prepareSavedState(snapshot));
    turnStart.current = savedTurnStart
      ? prepareSavedState(savedTurnStart)
      : current.phase === "play"
        ? prepareSavedState(current)
        : undefined;
    updateUndoDepth();
  };
  const applyTrackedAction = (current: GameState, action: GameAction) => {
    const next = gameReducer(current, action);
    const completedPlayTurn =
      current.phase === "play" &&
      (
        next.turn !== current.turn ||
        next.phase === "upgrade" ||
        next.phase === "gameover"
      );
    if (
      current.gameMode === "simulation" &&
      completedPlayTurn &&
      action.type !== "adjudicate-no-turn"
    ) {
      simulationCompletedTurns.current[current.activeColor] += 1;
    }
    const completedUpgrade =
      action.type === "upgrade" &&
      current.phase === "upgrade" &&
      (
        next.phase !== current.phase ||
        next.upgradeQueue.length !== current.upgradeQueue.length
      );
    if (current.phase === "draft" && next.phase === "play") {
      resetUndoTracking(next);
    } else if (
      current.phase === "play" &&
      (
        next.turn !== current.turn ||
        next.phase === "upgrade" ||
        next.phase === "gameover"
      )
    ) {
      undoStack.current = [
        ...undoStack.current,
        prepareSavedState(turnStart.current ?? current),
      ];
      updateUndoDepth();
      turnStart.current = next.phase === "play" ? prepareSavedState(next) : undefined;
    } else if (completedUpgrade) {
      undoStack.current = [
        ...undoStack.current,
        prepareSavedState(current),
      ];
      updateUndoDepth();
      turnStart.current = next.phase === "play" ? prepareSavedState(next) : undefined;
    }
    recordActionTransition({
      variant: "classic",
      mode: current.gameMode,
      source: current.gameMode === "online" ? "online" : isAiTurn(current) ? "ai" : "human",
      action,
      before: current as unknown as Record<string, unknown>,
      after: next as unknown as Record<string, unknown>,
    });
    if (
      current.gameMode !== "puzzle" &&
      current.gameMode !== "simulation"
    ) {
      recordAchievementTransition({
        variant: "classic",
        matchId: activeSaveId.current ??
          (current.gameMode === "online" && online.roomCode
            ? `online-classic:${online.roomCode}`
            : `classic:${current.gameMode}`),
        localActors: classicLocalActors(current),
        before: current,
        after: next,
        action,
      });
    }
    return next;
  };
  const canApplyUndo = () => {
    const current = stateRef.current;
    return (
      undoDepthRef.current > 0 &&
      (current.phase === "play" || current.phase === "upgrade" || current.phase === "gameover") &&
      !current.selectedGod &&
      !current.selectedAbility
    );
  };
  const applyUndo = () => {
    if (!canApplyUndo()) return undefined;
    const current = stateRef.current;
    let restored = undoStack.current.pop();
    if (!restored) return undefined;
    if (current.gameMode === "ai" && current.aiColor) {
      while (restored.activeColor === current.aiColor && undoStack.current.length) {
        restored = undoStack.current.pop()!;
      }
    }
    updateUndoDepth();
    const next = prepareSavedState(restored);
    turnStart.current = next.phase === "play" ? prepareSavedState(next) : undefined;
    aiPlan.current = [];
    receiveState(next);
    recordActionTransition({
      variant: "classic",
      mode: current.gameMode,
      source: "undo",
      action: { type: "undo" },
      before: current as unknown as Record<string, unknown>,
      after: next as unknown as Record<string, unknown>,
    });
    return next;
  };
  const applyRemoteAction = (action: GameAction) => {
    const next = applyTrackedAction(stateRef.current, action);
    receiveState(next);
    return next;
  };
  const [online, onlineActions] = useOnlineGame({
    getState: () => stateRef.current,
    applyRemoteAction,
    applyUndo,
    canUndo: canApplyUndo,
    receiveState,
  });
  const [fourOnline, fourOnlineActions] = useFourPlayerOnlineGame();
  const [threeOnline, threeOnlineActions] = useThreePlayerOnlineGame();
  const threeOnlineActive = threeOnline.connecting ||
    threeOnline.role !== "none" ||
    Boolean(threeOnline.roomCode) ||
    Boolean(threeOnline.snapshot);
  const threeOnlineActiveRef = useRef(threeOnlineActive);
  threeOnlineActiveRef.current = threeOnlineActive;

  useEffect(() => {
    if (threeOnlineActive) activeSaveId.current = undefined;
  }, [threeOnlineActive]);

  const finalizeSimulation = (terminal: GameState) => {
    const completedTurns =
      simulationCompletedTurns.current.white +
      simulationCompletedTurns.current.black;
    const rewound = rewindSimulationForExport(
      terminal,
      undoStack.current,
      completedTurns,
    );
    undoStack.current = rewound.undoHistory;
    updateUndoDepth();
    turnStart.current = rewound.turnStart;
    aiPlan.current = [];
    setSimulationExport(rewound.exportData);
    recordDiagnostic({
      category: "ui",
      event: "simulation-export-opened",
      context: { variant: "classic", mode: "simulation" },
      data: {
        completedTurns,
        rewindRounds: rewound.exportData.rewindRounds,
        requestedUndoActions: rewound.exportData.requestedUndoActions,
        appliedUndoActions: rewound.exportData.appliedUndoActions,
      },
    });
    return rewound.state;
  };

  const dispatch: GameDispatch = (action) => {
    const current = stateRef.current;
    if (current.gameMode === "online") {
      const localColor = onlinePlayerColor(online, current.onlineHostColor);
      if (!localColor || current.activeColor !== localColor) return;
      if (online.role === "peer") {
        recordDiagnostic({
          category: "online",
          event: "classic-action-sent",
          context: { variant: "classic", role: "peer" },
          data: { action },
        });
        onlineActions.sendAction(action);
        return;
      }
      if (online.role === "host") {
        const next = applyTrackedAction(current, action);
        receiveState(next);
        onlineActions.syncState(next);
        return;
      }
      return;
    }
    const tracked = applyTrackedAction(current, action);
    const next =
      tracked.gameMode === "simulation" && tracked.phase === "gameover"
        ? finalizeSimulation(tracked)
        : tracked;
    receiveState(next);
  };

  const quickDraft = () => {
    if (
      quickDraftPending.current ||
      stateRef.current.gameMode === "online" ||
      stateRef.current.phase !== "draft"
    ) return;
    quickDraftPending.current = true;
    aiPlan.current = [];
    const favorites = loadFavoriteGodSkins();
    try {
      while (stateRef.current.phase === "draft") {
        const godId = randomItem(stateRef.current.draft.available);
        if (!godId) break;
        dispatch({
          type: "draft",
          godId,
          skinId: favoriteGodSkin(favorites, godId),
        });
      }
    } finally {
      quickDraftPending.current = false;
    }
  };

  const changeUndoPreference = (enabled: boolean) => {
    persistUndoSetting(enabled);
    setUndoPreferred(enabled);
  };

  const persistSavedGame = useCallback(async (saved: SavedGame) => {
    if (threeOnlineActiveRef.current) return false;
    const next = mergeSavedGame(savedGamesRef.current, saved);
    const account = accountService.account;
    try {
      if (account) {
        const queuedSave = cloudSaveQueue.current.then(() =>
          upsertCloudSavedGame(account.userId, saved)
        );
        cloudSaveQueue.current = queuedSave.catch(() => undefined);
        await queuedSave;
        setCloudSavedGames(next);
      } else {
        persistLocalSavedGames(next);
        setLocalSavedGames(next);
      }
      setSaveError(undefined);
      if (!threeOnlineActiveRef.current) activeSaveId.current = saved.id;
      savedGamesRef.current = next;
      return true;
    } catch (error) {
      console.error("Unable to save the God Chess game.", error);
      setSaveError(error instanceof Error ? error.message : "Unable to save the game.");
      return false;
    }
  }, [accountService.account]);

  const saveCurrentGame = async () => {
    if (
      threeOnlineActiveRef.current ||
      stateRef.current.gameMode === "online" ||
      stateRef.current.gameMode === "puzzle" ||
      stateRef.current.gameMode === "simulation"
    ) return false;
    const id = activeSaveId.current ?? saveId();
    const saved = createSavedGame(
      id,
      stateRef.current,
      undoStack.current,
      turnStart.current,
    );
    return persistSavedGame(saved);
  };

  const persistFourPlayerGame = useCallback((
    fourState: FourPlayerState,
    fourUndoHistory: FourPlayerState[],
    fourTurnStart?: FourPlayerState,
  ) => {
    const id = activeSaveId.current ?? saveId();
    return persistSavedGame(createSavedGame(
      id,
      fourState,
      fourUndoHistory,
      fourTurnStart,
    ));
  }, [persistSavedGame]);

  const persistThreePlayerGame = useCallback((
    threeState: ThreePlayerState,
    threeUndoHistory: ThreePlayerState[],
    threeTurnStart?: ThreePlayerState,
  ) => {
    if (threeOnlineActiveRef.current) return false;
    const id = activeSaveId.current ?? saveId();
    return persistSavedGame(createSavedGame(
      id,
      threeState,
      threeUndoHistory,
      threeTurnStart,
    ));
  }, [persistSavedGame]);

  const saveAndQuit = async () => {
    if (!await saveCurrentGame()) return;
    aiPlan.current = [];
    clearUndoHistory();
    setStartView("menu");
  };

  const quitWithoutSaving = () => {
    aiPlan.current = [];
    clearUndoHistory();
    simulationCompletedTurns.current = { white: 0, black: 0 };
    setSimulationExport(undefined);
    activeSaveId.current = undefined;
    setStartView("menu");
  };

  useEffect(() => {
    if (
      startView !== "none" ||
      fourPlayerSession ||
      threePlayerSession ||
      threeOnlineActive ||
      state.gameMode === "online" ||
      state.gameMode === "puzzle" ||
      state.gameMode === "simulation" ||
      state.challengeId
    ) return;
    void saveCurrentGame();
  }, [
    fourPlayerSession,
    threeOnlineActive,
    threePlayerSession,
    startView,
    state,
  ]);

  useEffect(() => {
    if (
      fourPlayerSession ||
      threePlayerSession ||
      startView !== "none" ||
      simulationExport ||
      !isAiTurn(state)
    ) {
      aiPlan.current = [];
      aiNoPlanState.current = undefined;
      aiRequestId.current += 1;
      return;
    }
    if (aiNoPlanState.current === state) return;
    if (!aiPlan.current.length) {
      const requestId = aiRequestId.current + 1;
      aiRequestId.current = requestId;
      const requestedState = state;
      const strategy: ClassicAiPlanStrategy =
        requestedState.gameMode === "simulation"
          ? classicSimulationPlanStrategy(
            requestedState,
            simulationCompletedTurns.current,
          )
          : "optimal";
      let worker: Worker | undefined;
      let planningTimer: number | undefined;
      let planningWatchdog: number | undefined;
      let secondFrame: number | undefined;
      let settled = false;
      let fallbackStarted = false;
      const acceptPlan = (actions: GameAction[]) => {
        if (
          settled ||
          aiRequestId.current !== requestId ||
          stateRef.current !== requestedState
        ) return;
        settled = true;
        if (planningWatchdog !== undefined) {
          window.clearTimeout(planningWatchdog);
        }
        worker?.terminate();
        worker = undefined;
        const resolvedActions = actions.length
          ? actions
          : chooseFallbackAiPlan(requestedState, strategy);
        if (!resolvedActions.length && requestedState.phase === "play") {
          dispatch({
            type: "adjudicate-no-turn",
            activeColor: requestedState.activeColor,
            turn: requestedState.turn,
          });
          return;
        }
        if (!resolvedActions.length && requestedState.phase === "upgrade") {
          dispatch({ type: "load-game", state: requestedState });
          return;
        }
        aiPlan.current = resolvedActions;
        aiNoPlanState.current = resolvedActions.length ? undefined : requestedState;
        recordDiagnostic({
          category: "ai",
          event: "classic-plan-result",
          context: { variant: "classic", mode: requestedState.gameMode },
          data: {
            actions: resolvedActions,
            strategy,
            recoveredEmptyPlan: !actions.length && resolvedActions.length > 0,
          },
        });
        setAiPlanReady((value) => value + 1);
      };
      const fallbackToMainThread = (error: unknown) => {
        if (
          settled ||
          fallbackStarted ||
          aiRequestId.current !== requestId ||
          stateRef.current !== requestedState
        ) return;
        fallbackStarted = true;
        worker?.terminate();
        worker = undefined;
        const message = error instanceof Error
          ? error.message
          : error &&
              typeof error === "object" &&
              "message" in error
            ? String(error.message)
            : error instanceof Event
              ? error.type
              : String(error);
        recordDiagnostic({
          category: "error",
          event: "classic-worker-error",
          context: { variant: "classic", mode: requestedState.gameMode },
          data: { message },
        });
        acceptPlan(
          strategy === "random"
            ? chooseRandomAiPlan(requestedState)
            : chooseAiPlan(requestedState),
        );
      };
      const firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          planningTimer = window.setTimeout(() => {
            recordDiagnostic({
              category: "ai",
              event: "classic-plan-start",
              context: { variant: "classic", mode: requestedState.gameMode },
              data: {
                phase: requestedState.phase,
                activeColor: requestedState.activeColor,
                turn: requestedState.turn,
                strategy,
              },
            });
            if (typeof Worker === "undefined") {
              acceptPlan(
                strategy === "random"
                  ? chooseRandomAiPlan(requestedState)
                  : chooseAiPlan(requestedState),
              );
              return;
            }
            try {
              worker = new Worker(
                new URL("./game/ai.worker.ts", import.meta.url),
                { type: "module" },
              );
              worker.onmessage = (
                event: MessageEvent<ClassicAiWorkerResponse>,
              ) => {
                if (event.data.requestId === requestId) {
                  acceptPlan(event.data.actions);
                }
              };
              worker.onerror = (event) => {
                event.preventDefault();
                fallbackToMainThread(event);
              };
              worker.onmessageerror = (event) => {
                fallbackToMainThread(event);
              };
              worker.postMessage({
                requestId,
                state: requestedState,
                strategy,
              });
              if (requestedState.phase !== "play") {
                planningWatchdog = window.setTimeout(() => {
                  recordDiagnostic({
                    category: "error",
                    event: "classic-plan-timeout",
                    context: {
                      variant: "classic",
                      mode: requestedState.gameMode,
                    },
                    data: {
                      phase: requestedState.phase,
                      activeColor: requestedState.activeColor,
                      turn: requestedState.turn,
                    },
                  });
                  acceptPlan(chooseFallbackAiPlan(requestedState, strategy));
                }, AI_NON_PLAY_PLAN_TIMEOUT_MS);
              }
            } catch (error) {
              fallbackToMainThread(error);
            }
          }, 0);
        });
      });
      return () => {
        aiRequestId.current += 1;
        window.cancelAnimationFrame(firstFrame);
        if (secondFrame !== undefined) {
          window.cancelAnimationFrame(secondFrame);
        }
        if (planningTimer !== undefined) {
          window.clearTimeout(planningTimer);
        }
        if (planningWatchdog !== undefined) {
          window.clearTimeout(planningWatchdog);
        }
        worker?.terminate();
      };
    }
    const action = aiPlan.current[0];
    if (!action) return;
    const timer = window.setTimeout(() => {
      if (stateRef.current !== state) return;
      aiPlan.current = aiPlan.current.slice(1);
      dispatch(action);
    }, state.gameMode === "simulation" ? 120 : aiActionDelay(action));
    return () => window.clearTimeout(timer);
  }, [
    aiPlanReady,
    fourPlayerSession,
    simulationExport,
    threePlayerSession,
    startView,
    state,
  ]);

  useEffect(() => {
    if (online.started) setStartView("none");
  }, [online.started]);

  useEffect(() => {
    recordDiagnostic({
      category: "online",
      event: "classic-lifecycle",
      context: { variant: "classic" },
      data: {
        role: online.role,
        connecting: online.connecting,
        started: online.started,
        awaitingSync: online.awaitingSync,
        undoAvailable: online.undoAvailable,
        error: online.error,
      },
    });
  }, [
    online.awaitingSync,
    online.connecting,
    online.error,
    online.role,
    online.started,
    online.undoAvailable,
  ]);

  useEffect(() => {
    recordDiagnostic({
      category: "online",
      event: "four-player-lifecycle",
      context: { variant: "four-player" },
      data: {
        role: fourOnline.role,
        connecting: fourOnline.connecting,
        status: fourOnline.snapshot?.status,
        revision: fourOnline.snapshot?.canonical?.revision,
        awaitingAction: Boolean(fourOnline.awaitingActionId),
        undoAvailable: fourOnline.snapshot?.undoAvailable,
        error: fourOnline.error,
      },
    });
  }, [
    fourOnline.awaitingActionId,
    fourOnline.connecting,
    fourOnline.error,
    fourOnline.role,
    fourOnline.snapshot?.canonical?.revision,
    fourOnline.snapshot?.status,
    fourOnline.snapshot?.undoAvailable,
  ]);

  useEffect(() => {
    recordDiagnostic({
      category: "online",
      event: "three-player-lifecycle",
      context: { variant: "three-player" },
      data: {
        role: threeOnline.role,
        connecting: threeOnline.connecting,
        status: threeOnline.snapshot?.status,
        revision: threeOnline.snapshot?.canonical?.revision,
        awaitingAction: Boolean(threeOnline.awaitingActionId),
        undoAvailable: threeOnline.snapshot?.undoAvailable,
        undoVote: threeOnline.snapshot?.undoProposal
          ? {
            eligibleCount: threeOnline.snapshot.undoProposal.eligibleCount,
            approvedCount: threeOnline.snapshot.undoProposal.approvedCount,
          }
          : undefined,
        error: threeOnline.error,
      },
    });
  }, [
    threeOnline.awaitingActionId,
    threeOnline.connecting,
    threeOnline.error,
    threeOnline.role,
    threeOnline.snapshot?.canonical?.revision,
    threeOnline.snapshot?.status,
    threeOnline.snapshot?.undoAvailable,
    threeOnline.snapshot?.undoProposal?.approvedCount,
  ]);

  useEffect(() => {
    if (fourOnline.snapshot?.canonical) {
      setFourPlayerSession(undefined);
      setStartView("none");
    }
  }, [fourOnline.snapshot?.canonical]);

  useEffect(() => {
    if (!fourOnline.ended) return;
    setSetupCategory("online");
    setSetupPlayerCount(4);
    setSetupReturnView("menu");
    setStartView("setup");
  }, [fourOnline.ended]);

  useEffect(() => {
    if (threeOnline.snapshot?.canonical) {
      setThreePlayerSession(undefined);
      setStartView("none");
    }
  }, [threeOnline.snapshot?.canonical]);

  useEffect(() => {
    if (!threeOnline.ended) return;
    setSetupCategory("online");
    setSetupPlayerCount(3);
    setSetupReturnView("menu");
    setStartView("setup");
  }, [threeOnline.ended]);

  useEffect(() => {
    if (!online.started || state.gameMode !== "online") return;
    onlineActions.setUndoConsent(undoPreferred);
  }, [online.started, online.role, state.gameMode, undoPreferred]);

  const loadGame = (game: SavedGame) => {
    simulationCompletedTurns.current = { white: 0, black: 0 };
    setSimulationExport(undefined);
    activeSaveId.current = game.id;
    if (isFourPlayerSavedGame(game)) {
      setFourPlayerSession({
        key: `${game.id}-${game.savedAt}`,
        state: structuredClone(game.state),
        undoHistory: game.undoHistory.map((snapshot) => structuredClone(snapshot)),
        turnStart: game.turnStart ? structuredClone(game.turnStart) : undefined,
      });
      aiPlan.current = [];
      clearUndoHistory();
      setSettingsOpen(false);
      setStartView("none");
      return;
    }
    if (isThreePlayerSavedGame(game)) {
      setFourPlayerSession(undefined);
      setThreePlayerSession({
        key: `${game.id}-${game.savedAt}`,
        state: structuredClone(game.state),
        undoHistory: game.undoHistory.map((snapshot) => structuredClone(snapshot)),
        turnStart: game.turnStart ? structuredClone(game.turnStart) : undefined,
      });
      aiPlan.current = [];
      clearUndoHistory();
      setSettingsOpen(false);
      setStartView("none");
      return;
    }
    setFourPlayerSession(undefined);
    setThreePlayerSession(undefined);
    const next = structuredClone(game.state);
    restoreUndoTracking(game.undoHistory, game.turnStart, next);
    receiveState(next);
    aiPlan.current = [];
    setStartView("none");
  };
  const deleteSavedGame = async (id: string) => {
    const next = savedGamesRef.current.filter((game) => game.id !== id);
    const account = accountService.account;
    try {
      if (account) {
        const queuedDelete = cloudSaveQueue.current.then(() =>
          deleteCloudSavedGame(account.userId, id)
        );
        cloudSaveQueue.current = queuedDelete.catch(() => undefined);
        await queuedDelete;
        setCloudSavedGames(next);
      } else {
        persistLocalSavedGames(next);
        setLocalSavedGames(next);
      }
      setSaveError(undefined);
      savedGamesRef.current = next;
      if (activeSaveId.current === id) activeSaveId.current = undefined;
    } catch (error) {
      console.error("Unable to delete the saved God Chess game.", error);
      setSaveError(error instanceof Error ? error.message : "Unable to delete the saved game.");
    }
  };
  const deleteAllSavedGames = async () => {
    const account = accountService.account;
    try {
      if (account) {
        const queuedDelete = cloudSaveQueue.current.then(() =>
          deleteAllCloudSavedGames(account.userId)
        );
        cloudSaveQueue.current = queuedDelete.catch(() => undefined);
        await queuedDelete;
        setCloudSavedGames([]);
      } else {
        persistLocalSavedGames([]);
        setLocalSavedGames([]);
      }
      setSaveError(undefined);
      savedGamesRef.current = [];
      activeSaveId.current = undefined;
      return true;
    } catch (error) {
      console.error("Unable to delete all saved God Chess games.", error);
      setSaveError(
        error instanceof Error ? error.message : "Unable to delete all saved games.",
      );
      return false;
    }
  };
  const openStartFlow = (
    category: StartCategory,
    playerCount?: PlayerCount,
    returnView: "menu" | "play" | "none" = "menu",
  ) => {
    simulationCompletedTurns.current = { white: 0, black: 0 };
    setSimulationExport(undefined);
    setSetupCategory(category);
    setSetupPlayerCount(playerCount);
    setSetupReturnView(returnView);
    setStartView("setup");
  };
  const beginGame = (
    mode: Exclude<GameMode, "online" | "puzzle" | "simulation">,
    difficulty: number,
  ) => {
    onlineActions.disconnect();
    fourOnlineActions.disconnect();
    threeOnlineActions.disconnect();
    setFourPlayerSession(undefined);
    setThreePlayerSession(undefined);
    setSimulationExport(undefined);
    activeSaveId.current = saveId();
    const next = createGame(undefined, {
      mode,
      aiDifficulty: difficulty,
      playerName: accountService.account?.displayName,
    });
    resetUndoTracking(next);
    receiveState(next);
    aiPlan.current = [];
    setStartView("none");
  };
  const beginSimulation = () => {
    onlineActions.disconnect();
    fourOnlineActions.disconnect();
    threeOnlineActions.disconnect();
    setFourPlayerSession(undefined);
    setThreePlayerSession(undefined);
    activeSaveId.current = undefined;
    simulationCompletedTurns.current = { white: 0, black: 0 };
    setSimulationExport(undefined);
    const next = createGame(1, {
      mode: "simulation",
      aiDifficulty: 10,
    });
    resetUndoTracking(next);
    receiveState(next);
    aiPlan.current = [];
    setSettingsOpen(false);
    setStartView("none");
  };
  const beginFourPlayerGame = (config: FourPlayerConfig) => {
    onlineActions.disconnect();
    fourOnlineActions.disconnect();
    threeOnlineActions.disconnect();
    simulationCompletedTurns.current = { white: 0, black: 0 };
    const id = saveId();
    activeSaveId.current = id;
    clearUndoHistory();
    aiPlan.current = [];
    setSettingsOpen(false);
    setFourPlayerSession({
      key: id,
      state: createFourPlayerGame(config),
      undoHistory: [],
    });
    setStartView("none");
  };
  const beginThreePlayerGame = (config: ThreePlayerConfig) => {
    onlineActions.disconnect();
    fourOnlineActions.disconnect();
    threeOnlineActions.disconnect();
    simulationCompletedTurns.current = { white: 0, black: 0 };
    const id = saveId();
    const next = createThreePlayerGame(config);
    const session: ThreePlayerSession = {
      key: id,
      state: next,
      undoHistory: [],
    };
    setFourPlayerSession(undefined);
    setThreePlayerSession(session);
    activeSaveId.current = id;
    aiPlan.current = [];
    clearUndoHistory();
    setSettingsOpen(false);
    setStartView("none");
  };
  const beginPuzzle = (puzzleId: PuzzleId) => {
    onlineActions.disconnect();
    fourOnlineActions.disconnect();
    threeOnlineActions.disconnect();
    simulationCompletedTurns.current = { white: 0, black: 0 };
    setFourPlayerSession(undefined);
    const id = saveId();
    activeSaveId.current = id;
    if (isThreePlayerPuzzleId(puzzleId)) {
      setThreePlayerSession({
        key: id,
        state: THREE_PLAYER_PUZZLE_BY_ID[puzzleId].createState(
          accountService.account?.displayName,
        ),
        undoHistory: [],
        puzzleId,
      });
      clearUndoHistory();
      aiPlan.current = [];
      setSettingsOpen(false);
      setStartView("none");
      return;
    }
    setThreePlayerSession(undefined);
    const next = isDailyPuzzleId(puzzleId)
      ? createDailyPuzzleGame(
        puzzleId,
        accountService.account?.displayName,
      )
      : createPuzzleGame(
        puzzleId,
        accountService.account?.displayName,
      );
    resetUndoTracking(next);
    receiveState(next);
    aiPlan.current = [];
    setSettingsOpen(false);
    setStartView("none");
  };
  const beginChallenge = (challengeId: ChallengeId) => {
    onlineActions.disconnect();
    fourOnlineActions.disconnect();
    threeOnlineActions.disconnect();
    simulationCompletedTurns.current = { white: 0, black: 0 };
    activeSaveId.current = undefined;
    clearUndoHistory();
    aiPlan.current = [];
    setSettingsOpen(false);
    if (challengeId === "gang-up") {
      setFourPlayerSession(undefined);
      setThreePlayerSession({
        key: `challenge-${challengeId}-${saveId()}`,
        state: createGangUpChallenge(accountService.account?.displayName),
        undoHistory: [],
        challengeId,
      });
    } else if (challengeId === "jumped") {
      setThreePlayerSession(undefined);
      setFourPlayerSession({
        key: `challenge-${challengeId}-${saveId()}`,
        state: createJumpedChallenge(accountService.account?.displayName),
        undoHistory: [],
        challengeId,
      });
    } else {
      setFourPlayerSession(undefined);
      setThreePlayerSession(undefined);
      const next = createClassicChallenge(
        challengeId,
        accountService.account?.displayName,
      );
      resetUndoTracking(next);
      receiveState(next);
    }
    setStartView("none");
  };
  const startHostedGame = () => {
    if (!online.guest) return;
    fourOnlineActions.disconnect();
    threeOnlineActions.disconnect();
    activeSaveId.current = undefined;
    setFourPlayerSession(undefined);
    const next = createGame(undefined, {
      mode: "online",
      hostName: online.hostName,
      guestName: online.guest.name,
    });
    resetUndoTracking(next);
    receiveState(next);
    onlineActions.startGame(next);
    setStartView("none");
  };
  const openNewGame = () => {
    if (threePlayerSession) {
      if (threePlayerSession.challengeId) {
        beginChallenge(threePlayerSession.challengeId);
        return;
      }
      setThreePlayerSession(undefined);
      setSetupCategory("local");
      setSetupPlayerCount(undefined);
      setSetupReturnView("play");
      setStartView("three-setup");
      return;
    }
    if (fourPlayerSession) {
      if (fourPlayerSession.challengeId) {
        beginChallenge(fourPlayerSession.challengeId);
        return;
      }
      setFourPlayerSession(undefined);
      setSetupCategory("local");
      setSetupPlayerCount(undefined);
      setSetupReturnView("play");
      setStartView("four-setup");
      return;
    }
    if (state.challengeId) {
      beginChallenge(state.challengeId);
      return;
    }
    if (state.gameMode === "online") {
      onlineActions.disconnect();
      openStartFlow("online", 2);
      return;
    } else if (threeOnline.snapshot?.canonical) {
      threeOnlineActions.disconnect();
      openStartFlow("online", 3);
      return;
    } else if (fourOnline.snapshot?.canonical) {
      fourOnlineActions.disconnect();
      openStartFlow("online", 4);
      return;
    }
    if (state.gameMode === "puzzle") {
      setStartView("puzzles");
      return;
    }
    openStartFlow("local", undefined, "none");
  };
  const restartPuzzle = () => {
    if (!state.puzzleId) return;
    beginPuzzle(state.puzzleId);
  };
  const nextPuzzle = () => {
    if (!state.puzzleId) return;
    if (isDailyPuzzleId(state.puzzleId)) {
      setStartView("puzzles");
      return;
    }
    const current = PUZZLE_BY_ID[state.puzzleId];
    const difficultyPuzzles = PUZZLES.filter((puzzle) => puzzle.difficulty === current.difficulty);
    const index = difficultyPuzzles.findIndex((puzzle) => puzzle.id === state.puzzleId);
    const next = difficultyPuzzles[index + 1];
    if (next) {
      beginPuzzle(next.id);
    } else {
      setStartView("puzzles");
    }
  };
  const nextThreePlayerPuzzle = (puzzleId: ThreePlayerPuzzleId) => {
    const index = THREE_PLAYER_PUZZLES.findIndex(
      (puzzle) => puzzle.id === puzzleId,
    );
    const next = THREE_PLAYER_PUZZLES[index + 1];
    if (next) {
      beginPuzzle(next.id);
    } else {
      setThreePlayerSession(undefined);
      setStartView("puzzles");
    }
  };

  const puzzleInputLocked =
    state.gameMode === "puzzle" &&
    Boolean(state.puzzleFailed) &&
    state.activeColor !== state.aiColor;
  const inputDisabled =
    isAiTurn(state) ||
    puzzleInputLocked ||
    (
      state.gameMode === "online" &&
      onlineTurnInputDisabled(online, state.activeColor, state.onlineHostColor)
    );
  const localOnlineColor = onlinePlayerColor(online, state.onlineHostColor);
  const opponentColor = state.gameMode === "ai"
    ? state.aiColor
    : state.gameMode === "puzzle"
      ? state.aiColor
    : state.gameMode === "online" && localOnlineColor
      ? (localOnlineColor === "white" ? "black" : "white")
      : undefined;
  const onlineSession =
    startView === "none" &&
    state.gameMode === "online" &&
    online.role !== "none" &&
    online.started;
  const localUndoConsent = online.role === "host"
    ? online.undoConsent.host
    : online.undoConsent.peer;
  const remoteUndoConsent = online.role === "host"
    ? online.undoConsent.peer
    : online.undoConsent.host;
  const undoEnabled = state.gameMode === "puzzle"
    ? false
    : state.gameMode === "simulation"
      ? false
    : state.gameMode === "online"
    ? onlineUndoEnabled(online)
    : undoPreferred;
  const undoStable =
    (state.phase === "play" || state.phase === "upgrade" || state.phase === "gameover") &&
    !state.selectedGod &&
    !state.selectedAbility;
  const canUndo =
    state.gameMode !== "puzzle" &&
    state.gameMode !== "simulation" &&
    undoEnabled &&
    undoStable && (
    state.gameMode === "online"
      ? online.undoAvailable && !online.awaitingSync
      : undoDepth > 0
  );
  const requestUndo = () => {
    if (!canUndo) return;
    if (state.gameMode === "online") onlineActions.requestUndo();
    else applyUndo();
  };
  const fourOnlineCanonical = fourOnline.snapshot?.canonical;
  const threeOnlineCanonical = threeOnline.snapshot?.canonical;
  const renderAccountControl = (className = "setup-account-area") => (
    <AccountControl
      account={accountService.account}
      accountConfigured={accountService.configured}
      accountLoading={accountService.loading}
      accountWorking={accountService.working}
      accountError={accountService.error}
      accountDataLoading={accountDataLoading}
      accountImportWorking={accountImportWorking}
      accountImportError={accountImportError}
      onSignIn={accountService.signIn}
      onSignUp={accountService.signUp}
      onSignOut={accountService.signOut}
      onUpdateDisplayName={accountService.updateDisplayName}
      onImportLocalData={() => finishLocalDataImportDecision(true)}
      onStartAccountFresh={() => finishLocalDataImportDecision(false)}
      className={className}
    />
  );

  if (startView === "menu") {
    return (
      <MainMenu
        saveError={saveError}
        account={accountService.account}
        accountConfigured={accountService.configured}
        accountLoading={accountService.loading}
        accountWorking={accountService.working}
        accountError={accountService.error}
        accountDataLoading={accountDataLoading}
        accountImportWorking={accountImportWorking}
        accountImportError={accountImportError}
        onStart={() => setStartView("play")}
        onSignIn={accountService.signIn}
        onSignUp={accountService.signUp}
        onSignOut={accountService.signOut}
        onUpdateDisplayName={accountService.updateDisplayName}
        onImportLocalData={() => finishLocalDataImportDecision(true)}
        onStartAccountFresh={() => finishLocalDataImportDecision(false)}
      />
    );
  }

  if (startView === "roster") {
    return (
      <RosterScreen
        accountControl={renderAccountControl()}
        onBack={() => setStartView("play")}
      />
    );
  }

  if (startView === "achievements") {
    return (
      <AchievementsScreen
        progress={visibleAchievementProgress}
        account={accountService.account}
        accountControl={renderAccountControl()}
        loading={achievementProgressLoading}
        puzzleCounts={completedPuzzleCounts}
        onBack={() => setStartView("play")}
      />
    );
  }

  if (startView === "play") {
    return (
      <PlayMenu
        savedGames={savedGames}
        savesLoading={savesLoading || savesHydrating}
        saveError={saveError}
        account={accountService.account}
        accountControl={renderAccountControl()}
        onBack={() => setStartView("menu")}
        onOpenLocal={() => openStartFlow("local", undefined, "play")}
        onOpenOnline={() => openStartFlow("online", undefined, "play")}
        onOpenPuzzles={() => setStartView("puzzles")}
        onOpenTutorial={() => setStartView("tutorial")}
        onOpenRoster={() => setStartView("roster")}
        onOpenAchievements={() => setStartView("achievements")}
        onOpenLoad={() => setStartView("load")}
      />
    );
  }

  if (startView === "tutorial") {
    return <TutorialScreen onExit={() => setStartView("play")} />;
  }

  if (startView === "load") {
    return (
      <SetupNavigationShell
        backLabel="Back to Play"
        onBack={() => setStartView("play")}
        headerAction={renderAccountControl()}
      >
        <SavedGameLibrary
          savedGames={savedGames}
          savesLoading={savesLoading || savesHydrating}
          onLoad={loadGame}
          onDelete={(id) => void deleteSavedGame(id)}
          onDeleteAll={deleteAllSavedGames}
        />
      </SetupNavigationShell>
    );
  }

  if (startView === "puzzles") {
    return (
      <PuzzleSelectScreen
        completedPuzzles={completedPuzzles}
        completedChallenges={completedChallenges}
        accountControl={renderAccountControl("puzzle-account-area")}
        progressLoading={puzzleProgressLoading || challengeProgressLoading}
        progressError={saveError}
        onStartPuzzle={beginPuzzle}
        onStartChallenge={beginChallenge}
        onBack={() => setStartView("play")}
        onDismissError={() => setSaveError(undefined)}
      />
    );
  }

  if (startView === "four-setup") {
    return (
      <SetupNavigationShell
        backLabel="Back to Local"
        headerAction={renderAccountControl()}
        onBack={() => {
          setSetupCategory("local");
          setSetupPlayerCount(undefined);
          setStartView("setup");
        }}
      >
        <FourPlayerSetup
          embedded
          defaultPlayerName={accountService.account?.displayName}
          onStart={beginFourPlayerGame}
          onBack={() => {
            setSetupCategory("local");
            setSetupPlayerCount(undefined);
            setStartView("setup");
          }}
        />
      </SetupNavigationShell>
    );
  }

  if (startView === "three-setup") {
    return (
      <SetupNavigationShell
        backLabel="Back to Local"
        headerAction={renderAccountControl()}
        onBack={() => {
          setSetupCategory("local");
          setSetupPlayerCount(undefined);
          setStartView("setup");
        }}
      >
        <ThreePlayerSetup
          embedded
          defaultPlayerName={accountService.account?.displayName}
          onStart={beginThreePlayerGame}
          onBack={() => {
            setSetupCategory("local");
            setSetupPlayerCount(undefined);
            setStartView("setup");
          }}
        />
      </SetupNavigationShell>
    );
  }

  if (startView === "setup") {
    return (
      <StartGamePrompt
        online={online}
        fourOnline={fourOnline}
        threeOnline={threeOnline}
        defaultPlayerName={accountService.account?.displayName}
        accountControl={renderAccountControl()}
        category={setupCategory}
        initialPlayerCount={setupPlayerCount}
        onStart={beginGame}
        onStartSimulation={beginSimulation}
        onOpenThreePlayer={() => {
          setSetupCategory("local");
          setSetupPlayerCount(undefined);
          setStartView("three-setup");
        }}
        onOpenFourPlayer={() => {
          setSetupCategory("local");
          setSetupPlayerCount(undefined);
          setStartView("four-setup");
        }}
        onHost={(name) => {
          fourOnlineActions.disconnect();
          threeOnlineActions.disconnect();
          void onlineActions.hostGame(name);
        }}
        onJoin={(code, name) => {
          fourOnlineActions.disconnect();
          threeOnlineActions.disconnect();
          void onlineActions.joinGame(code, name);
        }}
        onStartOnline={startHostedGame}
        onHostFourOnline={(name) => {
          onlineActions.disconnect();
          threeOnlineActions.disconnect();
          void fourOnlineActions.hostGame(name);
        }}
        onJoinFourOnline={(code, name) => {
          onlineActions.disconnect();
          threeOnlineActions.disconnect();
          void fourOnlineActions.joinGame(code, name);
        }}
        onFourReady={fourOnlineActions.setReady}
        onFourAssignSeat={fourOnlineActions.assignSeat}
        onFourUpdateConfig={fourOnlineActions.updateConfig}
        onStartFourOnline={() => {
          if (fourOnlineActions.startGame()) setStartView("none");
        }}
        onHostThreeOnline={(name) => {
          onlineActions.disconnect();
          fourOnlineActions.disconnect();
          activeSaveId.current = undefined;
          threeOnlineActiveRef.current = true;
          void threeOnlineActions.hostGame(name);
        }}
        onJoinThreeOnline={(code, name) => {
          onlineActions.disconnect();
          fourOnlineActions.disconnect();
          activeSaveId.current = undefined;
          threeOnlineActiveRef.current = true;
          void threeOnlineActions.joinGame(code, name);
        }}
        onThreeReady={threeOnlineActions.setReady}
        onThreeAssignSeat={threeOnlineActions.assignSeat}
        onThreeUpdateConfig={threeOnlineActions.updateConfig}
        onStartThreeOnline={() => {
          if (threeOnlineActions.startGame()) setStartView("none");
        }}
        onCancel={() => {
          onlineActions.disconnect();
          fourOnlineActions.disconnect();
          threeOnlineActions.disconnect();
          setStartView(setupReturnView);
        }}
        onDisconnect={() => {
          onlineActions.disconnect();
          fourOnlineActions.disconnect();
          threeOnlineActions.disconnect();
        }}
      />
    );
  }

  if (startView === "none" && threeOnlineCanonical && threeOnline.snapshot) {
    const pausedSeat = threeOnline.snapshot.pausedSeat;
    return (
      <ThreePlayerGame
        key={`online-three-${threeOnline.roomCode}`}
        initialState={threeOnlineCanonical.state}
        onAchievementTransition={(before, after, action) => {
          const localSeat = threePlayerOnlineLocalSeat(threeOnline);
          recordAchievementTransition({
            variant: "three-player",
            matchId: `online-three:${threeOnline.roomCode}`,
            localActors: localSeat ? [localSeat] : [],
            before,
            after,
            action,
          });
        }}
        onQuit={() => {
          threeOnlineActions.disconnect();
          setStartView("menu");
        }}
        onNewGame={() => {
          threeOnlineActions.disconnect();
          openStartFlow("online", 3);
        }}
        onlineSession={{
          roomCode: threeOnline.snapshot.roomCode,
          role: threeOnline.role === "host" ? "host" : "peer",
          participantSeat: threePlayerOnlineLocalSeat(threeOnline),
          status: threeOnline.snapshot.status === "paused"
            ? "paused"
            : threeOnline.snapshot.status === "finished"
              ? "finished"
              : "playing",
          awaitingSync: Boolean(threeOnline.awaitingActionId),
          undoAvailable: threeOnline.snapshot.undoAvailable,
          undoProposal: threeOnline.snapshot.undoProposal,
          pausedSeat,
          pausedParticipantName: threeOnline.snapshot.pausedParticipantName,
          onAction: threeOnlineActions.sendAction,
          onUndoRequest: threeOnlineActions.requestUndo,
          onUndoVote: threeOnlineActions.voteUndo,
          onReplaceWithAi: pausedSeat && threeOnline.role === "host"
            ? (difficulty) =>
              threeOnlineActions.replaceWithAi(pausedSeat, difficulty)
            : undefined,
        }}
      />
    );
  }

  if (startView === "none" && fourOnlineCanonical && fourOnline.snapshot) {
    const pausedSeat = fourOnline.snapshot.pausedSeat;
    return (
      <FourPlayerGame
        key={`online-${fourOnline.roomCode}`}
        initialState={fourOnlineCanonical.state}
        onAchievementTransition={(before, after, action) => {
          const localSeat = fourPlayerOnlineLocalSeat(fourOnline);
          recordAchievementTransition({
            variant: "four-player",
            matchId: `online-four:${fourOnline.roomCode}`,
            localActors: localSeat ? [localSeat] : [],
            before,
            after,
            action,
          });
        }}
        undoPreferred={fourOnline.snapshot.localUndoConsent}
        onUndoPreferenceChange={fourOnlineActions.setUndoConsent}
        onPersist={async () => false}
        onQuit={() => {
          fourOnlineActions.disconnect();
          setStartView("menu");
        }}
        onNewGame={() => {
          fourOnlineActions.disconnect();
          openStartFlow("online", 4);
        }}
        onlineSession={{
          roomCode: fourOnline.snapshot.roomCode,
          role: fourOnline.role === "host" ? "host" : "peer",
          participantSeat: fourPlayerOnlineLocalSeat(fourOnline),
          status: fourOnline.snapshot.status === "paused"
            ? "paused"
            : fourOnline.snapshot.status === "finished"
              ? "finished"
              : "playing",
          awaitingSync: Boolean(fourOnline.awaitingActionId),
          undoConsent: fourOnline.snapshot.localUndoConsent,
          undoAvailable: fourOnline.snapshot.undoAvailable,
          pausedSeat,
          pausedParticipantName: fourOnline.snapshot.pausedParticipantName,
          onAction: fourOnlineActions.sendAction,
          onUndo: fourOnlineActions.requestUndo,
          onUndoConsentChange: fourOnlineActions.setUndoConsent,
          onReplaceWithAi: pausedSeat && fourOnline.role === "host"
            ? (difficulty) =>
              fourOnlineActions.replaceWithAi(pausedSeat, difficulty)
            : undefined,
        }}
      />
    );
  }

  if (startView === "none" && fourPlayerSession) {
    return (
      <>
        {saveError && (
          <div className="save-error-banner" role="alert">
            <span>{saveError}</span>
            <button onClick={() => setSaveError(undefined)} aria-label="Dismiss save error"><X size={15} /></button>
          </div>
        )}
        <FourPlayerGame
          key={fourPlayerSession.key}
          initialState={fourPlayerSession.state}
          onAchievementTransition={(before, after, action) => {
            const localActors = FOUR_PLAYER_SEATS.filter((seat) => {
              const control = before.players[seat].control;
              return control.kind === "human" && control.local !== false;
            });
            recordAchievementTransition({
              variant: "four-player",
              matchId: fourPlayerSession.key,
              localActors,
              before,
              after,
              action,
            });
          }}
          initialUndoHistory={fourPlayerSession.undoHistory}
          initialTurnStart={fourPlayerSession.turnStart}
          undoPreferred={undoPreferred}
          onUndoPreferenceChange={changeUndoPreference}
          onPersist={fourPlayerSession.challengeId
            ? undefined
            : persistFourPlayerGame}
          onChallengeComplete={recordChallengeCompletion}
          onQuit={() => {
            setFourPlayerSession(undefined);
            setStartView(
              fourPlayerSession.challengeId ? "puzzles" : "menu",
            );
          }}
          onNewGame={() => {
            if (fourPlayerSession.challengeId) {
              beginChallenge(fourPlayerSession.challengeId);
              return;
            }
            setFourPlayerSession(undefined);
            setSetupCategory("local");
            setSetupPlayerCount(undefined);
            setSetupReturnView("play");
            setStartView("four-setup");
          }}
        />
      </>
    );
  }

  if (startView === "none" && threePlayerSession) {
    const threePlayerPuzzle = threePlayerSession.puzzleId
      ? THREE_PLAYER_PUZZLE_BY_ID[threePlayerSession.puzzleId]
      : undefined;
    return (
      <ThreePlayerGame
        key={threePlayerSession.key}
        initialState={threePlayerSession.state}
        onAchievementTransition={(before, after, action) => {
          if (threePlayerPuzzle) return;
          const localActors = (["white", "red", "black"] as const).filter(
            (seat) => {
              const control = before.players[seat].control;
              return control.kind === "human" && control.local !== false;
            },
          );
          recordAchievementTransition({
            variant: "three-player",
            matchId: threePlayerSession.key,
            localActors,
            before,
            after,
            action,
          });
        }}
        initialUndoHistory={threePlayerSession.undoHistory}
        initialTurnStart={threePlayerSession.turnStart}
        undoPreferred={undoPreferred}
        onUndoPreferenceChange={changeUndoPreference}
        onPersist={threePlayerPuzzle || threePlayerSession.challengeId
          ? undefined
          : persistThreePlayerGame}
        puzzle={threePlayerPuzzle}
        onPuzzleComplete={recordPuzzleCompletion}
        onRestartPuzzle={threePlayerPuzzle
          ? () => beginPuzzle(threePlayerPuzzle.id)
          : undefined}
        onNextPuzzle={threePlayerPuzzle
          ? () => nextThreePlayerPuzzle(threePlayerPuzzle.id)
          : undefined}
        onChallengeComplete={recordChallengeCompletion}
        onQuit={() => {
          setThreePlayerSession(undefined);
          setStartView(
            threePlayerPuzzle || threePlayerSession.challengeId
              ? "puzzles"
              : "menu",
          );
        }}
        onNewGame={() => {
          if (threePlayerSession.challengeId) {
            beginChallenge(threePlayerSession.challengeId);
            return;
          }
          setThreePlayerSession(undefined);
          setSetupCategory("local");
          setSetupPlayerCount(undefined);
          setSetupReturnView("play");
          setStartView("three-setup");
        }}
      />
    );
  }

  return (
    <>
      {saveError && (
        <div className="save-error-banner" role="alert">
          <span>{saveError}</span>
          <button onClick={() => setSaveError(undefined)} aria-label="Dismiss save error"><X size={15} /></button>
        </div>
      )}
      {state.phase === "draft"
        ? (
          <DraftScreen
            state={state}
            dispatch={dispatch}
            onQuickDraft={
              state.gameMode === "online" ||
                state.gameMode === "simulation"
                ? undefined
                : quickDraft
            }
            inputDisabled={inputDisabled}
          />
        )
        : (
          <GameScreen
            state={state}
            dispatch={dispatch}
            inputDisabled={inputDisabled}
            opponentColor={opponentColor}
            onlineRoomCode={online.roomCode}
            onlineError={online.error}
            undoEnabled={undoEnabled}
            canUndo={canUndo}
            onUndo={requestUndo}
            onOpenSettings={() => setSettingsOpen(true)}
            onLeave={
              state.gameMode === "simulation"
                ? quitWithoutSaving
                : state.challengeId
                  ? () => setStartView("puzzles")
                  : state.gameMode === "online" || state.gameMode === "puzzle"
                    ? openNewGame
                    : () => void saveAndQuit()
            }
            leaveLabel={
              state.gameMode === "simulation"
                ? "Quit simulation"
                : state.gameMode === "online"
                  ? "Leave room"
                  : state.gameMode === "puzzle"
                    ? "Leave puzzle"
                    : state.challengeId
                      ? "Leave challenge"
                      : "Save & quit"
            }
            onQuitWithoutSaving={
              state.gameMode === "local" && !state.challengeId
                ? quitWithoutSaving
                : undefined
            }
            onRestart={openNewGame}
            onRestartPuzzle={restartPuzzle}
            onNextPuzzle={nextPuzzle}
          />
        )}
      {settingsOpen && (
        <SettingsModal
          undoPreferred={undoPreferred}
          onlineSession={onlineSession}
          localConsent={onlineSession ? localUndoConsent : undoPreferred}
          remoteConsent={onlineSession ? remoteUndoConsent : false}
          onUndoPreferenceChange={changeUndoPreference}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {simulationExport && (
        <SimulationExportDialog
          data={simulationExport}
          onQuit={quitWithoutSaving}
        />
      )}
      {startView === "none" && state.phase === "draft" && (
        <MatchEscapeMenu
          onOpenSettings={state.gameMode === "puzzle"
            ? undefined
            : () => setSettingsOpen(true)}
          onLeave={
            state.gameMode === "simulation"
              ? quitWithoutSaving
              : state.challengeId
                ? () => setStartView("puzzles")
                : state.gameMode === "online" || state.gameMode === "puzzle"
                  ? openNewGame
                  : () => void saveAndQuit()
          }
          leaveLabel={
            state.gameMode === "simulation"
              ? "Quit simulation"
              : state.gameMode === "online"
                ? "Leave room"
                : state.gameMode === "puzzle"
                  ? "Leave puzzle"
                  : state.challengeId
                    ? "Leave challenge"
                    : "Save & quit"
          }
          onQuitWithoutSaving={
            state.gameMode === "local" && !state.challengeId
                ? quitWithoutSaving
                : undefined
          }
        />
      )}
    </>
  );
}
