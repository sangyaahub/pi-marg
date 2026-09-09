import {
  MODEL_STATE_TYPE,
  STAGES,
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

export default function modelRouter(pi: any) {
  const z = pi.zod;
  let state = emptyModelRouteState();
  const restore = (_event: unknown, ctx: any) => {
    state = restoreModelRouteState(ctx.sessionManager.getBranch());
  };

  pi.on("session_start", restore);
  pi.on("session_switch", restore);
  pi.on("session_branch", restore);
  pi.on("session_tree", restore);

  pi.registerTool({
    name: "auto_model_route",
    label: "PiMarg Model Router",
    description: "Discover, select, and activate live A/B/C/D model choices while enforcing A different from C and B different from D.",
    parameters: z.object({
      action: z.enum(["catalog", "select", "activate", "status"]),
      stage: z.enum(STAGES).optional(),
      target: z.string().optional(),
      workType: z.number().optional(),
    }),
    async execute(_toolCallId: string, params: ModelRouteParams, _signal: unknown, _onUpdate: unknown, ctx: any) {
      const models = ctx.models.list() as ModelLike[];
      const execution = await executeModelRoute(state, params, {
        runtimeName: "OMP",
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
