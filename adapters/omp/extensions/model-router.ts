import {
  FALLBACK_LEVELS,
  MODEL_STATE_TYPE,
  STAGES,
  buildFallbackCatalog,
  buildModelCatalog,
  candidatesForProvider,
  commitIntakeRoute,
  emptyModelRouteState,
  executeAutomaticFailover,
  executeModelRoute,
  failedModelSelector,
  findTerminalUsageLimitFailure,
  formatFailoverRecoveryMessage,
  hasConfiguredFallback,
  modelFailureKey,
  modelToolUsageLimitFailure,
  numberedOptionLabel,
  requiredStagesForWorkType,
  resolveSelectAnswer,
  revalidateSavedRoute,
  uniqueProviders,
  type AutoStage,
  type FallbackLevel,
  type ModelCandidate,
  type ModelLike,
  type ModelRouteParams,
  type ModelRouteState,
  type SelectAnswerResolution,
  type WorkBoundary,
} from "../../../core/model-routing";
import { normalizeCapabilityNames } from "../../../core/runtime-capabilities";
import { loadRuntimeRoute, rememberRuntimeRoute } from "../../../core/user-route";
import { configureEmptyCatalog, resolveSingleModel } from "./provider-setup";

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

const WORK_BOUNDARY_ITEMS = ["Job/client", "Personal"] as const;
const WORK_TYPE_ITEMS = [
  "New idea or development from scratch",
  "New feature for an existing repository",
  "Improve an existing feature",
  "Pro-active bug fix",
  "Security review or fixes",
  "Thoughts about an existing repository or features",
  "Business, sales, or other non-technical analysis",
] as const;
const SKILL_MODE_ITEMS = [
  "Compound Engineering",
  "Superpowers",
  "GSD Core",
  "PiMarg chooses the best available skill",
] as const;

function optionLabel(candidate: ModelCandidate): string {
  return `${candidate.label} — ${candidate.selector}`;
}

function savedIndex<T>(items: readonly T[], matches: (item: T) => boolean): number | undefined {
  const index = items.findIndex(matches);
  return index >= 0 ? index : undefined;
}

function takeAnswer<T>(ctx: any, resolution: SelectAnswerResolution<T>): T | undefined {
  switch (resolution.status) {
    case "matched":
      return resolution.item;
    case "cancelled":
      ctx.ui.notify("Selection cancelled; no model was saved.", "warning");
      return undefined;
    case "conflict":
      ctx.ui.notify("That answer matches more than one option; no model was saved.", "error");
      return undefined;
    case "unrecognized":
      ctx.ui.notify(`Unrecognized selection ${JSON.stringify(resolution.received)}; no model was saved.`, "error");
      return undefined;
    default: {
      const unreachable: never = resolution;
      return unreachable;
    }
  }
}

async function askChoice<T>(
  ctx: any,
  title: string,
  items: readonly T[],
  labelOf: (item: T) => string,
  options: ReadonlyArray<string | { label: string; description?: string }>,
  settings: { initialIndex?: number; helpText?: string } = {},
): Promise<T | undefined> {
  const answer = await ctx.ui.select(title, [...options], {
    selectionMarker: "radio",
    ...(settings.helpText ? { helpText: settings.helpText } : {}),
    ...(typeof settings.initialIndex === "number" ? { initialIndex: settings.initialIndex } : {}),
  });
  return takeAnswer(ctx, resolveSelectAnswer(answer, items, labelOf));
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
  saved?: ModelCandidate,
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

  const highlighted = saved && eligible.some((candidate) => candidate.selector === saved.selector) ? saved : undefined;
  return chooseCandidateByProvider(ctx, eligible, {
    providerTitle: `Stage ${stage} provider`,
    modelTitle: `Stage ${stage} model`,
    purpose: STAGE_PURPOSE[stage],
    providerDescription: (name) => `All authenticated ${name} models for ${STAGE_PURPOSE[stage]}`,
    modelDescription: (candidate) => optionDescription(stage, candidate),
  }, highlighted);
}

