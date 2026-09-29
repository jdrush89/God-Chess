import {
  createDefaultFourPlayerConfig,
  validateFourPlayerConfig,
} from "../game/fourPlayerConfig";
import {
  FOUR_PLAYER_SEATS,
  type FourPlayerConfig,
  type Seat,
  type SeatControl,
} from "../game/fourPlayerTypes";

export const FOUR_PLAYER_SEAT_LABELS: Record<Seat, string> = {
  north: "North",
  east: "East",
  south: "South",
  west: "West",
};

export const FOUR_PLAYER_SEAT_NUMBERS: Record<Seat, number> = {
  north: 1,
  east: 2,
  south: 3,
  west: 4,
};

export const FOUR_PLAYER_PALETTES: Record<Seat, string> = {
  north: "#e0b64f",
  east: "#b54c58",
  south: "#e7e0cd",
  west: "#4b8fbd",
};

export const defaultFourPlayerName = (seat: Seat, control: SeatControl) =>
  control.kind === "ai"
    ? "Divine AI"
    : `Player ${FOUR_PLAYER_SEAT_NUMBERS[seat]}`;

export const createLocalFourPlayerConfig = (
  firstPlayerName?: string,
): FourPlayerConfig => {
  const config = createDefaultFourPlayerConfig();
  config.teams = {
    north: "team-a",
    east: "team-b",
    south: "team-a",
    west: "team-b",
  };
  for (const seat of FOUR_PLAYER_SEATS) {
    config.seats[seat].displayColor = FOUR_PLAYER_PALETTES[seat];
    config.seats[seat].name = seat === "north" && firstPlayerName?.trim()
      ? firstPlayerName.trim()
      : defaultFourPlayerName(seat, config.seats[seat].control);
  }
  return config;
};

export const localFourPlayerConfigErrors = (config: FourPlayerConfig) => {
  const errors: string[] = [];
  if (!FOUR_PLAYER_SEATS.some((seat) => config.seats[seat].control.kind === "human")) {
    errors.push("At least one seat must be Human on this device.");
  }
  for (const seat of FOUR_PLAYER_SEATS) {
    if (!config.seats[seat].name.trim()) {
      errors.push(`${FOUR_PLAYER_SEAT_LABELS[seat]} needs a player name.`);
    }
  }
  if (config.mode === "teams") {
    const teamA = FOUR_PLAYER_SEATS.filter((seat) => config.teams?.[seat] === "team-a");
    const teamB = FOUR_PLAYER_SEATS.filter((seat) => config.teams?.[seat] === "team-b");
    if (teamA.length !== 2 || teamB.length !== 2) {
      errors.push("Team games require exactly two seats on Team A and two on Team B.");
    }
  }
  try {
    validateFourPlayerConfig(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid four-player setup.";
    if (!errors.includes(message)) errors.push(message);
  }
  return errors;
};
