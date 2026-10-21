import {
  ArrowLeft,
  Bot,
  BookOpen,
  Check,
  ChevronRight,
  Crosshair,
  Crown,
  History,
  Info,
  LoaderCircle,
  RotateCcw,
  Settings,
  Shield,
  Sparkles,
  Skull,
  Undo2,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AchievementId } from "../achievements";
import { GameResultPresentation } from "../GameResultPresentation";
import { MatchEscapeMenu } from "../MatchEscapeMenu";
import { BoardViewport } from "../components/BoardViewport";
import {
  GodPortrait,
  PlayerAbilityCard,
} from "../PlayerGodPanel";
import { GodSkinPicker } from "../GodSkinPicker";
import {
  draftedGodSkin,
  favoriteGodSkin,
  isGodSkinUnlocked,
  loadFavoriteGodSkins,
  type GodSkinId,
  type GodSkinSelections,
} from "../godSkins";
import { LevelSelector } from "../UpgradePreview";
import {
  recordActionTransition,
  recordDiagnostic,
} from "../diagnostics";
import { applyMatchStatisticsTransition } from "../matchStatistics";
import {
  chooseThreePlayerAiPlan,
  isThreePlayerAiTurn,
} from "../game/threePlayerAi";
import { threePlayerIsInCheck } from "../game/threePlayerChess";
import {
  threePlayerHasAlternatingNeutralCells,
  threePlayerNeutralCellAffinity,
} from "../game/threePlayerDivineGeometry";
import {
  availableThreePlayerActions,
  canStartThreePlayerMoveFirst,
  hasCommittedThreePlayerAction,
  threePlayerAbilityMoveSources,
  threePlayerMoveFirstCandidates,
  threePlayerMoveFirstSources,
  threePlayerMoveFirstTargets,
  threePlayerReducer,
} from "../game/threePlayerEngine";
import type { ThreePlayerUndoStatus } from "../multiplayer/types";
import {
  threePlayerOwnerAffinity,
  threePlayerPieceAffinity,
} from "../game/threePlayerConfig";
import {
  THREE_PLAYER_SEATS,
  type ThreePlayerAction,
  type ThreePlayerCell,
  type ThreePlayerMoveFirstCandidate,
  type ThreePlayerPiece,
  type ThreePlayerPieceStatus,
  type ThreePlayerSeat,
  type ThreePlayerState,
} from "../game/threePlayerTypes";
import {
  THREE_PLAYER_PUZZLES,
  type ThreePlayerPuzzleDefinition,
} from "../game/threePlayerPuzzles";
import { abilityLevel, GOD_BY_ID, GODS } from "../game/gods";
import { randomItem } from "../game/random";
import type { GodId, PuzzleId } from "../game/types";
import { ThreePlayerBoard } from "./ThreePlayerBoard";
import { getThreePlayerTopology } from "../game/threePlayerTopology";
import {
  THREE_PLAYER_PALETTES,
  THREE_PLAYER_SEAT_LABELS,
  THREE_PLAYER_VARIANTS,
} from "./setupConfig";
import {
  THREE_PLAYER_PIECE_NAMES,
  THREE_PLAYER_PIECE_SYMBOLS,
  THREE_PLAYER_STATUS_LABELS,
} from "./presentation";

type UiAction = ThreePlayerAction | ({ type: string } & Record<string, unknown>);
interface MoveFirstDraft {
  source: ThreePlayerCell;
  destination?: ThreePlayerCell;
}
type UiState = Omit<
  ThreePlayerState,
  "phase" | "legalPaths" | "pending" | "bananas"
> & {
  phase: ThreePlayerState["phase"] | "upgrade";
  selectedGod?: GodId;
  selectedAbility?: string;
  selectedCell?: ThreePlayerCell;
  legalCells?: ThreePlayerCell[];
  legalSeats?: ThreePlayerSeat[];
  legalPaths?: Array<
    | ThreePlayerCell
    | { id?: string; cells?: ThreePlayerCell[]; path?: ThreePlayerCell[] }
  >;
  pending?: Record<string, unknown>;
  upgradeQueue?: ThreePlayerSeat[];
  bananas?: number | Record<string, number> | unknown[];
  stealth?: unknown;
  orbAnimations?: unknown[];
  presentationEvents?: unknown[];
};

const clone = <T,>(value: T): T => structuredClone(value);

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const isStableState = (state: UiState) => {
  if (state.phase === "draft" || state.phase === "gameover") return true;
  if (state.phase === "upgrade") return !state.pending;
  return !state.selectedGod &&
    !state.selectedAbility &&
    !state.selectedCell &&
    !state.pending &&
    !(state.legalCells?.length) &&
    !(state.legalSeats?.length);
};

const actionValue = <T,>(action: UiAction, key: string): T | undefined =>
  (action as Record<string, unknown>)[key] as T | undefined;

const actionCell = (action: UiAction) =>
  actionValue<string>(action, "cell") ??
  actionValue<string>(action, "square") ??
  actionValue<string>(action, "to");

const actionLabel = (action: UiAction) => {
  const godId = actionValue<GodId>(action, "godId");
  const abilityId = actionValue<string>(action, "abilityId");
  const seat = actionValue<ThreePlayerSeat>(action, "seat");
  const choice = actionValue<string>(action, "choice");
  const booleanChoice = actionValue<boolean>(action, "value");
  const amount = actionValue<number>(action, "amount");
  const orb = actionValue<string>(action, "orb") ??
    actionValue<string>(action, "affinity");
  const path = actionValue<string>(action, "pathId") ??
    actionValue<string>(action, "path");
  const grave = actionValue<string>(action, "graveId") ??
    actionValue<string>(action, "pieceId");
  if (action.type === "select-god" && godId) return `Call ${GOD_BY_ID[godId]?.name ?? godId}`;
  if (action.type === "select-ability" && abilityId) {
    return `Choose ${abilityId.replaceAll("-", " ")}`;
  }
  if (action.type === "confirm-ability") return "Confirm ability";
  if (action.type === "clear-god") return "Choose another God";
  if (action.type === "cancel") return "Cancel";
  if (action.type === "pass") return "Pass";
  if (action.type === "restart") return "Restart";
  if (action.type === "upgrade") return `Upgrade ${abilityId?.replaceAll("-", " ") ?? "ability"}`;
  if (action.type === "seat" && seat) return `Target ${THREE_PLAYER_SEAT_LABELS[seat]}`;
  if (action.type === "choice") {
    if (choice) return choice.replaceAll("-", " ");
    if (booleanChoice !== undefined) return booleanChoice ? "Yes, continue" : "No, finish";
  }
  if (action.type === "amount" && amount !== undefined) return `Choose ${amount}`;
  if (action.type === "orb" && orb) return `Choose ${orb} orb`;
  if (action.type === "path" && path) return `Choose path ${path}`;
  if (action.type === "grave" && grave) return `Choose ${grave}`;
  const detail = seat ?? choice ?? orb ?? grave ?? path;
  return `${action.type.replaceAll("-", " ")}${detail ? `: ${detail}` : ""}`;
};

const pathCells = (state: UiState) => {
  const topology = getThreePlayerTopology(state.config.boardVariant);
  const destination = typeof state.pending?.destination === "string"
    ? state.pending.destination
    : undefined;
  return (state.legalPaths ?? []).flatMap((path) => {
    if (typeof path !== "string") return path.cells ?? path.path ?? [];
    return topology.path(path, destination)?.cells ??
      topology.trace(path)?.cells ??
      [];
  });
};

const safeInCheck = (state: UiState, seat: ThreePlayerSeat) => {
  if (state.players[seat].eliminated || state.phase === "draft") return false;
  try {
    return threePlayerIsInCheck(state as ThreePlayerState, seat);
  } catch {
    return false;
  }
};

const statusOwner = (
  piece: ThreePlayerPiece,
  key: keyof ThreePlayerPieceStatus,
): ThreePlayerSeat | undefined => {
  if (key === "frozen") return piece.status.frozenBy;
  if (key === "poisoned") return piece.status.poisonedBy;
  if (key === "luredBy") return piece.status.luredBy;
  if (key === "hexedBy") return piece.status.hexedBy;
  if (key === "prepared" && typeof piece.status.prepared === "object") {
    return piece.status.prepared.owner;
  }
  if (key === "ritual") return piece.status.ritual?.owner;
  if (key === "markedForDeath") return piece.status.markedForDeath?.owner;
  return undefined;
};

function DraftGodPortrait({
  godId,
  skinId = "base",
  className = "",
}: {
  godId: GodId;
  skinId?: GodSkinId;
  className?: string;
}) {
  return <GodPortrait godId={godId} skinId={skinId} className={className} />;
}

function DraftGodSigil({
  godId,
  skinId = "base",
}: {
  godId: GodId;
  skinId?: GodSkinId;
}) {
  const god = GOD_BY_ID[godId];
  return (
    <span
      className="god-sigil small"
      style={{ "--accent": god.accent } as React.CSSProperties}
      aria-hidden="true"
    >
      <DraftGodPortrait godId={godId} skinId={skinId} />
    </span>
  );
}

