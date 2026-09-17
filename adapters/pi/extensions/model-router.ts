import { Type } from "typebox";

import {
  FALLBACK_LEVELS,
  MODEL_STATE_TYPE,
  emptyModelRouteState,
  executeAutomaticFailover,
  executeModelRoute,
  failedModelSelector,
  findTerminalUsageLimitFailure,
  formatFailoverRecoveryMessage,
  hasConfiguredFallback,
  modelFailureKey,
  modelToolUsageLimitFailure,
  restoreModelRouteState,
  type ModelLike,
  type ModelRouteParams,
} from "../../../core/model-routing";

function toolNames(pi: any): string[] {
  return (pi.getAllTools?.() ?? [])
    .map((tool: any) => typeof tool === "string" ? tool : String(tool?.name ?? ""))
    .filter(Boolean);
}

function hasExternalDevin(pi: any): boolean {
  return toolNames(pi).some((name) => /(?:^|[_-])devin(?:[_-]|$)/i.test(name));
}

function availableModels(ctx: any): ModelLike[] {
  const scoped = (ctx.scopedModels ?? []).map((entry: any) => entry.model).filter(Boolean);
  return (scoped.length > 0 ? scoped : ctx.modelRegistry.getAvailable()) as ModelLike[];
}

export default function modelRouter(pi: any) {
  let state = emptyModelRouteState();
  let recoveryToken: symbol | undefined;
  let sessionGeneration = 0;
  let pendingModelFailure: { selector: string; key: string } | undefined;
  let pendingToolFailure: { selector: string; key: string } | undefined;
  const restore = (_event: unknown, ctx: any) => {
    sessionGeneration += 1;
    recoveryToken = undefined;
    pendingModelFailure = undefined;
    pendingToolFailure = undefined;
    state = restoreModelRouteState(ctx.sessionManager.getBranch());
  };

  pi.on("session_start", restore);
  pi.on("session_tree", restore);

  const recoverFromUsageLimit = async (failure: { selector: string; key: string }, ctx: any) => {
    if (recoveryToken) return;
    if (!hasConfiguredFallback(state)) return;
    const generation = sessionGeneration;
    const token = Symbol("pi-marg-recovery");
    recoveryToken = token;
    try {
      const execution = await executeAutomaticFailover(state, failure.selector, {
        runtimeName: "Pi",
        models: availableModels(ctx),
        hasExternalDevin: hasExternalDevin(pi),
        activate: (model) => pi.setModel(model),
        persist: (nextState) => {
          if (sessionGeneration !== generation) throw new Error("session changed during automatic recovery");
          pi.appendEntry(MODEL_STATE_TYPE, nextState);
        },
      }, failure.key);
      if (sessionGeneration !== generation) {
        ctx.ui?.notify?.(
          "PiMarg stopped an in-flight recovery because the session changed. Verify the active model before continuing.",
          "warning",
        );
        return;
      }
      if (execution.ignoredDuplicate) return;
      state = execution.state;
      if (!execution.switched) {
        if (!execution.stateChanged) return;
        ctx.ui?.notify?.(
          "PiMarg could not resume automatically because no configured backup model remains. Re-run the model chooser after restoring provider access.",
          "error",
        );
        if (execution.persistenceError) {
          ctx.ui?.notify?.(
            `PiMarg updated recovery state only in memory because the session ledger could not be saved: ${execution.persistenceError}`,
            "error",
          );
        }
        return;
      }

      const title = execution.switched.level === "high" ? "High" : "Low";
      ctx.ui?.notify?.(
        execution.reusedCurrent
          ? `PiMarg kept the ${title} backup ${execution.switched.selection.selector} active after ${failure.selector} reached its limit and is resuming safely.`
          : `PiMarg switched ${failure.selector} to the ${title} backup ${execution.switched.selection.selector} and is resuming automatically.`,
        "warning",
      );
      if (execution.persistenceError) {
        ctx.ui?.notify?.(
          `The model switched, but PiMarg could not save the recovery state to the session ledger: ${execution.persistenceError}`,
          "error",
        );
      }
      pi.sendUserMessage(
        formatFailoverRecoveryMessage(
          state,
          failure.selector,
          execution.switched.level,
          execution.switched.selection.selector,
          execution.reusedCurrent,
        ),
        { deliverAs: "followUp" },
      );
    } finally {
      if (recoveryToken === token) recoveryToken = undefined;
    }
  };

  pi.on("agent_end", (event: any, ctx: any) => {
    const failed = findTerminalUsageLimitFailure(event?.messages ?? []);
    pendingModelFailure = failed
      ? { selector: failedModelSelector(failed, ctx.model), key: modelFailureKey(failed) }
      : undefined;
  });

  pi.on("tool_execution_end", (event: any) => {
    pendingToolFailure = modelToolUsageLimitFailure(event) ?? pendingToolFailure;
  });

  pi.on("agent_settled", async (_event: unknown, ctx: any) => {
    const failure = pendingModelFailure ?? pendingToolFailure;
    pendingModelFailure = undefined;
    pendingToolFailure = undefined;
    if (!failure) return;
    await recoverFromUsageLimit(failure, ctx);
  });

  pi.registerTool({
    name: "auto_model_route",
    label: "PiMarg Model Router",
    description: "Discover, select, and activate live A/B/C/D models plus distinct high/low automatic usage-limit backups.",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("catalog"),
        Type.Literal("select"),
        Type.Literal("select_fallback"),
        Type.Literal("activate"),
        Type.Literal("status"),
      ]),
      stage: Type.Optional(Type.Union([Type.Literal("A"), Type.Literal("B"), Type.Literal("C"), Type.Literal("D")])),
      fallback: Type.Optional(Type.Union(FALLBACK_LEVELS.map((level) => Type.Literal(level)))),
      target: Type.Optional(Type.String()),
      workType: Type.Optional(Type.Number()),
      provider: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId: string, params: ModelRouteParams, _signal: unknown, _onUpdate: unknown, ctx: any) {
      const models = availableModels(ctx);
      const execution = await executeModelRoute(state, params, {
        runtimeName: "Pi",
        models,
        hasExternalDevin: hasExternalDevin(pi),
        activate: (model) => pi.setModel(model),
        persist: (nextState) => pi.appendEntry(MODEL_STATE_TYPE, nextState),
      });
      state = execution.state;
      return execution.response;
    },
  });
}
