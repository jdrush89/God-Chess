import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
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
  Hexagon,
  History,
  Info,
  LoaderCircle,
  Magnet,
  Menu,
  Coins,
  Rabbit,
  RotateCcw,
  Save,
  Settings,
  Shield,
  Skull,
  Snowflake,
  Sparkles,
  Swords,
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
  chooseAiPlan,
  isAiTurn,
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
  type GameAction,
} from "./game/engine";
import { createFourPlayerGame } from "./game/fourPlayerEngine";
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
import { randomItem } from "./game/random";
import type { Ability, ActionPresentation, CaptureAnimation, ClassicMoveFirstCandidate, ClassicMoveFirstMove, Color, GameMode, GameState, GodId, OrbAnimation, OrbColor, Piece, PuzzleId, Square } from "./game/types";
import { AccountModal } from "./account/AccountModal";
import { deleteCloudSavedGame, loadCloudSavedGames, upsertCloudSavedGame } from "./account/cloudSaves";
import {
  loadCloudCompletedPuzzles,
  upsertCloudCompletedPuzzles,
} from "./account/cloudPuzzleProgress";
import { useAccount, type AccountProfile } from "./account/useAccount";
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
  GodPortrait,
  PlayerAbilityCard as AbilityCard,
} from "./PlayerGodPanel";
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
  isFourPlayerSavedGame,
  isThreePlayerSavedGame,
  type SavedGame,
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

interface FourPlayerSession {
  key: string;
  state: FourPlayerState;
  undoHistory: FourPlayerState[];
  turnStart?: FourPlayerState;
}

interface ThreePlayerSession {
  key: string;
  state: ThreePlayerState;
  undoHistory: ThreePlayerState[];
  turnStart?: ThreePlayerState;
}

const PIECES: Record<Color, Record<Piece["type"], string>> = {
  white: { king: "♔", queen: "♕", rook: "♖", bishop: "♗", knight: "♘", pawn: "♙" },
  black: { king: "♚", queen: "♛", rook: "♜", bishop: "♝", knight: "♞", pawn: "♟" },
};

const TITLE_ART = new URL("./assets/title/god-chess-title.jpg", import.meta.url).href;
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