function DraftOrbCost({
  affinity,
  count,
}: {
  affinity: "white" | "black";
  count: number;
}) {
  return (
    <span
      className="orb-count small"
      aria-label={`${count} ${affinity} orb${count === 1 ? "" : "s"}`}
    >
      <i className={`orb ${affinity}`} />
      <strong>{count}</strong>
    </span>
  );
}

function ThreePlayerDraft({
  state,
  actions,
  inputDisabled,
  onAction,
  onAutoDraft,
  onQuickDraft,
  canUndo,
  onUndo,
  roomCode,
  completedAchievements,
}: {
  state: UiState;
  actions: UiAction[];
  inputDisabled: boolean;
  onAction: (action: UiAction) => void;
  onAutoDraft: () => void;
  onQuickDraft?: () => void;
  canUndo: boolean;
  onUndo: () => void;
  roomCode?: string;
  completedAchievements: Partial<Record<AchievementId, string>>;
}) {
  const [inspected, setInspected] = useState<GodId>(GODS[0].id);
  const [level, setLevel] = useState(1);
  const [favorites] = useState<GodSkinSelections>(loadFavoriteGodSkins);
  const [selectedSkinId, setSelectedSkinId] = useState<GodSkinId>(() =>
    favoriteGodSkin(favorites, GODS[0].id, completedAchievements)
  );
  const pantheonGridRef = useRef<HTMLDivElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const claimed = new Map<GodId, ThreePlayerSeat>();
  for (const seat of THREE_PLAYER_SEATS) {
    for (const godId of state.players[seat].gods) claimed.set(godId, seat);
  }
  const currentSeat = state.draft.order[state.draft.pickIndex] ?? state.activeSeat;
  const activePlayer = state.players[currentSeat];
  const currentGod = GOD_BY_ID[inspected];
  const currentOwner = claimed.get(inspected);
  const selectedSkinUnlocked = isGodSkinUnlocked(
    inspected,
    selectedSkinId,
    completedAchievements,
  );
  const draftAction = actions.find(
    (action) => action.type === "draft" &&
      actionValue<GodId>(action, "godId") === inspected,
  );

  useEffect(() => {
    setLevel(1);
    setSelectedSkinId(
      favoriteGodSkin(favorites, inspected, completedAchievements),
    );
  }, [completedAchievements, favorites, inspected]);

  useEffect(() => {
    const grid = pantheonGridRef.current;
    const inspector = inspectorRef.current;
    if (!grid || !inspector || typeof ResizeObserver === "undefined") return;

    const compact = window.matchMedia("(max-width: 960px)");
    const syncInspectorHeight = () => {
      if (compact.matches) {
        inspector.style.removeProperty("--three-draft-grid-height");
        return;
      }
      inspector.style.setProperty(
        "--three-draft-grid-height",
        `${grid.getBoundingClientRect().height}px`,
      );
    };
    const observer = new ResizeObserver(syncInspectorHeight);
    observer.observe(grid);
    compact.addEventListener("change", syncInspectorHeight);
    syncInspectorHeight();
    return () => {
      observer.disconnect();
      compact.removeEventListener("change", syncInspectorHeight);
    };
  }, []);

  return (
    <main className={`draft-page three-draft-page ${inputDisabled ? "input-locked" : ""}`}>
      <header className="topbar draft-topbar three-game-topbar">
        <div className="brand">
          <div className="brand-mark"><Crown size={23} strokeWidth={1.5} /></div>
          <div>
            <div className="brand-name">GOD CHESS</div>
            <div className="brand-subtitle">THREE-PLAYER DRAFT</div>
          </div>
        </div>
        <div className="draft-turn">
          <span
            className="three-draft-seat-dot"
            style={{ "--seat-color": THREE_PLAYER_PALETTES[currentSeat] } as React.CSSProperties}
          />
          {activePlayer.name} · {THREE_PLAYER_SEAT_LABELS[currentSeat]} picks
          {activePlayer.control.kind === "ai" && <LoaderCircle className="spin" size={15} />}
        </div>
        <div className="three-game-actions">
          {roomCode && <span>ROOM <strong>{roomCode}</strong></span>}
          <button
            disabled={!canUndo}
            onClick={onUndo}
            aria-label="Undo"
          >
            <Undo2 size={16} />
          </button>
        </div>
      </header>
      <section className="draft-hero three-draft-hero">
        <p className="eyebrow">THE THREE PANTHEONS AWAIT</p>
        <h1>Choose your gods.</h1>
        <p>White, Red, and Black each claim three divine allies. Three Gods remain unused.</p>
        <div className="draft-auto-actions">
          <button
            type="button"
            className="auto-draft-button"
            disabled={inputDisabled || !actions.some((action) => action.type === "draft")}
            onClick={onAutoDraft}
          >
            <Sparkles size={15} />
            Auto-pick random god
          </button>
          {onQuickDraft && (
            <button
              type="button"
              className="auto-draft-button"
              disabled={!actions.some((action) => action.type === "draft")}
              onClick={onQuickDraft}
            >
              <Zap size={15} />
              Quick Draft
            </button>
          )}
        </div>
        <div className="draft-progress three-draft-progress" aria-label="Nine draft picks">
          {state.draft.order.map((seat, index) => (
            <div
              className={`draft-pip ${index < state.draft.pickIndex ? "done" : ""} ${index === state.draft.pickIndex ? "current" : ""}`}
              style={{ "--seat-color": THREE_PLAYER_PALETTES[seat] } as React.CSSProperties}
              aria-label={`Pick ${index + 1}: ${THREE_PLAYER_SEAT_LABELS[seat]}`}
              key={`${seat}-${index}`}
            >
              <span>{index + 1}</span>
              <small>{THREE_PLAYER_SEAT_LABELS[seat][0]}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="draft-layout three-draft-layout">
        <div className="pantheon-grid" ref={pantheonGridRef}>
          {GODS.map((god) => {
            const owner = claimed.get(god.id);
            const skinId = owner
              ? draftedGodSkin(state.players[owner].godSkins, god.id)
              : favoriteGodSkin(
                favorites,
                god.id,
                completedAchievements,
              );
            return (
              <button
                type="button"
                className={`draft-card ${inspected === god.id ? "inspected" : ""} ${owner ? "claimed" : ""}`}
                key={god.id}
                onClick={() => setInspected(god.id)}
                style={{ "--accent": god.accent } as React.CSSProperties}
                aria-label={`Inspect ${god.name}${owner ? `, claimed by ${THREE_PLAYER_SEAT_LABELS[owner]}` : ""}`}
              >
                <DraftGodPortrait
                  godId={god.id}
                  skinId={skinId}
                  className="god-card-portrait"
                />
                <span className="draft-card-copy">
                  <strong>{god.name}</strong>
                  <small>{god.domain}</small>
                </span>
                {owner && (
                  <span
                    className="three-claimed-by"
                    style={{ "--seat-color": THREE_PLAYER_PALETTES[owner] } as React.CSSProperties}
                    aria-hidden="true"
                  >
                    {THREE_PLAYER_SEAT_LABELS[owner][0]}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <aside
          className="god-inspector three-god-inspector"
          ref={inspectorRef}
          style={{ "--accent": currentGod.accent } as React.CSSProperties}
        >
          <div className="inspector-heading">
            <DraftGodPortrait
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
            completedAchievements={completedAchievements}
          />
          <LevelSelector
            level={level}
            onChange={setLevel}
            label="All abilities"
            className="god-level-selector"
          />
          <div
            className="draft-abilities three-draft-abilities"
            role="region"
            aria-label={`${currentGod.name} ability details`}
            tabIndex={0}
          >
            {currentGod.abilities.map((ability, index) => (
              <div className="draft-ability" key={ability.id}>
                <span>0{index + 1}</span>
                <div>
                  <strong>{ability.name}</strong>
                  <p>{ability.summary}</p>
                  {level >= 2 && ability.details[1] && (
                    <p className="level-rule"><b>Lv 2:</b> {ability.details[1]}</p>
                  )}
                  {level >= 3 && ability.details[2] && (
                    <p className="level-rule"><b>Lv 3:</b> {ability.details[2]}</p>
                  )}
                </div>
                {ability.cost && (
                  <div className="mini-cost">
                    {ability.cost.white ? (
                      <DraftOrbCost affinity="white" count={ability.cost.white} />
                    ) : null}
                    {ability.cost.black ? (
                      <DraftOrbCost affinity="black" count={ability.cost.black} />
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="primary-button three-draft-claim"
            onClick={() => draftAction && onAction({
              ...draftAction,
              skinId: selectedSkinId,
            })}
            disabled={
              inputDisabled ||
              Boolean(currentOwner) ||
              !draftAction ||
              !selectedSkinUnlocked
            }
          >
            {currentOwner
              ? `Claimed by ${THREE_PLAYER_SEAT_LABELS[currentOwner]}`
              : selectedSkinUnlocked
                ? `Claim ${currentGod.name}`
                : `${currentGod.name} skin locked`}
            {!currentOwner && selectedSkinUnlocked && <ChevronRight size={17} />}
          </button>
        </aside>
      </section>

      <footer className="draft-rosters three-draft-rosters">
        {THREE_PLAYER_SEATS.map((seat) => (
          <div className="draft-roster" key={seat}>
            <span
              className="three-draft-crest"
              style={{ "--seat-color": THREE_PLAYER_PALETTES[seat] } as React.CSSProperties}
            >
              <Crown size={14} />
            </span>
            <strong>{state.players[seat].name}</strong>
            <small>{THREE_PLAYER_SEAT_LABELS[seat]}</small>
            <div>
              {state.players[seat].gods.map((godId) => (
                <DraftGodSigil
                  godId={godId}
                  skinId={draftedGodSkin(state.players[seat].godSkins, godId)}
                  key={godId}
                />
              ))}
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

function PlayerPanel({
  state,
  seat,
  legalSeat,
  onSeat,
}: {
  state: UiState;
  seat: ThreePlayerSeat;
  legalSeat: boolean;
  onSeat: () => void;
}) {
  const player = state.players[seat];
  const affinity = threePlayerOwnerAffinity(seat, state.completedTurns.red);
  const takeover = Object.values(state.board).filter(
    (piece) => piece.controller === seat && piece.owner !== seat,
  ).length;
  const checked = safeInCheck(state, seat);
  return (
    <article
      className={`three-player-panel seat-${seat} ${state.activeSeat === seat ? "active" : ""} ${player.eliminated ? "eliminated" : ""} ${legalSeat ? "seat-target" : ""}`}
      style={{ "--seat-color": player.displayColor } as React.CSSProperties}
    >
      <button className="three-seat-summary" disabled={!legalSeat} onClick={onSeat}>
        <span className="three-player-avatar">
          {player.control.kind === "ai" ? <Bot size={17} /> : <UserRound size={17} />}
        </span>
        <span>
          <strong>{player.name}</strong>
          <small>
            {THREE_PLAYER_SEAT_LABELS[seat]} · {affinity} affinity
          </small>
        </span>
        {checked ? <Shield aria-label="In check" /> : player.eliminated ? <Skull /> : <Crown />}
      </button>
      <div className="three-player-resources">
        <span className="orb-count" aria-label={`${player.orbs.light} light orbs`}>
          <i className="orb white" aria-hidden="true" />
          <strong>{player.orbs.light}</strong>
        </span>
        <span className="orb-count" aria-label={`${player.orbs.dark} dark orbs`}>
          <i className="orb black" aria-hidden="true" />
          <strong>{player.orbs.dark}</strong>
        </span>
        {takeover > 0 && <span className="takeover-count">↪ {takeover}</span>}
      </div>
      <div className="three-player-gods">
        {player.gods.map((godId) => (
          <span
            className={state.rested.includes(godId) ? "resting" : ""}
            title={`${GOD_BY_ID[godId].name}${state.rested.includes(godId) ? " resting" : ""}`}
            key={godId}
          >
            <GodPortrait
              godId={godId}
              skinId={draftedGodSkin(player.godSkins, godId)}
              alt={GOD_BY_ID[godId].name}
            />
          </span>
        ))}
      </div>
      <small className="three-graveyard">
        Graveyard {player.graveyard.length}
        {player.eliminated ? " · Eliminated" : checked ? " · Check" : ""}
      </small>
    </article>
  );
}

function ThreePlayerPieceInfo({
  state,
  cell,
  onClose,
}: {
  state: UiState;
  cell?: ThreePlayerCell;
  onClose: () => void;
}) {
  if (!cell) return null;
  const piece = state.board[cell];
  if (!piece) return null;
  const owner = state.players[piece.owner];
  const controller = piece.controller ? state.players[piece.controller] : undefined;
  const statuses = THREE_PLAYER_STATUS_LABELS
    .filter(({ key }) => Boolean(piece.status[key]))
    .map(({ key, label }) => {
      const seat = statusOwner(piece, key);
      return {
        key,
        label: seat ? `${label} by ${state.players[seat].name}` : label,
      };
    });
  return (
    <section className="square-info-panel three-square-info" aria-label="Piece details">
      <button
        className="square-info-close"
        onClick={onClose}
        aria-label="Close piece details"
      >
        <X size={15} />
      </button>
      <div className="square-info-heading">
        <span
          className="three-piece-info-symbol"
          style={{
            "--piece-color": state.players[piece.controller ?? piece.owner].displayColor,
          } as React.CSSProperties}
          aria-hidden="true"
        >
          {THREE_PLAYER_PIECE_SYMBOLS[piece.type]}
        </span>
        <div>
          <small>{cell.toUpperCase()} · {owner.name}</small>
          <h3>{THREE_PLAYER_PIECE_NAMES[piece.type]}</h3>
          <p>
            {controller
              ? piece.controller === piece.owner
                ? `Controlled by ${controller.name}`
                : `Controlled by ${controller.name}; originally owned by ${owner.name}`
              : "Inert and capturable"}
          </p>
        </div>
      </div>
      <div className="three-piece-details">
        <span>{threePlayerPieceAffinity(state as ThreePlayerState, piece)} affinity</span>
        {statuses.map((status) => (
          <span data-status={status.key} key={status.key}>{status.label}</span>
        ))}
      </div>
    </section>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="rules-modal three-rules-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="close-button" onClick={onClose} aria-label="Close help"><X size={20} /></button>
        <p className="eyebrow">THREE-PLAYER HELP</p>
        <h2>One surface, five topologies.</h2>
        <p>
          Select a God and ability, then use highlighted cells, paths, seats,
          graveyard pieces, choices, amounts, or orbs. Red’s piece affinity
          alternates after each completed Red turn.
        </p>
        <p>
          The draft has nine picks. Claimed Gods remain inspectable and the three
          unclaimed Gods are marked unused once play begins.
        </p>
      </section>
    </div>
  );
}

function SettingsModal({
  undoEnabled,
  onUndoEnabled,
  onClose,
}: {
  undoEnabled: boolean;
  onUndoEnabled: (enabled: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="settings-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="close-button" onClick={onClose} aria-label="Close settings"><X size={20} /></button>
        <p className="eyebrow">LOCAL SETTINGS</p>
        <h2>Three-player options</h2>
        <label className="settings-toggle">
          <span><strong>Allow undo</strong><small>Undo a stable Human boundary and its following AI chain.</small></span>
          <input
            type="checkbox"
            role="switch"
            aria-label="Allow undo"
            checked={undoEnabled}
            onChange={(event) => onUndoEnabled(event.target.checked)}
          />
        </label>
      </section>
    </div>
  );
}

function ThreePlayerPauseOverlay({
  seat,
  participantName,
  canReplace,
  onReplace,
}: {
  seat?: ThreePlayerSeat;
  participantName?: string;
  canReplace: boolean;
  onReplace?: (difficulty: number) => void;
}) {
  const [difficulty, setDifficulty] = useState(5);
  return (
    <div className="modal-backdrop three-online-pause">
      <section className="gameover-modal">
        <p className="eyebrow">ROOM PAUSED</p>
        <h2>Waiting for {participantName ?? "a participant"}</h2>
        <p>
          {seat
            ? `${THREE_PLAYER_SEAT_LABELS[seat]} remains reserved for secure reconnection.`
            : "Canonical play will resume after the participant reconnects."}
        </p>
        {canReplace && onReplace && seat && (
          <div className="three-replace-ai">
            <label>
              AI difficulty <strong>{difficulty}</strong>
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
        {!canReplace && (
          <small>Waiting for the host or the reserved participant.</small>
        )}
      </section>
    </div>
  );
}

function ThreePlayerUndoOverlay({
  proposal,
  onVote,
}: {
  proposal: ThreePlayerUndoStatus;
  onVote: (approved: boolean) => void;
}) {
  return (
    <div className="modal-backdrop three-online-undo">
      <section className="gameover-modal">
        <p className="eyebrow">UNDO VOTE</p>
        <h2>{proposal.requestedByName} requested a rollback</h2>
        <p>
          {proposal.approvedCount} of {proposal.eligibleCount} connected Humans
          have approved the previous stable Human boundary and its AI chain.
        </p>
        <div className="three-online-vote-actions">
          {!proposal.localApproved && proposal.localEligible && (
            <button
              className="primary-button"
              onClick={() => onVote(true)}
            >
              Approve undo
            </button>
          )}
          {proposal.localEligible && (
            <button
              className="secondary-button"
              onClick={() => onVote(false)}
            >
              {proposal.localApproved ? "Cancel vote" : "Reject undo"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function ThreePlayerMoveFirstChooser({
  state,
  draft,
  candidates,
  onCancel,
  onCommit,
}: {
  state: ThreePlayerState;
  draft: MoveFirstDraft;
  candidates: ThreePlayerMoveFirstCandidate[];
  onCancel: () => void;
  onCommit: (candidate: ThreePlayerMoveFirstCandidate) => void;
}) {
  const selectedMoveGod = state.selectedGod
    ? GOD_BY_ID[state.selectedGod]
    : undefined;
  if (!draft.destination) {
    return (
      <div className="move-first-prompt" role="status">
        <strong>Ordinary move selected from {draft.source}</strong>
        <p>Choose a highlighted destination. The board has not changed.</p>
        <button className="secondary-button" onClick={onCancel}>
          Back / cancel
        </button>
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
            state.players[state.activeSeat].upgrades,
            ability.id,
          );
          return (
            <PlayerAbilityCard
              ability={ability}
              level={level}
              active={false}
              selectable={candidate.valid}
              disabled={!candidate.valid}
              showCost={false}
              footerLabel={god.name}
              footerAction={candidate.requiresPreMoveChoice
                ? "PRE-MOVE CHOICE"
                : "CONFIRM MOVE"}
              onClick={() => onCommit(candidate)}
              key={candidate.godId}
            >
              <div
                className="move-first-reward"
                aria-label={`${god.name} ${ability.name}: ${candidate.immediateOrbDelta.light} light orbs now and ${candidate.immediateOrbDelta.dark} dark orbs now`}
              >
                <span>IMMEDIATE ORBS</span>
                <div>
                  <b><i className="orb white" /> Light {candidate.immediateOrbDelta.light}</b>
                  <b><i className="orb black" /> Dark {candidate.immediateOrbDelta.dark}</b>
                </div>
                {candidate.conditionalOutcome && <p>{candidate.conditionalOutcome}</p>}
                {candidate.followUp && <small>{candidate.followUp.label}</small>}
                {candidate.error && <p className="move-first-error">{candidate.error}</p>}
              </div>
            </PlayerAbilityCard>
          );
        })}
      </div>
    </div>
  );
}

export interface ThreePlayerOnlineSession {
  roomCode: string;
  role: "host" | "peer";
  participantSeat?: ThreePlayerSeat;
  status: "playing" | "paused" | "finished";
  awaitingSync: boolean;
  undoAvailable: boolean;
  undoProposal?: ThreePlayerUndoStatus;
  pausedSeat?: ThreePlayerSeat;
  pausedParticipantName?: string;
  onAction: (action: ThreePlayerAction) => void;
  onUndoRequest: () => void;
  onUndoVote: (approved: boolean) => void;
  onReplaceWithAi?: (difficulty: number) => void;
}

export interface ThreePlayerGameProps {
  initialState: ThreePlayerState;
  initialUndoHistory?: ThreePlayerState[];
  initialTurnStart?: ThreePlayerState;
  undoPreferred?: boolean;
  onUndoPreferenceChange?: (enabled: boolean) => void;
  onPersist?: (
    state: ThreePlayerState,
    undoHistory: ThreePlayerState[],
    turnStart?: ThreePlayerState,
  ) => boolean | Promise<boolean>;
  onQuit: () => void;
  onNewGame: () => void;
  puzzle?: ThreePlayerPuzzleDefinition;
  onPuzzleComplete?: (puzzleId: PuzzleId) => boolean | void;
  onRestartPuzzle?: () => void;
  onNextPuzzle?: () => void;
  onChallengeComplete?: (challengeId: NonNullable<ThreePlayerState["challengeId"]>) => void;
  onlineSession?: ThreePlayerOnlineSession;
  onAchievementTransition?: (
    before: ThreePlayerState,
    after: ThreePlayerState,
    action: ThreePlayerAction | undefined,
    source: "human" | "ai" | "online",
  ) => void;
  onStatisticsChange?: (state: ThreePlayerState) => void;
  completedAchievements?: Partial<Record<AchievementId, string>>;
}

export function ThreePlayerGame({
  initialState,
  initialUndoHistory = [],
  initialTurnStart,
  undoPreferred = true,
  onUndoPreferenceChange,
  onPersist,
  onQuit,
  onNewGame,
  puzzle,
  onPuzzleComplete,
  onRestartPuzzle,
  onNextPuzzle,
  onChallengeComplete,
  onlineSession,
  onAchievementTransition,
  onStatisticsChange,
  completedAchievements = {},
}: ThreePlayerGameProps) {
  const [state, setState] = useState<UiState>(() => clone(initialState) as UiState);
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    onStatisticsChange?.(state as ThreePlayerState);
  }, [onStatisticsChange, state]);
  const [localSelectedCell, setLocalSelectedCell] = useState<ThreePlayerCell>();
  const [moveFirstDraft, setMoveFirstDraft] = useState<MoveFirstDraft>();
  const [inspectedCell, setInspectedCell] = useState<ThreePlayerCell>();
  const [previewLevel, setPreviewLevel] = useState<number>();
  const [inspectedGod, setInspectedGod] = useState<GodId>();
  const [selectedUpgradeAbility, setSelectedUpgradeAbility] = useState<string>();
  const [helpOpen, setHelpOpen] = useState(false);
  const [puzzleHintOpen, setPuzzleHintOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(initialState.phase === "gameover");
  const [undoEnabled, setUndoEnabled] = useState(undoPreferred);
  const [autoDraftPending, setAutoDraftPending] = useState(false);
  const autoDraftPendingRef = useRef(false);
  const quickDraftPendingRef = useRef(false);
  const undoStack = useRef<UiState[]>(
    initialUndoHistory.map((snapshot) => clone(snapshot) as UiState),
  );
  const chainStart = useRef<UiState | undefined>(
    initialTurnStart ? clone(initialTurnStart) as UiState : undefined,
  );
  const [undoDepth, setUndoDepth] = useState(undoStack.current.length);
  const aiPlan = useRef<ThreePlayerAction[]>([]);
  const aiNoPlanRevision = useRef<number | undefined>(undefined);
  const aiWorker = useRef<Worker | undefined>(undefined);
  const aiRequestRevision = useRef<number | undefined>(undefined);
  const [aiPlanReady, setAiPlanReady] = useState(0);
  const actions = useMemo(
    () => availableThreePlayerActions(state as ThreePlayerState) as UiAction[],
    [state],
  );
  const puzzleSolved = Boolean(
    puzzle &&
    state.phase === "gameover" &&
    state.result?.kind === "winner" &&
    state.result.seat === "white",
  );
  const puzzleFailed = Boolean(
    puzzle &&
    !puzzleSolved &&
    (
      state.phase === "gameover" ||
      state.completedTurns.white >= puzzle.playerTurns
    ),
  );
  const puzzleIndex = puzzle
    ? THREE_PLAYER_PUZZLES.findIndex((candidate) => candidate.id === puzzle.id)
    : -1;
  const puzzleTurnsRemaining = puzzle
    ? Math.max(0, puzzle.playerTurns - state.completedTurns.white)
    : undefined;
  const completionReported = useRef(false);
  const challengeCompletionReported = useRef(false);
  const previousOnlineState = useRef<ThreePlayerState | undefined>(undefined);
  const onlineControl = onlineSession?.participantSeat
    ? state.players[onlineSession.participantSeat].control
    : undefined;
  const inputDisabled = puzzleFailed || autoDraftPending || (onlineSession
    ? (
      state.phase === "gameover" ||
      onlineSession.status !== "playing" ||
      onlineSession.awaitingSync ||
      Boolean(onlineSession.undoProposal) ||
      !onlineSession.participantSeat ||
      state.activeSeat !== onlineSession.participantSeat ||
      onlineControl?.kind !== "online" ||
      onlineControl.local !== true ||
      helpOpen ||
      settingsOpen
    )
    : state.phase === "gameover" ||
      isThreePlayerAiTurn(state as ThreePlayerState));
  useEffect(() => {
    const challengeId = state.challengeId;
    const winningControl = state.result?.kind === "winner"
      ? state.players[state.result.seat].control
      : undefined;
    const won = challengeId &&
      state.phase === "gameover" &&
      winningControl?.kind === "human" &&
      winningControl.local;
    if (!won || challengeCompletionReported.current) return;
    challengeCompletionReported.current = true;
    onChallengeComplete?.(challengeId);
  }, [onChallengeComplete, state]);
  const selectedCell = state.selectedCell ?? localSelectedCell;
  const moveFirstEnabled = !inputDisabled &&
    canStartThreePlayerMoveFirst(state as ThreePlayerState);
  const moveFirstSources = useMemo(
    () => new Set(
      moveFirstEnabled
        ? threePlayerMoveFirstSources(state as ThreePlayerState)
        : [],
    ),
    [moveFirstEnabled, state],
  );
  const moveFirstTargets = useMemo(
    () => moveFirstDraft && moveFirstEnabled
      ? threePlayerMoveFirstTargets(
        state as ThreePlayerState,
        moveFirstDraft.source,
      )
      : [],
    [moveFirstDraft, moveFirstEnabled, state],
  );
  const moveFirstAbilityCandidates = useMemo(
    () => moveFirstDraft?.destination && moveFirstEnabled
      ? threePlayerMoveFirstCandidates(state as ThreePlayerState, {
        from: moveFirstDraft.source,
        to: moveFirstDraft.destination,
      })
      : [],
    [moveFirstDraft, moveFirstEnabled, state],
  );
  const abilityMoveSources = useMemo(
    () => threePlayerAbilityMoveSources(state as ThreePlayerState),
    [state],
  );
  const moveActions = actions.filter((action) => action.type === "move");
  const legalCells = state.legalCells?.length
    ? state.legalCells
    : actions
      .filter((action) => action.type === "cell")
      .map(actionCell)
      .filter((cell): cell is string => Boolean(cell)).length
      ? actions
        .filter((action) => action.type === "cell")
        .map(actionCell)
        .filter((cell): cell is string => Boolean(cell))
    : moveFirstEnabled
      ? moveFirstDraft
        ? moveFirstTargets
        : [...moveFirstSources]
    : selectedCell
      ? moveActions
        .filter((action) => actionValue<string>(action, "from") === selectedCell)
        .map((action) => actionValue<string>(action, "to"))
        .filter((cell): cell is string => Boolean(cell))
      : [];
  const sourceCells = moveFirstEnabled && !moveFirstDraft
    ? [...moveFirstSources]
    : !selectedCell && state.pending?.step === "source"
      ? abilityMoveSources
      : !selectedCell && (
          state.pending?.step === "enchant-enemy-move" ||
          state.pending?.step === "enchant-followup-move"
        )
        ? legalCells
      : [];

  const dispatchAction = (
    action: UiAction,
    source: "human" | "ai" = "human",
    bypassInputLock = false,
  ) => {
    const current = stateRef.current;
    if (source === "human" && inputDisabled && !bypassInputLock) return;
    setMoveFirstDraft(undefined);
    if (onlineSession) {
      if (source === "human") {
        recordDiagnostic({
          category: "online",
          event: "three-player-action-sent",
          context: { variant: "three-player", role: onlineSession.role },
          data: { action, phase: current.phase, revision: current.revision },
        });
        onlineSession.onAction(action as ThreePlayerAction);
      }
      return;
    }
    if (source === "human" && isStableState(current) && !chainStart.current) {
      chainStart.current = clone(current);
    }
    const next = applyMatchStatisticsTransition(
      current as ThreePlayerState,
      threePlayerReducer(
        current as ThreePlayerState,
        action as ThreePlayerAction,
      ),
      action as ThreePlayerAction,
    ) as UiState;
    onAchievementTransition?.(
      current as ThreePlayerState,
      next as ThreePlayerState,
      action as ThreePlayerAction,
      source,
    );
    recordActionTransition({
      variant: "three-player",
      mode: "local",
      source,
      action,
      before: current as unknown as Record<string, unknown>,
      after: next as unknown as Record<string, unknown>,
    });
    if (next === current) return;
    setLocalSelectedCell(undefined);
    stateRef.current = next;
    setState(next);
    const completedHumanBoundary =
      next.phase === "gameover" ||
      next.players[next.activeSeat].control.kind !== "ai";
    if (isStableState(next) && completedHumanBoundary && chainStart.current) {
      undoStack.current.push(chainStart.current);
      chainStart.current = undefined;
      setUndoDepth(undoStack.current.length);
    }
  };
  useEffect(() => {
    if (!onlineSession) {
      previousOnlineState.current = undefined;
      return;
    }
    const previous = previousOnlineState.current;
    if (previous && previous.revision !== initialState.revision) {
      onAchievementTransition?.(previous, initialState, undefined, "online");
    }
    previousOnlineState.current = clone(initialState);
  }, [
    initialState,
    onlineSession,
    onAchievementTransition,
  ]);

  const autoDraft = () => {
    if (
      inputDisabled ||
      autoDraftPendingRef.current ||
      stateRef.current.phase !== "draft"
    ) return;
    const draftActions = availableThreePlayerActions(
      stateRef.current as ThreePlayerState,
    ).filter(
      (action): action is Extract<ThreePlayerAction, { type: "draft" }> =>
        action.type === "draft",
    );
    if (!draftActions.length) return;
    const action = randomItem(draftActions);
    if (!action) return;
    const favorites = loadFavoriteGodSkins();
    autoDraftPendingRef.current = true;
    setAutoDraftPending(true);
    dispatchAction({
      ...action,
      skinId: favoriteGodSkin(
        favorites,
        action.godId,
        completedAchievements,
      ),
    });
  };

  const quickDraft = () => {
    if (
      onlineSession ||
      autoDraftPendingRef.current ||
      quickDraftPendingRef.current ||
      stateRef.current.phase !== "draft"
    ) return;
    quickDraftPendingRef.current = true;
    autoDraftPendingRef.current = true;
    setAutoDraftPending(true);
    aiPlan.current = [];
    aiRequestRevision.current = undefined;
    const favorites = loadFavoriteGodSkins();
    try {
      while (stateRef.current.phase === "draft") {
        const action = randomItem(availableThreePlayerActions(
          stateRef.current as ThreePlayerState,
        ).filter(
          (candidate): candidate is Extract<ThreePlayerAction, { type: "draft" }> =>
            candidate.type === "draft",
        ));
        if (!action) break;
        dispatchAction({
          ...action,
          skinId: favoriteGodSkin(
            favorites,
            action.godId,
            completedAchievements,
          ),
        }, "human", true);
      }
    } finally {
      quickDraftPendingRef.current = false;
      autoDraftPendingRef.current = false;
      setAutoDraftPending(false);
    }
  };

  useEffect(() => {
    if (onlineSession) return;
    const releaseTimer = window.setTimeout(() => {
      autoDraftPendingRef.current = false;
      setAutoDraftPending(false);
    }, 0);
    return () => window.clearTimeout(releaseTimer);
  }, [onlineSession, state.revision]);

  useEffect(() => {
    if (!onlineSession) return;
    autoDraftPendingRef.current = false;
    setAutoDraftPending(false);
  }, [initialState.revision, onlineSession?.roomCode]);

  useEffect(() => {
    if (!onlineSession) return;
    const loaded = threePlayerReducer(initialState, {
      type: "load",
      state: initialState,
    }) as UiState;
    stateRef.current = loaded;
    setState(loaded);
    setLocalSelectedCell(undefined);
    setMoveFirstDraft(undefined);
    aiPlan.current = [];
    aiRequestRevision.current = undefined;
  }, [initialState, onlineSession?.roomCode]);

  useEffect(() => {
    if (!moveFirstEnabled) setMoveFirstDraft(undefined);
  }, [
    moveFirstEnabled,
    state.activeSeat,
    state.phase,
    state.revision,
  ]);

  useEffect(() => {
    setResultOpen(state.phase === "gameover" || puzzleFailed);
  }, [puzzleFailed, state.phase]);

  useEffect(() => {
    if (!puzzleSolved || !puzzle || completionReported.current) return;
    if (onPuzzleComplete?.(puzzle.id) !== false) {
      completionReported.current = true;
    }
  }, [onPuzzleComplete, puzzle, puzzleSolved]);

  useEffect(() => {
    setPreviewLevel(undefined);
    setSelectedUpgradeAbility(undefined);
    setInspectedGod(undefined);
  }, [state.activeSeat, state.phase]);

  useEffect(() => {
    if (onlineSession?.undoProposal) setResultOpen(false);
  }, [onlineSession?.undoProposal]);

  useEffect(() => {
    if (onlineSession || typeof Worker === "undefined") return;
    const worker = new Worker(
      new URL("../game/threePlayerAi.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (
      event: MessageEvent<{
        revision: number;
        plan: ThreePlayerAction[];
      }>,
    ) => {
      if (stateRef.current.revision !== event.data.revision) return;
      aiRequestRevision.current = undefined;
      aiPlan.current = event.data.plan;
      aiNoPlanRevision.current = event.data.plan.length
        ? undefined
        : event.data.revision;
      recordDiagnostic({
        category: "ai",
        event: "three-player-worker-result",
        context: { variant: "three-player" },
        data: {
          revision: event.data.revision,
          generation: aiPlanReady + 1,
          actions: event.data.plan,
        },
      });
      setAiPlanReady((value) => value + 1);
    };
    worker.onerror = (event) => {
      aiRequestRevision.current = undefined;
      aiPlan.current = [];
      worker.terminate();
      if (aiWorker.current === worker) aiWorker.current = undefined;
      recordDiagnostic({
        category: "error",
        event: "three-player-worker-error",
        context: { variant: "three-player" },
        data: {
          message: event.message,
          filename: event.filename,
          line: event.lineno,
          column: event.colno,
        },
      });
      setAiPlanReady((value) => value + 1);
    };
    aiWorker.current = worker;
    return () => {
      worker.terminate();
      aiWorker.current = undefined;
    };
  }, [onlineSession]);

  useEffect(() => {
    if (onlineSession) {
      aiPlan.current = [];
      aiRequestRevision.current = undefined;
      return;
    }
    if (puzzleFailed) {
      aiPlan.current = [];
      aiRequestRevision.current = undefined;
      return;
    }
    if (!isThreePlayerAiTurn(state as ThreePlayerState)) {
      aiPlan.current = [];
      aiRequestRevision.current = undefined;
      return;
    }
    if (aiNoPlanRevision.current === state.revision) return;
    if (!aiPlan.current.length) {
      if (aiWorker.current) {
        if (aiRequestRevision.current !== state.revision) {
          aiRequestRevision.current = state.revision;
          recordDiagnostic({
            category: "ai",
            event: "three-player-worker-start",
            context: { variant: "three-player" },
            data: { revision: state.revision },
          });
          aiWorker.current.postMessage(state as ThreePlayerState);
        }
        return;
      }
      const revision = state.revision;
      const planningTimer = window.setTimeout(() => {
        if (stateRef.current.revision !== revision) return;
        recordDiagnostic({
          category: "ai",
          event: "three-player-plan-start",
          context: { variant: "three-player" },
          data: { revision },
        });
        aiPlan.current = chooseThreePlayerAiPlan(
          stateRef.current as ThreePlayerState,
        );
        aiNoPlanRevision.current = aiPlan.current.length
          ? undefined
          : revision;
        recordDiagnostic({
          category: "ai",
          event: "three-player-plan-result",
          context: { variant: "three-player" },
          data: { revision, actions: aiPlan.current },
        });
        setAiPlanReady((value) => value + 1);
      }, 0);
      return () => window.clearTimeout(planningTimer);
    }
    const action = aiPlan.current[0];
    if (!action) return;
    const timer = window.setTimeout(
      () => {
        aiPlan.current = aiPlan.current.slice(1);
        dispatchAction(action, "ai");
      },
      reducedMotion() ? 0 : 180,
    );
    return () => window.clearTimeout(timer);
  }, [aiPlanReady, onlineSession, puzzleFailed, state.phase, state.revision]);

  useEffect(() => {
    if (onlineSession || !onPersist || !isStableState(state)) return;
    const timer = window.setTimeout(() => {
      void onPersist(
        stateRef.current as ThreePlayerState,
        undoStack.current as ThreePlayerState[],
        chainStart.current as ThreePlayerState | undefined,
      );
    }, 120);
    return () => window.clearTimeout(timer);
  }, [onPersist, onlineSession, state]);

  const selectCell = (cell: ThreePlayerCell) => {
    if (inputDisabled) return;
    if (moveFirstEnabled) {
      setInspectedGod(undefined);
      setMoveFirstDraft((current) => {
        if (!current) {
          return moveFirstSources.has(cell) ? { source: cell } : undefined;
        }
        if (cell === current.source) return undefined;
        if (moveFirstTargets.includes(cell)) {
          return { source: current.source, destination: cell };
        }
        return moveFirstSources.has(cell) ? { source: cell } : current;
      });
      return;
    }
    const primitive = actions.find(
      (action) => action.type === "cell" && actionCell(action) === cell,
    );
    if (primitive) {
      dispatchAction(primitive);
      return;
    }
    if (selectedCell) {
      const move = moveActions.find(
        (action) =>
          actionValue<string>(action, "from") === selectedCell &&
          actionValue<string>(action, "to") === cell,
      );
      if (move) {
        dispatchAction(move);
        return;
      }
    }
    const piece = state.board[cell];
    if (piece?.controller === state.activeSeat) setLocalSelectedCell(cell);
    else setLocalSelectedCell(undefined);
  };

  const commitMoveFirst = (candidate: ThreePlayerMoveFirstCandidate) => {
    if (!candidate.valid) return;
    dispatchAction({
      type: "commit-move-first",
      godId: candidate.godId,
      abilityId: candidate.abilityId,
      move: candidate.move,
      expectedSeat: state.activeSeat,
      expectedTurn: state.turn,
      expectedRevision: state.revision,
    });
  };

  const canCancelDivineSelection =
    !inputDisabled &&
    state.phase === "play" &&
    Boolean(state.selectedGod) &&
    !hasCommittedThreePlayerAction(state as ThreePlayerState);

  const undo = () => {
    const current = stateRef.current;
    if (
      !inputDisabled &&
      current.phase === "play" &&
      current.selectedGod &&
      !hasCommittedThreePlayerAction(current as ThreePlayerState)
    ) {
      setLocalSelectedCell(undefined);
      setMoveFirstDraft(undefined);
      dispatchAction({ type: "clear-god" });
      return;
    }
    if (onlineSession) {
      if (
        onlineSession.undoAvailable &&
        !onlineSession.awaitingSync &&
        !onlineSession.undoProposal
      ) {
        onlineSession.onUndoRequest();
      }
      return;
    }
    if ((!undoEnabled && !puzzle) || !isStableState(stateRef.current)) return;
    const snapshot = undoStack.current.pop();
    if (!snapshot) return;
    chainStart.current = undefined;
    aiPlan.current = [];
    setLocalSelectedCell(undefined);
    setMoveFirstDraft(undefined);
    stateRef.current = clone(snapshot);
    const restored = clone(snapshot);
    setState(restored);
    recordActionTransition({
      variant: "three-player",
      mode: "local",
      source: "undo",
      action: { type: "undo" },
      before: current as unknown as Record<string, unknown>,
      after: restored as unknown as Record<string, unknown>,
    });
    setUndoDepth(undoStack.current.length);
  };

  const saveAndQuit = async () => {
    if (onlineSession) {
      onQuit();
      return;
    }
    if (!onPersist) {
      onQuit();
      return;
    }
    const persisted = await onPersist(
      stateRef.current as ThreePlayerState,
      undoStack.current as ThreePlayerState[],
      chainStart.current as ThreePlayerState | undefined,
    );
    if (persisted) onQuit();
  };

  const canUndo = puzzle
    ? canCancelDivineSelection || (undoDepth > 0 && isStableState(state))
    : onlineSession
    ? canCancelDivineSelection || (
      onlineSession.undoAvailable &&
      onlineSession.status !== "paused" &&
      !onlineSession.awaitingSync &&
      !onlineSession.undoProposal
    )
    : canCancelDivineSelection ||
      (undoEnabled && undoDepth > 0 && isStableState(state));

  if (state.phase === "draft") {
    return (
      <>
        <ThreePlayerDraft
          state={state}
          actions={actions}
          inputDisabled={inputDisabled}
          onAction={dispatchAction}
          onAutoDraft={autoDraft}
          onQuickDraft={onlineSession ? undefined : quickDraft}
          canUndo={canUndo}
          onUndo={undo}
          roomCode={onlineSession?.roomCode}
          completedAchievements={completedAchievements}
        />
        <MatchEscapeMenu
          onOpenRules={() => setHelpOpen(true)}
          onOpenSettings={onlineSession ? undefined : () => setSettingsOpen(true)}
          onLeave={() => void saveAndQuit()}
          leaveLabel={
            onlineSession
              ? "Leave room"
              : state.challengeId
                ? "Leave challenge"
                : "Save & quit"
          }
          onQuitWithoutSaving={
            !onlineSession && !state.challengeId && onPersist
              ? onQuit
              : undefined
          }
        />
        {settingsOpen && !onlineSession && (
          <SettingsModal
            undoEnabled={undoEnabled}
            onUndoEnabled={(enabled) => {
              setUndoEnabled(enabled);
              onUndoPreferenceChange?.(enabled);
            }}
            onClose={() => setSettingsOpen(false)}
          />
        )}
        {onlineSession?.status === "paused" && (
          <ThreePlayerPauseOverlay
            seat={onlineSession.pausedSeat}
            participantName={onlineSession.pausedParticipantName}
            canReplace={onlineSession.role === "host"}
            onReplace={onlineSession.onReplaceWithAi}
          />
        )}
        {onlineSession?.undoProposal && (
          <ThreePlayerUndoOverlay
            proposal={onlineSession.undoProposal}
            onVote={onlineSession.onUndoVote}
          />
        )}
      </>
    );
  }

  const legalSeats = new Set(state.legalSeats ?? []);
  const selectedGod = state.selectedGod ?? inspectedGod;
  const selectedGodDefinition = selectedGod ? GOD_BY_ID[selectedGod] : undefined;
  const readOnlyGod = Boolean(inspectedGod && !state.selectedGod);
  const activePlayer = state.players[state.activeSeat];
  const selectedGodOwner = selectedGod
    ? THREE_PLAYER_SEATS.find((seat) => state.players[seat].gods.includes(selectedGod))
    : undefined;
  const selectedGodPlayer = selectedGodOwner
    ? state.players[selectedGodOwner]
    : activePlayer;
  const committedAbility = Boolean(state.selectedAbility && state.pending);
  const defaultPreviewLevel = selectedGodDefinition
    ? Math.min(...selectedGodDefinition.abilities.map((ability) =>
      abilityLevel(activePlayer.upgrades, ability.id)
    ))
    : 1;
  const defaultUpgradePreviewLevel = Math.min(
    ...activePlayer.gods.flatMap((godId) =>
      GOD_BY_ID[godId].abilities.map((ability) =>
        abilityLevel(activePlayer.upgrades, ability.id)
      )
    ),
  );
  const selectedGodActions = actions.filter((action) => action.type === "select-god");
  const selectedAbilityActions = actions.filter((action) => action.type === "select-ability");
  const upgradeActions = actions.filter((action) => action.type === "upgrade");
  const clearGodAction = actions.find((action) => action.type === "clear-god");
  const genericActions = actions.filter((action) =>
    ![
      "draft",
      "move",
      "cell",
      "select-god",
      "select-ability",
      "clear-god",
      "upgrade",
    ].includes(action.type)
  );
  const attachedGenericActions = state.selectedAbility && state.pending
    ? genericActions
    : [];
  const detachedGenericActions = attachedGenericActions.length
    ? []
    : genericActions;
  const variant = THREE_PLAYER_VARIANTS.find(
    (item) => item.id === state.config.boardVariant,
  );
  const neutralAffinity = threePlayerNeutralCellAffinity(state);
  const showNeutralAffinity = threePlayerHasAlternatingNeutralCells(
    state.config.boardVariant,
  );
  return (
    <main className={`three-game-page ${puzzle ? "puzzle-mode" : ""} ${state.phase === "gameover" || puzzleFailed ? "finished-view" : ""} ${inputDisabled ? "input-gated" : ""}`}>
      <header className="three-game-topbar">
        <div>
          <p className="eyebrow">{variant?.name ?? "THREE-PLAYER"}</p>
          <strong>
            Round {state.round} · Turn {state.turn}
            {onlineSession ? ` · Room ${onlineSession.roomCode}` : ""}
          </strong>
        </div>
        <div className="three-game-actions">
          <button onClick={() => setHistoryOpen(true)} aria-label="History"><History size={17} /></button>
          <button
            disabled={!canUndo}
            onClick={undo}
            aria-label="Undo"
          >
            <Undo2 size={17} />
          </button>
        </div>
      </header>

      {puzzle && (
        <section className="puzzle-banner three-player-puzzle-banner">
          <div className="puzzle-banner-title">
            <Crosshair size={18} />
            <span>THREE-PLAYER PUZZLE {puzzleIndex + 1} OF {THREE_PLAYER_PUZZLES.length}</span>
            <strong>{puzzle.title}</strong>
          </div>
          <p>
            {puzzle.objective} {puzzleTurnsRemaining} divine turn{puzzleTurnsRemaining === 1 ? "" : "s"} remaining.
          </p>
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

      <section className="three-game-layout">
        <div className="three-player-panels">
          {THREE_PLAYER_SEATS.map((seat) => {
            const seatAction = actions.find(
              (action) => action.type === "seat" &&
                actionValue<ThreePlayerSeat>(action, "seat") === seat,
            );
            return (
              <PlayerPanel
                state={state}
                seat={seat}
                legalSeat={legalSeats.has(seat)}
                onSeat={() => seatAction && dispatchAction(seatAction)}
                key={seat}
              />
            );
          })}
        </div>

        <section className="three-board-column">
          <div className="three-turn-status" aria-live="polite">
            <span
              style={{
                "--seat-color": state.players[state.activeSeat].displayColor,
              } as React.CSSProperties}
            />
            <div>
              <strong>{state.notice}</strong>
              <small>
                {onlineSession?.status === "paused"
                  ? "The room is paused for reconnection."
                  : onlineSession?.undoProposal
                    ? "Canonical play is locked during the undo vote."
                    : onlineSession?.awaitingSync
                      ? "Waiting for the host to acknowledge the action."
                      : inputDisabled
                        ? onlineSession
                          ? "Waiting for the assigned active participant."
                          : "AI is choosing a divine action."
                        : "Select a God, ability, piece, or highlighted target."}
              </small>
            </div>
          </div>
          {showNeutralAffinity && (
            <div
              className={`three-neutral-affinity ${neutralAffinity}`}
              role="status"
              aria-live="polite"
            >
              <span className="three-neutral-swatch" aria-hidden="true" />
              <span>
                Gray spaces count as <strong>{neutralAffinity === "light" ? "Light" : "Dark"}</strong> this turn
              </span>
              <i
                className={`orb ${neutralAffinity === "light" ? "white" : "black"}`}
                aria-hidden="true"
              />
            </div>
          )}
          <div className="three-board-frame">
            <BoardViewport
              className="three-board-zoom"
              label="Three-player board"
              resetKey={state.config.boardVariant}
            >
              <ThreePlayerBoard
                state={state as ThreePlayerState}
                selectedCell={selectedCell}
                provisionalSource={moveFirstDraft?.source}
                provisionalDestination={moveFirstDraft?.destination}
                legalCells={legalCells}
                sourceCells={sourceCells}
                pathCells={pathCells(state)}
                disabled={inputDisabled}
                onCell={selectCell}
                onInspectCell={(cell) => {
                  setInspectedCell(state.board[cell] ? cell : undefined);
                }}
              />
            </BoardViewport>
          </div>
          <ThreePlayerPieceInfo
            state={state}
            cell={inspectedCell}
            onClose={() => setInspectedCell(undefined)}
          />
          <div className="three-history-strip">
            <History size={15} />
            <span>{state.lastAction ?? state.history.at(-1) ?? "The pantheons are ready."}</span>
          </div>
        </section>

        <aside
          className={`three-action-panel ${state.phase === "upgrade" ? "upgrade-panel" : ""} ${state.phase === "play" && !selectedGod ? "god-selection-panel" : ""}`}
        >
          <div className="panel-heading">
            <span>{state.phase === "upgrade" ? "DIVINE UPGRADE" : readOnlyGod ? "PANTHEON DETAILS" : "DIVINE ACTION"}</span>
            <small>ROUND {state.round}</small>
          </div>

          {state.phase === "upgrade" ? (
            <>
              <div className="panel-empty">
                <Sparkles size={25} />
                <h3>Choose an ability to strengthen</h3>
                <p>Compare your pantheon, preview its higher levels, then confirm one upgrade.</p>
              </div>
              <LevelSelector
                level={previewLevel ?? defaultUpgradePreviewLevel}
                onChange={setPreviewLevel}
                label="All abilities"
                className="god-level-selector"
              />
              <div className="three-upgrade-list">
                {activePlayer.gods.map((godId) => {
                  const god = GOD_BY_ID[godId];
                  return (
                    <section key={godId}>
                      <div className="three-panel-god-heading">
                        <GodPortrait
                          godId={godId}
                          skinId={draftedGodSkin(activePlayer.godSkins, godId)}
                        />
                        <strong>{god.name}</strong>
                        <small>{god.domain}</small>
                      </div>
                      {god.abilities.map((ability) => {
                        const level = abilityLevel(activePlayer.upgrades, ability.id);
                        const action = upgradeActions.find((candidate) =>
                          actionValue<string>(candidate, "abilityId") === ability.id
                        );
                        const selected = selectedUpgradeAbility === ability.id;
                        return (
                          <PlayerAbilityCard
                            ability={ability}
                            level={level}
                            previewLevel={previewLevel}
                            active={selected}
                            selectable={!inputDisabled && Boolean(action)}
                            disabled={inputDisabled || !action}
                            footerLabel={`CURRENT LVL ${level}`}
                            footerAction={level >= 3 ? "MAX LEVEL" : `SELECT LVL ${level + 1}`}
                            showCost={false}
                            onClick={() => {
                              setPreviewLevel(Math.min(3, level + 1));
                              setSelectedUpgradeAbility(ability.id);
                            }}
                            onDoubleClick={() => {
                              if (action) dispatchAction(action);
                            }}
                            key={ability.id}
                          >
                            {selected && action && (
                              <div className="upgrade-confirmation">
                                <button
                                  className="primary-button"
                                  onClick={() => dispatchAction(action)}
                                >
                                  Confirm {ability.name} · Lv {level + 1}
                                </button>
                              </div>
                            )}
                          </PlayerAbilityCard>
                        );
                      })}
                    </section>
                  );
                })}
              </div>
            </>
          ) : moveFirstDraft ? (
            <ThreePlayerMoveFirstChooser
              state={state as ThreePlayerState}
              draft={moveFirstDraft}
              candidates={moveFirstAbilityCandidates}
              onCancel={() => setMoveFirstDraft(undefined)}
              onCommit={commitMoveFirst}
            />
          ) : !selectedGodDefinition ? (
            <>
              <div className="panel-empty">
                <Sparkles size={25} />
                <h3>{activePlayer.name} to act</h3>
                <p>{state.notice}</p>
              </div>
              {detachedGenericActions.length > 0 && (
                <div className="three-generic-actions" aria-label="Available actions">
                  {detachedGenericActions.map((action, index) => (
                    <button
                      className={action.type === "cancel" ? "danger-button" : "secondary-button"}
                      disabled={inputDisabled}
                      onClick={() => dispatchAction(action)}
                      key={`${action.type}-${index}-${actionLabel(action)}`}
                    >
                      {action.type === "confirm-ability" && <Check size={15} />}
                      {actionLabel(action)}
                    </button>
                  ))}
                </div>
              )}
              {!state.pending && (
                <div className="god-list">
                  {activePlayer.gods.map((godId) => {
                    const god = GOD_BY_ID[godId];
                    const resting = state.rested.includes(godId);
                    const action = selectedGodActions.find(
                      (candidate) => actionValue<GodId>(candidate, "godId") === godId,
                    );
                    return (
                      <button
                        className={`god-row ${resting ? "resting" : ""}`}
                        disabled={inputDisabled || (!resting && !action)}
                        onClick={() => {
                          if (resting) {
                            setInspectedGod(godId);
                          } else if (action) {
                            setInspectedGod(undefined);
                            dispatchAction(action);
                          }
                        }}
                        style={{ "--accent": god.accent } as React.CSSProperties}
                        key={godId}
                      >
                        <GodPortrait
                          godId={godId}
                          skinId={draftedGodSkin(activePlayer.godSkins, godId)}
                          className="god-row-portrait"
                        />
                        <span className="god-row-copy">
                          <strong>{god.name}</strong>
                          <small>{resting ? "RESTING · VIEW" : god.domain}</small>
                        </span>
                        <ChevronRight size={17} />
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
                style={{ "--accent": selectedGodDefinition.accent } as React.CSSProperties}
              >
                <GodPortrait
                  godId={selectedGodDefinition.id}
                  skinId={draftedGodSkin(
                    selectedGodPlayer.godSkins,
                    selectedGodDefinition.id,
                  )}
                  className="god-hero-portrait"
                />
                <div>
                  <span>{selectedGodDefinition.domain}</span>
                  <h3>{selectedGodDefinition.name}</h3>
                  <p>{selectedGodDefinition.epithet}</p>
                </div>
                <button
                  className="god-back-button"
                  disabled={!readOnlyGod && committedAbility}
                  onClick={() => {
                    if (readOnlyGod) {
                      setInspectedGod(undefined);
                      return;
                    }
                    if (clearGodAction) dispatchAction(clearGodAction);
                  }}
                  aria-label={readOnlyGod ? "Close god details" : "Choose a different god"}
                >
                  <ArrowLeft size={17} />
                </button>
              </div>
              {readOnlyGod && (
                <div className={`inspection-banner ${state.rested.includes(selectedGodDefinition.id) ? "resting" : ""}`}>
                  <BookOpen size={14} />
                  {state.rested.includes(selectedGodDefinition.id)
                    ? `${selectedGodDefinition.name} is resting · abilities are unavailable`
                    : "Viewing unused God · abilities are read-only"}
                </div>
              )}
              <LevelSelector
                level={previewLevel ?? defaultPreviewLevel}
                onChange={setPreviewLevel}
                label="All abilities"
                className="god-level-selector"
              />
              <div className="ability-list">
                {selectedGodDefinition.abilities.map((ability) => {
                  const action = selectedAbilityActions.find(
                    (candidate) => actionValue<string>(candidate, "abilityId") === ability.id,
                  );
                  const level = abilityLevel(activePlayer.upgrades, ability.id);
                  const active = !readOnlyGod && state.selectedAbility === ability.id;
                  const unavailable = !readOnlyGod && !active && !action;
                  return (
                    <PlayerAbilityCard
                      ability={ability}
                      level={level}
                      previewLevel={previewLevel}
                      active={active}
                      selectable={!readOnlyGod && !inputDisabled && !committedAbility && Boolean(action)}
                      disabled={inputDisabled || unavailable}
                      footerAction={unavailable ? "UNAVAILABLE" : undefined}
                      onClick={() => {
                        if (action) dispatchAction(action);
                      }}
                      key={ability.id}
                    >
                      {active && state.pending && (
                        <div aria-label={`${ability.name} follow-up actions`}>
                          <p className="ability-pending-prompt" role="status">{state.notice}</p>
                          {attachedGenericActions.length > 0 && (
                            <div className="three-generic-actions">
                              {attachedGenericActions.map((pendingAction, index) => (
                                <button
                                  className={pendingAction.type === "cancel" ? "danger-button" : "secondary-button"}
                                  disabled={inputDisabled}
                                  onClick={() => dispatchAction(pendingAction)}
                                  key={`${pendingAction.type}-${index}-${actionLabel(pendingAction)}`}
                                >
                                  {pendingAction.type === "confirm-ability" && <Check size={15} />}
                                  {actionLabel(pendingAction)}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </PlayerAbilityCard>
                  );
                })}
              </div>
            </>
          )}

        </aside>
      </section>

      {historyOpen && (
        <aside className="history-drawer" aria-label="Full history">
          <div className="history-drawer-header">
            <h3><History size={18} /> Chronicle</h3>
            <button onClick={() => setHistoryOpen(false)} aria-label="Close history"><X size={18} /></button>
          </div>
          <div
            className="history-drawer-body"
            aria-label="Chronicle entries"
            tabIndex={0}
          >
            {state.history.map((entry, index) => (
              <p key={`${entry}-${index}`}><span>{index + 1}</span>{entry}</p>
            ))}
          </div>
        </aside>
      )}

      {(state.phase === "gameover" || puzzleFailed) && (
        <GameResultPresentation
          open={resultOpen}
          eyebrow={puzzle ? puzzleSolved ? "PUZZLE COMPLETE" : "PUZZLE FAILED" : "MATCH COMPLETE"}
          title={puzzle
            ? puzzleSolved
              ? "Both rivals checkmated"
              : state.completedTurns.white >= puzzle.playerTurns
                ? "Two turns exhausted"
                : "Puzzle failed"
            : state.result?.kind === "winner"
              ? `${state.players[state.result.seat].name} wins`
              : "Draw"}
          description={puzzle
            ? puzzleSolved
              ? puzzle.solutionSummary
              : "Checkmate both rival Kings before the second divine turn ends."
            : state.result?.reason.replaceAll("-", " ") ?? "The match is complete."}
          newGameLabel={
            puzzle
              ? puzzleSolved ? "Next puzzle" : "Retry puzzle"
              : state.challengeId
                ? "Retry challenge"
                : "New three-player game"
          }
          undoEnabled={puzzle ? true : onlineSession ? true : undoEnabled}
          canUndo={canUndo}
          onOpenChange={setResultOpen}
          onUndo={undo}
          onOpenUndoSettings={onlineSession || puzzle ? undefined : () => setSettingsOpen(true)}
          onNewGame={puzzle
            ? puzzleSolved
              ? onNextPuzzle ?? onQuit
              : onRestartPuzzle ?? onQuit
            : onNewGame}
        />
      )}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
      {settingsOpen && (
        <SettingsModal
          undoEnabled={undoEnabled}
          onUndoEnabled={(enabled) => {
            setUndoEnabled(enabled);
            onUndoPreferenceChange?.(enabled);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {onlineSession?.status === "paused" && (
        <ThreePlayerPauseOverlay
          seat={onlineSession.pausedSeat}
          participantName={onlineSession.pausedParticipantName}
          canReplace={onlineSession.role === "host"}
          onReplace={onlineSession.onReplaceWithAi}
        />
      )}
      {onlineSession?.undoProposal && (
        <ThreePlayerUndoOverlay
          proposal={onlineSession.undoProposal}
          onVote={onlineSession.onUndoVote}
        />
      )}
      <MatchEscapeMenu
        onOpenRules={() => setHelpOpen(true)}
        onOpenSettings={onlineSession || puzzle ? undefined : () => setSettingsOpen(true)}
        onLeave={puzzle || state.challengeId ? onQuit : () => void saveAndQuit()}
        leaveLabel={
          puzzle
            ? "Back to puzzles"
            : onlineSession
              ? "Leave room"
              : state.challengeId
                ? "Leave challenge"
                : "Save & quit"
        }
        onQuitWithoutSaving={
          !onlineSession && !puzzle && !state.challengeId && onPersist
            ? onQuit
            : undefined
        }
        additionalActions={[
          ...(!onlineSession ? [{
            label: "Restart",
            icon: <RotateCcw size={16} />,
            onSelect: puzzle
              ? onRestartPuzzle ?? onQuit
              : state.challengeId
                ? onNewGame
                : () => dispatchAction({ type: "restart" }),
          }] : []),
          {
            label: puzzle
              ? "Next puzzle"
              : onlineSession
                ? "New online room"
                : state.challengeId
                  ? "Challenges"
                  : "New setup",
            icon: <Crown size={16} />,
            onSelect: puzzle
              ? onNextPuzzle ?? onQuit
              : state.challengeId
                ? onQuit
                : onNewGame,
          },
        ]}
      />
    </main>
  );
}