async function chooseFallbackModel(
  ctx: any,
  level: FallbackLevel,
  candidates: ModelCandidate[],
  other?: ModelCandidate,
  saved?: ModelCandidate,
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

  const highlighted = saved && eligible.some((candidate) => candidate.selector === saved.selector) ? saved : undefined;
  return chooseCandidateByProvider(ctx, eligible, {
    providerTitle: `${title} backup provider`,
    modelTitle: `${title} backup model`,
    purpose: FALLBACK_PURPOSE[level],
    providerDescription: (name) => `Authenticated ${name} models · ${FALLBACK_PURPOSE[level]}`,
    modelDescription: (candidate) => (
      `${FALLBACK_PURPOSE[level]}${candidate.billingNote ? ` · ${candidate.billingNote}` : ""}`
    ),
  }, highlighted);
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
  saved?: ModelCandidate,
): Promise<ModelCandidate | undefined> {
  const providers = uniqueProviders(candidates);
  const providerOptions = providers.map((name, index) => ({
    label: numberedOptionLabel(index, `${name} (${candidatesForProvider(candidates, name).length})`),
    description: copy.providerDescription(name),
  }));
  const provider = await askChoice(
    ctx,
    copy.providerTitle,
    providers,
    (name) => `${name} (${candidatesForProvider(candidates, name).length})`,
    providerOptions,
    {
      initialIndex: saved ? savedIndex(providers, (name) => name === saved.provider) : undefined,
      helpText: `${providers.length} providers · ${candidates.length} models · ${copy.purpose}`,
    },
  );
  if (!provider) return undefined;

  const providerModels = candidatesForProvider(candidates, provider);
  const modelOptions = providerModels.map((candidate, index) => ({
    label: numberedOptionLabel(index, optionLabel(candidate)),
    description: copy.modelDescription(candidate),
  }));
  const savedHere = saved?.provider === provider ? saved.selector : undefined;
  return askChoice(ctx, copy.modelTitle, providerModels, optionLabel, modelOptions, {
    initialIndex: savedHere ? savedIndex(providerModels, (candidate) => candidate.selector === savedHere) : undefined,
    helpText: `${providerModels.length} ${provider} choices · ${copy.purpose}${savedHere ? ` · saved ${savedHere}` : ""}`,
  });
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
  const routeHome = (ctx: any) => typeof ctx?.agentHome === "string" ? ctx.agentHome : undefined;
  const persistRoute = (nextState: ModelRouteState, ctx?: any) => {
    pi.appendEntry(MODEL_STATE_TYPE, nextState);
    try {
      rememberRuntimeRoute("OMP", nextState, routeHome(ctx));
    } catch {
      ctx?.ui?.notify?.("PiMarg saved the route in this session, but could not update the user route file.", "warning");
    }
  };
  const restore = (_event: unknown, ctx: any) => {
    sessionGeneration += 1;
    recoveryToken = undefined;
    pendingToolFailure = undefined;
    state = loadRuntimeRoute("OMP", ctx.sessionManager.getBranch(), routeHome(ctx));
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
          persistRoute(nextState, ctx);
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

      const boundary = await askChoice(
        ctx,
        "Work boundary",
        WORK_BOUNDARY_ITEMS,
        (item) => item,
        WORK_BOUNDARIES,
        { initialIndex: savedIndex(WORK_BOUNDARY_ITEMS, (item) => item === state.boundary) },
      );
      if (!boundary) return;

      const workTypeItem = await askChoice(
        ctx,
        "Work type",
        WORK_TYPE_ITEMS,
        (item) => item,
        WORK_TYPES,
        {
          initialIndex: typeof state.workType === "number" && state.workType >= 1 && state.workType <= WORK_TYPE_ITEMS.length
            ? state.workType - 1
            : undefined,
        },
      );
      if (!workTypeItem) return;
      const workType = WORK_TYPE_ITEMS.indexOf(workTypeItem) + 1;
      const workTypeLabel = WORK_TYPES[workType - 1]!;

      const skillItem = await askChoice(
        ctx,
        "Workflow skill",
        SKILL_MODE_ITEMS,
        (item) => item,
        SKILL_MODES,
        { initialIndex: savedIndex(SKILL_MODES, (item) => item === state.skillMode) },
      );
      if (!skillItem) return;
      const skillMode = SKILL_MODES[SKILL_MODE_ITEMS.indexOf(skillItem)]!;

      const home = routeHome(ctx);
      let liveModels = ctx.models.list() as ModelLike[];
      if (liveModels.length === 0) {
        const setup = await configureEmptyCatalog(ctx, home);
        if (setup.status === "restart") {
          rememberRuntimeRoute("OMP", {
            version: 2,
            workType,
            boundary,
            skillMode,
            selections: {},
            fallbacks: {},
          }, home);
          ctx.ui.notify(
            "Restart OMP so it reloads models.yml, then run /pi-marg again. Work type and skill answers are saved and model selection will resume.",
            "warning",
          );
          return;
        }
        if (setup.status !== "ready") return;
        liveModels = setup.models;
      }

      let stopBeforePair = false;
      if (liveModels.length === 1) {
        const decision = await resolveSingleModel(ctx, home);
        if (decision === "defer") {
          stopBeforePair = true;
        } else if (decision.status === "restart") {
          rememberRuntimeRoute("OMP", {
            version: 2,
            workType,
            boundary,
            skillMode,
            selections: {},
            fallbacks: {},
          }, home);
          ctx.ui.notify(
            "Restart OMP so it reloads models.yml, then run /pi-marg again. Work type and skill answers are saved and model selection will resume.",
            "warning",
          );
          return;
        } else if (decision.status !== "ready") {
          return;
        } else {
          liveModels = decision.models;
        }
      }

      const catalog = buildModelCatalog(liveModels, hasExternalDevin(pi));
      const fallbackCatalog = buildFallbackCatalog(catalog);
      const availability = revalidateSavedRoute(state, liveModels, hasExternalDevin(pi));
      const selected: Partial<Record<AutoStage, ModelCandidate>> = {};
      const stages = requiredStagesForWorkType(workType);
      const oppositeStage: Record<AutoStage, AutoStage> = { A: "C", C: "A", B: "D", D: "B" };
      for (const stage of stages) {
        if (stopBeforePair && selected[oppositeStage[stage]]) {
          ctx.ui.notify(
            `Stage ${stage} needs a different model from Stage ${oppositeStage[stage]}. Stopping before that paired stage; nothing was saved as a complete route.`,
            "warning",
          );
          return;
        }
        const savedChoice = availability.selections[stage];
        if (savedChoice?.status === "missing") {
          ctx.ui.notify(
            `Saved Stage ${stage} selector ${savedChoice.selection.selector} is missing from the live catalog. Choose a replacement.`,
            "warning",
          );
        }
        const choice = await chooseModel(
          ctx,
          stage,
          catalog[stage],
          selected,
          savedChoice?.status === "present" ? savedChoice.selection : undefined,
        );
        if (!choice) return;
        selected[stage] = choice;
      }

      const savedHigh = availability.fallbacks.high;
      if (savedHigh?.status === "missing") {
        ctx.ui.notify(
          `Saved high backup ${savedHigh.selection.selector} is missing from the live catalog. Choose a replacement.`,
          "warning",
        );
      }
      const high = await chooseFallbackModel(
        ctx,
        "high",
        fallbackCatalog.high,
        undefined,
        savedHigh?.status === "present" ? savedHigh.selection : undefined,
      );
      if (!high) return;
      const savedLow = availability.fallbacks.low;
      if (savedLow?.status === "missing") {
        ctx.ui.notify(
          `Saved low backup ${savedLow.selection.selector} is missing from the live catalog. Choose a replacement.`,
          "warning",
        );
      }
      const low = await chooseFallbackModel(
        ctx,
        "low",
        fallbackCatalog.low,
        high,
        savedLow?.status === "present" ? savedLow.selection : undefined,
      );
      if (!low) return;

      const committed = await commitIntakeRoute(state, {
        workType,
        boundary: boundary as WorkBoundary,
        skillMode,
        selections: selected,
        fallbacks: { high, low },
        activateStage: stages[0]!,
      }, {
        runtimeName: "OMP",
        models: liveModels,
        hasExternalDevin: hasExternalDevin(pi),
        activate: (model) => pi.setModel(model),
        persist: (nextState) => persistRoute(nextState, ctx),
      });
      if (committed.error) {
        ctx.ui.notify(committed.error, "error");
        return;
      }
      state = committed.state;
      pi.sendUserMessage(intakeMessage(request, boundary, workTypeLabel, skillMode, selected, { high, low }));
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
        persist: (nextState) => persistRoute(nextState, ctx),
      });
      state = execution.state;
      return execution.response;
    },
  });
}
