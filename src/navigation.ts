import type { PuzzleDifficulty } from "./game/puzzles";

export type StartCategory = "local" | "online";
export type PlayerCount = 2 | 3 | 4;
export type StartView =
  | "menu"
  | "roster"
  | "achievements"
  | "stats"
  | "play"
  | "load"
  | "setup"
  | "three-setup"
  | "four-setup"
  | "puzzles"
  | "tutorial"
  | "none";
export type PuzzleCategory =
  | PuzzleDifficulty
  | "daily"
  | "three-player"
  | "challenges";

export interface AppNavigationRoute {
  startView: StartView;
  setupCategory: StartCategory;
  setupPlayerCount?: PlayerCount;
  puzzleCategory?: PuzzleCategory;
}

const puzzleCategories = new Set<PuzzleCategory>([
  "daily",
  "easy",
  "medium",
  "hard",
  "three-player",
  "challenges",
]);

const playerCount = (value: string | undefined): PlayerCount | undefined => {
  const parsed = Number(value);
  return parsed === 2 || parsed === 3 || parsed === 4 ? parsed : undefined;
};

export const appRouteFromPath = (pathname: string): AppNavigationRoute => {
  const segments = pathname
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);
  const [first, second] = segments;
  const base = {
    setupCategory: "local" as const,
    setupPlayerCount: undefined,
    puzzleCategory: undefined,
  };

  if (first === "daily") {
    return { ...base, startView: "puzzles", puzzleCategory: "daily" };
  }
  if (first === "puzzles") {
    const category = puzzleCategories.has(second as PuzzleCategory)
      ? second as PuzzleCategory
      : undefined;
    return { ...base, startView: "puzzles", puzzleCategory: category };
  }
  if (first === "local" || first === "online") {
    const count = playerCount(second);
    if (first === "local" && count === 3) {
      return { ...base, startView: "three-setup", setupPlayerCount: 3 };
    }
    if (first === "local" && count === 4) {
      return { ...base, startView: "four-setup", setupPlayerCount: 4 };
    }
    return {
      ...base,
      startView: "setup",
      setupCategory: first,
      setupPlayerCount: count,
    };
  }

  const startViewByPath: Record<string, StartView> = {
    play: "play",
    roster: "roster",
    achievements: "achievements",
    stats: "stats",
    load: "load",
    tutorial: "tutorial",
  };
  return {
    ...base,
    startView: startViewByPath[first] ?? (first === "game" ? "play" : "menu"),
  };
};

export const appPathForRoute = (route: AppNavigationRoute) => {
  switch (route.startView) {
    case "menu":
      return "/";
    case "play":
      return "/play";
    case "roster":
      return "/roster";
    case "achievements":
      return "/achievements";
    case "stats":
      return "/stats";
    case "load":
      return "/load";
    case "tutorial":
      return "/tutorial";
    case "puzzles":
      return route.puzzleCategory
        ? `/puzzles/${route.puzzleCategory}`
        : "/puzzles";
    case "three-setup":
      return "/local/3";
    case "four-setup":
      return "/local/4";
    case "setup":
      return `/${route.setupCategory}${
        route.setupPlayerCount ? `/${route.setupPlayerCount}` : ""
      }`;
    case "none":
      return "/game";
  }
};

export const isAppNavigationRoute = (
  value: unknown,
): value is AppNavigationRoute => {
  if (!value || typeof value !== "object") return false;
  const route = value as Partial<AppNavigationRoute>;
  return typeof route.startView === "string" &&
    (route.setupCategory === "local" || route.setupCategory === "online");
};
