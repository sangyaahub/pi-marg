import {
  FALLBACK_LEVELS,
  MODEL_STATE_TYPE,
  STAGES,
  buildFallbackCatalog,
  buildModelCatalog,
  candidatesForProvider,
  emptyCatalogSetupMessage,
  emptyModelRouteState,
  executeAutomaticFailover,
  executeModelRoute,
  failedModelSelector,
  findTerminalUsageLimitFailure,
  formatFailoverRecoveryMessage,
  hasConfiguredFallback,
  matchNumberedOption,
  modelFailureKey,
  modelToolUsageLimitFailure,
  numberedOptionLabel,
  requiredStagesForWorkType,
  restoreModelRouteState,
  uniqueProviders,
  type AutoStage,
  type FallbackLevel,
  type ModelCandidate,
  type ModelLike,
  type ModelRouteParams,
  type ModelRouteState,
} from "../../../core/model-routing";
import { normalizeCapabilityNames } from "../../../core/runtime-capabilities";

const WORK_BOUNDARIES = ["1. Job/client", "2. Personal"] as const;

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

const FALLBACK_PURPOSE: Record<FallbackLevel, string> = {
  high: "strong recovery model used first",
  low: "economical recovery model used if high is unavailable or exhausted",
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

  return chooseCandidateByProvider(ctx, eligible, {
    providerTitle: `Stage ${stage} provider`,
    modelTitle: `Stage ${stage} model`,
    purpose: STAGE_PURPOSE[stage],
    providerDescription: (name) => `All authenticated ${name} models for ${STAGE_PURPOSE[stage]}`,
    modelDescription: (candidate) => optionDescription(stage, candidate),
  });
}

async function chooseFallbackModel(
  ctx: any,
  level: FallbackLevel,
  candidates: ModelCandidate[],
  other?: ModelCandidate,
): Promise<ModelCandidate | undefined> {
  const eligible = candidates.filter((candidate) => (
    candidate.access === "runtime-model" && (!other || candidate.identity !== other.identity)
  ));
  const title = level === "high" ? "High" : "Low";
  if (eligible.length === 0) {
    ctx.ui.notify(
      "Automatic recovery requires two distinct authenticated runtime models. Configure another model, then run /pi-marg again.",
      "error",
    );
    return undefined;
  }

  return chooseCandidateByProvider(ctx, eligible, {
    providerTitle: `${title} backup provider`,
    modelTitle: `${title} backup model`,
    purpose: FALLBACK_PURPOSE[level],
    providerDescription: (name) => `Authenticated ${name} models · ${FALLBACK_PURPOSE[level]}`,
    modelDescription: (candidate) => (
      `${FALLBACK_PURPOSE[level]}${candidate.billingNote ? ` · ${candidate.billingNote}` : ""}`
    ),
  });
}

async function chooseCandidateByProvider(
  ctx: any,
  candidates: ModelCandidate[],
  copy: {
    providerTitle: string;
    modelTitle: string;
    purpose: string;
    providerDescription(provider: string): string;
    modelDescription(candidate: ModelCandidate): string;
  },
): Promise<ModelCandidate | undefined> {
  const providers = uniqueProviders(candidates);
  const providerOptions = providers.map((name, index) => ({
    label: numberedOptionLabel(index, `${name} (${candidatesForProvider(candidates, name).length})`),
    description: copy.providerDescription(name),
  }));
  const providerAnswer = await ctx.ui.select(copy.providerTitle, providerOptions, {
    selectionMarker: "radio",
    helpText: `${providers.length} providers · ${candidates.length} models · ${copy.purpose}`,
  });
  const provider = matchNumberedOption(
    providerAnswer,
    providers,
    (name) => `${name} (${candidatesForProvider(candidates, name).length})`,
  );
  if (!provider) return undefined;

  const providerModels = candidatesForProvider(candidates, provider);
  const modelOptions = providerModels.map((candidate, index) => ({
    label: numberedOptionLabel(index, optionLabel(candidate)),
    description: copy.modelDescription(candidate),
  }));
  const answer = await ctx.ui.select(copy.modelTitle, modelOptions, {
    selectionMarker: "radio",
    helpText: `${providerModels.length} ${provider} choices · ${copy.purpose}`,
  });
  return matchNumberedOption(answer, providerModels, optionLabel);
}

function selectedState(
  workType: number,
  selected: Partial<Record<AutoStage, ModelCandidate>>,
  fallbacks: Record<FallbackLevel, ModelCandidate>,
): ModelRouteState {
  const selectedAt = new Date().toISOString();
  return {
    version: 2,
    workType,
    selections: Object.fromEntries(
      Object.entries(selected).map(([stage, candidate]) => [stage, { ...candidate, selectedAt }]),
    ) as ModelRouteState["selections"],
    fallbacks: Object.fromEntries(
      Object.entries(fallbacks).map(([level, candidate]) => [level, { ...candidate, selectedAt }]),
    ) as ModelRouteState["fallbacks"],
  };
}

