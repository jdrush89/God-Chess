import {
  createDefaultThreePlayerConfig,
  validateThreePlayerConfig,
} from "../game/threePlayerConfig";
import {
  THREE_PLAYER_SEATS,
  type ThreePlayerBoardVariant,
  type ThreePlayerConfig,
  type ThreePlayerSeat,
  type ThreePlayerSeatControl,
} from "../game/threePlayerTypes";

export const THREE_PLAYER_SEAT_LABELS: Record<ThreePlayerSeat, string> = {
  white: "White",
  red: "Red",
  black: "Black",
};

export const THREE_PLAYER_PALETTES: Record<ThreePlayerSeat, string> = {
  white: "#e7e0cd",
  red: "#bd4d57",
  black: "#65718a",
};

export const THREE_PLAYER_VARIANTS: ReadonlyArray<{
  id: ThreePlayerBoardVariant;
  name: string;
  description: string;
}> = [
  {
    id: "three-player",
    name: "Yalta",
    description: "Three square armies converge through a shared triangular center.",
  },
  {
    id: "three-hexagonal",
    name: "Three Hexagonal",
    description: "A broad six-direction battlefield with long hexagonal lanes.",
  },
  {
    id: "triad",
    name: "Triad",
    description: "A compact hex board built for immediate three-way pressure.",
  },
  {
    id: "three-circular",
    name: "Circular",
    description: "Four rings wrap every file into a continuous contest.",
  },
  {
    id: "three-half",
    name: "Three Half",
    description: "Three joined half-boards create paired tactical fronts.",
  },
];

const defaultName = (seat: ThreePlayerSeat, control: ThreePlayerSeatControl) =>
  control.kind === "ai" ? "Divine AI" : THREE_PLAYER_SEAT_LABELS[seat];

export const createLocalThreePlayerConfig = (
  firstPlayerName?: string,
): ThreePlayerConfig => {
  const config = createDefaultThreePlayerConfig();
  for (const seat of THREE_PLAYER_SEATS) {
    config.seats[seat].displayColor = THREE_PLAYER_PALETTES[seat];
    config.seats[seat].name =
      seat === "white" && firstPlayerName?.trim()
        ? firstPlayerName.trim()
        : defaultName(seat, config.seats[seat].control);
  }
  return config;
};

export const localThreePlayerConfigErrors = (config: ThreePlayerConfig) => {
  const errors: string[] = [];
  if (
    !THREE_PLAYER_SEATS.some(
      (seat) => config.seats[seat].control.kind === "human",
    )
  ) {
    errors.push("At least one seat must be Human on this device.");
  }
  for (const seat of THREE_PLAYER_SEATS) {
    if (!config.seats[seat].name.trim()) {
      errors.push(`${THREE_PLAYER_SEAT_LABELS[seat]} needs a player name.`);
    }
  }
  try {
    validateThreePlayerConfig(config);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid three-player setup.";
    if (!errors.includes(message)) errors.push(message);
  }
  return errors;
};

export const defaultThreePlayerName = defaultName;
