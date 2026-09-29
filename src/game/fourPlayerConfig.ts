import {
  FOUR_PLAYER_SEATS,
  type FourPlayerConfig,
  type Seat,
  type TeamId,
} from "./fourPlayerTypes";

const DEFAULT_DISPLAY_COLORS: Record<Seat, string> = {
  north: "gold",
  east: "crimson",
  south: "ivory",
  west: "azure",
};

export const clockwiseSeats = (startingSeat: Seat = "north") => {
  const start = FOUR_PLAYER_SEATS.indexOf(startingSeat);
  return [...FOUR_PLAYER_SEATS.slice(start), ...FOUR_PLAYER_SEATS.slice(0, start)];
};

export const createDefaultFourPlayerConfig = (): FourPlayerConfig => ({
  mode: "ffa",
  turnPolicy: "clockwise",
  victoryMode: "last-survivor",
  takeover: false,
  startingSeat: "north",
  seats: Object.fromEntries(FOUR_PLAYER_SEATS.map((seat) => [
    seat,
    {
      name: seat[0].toUpperCase() + seat.slice(1),
      displayColor: DEFAULT_DISPLAY_COLORS[seat],
      orbAffinity: seat === "north" || seat === "south" ? "light" : "dark",
      control: { kind: "human", local: true },
    },
  ])) as FourPlayerConfig["seats"],
});

export const validateFourPlayerConfig = (config: FourPlayerConfig) => {
  const affinities = FOUR_PLAYER_SEATS.map((seat) => config.seats[seat].orbAffinity);
  if (affinities.filter((affinity) => affinity === "light").length !== 2) {
    throw new Error("Four-player games require exactly two light-affinity seats.");
  }
  if (affinities.filter((affinity) => affinity === "dark").length !== 2) {
    throw new Error("Four-player games require exactly two dark-affinity seats.");
  }
  const displayColors = new Set(FOUR_PLAYER_SEATS.map((seat) => config.seats[seat].displayColor));
  if (displayColors.size !== FOUR_PLAYER_SEATS.length) {
    throw new Error("Each four-player seat requires a distinct display color.");
  }
  if (config.mode === "teams") {
    if (!config.teams) throw new Error("Team mode requires a team assignment for every seat.");
    for (const team of ["team-a", "team-b"] as TeamId[]) {
      if (FOUR_PLAYER_SEATS.filter((seat) => config.teams?.[seat] === team).length !== 2) {
        throw new Error("Team mode requires exactly two seats on each team.");
      }
    }
  } else if (config.turnPolicy === "alternate-teams") {
    throw new Error("Alternating-team turns are only valid in team mode.");
  }
  for (const seat of FOUR_PLAYER_SEATS) {
    const control = config.seats[seat].control;
    if (
      control.kind === "ai" &&
      control.difficulty !== undefined &&
      (!Number.isInteger(control.difficulty) || control.difficulty < 1 || control.difficulty > 10)
    ) {
      throw new Error(`AI difficulty for ${seat} must be an integer from 1 to 10.`);
    }
  }
  return config;
};

export const teamForSeat = (config: FourPlayerConfig, seat: Seat) =>
  config.mode === "teams" ? config.teams?.[seat] : undefined;

export const seatsAreAllies = (config: FourPlayerConfig, first: Seat, second: Seat) =>
  first === second ||
  (
    config.mode === "teams" &&
    config.teams?.[first] !== undefined &&
    config.teams[first] === config.teams?.[second]
  );

export const seatsAreHostile = (config: FourPlayerConfig, first: Seat, second: Seat) =>
  !seatsAreAllies(config, first, second);

export const createTurnOrder = (config: FourPlayerConfig) => {
  validateFourPlayerConfig(config);
  const clockwise = clockwiseSeats(config.startingSeat);
  if (config.turnPolicy === "clockwise") return clockwise;
  const remaining = new Set(clockwise.slice(1));
  const order: Seat[] = [config.startingSeat];
  while (remaining.size) {
    const current = order.at(-1)!;
    const currentTeam = config.teams![current];
    const currentIndex = clockwise.indexOf(current);
    const candidates = clockwise
      .slice(currentIndex + 1)
      .concat(clockwise.slice(0, currentIndex + 1))
      .filter((seat) => remaining.has(seat));
    const next = candidates.find((seat) => config.teams![seat] !== currentTeam) ?? candidates[0];
    order.push(next);
    remaining.delete(next);
  }
  return order;
};

export const createFourPlayerDraftOrder = (turnOrder: Seat[]) => [
  ...turnOrder,
  ...[...turnOrder].reverse(),
  ...turnOrder,
];
