#!/usr/bin/env node

const { execFileSync } = require("child_process");
const { join } = require("path");

const PLATFORMS = {
  "linux-x64": "@lorehq/cli-linux-x64",
  "linux-arm64": "@lorehq/cli-linux-arm64",
  "darwin-x64": "@lorehq/cli-darwin-x64",
  "darwin-arm64": "@lorehq/cli-darwin-arm64",
  "win32-x64": "@lorehq/cli-win32-x64",
  "win32-arm64": "@lorehq/cli-win32-arm64",
};

const key = `${process.platform}-${process.arch}`;
const pkg = PLATFORMS[key];
if (!pkg) {
  console.error(`Unsupported platform: ${key}`);
  process.exit(1);
}

let bin;
try {
  bin = join(require.resolve(`${pkg}/package.json`), "..", "lore");
} catch {
  console.error(`Platform package ${pkg} not installed.`);
  console.error("Try reinstalling: npm i -g @lorehq/cli");
  process.exit(1);
}

if (process.platform === "win32") bin += ".exe";

try {
  execFileSync(bin, process.argv.slice(2), { stdio: "inherit" });
} catch (e) {
  process.exit(e.status ?? 1);
}
