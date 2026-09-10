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

describe("OMP interactive PiMarg command", () => {
  test("collects intake choices and every required model through native selectors", async () => {
    let command: any;
    const entries: Array<{ type: string; data: any }> = [];
    const messages: string[] = [];
    const optionSets = new Map<string, string[]>();
    const models = [
      { provider: "anthropic", id: "claude-opus-4.9", name: "Claude Opus 4.9" },
      { provider: "openai-codex", id: "gpt-astra", name: "GPT Astra" },
      { provider: "anthropic", id: "claude-sonnet-4.8", name: "Claude Sonnet 4.8" },
      { provider: "openai-codex", id: "gpt-terra", name: "GPT Terra" },
      { provider: "local", id: "custom-model", name: "Custom Model" },
    ];
    const selectedByStage: Record<string, string> = {
      A: "openai-codex/gpt-astra",
      C: "anthropic/claude-opus-4.9",
      B: "openai-codex/gpt-terra",
      D: "anthropic/claude-sonnet-4.8",
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
          if (title === "Work boundary") return labels.find((label) => label.startsWith("Personal"));
          if (title === "Work type") return labels.find((label) => label.startsWith("2."));
          if (title === "Workflow skill") return labels.find((label) => label.startsWith("1."));
          const stage = title.match(/Stage ([ABCD])/)?.[1];
          if (stage) return labels.find((label) => label.includes(selectedByStage[stage]!));
          return undefined;
        },
        notify() {},
      },
    };

    await command.handler("add CSV export", ctx);

    for (const stage of ["A", "B", "C", "D"]) {
      const labels = optionSets.get(`Stage ${stage} model`)!;
      expect(labels.some((label) => label.includes("local/custom-model"))).toBe(true);
    }
    expect(optionSets.get("Stage C model")?.some((label) => label.includes("openai-codex/gpt-astra"))).toBe(false);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.data.workType).toBe(2);
    expect(entries[0]?.data.selections.A.selector).toBe("openai-codex/gpt-astra");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("add CSV export");
    expect(messages[0]).toContain("Personal");
    expect(messages[0]).toContain("Compound Engineering");
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
          if (title === "Stage A model") return labels[0];
          return undefined;
        },
        notify(message: string, level: string) { notifications.push({ message, level }); },
      },
    });

    expect(selectedTitles).toContain("Stage A model");
    expect(selectedTitles).not.toContain("Stage C model");
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
