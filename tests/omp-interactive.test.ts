import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import modelRouter from "../adapters/omp/extensions/model-router";
import { agentDirectory, userRoutePath, writeUserRoute } from "../core/user-route";

process.env.PI_MARG_AGENT_HOME = mkdtempSync(join(tmpdir(), "pi-marg-omp-"));

function schema() {
  return { optional() { return this; } };
}

function fakeZod() {
  return {
    object: (value: unknown) => value,
    enum: (_value: unknown) => schema(),
    string: () => schema(),
    number: () => schema(),
  };
}

function selectFromOptions(
  title: string,
  options: Array<string | { label: string }>,
  selectedByStage: Record<string, string>,
  selectedFallbacks: Record<string, string>,
) {
  const labels = options.map((option) => typeof option === "string" ? option : option.label);
  if (title === "Work boundary") return labels.find((label) => label.includes("Personal"));
  if (title === "Work type") return labels.find((label) => label.startsWith("2."));
  if (title === "Workflow skill") return labels.find((label) => label.startsWith("1."));
  const providerStage = title.match(/Stage ([ABCD]) provider/)?.[1];
  if (providerStage) {
    const provider = selectedByStage[providerStage]!.split("/")[0]!;
    return labels.find((label) => label.includes(`${provider} (`));
  }
  const stage = title.match(/Stage ([ABCD]) model/)?.[1];
  if (stage) return labels.find((label) => label.includes(selectedByStage[stage]!));
  const fallbackProvider = title.match(/(High|Low) backup provider/)?.[1]?.toLowerCase();
  if (fallbackProvider) {
    const provider = selectedFallbacks[fallbackProvider]!.split("/")[0]!;
    return labels.find((label) => label.includes(`${provider} (`));
  }
  const fallbackModel = title.match(/(High|Low) backup model/)?.[1]?.toLowerCase();
  if (fallbackModel) return labels.find((label) => label.includes(selectedFallbacks[fallbackModel]!));
  return undefined;
}