const statusMarkers: {
  key: keyof Piece["status"];
  label: string;
  icon: LucideIcon;
}[] = [
  { key: "hardened", label: "Hardened", icon: Shield },
  { key: "frozen", label: "Stone", icon: Snowflake },
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
    const ritualLevel = abilityLevel(state.players[piece.status.ritual.owner].upgrades, "ritual-sacrifice");
    const reward = ritualLevel >= 3 ? 4 : 3;
    const duration = piece.status.ritual.expires === "kangus"
      ? "before Kangus’ next turn"
      : `before turn ${piece.status.ritual.expires}`;
    markers.push({
      name: "Goad",
      description: `If captured ${duration}, ${colorLabel(piece.status.ritual.owner)} gains ${reward} white and ${reward} black orbs.`,
    });
  }
  if (piece.status.markedForDeath) {
    markers.push({
      name: "Marked for Death",
      description: `If still alive at the end of ${colorLabel(piece.status.markedForDeath.owner)}’s next Death action, the Mark kills it and grants that player 3 black orbs. If it dies first, there is no Mark reward.`,
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

function GodSigil({ godId, size = "normal" }: { godId: GodId; size?: "small" | "normal" | "large" }) {
  const god = GOD_BY_ID[godId];
  return (
    <span
      className={`god-sigil ${size}`}
      style={{ "--accent": god.accent } as React.CSSProperties}
      aria-hidden="true"
    >
      <GodPortrait godId={godId} />
    </span>
  );
}

function DraftScreen({
  state,
  dispatch,
  onQuickDraft,
  onSaveAndQuit,
  onOpenSettings,
  inputDisabled = false,
}: {
  state: GameState;
  dispatch: GameDispatch;
  onQuickDraft?: () => void;
  onSaveAndQuit?: () => void;
  onOpenSettings: () => void;
  inputDisabled?: boolean;
}) {
  const [inspected, setInspected] = useState<GodId>(state.draft.available[0]);
  const [godPreviewLevel, setGodPreviewLevel] = useState<number>();
  const activePlayer = state.players[state.activeColor];
  const currentGod = GOD_BY_ID[inspected];

  useEffect(() => {
    setGodPreviewLevel(undefined);
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
        <div className="header-actions">
          {onSaveAndQuit && (
            <button onClick={onSaveAndQuit}><Save size={18} /><span>Save & quit</span></button>
          )}
          <button onClick={onOpenSettings}><Settings size={18} /><span>Settings</span></button>
        </div>
      </header>

      <section className="draft-hero">
        <p className="eyebrow">THE PANTHEON AWAITS</p>
        <h1>Choose your gods.</h1>
        <p>Each player claims three divine allies in a 1–2–2–1 snake draft.</p>
        <div className="draft-auto-actions">
          <button
            className="auto-draft-button"
            disabled={inputDisabled || state.draft.pickIndex >= state.draft.order.length}
            onClick={() => dispatch({
              type: "auto-draft",
              godId: shuffled(state.draft.available)[0],
            })}
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
            return (
              <button
                className={`draft-card ${inspected === god.id ? "inspected" : ""} ${owner ? "claimed" : ""}`}
                key={god.id}
                onClick={() => setInspected(god.id)}
                style={{ "--accent": god.accent } as React.CSSProperties}
              >
                <GodPortrait godId={god.id} className="god-card-portrait" />
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
            <GodPortrait godId={currentGod.id} className="god-hero-portrait" />
            <div>
              <p>{currentGod.domain}</p>
              <h2>{currentGod.name}</h2>
              <span>{currentGod.epithet}</span>
            </div>
          </div>
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
            onClick={() => dispatch({ type: "draft", godId: currentGod.id })}
            disabled={inputDisabled || !state.draft.available.includes(currentGod.id)}
          >
            Claim {currentGod.name}<ChevronRight size={17} />
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
              {state.players[color].gods.map((godId) => <GodSigil godId={godId} size="small" key={godId} />)}
              {Array.from({ length: 3 - state.players[color].gods.length }).map((_, index) => <i className="empty-sigil" key={index} />)}
            </div>
          </div>
        ))}
      </footer>
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
            {player.gods.map((godId) => {
              const resting = state.rested.includes(godId);
              const interactive = isActive && !resting;
              return (
                <button
                  className={resting ? "resting" : ""}
                  title={`${interactive ? "Use" : "View"} ${GOD_BY_ID[godId].name}${resting ? " · resting" : ""}`}
                  onClick={() => {
                    setToolsOpen(false);
                    onGodClick(godId, color);
                  }}
                  key={godId}
                >
                  <GodSigil godId={godId} size="small" />
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
  const statuses = statusMarkers.filter(({ key }) => Boolean(piece.status[key]));
  return (
    <span
      className={`chess-piece ${piece.color} ${piece.status.hired ? "hired" : ""}`}
      data-piece-id={piece.id}
    >
      {PIECES[piece.color][piece.type]}
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
    <div className="board-shell">
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
        <p>Not committed. Choose which God’s first ability applies this move.</p>
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
              footerAction={candidate.requiresPreMoveChoice ? "PRE-MOVE CHOICE" : "COMMIT MOVE"}
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
      <div className="action-buttons">
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
          <button className="text-button" onClick={() => dispatch({ type: "cancel" })}>
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
  const presentedGodResting = Boolean(selectedGod && state.rested.includes(selectedGod.id));
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
      {state.pending?.abilityId === "snipe-shot" ? (
        <>
          <div className="prepared-shot-panel">
            <Swords size={28} />
            <span>ARTEMIS · SNIPE</span>
            <h3>Prepared Shot available</h3>
            <p>
              {state.pending.step === "snipe-source"
                ? "Select a highlighted prepared piece on the board."
                : "Now select one of the highlighted enemy pieces it attacks."}
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
            {player.gods.map((godId) => {
              const god = GOD_BY_ID[godId];
              const resting = state.rested.includes(godId);
              return (
                <button
                  className={`god-row ${resting ? "resting" : ""}`}
                  key={godId}
                  onClick={() => resting ? onInspectGod(godId) : dispatch({ type: "select-god", godId })}
                  style={{ "--accent": god.accent } as React.CSSProperties}
                >
                  <GodPortrait godId={godId} className="god-row-portrait" />
                  <span className="god-row-copy"><strong>{god.name}</strong><small>{resting ? "RESTING · VIEW" : god.domain}</small></span>
                  {resting ? <i className="rest-token">Z</i> : <ChevronRight size={17} />}
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
            <GodPortrait godId={selectedGod.id} className="god-hero-portrait" />
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
    state.upgradePreview?.godId,
    state.upgradePreview?.abilityId,
  ]);

  const presentedAbilityId = presentation?.abilityId ??
    (state.upgradePreview?.godId === presentedGodId ? state.upgradePreview?.abilityId : undefined) ??
    selectedAbilityId;
  const selectedAbility = selectedGod?.abilities.find((ability) => ability.id === presentedAbilityId);
  const selectedAbilityLevel = selectedAbility
    ? abilityLevel(selectedPlayer.upgrades, selectedAbility.id)
    : undefined;
  const activePlayer = state.players[state.activeColor];
  const queuedAbilityId = state.upgradePreview?.abilityId ?? selectedAbilityId;
  const queuedGod = activePlayer.gods
    .map((godId) => GOD_BY_ID[godId])
    .find((god) => god.abilities.some((ability) => ability.id === queuedAbilityId));
  const queuedAbility = queuedGod?.abilities.find((ability) => ability.id === queuedAbilityId);
  const queuedAbilityLevel = queuedAbility
    ? abilityLevel(activePlayer.upgrades, queuedAbility.id)
    : undefined;
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
            {activePlayer.gods.map((godId) => {
              const god = GOD_BY_ID[godId];
              return (
                <section key={godId}>
                  <div className="four-panel-god-heading">
                    <GodPortrait godId={godId} />
                    <strong>{god.name}</strong>
                    <small>{god.domain}</small>
                  </div>
                  {god.abilities.map((ability) => {
                    const level = abilityLevel(activePlayer.upgrades, ability.id);
                    return (
                      <AbilityCard
                        ability={ability}
                        level={level}
                        previewLevel={godPreviewLevel}
                        active={state.upgradePreview?.abilityId === ability.id}
                        selectable={level < 3}
                        disabled={level >= 3}
                        footerLabel={`CURRENT LVL ${level}`}
                        footerAction={level >= 3 ? "MAX LEVEL" : `SELECT LVL ${level + 1}`}
                        onClick={() => {
                          setSelectedAbilityId(ability.id);
                          dispatch({
                            type: "preview-upgrade",
                            godId: god.id,
                            abilityId: ability.id,
                          });
                        }}
                        key={ability.id}
                      />
                    );
                  })}
                </section>
              );
            })}
          </div>
          <div className="upgrade-confirmation">
            <button
              className="primary-button"
              disabled={!queuedAbility || queuedAbilityLevel === undefined || queuedAbilityLevel >= 3}
              onClick={() => {
                if (queuedAbility) {
                  dispatch({ type: "upgrade", abilityId: queuedAbility.id });
                }
              }}
            >
              {queuedAbility && queuedAbilityLevel !== undefined
                ? `Confirm ${queuedAbility.name} · Lv ${queuedAbilityLevel + 1}`
                : "Select an ability to upgrade"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div
            className={`chosen-god ${presentation && !presentation.abilityId ? "opponent-selecting" : ""}`}
            style={{ "--accent": selectedGod.accent } as React.CSSProperties}
          >
            <GodPortrait godId={selectedGod.id} className="god-hero-portrait" />
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
              return (
                <AbilityCard
                  ability={ability}
                  level={level}
                  previewLevel={godPreviewLevel}
                  active={presentedAbilityId === ability.id}
                  highlighted={presentation?.abilityId === ability.id}
                  selectable={canUpgrade}
                  disabled={!readOnly && level >= 3}
                  footerLabel={`CURRENT LVL ${level}`}
                  footerAction={readOnly ? "VIEW ONLY" : level >= 3 ? "MAX LEVEL" : `SELECT LVL ${level + 1}`}
                  onClick={() => {
                    setSelectedAbilityId(ability.id);
                    dispatch({
                      type: "preview-upgrade",
                      godId: selectedGod.id,
                      abilityId: ability.id,
                    });
                  }}
                  key={ability.id}
                />
              );
            })}
          </div>
          {!readOnly && (
            <div className="upgrade-confirmation">
              <button
                className="primary-button"
                disabled={!selectedAbility || selectedAbilityLevel === undefined || selectedAbilityLevel >= 3}
                onClick={() => {
                  if (selectedAbility) dispatch({ type: "upgrade", abilityId: selectedAbility.id });
                }}
              >
                {selectedAbility && selectedAbilityLevel !== undefined
                  ? `Confirm ${selectedAbility.name} · Lv ${selectedAbilityLevel + 1}`
                  : "Select an ability to upgrade"}
              </button>
            </div>
          )}
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
        <button className="close-button" onClick={onClose}><X size={20} /></button>
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

function MainMenu({
  saveError,
  account,
  accountConfigured,
  accountLoading,
  accountWorking,
  accountError,
  onStart,
  onSignIn,
  onSignUp,
  onSignOut,
  onUpdateDisplayName,
}: {
  saveError?: string;
  account?: AccountProfile;
  accountConfigured: boolean;
  accountLoading: boolean;
  accountWorking: boolean;
  accountError?: string;
  onStart: () => void;
  onSignIn: (email: string, password: string) => Promise<string>;
  onSignUp: (email: string, password: string, displayName: string) => Promise<string>;
  onSignOut: () => Promise<void>;
  onUpdateDisplayName: (displayName: string) => Promise<string>;
}) {
  const [accountOpen, setAccountOpen] = useState(false);
  return (
    <section className="main-menu-screen">
      <img className="main-menu-art" src={TITLE_ART} alt="God Chess" />
      <div className="main-menu-shade" />
      <span className="game-version">Version {GAME_VERSION}</span>
      <button className="main-account-button" onClick={() => setAccountOpen(true)}>
        <UserRound size={16} />
        {accountLoading ? "Account" : account?.displayName ?? "Sign in"}
      </button>
      <div className="main-menu-actions">
        <p className="eyebrow">THE DIVINE GAME</p>
        <button className="primary-button main-start-button" onClick={onStart}>
          Start
        </button>
        {saveError && <p className="main-menu-error" role="alert">{saveError}</p>}
      </div>
      {accountOpen && (
        <AccountModal
          account={account}
          configured={accountConfigured}
          loading={accountLoading}
          working={accountWorking}
          serviceError={accountError}
          onClose={() => setAccountOpen(false)}
          onSignIn={onSignIn}
          onSignUp={onSignUp}
          onSignOut={onSignOut}
          onUpdateDisplayName={onUpdateDisplayName}
        />
      )}
    </section>
  );
}

function PlayMenu({
  savedGames,
  savesLoading,
  saveError,
  account,
  onBack,
  onOpenLocal,
  onOpenOnline,
  onOpenPuzzles,
  onOpenLoad,
}: {
  savedGames: SavedGame[];
  savesLoading: boolean;
  saveError?: string;
  account?: AccountProfile;
  onBack: () => void;
  onOpenLocal: () => void;
  onOpenOnline: () => void;
  onOpenPuzzles: () => void;
  onOpenLoad: () => void;
}) {
  const loadDescription = savesLoading
    ? "Loading saved games."
    : savedGames.length === 0
      ? "No saved games available."
      : `${savedGames.length} ${account ? "cloud " : ""}saved game${savedGames.length === 1 ? "" : "s"} available.`;
  return (
    <SetupNavigationShell backLabel="Back to title" onBack={onBack}>
      <div className="play-menu-heading">
        <p className="eyebrow">PLAY</p>
        <h1>Choose your path.</h1>
        <p>Begin a local match, meet online, solve a puzzle, or continue a saved game.</p>
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

function SavedGameLibrary({
  savedGames,
  savesLoading,
  onLoad,
  onDelete,
}: {
  savedGames: SavedGame[];
  savesLoading: boolean;
  onLoad: (game: SavedGame) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="load-game-library shell-library">
      <p className="eyebrow">SAVED PANTHEONS</p>
      <h2>Load game</h2>
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
                              <GodSigil godId={godId} size="small" />
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
                                <GodSigil godId={godId} size="small" />
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
                          <GodSigil godId={godId} size="small" />
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
  category,
  initialPlayerCount,
  onStart,
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
  category: StartCategory;
  initialPlayerCount?: PlayerCount;
  onStart: (mode: Exclude<GameMode, "online" | "puzzle">, difficulty: number) => void;
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
  progressLoading,
  progressError,
  onStartPuzzle,
  onBack,
  onDismissError,
}: {
  completedPuzzles: Set<PuzzleId>;
  progressLoading: boolean;
  progressError?: string;
  onStartPuzzle: (puzzleId: PuzzleId) => void;
  onBack: () => void;
  onDismissError: () => void;
}) {
  const [difficulty, setDifficulty] = useState<PuzzleDifficulty>();
  const visiblePuzzles = difficulty
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
              Capture the opposing King while a level 10 Divine AI searches for its best response.
            </p>
            <div className="puzzle-difficulty-grid">
              {([
                {
                  id: "easy",
                  title: "Easy",
                  description: "Win in one divine turn.",
                },
                {
                  id: "medium",
                  title: "Medium",
                  description: "Build a winning line across two divine turns.",
                },
              ] as const).map((option) => {
                const puzzles = PUZZLES.filter((puzzle) => puzzle.difficulty === option.id);
                const completed = puzzles.filter((puzzle) => completedPuzzles.has(puzzle.id)).length;
                return (
                  <button
                    className="puzzle-difficulty-card"
                    key={option.id}
                    onClick={() => setDifficulty(option.id)}
                  >
                    <Crosshair size={28} />
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
            <h1>{difficulty === "easy" ? "Easy" : "Medium"} puzzles</h1>
            <p className="puzzle-select-intro">
              {progressLoading
                ? "Loading completion history..."
                : `${completedInDifficulty} of ${visiblePuzzles.length} positions completed`}
            </p>
            <div className="puzzle-select-grid">
              {visiblePuzzles.map((puzzle) => {
                const index = PUZZLES.findIndex((candidate) => candidate.id === puzzle.id);
                const completed = completedPuzzles.has(puzzle.id);
                return (
                  <button
                    className={`puzzle-select-card${completed ? " completed" : ""}`}
                    key={puzzle.id}
                    onClick={() => onStartPuzzle(puzzle.id)}
                    aria-label={`Puzzle ${index + 1}, ${puzzle.title}${completed ? ", completed" : ""}`}
                  >
                    {completed && (
                      <span className="puzzle-complete-badge" aria-hidden="true">
                        <Check size={22} strokeWidth={3} />
                      </span>
                    )}
                    <span>PUZZLE {index + 1}</span>
                    <strong>{puzzle.title}</strong>
                    <small>Win in {puzzle.playerTurns === 1 ? "one" : "two"} divine turn{puzzle.playerTurns === 1 ? "" : "s"}</small>
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
  onSaveAndQuit,
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
}: {
  state: GameState;
  dispatch: GameDispatch;
  onSaveAndQuit: () => void;
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
}) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [puzzleHintOpen, setPuzzleHintOpen] = useState(false);
  const [inspectedGodId, setInspectedGodId] = useState<GodId>();
  const [inspectedSquare, setInspectedSquare] = useState<Square>();
  const [moveFirstDraft, setMoveFirstDraft] = useState<MoveFirstDraft>();
  const [graveyardColor, setGraveyardColor] = useState<Color>();
  const gameFinished = !state.puzzleId && state.phase === "gameover";
  const [resultOpen, setResultOpen] = useState(gameFinished);
  const kingInCheck = state.phase === "play" && isInCheck(state.board, state.activeColor, state.bananas);
  const puzzle = state.puzzleId ? PUZZLE_BY_ID[state.puzzleId] : undefined;
  const difficultyPuzzles = puzzle
    ? PUZZLES.filter((candidate) => candidate.difficulty === puzzle.difficulty)
    : [];
  const puzzleIndex = puzzle
    ? difficultyPuzzles.findIndex((candidate) => candidate.id === puzzle.id)
    : -1;
  const puzzleSolved = Boolean(
    puzzle &&
    state.phase === "gameover" &&
    state.winner &&
    state.winner !== state.aiColor,
  );
  const puzzleFailed = Boolean(
    puzzle &&
    state.puzzleFailed &&
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
    setResultOpen(gameFinished);
  }, [gameFinished, state]);

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
    if (color === state.activeColor && !state.rested.includes(godId)) {
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
    <main className={`game-page ${puzzle ? "puzzle-mode" : ""} ${state.lastAction ? "has-last-action" : ""} ${gameFinished ? "finished-view" : ""} ${inputDisabled || opponentPresentation ? "input-locked" : ""}`}>
      <header className="topbar">
        <Brand />
        <div className="game-meta">
          <span>ROUND <strong>{state.round}</strong></span>
          <i />
          <span>TURN <strong>{state.turn}</strong></span>
          {onlineRoomCode && <><i /><span>ROOM <strong>{onlineRoomCode}</strong></span></>}
        </div>
        <div className="header-actions">
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
          {state.gameMode !== "online" && state.gameMode !== "puzzle" && (
            <button onClick={onSaveAndQuit}>
              <Save size={18} />
              <span>Save & quit</span>
            </button>
          )}
          <button onClick={() => setHistoryOpen(!historyOpen)}><History size={18} /><span>History</span></button>
          <button onClick={() => setRulesOpen(true)}><BookOpen size={18} /><span>Rules</span></button>
          {state.gameMode !== "puzzle" && (
            <button onClick={onOpenSettings}><Settings size={18} /><span>Settings</span></button>
          )}
          <button onClick={onRestart}>
            <RotateCcw size={18} />
            <span>{puzzle ? "Puzzles" : "New game"}</span>
          </button>
        </div>
      </header>

      {puzzle && (
        <section className="puzzle-banner">
          <div className="puzzle-banner-title">
            <Crosshair size={18} />
            <span>PUZZLE {puzzleIndex + 1} OF {difficultyPuzzles.length}</span>
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

      {onlineError && (
        <div className="connection-warning">
          <Wifi size={16} />
          <strong>Connection lost.</strong>
          <span>{onlineError}</span>
          <button onClick={onRestart}>Return to game setup</button>
        </div>
      )}
      <div className={`turn-notice ${kingInCheck ? "check" : ""}`}>
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
        <div className="side-column">
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
      {puzzleSolved && puzzleVictoryReady && puzzle && (
        <div className="modal-backdrop">
          <section className="gameover-modal">
            <div className="victory-crown"><Crown size={38} /></div>
            <p className="eyebrow">PUZZLE SOLVED</p>
            <h2>{puzzle.title}</h2>
            <p>You found a winning line and captured the opposing King.</p>
            <div className="puzzle-result-actions">
              <button className="primary-button" onClick={onNextPuzzle}>
                {puzzleIndex === difficultyPuzzles.length - 1 ? "Choose another puzzle" : "Next puzzle"}
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
            <p>The level 10 Divine AI found its best response. Use the hint or restart from the original position.</p>
            <div className="puzzle-result-actions">
              <button className="primary-button" onClick={onRestartPuzzle}>Retry puzzle</button>
              <button className="secondary-button" onClick={onRestart}>Choose another puzzle</button>
            </div>
          </section>
        </div>
      )}
      {gameFinished && (
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
          newGameLabel="Begin a new game"
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
  const savedGames = accountService.account ? cloudSavedGames : localSavedGames;
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
  const savedGamesRef = useRef(savedGames);
  savedGamesRef.current = savedGames;
  const activeSaveId = useRef<string | undefined>(undefined);
  const [startView, setStartView] = useState<"menu" | "play" | "load" | "setup" | "three-setup" | "four-setup" | "puzzles" | "none">("menu");
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
  const quickDraftPending = useRef(false);
  const undoStack = useRef<GameState[]>([]);
  const undoDepthRef = useRef(0);
  const turnStart = useRef<GameState | undefined>(undefined);
  const cloudSaveQueue = useRef<Promise<void>>(Promise.resolve());

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
          setCloudPuzzleProgress({ completed: [] });
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
    const puzzleId = state.puzzleId;
    const solved =
      puzzleId &&
      state.gameMode === "puzzle" &&
      state.phase === "gameover" &&
      state.winner &&
      state.winner !== state.aiColor;
    if (!solved || !puzzleId) return;

    const account = accountService.account;
    if (account) {
      if (cloudPuzzleProgress.userId !== account.userId || puzzleProgressLoading) return;
      if (cloudPuzzleProgress.completed.includes(puzzleId)) return;
      const previous = cloudPuzzleProgress.completed;
      const completed = [...previous, puzzleId];
      setCloudPuzzleProgress({ userId: account.userId, completed });
      void upsertCloudCompletedPuzzles(account.userId, completed).catch((error) => {
        console.error("Unable to save cloud puzzle progress.", error);
        setCloudPuzzleProgress({ userId: account.userId, completed: previous });
        setSaveError(error instanceof Error ? error.message : "Unable to save puzzle progress.");
      });
      return;
    }

    if (localCompletedPuzzles.includes(puzzleId)) return;
    const completed = [...localCompletedPuzzles, puzzleId];
    try {
      persistLocalCompletedPuzzles(completed);
      setLocalCompletedPuzzles(completed);
    } catch (error) {
      console.error("Unable to save local puzzle progress.", error);
      setSaveError(error instanceof Error ? error.message : "Unable to save puzzle progress.");
    }
  }, [
    accountService.account?.userId,
    cloudPuzzleProgress,
    localCompletedPuzzles,
    puzzleProgressLoading,
    state.aiColor,
    state.gameMode,
    state.phase,
    state.puzzleId,
    state.winner,
  ]);

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
    const next = applyTrackedAction(current, action);
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
    try {
      while (stateRef.current.phase === "draft") {
        const godId = randomItem(stateRef.current.draft.available);
        if (!godId) break;
        dispatch({ type: "draft", godId });
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
      stateRef.current.gameMode === "puzzle"
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

  useEffect(() => {
    if (
      startView !== "none" ||
      fourPlayerSession ||
      threePlayerSession ||
      threeOnlineActive ||
      state.gameMode === "online" ||
      state.gameMode === "puzzle"
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
      let worker: Worker | undefined;
      let planningTimer: number | undefined;
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
        worker?.terminate();
        worker = undefined;
        if (!actions.length && requestedState.phase === "play") {
          dispatch({
            type: "adjudicate-no-turn",
            activeColor: requestedState.activeColor,
            turn: requestedState.turn,
          });
          return;
        }
        aiPlan.current = actions;
        aiNoPlanState.current = actions.length ? undefined : requestedState;
        recordDiagnostic({
          category: "ai",
          event: "classic-plan-result",
          context: { variant: "classic", mode: requestedState.gameMode },
          data: { actions },
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
        acceptPlan(chooseAiPlan(requestedState));
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
              },
            });
            if (typeof Worker === "undefined") {
              acceptPlan(chooseAiPlan(requestedState));
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
              worker.postMessage({ requestId, state: requestedState });
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
        worker?.terminate();
      };
    }
    const action = aiPlan.current[0];
    if (!action) return;
    const timer = window.setTimeout(() => {
      if (stateRef.current !== state) return;
      aiPlan.current = aiPlan.current.slice(1);
      dispatch(action);
    }, aiActionDelay(action));
    return () => window.clearTimeout(timer);
  }, [aiPlanReady, fourPlayerSession, threePlayerSession, startView, state]);

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
        await deleteCloudSavedGame(account.userId, id);
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
  const openStartFlow = (
    category: StartCategory,
    playerCount?: PlayerCount,
    returnView: "menu" | "play" | "none" = "menu",
  ) => {
    setSetupCategory(category);
    setSetupPlayerCount(playerCount);
    setSetupReturnView(returnView);
    setStartView("setup");
  };
  const beginGame = (mode: Exclude<GameMode, "online" | "puzzle">, difficulty: number) => {
    onlineActions.disconnect();
    fourOnlineActions.disconnect();
    threeOnlineActions.disconnect();
    setFourPlayerSession(undefined);
    setThreePlayerSession(undefined);
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
  const beginFourPlayerGame = (config: FourPlayerConfig) => {
    onlineActions.disconnect();
    fourOnlineActions.disconnect();
    threeOnlineActions.disconnect();
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
    setFourPlayerSession(undefined);
    setThreePlayerSession(undefined);
    activeSaveId.current = undefined;
    const next = createPuzzleGame(puzzleId, accountService.account?.displayName);
    resetUndoTracking(next);
    receiveState(next);
    aiPlan.current = [];
    setSettingsOpen(false);
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
      setThreePlayerSession(undefined);
      setSetupCategory("local");
      setSetupPlayerCount(undefined);
      setSetupReturnView("play");
      setStartView("three-setup");
      return;
    }
    if (fourPlayerSession) {
      setFourPlayerSession(undefined);
      setSetupCategory("local");
      setSetupPlayerCount(undefined);
      setSetupReturnView("play");
      setStartView("four-setup");
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
    : state.gameMode === "online"
    ? onlineUndoEnabled(online)
    : undoPreferred;
  const undoStable =
    (state.phase === "play" || state.phase === "upgrade" || state.phase === "gameover") &&
    !state.selectedGod &&
    !state.selectedAbility;
  const canUndo = state.gameMode !== "puzzle" && undoEnabled && undoStable && (
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

  if (startView === "menu") {
    return (
      <MainMenu
        saveError={saveError}
        account={accountService.account}
        accountConfigured={accountService.configured}
        accountLoading={accountService.loading}
        accountWorking={accountService.working}
        accountError={accountService.error}
        onStart={() => setStartView("play")}
        onSignIn={accountService.signIn}
        onSignUp={accountService.signUp}
        onSignOut={accountService.signOut}
        onUpdateDisplayName={accountService.updateDisplayName}
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
        onBack={() => setStartView("menu")}
        onOpenLocal={() => openStartFlow("local", undefined, "play")}
        onOpenOnline={() => openStartFlow("online", undefined, "play")}
        onOpenPuzzles={() => setStartView("puzzles")}
        onOpenLoad={() => setStartView("load")}
      />
    );
  }

  if (startView === "load") {
    return (
      <SetupNavigationShell backLabel="Back to Play" onBack={() => setStartView("play")}>
        <SavedGameLibrary
          savedGames={savedGames}
          savesLoading={savesLoading || savesHydrating}
          onLoad={loadGame}
          onDelete={(id) => void deleteSavedGame(id)}
        />
      </SetupNavigationShell>
    );
  }

  if (startView === "puzzles") {
    return (
      <PuzzleSelectScreen
        completedPuzzles={completedPuzzles}
        progressLoading={puzzleProgressLoading}
        progressError={saveError}
        onStartPuzzle={beginPuzzle}
        onBack={() => setStartView("play")}
        onDismissError={() => setSaveError(undefined)}
      />
    );
  }

  if (startView === "four-setup") {
    return (
      <SetupNavigationShell
        backLabel="Back to Local"
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
        category={setupCategory}
        initialPlayerCount={setupPlayerCount}
        onStart={beginGame}
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
          initialUndoHistory={fourPlayerSession.undoHistory}
          initialTurnStart={fourPlayerSession.turnStart}
          undoPreferred={undoPreferred}
          onUndoPreferenceChange={changeUndoPreference}
          onPersist={persistFourPlayerGame}
          onQuit={() => {
            setFourPlayerSession(undefined);
            setStartView("menu");
          }}
          onNewGame={() => {
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
    return (
      <ThreePlayerGame
        key={threePlayerSession.key}
        initialState={threePlayerSession.state}
        initialUndoHistory={threePlayerSession.undoHistory}
        initialTurnStart={threePlayerSession.turnStart}
        undoPreferred={undoPreferred}
        onUndoPreferenceChange={changeUndoPreference}
        onPersist={persistThreePlayerGame}
        onQuit={() => setStartView("menu")}
        onNewGame={() => {
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
            onQuickDraft={state.gameMode === "online" ? undefined : quickDraft}
            inputDisabled={inputDisabled}
            onSaveAndQuit={state.gameMode === "online" ? undefined : saveAndQuit}
            onOpenSettings={() => setSettingsOpen(true)}
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
            onRestart={openNewGame}
            onRestartPuzzle={restartPuzzle}
            onNextPuzzle={nextPuzzle}
            onSaveAndQuit={saveAndQuit}
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
      {startView === "none" && (
        <MatchEscapeMenu
          onOpenSettings={state.gameMode === "puzzle"
            ? undefined
            : () => setSettingsOpen(true)}
          onLeave={state.gameMode === "online" || state.gameMode === "puzzle"
            ? openNewGame
            : () => void saveAndQuit()}
          leaveLabel={state.gameMode === "online"
            ? "Leave room"
            : state.gameMode === "puzzle"
              ? "Leave puzzle"
              : "Save & quit"}
        />
      )}
    </>
  );
}
