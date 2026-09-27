import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  BookOpen,
  ChevronRight,
  Copy,
  Crown,
  Download,
  Globe2,
  History,
  Info,
  LoaderCircle,
  RotateCcw,
  Save,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Users,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { allSquares, isInCheck } from "./game/chess";
import { chooseAiPlan, isAiTurn } from "./game/ai";
import { createGame, gameReducer, type GameAction } from "./game/engine";
import { abilityLevel, GOD_BY_ID, GODS } from "./game/gods";
import type { Ability, CaptureAnimation, Color, GameMode, GameState, GodId, OrbAnimation, OrbColor, Piece, Square } from "./game/types";
import { useOnlineGame, type OnlineGameState } from "./multiplayer/useOnlineGame";

type GameDispatch = (action: GameAction) => void;

const PIECES: Record<Color, Record<Piece["type"], string>> = {
  white: { king: "♔", queen: "♕", rook: "♖", bishop: "♗", knight: "♘", pawn: "♙" },
  black: { king: "♚", queen: "♛", rook: "♜", bishop: "♝", knight: "♞", pawn: "♟" },
};

const GOD_PORTRAITS: Record<GodId, string> = {
  quetzacoatl: new URL("./assets/gods/quetzacoatl.jpg", import.meta.url).href,
  chiron: new URL("./assets/gods/chiron.jpg", import.meta.url).href,
  anubis: new URL("./assets/gods/anubis.jpg", import.meta.url).href,
  teles: new URL("./assets/gods/teles.jpg", import.meta.url).href,
  artemis: new URL("./assets/gods/artemis.jpg", import.meta.url).href,
  kangus: new URL("./assets/gods/kangus.jpg", import.meta.url).href,
  death: new URL("./assets/gods/death.jpg", import.meta.url).href,
  leonidas: new URL("./assets/gods/leonidas.jpg", import.meta.url).href,
  medusa: new URL("./assets/gods/medusa.jpg", import.meta.url).href,
  salem: new URL("./assets/gods/salem.jpg", import.meta.url).href,
  midas: new URL("./assets/gods/midas.jpg", import.meta.url).href,
  ares: new URL("./assets/gods/ares.jpg", import.meta.url).href,
};

const TITLE_ART = new URL("./assets/title/god-chess-title.jpg", import.meta.url).href;

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

const SAVE_KEY = "god-chess-save-v1";

interface SavedGame {
  version: 1;
  savedAt: string;
  state: GameState;
}

const loadSavedGame = (): SavedGame | undefined => {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return undefined;
    const saved = JSON.parse(raw) as Partial<SavedGame>;
    if (
      saved.version !== 1 ||
      !saved.savedAt ||
      !saved.state ||
      !["draft", "play", "upgrade", "gameover"].includes(saved.state.phase) ||
      !saved.state.board ||
      !saved.state.players?.white ||
      !saved.state.players?.black
    ) {
      console.warn("Ignoring an invalid God Chess save.");
      window.localStorage.removeItem(SAVE_KEY);
      return undefined;
    }
    saved.state.orbAnimations = [];
    saved.state.nextOrbAnimationId ??= 1;
    saved.state.captureAnimations = [];
    saved.state.nextCaptureAnimationId ??= 1;
    saved.state.gameMode ??= "local";
    saved.state.aiDifficulty ??= 5;
    return saved as SavedGame;
  } catch (error) {
    console.error("Unable to load the saved God Chess game.", error);
    return undefined;
  }
};

const saveGameState = (state: GameState) => {
  try {
    const savedState = structuredClone(state);
    savedState.orbAnimations = [];
    savedState.captureAnimations = [];
    const savedAt = new Date().toISOString();
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, savedAt, state: savedState } satisfies SavedGame));
    return savedAt;
  } catch (error) {
    console.error("Unable to save the God Chess game.", error);
    return undefined;
  }
};

