export type DiagnosticVariant = "classic" | "four-player" | "three-player";

export interface DiagnosticEntry {
  sequence: number;
  relativeMs: number;
  timestamp: string;
  category: "action" | "ai" | "online" | "ui" | "error";
  event: string;
  context?: Record<string, unknown>;
  data?: unknown;
}

interface StoredDiagnostics {
  startedAt: string;
  nextSequence: number;
  entries: DiagnosticEntry[];
  latestContext?: Record<string, unknown>;
}

const STORAGE_KEY = "god-chess-diagnostics-v1";
const MAX_ENTRIES = 180;
const MAX_TEXT = 1_200;
const startedAtMs = Date.now();
let storageError: string | undefined;

const emptyDiagnostics = (): StoredDiagnostics => ({
  startedAt: new Date(startedAtMs).toISOString(),
  nextSequence: 1,
  entries: [],
});

const secretKey = /(authorization|auth[-_]?token|token|secret|password|credential|reconnect|participant.*id|peer.*id|user.*id|supabase|sdp|ice|room.*code)/i;
const nameKey = /(?:^|[-_]|display|player|seat|host|guest|user)name$/i;
const secretValue = /(bearer\s+[a-z0-9._~+/=-]+|candidate:\S+|(?:eyJ[a-z0-9_-]{8,}\.){2}[a-z0-9_-]{8,}|reconnect[-_ ]?token|authorization\s*:)/i;

const truncate = (value: string, limit = MAX_TEXT) =>
  value.length > limit ? `${value.slice(0, limit)}…` : value;

export const redactDiagnostics = (
  value: unknown,
  seen = new WeakSet<object>(),
): unknown => {
  if (typeof value === "string") {
    return secretValue.test(value) ? "[redacted]" : truncate(value);
  }
  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) return value;
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, 80).map((item) => redactDiagnostics(item, seen));
  }
  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(source)
      .slice(0, 100)
      .map(([key, item]) => {
        if (secretKey.test(key)) return [key, "[redacted]"];
        if (nameKey.test(key)) return [key, "[redacted-name]"];
        return [key, redactDiagnostics(item, seen)];
      }),
  );
};

const loadDiagnostics = (): StoredDiagnostics => {
  if (typeof window === "undefined") return emptyDiagnostics();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyDiagnostics();
    const parsed = JSON.parse(raw) as Partial<StoredDiagnostics>;
    if (
      typeof parsed.startedAt !== "string" ||
      !Number.isInteger(parsed.nextSequence) ||
      !Array.isArray(parsed.entries)
    ) return emptyDiagnostics();
    return {
      startedAt: parsed.startedAt,
      nextSequence: parsed.nextSequence!,
      entries: parsed.entries.slice(-MAX_ENTRIES)
        .map((entry) => redactDiagnostics(entry) as DiagnosticEntry),
      latestContext: redactDiagnostics(parsed.latestContext) as Record<string, unknown> | undefined,
    };
  } catch (error) {
    storageError = error instanceof Error ? error.message : "Unable to read session diagnostics.";
    return emptyDiagnostics();
  }
};

let diagnostics = loadDiagnostics();

const persistDiagnostics = () => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(diagnostics));
    storageError = undefined;
  } catch (error) {
    storageError = error instanceof Error ? error.message : "Unable to persist session diagnostics.";
  }
};

