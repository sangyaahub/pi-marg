import { describe, expect, test } from "bun:test";

import {
  buildModelCatalog,
  emptyModelRouteState,
  executeModelRoute,
  formatCatalogPresentation,
  matchNumberedOption,
  normalizeModelIdentity,
  numberedOptionLabel,
  requiredStagesForWorkType,
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
