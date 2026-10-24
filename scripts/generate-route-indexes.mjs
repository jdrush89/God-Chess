import fs from "node:fs/promises";
import path from "node:path";

const appRoutes = [
  "play",
  "local",
  "local/2",
  "local/3",
  "local/4",
  "online",
  "online/2",
  "online/3",
  "online/4",
  "puzzles",
  "puzzles/easy",
  "puzzles/medium",
  "puzzles/hard",
  "puzzles/three-player",
  "puzzles/challenges",
  "puzzles/custom",
  "puzzles/marketplace",
  "roster",
  "achievements",
  "load",
  "tutorial",
  "game",
  "daily/play",
];

const fallback = await fs.readFile("dist/index.html", "utf8");

await Promise.all(appRoutes.map(async (route) => {
  const output = path.join("dist", route, "index.html");
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, fallback);
}));

console.log(`Generated ${appRoutes.length} static app routes.`);
