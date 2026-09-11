import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildOmpInvocation, parsePiMargArgs, VERSION } from "../bin/pi-marg";

const CLI_PATH = fileURLToPath(new URL("../bin/pi-marg.js", import.meta.url));
const PROJECT_ROOT = dirname(dirname(CLI_PATH));

function runCli(args: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync(CLI_PATH, args, {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function withFakeOmp(
  run: (fixture: { capturePath: string; executablePath: string; fixtureDir: string }) => void,
) {
  const fixtureDir = mkdtempSync(join(tmpdir(), "pi-marg-cli-"));
  const capturePath = join(fixtureDir, "argv.json");
  const executablePath = join(fixtureDir, "fake omp");

  writeFileSync(
    executablePath,
    `#!/usr/bin/env node
const { writeFileSync } = require("node:fs");
writeFileSync(process.env.PIMARG_CAPTURE_PATH, JSON.stringify(process.argv.slice(2)));
process.exit(Number(process.env.PIMARG_STUB_EXIT_CODE || 0));
`,
  );
  chmodSync(executablePath, 0o755);

  try {
    run({ capturePath, executablePath, fixtureDir });
  } finally {
    rmSync(fixtureDir, { force: true, recursive: true });
  }
}

describe("PiMarg CLI", () => {
  test("stays synchronized with the npm package manifest", async () => {
    const packageJson = await Bun.file(new URL("../package.json", import.meta.url)).json();
    expect(VERSION).toBe("1.0.1");
    expect(VERSION).toBe(packageJson.version);
    expect(packageJson.bin).toEqual({ "pi-marg": "bin/pi-marg.js" });
  });

  test("starts interactive intake with no prompt or the start command", () => {
    expect(buildOmpInvocation(parsePiMargArgs([]))).toEqual(["/pi-marg"]);
    expect(buildOmpInvocation(parsePiMargArgs(["start"]))).toEqual(["/pi-marg"]);
  });

  test("preserves a quoted work prompt as one safe OMP argument", () => {
    const parsed = parsePiMargArgs(["add CSV export with spaces"]);
    expect(buildOmpInvocation(parsed)).toEqual(["/pi-marg add CSV export with spaces"]);
  });

  test("accepts start followed by a prompt", () => {
    const parsed = parsePiMargArgs(["start", "review", "this repo"]);
    expect(buildOmpInvocation(parsed)).toEqual(["/pi-marg review this repo"]);
  });

  test("forwards shell metacharacters and newlines as exactly one OMP argument", () => {
    withFakeOmp(({ capturePath, executablePath, fixtureDir }) => {
      const shellSentinel = join(fixtureDir, "shell-expanded");
      const prompt = `review $(touch ${shellSentinel}); echo "quoted" & | < > * ?\nthen stop`;
      const result = runCli([prompt], {
        PIMARG_CAPTURE_PATH: capturePath,
        PIMARG_OMP_BIN: executablePath,
      });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(JSON.parse(readFileSync(capturePath, "utf8"))).toEqual([`/pi-marg ${prompt}`]);
      expect(existsSync(shellSentinel)).toBe(false);
    });
  });

  test("propagates a nonzero OMP exit status", () => {
    withFakeOmp(({ capturePath, executablePath }) => {
      const result = runCli(["start"], {
        PIMARG_CAPTURE_PATH: capturePath,
        PIMARG_OMP_BIN: executablePath,
        PIMARG_STUB_EXIT_CODE: "23",
      });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(23);
      expect(JSON.parse(readFileSync(capturePath, "utf8"))).toEqual(["/pi-marg"]);
    });
  });

  test("returns 127 with actionable guidance when the OMP executable is missing", () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "pi-marg-cli-missing-"));

    try {
      const result = runCli([], { PIMARG_OMP_BIN: join(fixtureDir, "missing-omp") });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(127);
      expect(result.stderr).toContain("could not find the `omp` command");
      expect(result.stderr).toContain("Install Oh My Pi");
      expect(result.stderr).toContain("PATH");
    } finally {
      rmSync(fixtureDir, { force: true, recursive: true });
    }
  });

  test("serves help and version without launching OMP", () => {
    const unavailableOmp = join(tmpdir(), "pi-marg-help-must-not-launch-omp");
    const help = runCli(["--help"], { PIMARG_OMP_BIN: unavailableOmp });
    const version = runCli(["--version"], { PIMARG_OMP_BIN: unavailableOmp });

    expect(help.error).toBeUndefined();
    expect(help.status).toBe(0);
    expect(help.stderr).toBe("");
    expect(help.stdout).toContain(`PiMarg ${VERSION}`);
    expect(help.stdout).toContain("Usage:");

    expect(version.error).toBeUndefined();
    expect(version.status).toBe(0);
    expect(version.stderr).toBe("");
    expect(version.stdout.trim()).toBe(VERSION);
  });
});
