import { describe, expect, mock, test } from "bun:test";

describe("Pi model router failover", () => {
  test("switches to the saved high backup and queues a continuation", async () => {
    mock.module("typebox", () => ({
      Type: {
        Object: (value: unknown) => value,
        Union: (value: unknown) => value,
        Literal: (value: unknown) => value,
        Optional: (value: unknown) => value,
        String: () => ({}),
        Number: () => ({}),
      },
    }));
    const { default: modelRouter } = await import("../adapters/pi/extensions/model-router");
    const handlers = new Map<string, any>();
    const entries: Array<{ type: string; data: any }> = [];
    const messages: Array<{ message: string; options: any }> = [];
    const activations: string[] = [];
    const liveModels = [
      { provider: "devin", id: "swe-2", name: "SWE-2" },
      { provider: "anthropic", id: "claude-opus-4.9", name: "Claude Opus 4.9" },
      { provider: "openai", id: "gpt-terra", name: "GPT Terra" },
    ];
    const pi: any = {
      on(name: string, handler: any) { handlers.set(name, handler); },
      registerTool() {},
      getAllTools: () => [],
      appendEntry(type: string, data: any) { entries.push({ type, data }); },
      sendUserMessage(message: string, options: any) { messages.push({ message, options }); },
      async setModel(model: any) { activations.push(`${model.provider}/${model.id}`); return true; },
    };
    modelRouter(pi);

    const ctx: any = {
      scopedModels: liveModels.map((model) => ({ model })),
      model: liveModels[0],
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
                selector: "openai/gpt-terra",
                identity: "gpt-terra",
                label: "GPT Terra",
                provider: "openai",
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

    await handlers.get("agent_end")({
      willContinue: false,
      messages: [{
        role: "assistant",
        stopReason: "error",
        errorMessage: "FreeUsageLimitError: quota exhausted",
        provider: "devin",
        model: "swe-2",
        responseId: "devin-response-1",
      }],
    }, ctx);

    expect(activations).toEqual([]);
    await handlers.get("agent_settled")({}, ctx);

    expect(activations).toEqual(["anthropic/claude-opus-4.9"]);
    expect(entries.at(-1)?.data.activeFallback).toBe("high");
    expect(messages.at(-1)?.message).toContain("Resume the current Stage B work");
    expect(messages.at(-1)?.options).toEqual({ deliverAs: "followUp" });
  });

  test("waits for settlement, clears a recovered native retry, and restores tree state", async () => {
    const { default: modelRouter } = await import("../adapters/pi/extensions/model-router");
    const handlers = new Map<string, any>();
    const activations: string[] = [];
    const messages: Array<{ message: string; options: any }> = [];
    const liveModels = [
      { provider: "devin", id: "swe-2", name: "SWE-2" },
      { provider: "anthropic", id: "claude-opus-4.9", name: "Claude Opus 4.9" },
      { provider: "openai", id: "gpt-terra", name: "GPT Terra" },
    ];
    const selection = (selector: string, identity: string, provider: string, label: string, tier: string, choice: string) => ({
      selector,
      identity,
      provider,
      label,
      tier,
      choice,
      access: "runtime-model",
      selectedAt: "2026-01-01T00:00:00Z",
    });
    let branch = [{
      type: "custom",
      customType: "co.sangyaa.pi-marg.model-routing.v1",
      data: {
        version: 2,
        activeStage: "B",
        selections: {},
        fallbacks: {
          high: selection("anthropic/claude-opus-4.9", "claude-opus-4.9", "anthropic", "Claude Opus 4.9", "frontier", "claude-frontier"),
          low: selection("openai/gpt-terra", "gpt-terra", "openai", "GPT Terra", "execution", "openai-mid"),
        },
      },
    }];
    const pi: any = {
      on(name: string, handler: any) { handlers.set(name, handler); },
      registerTool() {},
      getAllTools: () => [{ name: "mcp__devin_run" }],
      appendEntry() {},
      sendUserMessage(message: string, options: any) { messages.push({ message, options }); },
      async setModel(model: any) { activations.push(`${model.provider}/${model.id}`); return true; },
    };
    modelRouter(pi);
    const ctx: any = {
      scopedModels: liveModels.map((model) => ({ model })),
      model: liveModels[0],
      sessionManager: { getBranch: () => branch },
      ui: { notify() {} },
    };
    handlers.get("session_start")({}, ctx);

    await handlers.get("agent_end")({
      messages: [{
        role: "assistant",
        stopReason: "error",
        errorMessage: "quota exhausted",
        provider: "devin",
        model: "swe-2",
        responseId: "retryable-1",
      }],
    }, ctx);
    await handlers.get("agent_end")({
      messages: [{ role: "assistant", stopReason: "stop", content: [] }],
    }, ctx);
    await handlers.get("agent_settled")({}, ctx);
    expect(activations).toEqual([]);

    await handlers.get("tool_execution_end")({
      isError: true,
      toolCallId: "devin-call-1",
      toolName: "mcp__devin_run",
      result: { content: [{ type: "text", text: "Agent Compute Units exhausted" }] },
    }, ctx);
    expect(activations).toEqual([]);
    expect(messages).toEqual([]);
    await handlers.get("agent_settled")({}, ctx);
    expect(activations).toEqual(["anthropic/claude-opus-4.9"]);
    expect(messages.at(-1)?.message).toContain("devin/external-session reached its usage limit");
    expect(messages.at(-1)?.options).toEqual({ deliverAs: "followUp" });

    branch = [{
      type: "custom",
      customType: "co.sangyaa.pi-marg.model-routing.v1",
      data: {
        version: 2,
        activeStage: "C",
        selections: {},
        fallbacks: {
          high: selection("openai/gpt-terra", "gpt-terra", "openai", "GPT Terra", "frontier", "openai-frontier"),
          low: selection("anthropic/claude-opus-4.9", "claude-opus-4.9", "anthropic", "Claude Opus 4.9", "execution", "claude-mid"),
        },
      },
    }];
    handlers.get("session_tree")({}, ctx);
    await handlers.get("agent_end")({
      messages: [{
        role: "assistant",
        stopReason: "error",
        errorMessage: "monthly usage limit reached",
        provider: "devin",
        model: "swe-2",
        responseId: "tree-failure-1",
      }],
    }, ctx);
    await handlers.get("agent_settled")({}, ctx);
    expect(activations).toEqual(["anthropic/claude-opus-4.9", "openai/gpt-terra"]);
    expect(messages.at(-1)?.message).toContain("Resume the current Stage C work");
  });

  test("does not let an in-flight old-branch recovery overwrite restored tree state", async () => {
    const { default: modelRouter } = await import("../adapters/pi/extensions/model-router");
    const handlers = new Map<string, any>();
    const entries: any[] = [];
    const messages: Array<{ message: string; options: any }> = [];
    const activations: string[] = [];
    const notifications: string[] = [];
    const liveModels = [
      { provider: "devin", id: "swe-2", name: "SWE-2" },
      { provider: "anthropic", id: "claude-opus-4.9", name: "Claude Opus 4.9" },
      { provider: "openai", id: "gpt-terra", name: "GPT Terra" },
    ];
    const selection = (selector: string, identity: string, provider: string, label: string, tier: string, choice: string) => ({
      selector,
      identity,
      provider,
      label,
      tier,
      choice,
      access: "runtime-model",
      selectedAt: "2026-01-01T00:00:00Z",
    });
    const routeState = (activeStage: string, high: any, low: any) => [{
      type: "custom",
      customType: "co.sangyaa.pi-marg.model-routing.v1",
      data: {
        version: 2,
        activeStage,
        selections: {},
        fallbacks: { high, low },
      },
    }];
    const anthropic = selection(
      "anthropic/claude-opus-4.9",
      "claude-opus-4.9",
      "anthropic",
      "Claude Opus 4.9",
      "frontier",
      "claude-frontier",
    );
    const openai = selection(
      "openai/gpt-terra",
      "gpt-terra",
      "openai",
      "GPT Terra",
      "frontier",
      "openai-frontier",
    );
    let branch = routeState("B", anthropic, openai);
    let finishOldActivation: (() => void) | undefined;
    const oldActivation = new Promise<void>((resolve) => {
      finishOldActivation = resolve;
    });
    const pi: any = {
      on(name: string, handler: any) { handlers.set(name, handler); },
      registerTool() {},
      getAllTools: () => [],
      appendEntry(_type: string, data: any) { entries.push(data); },
      sendUserMessage(message: string, options: any) { messages.push({ message, options }); },
      async setModel(model: any) {
        activations.push(`${model.provider}/${model.id}`);
        if (model.provider === "anthropic") await oldActivation;
        return true;
      },
    };
    modelRouter(pi);
    const ctx: any = {
      scopedModels: liveModels.map((model) => ({ model })),
      model: liveModels[0],
      sessionManager: { getBranch: () => branch },
      ui: { notify(message: string) { notifications.push(message); } },
    };
    handlers.get("session_start")({}, ctx);

    await handlers.get("agent_end")({
      messages: [{
        role: "assistant",
        stopReason: "error",
        errorMessage: "quota exhausted",
        provider: "devin",
        model: "swe-2",
        responseId: "old-branch-failure",
      }],
    }, ctx);
    const oldRecovery = handlers.get("agent_settled")({}, ctx);
    expect(activations).toEqual(["anthropic/claude-opus-4.9"]);

    branch = routeState("C", openai, anthropic);
    handlers.get("session_tree")({}, ctx);
    finishOldActivation?.();
    await oldRecovery;

    expect(entries).toEqual([]);
    expect(messages).toEqual([]);
    expect(notifications.at(-1)).toContain("session changed");

    await handlers.get("agent_end")({
      messages: [{
        role: "assistant",
        stopReason: "error",
        errorMessage: "monthly usage limit reached",
        provider: "devin",
        model: "swe-2",
        responseId: "new-branch-failure",
      }],
    }, ctx);
    await handlers.get("agent_settled")({}, ctx);

    expect(activations).toEqual(["anthropic/claude-opus-4.9", "openai/gpt-terra"]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ activeStage: "C", activeFallback: "high" });
    expect(messages.at(-1)?.message).toContain("Resume the current Stage C work");
    expect(messages.at(-1)?.options).toEqual({ deliverAs: "followUp" });
  });
});