const statusLabels: [keyof Piece["status"], string][] = [
  ["hardened", "Hardened"],
  ["frozen", "Stone"],
  ["poisoned", "Poisoned"],
  ["polymorphed", "Polymorphed"],
  ["luredBy", "Lured"],
  ["hexedBy", "Hexed"],
  ["prepared", "Prepared"],
  ["ritual", "Ritual"],
  ["markedForDeath", "Marked"],
  ["hired", "Hired"],
  ["gazing", "Gazing"],
  ["chargeUntil", "Charged"],
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
      description: "This Queen cannot move while the piece targeted by Stone Gaze remains frozen.",
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
      name: "Ritual Sacrifice",
      description: `If captured ${duration}, ${colorLabel(piece.status.ritual.owner)} gains ${reward} white and ${reward} black orbs.`,
    });
  }
  if (piece.status.markedForDeath) {
    markers.push({
      name: "Marked for Death",
      description: `Dies when ${colorLabel(piece.status.markedForDeath.owner)} next calls Death, granting that player 3 black orbs.`,
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

function GodPortrait({ godId, className = "" }: { godId: GodId; className?: string }) {
  return (
    <img
      className={`god-portrait ${className}`}
      src={GOD_PORTRAITS[godId]}
      alt=""
      decoding="async"
    />
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

function LevelSelector({
  level,
  onChange,
  label = "Preview",
  className = "",
}: {
  level: number;
  onChange: (level: number) => void;
  label?: string;
  className?: string;
}) {
  const selectLevel = (event: React.MouseEvent<HTMLButtonElement>, nextLevel: number) => {
    event.stopPropagation();
    onChange(nextLevel);
  };

  return (
    <div className={`level-selector ${className}`} aria-label={`${label} levels`}>
      <span>{label}</span>
      <button
        type="button"
        aria-pressed={level >= 2}
        className={level >= 2 ? "active" : ""}
        onClick={(event) => selectLevel(event, level >= 2 ? 1 : 2)}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <i /> Lv 2
      </button>
      <button
        type="button"
        aria-pressed={level >= 3}
        className={level >= 3 ? "active" : ""}
        onClick={(event) => selectLevel(event, level >= 3 ? 2 : 3)}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <i /> Lv 3
      </button>
    </div>
  );
}

function AbilityRules({
  ability,
  level,
  previewLevelOverride,
  compact = false,
}: {
  ability: Ability;
  level: number;
  previewLevelOverride?: number;
  compact?: boolean;
}) {
  const [previewLevel, setPreviewLevel] = useState(previewLevelOverride ?? level);

  useEffect(() => {
    setPreviewLevel(previewLevelOverride ?? level);
  }, [ability.id, level, previewLevelOverride]);

  return (
    <div className={`ability-rules ${compact ? "compact" : ""}`}>
      <p>{ability.summary}</p>
      {previewLevel >= 2 && ability.details[1] && <p className="level-rule"><b>Lv 2:</b> {ability.details[1]}</p>}
      {previewLevel >= 3 && ability.details[2] && <p className="level-rule"><b>Lv 3:</b> {ability.details[2]}</p>}
      <LevelSelector
        level={previewLevel}
        onChange={setPreviewLevel}
        label="Preview"
        className="ability-level-selector"
      />
    </div>
  );
}

function DraftScreen({
  state,
  dispatch,
  onSaveAndQuit,
  inputDisabled = false,
}: {
  state: GameState;
  dispatch: GameDispatch;
  onSaveAndQuit?: () => void;
  inputDisabled?: boolean;
}) {
  const [inspected, setInspected] = useState<GodId>(state.draft.available[0]);
  const [godPreviewLevel, setGodPreviewLevel] = useState<number>();
  const activePlayer = state.players[state.activeColor];
  const currentGod = GOD_BY_ID[inspected];

  useEffect(() => {
    setGodPreviewLevel(undefined);
  }, [inspected]);

  return (
    <main className={`draft-page ${inputDisabled ? "input-locked" : ""}`}>
      <header className="topbar draft-topbar">
        <Brand />
        <div className="draft-turn">
          <span className={`turn-dot ${state.activeColor}`} />
          {activePlayer.name} · {state.activeColor} picks
        </div>
        {onSaveAndQuit && (
          <div className="header-actions">
            <button onClick={onSaveAndQuit}><Save size={18} /><span>Save & quit</span></button>
          </div>
        )}
      </header>

      <section className="draft-hero">
        <p className="eyebrow">THE PANTHEON AWAITS</p>
        <h1>Choose your gods.</h1>
        <p>Each player claims three divine allies in a 1–2–2–1 snake draft.</p>
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
  return (
    <section className={`player-bar ${color} ${isActive ? "active" : ""}`}>
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
      <button
        className={`graveyard-button ${graveyardArriving ? "arriving" : ""}`}
        onClick={() => onGraveyardClick(color)}
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
              onClick={() => onGodClick(godId, color)}
              key={godId}
            >
              <GodSigil godId={godId} size="small" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function PieceView({ piece }: { piece: Piece }) {
  const statuses = statusLabels.filter(([key]) => Boolean(piece.status[key]));
  return (
    <span className={`chess-piece ${piece.color} ${piece.status.hired ? "hired" : ""}`}>
      {PIECES[piece.color][piece.type]}
      {statuses.length > 0 && <i className="status-marker" title={statuses.map(([, label]) => label).join(", ")}>{statuses.length}</i>}
    </span>
  );
}

function ChessBoard({
  state,
  dispatch,
  onInspectSquare,
}: {
  state: GameState;
  dispatch: GameDispatch;
  onInspectSquare: (square: Square) => void;
}) {
  const displaySquares = useMemo(() => [...allSquares].sort((a, b) => Number(b[1]) - Number(a[1]) || a.localeCompare(b)), []);
  return (
    <div className="board-shell">
      <div className="board-frame">
        <div className="chess-board" role="grid" aria-label="God Chess board">
          {displaySquares.map((square) => {
            const [file, rank] = [square[0], square[1]];
            const piece = state.board[square];
            const selected = state.selectedSquare === square;
            const legal = state.legalTargets.includes(square);
            const banana = state.bananas.find((item) => item.square === square);
            return (
              <button
                role="gridcell"
                aria-label={`${square}${piece ? `, ${piece.color} ${piece.type}` : ""}`}
                data-square={square}
                className={`board-square ${(file.charCodeAt(0) + Number(rank)) % 2 ? "light" : "dark"} ${selected ? "selected" : ""} ${legal ? "legal" : ""} ${legal && piece ? "legal-occupied" : ""}`}
                key={square}
                onClick={() => {
                  onInspectSquare(square);
                  dispatch({ type: "square", square });
                }}
              >
                {file === "a" && <span className="rank-label">{rank}</span>}
                {rank === "1" && <span className="file-label">{file}</span>}
                {legal && !piece && <span className="move-dot" />}
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

function AbilityCard({
  ability,
  level,
  previewLevel,
  active,
  selectable,
  disabled,
  footerLabel,
  footerAction,
  showCost = true,
  onClick,
}: {
  ability: Ability;
  level: number;
  previewLevel?: number;
  active: boolean;
  selectable: boolean;
  disabled: boolean;
  footerLabel?: string;
  footerAction?: string;
  showCost?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={`ability-card ${active ? "active" : ""} ${disabled ? "disabled" : ""} ${!selectable && !disabled ? "read-only" : ""}`}
      role={selectable ? "button" : undefined}
      tabIndex={selectable ? 0 : undefined}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (selectable) onClick();
      }}
      onKeyDown={(event) => {
        if (selectable && (event.key === "Enter" || event.key === " ")) onClick();
      }}
    >
      <div className="ability-topline">
        <strong>{ability.name}</strong>
        <span className="level-pips">
          {[1, 2, 3].map((item) => <i className={item <= level ? "filled" : ""} key={item} />)}
        </span>
      </div>
      <AbilityRules ability={ability} level={level} previewLevelOverride={previewLevel} />
      <div className="ability-footer">
        <span>{footerLabel ?? `LVL ${level}`}</span>
        {footerAction
          ? <b className="upgrade-tag">{footerAction}</b>
          : showCost && (
            <div>
              {ability.cost?.white ? <Orb color="white" count={ability.cost.white} small /> : null}
              {ability.cost?.black ? <Orb color="black" count={ability.cost.black} small /> : null}
              {!ability.cost && <span className="free-tag">GENERATES</span>}
            </div>
          )}
      </div>
    </div>
  );
}

function ActionPanel({
  state,
  dispatch,
  inspectedGodId,
  onInspectGod,
  onCloseInspection,
}: {
  state: GameState;
  dispatch: GameDispatch;
  inspectedGodId?: GodId;
  onInspectGod: (godId: GodId) => void;
  onCloseInspection: () => void;
}) {
  const player = state.players[state.activeColor];
  const presentedGodId = inspectedGodId ?? state.selectedGod;
  const selectedGod = presentedGodId ? GOD_BY_ID[presentedGodId] : undefined;
  const inspectedOwner: Color = inspectedGodId && state.players.black.gods.includes(inspectedGodId) ? "black" : "white";
  const presentedPlayer = inspectedGodId ? state.players[inspectedOwner] : player;
  const readOnly = Boolean(inspectedGodId);
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
    <aside className="action-panel">
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
      ) : !selectedGod ? (
        <>
          <div className="panel-empty">
            <Sparkles size={25} />
            <h3>Call upon a god</h3>
            <p>Choose one available god. They will rest after completing an action.</p>
          </div>
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
          <div className="chosen-god" style={{ "--accent": selectedGod.accent } as React.CSSProperties}>
            <GodPortrait godId={selectedGod.id} className="god-hero-portrait" />
            <div><span>{selectedGod.domain}</span><h3>{selectedGod.name}</h3><p>{selectedGod.epithet}</p></div>
            <button
              className="god-back-button"
              onClick={() => readOnly ? onCloseInspection() : dispatch({ type: "clear-god" })}
              aria-label={readOnly ? "Close god details" : "Choose a different god"}
              title={readOnly ? "Close god details" : "Choose a different god"}
            >
              <ArrowLeft size={17} />
            </button>
          </div>
          {readOnly && (
            <div className={`inspection-banner ${presentedGodResting ? "resting" : ""}`}>
              <BookOpen size={14} />
              {presentedGodResting && inspectingOwnGod
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
            {selectedGod.abilities.map((item) => (
              <AbilityCard
                ability={item}
                level={abilityLevel(presentedPlayer.upgrades, item.id)}
                previewLevel={godPreviewLevel}
                active={!readOnly && state.selectedAbility === item.id}
                selectable={!readOnly && canAfford(item) && (item.id !== "lure" || hasQueen)}
                disabled={presentedGodResting || (!readOnly && (!canAfford(item) || (item.id === "lure" && !hasQueen)))}
                footerAction={!readOnly && item.id === "lure" && !hasQueen ? "REQUIRES QUEEN" : undefined}
                onClick={() => {
                  if (!readOnly) dispatch({ type: "select-ability", abilityId: item.id });
                }}
                key={item.id}
              />
            ))}
          </div>
          {!readOnly && state.selectedAbility && (
            <div className="action-buttons">
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
              {canPass && <button className="secondary-button" onClick={() => dispatch({ type: "pass" })}>Pass / finish</button>}
              <button className="text-button" onClick={() => dispatch({ type: "cancel" })}>Cancel ability</button>
            </div>
          )}
        </>
      )}
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
    </aside>
  );
}

function UpgradePanel({
  state,
  dispatch,
  selectedGodId,
  onSelectGod,
  onCloseGod,
}: {
  state: GameState;
  dispatch: GameDispatch;
  selectedGodId?: GodId;
  onSelectGod: (godId: GodId) => void;
  onCloseGod: () => void;
}) {
  const [godPreviewLevel, setGodPreviewLevel] = useState<number>();
  const [selectedAbilityId, setSelectedAbilityId] = useState<string>();
  const selectedGod = selectedGodId ? GOD_BY_ID[selectedGodId] : undefined;
  const selectedOwner: Color = selectedGodId && state.players.black.gods.includes(selectedGodId) ? "black" : "white";
  const selectedPlayer = state.players[selectedOwner];
  const readOnly = selectedOwner !== state.activeColor;
  const defaultGodPreviewLevel = selectedGod
    ? Math.min(...selectedGod.abilities.map((ability) => abilityLevel(selectedPlayer.upgrades, ability.id)))
    : 1;

  useEffect(() => {
    setGodPreviewLevel(undefined);
    setSelectedAbilityId(undefined);
  }, [selectedGodId, state.activeColor]);

  const selectedAbility = selectedGod?.abilities.find((ability) => ability.id === selectedAbilityId);
  const selectedAbilityLevel = selectedAbility
    ? abilityLevel(selectedPlayer.upgrades, selectedAbility.id)
    : undefined;

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
            <h3>Choose a God to strengthen</h3>
            <p>Select one of your gods below. You can inspect either player’s gods using the portraits beside the board.</p>
          </div>
          <div className="god-list">
            {state.players[state.activeColor].gods.map((godId) => {
              const god = GOD_BY_ID[godId];
              const maxed = god.abilities.every((ability) =>
                abilityLevel(state.players[state.activeColor].upgrades, ability.id) >= 3,
              );
              return (
                <button
                  className={`god-row ${maxed ? "maxed" : ""}`}
                  key={godId}
                  onClick={() => onSelectGod(godId)}
                  style={{ "--accent": god.accent } as React.CSSProperties}
                >
                  <GodPortrait godId={godId} className="god-row-portrait" />
                  <span className="god-row-copy">
                    <strong>{god.name}</strong>
                    <small>{maxed ? "ALL ABILITIES MAXED" : god.domain}</small>
                  </span>
                  <ChevronRight size={17} />
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="chosen-god" style={{ "--accent": selectedGod.accent } as React.CSSProperties}>
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
            {readOnly
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
                  active={selectedAbilityId === ability.id}
                  selectable={canUpgrade}
                  disabled={!readOnly && level >= 3}
                  footerLabel={`CURRENT LVL ${level}`}
                  footerAction={readOnly ? "VIEW ONLY" : level >= 3 ? "MAX LEVEL" : `SELECT LVL ${level + 1}`}
                  showCost={false}
                  onClick={() => setSelectedAbilityId(ability.id)}
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

function MainMenu({
  savedAt,
  onResume,
  onNewGame,
}: {
  savedAt?: string;
  onResume: () => void;
  onNewGame: () => void;
}) {
  return (
    <section className="main-menu-screen">
      <img className="main-menu-art" src={TITLE_ART} alt="God Chess" />
      <div className="main-menu-shade" />
      <div className="main-menu-actions">
        <p className="eyebrow">THE DIVINE GAME</p>
        <div>
          <button className="primary-button" onClick={onNewGame}>New game</button>
          {savedAt && (
            <button className="secondary-button" onClick={onResume}>Resume game</button>
          )}
        </div>
        {savedAt && <small>Saved {new Date(savedAt).toLocaleString()}</small>}
      </div>
    </section>
  );
}

function StartGamePrompt({
  online,
  canCancel,
  onStart,
  onHost,
  onJoin,
  onStartOnline,
  onCancel,
  onDisconnect,
}: {
  online: OnlineGameState;
  canCancel: boolean;
  onStart: (mode: Exclude<GameMode, "online">, difficulty: number) => void;
  onHost: (name: string) => void;
  onJoin: (code: string, name: string) => void;
  onStartOnline: () => void;
  onCancel: () => void;
  onDisconnect: () => void;
}) {
  const [mode, setMode] = useState<GameMode>("local");
  const [difficulty, setDifficulty] = useState(7);
  const [onlineAction, setOnlineAction] = useState<"host" | "join">("host");
  const [playerName, setPlayerName] = useState("Player");
  const [roomCode, setRoomCode] = useState("");

  const chooseMode = (nextMode: GameMode) => {
    if (mode === "online" && nextMode !== "online") onDisconnect();
    setMode(nextMode);
  };

  return (
    <div className="modal-backdrop">
      <section className="start-game-modal">
        {canCancel && <button className="close-button" onClick={onCancel}><X size={20} /></button>}
        <p className="eyebrow">CHOOSE YOUR MATCH</p>
        <h2>How will you play?</h2>
        <div className="game-mode-grid">
          <button className={mode === "local" ? "active" : ""} onClick={() => chooseMode("local")}>
            <Users size={24} />
            <strong>Local duel</strong>
            <span>Two players share this device.</span>
          </button>
          <button className={mode === "ai" ? "active" : ""} onClick={() => chooseMode("ai")}>
            <Bot size={24} />
            <strong>Divine AI</strong>
            <span>Challenge a computer opponent.</span>
          </button>
          <button className={mode === "online" ? "active" : ""} onClick={() => chooseMode("online")}>
            <Globe2 size={24} />
            <strong>Online versus</strong>
            <span>Host or join with a room code.</span>
          </button>
        </div>

        {mode === "ai" && (
          <div className="difficulty-control">
            <div>
              <span>AI difficulty</span>
              <strong>{difficulty}</strong>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={difficulty}
              onChange={(event) => setDifficulty(Number(event.target.value))}
            />
            <small>{difficulty * 10}% chance to choose its highest-scoring turn</small>
          </div>
        )}

        {mode === "online" && (
          <div className="online-setup">
            {online.role === "none" ? (
              <>
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
                  disabled={online.connecting || !playerName.trim() || (onlineAction === "join" && roomCode.length !== 5)}
                  onClick={() => onlineAction === "host" ? onHost(playerName) : onJoin(roomCode, playerName)}
                >
                  {online.connecting
                    ? <><LoaderCircle className="spin" size={17} /> Connecting</>
                    : onlineAction === "host"
                      ? "Create room"
                      : "Join room"}
                </button>
              </>
            ) : online.role === "host" ? (
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
            )}
            {online.error && <p className="online-error">{online.error}</p>}
            {online.role !== "none" && (
              <button className="text-button leave-room-button" onClick={onDisconnect}>Leave room</button>
            )}
          </div>
        )}

        {mode !== "online" && (
          <button className="primary-button start-match-button" onClick={() => onStart(mode, difficulty)}>
            {mode === "ai" ? "Challenge the AI" : "Begin local duel"}
          </button>
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

function GameScreen({
  state,
  dispatch,
  onSaveAndQuit,
  onRestart,
  inputDisabled = false,
  onlineRoomCode,
  onlineError,
}: {
  state: GameState;
  dispatch: GameDispatch;
  onSaveAndQuit: () => void;
  onRestart: () => void;
  inputDisabled?: boolean;
  onlineRoomCode?: string;
  onlineError?: string;
}) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [inspectedGodId, setInspectedGodId] = useState<GodId>();
  const [inspectedSquare, setInspectedSquare] = useState<Square>();
  const [graveyardColor, setGraveyardColor] = useState<Color>();
  const kingInCheck = state.phase === "play" && isInCheck(state.board, state.activeColor, state.bananas);
  const [displayedOrbs, setDisplayedOrbs] = useState<OrbTotals>(() => orbTotals(state));
  const [orbFlights, setOrbFlights] = useState<OrbFlight[]>([]);
  const [arrivingOrbs, setArrivingOrbs] = useState<Set<string>>(() => new Set());
  const [displayedGraveyards, setDisplayedGraveyards] = useState<Record<Color, number>>(() => ({
    white: state.players.white.graveyard.length,
    black: state.players.black.graveyard.length,
  }));
  const [captureFlights, setCaptureFlights] = useState<CaptureFlight[]>([]);
  const [arrivingGraveyards, setArrivingGraveyards] = useState<Set<Color>>(() => new Set());
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
  const orbAnimationKey = (state.orbAnimations ?? []).map((event) => event.id).join(",");
  const captureAnimationKey = (state.captureAnimations ?? []).map((event) => event.id).join(",");

  useEffect(() => () => {
    animationTimers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    if (state.phase === "upgrade") setInspectedGodId(undefined);
  }, [state.activeColor, state.phase]);

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

  const handleGodClick = (godId: GodId, color: Color) => {
    if (state.phase === "upgrade") {
      setInspectedGodId(godId);
      return;
    }
    if (color === state.activeColor && !state.rested.includes(godId)) {
      setInspectedGodId(undefined);
      dispatch({ type: "select-god", godId });
      return;
    }
    setInspectedGodId(godId);
  };
  return (
    <main className={`game-page ${inputDisabled ? "input-locked" : ""}`}>
      <header className="topbar">
        <Brand />
        <div className="game-meta">
          <span>ROUND <strong>{state.round}</strong></span>
          <i />
          <span>TURN <strong>{state.turn}</strong></span>
          {onlineRoomCode && <><i /><span>ROOM <strong>{onlineRoomCode}</strong></span></>}
        </div>
        <div className="header-actions">
          {state.gameMode !== "online" && (
            <button onClick={onSaveAndQuit}>
              <Save size={18} />
              <span>Save & quit</span>
            </button>
          )}
          <button onClick={() => setHistoryOpen(!historyOpen)}><History size={18} /><span>History</span></button>
          <button onClick={() => setRulesOpen(true)}><BookOpen size={18} /><span>Rules</span></button>
          <button onClick={onRestart}><RotateCcw size={18} /><span>New game</span></button>
        </div>
      </header>

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

      <div className="game-layout">
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
          <ChessBoard state={state} dispatch={dispatch} onInspectSquare={setInspectedSquare} />
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
              dispatch={dispatch}
              selectedGodId={inspectedGodId}
              onSelectGod={setInspectedGodId}
              onCloseGod={() => setInspectedGodId(undefined)}
            />
          ) : (
            <ActionPanel
              state={state}
              dispatch={dispatch}
              inspectedGodId={inspectedGodId}
              onInspectGod={setInspectedGodId}
              onCloseInspection={() => setInspectedGodId(undefined)}
            />
          )}
          <SquareInfoPanel
            state={state}
            square={inspectedSquare}
            onClose={() => setInspectedSquare(undefined)}
          />
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
          {state.history.map((entry, index) => <p key={`${entry}-${index}`}><span>{state.turn - index}</span>{entry}</p>)}
        </aside>
      )}
      {graveyardColor && (
        <GraveyardModal state={state} color={graveyardColor} onClose={() => setGraveyardColor(undefined)} />
      )}
      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
      {state.phase === "gameover" && (
        <div className="modal-backdrop">
          <section className="gameover-modal">
            <div className="victory-crown"><Crown size={38} /></div>
            <p className="eyebrow">THE DIVINE GAME ENDS</p>
            <h2>{state.winner ? `${colorLabel(state.winner)} is victorious` : "Stalemate"}</h2>
            <p>{state.winner ? `${state.players[state.winner].name} has conquered the opposing pantheon.` : "Neither pantheon can make a legal move."}</p>
            <button className="primary-button" onClick={onRestart}>Begin a new game</button>
          </section>
        </div>
      )}
    </main>
  );
}

export default function App() {
  const [savedGame, setSavedGame] = useState(loadSavedGame);
  const [startView, setStartView] = useState<"menu" | "setup" | "none">("menu");
  const [setupCanCancel, setSetupCanCancel] = useState(false);
  const [setupReturnView, setSetupReturnView] = useState<"menu" | "none">("menu");
  const [state, baseDispatch] = useReducer(
    gameReducer,
    undefined,
    () => savedGame ? structuredClone(savedGame.state) : createGame(),
  );
  const stateRef = useRef(state);
  stateRef.current = state;
  const aiPlan = useRef<GameAction[]>([]);

  const receiveState = (next: GameState) => {
    stateRef.current = next;
    baseDispatch({ type: "load-game", state: next });
  };
  const applyRemoteAction = (action: GameAction) => {
    const next = gameReducer(stateRef.current, action);
    receiveState(next);
    return next;
  };
  const [online, onlineActions] = useOnlineGame({
    getState: () => stateRef.current,
    applyRemoteAction,
    receiveState,
  });

  const dispatch: GameDispatch = (action) => {
    const current = stateRef.current;
    if (current.gameMode === "online" && online.started) {
      const hostColor = current.onlineHostColor;
      const localColor = online.role === "host"
        ? hostColor
        : hostColor === "white"
          ? "black"
          : "white";
      if (!localColor || current.activeColor !== localColor) return;
      if (online.role === "peer") {
        onlineActions.sendAction(action);
        return;
      }
      if (online.role === "host") {
        const next = gameReducer(current, action);
        receiveState(next);
        onlineActions.syncState(next);
        return;
      }
    }
    const next = gameReducer(current, action);
    receiveState(next);
  };

  const saveCurrentGame = () => {
    const savedAt = saveGameState(stateRef.current);
    if (!savedAt) return false;
    setSavedGame({
      version: 1,
      savedAt,
      state: structuredClone(stateRef.current),
    });
    return true;
  };

  const saveAndQuit = () => {
    if (!saveCurrentGame()) return;
    aiPlan.current = [];
    setStartView("menu");
  };

  useEffect(() => {
    if (startView !== "none" || state.gameMode === "online") return;
    const timer = window.setTimeout(() => saveGameState(state), 120);
    return () => window.clearTimeout(timer);
  }, [startView, state]);

  useEffect(() => {
    if (startView !== "none" || !isAiTurn(state)) {
      aiPlan.current = [];
      return;
    }
    if (!aiPlan.current.length) aiPlan.current = chooseAiPlan(state);
    const action = aiPlan.current[0];
    if (!action) return;
    const timer = window.setTimeout(() => {
      aiPlan.current = aiPlan.current.slice(1);
      dispatch(action);
    }, 520);
    return () => window.clearTimeout(timer);
  }, [startView, state]);

  useEffect(() => {
    if (online.started) setStartView("none");
  }, [online.started]);

  const resumeGame = () => {
    if (!savedGame) return;
    receiveState(structuredClone(savedGame.state));
    aiPlan.current = [];
    setStartView("none");
  };
  const startNewGame = () => {
    setSetupCanCancel(true);
    setSetupReturnView("menu");
    setStartView("setup");
  };
  const beginGame = (mode: Exclude<GameMode, "online">, difficulty: number) => {
    onlineActions.disconnect();
    window.localStorage.removeItem(SAVE_KEY);
    setSavedGame(undefined);
    receiveState(createGame(undefined, { mode, aiDifficulty: difficulty }));
    aiPlan.current = [];
    setStartView("none");
  };
  const startHostedGame = () => {
    if (!online.guest) return;
    window.localStorage.removeItem(SAVE_KEY);
    setSavedGame(undefined);
    const next = createGame(undefined, {
      mode: "online",
      hostName: online.hostName,
      guestName: online.guest.name,
    });
    receiveState(next);
    onlineActions.startGame(next);
    setStartView("none");
  };
  const openNewGame = () => {
    if (state.gameMode === "online") {
      onlineActions.disconnect();
      setSetupCanCancel(false);
    } else {
      setSetupCanCancel(true);
    }
    setSetupReturnView("none");
    setStartView("setup");
  };

  const localOnlineColor = state.onlineHostColor
    ? online.role === "host"
      ? state.onlineHostColor
      : state.onlineHostColor === "white"
        ? "black"
        : "white"
    : undefined;
  const inputDisabled =
    isAiTurn(state) ||
    (
      state.gameMode === "online" &&
      (!online.started || localOnlineColor !== state.activeColor || online.awaitingSync)
    );

  if (startView === "menu") {
    return <MainMenu savedAt={savedGame?.savedAt} onResume={resumeGame} onNewGame={startNewGame} />;
  }

  return (
    <>
      {state.phase === "draft"
        ? (
          <DraftScreen
            state={state}
            dispatch={dispatch}
            inputDisabled={inputDisabled}
            onSaveAndQuit={state.gameMode === "online" ? undefined : saveAndQuit}
          />
        )
        : (
          <GameScreen
            state={state}
            dispatch={dispatch}
            inputDisabled={inputDisabled}
            onlineRoomCode={online.roomCode}
            onlineError={online.error}
            onRestart={openNewGame}
            onSaveAndQuit={saveAndQuit}
          />
        )}
      {startView === "setup" && (
        <StartGamePrompt
          online={online}
          canCancel={setupCanCancel}
          onStart={beginGame}
          onHost={(name) => void onlineActions.hostGame(name)}
          onJoin={(code, name) => void onlineActions.joinGame(code, name)}
          onStartOnline={startHostedGame}
          onCancel={() => {
            onlineActions.disconnect();
            setStartView(setupReturnView);
          }}
          onDisconnect={onlineActions.disconnect}
        />
      )}
    </>
  );
}
