import { describe, expect, test } from "bun:test";

import {
  buildModelCatalog,
  emptyModelRouteState,
  executeModelRoute,
  normalizeModelIdentity,
  requiredStagesForWorkType,
  validateDistinctSelection,
  type ModelLike,
  type ModelRouteState,
} from "../core/model-routing";

const models: ModelLike[] = [
  { provider: "anthropic", id: "claude-opus-4.9", name: "Claude Opus 4.9" },
  { provider: "openai", id: "gpt-astra", name: "GPT Astra" },
  { provider: "anthropic", id: "claude-sonnet-4.8", name: "Claude Sonnet 4.8" },
  { provider: "openai", id: "gpt-terra", name: "GPT Terra" },
  { provider: "cursor", id: "composer-2", name: "Cursor Composer 2", cost: { input: 0, output: 0 } },
];

describe("model routing", () => {
  test("builds live frontier and execution choices", () => {
    const catalog = buildModelCatalog(models, true);
    expect(catalog.A.map((item) => item.selector)).toContain("anthropic/claude-opus-4.9");
    expect(catalog.B.map((item) => item.selector)).toContain("cursor/composer-2");
    expect(catalog.B.map((item) => item.selector)).toContain("devin/external-session");
  });

  test("routes the expected stages by work type", () => {
    expect(requiredStagesForWorkType(2)).toEqual(["A", "C", "B", "D"]);
    expect(requiredStagesForWorkType(4)).toEqual(["A", "B", "D"]);
    expect(requiredStagesForWorkType(7)).toEqual(["A", "C"]);
  });

  test("normalizes aliases before enforcing independent reviewers", () => {
    expect(normalizeModelIdentity("cursor/claude-4-opus-high")).toBe("claude-opus-4");
    const candidate = buildModelCatalog(models, false).C[0];
    const state: ModelRouteState = {
      version: 1,
      selections: { A: { ...candidate, selectedAt: "2026-01-01T00:00:00Z" } },
    };
    expect(validateDistinctSelection(state, "C", candidate)).toContain("Stage A already uses");
  });

  test("does not persist a selection when activation fails", async () => {
    let persisted = false;
    const state = emptyModelRouteState();
    const result = await executeModelRoute(state, {
      action: "select",
      stage: "A",
      target: "anthropic/claude-opus-4.9",
      workType: 2,
    }, {
      runtimeName: "Pi",
      models,
      hasExternalDevin: false,
      activate: async () => false,
      persist: () => { persisted = true; },
      now: () => "2026-01-01T00:00:00Z",
    });
    expect(result.response.isError).toBe(true);
    expect(result.state).toBe(state);
    expect(persisted).toBe(false);
  });

  test("persists only after successful activation", async () => {
    let persisted: ModelRouteState | undefined;
    const result = await executeModelRoute(emptyModelRouteState(), {
      action: "select",
      stage: "B",
      target: "openai/gpt-terra",
      workType: 3,
    }, {
      runtimeName: "OMP",
      models,
      hasExternalDevin: false,
      activate: async () => true,
      persist: (next) => { persisted = next; },
      now: () => "2026-01-01T00:00:00Z",
    });
    expect(result.response.isError).toBeUndefined();
    expect(result.state.selections.B?.selector).toBe("openai/gpt-terra");
    expect(persisted).toEqual(result.state);
  });
});
