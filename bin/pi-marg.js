#!/usr/bin/env node

import { readFileSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const VERSION = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;

const HELP = `PiMarg ${VERSION}

Usage:
  pi-marg start
  pi-marg "<work prompt>"
  pi-marg start "<work prompt>"

Starts Oh My Pi and invokes PiMarg's interactive workflow.`;

export function parsePiMargArgs(args) {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    return { action: "help", prompt: "" };
  }
  if (args.length === 1 && (args[0] === "--version" || args[0] === "-v")) {
    return { action: "version", prompt: "" };
  }
  const promptParts = args[0]?.toLowerCase() === "start" ? args.slice(1) : args;
  return { action: "launch", prompt: promptParts.join(" ").trim() };
}

export function buildOmpInvocation(parsed) {
  if (parsed.action !== "launch") return [];
  return [parsed.prompt ? `/pi-marg ${parsed.prompt}` : "/pi-marg"];
}

export function runPiMarg(args = process.argv.slice(2)) {
  const parsed = parsePiMargArgs(args);
  if (parsed.action === "help") {
    console.log(HELP);
    return 0;
  }
  if (parsed.action === "version") {
    console.log(VERSION);
    return 0;
  }

  const executable = process.env.PIMARG_OMP_BIN || "omp";
  const result = spawnSync(executable, buildOmpInvocation(parsed), {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    if (result.error.code === "ENOENT") {
      console.error("PiMarg could not find the `omp` command. Install Oh My Pi and make sure `omp` is on PATH.");
      return 127;
    }
    console.error(`PiMarg could not start OMP: ${result.error.message}`);
    return 1;
  }
  return result.status ?? (result.signal ? 1 : 0);
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  process.exitCode = runPiMarg();
}
