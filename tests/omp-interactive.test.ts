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
          return selectFromOptions(title, options, selectedByStage);
        },
        notify() {},
      },
    };

    await command.handler("add CSV export", ctx);

    expect(optionSets.get("Work boundary")).toEqual(["1. Job/client", "2. Personal"]);
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
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("add CSV export");
    expect(messages[0]).toContain("Boundary: Personal");
    expect(messages[0]).toContain("Compound Engineering");
    expect(messages[0]).toContain("devin/swe-2");
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
      message: "No authenticated and enabled OMP models were found. Configure a provider, then run /pi-marg again.",
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
