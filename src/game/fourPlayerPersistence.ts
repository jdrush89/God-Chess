import { FOUR_PLAYER_SEATS, type FourPlayerState } from "./fourPlayerTypes";

export const prepareFourPlayerState = (state: FourPlayerState): FourPlayerState =>
  structuredClone(state);

export const isFourPlayerState = (value: unknown): value is FourPlayerState => {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<FourPlayerState>;
  if (
    state.variant !== "four-player" ||
    !state.config ||
    !state.board ||
    !state.players ||
    !state.draft ||
    !state.activeSeat ||
    !FOUR_PLAYER_SEATS.includes(state.activeSeat)
  ) return false;
  return FOUR_PLAYER_SEATS.every((seat) =>
    state.players?.[seat]?.seat === seat &&
    Array.isArray(state.players[seat].gods) &&
    typeof state.players[seat].eliminated === "boolean"
  );
};
