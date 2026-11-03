import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

export const SEARCH_TIMEOUT_MS = 20 * 60 * 1000;

export async function prepareDailyPuzzle(date, exportPath) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) {
    throw new Error("Provide today's date as YYYY-MM-DD.");
  }
  if (!exportPath) throw new Error("Provide a path to preserve the complete simulation export.");
  const outputPath = path.resolve(exportPath);
  const dailyPath = path.resolve(`src/game/dailies/${date}.json`);
  if (fs.existsSync(dailyPath) || fs.existsSync(outputPath)) {
    throw new Error("Refusing to overwrite an existing Daily or simulation export.");
  }

  const deadline = Date.now() + SEARCH_TIMEOUT_MS;
  const discard = () => {
    for (const file of [dailyPath, outputPath]) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  };
  const run = (command, args, searching = true) => new Promise((resolve, reject) => {
    const remaining = deadline - Date.now();
    if (searching && remaining <= 0) {
      reject(new Error("Daily search exceeded its single 20-minute deadline."));
      return;
    }
    const child = spawn(command, args, {
      stdio: "inherit",
      env: { ...process.env, DAILY_SEARCH_DEADLINE: String(deadline) },
      detached: process.platform !== "win32",
    });
    let timedOut = false;
    // The parent watchdog also interrupts synchronous, CPU-bound AI searches.
    const timer = searching ? setTimeout(() => {
      timedOut = true;
      if (process.platform === "win32") child.kill("SIGKILL");
      else process.kill(-child.pid, "SIGKILL");
    }, remaining) : undefined;
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (timedOut || (searching && Date.now() >= deadline)) {
        reject(new Error("Daily search exceeded its single 20-minute deadline."));
      } else {
        resolve(code === 0);
      }
    });
  });

  try {
    for (let attempt = 1; Date.now() < deadline; attempt += 1) {
      console.log(`Daily search ${attempt}; ${Math.ceil((deadline - Date.now()) / 1000)} seconds remain.`);
      const simulated = await run(process.execPath, [
        "node_modules/vite-node/vite-node.mjs",
        "scripts/run-cpu-simulation.ts",
        outputPath,
        date,
      ]);
      if (!simulated) {
        console.error("Simulation/export failed; discarding it and starting a fresh game and draft.");
        discard();
        continue;
      }
      const generated = await run("npm", ["run", "generate:daily", "--", outputPath, date]);
      if (!generated) {
        console.error("Exact replay validation failed; discarding this checkpoint.");
        discard();
        continue;
      }
      const validated = await run("npm", [
        "test", "--",
        "scripts/generate-daily-puzzle.test.ts",
        "src/game/dailyPuzzles.test.ts",
      ], false);
      if (!validated) {
        console.error("Daily replay/hint tests failed; discarding this checkpoint.");
        discard();
        continue;
      }
      if (!await run("npm", ["run", "build"], false)) {
        throw new Error("Daily build failed; publication is forbidden.");
      }
      console.log(`Daily ${date} is generated and validated. Complete export: ${outputPath}`);
      return;
    }
    throw new Error("Daily search exceeded its single 20-minute deadline.");
  } catch (error) {
    discard();
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await prepareDailyPuzzle(process.argv[2], process.argv[3]);
}
