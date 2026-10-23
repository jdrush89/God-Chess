import type { RankedRating } from "./types";

const SCALE = 173.7178;
const DEFAULT_TAU = 0.5;
const EPSILON = 0.000001;

const g = (phi: number) =>
  1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));

const expected = (mu: number, opponentMu: number, opponentPhi: number) =>
  1 / (1 + Math.exp(-g(opponentPhi) * (mu - opponentMu)));

const volatilityFunction = (
  x: number,
  delta: number,
  phi: number,
  variance: number,
  a: number,
  tau: number,
) => {
  const exponential = Math.exp(x);
  const numerator =
    exponential * (delta * delta - phi * phi - variance - exponential);
  const denominator =
    2 * Math.pow(phi * phi + variance + exponential, 2);
  return numerator / denominator - (x - a) / (tau * tau);
};

export const updateGlicko2 = (
  player: RankedRating,
  opponent: Pick<RankedRating, "rating" | "deviation">,
  score: 0 | 0.5 | 1,
  tau = DEFAULT_TAU,
): RankedRating => {
  const mu = (player.rating - 1500) / SCALE;
  const phi = player.deviation / SCALE;
  const opponentMu = (opponent.rating - 1500) / SCALE;
  const opponentPhi = opponent.deviation / SCALE;
  const opponentImpact = g(opponentPhi);
  const expectation = expected(mu, opponentMu, opponentPhi);
  const variance =
    1 / (opponentImpact * opponentImpact * expectation * (1 - expectation));
  const delta = variance * opponentImpact * (score - expectation);
  const a = Math.log(player.volatility * player.volatility);
  let lower = a;
  let upper: number;
  if (delta * delta > phi * phi + variance) {
    upper = Math.log(delta * delta - phi * phi - variance);
  } else {
    let step = 1;
    while (
      volatilityFunction(
        a - step * tau,
        delta,
        phi,
        variance,
        a,
        tau,
      ) < 0
    ) step += 1;
    upper = a - step * tau;
  }
  let fLower = volatilityFunction(
    lower,
    delta,
    phi,
    variance,
    a,
    tau,
  );
  let fUpper = volatilityFunction(
    upper,
    delta,
    phi,
    variance,
    a,
    tau,
  );
  while (Math.abs(upper - lower) > EPSILON) {
    const next = lower +
      ((lower - upper) * fLower) / (fUpper - fLower);
    const fNext = volatilityFunction(
      next,
      delta,
      phi,
      variance,
      a,
      tau,
    );
    if (fNext * fUpper <= 0) {
      lower = upper;
      fLower = fUpper;
    } else {
      fLower /= 2;
    }
    upper = next;
    fUpper = fNext;
  }
  const volatility = Math.exp(lower / 2);
  const preDeviation = Math.sqrt(phi * phi + volatility * volatility);
  const nextDeviation =
    1 / Math.sqrt(1 / (preDeviation * preDeviation) + 1 / variance);
  const nextMu =
    mu + nextDeviation * nextDeviation * opponentImpact * (score - expectation);
  return {
    ...player,
    rating: Math.min(3000, Math.max(100, 1500 + SCALE * nextMu)),
    deviation: Math.min(350, Math.max(30, SCALE * nextDeviation)),
    volatility,
    gamesPlayed: player.gamesPlayed + 1,
    wins: player.wins + (score === 1 ? 1 : 0),
    losses: player.losses + (score === 0 ? 1 : 0),
    draws: player.draws + (score === 0.5 ? 1 : 0),
  };
};
