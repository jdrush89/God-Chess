import {
  Bot,
  BookOpen,
  Check,
  Crown,
  History,
  Menu,
  RotateCcw,
  Save,
  Settings,
  Shield,
  Skull,
  Undo2,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { GameResultPresentation } from "../GameResultPresentation";
import { MatchEscapeMenu } from "../MatchEscapeMenu";
import {
  recordActionTransition,
  recordDiagnostic,
} from "../diagnostics";
import {
  chooseThreePlayerAiPlan,
  isThreePlayerAiTurn,
} from "../game/threePlayerAi";
import { threePlayerIsInCheck } from "../game/threePlayerChess";
import {
  availableThreePlayerActions,
  threePlayerReducer,
} from "../game/threePlayerEngine";
import type { ThreePlayerUndoStatus } from "../multiplayer/types";
import {
  threePlayerOwnerAffinity,
} from "../game/threePlayerConfig";
import {
  THREE_PLAYER_SEATS,
  type ThreePlayerAction,
  type ThreePlayerCell,
  type ThreePlayerSeat,
  type ThreePlayerState,
} from "../game/threePlayerTypes";
import { GOD_BY_ID, GODS } from "../game/gods";
import type { GodId } from "../game/types";
import { ThreePlayerBoard } from "./ThreePlayerBoard";
import { getThreePlayerTopology } from "../game/threePlayerTopology";
import {
  THREE_PLAYER_PALETTES,
  THREE_PLAYER_SEAT_LABELS,
  THREE_PLAYER_VARIANTS,
} from "./setupConfig";

type UiAction = ThreePlayerAction | ({ type: string } & Record<string, unknown>);
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

function LevelPreview({
  level,
  onChange,
}: {
  level: number;
  onChange: (level: number) => void;
}) {
  return (
    <span className="three-level-preview" aria-label="Ability preview levels">
      {[1, 2, 3].map((item) => (
        <button
          type="button"
          className={level === item ? "active" : ""}
          aria-pressed={level === item}
          onClick={(event) => {
            event.stopPropagation();
            onChange(item);
          }}
          key={item}
        >
          Lv {item}
        </button>
      ))}
    </span>
  );
}

function GodCard({
  godId,
  level,
  claimedBy,
  unused,
  active,
  disabled,
  onInspect,
  onChoose,
}: {
  godId: GodId;
  level: number;
  claimedBy?: ThreePlayerSeat;
  unused?: boolean;
  active?: boolean;
  disabled?: boolean;
  onInspect: () => void;
  onChoose?: () => void;
}) {
  const god = GOD_BY_ID[godId];
  return (
    <article
      className={`three-god-card ${active ? "active" : ""} ${claimedBy ? "claimed" : ""} ${unused ? "unused" : ""}`}
      style={{ "--accent": god.accent } as React.CSSProperties}
    >
      <button className="three-god-inspect" onClick={onInspect}>
        <img src={GOD_PORTRAITS[godId]} alt="" />
        <span>
          <strong>{god.name}</strong>
          <small>{god.domain}</small>
        </span>
        {claimedBy && (
          <i
            className="three-claimed-by"
            style={{ "--seat-color": THREE_PLAYER_PALETTES[claimedBy] } as React.CSSProperties}
          >
            {THREE_PLAYER_SEAT_LABELS[claimedBy][0]}
          </i>
        )}
        {unused && <em>Unused</em>}
      </button>
      {onChoose && (
        <button
          className="three-god-choose"
          disabled={disabled || Boolean(claimedBy)}
          onClick={onChoose}
        >
          {claimedBy ? `Claimed by ${THREE_PLAYER_SEAT_LABELS[claimedBy]}` : `Claim ${god.name}`}
        </button>
      )}
      <div className="three-god-abilities">
        {god.abilities.map((ability) => (
          <span key={ability.id}>
            <strong>{ability.name}</strong>
            <small>{ability.details[level - 1]}</small>
          </span>
        ))}
      </div>
    </article>
  );
}

function ThreePlayerDraft({
  state,
  actions,
  inputDisabled,
  onAction,
  onExit,
  exitLabel,
  canUndo,
  onUndo,
  roomCode,
}: {
  state: UiState;
  actions: UiAction[];
  inputDisabled: boolean;
  onAction: (action: UiAction) => void;
  onExit: () => void;
  exitLabel: string;
  canUndo: boolean;
  onUndo: () => void;
  roomCode?: string;
}) {
  const [inspected, setInspected] = useState<GodId>(GODS[0].id);
  const [level, setLevel] = useState(1);
  const claimed = new Map<GodId, ThreePlayerSeat>();
  for (const seat of THREE_PLAYER_SEATS) {
    for (const godId of state.players[seat].gods) claimed.set(godId, seat);
  }
  const currentSeat = state.draft.order[state.draft.pickIndex] ?? state.activeSeat;
  return (
    <main className="three-draft-page">
      <header className="three-game-topbar">
        <div>
          <p className="eyebrow">THREE-PLAYER DRAFT</p>
          <strong>Nine divine claims</strong>
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
          <button className="secondary-button" onClick={onExit}>
            <Save size={16} /> {exitLabel}
          </button>
        </div>
      </header>
      <section className="three-draft-hero">
        <p style={{ "--seat-color": THREE_PLAYER_PALETTES[currentSeat] } as React.CSSProperties}>
          {state.players[currentSeat].name} picks
        </p>
        <h1>Choose a God.</h1>
        <div className="three-draft-progress" aria-label="Nine draft picks">
          {state.draft.order.map((seat, index) => (
            <span
              className={`${index < state.draft.pickIndex ? "done" : ""} ${index === state.draft.pickIndex ? "current" : ""}`}
              style={{ "--seat-color": THREE_PLAYER_PALETTES[seat] } as React.CSSProperties}
              aria-label={`Pick ${index + 1}: ${THREE_PLAYER_SEAT_LABELS[seat]}`}
              key={`${seat}-${index}`}
            />
          ))}
        </div>
        <LevelPreview level={level} onChange={setLevel} />
      </section>
      <section className="three-draft-grid">
        {GODS.map((god) => {
          const draftAction = actions.find(
            (action) => action.type === "draft" &&
              actionValue<GodId>(action, "godId") === god.id,
          );
          return (
            <GodCard
              godId={god.id}
              level={level}
              claimedBy={claimed.get(god.id)}
              active={inspected === god.id}
              disabled={inputDisabled || !draftAction}
              onInspect={() => setInspected(god.id)}
              onChoose={() => draftAction && onAction(draftAction)}
              key={god.id}
            />
          );
        })}
      </section>
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
        <span aria-label={`${player.orbs.light} light orbs`}>◯ {player.orbs.light}</span>
        <span aria-label={`${player.orbs.dark} dark orbs`}>● {player.orbs.dark}</span>
        {takeover > 0 && <span className="takeover-count">↪ {takeover}</span>}
      </div>
      <div className="three-player-gods">
        {player.gods.map((godId) => (
          <span
            className={state.rested.includes(godId) ? "resting" : ""}
            title={`${GOD_BY_ID[godId].name}${state.rested.includes(godId) ? " resting" : ""}`}
            key={godId}
          >
            <img src={GOD_PORTRAITS[godId]} alt={GOD_BY_ID[godId].name} />
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
  onlineSession?: ThreePlayerOnlineSession;
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
  onlineSession,
}: ThreePlayerGameProps) {
  const [state, setState] = useState<UiState>(() => clone(initialState) as UiState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [localSelectedCell, setLocalSelectedCell] = useState<ThreePlayerCell>();
  const [previewLevel, setPreviewLevel] = useState(1);
  const [inspectedGod, setInspectedGod] = useState<GodId>(GODS[0].id);
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(initialState.phase === "gameover");
  const [undoEnabled, setUndoEnabled] = useState(undoPreferred);
  const undoStack = useRef<UiState[]>(
    initialUndoHistory.map((snapshot) => clone(snapshot) as UiState),
  );
  const chainStart = useRef<UiState | undefined>(
    initialTurnStart ? clone(initialTurnStart) as UiState : undefined,
  );
  const [undoDepth, setUndoDepth] = useState(undoStack.current.length);
  const aiPlan = useRef<ThreePlayerAction[]>([]);
  const aiWorker = useRef<Worker | undefined>(undefined);
  const aiRequestRevision = useRef<number | undefined>(undefined);
  const [aiPlanReady, setAiPlanReady] = useState(0);
  const actions = useMemo(
    () => availableThreePlayerActions(state as ThreePlayerState) as UiAction[],
    [state],
  );
  const onlineControl = onlineSession?.participantSeat
    ? state.players[onlineSession.participantSeat].control
    : undefined;
  const inputDisabled = onlineSession
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
      settingsOpen ||
      menuOpen
    )
    : state.phase === "gameover" ||
      isThreePlayerAiTurn(state as ThreePlayerState);
  const selectedCell = state.selectedCell ?? localSelectedCell;
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
    : selectedCell
      ? moveActions
        .filter((action) => actionValue<string>(action, "from") === selectedCell)
        .map((action) => actionValue<string>(action, "to"))
        .filter((cell): cell is string => Boolean(cell))
      : [];

  const dispatchAction = (action: UiAction, source: "human" | "ai" = "human") => {
    const current = stateRef.current;
    if (source === "human" && inputDisabled) return;
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
    const next = threePlayerReducer(
      current as ThreePlayerState,
      action as ThreePlayerAction,
    ) as UiState;
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
    if (!onlineSession) return;
    const loaded = threePlayerReducer(initialState, {
      type: "load",
      state: initialState,
    }) as UiState;
    stateRef.current = loaded;
    setState(loaded);
    setLocalSelectedCell(undefined);
    aiPlan.current = [];
    aiRequestRevision.current = undefined;
  }, [initialState, onlineSession?.roomCode]);

  useEffect(() => {
    setResultOpen(state.phase === "gameover");
  }, [state]);

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
    if (!isThreePlayerAiTurn(state as ThreePlayerState)) {
      aiPlan.current = [];
      aiRequestRevision.current = undefined;
      return;
    }
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
  }, [aiPlanReady, onlineSession, state.phase, state.revision]);

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

  const undo = () => {
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
    if (!undoEnabled || !isStableState(stateRef.current)) return;
    const current = stateRef.current;
    const snapshot = undoStack.current.pop();
    if (!snapshot) return;
    chainStart.current = undefined;
    aiPlan.current = [];
    setLocalSelectedCell(undefined);
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

  const canUndo = onlineSession
    ? (
      onlineSession.undoAvailable &&
      onlineSession.status !== "paused" &&
      !onlineSession.awaitingSync &&
      !onlineSession.undoProposal
    )
    : undoEnabled && undoDepth > 0 && isStableState(state);

  if (state.phase === "draft") {
    return (
      <>
        <ThreePlayerDraft
          state={state}
          actions={actions}
          inputDisabled={inputDisabled}
          onAction={dispatchAction}
          onExit={() => void saveAndQuit()}
          exitLabel={onlineSession ? "Leave room" : "Save & quit"}
          canUndo={canUndo}
          onUndo={undo}
          roomCode={onlineSession?.roomCode}
        />
        <MatchEscapeMenu
          onOpenSettings={onlineSession ? undefined : () => setSettingsOpen(true)}
          onLeave={() => void saveAndQuit()}
          leaveLabel={onlineSession ? "Leave room" : "Save & quit"}
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
  const selectedGodActions = actions.filter((action) => action.type === "select-god");
  const selectedAbilityActions = actions.filter((action) => action.type === "select-ability");
  const genericActions = actions.filter((action) =>
    !["draft", "move", "cell", "select-god", "select-ability"].includes(action.type)
  );
  const unusedGods = state.draft.unused.length
    ? state.draft.unused
    : GODS.map((god) => god.id).filter(
      (godId) => !THREE_PLAYER_SEATS.some((seat) => state.players[seat].gods.includes(godId)),
    );
  const variant = THREE_PLAYER_VARIANTS.find(
    (item) => item.id === state.config.boardVariant,
  );

  return (
    <main className={`three-game-page ${state.phase === "gameover" ? "finished-view" : ""} ${inputDisabled ? "input-gated" : ""}`}>
      <header className="three-game-topbar">
        <div>
          <p className="eyebrow">{variant?.name ?? "THREE-PLAYER"}</p>
          <strong>
            Round {state.round} · Turn {state.turn}
            {onlineSession ? ` · Room ${onlineSession.roomCode}` : ""}
          </strong>
        </div>
        <div className="three-game-actions">
          <button onClick={() => setHelpOpen(true)} aria-label="Help"><BookOpen size={17} /></button>
          {!onlineSession && (
            <button onClick={() => setSettingsOpen(true)} aria-label="Settings"><Settings size={17} /></button>
          )}
          <button
            disabled={!canUndo}
            onClick={undo}
            aria-label="Undo"
          >
            <Undo2 size={17} />
          </button>
          <button onClick={() => setMenuOpen((open) => !open)} aria-label="Game menu"><Menu size={17} /></button>
        </div>
        {menuOpen && (
          <div className="three-game-menu">
            <button onClick={() => void saveAndQuit()}>
              <Save size={15} /> {onlineSession ? "Leave room" : "Save & quit"}
            </button>
            {!onlineSession && (
              <button onClick={() => dispatchAction({ type: "restart" })}><RotateCcw size={15} /> Restart</button>
            )}
            <button onClick={onNewGame}>
              <Crown size={15} /> {onlineSession ? "New online room" : "New setup"}
            </button>
          </div>
        )}
      </header>

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
          <div className="three-board-frame">
            <ThreePlayerBoard
              state={state as ThreePlayerState}
              selectedCell={selectedCell}
              legalCells={legalCells}
              pathCells={pathCells(state)}
              disabled={inputDisabled}
              onCell={selectCell}
            />
          </div>
          <div className="three-history-strip">
            <History size={15} />
            <span>{state.lastAction ?? state.history.at(-1) ?? "The pantheons are ready."}</span>
          </div>
        </section>

        <aside className="three-action-panel">
          <header>
            <p className="eyebrow">DIVINE ACTIONS</p>
            <h2>{GOD_BY_ID[selectedGod]?.name ?? "Choose a God"}</h2>
            <LevelPreview level={previewLevel} onChange={setPreviewLevel} />
          </header>

          <div className="three-pantheon-list">
            {state.players[state.activeSeat].gods.map((godId) => {
              const action = selectedGodActions.find(
                (candidate) => actionValue<GodId>(candidate, "godId") === godId,
              );
              return (
                <button
                  className={`${selectedGod === godId ? "active" : ""} ${state.rested.includes(godId) ? "resting" : ""}`}
                  disabled={inputDisabled || (selectedGodActions.length > 0 && !action)}
                  onClick={() => {
                    setInspectedGod(godId);
                    if (action) dispatchAction(action);
                  }}
                  key={godId}
                >
                  <img src={GOD_PORTRAITS[godId]} alt="" />
                  <span><strong>{GOD_BY_ID[godId].name}</strong><small>{GOD_BY_ID[godId].domain}</small></span>
                </button>
              );
            })}
          </div>

          {selectedGod && (
            <div className="three-ability-list">
              {GOD_BY_ID[selectedGod].abilities.map((ability) => {
                const action = selectedAbilityActions.find(
                  (candidate) => actionValue<string>(candidate, "abilityId") === ability.id,
                );
                const level = state.players[state.activeSeat].upgrades[ability.id] ?? previewLevel;
                return (
                  <button
                    className={state.selectedAbility === ability.id ? "active" : ""}
                    disabled={inputDisabled || (selectedAbilityActions.length > 0 && !action)}
                    onClick={() => action && dispatchAction(action)}
                    key={ability.id}
                  >
                    <span><strong>{ability.name}</strong><small>Level {level}</small></span>
                    <p>{ability.details[level - 1]}</p>
                    {ability.cost && (
                      <em>
                        {Object.entries(ability.cost).map(([orb, amount]) => `${amount} ${orb}`).join(" · ")}
                      </em>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {genericActions.length > 0 && (
            <div className="three-generic-actions" aria-label="Available actions">
              {genericActions.map((action, index) => (
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

          <section className="three-pending-summary">
            <strong>Status</strong>
            <span>{state.pending ? `Pending ${String(state.pending.type ?? "action")}` : "No pending divine action"}</span>
            <span>Upgrade queue: {state.upgradeQueue?.join(", ") || "none"}</span>
            <span>Bananas: {typeof state.bananas === "number" ? state.bananas : state.bananas ? Object.keys(state.bananas).length : 0}</span>
            <span>Presentation events: {(state.presentationEvents?.length ?? 0) + (state.orbAnimations?.length ?? 0)}</span>
          </section>

          <section className="three-unused-gods">
            <strong>Unused Gods</strong>
            <div>
              {unusedGods.map((godId) => (
                <button onClick={() => setInspectedGod(godId)} title={GOD_BY_ID[godId].name} key={godId}>
                  <img src={GOD_PORTRAITS[godId]} alt={GOD_BY_ID[godId].name} />
                </button>
              ))}
            </div>
          </section>

          <details className="three-history">
            <summary>Full history</summary>
            <ol>{state.history.map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}</ol>
          </details>
        </aside>
      </section>

      {state.phase === "gameover" && (
        <GameResultPresentation
          open={resultOpen}
          eyebrow="MATCH COMPLETE"
          title={state.result?.kind === "winner"
            ? `${state.players[state.result.seat].name} wins`
            : "Draw"}
          description={state.result?.reason.replaceAll("-", " ") ?? "The match is complete."}
          newGameLabel="New three-player game"
          undoEnabled={onlineSession ? true : undoEnabled}
          canUndo={canUndo}
          onOpenChange={setResultOpen}
          onUndo={undo}
          onOpenUndoSettings={onlineSession ? undefined : () => setSettingsOpen(true)}
          onNewGame={onNewGame}
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
        onOpenSettings={onlineSession ? undefined : () => setSettingsOpen(true)}
        onLeave={() => void saveAndQuit()}
        leaveLabel={onlineSession ? "Leave room" : "Save & quit"}
      />
    </main>
  );
}
