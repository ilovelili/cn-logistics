import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

if (!existsSync(".git")) {
  console.log("Skipping Husky install because .git was not found.");
  process.exit(0);
}

const runner = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(runner, ["husky"], { stdio: "inherit" });

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 0);
