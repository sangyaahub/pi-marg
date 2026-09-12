import { Type } from "typebox";

import {
  MODEL_STATE_TYPE,
  emptyModelRouteState,
  executeModelRoute,
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
  pi.on("session_start", (_event: unknown, ctx: any) => {
    state = restoreModelRouteState(ctx.sessionManager.getBranch());
  });

  pi.registerTool({
    name: "auto_model_route",
    label: "PiMarg Model Router",
    description: "Discover, select, and activate live A/B/C/D model choices while enforcing A different from C and B different from D.",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("catalog"),
        Type.Literal("select"),
        Type.Literal("activate"),
        Type.Literal("status"),
      ]),
      stage: Type.Optional(Type.Union([Type.Literal("A"), Type.Literal("B"), Type.Literal("C"), Type.Literal("D")])),
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