function intakeMessage(
  request: string,
  boundary: string,
  workType: string,
  skillMode: string,
  selected: Partial<Record<AutoStage, ModelCandidate>>,
  fallbacks: Record<FallbackLevel, ModelCandidate>,
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
    `- High backup: ${fallbacks.high.selector}`,
    `- Low backup: ${fallbacks.low.selector}`,
    "",
    "Load auto-mode-router, record these choices in the session ledger, activate each saved model before its stage, and continue the workflow. If a terminal usage-limit failure occurs, PiMarg will switch high then low and resume from the last safe point. Ask interactively only for information that is still missing.",
  ].join("\n");
}

export default function modelRouter(pi: any) {
  const z = pi.zod;
  let state = emptyModelRouteState();
  let recoveryToken: symbol | undefined;
  let sessionGeneration = 0;
  let pendingToolFailure: { selector: string; key: string } | undefined;
  const restore = (_event: unknown, ctx: any) => {
    sessionGeneration += 1;
    recoveryToken = undefined;
    pendingToolFailure = undefined;
    state = restoreModelRouteState(ctx.sessionManager.getBranch());
  };

  pi.on("session_start", restore);
  pi.on("session_switch", restore);
  pi.on("session_branch", restore);
  pi.on("session_tree", restore);

  const recoverFromUsageLimit = async (failure: { selector: string; key: string }, ctx: any) => {
    if (recoveryToken) return;
    if (!hasConfiguredFallback(state)) return;
    const generation = sessionGeneration;
    const token = Symbol("pi-marg-recovery");
    recoveryToken = token;
    try {
      const execution = await executeAutomaticFailover(state, failure.selector, {
        runtimeName: "OMP",
        models: ctx.models.list() as ModelLike[],
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
          "PiMarg could not resume automatically because no configured backup model remains. Run /auto-models choose after restoring provider access.",
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
        { deliverAs: "aside" },
      );
    } finally {
      if (recoveryToken === token) recoveryToken = undefined;
    }
  };

  pi.on("agent_end", async (event: any, ctx: any) => {
    if (event?.willContinue || event?.isTerminal === false) return;
    const failed = findTerminalUsageLimitFailure(event?.messages ?? []);
    const failure = failed
      ? {
          selector: failedModelSelector(failed, ctx.models?.current?.() ?? ctx.model),
          key: modelFailureKey(failed),
        }
      : pendingToolFailure;
    pendingToolFailure = undefined;
    if (!failure) return;
    await recoverFromUsageLimit(failure, ctx);
  });

  pi.on("tool_execution_end", (event: any) => {
    pendingToolFailure = modelToolUsageLimitFailure(event) ?? pendingToolFailure;
  });

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
      const boundary = matchNumberedOption(boundaryLabel, ["Job/client", "Personal"], (item) => item);
      if (!boundary) return;

      const workTypeLabel = await ctx.ui.select("Work type", [...WORK_TYPES], { selectionMarker: "radio" });
      const workType = Number.parseInt(workTypeLabel?.match(/^([1-7])\./)?.[1] ?? "", 10);
      if (!Number.isInteger(workType)) return;

      const skillMode = await ctx.ui.select("Workflow skill", [...SKILL_MODES], { selectionMarker: "radio" });
      if (!skillMode) return;

      const liveModels = ctx.models.list() as ModelLike[];
      if (liveModels.length === 0) {
        ctx.ui.notify(emptyCatalogSetupMessage("OMP"), "error");
        return;
      }
      const catalog = buildModelCatalog(liveModels, hasExternalDevin(pi));
      const fallbackCatalog = buildFallbackCatalog(catalog);
      const selected: Partial<Record<AutoStage, ModelCandidate>> = {};
      for (const stage of requiredStagesForWorkType(workType)) {
        const choice = await chooseModel(ctx, stage, catalog[stage], selected);
        if (!choice) return;
        selected[stage] = choice;
      }

      const high = await chooseFallbackModel(ctx, "high", fallbackCatalog.high);
      if (!high) return;
      const low = await chooseFallbackModel(ctx, "low", fallbackCatalog.low, high);
      if (!low) return;
      const fallbacks = { high, low };

      const nextState = selectedState(workType, selected, fallbacks);
      state = nextState;
      pi.appendEntry(MODEL_STATE_TYPE, nextState);
      pi.sendUserMessage(intakeMessage(request, boundary, workTypeLabel!, skillMode, selected, fallbacks));
    },
  });

  pi.registerTool({
    name: "auto_model_route",
    label: "PiMarg Model Router",
    description: "Discover, select, and activate live A/B/C/D models plus distinct high/low automatic usage-limit backups.",
    parameters: z.object({
      action: z.enum(["catalog", "select", "select_fallback", "activate", "status"]),
      stage: z.enum(STAGES).optional(),
      fallback: z.enum(FALLBACK_LEVELS).optional(),
      target: z.string().optional(),
      workType: z.number().optional(),
      provider: z.string().optional(),
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
