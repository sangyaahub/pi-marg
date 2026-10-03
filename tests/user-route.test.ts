import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { emptyModelRouteState, type ModelRouteState } from "../core/model-routing";
import {
  loadSavedRoute,
  parseUserRoute,
  readUserRoute,
  userRoutePath,
  writeUserRoute,
} from "../core/user-route";

const saved: ModelRouteState = {
  version: 2,
  workType: 2,
  boundary: "Personal",
  skillMode: "1. Compound Engineering",
  selections: {
    A: {
      selector: "openai-codex/gpt-astra",
      identity: "gpt-astra",
      label: "GPT Astra",
      provider: "openai-codex",
      tier: "frontier",
      choice: "openai-frontier",
      access: "runtime-model",
      selectedAt: "2026-01-01T00:00:00.000Z",
    },
  },
  fallbacks: {},
};

describe("user route file", () => {
  test("stores an OMP route under the OMP agent directory and a Pi route under Pi's", () => {
    expect(userRoutePath("OMP", "/tmp/home")).toBe("/tmp/home/.omp/agent/pi-marg-route.json");
    expect(userRoutePath("Pi", "/tmp/home")).toBe("/tmp/home/.pi/agent/pi-marg-route.json");
  });

  test("round-trips a version 2 route and ignores a future version or corrupt file", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-marg-route-"));
    const path = join(dir, "pi-marg-route.json");
    writeUserRoute(path, saved);
    expect(readUserRoute(path)?.selections.A?.selector).toBe("openai-codex/gpt-astra");
    expect(parseUserRoute(JSON.stringify({ version: 3, selections: saved.selections }))).toBeUndefined();
    writeFileSync(path, "{not json");
    expect(readUserRoute(path)).toBeUndefined();
    expect(readUserRoute(join(dir, "missing.json"))).toBeUndefined();
  });

  test("uses the session branch when it has a route and the user file only when it does not", () => {
    const fromFile = saved;
    const fromBranch: ModelRouteState = {
      ...emptyModelRouteState(),
      selections: {
        A: {
          ...saved.selections.A!,
          selector: "anthropic/claude-opus-4.9",
        },
      },
    };
    expect(loadSavedRoute([{
      type: "custom",
      customType: "co.sangyaa.pi-marg.model-routing.v1",
      data: fromBranch,
    }], fromFile).selections.A?.selector).toBe("anthropic/claude-opus-4.9");
    expect(loadSavedRoute([], fromFile).selections.A?.selector).toBe("openai-codex/gpt-astra");
    expect(loadSavedRoute([], undefined)).toEqual(emptyModelRouteState());
  });
});