const stableSerialize = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
    .join(",")}}`;
};

const hash = (value: unknown) => {
  const source = stableSerialize(value);
  let current = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    current ^= source.charCodeAt(index);
    current = Math.imul(current, 16777619);
  }
  return (current >>> 0).toString(16).padStart(8, "0");
};

export const diagnosticStateSummary = (
  state: Record<string, unknown>,
): Record<string, unknown> => {
  const players = state.players as Record<string, { control?: unknown }> | undefined;
  const active = String(state.activeColor ?? state.activeSeat ?? "");
  const pending = state.pending as Record<string, unknown> | undefined;
  return {
    variant: state.variant ?? "classic",
    mode: state.gameMode ?? (state.config as Record<string, unknown> | undefined)?.mode,
    topology: (state.config as Record<string, unknown> | undefined)?.boardVariant,
    phase: state.phase,
    active,
    controller: players?.[active]?.control,
    round: state.round,
    turn: state.turn,
    revision: state.revision,
    positionRevision: state.positionRevision,
    selectedGod: state.selectedGod,
    selectedAbility: state.selectedAbility,
    pending: pending
      ? {
        godId: pending.godId,
        abilityId: pending.abilityId,
        step: pending.step,
      }
      : undefined,
    result: state.result ?? state.winner,
    signature: hash(state),
  };
};

export const recordDiagnostic = (
  entry: Omit<DiagnosticEntry, "sequence" | "relativeMs" | "timestamp">,
) => {
  try {
    const sanitized = redactDiagnostics(entry) as typeof entry;
    diagnostics.entries.push({
      ...sanitized,
      sequence: diagnostics.nextSequence,
      relativeMs: Math.max(0, Date.now() - startedAtMs),
      timestamp: new Date().toISOString(),
    });
    diagnostics.nextSequence += 1;
    diagnostics.entries = diagnostics.entries.slice(-MAX_ENTRIES);
    persistDiagnostics();
  } catch {
    // Diagnostics must never affect gameplay.
  }
};

export const recordActionTransition = ({
  variant,
  mode,
  source,
  action,
  before,
  after,
}: {
  variant: DiagnosticVariant;
  mode?: string;
  source: "human" | "ai" | "online" | "undo";
  action: unknown;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}) => {
  const beforeSummary = diagnosticStateSummary(before);
  const afterSummary = diagnosticStateSummary(after);
  diagnostics.latestContext = redactDiagnostics({
    variant,
    mode,
    config: before.config,
    state: afterSummary,
  }) as Record<string, unknown>;
  recordDiagnostic({
    category: "action",
    event: source === "undo" ? "undo" : "reduce",
    context: { variant, mode, source },
    data: {
      action,
      accepted: beforeSummary.signature !== afterSummary.signature,
      before: beforeSummary,
      after: afterSummary,
    },
  });
};

export const diagnosticsSnapshot = () => structuredClone(diagnostics);

export const diagnosticsStatus = () => ({ storageError });

export const buildDebugReport = (description = "") => {
  const metadata = {
    app: "God Chess",
    version: import.meta.env.VITE_GAME_VERSION || "dev",
    schema: 1,
    generatedAt: new Date().toISOString(),
    startedAt: diagnostics.startedAt,
    browser: typeof navigator === "undefined"
      ? undefined
      : {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
      },
    diagnosticsWarning: storageError,
  };
  return JSON.stringify(redactDiagnostics({
    description: truncate(description.trim(), 2_000),
    metadata,
    latestContext: diagnostics.latestContext,
    entries: diagnostics.entries,
  }), null, 2);
};

export const installGlobalDiagnostics = () => {
  if (typeof window === "undefined") return () => undefined;
  const onError = (event: ErrorEvent) => recordDiagnostic({
    category: "error",
    event: "window-error",
    data: {
      message: event.message,
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
      stack: event.error instanceof Error ? truncate(event.error.stack ?? "") : undefined,
    },
  });
  const onRejection = (event: PromiseRejectionEvent) => recordDiagnostic({
    category: "error",
    event: "unhandled-rejection",
    data: event.reason instanceof Error
      ? {
        message: event.reason.message,
        stack: truncate(event.reason.stack ?? ""),
      }
      : { message: truncate(String(event.reason)) },
  });
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
};

export const resetDiagnosticsForTests = () => {
  diagnostics = emptyDiagnostics();
  storageError = undefined;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Test cleanup should remain best-effort.
    }
  }
};

export const DIAGNOSTIC_ENTRY_LIMIT = MAX_ENTRIES;
