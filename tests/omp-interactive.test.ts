import { describe, expect, test } from "bun:test";

import modelRouter from "../adapters/omp/extensions/model-router";

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
        notify() {},
      },
    });

    expect(selectedTitles).toEqual([
      "Work boundary",
      "Work type",
      "Workflow skill",
      "Stage A provider",
      "Stage A model",
    ]);
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

  test("reports an actionable error after intake when no models are available", async () => {
    let command: any;
    const entries: Array<{ type: string; data: any }> = [];
    const messages: string[] = [];
    const notifications: Array<{ message: string; level: string }> = [];
    const selectedTitles: string[] = [];
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
      models: { list: () => [] },
      ui: {
        async input() { return undefined; },
        async select(title: string, options: string[]) {
          selectedTitles.push(title);
          if (title === "Work boundary") return options[0];
          if (title === "Work type") return options.find((option) => option.startsWith("2."));
          if (title === "Workflow skill") return options[0];
          return undefined;
        },
        notify(message: string, level: string) { notifications.push({ message, level }); },
      },
    });

    expect(selectedTitles).toEqual(["Work boundary", "Work type", "Workflow skill"]);
    expect(notifications).toEqual([{
      message: "No authenticated and enabled OMP models were found. Set up any provider subscription with /login, verify with `omp models` or /model, then run /pi-marg again. PiMarg picks up whatever models you configure in OMP; see MODEL-SETUP.md.",
      level: "error",
    }]);
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
});
