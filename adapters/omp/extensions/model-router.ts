import {
  MODEL_STATE_TYPE,
  STAGES,
  buildModelCatalog,
  emptyModelRouteState,
  executeModelRoute,
  requiredStagesForWorkType,
  restoreModelRouteState,
  type AutoStage,
  type ModelCandidate,
  type ModelLike,
  type ModelRouteParams,
  type ModelRouteState,
} from "../../../core/model-routing";
import { normalizeCapabilityNames } from "../../../core/runtime-capabilities";

const WORK_BOUNDARIES = ["Job/client", "Personal"] as const;

const WORK_TYPES = [
  "1. New idea or development from scratch",
  "2. New feature for an existing repository",
  "3. Improve an existing feature",
  "4. Pro-active bug fix",
  "5. Security review or fixes",
  "6. Thoughts about an existing repository or features",
  "7. Business, sales, or other non-technical analysis",
] as const;

const SKILL_MODES = [
  "1. Compound Engineering",
  "2. Superpowers",
  "3. GSD Core",
  "4. PiMarg chooses the best available skill",
] as const;

const STAGE_PURPOSE: Record<AutoStage, string> = {
  A: "thinking/discovery",
  B: "implementation/execution",
  C: "plan second-eye review",
  D: "implementation second-eye review",
};

function hasExternalDevin(pi: any): boolean {
  return normalizeCapabilityNames(pi.getAllTools?.() ?? [])
    .some((name) => /(?:^|[_-])devin(?:[_-]|$)/i.test(name));
}

function commandPrompt(args: string): string {
  const trimmed = args.trim();
  if (trimmed.toLowerCase() === "start") return "";
  return trimmed;
}

function optionLabel(candidate: ModelCandidate): string {
  return `${candidate.label} — ${candidate.selector}`;
}

function optionDescription(stage: AutoStage, candidate: ModelCandidate): string {
  const preferredTier = stage === "A" || stage === "C" ? "frontier" : "execution";
  const fit = candidate.tier === preferredTier ? "Recommended fit" : "Available";
  return `${fit} for ${STAGE_PURPOSE[stage]}${candidate.billingNote ? ` · ${candidate.billingNote}` : ""}`;
}

async function chooseModel(
  ctx: any,
  stage: AutoStage,
  candidates: ModelCandidate[],
  selected: Partial<Record<AutoStage, ModelCandidate>>,
): Promise<ModelCandidate | undefined> {
  const opposite: Record<AutoStage, AutoStage> = { A: "C", C: "A", B: "D", D: "B" };
  const other = selected[opposite[stage]];
  const eligible = candidates.filter((candidate) => !other || candidate.identity !== other.identity);
  if (eligible.length === 0) {
    ctx.ui.notify(
      "Paired stages require two distinct authenticated model identities. Configure another model, then run /pi-marg again.",
      "error",
    );
    return undefined;
  }
  const options = eligible.map((candidate) => ({
    label: optionLabel(candidate),
    description: optionDescription(stage, candidate),
  }));
  const answer = await ctx.ui.select(`Stage ${stage} model`, options, {
    selectionMarker: "radio",
    helpText: `${eligible.length} authenticated and enabled choices · ${STAGE_PURPOSE[stage]}`,
  });
  return eligible.find((candidate) => optionLabel(candidate) === answer);
}

function selectedState(
  workType: number,
  selected: Partial<Record<AutoStage, ModelCandidate>>,
): ModelRouteState {
  const selectedAt = new Date().toISOString();
  return {
    version: 1,
    workType,
    selections: Object.fromEntries(
      Object.entries(selected).map(([stage, candidate]) => [stage, { ...candidate, selectedAt }]),
    ) as ModelRouteState["selections"],
  };
}

function intakeMessage(
  request: string,
  boundary: string,
  workType: string,
  skillMode: string,
  selected: Partial<Record<AutoStage, ModelCandidate>>,
): string {
  const models = STAGES
    .filter((stage) => selected[stage])
    .map((stage) => `- Stage ${stage} (${STAGE_PURPOSE[stage]}): ${selected[stage]!.selector}`)
    .join("\n");
  return [
    "Start PiMarg for the following request:",
    request,
    "",
    "Interactive intake is already confirmed; do not ask these questions again:",
    `- Boundary: ${boundary}`,
    `- Work type: ${workType}`,
    `- Workflow skill: ${skillMode}`,
    models,
    "",
    "Load auto-mode-router, record these choices in the session ledger, activate each saved model before its stage, and continue the workflow. Ask interactively only for information that is still missing.",
  ].join("\n");
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

  pi.registerCommand("pi-marg", {
    description: "Start PiMarg with interactive intake, or pass a work prompt.",
    async handler(args: string, ctx: any) {
      if (typeof ctx.isIdle === "function" && ctx.isIdle() === false) {
        ctx.ui.notify("PiMarg intake can start after the current turn finishes.", "warning");
        return;
      }

      let request = commandPrompt(args);
      if (!ctx.hasUI) {
        if (!request) {
          ctx.ui.notify("PiMarg interactive intake requires an OMP TUI session.", "error");
          return;
        }
        pi.sendUserMessage(`Start PiMarg for this request:\n${request}`);
        return;
      }
      if (!request) {
        request = (await ctx.ui.input("PiMarg", "What would you like to work on?"))?.trim() ?? "";
      }
      if (!request) return;

      const boundaryLabel = await ctx.ui.select("Work boundary", [...WORK_BOUNDARIES], {
        selectionMarker: "radio",
      });
      if (!WORK_BOUNDARIES.includes(boundaryLabel)) return;

      const workTypeLabel = await ctx.ui.select("Work type", [...WORK_TYPES], { selectionMarker: "radio" });
      const workType = Number.parseInt(workTypeLabel?.match(/^([1-7])\./)?.[1] ?? "", 10);
      if (!Number.isInteger(workType)) return;

      const skillMode = await ctx.ui.select("Workflow skill", [...SKILL_MODES], { selectionMarker: "radio" });
      if (!skillMode) return;

      const liveModels = ctx.models.list() as ModelLike[];
      if (liveModels.length === 0) {
        ctx.ui.notify("No authenticated and enabled OMP models were found. Configure a provider, then run /pi-marg again.", "error");
        return;
      }
      const catalog = buildModelCatalog(liveModels, hasExternalDevin(pi));
      const selected: Partial<Record<AutoStage, ModelCandidate>> = {};
      for (const stage of requiredStagesForWorkType(workType)) {
        const choice = await chooseModel(ctx, stage, catalog[stage], selected);
        if (!choice) return;
        selected[stage] = choice;
      }

      const nextState = selectedState(workType, selected);
      state = nextState;
      pi.appendEntry(MODEL_STATE_TYPE, nextState);
      pi.sendUserMessage(intakeMessage(request, boundaryLabel, workTypeLabel!, skillMode, selected));
    },
  });

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
