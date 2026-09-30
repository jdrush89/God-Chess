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
} from "react";
import {
  chooseFourPlayerAiPlan,
  isFourPlayerAiTurn,
} from "../game/fourPlayerAi";
import { fourPlayerSquareAt } from "../game/fourPlayerChess";
import { seatsAreAllies } from "../game/fourPlayerConfig";
import {
  availableFourPlayerActions,
  fourPlayerReducer,
  hasCommittedFourPlayerAction,
} from "../game/fourPlayerEngine";
import { prepareFourPlayerState } from "../game/fourPlayerPersistence";
import {
  FOUR_PLAYER_SEATS,
  type FourPlayerAction,
  type FourPlayerPiece,
  type FourPlayerState,
  type OrbAffinity,
  type Seat,
} from "../game/fourPlayerTypes";
import { abilityLevel, GOD_BY_ID, GODS } from "../game/gods";
import type { Ability, GodId, PieceType, Square } from "../game/types";
import {
  FOUR_PLAYER_PALETTES,
  FOUR_PLAYER_SEAT_LABELS,
} from "./setupConfig";

type FourPlayerDispatch = (action: FourPlayerAction) => void;

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

function Orb({ affinity, count }: { affinity: OrbAffinity; count: number }) {
  const visualClass = affinity === "light" ? "white" : "black";
  return (
    <span
      className="orb-count"
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

function FourPlayerDraft({
  state,
  dispatch,
  inputDisabled,
  canUndo,
  onUndo,
  onSaveAndQuit,
  onOpenSettings,
}: {
  state: FourPlayerState;
  dispatch: FourPlayerDispatch;
  inputDisabled: boolean;
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
        {activePlayer.control.kind !== "ai" && (
          <button
            className="auto-draft-button"
            disabled={inputDisabled || !state.draft.available.length}
            onClick={() => {
              const index = Math.floor(Math.random() * state.draft.available.length);
              dispatch({ type: "draft", godId: state.draft.available[index] });
            }}
          >
            Auto-pick a God
          </button>
        )}
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
}: {
  state: FourPlayerState;
  seat: Seat;
  onGodClick: (godId: GodId, seat: Seat) => void;
  onGraveyard: (seat: Seat) => void;
  dispatch: FourPlayerDispatch;
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
        <span>
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
      <div className="four-panel-resources">
        <Orb affinity="light" count={player.orbs.light} />
        <Orb affinity="dark" count={player.orbs.dark} />
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
  dispatch,
  onInspectSquare,
  captureEffects,
}: {
  state: FourPlayerState;
  dispatch: FourPlayerDispatch;
  onInspectSquare: (square: Square) => void;
  captureEffects: Set<Square>;
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
  return (
    <div className="four-board-shell">
      <div className="four-board-frame">
        <div className="four-chess-board" role="grid" aria-label="Four-player God Chess board">
          {cells.map(({ square, file, rank }) => {
            if (!square) {
              return <span className="four-board-outside" aria-hidden="true" key={`${file}-${rank}`} />;
            }
            const piece = state.board[square];
            const selected = state.selectedSquare === square;
            const legal = !previewing && state.legalTargets.includes(square);
            const effectPreview = previewing && state.legalTargets.includes(square);
            const banana = state.bananas.find((item) => item.square === square);
            return (
              <button
                role="gridcell"
                data-square={square}
                aria-label={`${square}${piece ? `, ${state.players[piece.owner].name} ${piece.type}${piece.controller ? `, controlled by ${state.players[piece.controller].name}` : ", inert"}` : ""}${legal ? ", legal target" : ""}`}
                className={`four-board-square ${(file + rank) % 2 ? "light" : "dark"} ${selected ? "selected" : ""} ${legal ? "legal" : ""} ${legal && piece ? "legal-occupied" : ""} ${effectPreview ? "effect-preview" : ""}`}
                onClick={() => {
                  onInspectSquare(square);
                  dispatch({ type: "square", square });
                }}
                key={square}
              >
                {(file === 3 || file === 10) && <span className="rank-label">{rank + 1}</span>}
                {(rank === 3 || rank === 10) && (
                  <span className="file-label">{String.fromCharCode(97 + file)}</span>
                )}
                {legal && !piece && <span className="move-dot" />}
                {banana && <span className="banana" title="Banana peel">⌁</span>}
                {captureEffects.has(square) && <span className="four-capture-effect"><Skull /></span>}
                {piece && <PieceView piece={piece} state={state} square={square} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
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
}: {
  ability: Ability;
  level: number;
  previewLevel?: number;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`four-ability-card ${active ? "active" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span>
        <strong>{ability.name}</strong>
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
  );
}

function PendingChoices({
  state,
  dispatch,
}: {
  state: FourPlayerState;
  dispatch: FourPlayerDispatch;
}) {
  const pending = state.pending;
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
}

function FourActionPanel({
  state,
  dispatch,
  inspectedGod,
  onInspectGod,
  onCloseInspection,
}: {
  state: FourPlayerState;
  dispatch: FourPlayerDispatch;
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
  const [godPreviewLevel, setGodPreviewLevel] = useState<number>();
  const defaultGodPreviewLevel = god
    ? Math.min(...god.abilities.map((ability) => abilityLevel(owner.upgrades, ability.id)))
    : 1;

  useEffect(() => {
    setGodPreviewLevel(undefined);
  }, [presentedGodId]);

  if (state.phase === "upgrade") {
    return (
      <aside className="four-action-panel">
        <div className="panel-heading">
          <span>DIVINE UPGRADE</span>
          <small>{active.name}</small>
        </div>
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
                  return (
                    <AbilityCard
                      ability={ability}
                      level={level}
                      active={false}
                      disabled={level >= 3}
                      onClick={() => dispatch({ type: "upgrade", abilityId: ability.id })}
                      key={ability.id}
                    />
                  );
                })}
              </section>
            );
          })}
        </div>
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
          {state.pending?.step === "grave" && (
            <div className="four-grave-choice">
              {active.graveyard.map(({ piece }) => (
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
          <PendingChoices state={state} dispatch={dispatch} />
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
          {!readOnly && state.legalSeats.length > 0 && (
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
          {!readOnly && state.pending?.step === "grave" && (
            <div className="four-grave-choice">
              {active.graveyard.map(({ piece }) => (
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
              return (
                <AbilityCard
                  ability={ability}
                  level={level}
                  previewLevel={godPreviewLevel}
                  active={!readOnly && state.selectedAbility === ability.id}
                  disabled={
                    readOnly ||
                    committed ||
                    state.rested.includes(god.id) ||
                    !affordable ||
                    (ability.id === "lure" && !hasQueen)
                  }
                  onClick={() => dispatch({ type: "select-ability", abilityId: ability.id })}
                  key={ability.id}
                />
              );
            })}
          </div>
          {!readOnly && <PendingChoices state={state} dispatch={dispatch} />}
          {!readOnly && state.selectedAbility && (
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
  const [inspectedSquare, setInspectedSquare] = useState<Square>();
  const [inspectedGod, setInspectedGod] = useState<{ godId: GodId; seat: Seat }>();
  const [graveyardSeat, setGraveyardSeat] = useState<Seat>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiWorking, setAiWorking] = useState(false);
  const aiPlan = useRef<FourPlayerAction[]>([]);
  const aiActionsThisTurn = useRef(0);
  const animationTimer = useRef<number | undefined>(undefined);
  const previousPieceSquares = useRef(new Map(
    Object.entries(state.board).map(([square, piece]) => [piece.id, square]),
  ));
  const positionKey = boardPositionSignature(state);

  const updateUndoDepth = () => setUndoDepth(undoStack.current.length);
  const receiveState = (next: FourPlayerState) => {
    const loaded = fourPlayerReducer(next, { type: "load", state: next });
    stateRef.current = loaded;
    baseDispatch({ type: "load", state: loaded });
  };
  useEffect(() => {
    if (onlineSession) receiveState(prepareFourPlayerState(initialState));
  }, [initialState, onlineSession?.roomCode]);
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
  const applyAction = (action: FourPlayerAction) => {
    const current = stateRef.current;
    const next = fourPlayerReducer(current, action);
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
    if (onlineSession) {
      if (
        animating ||
        onlineSession.status !== "playing" ||
        onlineSession.awaitingSync ||
        !onlineSession.participantSeat ||
        current.activeSeat !== onlineSession.participantSeat
      ) return;
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

  const undoStable =
    isStableState(state) &&
    !animating &&
    !aiWorking &&
    aiPlan.current.length === 0;
  const canUndo = onlineSession
    ? onlineSession.undoAvailable &&
      !onlineSession.awaitingSync &&
      onlineSession.status === "playing"
    : undoPreferred && undoDepth > 0 && undoStable;
  const applyUndo = () => {
    if (onlineSession) {
      if (canUndo) onlineSession.onUndo();
      return;
    }
    if (!canUndo) return;
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
    updateUndoDepth();
  };

  useEffect(() => () => {
    if (animationTimer.current) window.clearTimeout(animationTimer.current);
  }, []);

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
    setAiWorking(true);
    if (!aiPlan.current.length) {
      aiPlan.current = chooseFourPlayerAiPlan(state);
    }
    let action = aiPlan.current[0];
    if (!action) {
      action = availableFourPlayerActions(state)[0];
      if (!action) {
        setAiWorking(false);
        return;
      }
    }
    if (aiActionsThisTurn.current >= 40) {
      const emergency = availableFourPlayerActions(state);
      action = emergency.find((candidate) =>
        candidate.type === "pass" || candidate.type === "cancel"
      ) ?? emergency[0];
      aiPlan.current = [];
      aiActionsThisTurn.current = 0;
      if (!action) {
        setAiWorking(false);
        return;
      }
    }
    const delay = reducedMotion() ? 0 : state.phase === "draft" ? 340 : 280;
    const timer = window.setTimeout(() => {
      aiPlan.current = aiPlan.current.slice(1);
      aiActionsThisTurn.current += 1;
      const progressed = applyAction(action!);
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
          canUndo={canUndo}
          onUndo={applyUndo}
          onSaveAndQuit={onlineSession ? undefined : () => void saveAndQuit()}
          onOpenSettings={() => setSettingsOpen(true)}
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
  const winnerName = state.winner?.team
    ? teamName(state.winner.team)
    : state.winner?.seat
      ? state.players[state.winner.seat].name
      : "A pantheon";

  return (
    <main className={`four-game-page ${
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
          <button onClick={onNewGame}><RotateCcw size={18} /><span>New game</span></button>
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
        />
        <FourPlayerPanel
          state={state}
          seat="west"
          onGodClick={handleGodClick}
          onGraveyard={setGraveyardSeat}
          dispatch={humanDispatch}
        />
        <section className="four-board-column">
          <FourPlayerBoard
            state={state}
            dispatch={humanDispatch}
            onInspectSquare={setInspectedSquare}
            captureEffects={captureEffects}
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
        />
        <FourPlayerPanel
          state={state}
          seat="south"
          onGodClick={handleGodClick}
          onGraveyard={setGraveyardSeat}
          dispatch={humanDispatch}
        />
        <FourActionPanel
          state={state}
          dispatch={humanDispatch}
          inspectedGod={inspectedGod}
          onInspectGod={(godId, seat) => setInspectedGod({ godId, seat })}
          onCloseInspection={() => setInspectedGod(undefined)}
        />
      </div>

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
      {state.phase === "gameover" && state.winner && (
        <div className="modal-backdrop">
          <section className="gameover-modal">
            <div className="victory-crown"><Crown size={38} /></div>
            <p className="eyebrow">THE FOUR-PANTHEON WAR ENDS</p>
            <h2>{winnerName} is victorious</h2>
            <p>
              {state.winner.reason === "first-king-captured"
                ? "The first King has fallen."
                : state.winner.reason === "last-team"
                  ? "The last surviving team controls the cross-board."
                  : "The last surviving player controls the cross-board."}
            </p>
            <button className="primary-button" onClick={onNewGame}>Begin a new game</button>
          </section>
        </div>
      )}
    </main>
  );
}
