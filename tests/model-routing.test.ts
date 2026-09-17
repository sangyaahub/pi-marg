import { describe, expect, test } from "bun:test";

import {
  MODEL_STATE_TYPE,
  buildModelCatalog,
  emptyModelRouteState,
  executeAutomaticFailover,
  executeModelRoute,
  findTerminalUsageLimitFailure,
  formatCatalogPresentation,
  hasConfiguredFallback,
  isUsageLimitErrorText,
  matchNumberedOption,
  modelToolUsageLimitFailure,
  normalizeModelIdentity,
  numberedOptionLabel,
  requiredStagesForWorkType,
  restoreModelRouteState,
  uniqueProviders,
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

    for (const stage of ["B", "D"] as const) {
      const executionIndexes = catalog[stage]
        .map((item, index) => item.tier === "execution" ? index : -1)
        .filter((index) => index >= 0);
      const otherIndexes = catalog[stage]
        .map((item, index) => item.tier !== "execution" ? index : -1)
        .filter((index) => index >= 0);

      expect(catalog[stage].map((item) => item.selector)).toContain("devin/external-session");
      expect(executionIndexes.every((executionIndex) => (
        otherIndexes.every((otherIndex) => executionIndex < otherIndex)
      ))).toBe(true);
    }
  });

  test("shows every live runtime model in every stage while ranking stage fits first", () => {
    const liveModels: ModelLike[] = [
      ...models,
      { provider: "xai-oauth", id: "grok-build", name: "Grok Build" },
      { provider: "local", id: "custom-model", name: "Custom Model" },
    ];
    const catalog = buildModelCatalog(liveModels, false);
    const liveSelectors = liveModels.map((model) => `${model.provider}/${model.id}`).sort();

    for (const stage of ["A", "B", "C", "D"] as const) {
      expect(catalog[stage].map((item) => item.selector).sort()).toEqual(liveSelectors);
    }

    expect(catalog.A[0]?.tier).toBe("frontier");
    expect(catalog.B[0]?.tier).toBe("execution");
    expect(catalog.A.map((item) => item.selector)).toContain("local/custom-model");
    expect(catalog.B.map((item) => item.selector)).toContain("xai-oauth/grok-build");
  });

  test("routes the expected stages by work type in ascending A/B/C/D order", () => {
    expect(requiredStagesForWorkType(2)).toEqual(["A", "B", "C", "D"]);
    expect(requiredStagesForWorkType(3)).toEqual(["A", "B", "C", "D"]);
    expect(requiredStagesForWorkType(4)).toEqual(["A", "B", "D"]);
    expect(requiredStagesForWorkType(7)).toEqual(["A", "C"]);
  });

  test("presents required stage options in ascending A/B/C/D order", () => {
    const catalog = buildModelCatalog(models, false);
    const formatted = formatCatalogPresentation("OMP", catalog, ["A", "C", "B", "D"]);
    expect(formatted.text).toContain("Required stages: A, B, C, D");
    const stageHeaders = [...formatted.text.matchAll(/^## Stage ([ABCD])/gm)].map((match) => match[1]);
    expect(stageHeaders).toEqual(["A", "B", "C", "D"]);
  });

  test("promotes subscription setup when the live catalog is empty", async () => {
    const result = await executeModelRoute(emptyModelRouteState(), {
      action: "catalog",
      workType: 3,
    }, {
      runtimeName: "OMP",
      models: [],
      hasExternalDevin: false,
      activate: async () => true,
      persist() {},
    });
    expect(result.response.isError).toBe(true);
    const text = result.response.content[0]?.text ?? "";
    expect(text).toContain("No authenticated");
    expect(text.toLowerCase()).toMatch(/subscription|\/login|provider/);
    expect(text).toContain("omp models");
  });

  test("normalizes aliases before enforcing independent reviewers", () => {
    expect(normalizeModelIdentity("cursor/claude-4-opus-high")).toBe("claude-opus-4");
    const candidate = buildModelCatalog(models, false).C[0];
    const state: ModelRouteState = {
      version: 2,
      selections: { A: { ...candidate, selectedAt: "2026-01-01T00:00:00Z" } },
      fallbacks: {},
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
    expect(result.state.activeStage).toBe("B");
    expect(persisted).toEqual(result.state);
  });

  test("migrates saved v1 routes without losing stage selections", () => {
    const candidate = buildModelCatalog(models, false).A[0]!;
    const restored = restoreModelRouteState([{
      type: "custom",
      customType: MODEL_STATE_TYPE,
      data: {
        version: 1,
        workType: 2,
        selections: { A: { ...candidate, selectedAt: "2026-01-01T00:00:00Z" } },
      },
    }]);

    expect(restored.version).toBe(2);
    expect(restored.workType).toBe(2);
    expect(restored.selections.A?.selector).toBe(candidate.selector);
    expect(restored.fallbacks).toEqual({});
  });

  test("saves distinct high and low fallback models without activating them", async () => {
    const activations: string[] = [];
    let persisted: ModelRouteState | undefined;
    const port = {
      runtimeName: "OMP" as const,
      models,
      hasExternalDevin: false,
      activate: async (model: ModelLike) => { activations.push(`${model.provider}/${model.id}`); return true; },
      persist: (next: ModelRouteState) => { persisted = next; },
      now: () => "2026-01-01T00:00:00Z",
    };

    const high = await executeModelRoute(emptyModelRouteState(), {
      action: "select_fallback",
      fallback: "high",
      target: "anthropic/claude-opus-4.9",
    }, port);
    expect(high.response.isError).toBeUndefined();
    expect(high.state.fallbacks.high?.selector).toBe("anthropic/claude-opus-4.9");
    expect(hasConfiguredFallback(high.state)).toBe(false);
    expect(activations).toEqual([]);

    const lowFirst = await executeModelRoute(emptyModelRouteState(), {
      action: "select_fallback",
      fallback: "low",
      target: "openai/gpt-terra",
    }, port);
    expect(lowFirst.response.isError).toBe(true);

    const conflict = await executeModelRoute(high.state, {
      action: "select_fallback",
      fallback: "low",
      target: "anthropic/claude-opus-4.9",
    }, port);
    expect(conflict.response.isError).toBe(true);

    const low = await executeModelRoute(high.state, {
      action: "select_fallback",
      fallback: "low",
      target: "openai/gpt-terra",
    }, port);
    expect(low.response.isError).toBeUndefined();
    expect(low.state.fallbacks.low?.selector).toBe("openai/gpt-terra");
    expect(hasConfiguredFallback(low.state)).toBe(true);
    expect(persisted).toEqual(low.state);
    expect(activations).toEqual([]);
  });

  test("switches high then low on terminal usage-limit failures", async () => {
    const catalog = buildModelCatalog(models, false);
    const selectedAt = "2026-01-01T00:00:00Z";
    const state: ModelRouteState = {
      ...emptyModelRouteState(),
      activeStage: "B",
      fallbacks: {
        high: { ...catalog.A.find((item) => item.selector === "anthropic/claude-opus-4.9")!, selectedAt },
        low: { ...catalog.B.find((item) => item.selector === "openai/gpt-terra")!, selectedAt },
      },
    };
    const activated: string[] = [];
    const persisted: ModelRouteState[] = [];
    const port = {
      runtimeName: "OMP" as const,
      models,
      hasExternalDevin: false,
      activate: async (model: ModelLike) => { activated.push(`${model.provider}/${model.id}`); return true; },
      persist: (next: ModelRouteState) => { persisted.push(next); },
      now: () => "2026-01-02T00:00:00Z",
    };

    const high = await executeAutomaticFailover(state, "devin/swe-2", port);
    expect(high.switched?.level).toBe("high");
    expect(high.switched?.selection.selector).toBe("anthropic/claude-opus-4.9");
    expect(high.state.activeFallback).toBe("high");

    const low = await executeAutomaticFailover(high.state, "anthropic/claude-opus-4.9", port);
    expect(low.switched?.level).toBe("low");
    expect(low.switched?.selection.selector).toBe("openai/gpt-terra");
    expect(low.state.activeFallback).toBe("low");

    const exhausted = await executeAutomaticFailover(low.state, "openai/gpt-terra", port);
    expect(exhausted.switched).toBeUndefined();
    expect(exhausted.exhausted).toBe(true);
    expect(exhausted.stateChanged).toBe(true);

    const duplicate = await executeAutomaticFailover(exhausted.state, "openai/gpt-terra", port);
    expect(duplicate.exhausted).toBe(true);
    expect(duplicate.stateChanged).toBe(false);
    expect(duplicate.state).toBe(exhausted.state);
    expect(activated).toEqual(["anthropic/claude-opus-4.9", "openai/gpt-terra"]);
    expect(persisted).toHaveLength(3);
  });

  test("ignores a duplicate failure event and advances only when the active backup fails", async () => {
    const catalog = buildModelCatalog(models, false);
    const selectedAt = "2026-01-01T00:00:00Z";
    const state: ModelRouteState = {
      ...emptyModelRouteState(),
      fallbacks: {
        high: { ...catalog.A.find((item) => item.selector === "anthropic/claude-opus-4.9")!, selectedAt },
        low: { ...catalog.B.find((item) => item.selector === "openai/gpt-terra")!, selectedAt },
      },
    };
    const activated: string[] = [];
    const port = {
      runtimeName: "OMP" as const,
      models,
      hasExternalDevin: false,
      activate: async (model: ModelLike) => { activated.push(`${model.provider}/${model.id}`); return true; },
      persist() {},
    };

    const high = await executeAutomaticFailover(state, "tool/task", port, "tool:call-1");
    const duplicate = await executeAutomaticFailover(high.state, "tool/task", port, "tool:call-1");
    expect(duplicate.ignoredDuplicate).toBe(true);
    expect(activated).toEqual(["anthropic/claude-opus-4.9"]);

    const anotherTool = await executeAutomaticFailover(high.state, "tool/task", port, "tool:call-2");
    expect(anotherTool.reusedCurrent).toBe(true);
    expect(anotherTool.switched?.level).toBe("high");
    expect(activated).toEqual(["anthropic/claude-opus-4.9"]);

    const low = await executeAutomaticFailover(
      anotherTool.state,
      "anthropic/claude-opus-4.9",
      port,
      "model:high-failure",
    );
    expect(low.switched?.level).toBe("low");
    expect(activated).toEqual(["anthropic/claude-opus-4.9", "openai/gpt-terra"]);
  });

  test("returns the activated state when persistence fails", async () => {
    const catalog = buildModelCatalog(models, false);
    const selectedAt = "2026-01-01T00:00:00Z";
    const state: ModelRouteState = {
      ...emptyModelRouteState(),
      fallbacks: {
        high: { ...catalog.A.find((item) => item.selector === "anthropic/claude-opus-4.9")!, selectedAt },
        low: { ...catalog.B.find((item) => item.selector === "openai/gpt-terra")!, selectedAt },
      },
    };
    const result = await executeAutomaticFailover(state, "devin/swe-2", {
      runtimeName: "OMP",
      models,
      hasExternalDevin: false,
      activate: async () => true,
      persist() { throw new Error("ledger unavailable"); },
    }, "model:devin-1");

    expect(result.switched?.level).toBe("high");
    expect(result.state.activeFallback).toBe("high");
    expect(result.persistenceError).toBe("ledger unavailable");
  });

  test("skips a backup that cannot be activated and tries the next one", async () => {
    const catalog = buildModelCatalog(models, false);
    const selectedAt = "2026-01-01T00:00:00Z";
    const state: ModelRouteState = {
      ...emptyModelRouteState(),
      fallbacks: {
        high: { ...catalog.A.find((item) => item.selector === "anthropic/claude-opus-4.9")!, selectedAt },
        low: { ...catalog.B.find((item) => item.selector === "openai/gpt-terra")!, selectedAt },
      },
    };
    const attempted: string[] = [];
    const result = await executeAutomaticFailover(state, "devin/swe-2", {
      runtimeName: "OMP",
      models,
      hasExternalDevin: false,
      async activate(model) {
        const selector = `${model.provider}/${model.id}`;
        attempted.push(selector);
        if (selector === "anthropic/claude-opus-4.9") throw new Error("credential unavailable");
        return true;
      },
      persist() {},
    });

    expect(attempted).toEqual(["anthropic/claude-opus-4.9", "openai/gpt-terra"]);
    expect(result.switched?.level).toBe("low");
  });

  test("persists unavailable backups as exhausted once", async () => {
    const catalog = buildModelCatalog(models, false);
    const selectedAt = "2026-01-01T00:00:00Z";
    const state: ModelRouteState = {
      ...emptyModelRouteState(),
      fallbacks: {
        high: { ...catalog.A.find((item) => item.selector === "anthropic/claude-opus-4.9")!, selectedAt },
        low: { ...catalog.B.find((item) => item.selector === "openai/gpt-terra")!, selectedAt },
      },
    };
    const persisted: ModelRouteState[] = [];
    const port = {
      runtimeName: "OMP" as const,
      models: [] as ModelLike[],
      hasExternalDevin: false,
      activate: async () => true,
      persist(next: ModelRouteState) { persisted.push(next); },
    };

    const result = await executeAutomaticFailover(state, "devin/swe-2", port, "model:missing-1");
    expect(result.exhausted).toBe(true);
    expect(result.state.exhaustedSelectors).toEqual([
      "devin/swe-2",
      "anthropic/claude-opus-4.9",
      "openai/gpt-terra",
    ]);
    expect(persisted).toHaveLength(1);

    const duplicate = await executeAutomaticFailover(result.state, "devin/swe-2", port, "model:missing-1");
    expect(duplicate.ignoredDuplicate).toBe(true);
    expect(persisted).toHaveLength(1);
  });

  test("recognizes quota failures without treating ordinary errors as usage limits", () => {
    expect(isUsageLimitErrorText("429 rate_limit_exceeded: weekly usage limit reached")).toBe(true);
    expect(isUsageLimitErrorText("Devin Agent Compute Units exhausted")).toBe(true);
    expect(isUsageLimitErrorText("HTTP 429 retry after 5 seconds")).toBe(false);
    expect(isUsageLimitErrorText("rate_limit_exceeded; try again shortly")).toBe(false);
    expect(isUsageLimitErrorText("TypeError: cannot read property 'id'")).toBe(false);
    expect(modelToolUsageLimitFailure({
      isError: true,
      toolCallId: "devin-1",
      toolName: "mcp__devin_run",
      result: { payload: "x".repeat(40_000), error: "Agent Compute Units exhausted" },
    })).toEqual({ selector: "devin/external-session", key: "tool:devin-1" });
    expect(modelToolUsageLimitFailure({
      isError: true,
      toolName: "read_file",
      result: { error: "quota exhausted" },
    })).toBeUndefined();
    expect(modelToolUsageLimitFailure({
      isError: true,
      toolName: "mcp__asana_create_task",
      result: { error: "quota exhausted" },
    })).toBeUndefined();
    expect(modelToolUsageLimitFailure({
      isError: true,
      toolName: "task",
      result: {
        error: "worker crashed",
        details: "Request metadata: test quota exhausted handling",
        result: "Original request: quota exhausted",
      },
    })).toBeUndefined();
    expect(modelToolUsageLimitFailure({
      isError: true,
      toolName: "task",
      result: { details: { error: "monthly usage limit reached" } },
    })).toEqual({ selector: "tool/task", key: "tool:task:monthly usage limit reached" });
    expect(modelToolUsageLimitFailure({
      isError: true,
      toolName: "task",
      result: { content: [{ type: "text", text: "monthly usage limit reached" }] },
    })).toEqual({ selector: "tool/task", key: "tool:task:monthly usage limit reached" });
  });

  test("inspects only the latest assistant outcome for a terminal quota failure", () => {
    expect(findTerminalUsageLimitFailure([
      { role: "assistant", stopReason: "error", errorMessage: "quota exhausted" },
      { role: "toolResult", content: [] },
      { role: "assistant", stopReason: "stop", content: [] },
    ])).toBeUndefined();

    expect(findTerminalUsageLimitFailure([
      { role: "assistant", stopReason: "stop", content: [] },
      { role: "assistant", stopReason: "error", errorMessage: "monthly usage limit reached", timestamp: 42 },
    ])?.timestamp).toBe(42);
  });

  test("numbers options and matches the exact numbered label", () => {
    const items = ["Job/client", "Personal"];
    expect(numberedOptionLabel(0, items[0]!)).toBe("1. Job/client");
    expect(matchNumberedOption("2. Personal", items, (item) => item)).toBe("Personal");
    expect(matchNumberedOption("Personal", items, (item) => item)).toBeUndefined();
  });

  test("presents providers first and lists every model when provider-filtered", async () => {
    const liveModels: ModelLike[] = [
      ...models,
      { provider: "devin", id: "swe-2", name: "SWE-2" },
      { provider: "devin", id: "claude-opus-4.9", name: "Claude Opus 4.9" },
    ];
    const catalog = buildModelCatalog(liveModels, false);
    expect(uniqueProviders(catalog.B)).toEqual(["anthropic", "cursor", "devin", "openai"]);

    const overview = await executeModelRoute(emptyModelRouteState(), {
      action: "catalog",
      workType: 3,
    }, {
      runtimeName: "OMP",
      models: liveModels,
      hasExternalDevin: false,
      activate: async () => true,
      persist() {},
    });
    const overviewText = overview.response.content[0]?.text ?? "";
    expect(overviewText).toContain("1. anthropic");
    expect(overviewText).toContain("devin");
    expect(overviewText).toContain("Call catalog again with provider=");
    expect(overviewText).not.toContain("devin/swe-2 —");

    const filtered = await executeModelRoute(emptyModelRouteState(), {
      action: "catalog",
      workType: 3,
      provider: "devin",
    }, {
      runtimeName: "OMP",
      models: liveModels,
      hasExternalDevin: false,
      activate: async () => true,
      persist() {},
    });
    const filteredText = filtered.response.content[0]?.text ?? "";
    expect(filteredText).toContain("1. SWE-2 — devin/swe-2");
    expect(filteredText).toContain("devin/claude-opus-4.9");
    expect(filtered.response.isError).toBeUndefined();

    const presentation = formatCatalogPresentation("OMP", catalog, ["B"], "devin");
    expect(presentation.presentation.stages.B?.options.map((item) => item.selector).sort()).toEqual([
      "devin/claude-opus-4.9",
      "devin/swe-2",
    ].sort());
  });

  test("rejects unknown provider filters on catalog", async () => {
    const result = await executeModelRoute(emptyModelRouteState(), {
      action: "catalog",
      workType: 3,
      provider: "missing-provider",
    }, {
      runtimeName: "Pi",
      models,
      hasExternalDevin: false,
      activate: async () => true,
      persist() {},
    });
    expect(result.response.isError).toBe(true);
    expect(result.response.content[0]?.text).toContain("missing-provider");
  });

  test("adds OMP call_id advisory only when cursor and openai-codex are both live", () => {
    const withBoth = buildModelCatalog([
      ...models,
      { provider: "openai-codex", id: "gpt-6-astra", name: "GPT-6 Astra" },
    ], false);
    const ompNotes = formatCatalogPresentation("OMP", withBoth, ["A", "B"]).presentation.notes;
    const piNotes = formatCatalogPresentation("Pi", withBoth, ["A", "B"]).presentation.notes;
    const withoutCodex = formatCatalogPresentation("OMP", buildModelCatalog(models, false), ["A", "B"]).presentation.notes;

    expect(ompNotes.some((note) => note.includes("call_id") && note.includes("18.1.17"))).toBe(true);
    expect(piNotes.some((note) => note.includes("call_id"))).toBe(false);
    expect(withoutCodex.some((note) => note.includes("call_id"))).toBe(false);

    const overviewSelectors = withBoth.B.map((item) => item.selector);
    expect(overviewSelectors).toContain("cursor/composer-2");
    expect(overviewSelectors).toContain("openai-codex/gpt-6-astra");
  });
});