describe("OMP interactive PiMarg command", () => {
  test("collects intake choices and every required model through numbered provider then model selectors", async () => {
    let command: any;
    const entries: Array<{ type: string; data: any }> = [];
    const messages: string[] = [];
    const optionSets = new Map<string, string[]>();
    const models = [
      { provider: "anthropic", id: "claude-opus-4.9", name: "Claude Opus 4.9" },
      { provider: "openai-codex", id: "gpt-astra", name: "GPT Astra" },
      { provider: "anthropic", id: "claude-sonnet-4.8", name: "Claude Sonnet 4.8" },
      { provider: "openai-codex", id: "gpt-terra", name: "GPT Terra" },
      { provider: "cursor", id: "composer-2", name: "Composer 2", cost: { input: 0, output: 0 } },
      { provider: "devin", id: "swe-2", name: "SWE-2" },
      { provider: "devin", id: "claude-opus-4.9", name: "Claude Opus 4.9" },
      { provider: "local", id: "custom-model", name: "Custom Model" },
    ];
    const selectedByStage: Record<string, string> = {
      A: "openai-codex/gpt-astra",
      C: "devin/claude-opus-4.9",
      B: "devin/swe-2",
      D: "cursor/composer-2",
    };
    const selectedFallbacks = {
      high: "anthropic/claude-opus-4.9",
      low: "openai-codex/gpt-terra",
    };

    const pi: any = {
      zod: fakeZod(),
      on() {},
      registerTool() {},
      registerCommand(name: string, definition: any) {
        if (name === "pi-marg") command = definition;
      },
      getAllTools: () => [],
      appendEntry(type: string, data: any) { entries.push({ type, data }); },
      sendUserMessage(message: string) { messages.push(message); },
      setModel: async () => true,
    };
    modelRouter(pi);

    const ctx: any = {
      hasUI: true,
      mode: "tui",
      models: { list: () => models },
      ui: {
        async input() { return undefined; },
        async select(title: string, options: Array<string | { label: string }>) {
          const labels = options.map((option) => typeof option === "string" ? option : option.label);
          optionSets.set(title, labels);
          return selectFromOptions(title, options, selectedByStage, selectedFallbacks);
        },
        notify() {},
      },
    };

    await command.handler("add CSV export", ctx);

    expect(optionSets.get("Work boundary")).toEqual(["1. Job/client", "2. Personal"]);
    expect([...optionSets.keys()].filter((title) => title.startsWith("Stage ") || title.includes(" backup "))).toEqual([
      "Stage A provider", "Stage A model",
      "Stage B provider", "Stage B model",
      "Stage C provider", "Stage C model",
      "Stage D provider", "Stage D model",
      "High backup provider", "High backup model",
      "Low backup provider", "Low backup model",
    ]);
    for (const stage of ["A", "B", "C", "D"]) {
      const providers = optionSets.get(`Stage ${stage} provider`)!;
      expect(providers.every((label, index) => label.startsWith(`${index + 1}. `))).toBe(true);
      expect(providers.some((label) => label.includes("devin ("))).toBe(true);
      expect(providers.some((label) => label.includes("anthropic ("))).toBe(true);
      expect(providers.some((label) => label.includes("cursor ("))).toBe(true);
      expect(providers.some((label) => label.includes("openai-codex ("))).toBe(true);
      expect(providers.some((label) => label.includes("local ("))).toBe(true);

      const modelsForStage = optionSets.get(`Stage ${stage} model`)!;
      expect(modelsForStage.every((label, index) => label.startsWith(`${index + 1}. `))).toBe(true);
    }
    expect(optionSets.get("Stage A model")?.some((label) => label.includes("openai-codex/gpt-astra"))).toBe(true);
    expect(optionSets.get("Stage C model")?.some((label) => label.includes("openai-codex/gpt-astra"))).toBe(false);
    expect(optionSets.get("Stage C model")?.every((label) => label.includes("devin/"))).toBe(true);
    expect(optionSets.get("Stage B model")?.some((label) => label.includes("devin/swe-2"))).toBe(true);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.data.workType).toBe(2);
    expect(entries[0]?.data.selections.A.selector).toBe("openai-codex/gpt-astra");
    expect(entries[0]?.data.selections.C.selector).toBe("devin/claude-opus-4.9");
    expect(entries[0]?.data.selections.B.selector).toBe("devin/swe-2");
    expect(entries[0]?.data.selections.D.selector).toBe("cursor/composer-2");
    expect(entries[0]?.data.fallbacks.high.selector).toBe("anthropic/claude-opus-4.9");
    expect(entries[0]?.data.fallbacks.low.selector).toBe("openai-codex/gpt-terra");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("add CSV export");
    expect(messages[0]).toContain("Boundary: Personal");
    expect(messages[0]).toContain("Compound Engineering");
    expect(messages[0]).toContain("devin/swe-2");
    expect(messages[0]).toContain("High backup: anthropic/claude-opus-4.9");
    expect(messages[0]).toContain("Low backup: openai-codex/gpt-terra");
  });

  test("switches and resumes after OMP settles a usage-limit failure", async () => {
    const handlers = new Map<string, any>();
    const entries: Array<{ type: string; data: any }> = [];
    const messages: Array<{ message: string; options: any }> = [];
    const notifications: Array<{ message: string; level: string }> = [];
    const activations: string[] = [];
    const liveModels = [
      { provider: "devin", id: "swe-2", name: "SWE-2" },
      { provider: "anthropic", id: "claude-opus-4.9", name: "Claude Opus 4.9" },
      { provider: "openai-codex", id: "gpt-terra", name: "GPT Terra" },
    ];
    const selectedAt = "2026-01-01T00:00:00Z";
    const pi: any = {
      zod: fakeZod(),
      on(name: string, handler: any) { handlers.set(name, handler); },
      registerTool() {},
      registerCommand() {},
      getAllTools: () => [],
      appendEntry(type: string, data: any) { entries.push({ type, data }); },
      sendUserMessage(message: string, options: any) { messages.push({ message, options }); },
      async setModel(model: any) { activations.push(`${model.provider}/${model.id}`); return true; },
    };
    modelRouter(pi);

    const ctx: any = {
      hasUI: true,
      models: {
        list: () => liveModels,
        current: () => liveModels[0],
      },
      sessionManager: {
        getBranch: () => [{
          type: "custom",
          customType: "co.sangyaa.pi-marg.model-routing.v1",
          data: {
            version: 2,
            workType: 2,
            activeStage: "B",
            selections: {},
            fallbacks: {
              high: {
                selector: "anthropic/claude-opus-4.9",
                identity: "claude-opus-4.9",
                label: "Claude Opus 4.9",
                provider: "anthropic",
                tier: "frontier",
                choice: "claude-frontier",
                access: "runtime-model",
                selectedAt,
              },
              low: {
                selector: "openai-codex/gpt-terra",
                identity: "gpt-terra",
                label: "GPT Terra",
                provider: "openai-codex",
                tier: "execution",
                choice: "openai-mid",
                access: "runtime-model",
                selectedAt,
              },
            },
          },
        }],
      },
      ui: {
        notify(message: string, level: string) { notifications.push({ message, level }); },
      },
    };
    handlers.get("session_start")({}, ctx);

    await handlers.get("agent_end")({
      willContinue: true,
      messages: [{ role: "assistant", stopReason: "error", errorMessage: "usage limit reached" }],
    }, ctx);
    expect(activations).toEqual([]);

    await handlers.get("agent_end")({
      willContinue: false,
      messages: [{
        role: "assistant",
        stopReason: "error",
        errorMessage: "429 rate_limit_exceeded: weekly usage limit reached",
        provider: "devin",
        model: "swe-2",
      }],
    }, ctx);

    expect(activations).toEqual(["anthropic/claude-opus-4.9"]);
    expect(entries.at(-1)?.data.activeFallback).toBe("high");
    expect(notifications.at(-1)?.message).toContain("High backup");
    expect(messages.at(-1)?.message).toContain("Resume the current Stage B work");
    expect(messages.at(-1)?.options).toEqual({ deliverAs: "aside" });

    await handlers.get("agent_end")({
      willContinue: false,
      messages: [{
        role: "assistant",
        stopReason: "error",
        errorMessage: "quota exhausted",
        provider: "anthropic",
        model: "claude-opus-4.9",
      }],
    }, ctx);
    expect(activations).toEqual(["anthropic/claude-opus-4.9", "openai-codex/gpt-terra"]);
    expect(entries.at(-1)?.data.activeFallback).toBe("low");
    expect(notifications.at(-1)?.message).toContain("Low backup");

    await handlers.get("agent_end")({
      willContinue: false,
      messages: [{
        role: "assistant",
        stopReason: "error",
        errorMessage: "quota exhausted",
        provider: "openai-codex",
        model: "gpt-terra",
      }],
    }, ctx);
    expect(notifications.at(-1)?.message).toContain("no configured backup model remains");

    const entryCount = entries.length;
    const notificationCount = notifications.length;
    await handlers.get("agent_end")({
      willContinue: false,
      messages: [{
        role: "assistant",
        stopReason: "error",
        errorMessage: "quota exhausted",
        provider: "openai-codex",
        model: "gpt-terra",
      }],
    }, ctx);
    expect(entries).toHaveLength(entryCount);
    expect(notifications).toHaveLength(notificationCount);
  });

  test("recovers an external Devin quota error with the saved high backup", async () => {
    const handlers = new Map<string, any>();
    const messages: string[] = [];
    const activations: string[] = [];
    const liveModels = [
      { provider: "anthropic", id: "claude-opus-4.9", name: "Claude Opus 4.9" },
      { provider: "openai-codex", id: "gpt-terra", name: "GPT Terra" },
    ];
    const pi: any = {
      zod: fakeZod(),
      on(name: string, handler: any) { handlers.set(name, handler); },
      registerTool() {},
      registerCommand() {},
      getAllTools: () => [{ name: "mcp__devin_run" }],
      appendEntry() {},
      sendUserMessage(message: string) { messages.push(message); },
      async setModel(model: any) { activations.push(`${model.provider}/${model.id}`); return true; },
    };
    modelRouter(pi);
    const ctx: any = {
      hasUI: true,
      models: { list: () => liveModels, current: () => liveModels[0] },
      sessionManager: {
        getBranch: () => [{
          type: "custom",
          customType: "co.sangyaa.pi-marg.model-routing.v1",
          data: {
            version: 2,
            activeStage: "B",
            selections: {},
            fallbacks: {
              high: {
                selector: "anthropic/claude-opus-4.9",
                identity: "claude-opus-4.9",
                label: "Claude Opus 4.9",
                provider: "anthropic",
                tier: "frontier",
                choice: "claude-frontier",
                access: "runtime-model",
                selectedAt: "2026-01-01T00:00:00Z",
              },
              low: {
                selector: "openai-codex/gpt-terra",
                identity: "gpt-terra",
                label: "GPT Terra",
                provider: "openai-codex",
                tier: "execution",
                choice: "openai-mid",
                access: "runtime-model",
                selectedAt: "2026-01-01T00:00:00Z",
              },
            },
          },
        }],
      },
      ui: { notify() {} },
    };
    handlers.get("session_start")({}, ctx);

    await handlers.get("tool_execution_end")({
      isError: true,
      toolCallId: "devin-call-1",
      toolName: "mcp__devin_run",
      result: { content: [{ type: "text", text: "Devin Agent Compute Units exhausted" }] },
    }, ctx);

    expect(activations).toEqual([]);
    await handlers.get("agent_end")({
      willContinue: false,
      messages: [{ role: "assistant", stopReason: "stop", content: [] }],
    }, ctx);

    expect(activations).toEqual(["anthropic/claude-opus-4.9"]);
    expect(messages.at(-1)).toContain("devin/external-session reached its usage limit");
    expect(messages.at(-1)).toContain("Resume the current Stage B work");

    await handlers.get("tool_execution_end")({
      isError: true,
      toolCallId: "task-call-1",
      toolName: "task",
      result: { content: [{ type: "text", text: "Subagent quota exhausted" }] },
    }, ctx);
    await handlers.get("agent_end")({
      willContinue: false,
      messages: [{ role: "assistant", stopReason: "stop", content: [] }],
    }, ctx);
    expect(activations).toEqual(["anthropic/claude-opus-4.9"]);
    expect(messages.at(-1)).toContain("tool/task reached its usage limit");
    expect(messages.at(-1)).toContain("Kept the active high backup");

    await handlers.get("agent_end")({
      willContinue: false,
      messages: [{
        role: "assistant",
        stopReason: "error",
        errorMessage: "monthly usage limit reached",
        provider: "anthropic",
        model: "claude-opus-4.9",
        responseId: "high-response-1",
      }],
    }, ctx);
    expect(activations).toEqual(["anthropic/claude-opus-4.9", "openai-codex/gpt-terra"]);
  });

  test("resumes on the activated backup and warns when failover state cannot persist", async () => {
    const handlers = new Map<string, any>();
    const notifications: string[] = [];
    const messages: string[] = [];
    const activations: string[] = [];
    const liveModels = [
      { provider: "devin", id: "swe-2", name: "SWE-2" },
      { provider: "anthropic", id: "claude-opus-4.9", name: "Claude Opus 4.9" },
      { provider: "openai-codex", id: "gpt-terra", name: "GPT Terra" },
    ];
    const pi: any = {
      zod: fakeZod(),
      on(name: string, handler: any) { handlers.set(name, handler); },
      registerTool() {},
      registerCommand() {},
      getAllTools: () => [],
      appendEntry() { throw new Error("ledger unavailable"); },
      sendUserMessage(message: string) { messages.push(message); },
      async setModel(model: any) { activations.push(`${model.provider}/${model.id}`); return true; },
    };
    modelRouter(pi);
    const ctx: any = {
      models: { list: () => liveModels, current: () => liveModels[0] },
      sessionManager: {
        getBranch: () => [{
          type: "custom",
          customType: "co.sangyaa.pi-marg.model-routing.v1",
          data: {
            version: 2,
            activeStage: "B",
            selections: {},
            fallbacks: {
              high: {
                selector: "anthropic/claude-opus-4.9", identity: "claude-opus-4.9",
                label: "Claude Opus 4.9", provider: "anthropic", tier: "frontier",
                choice: "claude-frontier", access: "runtime-model", selectedAt: "2026-01-01T00:00:00Z",
              },
              low: {
                selector: "openai-codex/gpt-terra", identity: "gpt-terra",
                label: "GPT Terra", provider: "openai-codex", tier: "execution",
                choice: "openai-mid", access: "runtime-model", selectedAt: "2026-01-01T00:00:00Z",
              },
            },
          },
        }],
      },
      ui: { notify(message: string) { notifications.push(message); } },
    };
    handlers.get("session_start")({}, ctx);

    await handlers.get("agent_end")({
      messages: [{
        role: "assistant", stopReason: "error", errorMessage: "quota exhausted",
        provider: "devin", model: "swe-2", responseId: "persist-failure-1",
      }],
    }, ctx);

    expect(activations).toEqual(["anthropic/claude-opus-4.9"]);
    expect(messages.at(-1)).toContain("Resume the current Stage B work");
    expect(notifications.some((message) => message.includes("could not save"))).toBe(true);
  });

  test("cancels at provider step without persisting partial model state", async () => {
    let command: any;
    const entries: Array<{ type: string; data: any }> = [];
    const messages: string[] = [];
    const selectedTitles: string[] = [];
    const models = [
      { provider: "anthropic", id: "claude-opus-4.9", name: "Claude Opus 4.9" },
      { provider: "openai-codex", id: "gpt-astra", name: "GPT Astra" },
    ];
    const pi: any = {
      zod: fakeZod(),
      on() {},
      registerTool() {},
      registerCommand(name: string, definition: any) {
        if (name === "pi-marg") command = definition;
      },
      getAllTools: () => [],
      appendEntry(type: string, data: any) { entries.push({ type, data }); },
      sendUserMessage(message: string) { messages.push(message); },
      setModel: async () => true,
    };
    modelRouter(pi);

    await command.handler("cancel provider pick", {
      hasUI: true,
      models: { list: () => models },
      ui: {
        async input() { return undefined; },
        async select(title: string, options: Array<string | { label: string }>) {
          selectedTitles.push(title);
          const labels = options.map((option) => typeof option === "string" ? option : option.label);
          if (title === "Work boundary") return labels[1];
          if (title === "Work type") return labels.find((label) => label.startsWith("2."));
          if (title === "Workflow skill") return labels[0];
          if (title === "Stage A provider") return undefined;
          return labels[0];
        },
        notify() {},
      },
    });

    expect(selectedTitles).toEqual([
      "Work boundary",
      "Work type",
      "Workflow skill",
      "Stage A provider",
    ]);
    expect(entries).toHaveLength(0);
    expect(messages).toHaveLength(0);
  });

  test("cancels at model step without persisting partial model state", async () => {
    let command: any;
    const entries: Array<{ type: string; data: any }> = [];
    const messages: string[] = [];
    const selectedTitles: string[] = [];
    const notifications: Array<{ message: string; level: string }> = [];
    const models = [
      { provider: "anthropic", id: "claude-opus-4.9", name: "Claude Opus 4.9" },
      { provider: "openai-codex", id: "gpt-astra", name: "GPT Astra" },
    ];
    const pi: any = {
      zod: fakeZod(),
      on() {},
      registerTool() {},
      registerCommand(name: string, definition: any) {
        if (name === "pi-marg") command = definition;
      },
      getAllTools: () => [],
      appendEntry(type: string, data: any) { entries.push({ type, data }); },
      sendUserMessage(message: string) { messages.push(message); },
      setModel: async () => true,
    };
    modelRouter(pi);

    await command.handler("cancel model pick", {
      hasUI: true,
      models: { list: () => models },
      ui: {
        async input() { return undefined; },
        async select(title: string, options: Array<string | { label: string }>) {
          selectedTitles.push(title);
          const labels = options.map((option) => typeof option === "string" ? option : option.label);
          if (title === "Work boundary") return labels[1];
          if (title === "Work type") return labels.find((label) => label.startsWith("2."));
          if (title === "Workflow skill") return labels[0];
          if (title === "Stage A provider") return labels.find((label) => label.includes("anthropic ("));
          if (title === "Stage A model") return undefined;
          return labels[0];
        },
        notify(message: string, level: string) { notifications.push({ message, level }); },
      },
    });

    expect(selectedTitles).toEqual([
      "Work boundary",
      "Work type",
      "Workflow skill",
      "Stage A provider",
      "Stage A model",
    ]);
    expect(notifications).toEqual([{
      message: "Selection cancelled; no model was saved.",
      level: "warning",
    }]);
    expect(entries).toHaveLength(0);
    expect(messages).toHaveLength(0);
  });

  test("stops before a paired-stage selector when aliases share one model identity", async () => {
    let command: any;
    const entries: Array<{ type: string; data: any }> = [];
    const messages: string[] = [];
    const notifications: Array<{ message: string; level: string }> = [];
    const selectedTitles: string[] = [];
    const models = [
      { provider: "anthropic", id: "claude-opus-4.9", name: "Claude Opus 4.9" },
      { provider: "gateway", id: "claude-opus-4.9-latest", name: "Claude Opus 4.9 alias" },
    ];
    const pi: any = {
      zod: fakeZod(),
      on() {},
      registerTool() {},
      registerCommand(name: string, definition: any) {
        if (name === "pi-marg") command = definition;
      },
      getAllTools: () => [],
      appendEntry(type: string, data: any) { entries.push({ type, data }); },
      sendUserMessage(message: string) { messages.push(message); },
      setModel: async () => true,
    };
    modelRouter(pi);

    await command.handler("review the architecture", {
      hasUI: true,
      models: { list: () => models },
      ui: {
        async input() { return undefined; },
        async select(title: string, options: Array<string | { label: string }>) {
          selectedTitles.push(title);
          const labels = options.map((option) => typeof option === "string" ? option : option.label);
          if (title === "Work boundary") return labels[0];
          if (title === "Work type") return labels.find((label) => label.startsWith("1."));
          if (title === "Workflow skill") return labels[0];
          if (title === "Stage A provider") return labels[0];
          if (title === "Stage A model") return labels[0];
          return undefined;
        },
        notify(message: string, level: string) { notifications.push({ message, level }); },
      },
    });

    expect(selectedTitles).toContain("Stage A model");
    expect(selectedTitles).not.toContain("Stage C model");
    expect(selectedTitles).not.toContain("Stage C provider");
    expect(notifications).toEqual([{
      message: "Paired stages require two distinct authenticated model identities. Configure another model, then run /pi-marg again.",
      level: "error",
    }]);
    expect(entries).toHaveLength(0);
    expect(messages).toHaveLength(0);
  });

  test("forwards a headless prompt once without persisting interactive state", async () => {
    let command: any;
    const entries: Array<{ type: string; data: any }> = [];
    const messages: string[] = [];
    const pi: any = {
      zod: fakeZod(),
      on() {},
      registerTool() {},
      registerCommand(name: string, definition: any) {
        if (name === "pi-marg") command = definition;
      },
      getAllTools: () => [],
      appendEntry(type: string, data: any) { entries.push({ type, data }); },
      sendUserMessage(message: string) { messages.push(message); },
      setModel: async () => true,
    };
    modelRouter(pi);

    await command.handler("start audit log cleanup", {
      hasUI: false,
      ui: { notify() {} },
    });

    expect(messages).toEqual(["Start PiMarg for this request:\nstart audit log cleanup"]);
    expect(entries).toHaveLength(0);
  });

  test("offers sign-in, a custom provider, or cancel when no models are available", async () => {
    let command: any;
    const entries: Array<{ type: string; data: any }> = [];
    const messages: string[] = [];
    let setupOptions: string[] = [];
    const pi: any = {
      zod: fakeZod(),
      on() {},
      registerTool() {},
      registerCommand(name: string, definition: any) {
        if (name === "pi-marg") command = definition;
      },
      getAllTools: () => [],
      appendEntry(type: string, data: any) { entries.push({ type, data }); },
      sendUserMessage(message: string) { messages.push(message); },
      setModel: async () => true,
    };
    modelRouter(pi);

    await command.handler("add CSV export", {
      hasUI: true,
      agentHome: mkdtempSync(join(tmpdir(), "pi-marg-empty-")),
      models: { list: () => [] },
      ui: {
        async input() { return undefined; },
        async select(title: string, options: Array<string | { label: string }>) {
          const labels = options.map((option) => typeof option === "string" ? option : option.label);
          if (title === "Work boundary") return labels[0];
          if (title === "Work type") return labels.find((option) => option.startsWith("2."));
          if (title === "Workflow skill") return labels[0];
          if (title === "Model setup") {
            setupOptions = labels;
            return labels.find((option) => option.includes("Cancel"));
          }
          return undefined;
        },
        notify() {},
      },
    });

    expect(setupOptions.some((label) => label.includes("Sign in"))).toBe(true);
    expect(setupOptions.some((label) => label.includes("custom OpenAI-compatible"))).toBe(true);
    expect(setupOptions.some((label) => label.includes("Cancel"))).toBe(true);
    expect(entries).toHaveLength(0);
    expect(messages).toHaveLength(0);
  });

  test("asks for a prompt when started without one and cancels without partial state", async () => {
    let command: any;
    let appended = false;
    let sent = false;
    const pi: any = {
      zod: fakeZod(),
      on() {},
      registerTool() {},
      registerCommand(name: string, definition: any) {
        if (name === "pi-marg") command = definition;
      },
      getAllTools: () => [],
      appendEntry() { appended = true; },
      sendUserMessage() { sent = true; },
      setModel: async () => true,
    };
    modelRouter(pi);

    await command.handler("start", {
      hasUI: true,
      mode: "tui",
      models: { list: () => [] },
      ui: {
        async input() { return undefined; },
        async select() { return undefined; },
        notify() {},
      },
    });

    expect(appended).toBe(false);
    expect(sent).toBe(false);
  });

  test("rejects intake during an active turn before opening dialogs or mutating state", async () => {
    let command: any;
    const entries: Array<{ type: string; data: any }> = [];
    const messages: string[] = [];
    const notifications: Array<{ message: string; level: string }> = [];
    let dialogCalls = 0;
    let modelListCalls = 0;
    const pi: any = {
      zod: fakeZod(),
      on() {},
      registerTool() {},
      registerCommand(name: string, definition: any) {
        if (name === "pi-marg") command = definition;
      },
      getAllTools: () => [],
      appendEntry(type: string, data: any) { entries.push({ type, data }); },
      sendUserMessage(message: string) { messages.push(message); },
      setModel: async () => true,
    };
    modelRouter(pi);

    await command.handler("start add CSV export", {
      hasUI: true,
      isIdle: () => false,
      models: { list() { modelListCalls += 1; return []; } },
      ui: {
        async input() { dialogCalls += 1; return undefined; },
        async select() { dialogCalls += 1; return undefined; },
        notify(message: string, level: string) { notifications.push({ message, level }); },
      },
    });

    expect(dialogCalls).toBe(0);
    expect(modelListCalls).toBe(0);
    expect(entries).toHaveLength(0);
    expect(messages).toHaveLength(0);
    expect(notifications).toEqual([{
      message: "PiMarg intake can start after the current turn finishes.",
      level: "warning",
    }]);
  });

  test("highlights the saved row, accepts its raw label, and activates stage A before the user message", async () => {
    let command: any;
    const entries: Array<{ type: string; data: any }> = [];
    const events: string[] = [];
    const selectCalls: Array<{ title: string; initialIndex?: number; helpText?: string }> = [];
    const handlers = new Map<string, any>();
    const models = [
      { provider: "anthropic", id: "claude-opus-4.9", name: "Claude Opus 4.9" },
      { provider: "openai-codex", id: "gpt-astra-9", name: "GPT Astra 9" },
      { provider: "openai-codex", id: "gpt-astra", name: "GPT Astra" },
      { provider: "anthropic", id: "claude-sonnet-4.8", name: "Claude Sonnet 4.8" },
      { provider: "openai-codex", id: "gpt-terra", name: "GPT Terra" },
    ];
    const saved = {
      A: "openai-codex/gpt-astra",
      C: "anthropic/claude-opus-4.9",
      B: "openai-codex/gpt-terra",
      D: "anthropic/claude-sonnet-4.8",
    };
    const pi: any = {
      zod: fakeZod(),
      on(name: string, handler: any) { handlers.set(name, handler); },
      registerTool() {},
      registerCommand(name: string, definition: any) {
        if (name === "pi-marg") command = definition;
      },
      getAllTools: () => [],
      appendEntry(type: string, data: any) { entries.push({ type, data }); },
      sendUserMessage() { events.push("message"); },
      async setModel(model: any) { events.push(`set:${model.provider}/${model.id}`); return true; },
    };
    modelRouter(pi);
    handlers.get("session_start")?.({}, {
      sessionManager: {
        getBranch: () => [{
          type: "custom",
          customType: "co.sangyaa.pi-marg.model-routing.v1",
          data: {
            version: 2,
            workType: 2,
            boundary: "Personal",
            skillMode: "1. Compound Engineering",
            selections: {
              A: savedSelection("openai-codex/gpt-astra", "GPT Astra", "openai-codex", "gpt-astra", "frontier", "openai-frontier"),
              C: savedSelection("anthropic/claude-opus-4.9", "Claude Opus 4.9", "anthropic", "claude-opus-4.9", "frontier", "claude-frontier"),
              B: savedSelection("openai-codex/gpt-terra", "GPT Terra", "openai-codex", "gpt-terra", "execution", "openai-mid"),
              D: savedSelection("anthropic/claude-sonnet-4.8", "Claude Sonnet 4.8", "anthropic", "claude-sonnet-4.8", "execution", "claude-mid"),
            },
            fallbacks: {
              high: savedSelection("anthropic/claude-opus-4.9", "Claude Opus 4.9", "anthropic", "claude-opus-4.9", "frontier", "claude-frontier"),
              low: savedSelection("openai-codex/gpt-terra", "GPT Terra", "openai-codex", "gpt-terra", "execution", "openai-mid"),
            },
          },
        }],
      },
    });

    await command.handler("reopen saved route", {
      hasUI: true,
      models: { list: () => models },
      ui: {
        async input() { return undefined; },
        async select(title: string, options: Array<string | { label: string }>, settings?: { initialIndex?: number; helpText?: string }) {
          const labels = options.map((option) => typeof option === "string" ? option : option.label);
          selectCalls.push({ title, initialIndex: settings?.initialIndex, helpText: settings?.helpText });
          if (title === "Stage A model") return "GPT Astra — openai-codex/gpt-astra";
          return selectFromOptions(title, options, saved, {
            high: "anthropic/claude-opus-4.9",
            low: "openai-codex/gpt-terra",
          }) ?? labels[0];
        },
        notify() {},
      },
    });

    const provider = selectCalls.find((call) => call.title === "Stage A provider");
    const model = selectCalls.find((call) => call.title === "Stage A model");
    const boundary = selectCalls.find((call) => call.title === "Work boundary");
    expect(provider?.initialIndex).toBeGreaterThan(0);
    expect(model?.initialIndex).toBeGreaterThan(0);
    expect(model?.helpText).toContain("openai-codex/gpt-astra");
    expect(boundary?.initialIndex).toBe(1);
    expect(entries[0]?.data.selections.A.selector).toBe("openai-codex/gpt-astra");
    expect(events.indexOf("set:openai-codex/gpt-astra")).toBeGreaterThanOrEqual(0);
    expect(events.indexOf("message")).toBeGreaterThan(events.indexOf("set:openai-codex/gpt-astra"));
  });

  test("pressing enter on the highlighted row keeps the saved selector", async () => {
    let command: any;
    const entries: Array<{ type: string; data: any }> = [];
    const handlers = new Map<string, any>();
    const models = [
      { provider: "anthropic", id: "claude-opus-4.9", name: "Claude Opus 4.9" },
      { provider: "openai-codex", id: "gpt-astra-9", name: "GPT Astra 9" },
      { provider: "openai-codex", id: "gpt-astra", name: "GPT Astra" },
      { provider: "anthropic", id: "claude-sonnet-4.8", name: "Claude Sonnet 4.8" },
      { provider: "openai-codex", id: "gpt-terra", name: "GPT Terra" },
    ];
    const pi: any = {
      zod: fakeZod(),
      on(name: string, handler: any) { handlers.set(name, handler); },
      registerTool() {},
      registerCommand(name: string, definition: any) {
        if (name === "pi-marg") command = definition;
      },
      getAllTools: () => [],
      appendEntry(type: string, data: any) { entries.push({ type, data }); },
      sendUserMessage() {},
      setModel: async () => true,
    };
    modelRouter(pi);
    handlers.get("session_start")?.({}, {
      sessionManager: {
        getBranch: () => [{
          type: "custom",
          customType: "co.sangyaa.pi-marg.model-routing.v1",
          data: {
            version: 2,
            workType: 2,
            boundary: "Personal",
            skillMode: "1. Compound Engineering",
            selections: {
              A: savedSelection("openai-codex/gpt-astra", "GPT Astra", "openai-codex", "gpt-astra", "frontier", "openai-frontier"),
            },
            fallbacks: {},
          },
        }],
      },
    });

    await command.handler("keep saved", {
      hasUI: true,
      models: { list: () => models },
      ui: {
        async input() { return undefined; },
        async select(_title: string, options: Array<string | { label: string }>, settings?: { initialIndex?: number }) {
          const labels = options.map((option) => typeof option === "string" ? option : option.label);
          const index = typeof settings?.initialIndex === "number" ? settings.initialIndex : 0;
          return labels[index];
        },
        notify() {},
      },
    });

    expect(entries[0]?.data.selections.A.selector).toBe("openai-codex/gpt-astra");
  });

  test("does not persist an unrecognized select answer", async () => {
    let command: any;
    const entries: Array<{ type: string; data: any }> = [];
    const notifications: Array<{ message: string; level: string }> = [];
    const pi: any = {
      zod: fakeZod(),
      on() {},
      registerTool() {},
      registerCommand(name: string, definition: any) {
        if (name === "pi-marg") command = definition;
      },
      getAllTools: () => [],
      appendEntry(type: string, data: any) { entries.push({ type, data }); },
      sendUserMessage() {},
      setModel: async () => true,
    };
    modelRouter(pi);

    await command.handler("bad answer", {
      hasUI: true,
      models: {
        list: () => [
          { provider: "openai-codex", id: "gpt-astra", name: "GPT Astra" },
          { provider: "anthropic", id: "claude-opus-4.9", name: "Claude Opus 4.9" },
        ],
      },
      ui: {
        async input() { return undefined; },
        async select(title: string, options: Array<string | { label: string }>) {
          const labels = options.map((option) => typeof option === "string" ? option : option.label);
          if (title === "Work boundary") return labels[1];
          if (title === "Work type") return labels.find((label) => label.startsWith("1."));
          if (title === "Workflow skill") return labels[0];
          if (title === "Stage A provider") return labels[0];
          if (title === "Stage A model") return "definitely-not-a-model";
          return labels[0];
        },
        notify(message: string, level: string) { notifications.push({ message, level }); },
      },
    });

    expect(entries).toHaveLength(0);
    expect(notifications).toEqual([{
      message: 'Unrecognized selection "definitely-not-a-model"; no model was saved.',
      level: "error",
    }]);
  });

  test("keeps the previous session entry when activation fails", async () => {
    let command: any;
    let tool: any;
    const entries: Array<{ type: string; data: any }> = [];
    const notifications: Array<{ message: string; level: string }> = [];
    const handlers = new Map<string, any>();
    const previous = savedSelection("anthropic/claude-opus-4.9", "Claude Opus 4.9", "anthropic", "claude-opus-4.9", "frontier", "claude-frontier");
    const models = [
      { provider: "anthropic", id: "claude-opus-4.9", name: "Claude Opus 4.9" },
      { provider: "openai-codex", id: "gpt-astra", name: "GPT Astra" },
      { provider: "anthropic", id: "claude-sonnet-4.8", name: "Claude Sonnet 4.8" },
      { provider: "openai-codex", id: "gpt-terra", name: "GPT Terra" },
    ];
    const pi: any = {
      zod: fakeZod(),
      on(name: string, handler: any) { handlers.set(name, handler); },
      registerTool(definition: any) { tool = definition; },
      registerCommand(name: string, definition: any) {
        if (name === "pi-marg") command = definition;
      },
      getAllTools: () => [],
      appendEntry(type: string, data: any) { entries.push({ type, data }); },
      sendUserMessage() {},
      setModel: async () => false,
    };
    modelRouter(pi);
    const branch = [{
      type: "custom",
      customType: "co.sangyaa.pi-marg.model-routing.v1",
      data: {
        version: 2,
        workType: 1,
        selections: { A: previous },
        fallbacks: {},
      },
    }];
    handlers.get("session_start")?.({}, { sessionManager: { getBranch: () => branch } });

    await command.handler("replace saved", {
      hasUI: true,
      models: { list: () => models },
      ui: {
        async input() { return undefined; },
        async select(title: string, options: Array<string | { label: string }>) {
          return selectFromOptions(title, options, {
            A: "openai-codex/gpt-astra",
            C: "anthropic/claude-opus-4.9",
            B: "openai-codex/gpt-terra",
            D: "anthropic/claude-sonnet-4.8",
          }, {
            high: "anthropic/claude-opus-4.9",
            low: "openai-codex/gpt-terra",
          });
        },
        notify(message: string, level: string) { notifications.push({ message, level }); },
      },
    });

    const status = await tool.execute("1", { action: "status" }, undefined, undefined, {
      models: { list: () => models },
    });
    expect(entries).toHaveLength(0);
    expect(notifications.some((notice) => notice.message.includes("openai-codex"))).toBe(true);
    expect(status.content[0].text).toContain("anthropic/claude-opus-4.9");
    expect(status.content[0].text).not.toContain('"selector": "openai-codex/gpt-astra"');
  });

  test("loads a user route when the new process has an empty session branch", async () => {
    let command: any;
    const handlers = new Map<string, any>();
    const selectCalls: Array<{ title: string; initialIndex?: number }> = [];
    const home = mkdtempSync(join(tmpdir(), "pi-marg-user-route-"));
    writeUserRoute(userRoutePath("OMP", home), {
      version: 2,
      workType: 2,
      boundary: "Personal",
      skillMode: "1. Compound Engineering",
      selections: {
        A: savedSelection("openai-codex/gpt-astra", "GPT Astra", "openai-codex", "gpt-astra", "frontier", "openai-frontier"),
      },
      fallbacks: {},
    });
    const pi: any = {
      zod: fakeZod(),
      on(name: string, handler: any) { handlers.set(name, handler); },
      registerTool() {},
      registerCommand(name: string, definition: any) {
        if (name === "pi-marg") command = definition;
      },
      getAllTools: () => [],
      appendEntry() {},
      sendUserMessage() {},
      setModel: async () => true,
    };
    modelRouter(pi);
    handlers.get("session_start")?.({}, {
      agentHome: home,
      sessionManager: { getBranch: () => [] },
    });

    await command.handler("resume", {
      hasUI: true,
      agentHome: home,
      models: {
        list: () => [
          { provider: "anthropic", id: "claude-opus-4.9", name: "Claude Opus 4.9" },
          { provider: "openai-codex", id: "gpt-astra-9", name: "GPT Astra 9" },
          { provider: "openai-codex", id: "gpt-astra", name: "GPT Astra" },
        ],
      },
      ui: {
        async input() { return undefined; },
        async select(title: string, options: Array<string | { label: string }>, settings?: { initialIndex?: number }) {
          const labels = options.map((option) => typeof option === "string" ? option : option.label);
          selectCalls.push({ title, initialIndex: settings?.initialIndex });
          if (title === "Stage B provider") return undefined;
          const index = typeof settings?.initialIndex === "number" ? settings.initialIndex : 0;
          return labels[index];
        },
        notify() {},
      },
    });

    expect(selectCalls.find((call) => call.title === "Stage A provider")?.initialIndex).toBeGreaterThan(0);
    expect(selectCalls.find((call) => call.title === "Stage A model")?.initialIndex).toBeGreaterThan(0);
  });

  test("starts from an empty route when the user file is corrupt", async () => {
    let command: any;
    const handlers = new Map<string, any>();
    const home = mkdtempSync(join(tmpdir(), "pi-marg-corrupt-route-"));
    writeUserRoute(userRoutePath("OMP", home), { version: 2, selections: {}, fallbacks: {} });
    writeFileSync(userRoutePath("OMP", home), "{not json");
    const pi: any = {
      zod: fakeZod(),
      on(name: string, handler: any) { handlers.set(name, handler); },
      registerTool() {},
      registerCommand(name: string, definition: any) {
        if (name === "pi-marg") command = definition;
      },
      getAllTools: () => [],
      appendEntry() {},
      sendUserMessage() {},
      setModel: async () => true,
    };
    modelRouter(pi);
    expect(() => handlers.get("session_start")?.({}, {
      agentHome: home,
      sessionManager: { getBranch: () => [] },
    })).not.toThrow();

    const selectCalls: Array<{ title: string; initialIndex?: number }> = [];
    await command.handler("fresh", {
      hasUI: true,
      agentHome: home,
      models: {
        list: () => [
          { provider: "anthropic", id: "claude-opus-4.9", name: "Claude Opus 4.9" },
          { provider: "openai-codex", id: "gpt-astra", name: "GPT Astra" },
        ],
      },
      ui: {
        async input() { return undefined; },
        async select(title: string, _options: unknown, settings?: { initialIndex?: number }) {
          selectCalls.push({ title, initialIndex: settings?.initialIndex });
          return undefined;
        },
        notify() {},
      },
    });

    expect(selectCalls.find((call) => call.title === "Work boundary")?.initialIndex).toBeUndefined();
  });

  test("reports a saved model removed from the catalog and does not activate it", async () => {
    let command: any;
    const handlers = new Map<string, any>();
    const notifications: Array<{ message: string; level: string }> = [];
    const activations: string[] = [];
    const home = mkdtempSync(join(tmpdir(), "pi-marg-missing-route-"));
    writeUserRoute(userRoutePath("OMP", home), {
      version: 2,
      workType: 1,
      selections: {
        A: savedSelection("missing/gone-model", "Gone", "missing", "gone-model", "frontier", "runtime-available"),
      },
      fallbacks: {},
    });
    const pi: any = {
      zod: fakeZod(),
      on(name: string, handler: any) { handlers.set(name, handler); },
      registerTool() {},
      registerCommand(name: string, definition: any) {
        if (name === "pi-marg") command = definition;
      },
      getAllTools: () => [],
      appendEntry() {},
      sendUserMessage() {},
      async setModel(model: any) { activations.push(`${model.provider}/${model.id}`); return true; },
    };
    modelRouter(pi);
    handlers.get("session_start")?.({}, {
      agentHome: home,
      sessionManager: { getBranch: () => [] },
    });

    await command.handler("missing model", {
      hasUI: true,
      agentHome: home,
      models: {
        list: () => [
          { provider: "openai-codex", id: "gpt-astra", name: "GPT Astra" },
          { provider: "anthropic", id: "claude-opus-4.9", name: "Claude Opus 4.9" },
        ],
      },
      ui: {
        async input() { return undefined; },
        async select(title: string, options: Array<string | { label: string }>, settings?: { initialIndex?: number }) {
          if (title.startsWith("Stage ") || title.includes("backup")) return undefined;
          const labels = options.map((option) => typeof option === "string" ? option : option.label);
          const index = typeof settings?.initialIndex === "number" ? settings.initialIndex : 0;
          return labels[index];
        },
        notify(message: string, level: string) { notifications.push({ message, level }); },
      },
    });

    expect(notifications.some((notice) => notice.message.includes("missing/gone-model") && notice.message.includes("missing"))).toBe(true);
    expect(activations).not.toContain("missing/gone-model");
  });

  test("adds a custom provider and then lists both of its models", async () => {
    let command: any;
    const entries: Array<{ type: string; data: any }> = [];
    const home = mkdtempSync(join(tmpdir(), "pi-marg-custom-"));
    const seen = new Set<string>();
    let models: Array<{ provider: string; id: string; name: string }> = [];
    const answers = [
      "example-gateway",
      "Example Gateway",
      "https://example.test/v1",
      "EXAMPLE_GATEWAY_API_KEY",
      "model-a, model-b",
      "super-secret-value",
    ];
    let answerIndex = 0;
    const pi: any = {
      zod: fakeZod(),
      on() {},
      registerTool() {},
      registerCommand(name: string, definition: any) {
        if (name === "pi-marg") command = definition;
      },
      getAllTools: () => [],
      appendEntry(type: string, data: any) { entries.push({ type, data }); },
      sendUserMessage() {},
      setModel: async () => true,
    };
    modelRouter(pi);

    await command.handler("add gateway", {
      hasUI: true,
      agentHome: home,
      models: {
        list: () => models,
        async reload() {
          models = [
            { provider: "example-gateway", id: "model-a", name: "Model A" },
            { provider: "example-gateway", id: "model-b", name: "Model B" },
          ];
        },
      },
      ui: {
        async input() { return answers[answerIndex++]; },
        async select(title: string, options: Array<string | { label: string }>) {
          const labels = options.map((option) => typeof option === "string" ? option : option.label);
          if (title === "Work boundary") return labels[0];
          if (title === "Work type") return labels.find((label) => label.startsWith("1."));
          if (title === "Workflow skill") return labels[0];
          if (title === "Model setup") return labels.find((label) => label.includes("custom OpenAI-compatible"));
          if (title === "Stage A provider") return labels[0];
          if (title === "Stage A model") {
            for (const label of labels) seen.add(label);
            return undefined;
          }
          return labels[0];
        },
        notify() {},
      },
    });

    const yaml = readFileSync(join(agentDirectory("OMP", home), "models.yml"), "utf8");
    expect(yaml).toContain("apiKey: EXAMPLE_GATEWAY_API_KEY");
    expect(yaml).not.toContain("super-secret-value");
    expect([...seen].some((label) => label.includes("example-gateway/model-a"))).toBe(true);
    expect([...seen].some((label) => label.includes("example-gateway/model-b"))).toBe(true);
    expect(entries).toHaveLength(0);
  });

  test("warns about the distinct-model rule before stage C when only one model exists", async () => {
    let command: any;
    const entries: Array<{ type: string; data: any }> = [];
    const notifications: string[] = [];
    const titles: string[] = [];
    const pi: any = {
      zod: fakeZod(),
      on() {},
      registerTool() {},
      registerCommand(name: string, definition: any) {
        if (name === "pi-marg") command = definition;
      },
      getAllTools: () => [],
      appendEntry(type: string, data: any) { entries.push({ type, data }); },
      sendUserMessage() {},
      setModel: async () => true,
    };
    modelRouter(pi);

    await command.handler("one model", {
      hasUI: true,
      agentHome: mkdtempSync(join(tmpdir(), "pi-marg-one-")),
      models: {
        list: () => [{ provider: "example-gateway", id: "model-a", name: "Model A" }],
      },
      ui: {
        async input() { return undefined; },
        async select(title: string, options: Array<string | { label: string }>) {
          titles.push(title);
          const labels = options.map((option) => typeof option === "string" ? option : option.label);
          if (title === "Work boundary") return labels[0];
          if (title === "Work type") return labels.find((label) => label.startsWith("1."));
          if (title === "Workflow skill") return labels[0];
          if (title === "Distinct models") return labels.find((label) => label.includes("stop before the paired stage"));
          if (title === "Stage A provider" || title === "Stage A model") return labels[0];
          return undefined;
        },
        notify(message: string) { notifications.push(message); },
      },
    });

    const distinctAt = titles.indexOf("Distinct models");
    const stageCAt = titles.indexOf("Stage C provider");
    expect(distinctAt).toBeGreaterThan(-1);
    expect(stageCAt).toBe(-1);
    expect(distinctAt).toBeLessThan(titles.indexOf("Stage C model") === -1 ? titles.length : titles.indexOf("Stage C model"));
    expect(notifications.some((message) => /different model/i.test(message))).toBe(true);
    expect(entries).toHaveLength(0);
  });
});

function savedSelection(
  selector: string,
  label: string,
  provider: string,
  identity: string,
  tier: string,
  choice: string,
) {
  return {
    selector,
    identity,
    label,
    provider,
    tier,
    choice,
    access: "runtime-model",
    selectedAt: "2026-01-01T00:00:00.000Z",
  };
}
