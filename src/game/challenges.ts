import { createGame } from "./engine";
import { createDefaultFourPlayerConfig } from "./fourPlayerConfig";
import { createFourPlayerGame } from "./fourPlayerEngine";
import { GOD_BY_ID, GODS } from "./gods";
import { createDefaultThreePlayerConfig } from "./threePlayerConfig";
import { createThreePlayerGame } from "./threePlayerEngine";
import type {
  ChallengeId,
  Color,
  GameState,
  GodId,
  Square,
} from "./types";
import type { FourPlayerState } from "./fourPlayerTypes";
import type { ThreePlayerState } from "./threePlayerTypes";

export interface ChallengeDefinition {
  id: ChallengeId;
  title: string;
  description: string;
  format: "classic" | "three-player" | "four-player";
}

export const CHALLENGES: ChallengeDefinition[] = [
  {
    id: "phalanx",
    title: "Phalanx",
    description: "Win against a level 10 pantheon of three Ares.",
    format: "classic",
  },
  {
    id: "there-can-only-be-one",
    title: "There can only be one",
    description: "Win as Kangus against Kangus with one-God rules and an upgrade after every turn.",
    format: "classic",
  },
  {
    id: "underdog",
    title: "Underdog",
    description: "Win against a level 10 opponent whose abilities begin at level 2.",
    format: "classic",
  },
  {
    id: "underest-dog",
    title: "Underest dog",
    description: "Win against a level 10 opponent whose abilities begin at level 3.",
    format: "classic",
  },
  {
    id: "regicide",
    title: "Regicide",
    description: "Defeat three Medusas and capture both royal Queens.",
    format: "classic",
  },
  {
    id: "littering-and",
    title: "Littering and…",
    description: "Win against a Kangus pantheon on a board that begins with 10 banana peels.",
    format: "classic",
  },
  {
    id: "gang-up",
    title: "Gang up",
    description: "Defeat two allied level 10 opponents on the three-hexagonal board.",
    format: "three-player",
  },
  {
    id: "jumped",
    title: "Jumped",
    description: "Defeat a team of three allied level 10 opponents in four-player chess.",
    format: "four-player",
  },
];

export const CHALLENGE_BY_ID = Object.fromEntries(
  CHALLENGES.map((challenge) => [challenge.id, challenge]),
) as Record<ChallengeId, ChallengeDefinition>;

const upgradeGods = (
  state: GameState,
  color: Color,
  gods: GodId[],
  level: 2 | 3,
) => {
  for (const godId of gods) {
    for (const ability of GOD_BY_ID[godId].abilities) {
      state.players[color].upgrades[ability.id] = level;
    }
  }
};

const prepareClassicChallenge = (
  id: ChallengeId,
  enemyGods: GodId[],
  playerName?: string,
) => {
  const state = createGame(1, {
    mode: "ai",
    aiDifficulty: 10,
    playerName,
  });
  state.challengeId = id;
  state.challengeGodUses = { white: {}, black: {} };
  state.players.black.gods = [...enemyGods];
  state.draft.order = ["white", "white", "white"];
  const enemyGodSet = new Set(enemyGods);
  state.draft.available = GODS
    .map((god) => god.id)
    .filter((godId) => !enemyGodSet.has(godId));
  state.notice = `${CHALLENGE_BY_ID[id].title}: choose your three Gods.`;
  state.history = [`Challenge: ${CHALLENGE_BY_ID[id].title}`];
  return state;
};

const prepareOneGodChallenge = (playerName?: string) => {
  const state = createGame(1, {
    mode: "ai",
    aiDifficulty: 10,
    playerName,
  });
  state.challengeId = "there-can-only-be-one";
  state.challengeGodUses = { white: {}, black: {} };
  state.phase = "play";
  state.players.white.gods = ["kangus"];
  state.players.black.gods = ["kangus"];
  state.draft.order = [];
  state.draft.available = [];
  state.draft.pickIndex = 0;
  state.notice = "There can only be one: White to act with Kangus.";
  state.history = ["Challenge: There can only be one"];
  return state;
};

const prepareRegicide = (playerName?: string) => {
  const state = prepareClassicChallenge(
    "regicide",
    ["medusa", "medusa", "medusa"],
    playerName,
  );
  const royal = state.board.e8;
  royal.type = "queen";
  royal.id = "black-royal-queen";
  royal.status.challengeRoyal = true;
  state.board.d8.id = "black-second-queen";
  return state;
};

const BANANA_SQUARES: Square[] = [
  "b4",
  "c3",
  "d3",
  "e3",
  "f3",
  "c6",
  "d6",
  "e6",
  "f6",
  "g5",
];

export const createClassicChallenge = (
  id: Exclude<ChallengeId, "gang-up" | "jumped">,
  playerName?: string,
): GameState => {
  switch (id) {
    case "phalanx":
      return prepareClassicChallenge(id, ["ares", "ares", "ares"], playerName);
    case "there-can-only-be-one":
      return prepareOneGodChallenge(playerName);
    case "underdog": {
      const state = prepareClassicChallenge(
        id,
        ["ares", "medusa", "death"],
        playerName,
      );
      upgradeGods(state, "black", state.players.black.gods, 2);
      return state;
    }
    case "underest-dog": {
      const state = prepareClassicChallenge(
        id,
        ["ares", "medusa", "death"],
        playerName,
      );
      upgradeGods(state, "black", state.players.black.gods, 3);
      return state;
    }
    case "regicide":
      return prepareRegicide(playerName);
    case "littering-and": {
      const state = prepareClassicChallenge(
        id,
        ["kangus", "quetzacoatl", "anubis"],
        playerName,
      );
      state.bananas = BANANA_SQUARES.map((square) => ({
        square,
        owner: "black",
        expires: 999,
        level: 1,
      }));
      return state;
    }
  }
};

export const createGangUpChallenge = (
  playerName?: string,
): ThreePlayerState => {
  const config = createDefaultThreePlayerConfig();
  config.boardVariant = "three-hexagonal";
  config.victoryMode = "last-survivor";
  config.teams = {
    white: "player",
    red: "allied-ai",
    black: "allied-ai",
  };
  config.seats.white.name = playerName?.trim() || "Player";
  config.seats.white.control = { kind: "human", local: true };
  for (const seat of ["red", "black"] as const) {
    config.seats[seat].name = "Divine AI";
    config.seats[seat].control = { kind: "ai", difficulty: 10 };
  }
  const state = createThreePlayerGame(config);
  state.challengeId = "gang-up";
  state.notice = "Gang up: draft against two allied Divine AIs.";
  state.history = ["Challenge: Gang up"];
  return state;
};

export const createJumpedChallenge = (
  playerName?: string,
): FourPlayerState => {
  const config = createDefaultFourPlayerConfig();
  config.mode = "teams";
  config.allowUnevenTeams = true;
  config.turnPolicy = "clockwise";
  config.victoryMode = "last-survivor";
  config.teams = {
    north: "team-a",
    east: "team-b",
    south: "team-b",
    west: "team-b",
  };
  config.seats.north.name = playerName?.trim() || "Player";
  config.seats.north.control = { kind: "human", local: true };
  for (const seat of ["east", "south", "west"] as const) {
    config.seats[seat].name = "Divine AI";
    config.seats[seat].control = { kind: "ai", difficulty: 10 };
  }
  const state = createFourPlayerGame(config);
  state.challengeId = "jumped";
  state.notice = "Jumped: draft against three allied Divine AIs.";
  state.history = ["Challenge: Jumped"];
  return state;
};
