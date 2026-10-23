import {
  normalizeAccountPortraitId,
  type AccountPortraitId,
} from "../account/portraits";
import type { Color } from "../game/types";

export interface RankedRating {
  rating: number;
  deviation: number;
  volatility: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface RankedParticipant {
  publicId: string;
  displayName: string;
  portraitId: AccountPortraitId;
  color: Color;
  host: boolean;
  connected: boolean;
  rating: number;
}

export type RankedMatchPhase =
  | "matched"
  | "playing"
  | "completed"
  | "cancelled";

export interface RankedMatch {
  id: string;
  phase: RankedMatchPhase;
  roomCode?: string;
  joinToken: string;
  colorTokens?: Partial<Record<Color, string>>;
  color: Color;
  host: boolean;
  participants: RankedParticipant[];
  winnerColor?: Color;
  resultReason?: "game" | "disconnect" | "forfeit" | "draw";
  rating?: RankedRating;
  ratingChange?: number;
}

export type RankedQueuePhase = "idle" | "queued" | RankedMatchPhase;

export interface RankedQueueState {
  phase: RankedQueuePhase;
  loading: boolean;
  rating?: RankedRating;
  match?: RankedMatch;
  error?: string;
}

export const DEFAULT_RANKED_RATING: RankedRating = {
  rating: 1500,
  deviation: 350,
  volatility: 0.06,
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  draws: 0,
};

const COLORS = new Set<Color>(["white", "black"]);
const PHASES = new Set<RankedQueuePhase>([
  "idle",
  "queued",
  "matched",
  "playing",
  "completed",
  "cancelled",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const finite = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export const normalizeRankedRating = (value: unknown): RankedRating => {
  if (!isRecord(value)) return { ...DEFAULT_RANKED_RATING };
  return {
    rating: finite(value.rating, DEFAULT_RANKED_RATING.rating),
    deviation: finite(value.deviation, DEFAULT_RANKED_RATING.deviation),
    volatility: finite(value.volatility, DEFAULT_RANKED_RATING.volatility),
    gamesPlayed: Math.max(0, Math.trunc(finite(value.gamesPlayed, 0))),
    wins: Math.max(0, Math.trunc(finite(value.wins, 0))),
    losses: Math.max(0, Math.trunc(finite(value.losses, 0))),
    draws: Math.max(0, Math.trunc(finite(value.draws, 0))),
  };
};

const normalizeParticipant = (
  value: unknown,
): RankedParticipant | undefined => {
  if (!isRecord(value)) return undefined;
  if (
    typeof value.publicId !== "string" ||
    typeof value.displayName !== "string" ||
    !COLORS.has(value.color as Color)
  ) return undefined;
  return {
    publicId: value.publicId,
    displayName: value.displayName.trim().slice(0, 24) || "Player",
    portraitId: normalizeAccountPortraitId(value.portraitId),
    color: value.color as Color,
    host: value.host === true,
    connected: value.connected !== false,
    rating: finite(value.rating, DEFAULT_RANKED_RATING.rating),
  };
};

export const normalizeRankedQueueState = (
  value: unknown,
): RankedQueueState => {
  if (!isRecord(value) || !PHASES.has(value.phase as RankedQueuePhase)) {
    return { phase: "idle", loading: false };
  }
  const phase = value.phase as RankedQueuePhase;
  const rating = normalizeRankedRating(value.rating);
  if (phase === "idle" || phase === "queued") {
    return { phase, loading: false, rating };
  }
  const match = isRecord(value.match) ? value.match : undefined;
  if (
    !match ||
    typeof match.id !== "string" ||
    typeof match.joinToken !== "string" ||
    !match.joinToken.trim() ||
    match.joinToken.length > 128 ||
    !COLORS.has(match.color as Color)
  ) {
    return { phase: "idle", loading: false, rating };
  }
  const participants = Array.isArray(match.participants)
    ? match.participants.flatMap((participant) => {
      const normalized = normalizeParticipant(participant);
      return normalized ? [normalized] : [];
    })
    : [];
  const winnerColor = COLORS.has(match.winnerColor as Color)
    ? match.winnerColor as Color
    : undefined;
  const resultReason = (
    match.resultReason === "game" ||
    match.resultReason === "disconnect" ||
    match.resultReason === "forfeit" ||
    match.resultReason === "draw"
  ) ? match.resultReason : undefined;
  const colorTokens = match.host === true && isRecord(match.colorTokens)
    ? Object.fromEntries(
      Object.entries(match.colorTokens).filter(
        ([color, token]) =>
          COLORS.has(color as Color) &&
          typeof token === "string" &&
          Boolean(token.trim()) &&
          token.length <= 128,
      ),
    ) as Partial<Record<Color, string>>
    : undefined;
  return {
    phase,
    loading: false,
    rating,
    match: {
      id: match.id,
      phase: phase as RankedMatchPhase,
      roomCode: typeof match.roomCode === "string"
        ? match.roomCode
        : undefined,
      joinToken: match.joinToken,
      colorTokens,
      color: match.color as Color,
      host: match.host === true,
      participants,
      winnerColor,
      resultReason,
      rating,
      ratingChange: typeof match.ratingChange === "number" &&
          Number.isFinite(match.ratingChange)
        ? match.ratingChange
        : undefined,
    },
  };
};

export const roundedRankedRating = (
  rating?: Pick<RankedRating, "rating"> | number,
) => Math.round(typeof rating === "number" ? rating : rating?.rating ?? 1500);
