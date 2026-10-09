import {
  ArrowLeft,
  Bot,
  BookOpen,
  Crown,
  Eye,
  Flame,
  FlaskConical,
  History,
  Info,
  LoaderCircle,
  Magnet,
  Menu,
  Rabbit,
  RotateCcw,
  Save,
  Settings,
  Shield,
  Skull,
  Snowflake,
  Swords,
  Undo2,
  UserRound,
  Wifi,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { GameResultPresentation } from "../GameResultPresentation";
import { MatchEscapeMenu } from "../MatchEscapeMenu";
import { BoardViewport } from "../components/BoardViewport";
import {
  recordActionTransition,
  recordDiagnostic,
} from "../diagnostics";
import {
  chooseFourPlayerAiPlan,
  isFourPlayerAiTurn,
} from "../game/fourPlayerAi";
import { fourPlayerSquareAt } from "../game/fourPlayerChess";
import { seatsAreAllies } from "../game/fourPlayerConfig";
import {
  canStartFourPlayerMoveFirst,
  fourPlayerMoveFirstBoardIdentity,
  fourPlayerMoveFirstCandidates,
  fourPlayerMoveFirstSources,
  fourPlayerMoveFirstTargets,
  fourPlayerReducer,
  hasCommittedFourPlayerAction,
} from "../game/fourPlayerEngine";
import { prepareFourPlayerState } from "../game/fourPlayerPersistence";
import {
  FOUR_PLAYER_SEATS,
  type FourPlayerAction,
  type FourPlayerMoveFirstCandidate,
  type FourPlayerOrbAnimation,
  type FourPlayerPiece,
  type FourPlayerState,
  type OrbAffinity,
  type Seat,
} from "../game/fourPlayerTypes";
import { abilityLevel, GOD_BY_ID, GODS } from "../game/gods";
import { randomItem } from "../game/random";
import type { Ability, GodId, PieceType, Square } from "../game/types";
import {
  FOUR_PLAYER_PALETTES,
  FOUR_PLAYER_SEAT_LABELS,
} from "./setupConfig";
import { AbilityRules, LevelSelector } from "../UpgradePreview";

type FourPlayerDispatch = (action: FourPlayerAction) => void;

interface FourPlayerMoveFirstDraft {
  source: Square;
  destination?: Square;
}

const PIECES: Record<OrbAffinity, Record<PieceType, string>> = {
  light: {
    king: "♔",
    queen: "♕",
    rook: "♖",
    bishop: "♗",
    knight: "♘",
    pawn: "♙",
  },
  dark: {
    king: "♚",
    queen: "♛",
    rook: "♜",
    bishop: "♝",
    knight: "♞",
    pawn: "♟",
  },
};

const PIECE_NAMES: Record<PieceType, string> = {
  king: "King",
  queen: "Queen",
  rook: "Rook",
  bishop: "Bishop",
  knight: "Knight",
  pawn: "Pawn",
};

const GOD_PORTRAITS: Record<GodId, string> = {
  quetzacoatl: new URL("../assets/gods/quetzacoatl.jpg", import.meta.url).href,
  chiron: new URL("../assets/gods/chiron.jpg", import.meta.url).href,
  anubis: new URL("../assets/gods/anubis.jpg", import.meta.url).href,
  teles: new URL("../assets/gods/teles.jpg", import.meta.url).href,
  artemis: new URL("../assets/gods/artemis.jpg", import.meta.url).href,
  kangus: new URL("../assets/gods/kangus.jpg", import.meta.url).href,
  death: new URL("../assets/gods/death.jpg", import.meta.url).href,
  leonidas: new URL("../assets/gods/leonidas.jpg", import.meta.url).href,
  medusa: new URL("../assets/gods/medusa.jpg", import.meta.url).href,
  salem: new URL("../assets/gods/salem.jpg", import.meta.url).href,
  midas: new URL("../assets/gods/midas.jpg", import.meta.url).href,
  ares: new URL("../assets/gods/ares.jpg", import.meta.url).href,
};

const STATUS_MARKERS: {
  key: keyof FourPlayerPiece["status"];
  label: string;
  icon: LucideIcon;
}[] = [
  { key: "hardened", label: "Hardened", icon: Shield },
  { key: "frozen", label: "Stone", icon: Snowflake },
  { key: "poisoned", label: "Poisoned", icon: FlaskConical },
  { key: "polymorphed", label: "Polymorphed", icon: Rabbit },
  { key: "luredBy", label: "Lured", icon: Magnet },
  { key: "hexedBy", label: "Hexed", icon: Zap },
  { key: "prepared", label: "Prepared", icon: Swords },
  { key: "ritual", label: "Ritual", icon: Flame },
  { key: "markedForDeath", label: "Marked", icon: Skull },
  { key: "hired", label: "Hired", icon: Crown },
  { key: "gazing", label: "Gazing", icon: Eye },
  { key: "chargeUntil", label: "Charged", icon: Zap },
];

const seatName = (seat: Seat) => FOUR_PLAYER_SEAT_LABELS[seat];
const teamName = (team: "team-a" | "team-b" | undefined) =>
  team === "team-a" ? "Team A" : team === "team-b" ? "Team B" : "Free-for-all";

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const boardPositionSignature = (state: FourPlayerState) =>
  Object.entries(state.board)
    .map(([square, piece]) => `${piece.id}:${square}`)
    .sort()
    .join(",");

const stateSignature = (state: FourPlayerState) => JSON.stringify(state);

type FourPlayerOrbTotals = Record<Seat, Record<OrbAffinity, number>>;

interface FourPlayerOrbFlight extends FourPlayerOrbAnimation {
  startX: number;
  startY: number;
  deltaX: number;
  deltaY: number;
}

const fourPlayerOrbTotals = (state: FourPlayerState): FourPlayerOrbTotals =>
  Object.fromEntries(
    FOUR_PLAYER_SEATS.map((seat) => [seat, { ...state.players[seat].orbs }]),
  ) as FourPlayerOrbTotals;

const fourPlayerOrbTargetKey = (seat: Seat, affinity: OrbAffinity) =>
  `${seat}-${affinity}`;

const isStableState = (state: FourPlayerState) => {
  if (state.phase === "draft" || state.phase === "upgrade" || state.phase === "gameover") {
    return true;
  }
  return !state.selectedGod &&
    !state.selectedAbility &&
    !state.selectedSquare &&
    !state.pending &&
    state.legalTargets.length === 0 &&
    state.legalSeats.length === 0;
};

function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark"><Crown size={23} strokeWidth={1.5} /></div>
      <div>
        <div className="brand-name">GOD CHESS</div>
        <div className="brand-subtitle">FOUR PANTHEONS</div>
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

function GodSigil({ godId }: { godId: GodId }) {
  const god = GOD_BY_ID[godId];
  return (
    <span
      className="god-sigil small"
      style={{ "--accent": god.accent } as React.CSSProperties}
      aria-hidden="true"
    >
      <GodPortrait godId={godId} />
    </span>
  );
}

function Orb({
  affinity,
  count,
  targetSeat,
  arriving = false,
}: {
  affinity: OrbAffinity;
  count: number;
  targetSeat?: Seat;
  arriving?: boolean;
}) {
  const visualClass = affinity === "light" ? "white" : "black";
  return (
    <span
      className={`orb-count ${arriving ? "arriving" : ""}`}
      data-orb-target={
        targetSeat ? fourPlayerOrbTargetKey(targetSeat, affinity) : undefined
      }
      aria-label={`${count} ${affinity} orb${count === 1 ? "" : "s"}`}
    >
      <i className={`orb ${visualClass}`} />
      <strong>{count}</strong>
    </span>
  );
}

function PieceView({
  piece,
  state,
  square,
}: {
  piece: FourPlayerPiece;
  state: FourPlayerState;
  square?: Square;
}) {
  const statuses = STATUS_MARKERS.filter(({ key }) => Boolean(piece.status[key]));
  const owner = state.players[piece.owner];
  const controller = piece.controller ? state.players[piece.controller] : undefined;
  const team = owner.team ? `, ${teamName(owner.team)}` : "";
  const control = controller
    ? piece.controller === piece.owner
      ? ""
      : `, controlled by ${controller.name} at ${seatName(piece.controller!)}`
    : ", inert after elimination";
  const label = `${square ? `${square}, ` : ""}${owner.name} ${PIECE_NAMES[piece.type]} from ${seatName(piece.owner)}${control}${team}`;
  return (
    <span
      className={`four-chess-piece affinity-${piece.orbAffinity} ${piece.controller ? "" : "inert"} ${piece.owner !== piece.controller ? "takeover" : ""}`}
      style={{ "--piece-color": piece.displayColor } as React.CSSProperties}
      data-piece-id={piece.id}
      role="img"
      aria-label={label}
      title={label}
    >
      {PIECES[piece.orbAffinity][piece.type]}
      {statuses.length > 0 && (
        <span className="status-markers" title={statuses.map(({ label: item }) => item).join(", ")}>
          {statuses.map(({ key, label: item, icon: Icon }) => (
            <i className="status-marker" data-status={key} aria-label={item} key={key}>
              <Icon aria-hidden="true" />
            </i>
          ))}
        </span>
      )}
    </span>
  );
}

function FourPlayerDraft({
  state,
  dispatch,
  inputDisabled,
  onQuickDraft,
  canUndo,
  onUndo,
  onSaveAndQuit,
  onOpenSettings,
}: {
  state: FourPlayerState;
  dispatch: FourPlayerDispatch;
  inputDisabled: boolean;
  onQuickDraft?: () => void;
  canUndo: boolean;
  onUndo: () => void;
  onSaveAndQuit?: () => void;
  onOpenSettings: () => void;
}) {
  const [inspected, setInspected] = useState<GodId>(state.draft.available[0]);
  const [godPreviewLevel, setGodPreviewLevel] = useState<number>();
  const activePlayer = state.players[state.activeSeat];
  const currentGod = GOD_BY_ID[inspected];

  useEffect(() => {
    setGodPreviewLevel(undefined);
  }, [inspected]);

  return (
    <main className={`draft-page four-draft-page ${inputDisabled ? "input-locked" : ""}`}>
      <header className="topbar draft-topbar">
        <Brand />
        <div className="draft-turn">
          <span
            className="four-seat-dot"
            style={{ "--seat-color": state.config.seats[state.activeSeat].displayColor } as React.CSSProperties}
          />
          {activePlayer.name} · {seatName(state.activeSeat)} picks
          {activePlayer.control.kind === "ai" && <LoaderCircle className="spin" size={15} />}
        </div>
        <div className="header-actions">
          <button onClick={onUndo} disabled={!canUndo}>
            <Undo2 size={18} /><span>Undo</span>
          </button>
          {onSaveAndQuit && (
            <button onClick={onSaveAndQuit}><Save size={18} /><span>Save & quit</span></button>
          )}
          <button onClick={onOpenSettings}><Settings size={18} /><span>Settings</span></button>
        </div>
      </header>

      <section className="draft-hero">
        <p className="eyebrow">THE FOUR PANTHEONS AWAIT</p>
        <h1>Choose your gods.</h1>
        <p>Every God is unique: 1–2–3–4, 4–3–2–1, then 1–2–3–4.</p>
        <div className="draft-auto-actions">
          {activePlayer.control.kind !== "ai" && (
            <button
              className="auto-draft-button"
              disabled={inputDisabled || !state.draft.available.length}
              onClick={() => {
                const godId = randomItem(state.draft.available);
                if (godId) dispatch({ type: "draft", godId });
              }}
            >
              Auto-pick a God
            </button>
          )}
          {onQuickDraft && (
            <button
              className="auto-draft-button"
              disabled={!state.draft.available.length}
              onClick={onQuickDraft}
            >
              Quick Draft
            </button>
          )}
        </div>
        <div className="draft-progress four-draft-progress">
          {state.draft.order.map((seat, index) => (
            <div
              className={`draft-pip ${index < state.draft.pickIndex ? "done" : ""} ${index === state.draft.pickIndex ? "current" : ""}`}
              style={{ "--seat-color": state.config.seats[seat].displayColor } as React.CSSProperties}
              key={`${seat}-${index}`}
            >
              <span>{index + 1}</span>
              <small>{seat[0].toUpperCase()}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="draft-layout">
        <div className="pantheon-grid">
          {GODS.map((god) => {
            const owner = FOUR_PLAYER_SEATS.find((seat) =>
              state.players[seat].gods.includes(god.id)
            );
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
                {owner && (
                  <span
                    className="four-claimed-by"
                    style={{ "--seat-color": state.config.seats[owner].displayColor } as React.CSSProperties}
                  >
                    {owner[0].toUpperCase()}
                  </span>
                )}
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
            {currentGod.abilities.map((ability, index) => (
              <div className="draft-ability" key={ability.id}>
                <span>0{index + 1}</span>
                <div>
                  <strong>{ability.name}</strong>
                  <p>{ability.summary}</p>
                  {(godPreviewLevel ?? 1) >= 2 && ability.details[1] && (
                    <p className="level-rule"><b>Lv 2:</b> {ability.details[1]}</p>
                  )}
                  {(godPreviewLevel ?? 1) >= 3 && ability.details[2] && (
                    <p className="level-rule"><b>Lv 3:</b> {ability.details[2]}</p>
                  )}
                </div>
                {ability.cost && (
                  <div className="mini-cost">
                    {ability.cost.white ? <Orb affinity="light" count={ability.cost.white} /> : null}
                    {ability.cost.black ? <Orb affinity="dark" count={ability.cost.black} /> : null}
                  </div>
                )}
              </div>
            ))}
          </div>
          <button
            className="primary-button"
            onClick={() => dispatch({ type: "draft", godId: currentGod.id })}
            disabled={
              inputDisabled ||
              activePlayer.control.kind === "ai" ||
              !state.draft.available.includes(currentGod.id)
            }
          >
            Claim {currentGod.name}
          </button>
        </aside>
      </section>

      <footer className="draft-rosters four-draft-rosters">
        {FOUR_PLAYER_SEATS.map((seat) => (
          <div className="draft-roster" key={seat}>
            <span
              className="four-player-crest"
              style={{ "--seat-color": state.config.seats[seat].displayColor } as React.CSSProperties}
            >
              <Crown size={14} />
            </span>
            <strong>{state.players[seat].name}</strong>
            <small>{seatName(seat)}</small>
            <div>
              {state.players[seat].gods.map((godId) => <GodSigil godId={godId} key={godId} />)}
              {Array.from({ length: 3 - state.players[seat].gods.length }).map((_, index) => (
                <i className="empty-sigil" key={index} />
              ))}
            </div>
          </div>
        ))}
      </footer>
    </main>
  );
}

function FourPlayerPanel({
  state,
  seat,
  onGodClick,
  onGraveyard,
  dispatch,
  displayedOrbs,
  arrivingOrbs,
}: {
  state: FourPlayerState;
  seat: Seat;
  onGodClick: (godId: GodId, seat: Seat) => void;
  onGraveyard: (seat: Seat) => void;
  dispatch: FourPlayerDispatch;
  displayedOrbs: Record<OrbAffinity, number>;
  arrivingOrbs: Set<string>;
}) {
  const player = state.players[seat];
  const active = state.activeSeat === seat && state.phase !== "gameover";
  const controlled = Object.values(state.board)
    .filter((piece) => piece.controller === seat && piece.owner !== seat).length;
  const selectableSeat = state.legalSeats.includes(seat);
  const [toolsOpen, setToolsOpen] = useState(false);
  return (
    <section
      className={`four-player-panel seat-${seat} ${active ? "active" : ""} ${player.eliminated ? "eliminated" : ""} ${selectableSeat ? "seat-target" : ""} ${toolsOpen ? "tools-open" : ""}`}
      style={{ "--seat-color": player.displayColor } as React.CSSProperties}
      aria-label={`${player.name}, ${seatName(seat)}${player.eliminated ? ", eliminated" : ""}`}
    >
      <button
        className="four-seat-summary"
        onClick={() => selectableSeat && dispatch({ type: "seat", seat })}
        disabled={!selectableSeat}
      >
        <span className="four-player-avatar"><Crown size={18} /></span>
        <span className="four-seat-identity">
          <strong>{player.name}</strong>
          <small>
            {seatName(seat)} · {player.control.kind === "ai"
              ? `AI ${player.control.difficulty ?? 5}`
              : "Human"}
            {player.team ? ` · ${teamName(player.team)}` : ""}
          </small>
        </span>
        {player.control.kind === "ai" ? <Bot size={16} /> : <UserRound size={16} />}
      </button>
      <div
        className="four-panel-resources"
        role="group"
        aria-label={`${player.name} resources`}
      >
        <Orb
          affinity="light"
          count={displayedOrbs.light}
          targetSeat={seat}
          arriving={arrivingOrbs.has(fourPlayerOrbTargetKey(seat, "light"))}
        />
        <Orb
          affinity="dark"
          count={displayedOrbs.dark}
          targetSeat={seat}
          arriving={arrivingOrbs.has(fourPlayerOrbTargetKey(seat, "dark"))}
        />
        <button
          className="graveyard-button"
          onClick={() => onGraveyard(seat)}
          aria-label={`View ${player.name}'s graveyard, ${player.graveyard.length} captured pieces`}
        >
          <Skull size={14} /><b>{player.graveyard.length}</b>
        </button>
        <button
          className="four-panel-menu"
          onClick={() => setToolsOpen((open) => !open)}
          aria-label={`${toolsOpen ? "Close" : "Open"} ${player.name} pantheon`}
          aria-expanded={toolsOpen}
        >
          {toolsOpen ? <X size={15} /> : <Menu size={15} />}
        </button>
        {controlled > 0 && (
          <span className="takeover-count" title="Pieces controlled through takeover">
            <Swords size={13} />{controlled}
          </span>
        )}
      </div>
      <div className={`four-panel-gods ${toolsOpen ? "open" : ""}`}>
        {player.gods.map((godId) => (
          <button
            className={state.rested.includes(godId) ? "resting" : ""}
            onClick={() => onGodClick(godId, seat)}
            title={`${GOD_BY_ID[godId].name}${state.rested.includes(godId) ? " · resting" : ""}`}
            key={godId}
          >
            <GodSigil godId={godId} />
          </button>
        ))}
      </div>
      {player.eliminated && (
        <span className="four-eliminated-label">
          Eliminated{player.eliminatedBy ? ` by ${seatName(player.eliminatedBy)}` : ""}
        </span>
      )}
    </section>
  );
}

function FourPlayerBoard({
  state,
  onSquare,
  onInspectSquare,
  captureEffects,
  legalTargets = state.legalTargets,
  provisionalSource,
  provisionalDestination,
}: {
  state: FourPlayerState;
  onSquare: (square: Square) => void;
  onInspectSquare: (square: Square) => void;
  captureEffects: Set<Square>;
  legalTargets?: Square[];
  provisionalSource?: Square;
  provisionalDestination?: Square;
}) {
  const cells = useMemo(() => {
    const result: Array<{ square?: Square; file: number; rank: number }> = [];
    for (let rank = 13; rank >= 0; rank -= 1) {
      for (let file = 0; file < 14; file += 1) {
        result.push({ square: fourPlayerSquareAt(file, rank), file, rank });
      }
    }
    return result;
  }, []);
  const previewing = state.pending?.step === "confirm-stone-gaze" ||
    state.pending?.step === "confirm-march-home";
  const enchantSourceChoice = (
    state.pending?.step === "enchant-enemy-move" ||
    state.pending?.step === "enchant-followup-move"
  ) && !state.selectedSquare;
  return (
    <BoardViewport
      className="four-board-zoom"
      label="Four-player board"
      resetKey="four-player"
    >
      <div className="four-board-shell">
        <div className="four-board-frame">
          <div className="four-chess-board" role="grid" aria-label="Four-player God Chess board">
            {cells.map(({ square, file, rank }) => {
              if (!square) {
                return <span className="four-board-outside" aria-hidden="true" key={`${file}-${rank}`} />;
              }
              const piece = state.board[square];
              const selected = state.selectedSquare === square;
              const legal = !previewing && legalTargets.includes(square);
              const effectPreview = previewing && state.legalTargets.includes(square);
              const isProvisionalSource = provisionalSource === square;
              const isProvisionalDestination = provisionalDestination === square;
              const banana = state.bananas.find((item) => item.square === square);
              return (
                <button
                  role="gridcell"
                  data-square={square}
                  aria-label={`${square}${piece ? `, ${state.players[piece.owner].name} ${piece.type}${piece.controller ? `, controlled by ${state.players[piece.controller].name}` : ", inert"}` : ""}${legal ? ", legal target" : ""}${isProvisionalSource ? ", provisional move source" : ""}${isProvisionalDestination ? ", provisional move destination, not committed" : ""}`}
                  className={`four-board-square ${(file + rank) % 2 ? "light" : "dark"} ${selected ? "selected" : ""} ${legal ? "legal" : ""} ${legal && piece ? "legal-occupied" : ""} ${legal && enchantSourceChoice ? "legal-source" : ""} ${legal && !enchantSourceChoice ? "legal-destination" : ""} ${effectPreview ? "effect-preview" : ""} ${isProvisionalSource ? "provisional-source" : ""} ${isProvisionalDestination ? "provisional-destination" : ""}`}
                  onClick={() => {
                    onInspectSquare(square);
                    onSquare(square);
                  }}
                  key={square}
                >
                  {(file === 3 || file === 10) && <span className="rank-label">{rank + 1}</span>}
                  {(rank === 3 || rank === 10) && (
                    <span className="file-label">{String.fromCharCode(97 + file)}</span>
                  )}
                  {legal && !piece && <span className="move-target-dot" aria-hidden="true" />}
                  {banana && <span className="banana" title="Banana peel">⌁</span>}
                  {captureEffects.has(square) && <span className="four-capture-effect"><Skull /></span>}
                  {piece && <PieceView piece={piece} state={state} square={square} />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </BoardViewport>
  );
}

const canPass = (state: FourPlayerState) =>
  state.pending?.abilityId === "snipe-shot" ||
  state.selectedAbility === "construction" ||
  state.selectedAbility === "marked" ||
  state.pending?.step === "slither" ||
  state.pending?.step === "mount-rider" ||
  state.pending?.step === "funding" ||
  state.pending?.step === "march-companions" ||
  state.pending?.step === "barter-orb" ||
  (state.pending?.step === "escort-companions" && Boolean(state.pending.selected?.length)) ||
  (state.pending?.step === "hex-target" && Boolean(state.pending.selected?.length));

function AbilityCard({
  ability,
  level,
  previewLevel,
  active,
  disabled,
  onClick,
  children,
}: {
  ability: Ability;
  level: number;
  previewLevel?: number;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <article className={`four-ability-card ${active ? "active" : ""}`}>
      <button
        className="four-ability-card-main"
        disabled={disabled}
        onClick={onClick}
      >
        <span>
          <strong className="ability-card-title">{ability.name}</strong>
          <small>Level {level}</small>
        </span>
        <p>{ability.summary}</p>
        {(previewLevel ?? level) >= 2 && ability.details[1] && (
          <p className="level-rule"><b>Lv 2:</b> {ability.details[1]}</p>
        )}
        {(previewLevel ?? level) >= 3 && ability.details[2] && (
          <p className="level-rule"><b>Lv 3:</b> {ability.details[2]}</p>
        )}
        <div>
          {ability.cost?.white ? <Orb affinity="light" count={ability.cost.white} /> : null}
          {ability.cost?.black ? <Orb affinity="dark" count={ability.cost.black} /> : null}
          {!ability.cost && <em>Generates</em>}
        </div>
      </button>
      {children && <div className="four-ability-pending">{children}</div>}
    </article>
  );
}

function FourPlayerMoveFirstChooser({
  state,
  draft,
  candidates,
  onCancel,
  onCommit,
}: {
  state: FourPlayerState;
  draft: FourPlayerMoveFirstDraft;
  candidates: FourPlayerMoveFirstCandidate[];
  onCancel: () => void;
  onCommit: (candidate: FourPlayerMoveFirstCandidate) => void;
}) {
  if (!draft.destination) {
    return (
      <div className="move-first-prompt four-move-first-prompt" role="status">
        <strong>Ordinary move selected from {draft.source}</strong>
        <p>Choose a highlighted destination. The board has not changed.</p>
        <button className="secondary-button" onClick={onCancel}>
          Back / cancel
        </button>
      </div>
    );
  }
  return (
    <div className="move-first-chooser four-move-first-chooser">
      <div className="move-first-heading" role="status" aria-live="polite">
        <span>PROVISIONAL MOVE</span>
        <strong>{draft.source} → {draft.destination}</strong>
        <p>Not committed. Choose which God’s first ability applies this move.</p>
        <button className="secondary-button" onClick={onCancel}>
          <ArrowLeft size={15} /> Back / cancel
        </button>
      </div>
      <div className="four-move-first-list">
        {candidates.map((candidate) => {
          const god = GOD_BY_ID[candidate.godId];
          const ability = god.abilities[0];
          const level = abilityLevel(
            state.players[state.activeSeat].upgrades,
            ability.id,
          );
          return (
            <article
              className={`four-move-first-card ${candidate.valid ? "" : "invalid"}`}
              style={{ "--accent": god.accent } as React.CSSProperties}
              key={candidate.godId}
            >
              <button
                disabled={!candidate.valid}
                onClick={() => onCommit(candidate)}
                aria-label={`${god.name} ${ability.name}: ${candidate.immediateOrbDelta.light} light orbs now and ${candidate.immediateOrbDelta.dark} dark orbs now`}
              >
                <div className="four-move-first-title">
                  <GodPortrait godId={god.id} />
                  <span>
                    <small>{god.name} · FIRST ABILITY · LEVEL {level}</small>
                    <strong>{ability.name}</strong>
                  </span>
                </div>
                <p>{ability.summary}</p>
                {level >= 2 && ability.details[1] && (
                  <p><b>Lv 2:</b> {ability.details[1]}</p>
                )}
                {level >= 3 && ability.details[2] && (
                  <p><b>Lv 3:</b> {ability.details[2]}</p>
                )}
                <div className="move-first-reward">
                  <span>IMMEDIATE ORBS</span>
                  <div>
                    <b><i className="orb white" /> Light {candidate.immediateOrbDelta.light}</b>
                    <b><i className="orb black" /> Dark {candidate.immediateOrbDelta.dark}</b>
                  </div>
                  {candidate.conditionalOutcome && <p>{candidate.conditionalOutcome}</p>}
                  {candidate.followUp && <small>{candidate.followUp.label}</small>}
                  {candidate.error && <p className="move-first-error">{candidate.error}</p>}
                </div>
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function UpgradeAbilityCard({
  ability,
  level,
  previewLevel,
  active,
  disabled,
  onClick,
  onDoubleClick,
  children,
}: {
  ability: Ability;
  level: number;
  previewLevel?: number;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className={`ability-card ${active ? "active" : ""} ${disabled ? "disabled" : ""}`}>
      <div
        className="ability-card-main"
        role="button"
        tabIndex={disabled ? undefined : 0}
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (!disabled) onClick();
        }}
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).closest(".level-selector")) return;
          if (!disabled) onDoubleClick?.();
        }}
        onKeyDown={(event) => {
          if (!disabled && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            onClick();
          }
        }}
      >
        <div className="ability-topline">
          <strong className="ability-card-title">{ability.name}</strong>
          <span className="level-pips">
            {[1, 2, 3].map((item) => <i className={item <= level ? "filled" : ""} key={item} />)}
          </span>
        </div>
        <AbilityRules ability={ability} level={level} previewLevelOverride={previewLevel} />
        <div className="ability-footer">
          <span>CURRENT LVL {level}</span>
          <div className="ability-footer-meta">
            <div className="ability-cost">
              {ability.cost?.white ? <Orb affinity="light" count={ability.cost.white} /> : null}
              {ability.cost?.black ? <Orb affinity="dark" count={ability.cost.black} /> : null}
            </div>
            <b className="upgrade-tag">
              {level >= 3 ? "MAX LEVEL" : `SELECT LVL ${level + 1}`}
            </b>
          </div>
        </div>
      </div>
      {children && <div className="ability-pending">{children}</div>}
    </div>
  );
}

function PendingChoices({
  state,
  dispatch,
  includeAbilityActions = false,
  committed = false,
  showPrompt = true,
}: {
  state: FourPlayerState;
  dispatch: FourPlayerDispatch;
  includeAbilityActions?: boolean;
  committed?: boolean;
  showPrompt?: boolean;
}) {
  const pending = state.pending;
  const choice = (() => {
    if (!pending) return null;
    if (pending.step === "siphon-amount") {
      return (
        <div className="four-choice-buttons">
          {[2, 1, 0].map((amount) => (
            <button
              className={amount === 0 ? "text-button" : "secondary-button"}
              onClick={() => dispatch({ type: "amount", amount: amount as 0 | 1 | 2 })}
              key={amount}
            >
              Steal {amount || "none"}
            </button>
          ))}
        </div>
      );
    }
    if (pending.step === "barter-orb") {
      const player = state.players[state.activeSeat];
      return (
        <div className="four-choice-buttons">
          <button
            className="secondary-button"
            disabled={player.orbs.light < 1}
            onClick={() => dispatch({ type: "orb", orb: "light" })}
          >
            Give light
          </button>
          <button
            className="secondary-button"
            disabled={player.orbs.dark < 1}
            onClick={() => dispatch({ type: "orb", orb: "dark" })}
          >
            Give dark
          </button>
          <button className="text-button" onClick={() => dispatch({ type: "orb" })}>
            Decline
          </button>
        </div>
      );
    }
    if (pending.step === "slither-orb") {
      return (
        <div className="four-choice-buttons">
          <button
            className="secondary-button"
            onClick={() => dispatch({ type: "orb", orb: "light" })}
          >
            Gain light
          </button>
          <button
            className="secondary-button"
            onClick={() => dispatch({ type: "orb", orb: "dark" })}
          >
            Gain dark
          </button>
        </div>
      );
    }
    if (pending.step === "harden-decision") {
      return (
        <div className="four-choice-buttons">
          <button className="secondary-button" onClick={() => dispatch({ type: "choice", value: true })}>
            Keep hardened
          </button>
          <button className="text-button" onClick={() => dispatch({ type: "choice", value: false })}>
            Remove marker
          </button>
        </div>
      );
    }
    if (pending.step === "rage-choice") {
      return (
        <div className="four-choice-buttons">
          <button className="secondary-button" onClick={() => dispatch({ type: "choice", value: true })}>
            Spare allies
          </button>
          <button className="danger-button" onClick={() => dispatch({ type: "choice", value: false })}>
            Capture all
          </button>
        </div>
      );
    }
    if (pending.step === "marked-choice") {
      return (
        <div className="four-choice-buttons">
          <button className="danger-button" onClick={() => dispatch({ type: "choice", value: true })}>
            Execute now
          </button>
          <button className="secondary-button" onClick={() => dispatch({ type: "choice", value: false })}>
            Leave marked
          </button>
        </div>
      );
    }
    if (pending.step === "resurrect-more") {
      return (
        <div className="four-choice-buttons">
          <button className="secondary-button" onClick={() => dispatch({ type: "choice", value: true })}>
            Revive a second
          </button>
          <button className="text-button" onClick={() => dispatch({ type: "choice", value: false })}>
            Finish
          </button>
        </div>
      );
    }
    if (pending.step === "confirm-stone-gaze" || pending.step === "confirm-march-home") {
      return (
        <button className="primary-button" onClick={() => dispatch({ type: "confirm-ability" })}>
          Confirm ability
        </button>
      );
    }
    return null;
  })();

  if (!pending && !includeAbilityActions) return null;
  return (
    <>
      {showPrompt && <p className="four-ability-prompt" role="status">{state.notice}</p>}
      {state.legalSeats.length > 0 && (
        <div className="four-seat-target-list">
          {state.legalSeats.map((seat) => (
            <button
              style={{ "--seat-color": state.players[seat].displayColor } as React.CSSProperties}
              onClick={() => dispatch({ type: "seat", seat })}
              key={seat}
            >
              <i />
              <strong>{state.players[seat].name}</strong>
              <small>{seatName(seat)} · {teamName(state.players[seat].team)}</small>
            </button>
          ))}
        </div>
      )}
      {pending?.step === "grave" && (
        <div className="four-grave-choice">
          {state.players[state.activeSeat].graveyard.map(({ piece }) => (
            <button
              onClick={() => dispatch({ type: "grave", pieceId: piece.id })}
              key={piece.id}
            >
              <PieceView piece={piece} state={state} />
              <span>{PIECE_NAMES[piece.type]}</span>
            </button>
          ))}
        </div>
      )}
      {choice}
      {includeAbilityActions && (
        <div className="four-action-buttons">
          {canPass(state) && (
            <button className="secondary-button" onClick={() => dispatch({ type: "pass" })}>
              Pass / finish
            </button>
          )}
          {!committed && (
            <button className="text-button" onClick={() => dispatch({ type: "cancel" })}>
              Cancel ability
            </button>
          )}
        </div>
      )}
    </>
  );
}

function FourActionPanel({
  state,
  dispatch,
  inputDisabled,
  moveFirstDraft,
  moveFirstCandidates,
  onCancelMoveFirst,
  onCommitMoveFirst,
  inspectedGod,
  onInspectGod,
  onCloseInspection,
}: {
  state: FourPlayerState;
  dispatch: FourPlayerDispatch;
  inputDisabled: boolean;
  moveFirstDraft?: FourPlayerMoveFirstDraft;
  moveFirstCandidates: FourPlayerMoveFirstCandidate[];
  onCancelMoveFirst: () => void;
  onCommitMoveFirst: (candidate: FourPlayerMoveFirstCandidate) => void;
  inspectedGod?: { godId: GodId; seat: Seat };
  onInspectGod: (godId: GodId, seat: Seat) => void;
  onCloseInspection: () => void;
}) {
  const active = state.players[state.activeSeat];
  const presentedGodId = inspectedGod?.godId ?? state.selectedGod;
  const god = presentedGodId ? GOD_BY_ID[presentedGodId] : undefined;
  const ownerSeat = inspectedGod?.seat ?? state.activeSeat;
  const owner = state.players[ownerSeat];
  const readOnly = Boolean(inspectedGod);
  const committed = hasCommittedFourPlayerAction(state);
  const activeSeatName = seatName(state.activeSeat);
  const upgradeTurnLabel = active.name.trim().toLowerCase() === activeSeatName.toLowerCase()
    ? `${activeSeatName} seat`
    : `${activeSeatName} · ${active.name}`;
  const [godPreviewLevel, setGodPreviewLevel] = useState<number>();
  const [selectedUpgradeAbilityId, setSelectedUpgradeAbilityId] = useState<string>();
  const defaultGodPreviewLevel = god
    ? Math.min(...god.abilities.map((ability) => abilityLevel(owner.upgrades, ability.id)))
    : 1;
  const defaultUpgradePreviewLevel = Math.min(
    ...active.gods.flatMap((godId) =>
      GOD_BY_ID[godId].abilities.map((ability) =>
        abilityLevel(active.upgrades, ability.id)
      )
    ),
  );

  useEffect(() => {
    setGodPreviewLevel(undefined);
    setSelectedUpgradeAbilityId(undefined);
  }, [
    presentedGodId,
    state.activeSeat,
    state.phase,
    state.round,
    state.upgradeQueue[0],
  ]);

  if (state.phase === "upgrade") {
    return (
      <aside className="four-action-panel upgrade-panel">
        <div className="panel-heading">
          <span>DIVINE UPGRADE</span>
          <small>ROUND {state.round} · {upgradeTurnLabel}</small>
        </div>
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
        <div className="four-upgrade-list">
          {active.gods.map((godId) => {
            const upgradeGod = GOD_BY_ID[godId];
            return (
              <section key={godId}>
                <div className="four-panel-god-heading">
                  <GodPortrait godId={godId} />
                  <strong>{upgradeGod.name}</strong>
                  <small>{upgradeGod.domain}</small>
                </div>
                {upgradeGod.abilities.map((ability) => {
                  const level = abilityLevel(active.upgrades, ability.id);
                  const selected = selectedUpgradeAbilityId === ability.id;
                  return (
                    <UpgradeAbilityCard
                      ability={ability}
                      level={level}
                      previewLevel={godPreviewLevel}
                      active={selected}
                      disabled={inputDisabled || level >= 3}
                      onClick={() => {
                        setGodPreviewLevel(Math.min(3, level + 1));
                        setSelectedUpgradeAbilityId(ability.id);
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
                    </UpgradeAbilityCard>
                  );
                })}
              </section>
            );
          })}
        </div>
      </aside>
    );
  }

  if (moveFirstDraft) {
    return (
      <aside className="four-action-panel">
        <div className="panel-heading">
          <span>DIVINE ACTION</span>
          <small>ROUND {state.round}</small>
        </div>
        <FourPlayerMoveFirstChooser
          state={state}
          draft={moveFirstDraft}
          candidates={moveFirstCandidates}
          onCancel={onCancelMoveFirst}
          onCommit={onCommitMoveFirst}
        />
      </aside>
    );
  }

  return (
    <aside className="four-action-panel">
      <div className="panel-heading">
        <span>{readOnly ? "PANTHEON DETAILS" : "DIVINE ACTION"}</span>
        <small>ROUND {state.round}</small>
      </div>
      {!god ? (
        <>
          <div className="four-action-intro">
            <Swords size={26} />
            <h3>{active.name} to act</h3>
            <p>{state.notice}</p>
          </div>
          <PendingChoices state={state} dispatch={dispatch} showPrompt={false} />
          {canPass(state) && (
            <div className="four-action-buttons">
              <button className="secondary-button" onClick={() => dispatch({ type: "pass" })}>
                Pass / finish
              </button>
            </div>
          )}
          {!state.pending && (
            <div className="god-list">
              {active.gods.map((godId) => {
                const item = GOD_BY_ID[godId];
                const resting = state.rested.includes(godId);
                return (
                  <button
                    className={`god-row ${resting ? "resting" : ""}`}
                    onClick={() => resting
                      ? onInspectGod(godId, state.activeSeat)
                      : dispatch({ type: "select-god", godId })}
                    style={{ "--accent": item.accent } as React.CSSProperties}
                    key={godId}
                  >
                    <GodPortrait godId={godId} className="god-row-portrait" />
                    <span className="god-row-copy">
                      <strong>{item.name}</strong>
                      <small>{resting ? "RESTING · VIEW" : item.domain}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <div
            className="chosen-god"
            style={{ "--accent": god.accent } as React.CSSProperties}
          >
            <GodPortrait godId={god.id} className="god-hero-portrait" />
            <div><span>{god.domain}</span><h3>{god.name}</h3><p>{god.epithet}</p></div>
            <button
              className="god-back-button"
              disabled={!readOnly && committed}
              onClick={() => readOnly ? onCloseInspection() : dispatch({ type: "clear-god" })}
              aria-label={readOnly ? "Close god details" : "Choose a different god"}
              title={!readOnly && committed ? "Finish the current action first" : undefined}
            >
              <ArrowLeft size={17} />
            </button>
          </div>
          {readOnly && (
            <div className="inspection-banner">
              <BookOpen size={14} />
              Viewing {owner.name} · abilities are read-only
            </div>
          )}
          <LevelSelector
            level={godPreviewLevel ?? defaultGodPreviewLevel}
            onChange={setGodPreviewLevel}
            label="All abilities"
            className="god-level-selector"
          />
          <div className="four-ability-list">
            {god.abilities.map((ability) => {
              const level = abilityLevel(owner.upgrades, ability.id);
              const affordable =
                active.orbs.light >= (ability.cost?.white ?? 0) &&
                active.orbs.dark >= (ability.cost?.black ?? 0);
              const hasQueen = Object.values(state.board)
                .some((piece) =>
                  piece.controller === state.activeSeat && piece.type === "queen"
                );
              const selected = !readOnly && state.selectedAbility === ability.id;
              return (
                <AbilityCard
                  ability={ability}
                  level={level}
                  previewLevel={godPreviewLevel}
                  active={selected}
                  disabled={
                    readOnly ||
                    committed ||
                    state.rested.includes(god.id) ||
                    !affordable ||
                    (ability.id === "lure" && !hasQueen)
                  }
                  onClick={() => dispatch({ type: "select-ability", abilityId: ability.id })}
                  key={ability.id}
                >
                  {selected && (
                    <PendingChoices
                      state={state}
                      dispatch={dispatch}
                      includeAbilityActions
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

function SquareInfo({
  state,
  square,
  onClose,
}: {
  state: FourPlayerState;
  square?: Square;
  onClose: () => void;
}) {
  if (!square) return null;
  const piece = state.board[square];
  const banana = state.bananas.find((item) => item.square === square);
  if (!piece && !banana) return null;
  return (
    <section className="square-info-panel four-square-info">
      <button className="square-info-close" onClick={onClose} aria-label="Close square details">
        <X size={15} />
      </button>
      {piece && (
        <div className="square-info-heading">
          <PieceView piece={piece} state={state} square={square} />
          <div>
            <small>{square.toUpperCase()} · {seatName(piece.owner)}</small>
            <h3>{PIECE_NAMES[piece.type]}</h3>
            <p>
              {piece.controller
                ? `Controlled by ${state.players[piece.controller].name}`
                : "Inert and capturable"}
            </p>
          </div>
        </div>
      )}
      {piece && (
        <div className="four-piece-details">
          <span>{teamName(state.players[piece.owner].team)}</span>
          <span>{piece.orbAffinity} affinity</span>
          {piece.owner !== piece.controller && piece.controller && (
            <span>Originally owned by {state.players[piece.owner].name}</span>
          )}
          {STATUS_MARKERS.filter(({ key }) => Boolean(piece.status[key])).map(({ key, label }) => (
            <span key={key}>{label}</span>
          ))}
        </div>
      )}
      {banana && (
        <div className="board-marker-info">
          <span className="banana-info-icon">⌁</span>
          <div>
            <small>{square.toUpperCase()} · BOARD MARKER</small>
            <h3>Banana Peel</h3>
            <p>Owned by {state.players[banana.owner].name}. Hostile pieces stop here.</p>
          </div>
        </div>
      )}
    </section>
  );
}

function FourGraveyardModal({
  state,
  seat,
  onClose,
}: {
  state: FourPlayerState;
  seat: Seat;
  onClose: () => void;
}) {
  const player = state.players[seat];
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="graveyard-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="close-button" onClick={onClose} aria-label="Close graveyard"><X size={20} /></button>
        <div className="graveyard-icon"><Skull size={27} /></div>
        <p className="eyebrow">{seatName(seat)} PANTHEON</p>
        <h2>{player.name}’s graveyard</h2>
        <p>{player.graveyard.length
          ? `${player.graveyard.length} piece${player.graveyard.length === 1 ? "" : "s"} captured.`
          : "No pieces have entered this graveyard."}</p>
        {player.graveyard.length > 0 && (
          <div className="graveyard-grid">
            {player.graveyard.map(({ piece, capturedOnTurn }) => (
              <article className="graveyard-piece" key={piece.id}>
                <PieceView piece={piece} state={state} />
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

function FourSettingsModal({
  undoPreferred,
  onUndoPreferenceChange,
  onClose,
}: {
  undoPreferred: boolean;
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
              Rewinds a stable draft pick, upgrade, or completed divine turn. AI
              chains rewind with the preceding Human turn.
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
      </section>
    </div>
  );
}

function FourRulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="rules-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="close-button" onClick={onClose}><X size={20} /></button>
        <p className="eyebrow">FOUR-PLAYER RULES</p>
        <h2>Four pantheons, one cross-board</h2>
        <div className="rule-columns">
          <article><span>01</span><h3>Draft all twelve Gods</h3><p>Each seat claims three unique Gods in a 1–2–3–4, 4–3–2–1, 1–2–3–4 snake.</p></article>
          <article><span>02</span><h3>Follow seat order</h3><p>North, east, south, and west act clockwise unless a team game alternates teams.</p></article>
          <article><span>03</span><h3>Respect allies</h3><p>Ordinary movement cannot capture a teammate. Explicit effects such as Rage follow their written friendly-fire rules.</p></article>
          <article><span>04</span><h3>Survive or strike first</h3><p>Win as the last seat/team standing, or immediately on the first King capture when that option is enabled.</p></article>
        </div>
        <div className="rules-note">
          <Info size={18} />
          <p>Eliminated pieces are inert unless takeover gives their capturer control. Online rooms pause when a Human seat disconnects.</p>
        </div>
      </section>
    </div>
  );
}

function FourPlayerPauseOverlay({
  seat,
  participantName,
  canReplace,
  onReplace,
}: {
  seat?: Seat;
  participantName?: string;
  canReplace: boolean;
  onReplace?: (difficulty: number) => void;
}) {
  const [difficulty, setDifficulty] = useState(5);
  return (
    <div className="modal-backdrop four-online-pause">
      <section className="gameover-modal">
        <div className="victory-crown"><Wifi size={34} /></div>
        <p className="eyebrow">MATCH PAUSED</p>
        <h2>{participantName ?? "A participant"} disconnected</h2>
        <p>
          {seat
            ? `${seatName(seat)} remains reserved for secure reconnection.`
            : "Their seat remains reserved for secure reconnection."}
          {" "}No actions or AI turns will run while the room is paused.
        </p>
        {canReplace && onReplace && (
          <div className="four-replace-ai">
            <label>
              Replacement AI level <strong>{difficulty}</strong>
              <input
                type="range"
                min="1"
                max="10"
                value={difficulty}
                onChange={(event) => setDifficulty(Number(event.target.value))}
              />
            </label>
            <button
              className="primary-button"
              onClick={() => onReplace(difficulty)}
            >
              Replace permanently with AI
            </button>
          </div>
        )}
        {!canReplace && <small>Waiting for the host or the reserved participant.</small>}
      </section>
    </div>
  );
}

export interface FourPlayerOnlineSession {
  roomCode: string;
  role: "host" | "peer";
  participantSeat?: Seat;
  status: "playing" | "paused" | "finished";
  awaitingSync: boolean;
  undoConsent: boolean;
  undoAvailable: boolean;
  pausedSeat?: Seat;
  pausedParticipantName?: string;
  onAction: (action: FourPlayerAction) => void;
  onUndo: () => void;
  onUndoConsentChange: (enabled: boolean) => void;
  onReplaceWithAi?: (difficulty: number) => void;
}

export interface FourPlayerGameProps {
  initialState: FourPlayerState;
  initialUndoHistory?: FourPlayerState[];
  initialTurnStart?: FourPlayerState;
  undoPreferred: boolean;
  onUndoPreferenceChange: (enabled: boolean) => void;
  onPersist: (
    state: FourPlayerState,
    undoHistory: FourPlayerState[],
    turnStart?: FourPlayerState,
  ) => Promise<boolean>;
  onQuit: () => void;
  onNewGame: () => void;
  onlineSession?: FourPlayerOnlineSession;
}

export function FourPlayerGame({
  initialState,
  initialUndoHistory = [],
  initialTurnStart,
  undoPreferred,
  onUndoPreferenceChange,
  onPersist,
  onQuit,
  onNewGame,
  onlineSession,
}: FourPlayerGameProps) {
  const [state, baseDispatch] = useReducer(
    fourPlayerReducer,
    initialState,
    (source) => fourPlayerReducer(source, { type: "load", state: source }),
  );
  const stateRef = useRef(state);
  stateRef.current = state;
  const undoStack = useRef(initialUndoHistory.map(prepareFourPlayerState));
  const turnStart = useRef(
    initialTurnStart
      ? prepareFourPlayerState(initialTurnStart)
      : state.phase === "play" && isStableState(state)
        ? prepareFourPlayerState(state)
        : undefined,
  );
  const [undoDepth, setUndoDepth] = useState(undoStack.current.length);
  const [animating, setAnimating] = useState(false);
  const [captureEffects, setCaptureEffects] = useState<Set<Square>>(() => new Set());
  const [moveFirstDraft, setMoveFirstDraft] =
    useState<FourPlayerMoveFirstDraft>();
  const [inspectedSquare, setInspectedSquare] = useState<Square>();
  const [inspectedGod, setInspectedGod] = useState<{ godId: GodId; seat: Seat }>();
  const [graveyardSeat, setGraveyardSeat] = useState<Seat>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(initialState.phase === "gameover");
  const [aiWorking, setAiWorking] = useState(false);
  const [displayedOrbs, setDisplayedOrbs] = useState<FourPlayerOrbTotals>(
    () => fourPlayerOrbTotals(state),
  );
  const [orbFlights, setOrbFlights] = useState<FourPlayerOrbFlight[]>([]);
  const [arrivingOrbs, setArrivingOrbs] = useState<Set<string>>(() => new Set());
  const aiPlan = useRef<FourPlayerAction[]>([]);
  const quickDraftPending = useRef(false);
  const aiActionsThisTurn = useRef(0);
  const aiNoPlanKey = useRef<string | undefined>(undefined);
  const animationTimer = useRef<number | undefined>(undefined);
  const orbAnimationTimers = useRef<number[]>([]);
  const processedOrbAnimations = useRef(
    new Set((state.orbAnimations ?? []).map((event) => event.id)),
  );
  const pendingOrbArrivals = useRef<Record<string, number>>({});
  const latestOrbTotals = useRef(fourPlayerOrbTotals(state));
  const previousPieceSquares = useRef(new Map(
    Object.entries(state.board).map(([square, piece]) => [piece.id, square]),
  ));
  const positionKey = boardPositionSignature(state);

  const updateUndoDepth = () => setUndoDepth(undoStack.current.length);
  const receiveState = (next: FourPlayerState) => {
    const loaded = fourPlayerReducer(next, { type: "load", state: next });
    setMoveFirstDraft(undefined);
    stateRef.current = loaded;
    baseDispatch({ type: "load", state: loaded });
  };
  useEffect(() => {
    if (onlineSession) receiveState(prepareFourPlayerState(initialState));
  }, [initialState, onlineSession?.roomCode]);
  useEffect(() => {
    const activeControl = state.players[state.activeSeat].control;
    const authorized = onlineSession
      ? onlineSession.status === "playing" &&
        !onlineSession.awaitingSync &&
        onlineSession.participantSeat === state.activeSeat
      : activeControl.kind === "human";
    if (!authorized || !canStartFourPlayerMoveFirst(state)) {
      setMoveFirstDraft(undefined);
    }
  }, [
    state.activeSeat,
    state.phase,
    state.turn,
    state.round,
    state.selectedGod,
    state.selectedAbility,
    state.selectedSquare,
    state.pending,
    onlineSession?.participantSeat,
    onlineSession?.status,
    onlineSession?.awaitingSync,
  ]);
  useEffect(() => {
    setResultOpen(state.phase === "gameover");
  }, [state]);
  const scheduleAnimationUnlock = (duration = 480) => {
    if (animationTimer.current) window.clearTimeout(animationTimer.current);
    if (reducedMotion()) {
      setAnimating(false);
      return;
    }
    setAnimating(true);
    animationTimer.current = window.setTimeout(() => {
      setAnimating(false);
      setCaptureEffects(new Set());
    }, duration);
  };
  const recordBoundary = (
    current: FourPlayerState,
    action: FourPlayerAction,
    next: FourPlayerState,
  ) => {
    const completedDraft =
      current.phase === "draft" &&
      next.draft.pickIndex !== current.draft.pickIndex;
    const completedTurn =
      current.phase === "play" &&
      (
        next.turn !== current.turn ||
        next.activeSeat !== current.activeSeat ||
        next.phase === "upgrade" ||
        next.phase === "gameover"
      );
    const completedUpgrade =
      action.type === "upgrade" &&
      current.phase === "upgrade" &&
      (
        next.phase !== current.phase ||
        next.activeSeat !== current.activeSeat ||
        next.upgradeQueue.length !== current.upgradeQueue.length
      );
    if (completedDraft) {
      undoStack.current.push(prepareFourPlayerState(current));
      if (next.phase === "play") turnStart.current = prepareFourPlayerState(next);
      updateUndoDepth();
    } else if (completedTurn) {
      undoStack.current.push(prepareFourPlayerState(turnStart.current ?? current));
      turnStart.current = next.phase === "play" && isStableState(next)
        ? prepareFourPlayerState(next)
        : undefined;
      updateUndoDepth();
    } else if (completedUpgrade) {
      undoStack.current.push(prepareFourPlayerState(current));
      turnStart.current = next.phase === "play" && isStableState(next)
        ? prepareFourPlayerState(next)
        : undefined;
      updateUndoDepth();
    }
  };
  const applyAction = (
    action: FourPlayerAction,
    source: "human" | "ai" = "human",
  ) => {
    const current = stateRef.current;
    const next = fourPlayerReducer(current, action);
    recordActionTransition({
      variant: "four-player",
      mode: current.config.mode,
      source,
      action,
      before: current as unknown as Record<string, unknown>,
      after: next as unknown as Record<string, unknown>,
    });
    if (stateSignature(next) === stateSignature(current)) return false;
    recordBoundary(current, action, next);
    const removedSquares = Object.entries(current.board)
      .filter(([, piece]) => !Object.values(next.board).some((candidate) => candidate.id === piece.id))
      .map(([square]) => square);
    const moved = boardPositionSignature(current) !== boardPositionSignature(next);
    const orbChanged = FOUR_PLAYER_SEATS.some((seat) =>
      current.players[seat].orbs.light !== next.players[seat].orbs.light ||
      current.players[seat].orbs.dark !== next.players[seat].orbs.dark
    );
    if (removedSquares.length) setCaptureEffects(new Set(removedSquares));
    receiveState(next);
    if (moved || removedSquares.length || orbChanged) scheduleAnimationUnlock();
    return true;
  };

  const humanDispatch: FourPlayerDispatch = (action) => {
    const current = stateRef.current;
    if (current.phase === "gameover") return;
    if (onlineSession) {
      if (
        animating ||
        onlineSession.status !== "playing" ||
        onlineSession.awaitingSync ||
        !onlineSession.participantSeat ||
        current.activeSeat !== onlineSession.participantSeat
      ) return;
      recordDiagnostic({
        category: "online",
        event: "four-player-action-sent",
        context: { variant: "four-player", role: onlineSession.role },
        data: { action, phase: current.phase, turn: current.turn },
      });
      onlineSession.onAction(action);
      return;
    }
    if (
      animating ||
      aiWorking ||
      current.players[current.activeSeat].control.kind !== "human"
    ) return;
    applyAction(action);
  };

  const quickDraft = () => {
    if (
      onlineSession ||
      quickDraftPending.current ||
      stateRef.current.phase !== "draft"
    ) return;
    quickDraftPending.current = true;
    aiPlan.current = [];
    aiActionsThisTurn.current = 0;
    setAiWorking(false);
    try {
      while (stateRef.current.phase === "draft") {
        const godId = randomItem(stateRef.current.draft.available);
        if (!godId) break;
        if (!applyAction({ type: "draft", godId })) break;
      }
    } finally {
      quickDraftPending.current = false;
    }
  };

  const undoStable =
    isStableState(state) &&
    !animating &&
    !aiWorking &&
    aiPlan.current.length === 0;
  const canUndo = onlineSession
    ? onlineSession.undoAvailable &&
      !onlineSession.awaitingSync &&
      onlineSession.status !== "paused"
    : undoPreferred && undoDepth > 0 && undoStable;
  const applyUndo = () => {
    if (onlineSession) {
      if (canUndo) onlineSession.onUndo();
      return;
    }
    if (!canUndo) return;
    const current = stateRef.current;
    let restored = undoStack.current.pop();
    if (!restored) return;
    while (
      restored.players[restored.activeSeat].control.kind === "ai" &&
      undoStack.current.length
    ) {
      restored = undoStack.current.pop()!;
    }
    aiPlan.current = [];
    aiActionsThisTurn.current = 0;
    setAiWorking(false);
    setAnimating(false);
    setCaptureEffects(new Set());
    const next = prepareFourPlayerState(restored);
    turnStart.current = next.phase === "play" && isStableState(next)
      ? prepareFourPlayerState(next)
      : undefined;
    receiveState(next);
    recordActionTransition({
      variant: "four-player",
      mode: current.config.mode,
      source: "undo",
      action: { type: "undo" },
      before: current as unknown as Record<string, unknown>,
      after: next as unknown as Record<string, unknown>,
    });
    updateUndoDepth();
  };

  useEffect(() => () => {
    if (animationTimer.current) window.clearTimeout(animationTimer.current);
    for (const timer of orbAnimationTimers.current) window.clearTimeout(timer);
  }, []);

  const orbAnimationKey = (state.orbAnimations ?? [])
    .map((event) => event.id)
    .join(",");

  useLayoutEffect(() => {
    const actualTotals = fourPlayerOrbTotals(state);
    latestOrbTotals.current = actualTotals;
    const newEvents = (state.orbAnimations ?? [])
      .filter((event) => !processedOrbAnimations.current.has(event.id));
    newEvents.forEach((event) => processedOrbAnimations.current.add(event.id));

    if (reducedMotion()) {
      setDisplayedOrbs(actualTotals);
      return;
    }

    const flights = newEvents.flatMap((event): FourPlayerOrbFlight[] => {
      const source = document.querySelector<HTMLElement>(`[data-square="${event.source}"]`);
      const target = document.querySelector<HTMLElement>(
        `[data-orb-target="${fourPlayerOrbTargetKey(event.player, event.orb)}"]`,
      );
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

    setDisplayedOrbs((current) => {
      const next = Object.fromEntries(
        FOUR_PLAYER_SEATS.map((seat) => [seat, { ...current[seat] }]),
      ) as FourPlayerOrbTotals;
      for (const seat of FOUR_PLAYER_SEATS) {
        for (const orb of ["light", "dark"] as const) {
          const key = fourPlayerOrbTargetKey(seat, orb);
          if (!pendingOrbArrivals.current[key]) {
            next[seat][orb] = actualTotals[seat][orb];
          }
        }
      }
      for (const event of newEvents) {
        if (!animatedIds.has(event.id)) continue;
        const key = fourPlayerOrbTargetKey(event.player, event.orb);
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
        const next = Object.fromEntries(
          FOUR_PLAYER_SEATS.map((seat) => [seat, { ...current[seat] }]),
        ) as FourPlayerOrbTotals;
        for (const event of flights) {
          const key = fourPlayerOrbTargetKey(event.player, event.orb);
          if (pendingOrbArrivals.current[key] !== event.id) continue;
          next[event.player][event.orb] =
            latestOrbTotals.current[event.player][event.orb];
          delete pendingOrbArrivals.current[key];
          arriving.add(key);
        }
        return next;
      });
      if (arriving.size) {
        setArrivingOrbs((current) => new Set([...current, ...arriving]));
      }
    }, 780);

    const cleanupTimer = window.setTimeout(() => {
      const ids = new Set(flights.map((flight) => flight.id));
      const keys = new Set(
        flights.map((flight) => fourPlayerOrbTargetKey(flight.player, flight.orb)),
      );
      setOrbFlights((current) => current.filter((flight) => !ids.has(flight.id)));
      setArrivingOrbs((current) =>
        new Set([...current].filter((key) => !keys.has(key)))
      );
    }, 1050);

    orbAnimationTimers.current.push(arrivalTimer, cleanupTimer);
  }, [
    orbAnimationKey,
    state.players.north.orbs.light,
    state.players.north.orbs.dark,
    state.players.east.orbs.light,
    state.players.east.orbs.dark,
    state.players.south.orbs.light,
    state.players.south.orbs.dark,
    state.players.west.orbs.light,
    state.players.west.orbs.dark,
  ]);

  useLayoutEffect(() => {
    const current = new Map(Object.entries(state.board).map(([square, piece]) => [piece.id, square]));
    const previous = previousPieceSquares.current;
    previousPieceSquares.current = current;
    if (reducedMotion()) return;
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
      pieceElement.animate(
        [
          { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
          { transform: "translate3d(0, 0, 0)" },
        ],
        { duration: 430, easing: "cubic-bezier(.22,.8,.2,1)" },
      );
    }
  }, [positionKey]);

  useEffect(() => {
    if (onlineSession) {
      aiPlan.current = [];
      aiActionsThisTurn.current = 0;
      setAiWorking(false);
      return;
    }
    if (!isFourPlayerAiTurn(state) || animating || rulesOpen || settingsOpen) {
      if (!isFourPlayerAiTurn(state)) {
        aiPlan.current = [];
        aiActionsThisTurn.current = 0;
        setAiWorking(false);
      }
      return;
    }
    const turnKey = `${state.phase}:${state.turn}:${state.activeSeat}`;
    if (aiNoPlanKey.current === turnKey) return;
    setAiWorking(true);
    if (!aiPlan.current.length) {
      recordDiagnostic({
        category: "ai",
        event: "four-player-plan-start",
        context: { variant: "four-player" },
        data: { phase: state.phase, activeSeat: state.activeSeat, turn: state.turn },
      });
      aiPlan.current = chooseFourPlayerAiPlan(state);
      recordDiagnostic({
        category: "ai",
        event: "four-player-plan-result",
        context: { variant: "four-player" },
        data: { actions: aiPlan.current },
      });
    }
    const action = aiPlan.current[0];
    if (!action) {
      aiNoPlanKey.current = turnKey;
      setAiWorking(false);
      return;
    }
    if (aiActionsThisTurn.current >= 40) {
      aiPlan.current = [];
      aiActionsThisTurn.current = 0;
      aiNoPlanKey.current = turnKey;
      setAiWorking(false);
      return;
    }
    const delay = reducedMotion() ? 0 : state.phase === "draft" ? 340 : 280;
    const timer = window.setTimeout(() => {
      aiPlan.current = aiPlan.current.slice(1);
      aiActionsThisTurn.current += 1;
      const progressed = applyAction(action!, "ai");
      if (!progressed) aiPlan.current = [];
    }, delay);
    return () => window.clearTimeout(timer);
  }, [
    animating,
    rulesOpen,
    settingsOpen,
    state,
    onlineSession?.roomCode,
  ]);

  useEffect(() => {
    if (onlineSession) return;
    const timer = window.setTimeout(() => {
      void onPersist(
        prepareFourPlayerState(state),
        undoStack.current.map(prepareFourPlayerState),
        turnStart.current ? prepareFourPlayerState(turnStart.current) : undefined,
      );
    }, 160);
    return () => window.clearTimeout(timer);
  }, [state, onPersist, onlineSession?.roomCode]);

  const saveAndQuit = async () => {
    if (onlineSession) return;
    const saved = await onPersist(
      prepareFourPlayerState(stateRef.current),
      undoStack.current.map(prepareFourPlayerState),
      turnStart.current ? prepareFourPlayerState(turnStart.current) : undefined,
    );
    if (saved) onQuit();
  };

  const handleGodClick = (godId: GodId, seat: Seat) => {
    const canAct = onlineSession
      ? onlineSession.status === "playing" &&
        !onlineSession.awaitingSync &&
        onlineSession.participantSeat === seat
      : state.players[seat].control.kind === "human";
    if (
      seat === state.activeSeat &&
      state.phase === "play" &&
      !state.rested.includes(godId) &&
      canAct
    ) {
      setMoveFirstDraft(undefined);
      setInspectedGod(undefined);
      humanDispatch({ type: "select-god", godId });
      return;
    }
    setInspectedGod({ godId, seat });
  };

  if (state.phase === "draft") {
    const draftInputDisabled =
      animating ||
      aiWorking ||
      Boolean(
        onlineSession &&
        (
          onlineSession.status !== "playing" ||
          onlineSession.awaitingSync ||
          onlineSession.participantSeat !== state.activeSeat
        )
      );
    return (
      <>
        <FourPlayerDraft
          state={state}
          dispatch={humanDispatch}
          inputDisabled={draftInputDisabled}
          onQuickDraft={onlineSession ? undefined : quickDraft}
          canUndo={canUndo}
          onUndo={applyUndo}
          onSaveAndQuit={onlineSession ? undefined : () => void saveAndQuit()}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <MatchEscapeMenu
          onOpenSettings={() => setSettingsOpen(true)}
          onLeave={() => void saveAndQuit()}
          leaveLabel={onlineSession ? "Leave room" : "Save & quit"}
        />
        {settingsOpen && (
          <FourSettingsModal
            undoPreferred={onlineSession?.undoConsent ?? undoPreferred}
            onUndoPreferenceChange={
              onlineSession?.onUndoConsentChange ?? onUndoPreferenceChange
            }
            onClose={() => setSettingsOpen(false)}
          />
        )}
        {onlineSession?.status === "paused" && (
          <FourPlayerPauseOverlay
            seat={onlineSession.pausedSeat}
            participantName={onlineSession.pausedParticipantName}
            canReplace={onlineSession.role === "host"}
            onReplace={onlineSession.onReplaceWithAi}
          />
        )}
      </>
    );
  }

  const activePlayer = state.players[state.activeSeat];
  const actionInputDisabled =
    animating ||
    aiWorking ||
    (onlineSession
      ? onlineSession.status !== "playing" ||
        onlineSession.awaitingSync ||
        onlineSession.participantSeat !== state.activeSeat
      : activePlayer.control.kind !== "human");
  const moveFirstEnabled =
    !actionInputDisabled && canStartFourPlayerMoveFirst(state);
  const moveFirstSources = new Set(
    moveFirstEnabled ? fourPlayerMoveFirstSources(state) : [],
  );
  const moveFirstTargets = moveFirstDraft && moveFirstEnabled
    ? fourPlayerMoveFirstTargets(state, moveFirstDraft.source)
    : [];
  const moveFirstCandidates =
    moveFirstDraft?.destination && moveFirstEnabled
      ? fourPlayerMoveFirstCandidates(state, {
        from: moveFirstDraft.source,
        to: moveFirstDraft.destination,
      })
      : [];
  const selectBoardSquare = (square: Square) => {
    if (actionInputDisabled) return;
    if (moveFirstEnabled) {
      setInspectedGod(undefined);
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
      return;
    }
    humanDispatch({ type: "square", square });
  };
  const commitMoveFirst = (candidate: FourPlayerMoveFirstCandidate) => {
    if (!candidate.valid) return;
    setMoveFirstDraft(undefined);
    humanDispatch({
      type: "commit-move-first",
      godId: candidate.godId,
      abilityId: candidate.abilityId,
      move: candidate.move,
      expectedSeat: state.activeSeat,
      expectedTurn: state.turn,
      expectedRound: state.round,
      expectedBoardIdentity: fourPlayerMoveFirstBoardIdentity(state),
    });
  };
  const winnerName = state.winner?.team
    ? teamName(state.winner.team)
    : state.winner?.seat
      ? state.players[state.winner.seat].name
      : "A pantheon";

  return (
    <main className={`four-game-page ${state.phase === "gameover" ? "finished-view" : ""} ${
      animating ||
      aiWorking ||
      onlineSession?.awaitingSync ||
      onlineSession?.status === "paused"
        ? "input-locked"
        : ""
    }`}>
      <header className="topbar">
        <Brand />
        <div className="game-meta">
          <span>ROUND <strong>{state.round}</strong></span>
          <i />
          <span>TURN <strong>{state.turn}</strong></span>
          <i />
          <span>{state.config.mode === "teams" ? "2V2 TEAMS" : "FREE-FOR-ALL"}</span>
          {onlineSession && <><i /><span>ROOM <strong>{onlineSession.roomCode}</strong></span></>}
        </div>
        <div className="header-actions">
          <button
            onClick={applyUndo}
            disabled={!canUndo}
            title={undoPreferred ? "Undo the latest stable Human turn and AI chain" : "Enable undo in Settings"}
          >
            <Undo2 size={18} /><span>Undo</span>
          </button>
          {!onlineSession && (
            <button onClick={() => void saveAndQuit()}><Save size={18} /><span>Save & quit</span></button>
          )}
          <button onClick={() => setHistoryOpen(true)}><History size={18} /><span>History</span></button>
          <button onClick={() => setRulesOpen(true)}><BookOpen size={18} /><span>Rules</span></button>
          <button onClick={() => setSettingsOpen(true)}><Settings size={18} /><span>Settings</span></button>
          <button onClick={onNewGame}><RotateCcw size={18} /><span>New setup</span></button>
        </div>
      </header>

      <div className="turn-notice">
        <span
          className="four-seat-dot"
          style={{ "--seat-color": activePlayer.displayColor } as React.CSSProperties}
        />
        <strong>{activePlayer.name}</strong>
        <p>
          {aiWorking
            ? `${seatName(state.activeSeat)} AI is choosing...`
            : state.notice}
        </p>
      </div>
      {state.lastAction && (
        <div className="last-action-notice" aria-live="polite">
          <Swords size={15} /><span>Last action</span><strong>{state.lastAction}</strong>
        </div>
      )}

      <div className="four-game-layout">
        <FourPlayerPanel
          state={state}
          seat="north"
          onGodClick={handleGodClick}
          onGraveyard={setGraveyardSeat}
          dispatch={humanDispatch}
          displayedOrbs={displayedOrbs.north}
          arrivingOrbs={arrivingOrbs}
        />
        <FourPlayerPanel
          state={state}
          seat="west"
          onGodClick={handleGodClick}
          onGraveyard={setGraveyardSeat}
          dispatch={humanDispatch}
          displayedOrbs={displayedOrbs.west}
          arrivingOrbs={arrivingOrbs}
        />
        <section className="four-board-column">
          <FourPlayerBoard
            state={state}
            onSquare={selectBoardSquare}
            onInspectSquare={setInspectedSquare}
            captureEffects={captureEffects}
            legalTargets={moveFirstDraft ? moveFirstTargets : state.legalTargets}
            provisionalSource={moveFirstDraft?.source}
            provisionalDestination={moveFirstDraft?.destination}
          />
          <SquareInfo
            state={state}
            square={inspectedSquare}
            onClose={() => setInspectedSquare(undefined)}
          />
        </section>
        <FourPlayerPanel
          state={state}
          seat="east"
          onGodClick={handleGodClick}
          onGraveyard={setGraveyardSeat}
          dispatch={humanDispatch}
          displayedOrbs={displayedOrbs.east}
          arrivingOrbs={arrivingOrbs}
        />
        <FourPlayerPanel
          state={state}
          seat="south"
          onGodClick={handleGodClick}
          onGraveyard={setGraveyardSeat}
          dispatch={humanDispatch}
          displayedOrbs={displayedOrbs.south}
          arrivingOrbs={arrivingOrbs}
        />
        <FourActionPanel
          state={state}
          dispatch={humanDispatch}
          inputDisabled={actionInputDisabled}
          moveFirstDraft={moveFirstDraft}
          moveFirstCandidates={moveFirstCandidates}
          onCancelMoveFirst={() => setMoveFirstDraft(undefined)}
          onCommitMoveFirst={commitMoveFirst}
          inspectedGod={inspectedGod}
          onInspectGod={(godId, seat) => setInspectedGod({ godId, seat })}
          onCloseInspection={() => setInspectedGod(undefined)}
        />
      </div>

      {orbFlights.map((flight) => {
        const visualClass = flight.orb === "light" ? "white" : "black";
        return (
          <div
            className={`orb-flight ${visualClass}`}
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
                <span className={`orb ${visualClass}`} />
                <b>+{flight.amount}</b>
              </span>
            </span>
          </div>
        );
      })}
      {historyOpen && (
        <aside className="history-drawer">
          <div><h3><History size={18} /> Chronicle</h3><button onClick={() => setHistoryOpen(false)}><X size={18} /></button></div>
          {state.history.map((entry, index) => (
            <p key={`${entry}-${index}`}><span>{index + 1}</span>{entry}</p>
          ))}
        </aside>
      )}
      {graveyardSeat && (
        <FourGraveyardModal
          state={state}
          seat={graveyardSeat}
          onClose={() => setGraveyardSeat(undefined)}
        />
      )}
      {state.phase === "gameover" && (
        <GameResultPresentation
          open={resultOpen}
          eyebrow="THE FOUR-PANTHEON WAR ENDS"
          title={state.winner ? `${winnerName} is victorious` : "The war ends in a draw"}
          description={state.winner?.reason === "first-king-captured"
            ? "The first King has fallen."
            : state.winner?.reason === "last-team"
              ? "The last surviving team controls the cross-board."
              : state.winner
                ? "The last surviving player controls the cross-board."
                : "Every living seat was stalemated in the same unchanged position."}
          newGameLabel="Begin a new setup"
          undoEnabled={onlineSession?.undoConsent ?? undoPreferred}
          canUndo={canUndo}
          onOpenChange={setResultOpen}
          onUndo={applyUndo}
          onOpenUndoSettings={() => setSettingsOpen(true)}
          onNewGame={onNewGame}
        />
      )}
      {rulesOpen && <FourRulesModal onClose={() => setRulesOpen(false)} />}
      {settingsOpen && (
        <FourSettingsModal
          undoPreferred={onlineSession?.undoConsent ?? undoPreferred}
          onUndoPreferenceChange={
            onlineSession?.onUndoConsentChange ?? onUndoPreferenceChange
          }
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {onlineSession?.status === "paused" && (
        <FourPlayerPauseOverlay
          seat={onlineSession.pausedSeat}
          participantName={onlineSession.pausedParticipantName}
          canReplace={onlineSession.role === "host"}
          onReplace={onlineSession.onReplaceWithAi}
        />
      )}
      <MatchEscapeMenu
        onOpenSettings={() => setSettingsOpen(true)}
        onLeave={() => void saveAndQuit()}
        leaveLabel={onlineSession ? "Leave room" : "Save & quit"}
      />
    </main>
  );
}
