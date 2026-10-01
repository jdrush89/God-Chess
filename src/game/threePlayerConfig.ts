import {
  THREE_PLAYER_BOARD_VARIANTS,
  THREE_PLAYER_SEATS,
  type ThreePlayerConfig,
  type ThreePlayerOrbAffinity,
  type ThreePlayerPiece,
  type ThreePlayerSeat,
  type ThreePlayerState,
} from "./threePlayerTypes";

const DEFAULT_DISPLAY_COLORS: Record<ThreePlayerSeat, string> = {
  white: "ivory",
  red: "crimson",
  black: "charcoal",
};

export const createDefaultThreePlayerConfig = (): ThreePlayerConfig => ({
  boardVariant: "three-player",
  victoryMode: "last-survivor",
  takeover: false,
  seats: Object.fromEntries(THREE_PLAYER_SEATS.map((seat) => [
    seat,
    {
      name: seat[0].toUpperCase() + seat.slice(1),
      displayColor: DEFAULT_DISPLAY_COLORS[seat],
      control: { kind: "human", local: true },
    },
  ])) as ThreePlayerConfig["seats"],
});

export const validateThreePlayerConfig = (config: ThreePlayerConfig) => {
  if (!THREE_PLAYER_BOARD_VARIANTS.includes(config.boardVariant)) {
    throw new Error("Unknown three-player board variant.");
  }
  if (!["first-checkmate", "last-survivor"].includes(config.victoryMode)) {
    throw new Error("Unknown three-player victory mode.");
  }
  const displayColors = new Set(
    THREE_PLAYER_SEATS.map((seat) => config.seats[seat].displayColor),
  );
  if (displayColors.size !== THREE_PLAYER_SEATS.length) {
    throw new Error("Each three-player seat requires a distinct display color.");
  }
  for (const seat of THREE_PLAYER_SEATS) {
    const seatConfig = config.seats[seat];
    if (!seatConfig || !seatConfig.name.trim() || !seatConfig.displayColor.trim()) {
      throw new Error(`Three-player seat ${seat} requires a name and display color.`);
    }
    const control = seatConfig.control;
    if (
      control.kind === "ai" &&
      control.difficulty !== undefined &&
      (!Number.isInteger(control.difficulty) ||
        control.difficulty < 1 ||
        control.difficulty > 10)
    ) {
      throw new Error(`AI difficulty for ${seat} must be an integer from 1 to 10.`);
    }
  }
  return config;
};

export const createThreePlayerTurnOrder = () => [...THREE_PLAYER_SEATS];

export const createThreePlayerDraftOrder = (): ThreePlayerSeat[] => [
  "white",
  "red",
  "black",
  "black",
  "red",
  "white",
  "white",
  "red",
  "black",
];

export const nextThreePlayerSeat = (
  seat: ThreePlayerSeat,
  activeSeats: readonly ThreePlayerSeat[] = THREE_PLAYER_SEATS,
) => {
  const start = THREE_PLAYER_SEATS.indexOf(seat);
  for (let offset = 1; offset <= THREE_PLAYER_SEATS.length; offset += 1) {
    const candidate = THREE_PLAYER_SEATS[
      (start + offset) % THREE_PLAYER_SEATS.length
    ];
    if (activeSeats.includes(candidate)) return candidate;
  }
  return seat;
};

export const threePlayerSeatsAreHostile = (
  first: ThreePlayerSeat,
  second: ThreePlayerSeat,
) => first !== second;

export const threePlayerOwnerAffinity = (
  owner: ThreePlayerSeat,
  completedRedTurns: number,
): ThreePlayerOrbAffinity => {
  if (owner === "white") return "light";
  if (owner === "black") return "dark";
  return completedRedTurns % 2 === 0 ? "light" : "dark";
};

export const threePlayerPieceAffinity = (
  state: Pick<ThreePlayerState, "completedTurns">,
  piece: Pick<ThreePlayerPiece, "owner">,
) => threePlayerOwnerAffinity(piece.owner, state.completedTurns.red);
