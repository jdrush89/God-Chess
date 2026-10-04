export const randomItem = <T>(
  items: readonly T[],
  random: () => number = Math.random,
) => items[Math.floor(random() * items.length)];
